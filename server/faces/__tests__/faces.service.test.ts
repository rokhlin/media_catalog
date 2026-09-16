import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { FacesService } from '../faces.service.js';
import { DatabaseService } from '../../database/database.service.js';
import { AppConfigService } from '../../config/config.service.js';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('FacesService', () => {
  let facesService: FacesService;
  let dbService: DatabaseService;
  let tmpDir: string;
  let dbPath: string;
  let facesDir: string;

  before(() => {
    tmpDir = path.join(process.cwd(), 'media_output', `test_faces_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`);
    facesDir = path.join(tmpDir, 'faces');
    fs.mkdirSync(facesDir, { recursive: true });
    dbPath = path.join(tmpDir, 'test_faces.db');

    const mockConfig = {
      dbPath: dbPath,
      facesFolder: facesDir,
      outputFolder: tmpDir,
      projectRoot: tmpDir,
    } as AppConfigService;

    dbService = new DatabaseService(mockConfig);
    dbService.initDb();

    // Mock FamilyTreePublicService
    const mockFamilyTreeService = {
      getPersonContext: (query: { name?: string; mediaPersonId?: string }) => {
        if (query.name === 'Emma Watson') {
          return {
            found: true,
            treePersonId: 'p_emma',
            kinshipToRoot: { primaryTerm: 'Sister', category: 'COLLATERAL' },
            birthYear: 1990,
            isLiving: true,
            recentMilestones: ['Graduated from Brown University'],
          };
        }
        return { found: false };
      },
    } as any;

    facesService = new FacesService(mockConfig, dbService, mockFamilyTreeService);
  });

  after(() => {
    try {
      dbService.close();
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch {
      // ignore
    }
  });

  it('should manage faces and persons in database', () => {
    const db = dbService.getDb();
    db.prepare(`
      INSERT INTO persons (id, name) VALUES ('person_emma', 'Emma Watson')
    `).run();

    db.prepare(`
      INSERT INTO face_registry (face_id, person_id, name, confidence, source_file, is_reference)
      VALUES ('face_emma_1', 'person_emma', 'Emma Watson', 0.99, '/media/emma.jpg', 1)
    `).run();

    db.prepare(`
      INSERT INTO face_registry (face_id, name, confidence, source_file, is_reference)
      VALUES ('face_unrec_2', 'Unknown_55', 0.45, '/media/crowd.jpg', 0)
    `).run();

    const registered = facesService.getAllRegisteredFaces();
    assert.ok(registered.length >= 2);

    const known = facesService.getKnownPersons();
    const emma = known.find((p) => p.name === 'Emma Watson');
    assert.ok(emma, 'Emma Watson should be among known persons');
    assert.strictEqual(emma?.family_tree?.is_in_tree, true);
    assert.strictEqual(emma?.family_tree?.kinship_to_root, 'Sister');
    assert.strictEqual(emma?.family_tree?.birth_year, 1990);

    const unrecognized = facesService.getUnrecognizedFaces();
    assert.ok(unrecognized.some((f) => f.face_id === 'face_unrec_2'));
  });

  it('should rename, assign, reset and delete faces', () => {
    const db = dbService.getDb();
    db.prepare(`
      INSERT INTO face_registry (face_id, name, confidence, source_file, is_reference)
      VALUES ('face_mod_test', 'Unknown_99', 0.7, '/media/test.jpg', 1)
    `).run();

    // Rename
    const renameRes = facesService.renameFace('face_mod_test', 'Alexander');
    assert.strictEqual(renameRes.status, 'success');

    // Assign face
    const assignRes = facesService.assignFace('face_mod_test', 'Alexander Great');
    assert.strictEqual(assignRes.status, 'success');

    // Reset face
    const resetRes = facesService.resetFace('face_mod_test');
    assert.strictEqual(resetRes.status, 'success');

    // Delete face
    const deleteRes = facesService.deleteFace('face_mod_test');
    assert.strictEqual(deleteRes.status, 'success');

    // Trying to delete already deleted face throws NotFoundException
    assert.throws(() => {
      facesService.deleteFace('face_mod_test');
    }, NotFoundException);
  });

  it('should validate inputs for face operations', () => {
    assert.throws(() => {
      facesService.assignFace('face_emma_1', '   ');
    }, BadRequestException);

    assert.throws(() => {
      facesService.assignGroup([], 'Valid Name');
    }, BadRequestException);

    assert.throws(() => {
      facesService.resetFacesByFilename('   ');
    }, BadRequestException);
  });

  it('should locate face image path or throw NotFoundException', () => {
    const sampleFaceFile = path.join(facesDir, 'sample_face_101.jpg');
    fs.writeFileSync(sampleFaceFile, 'face-image-binary-data');

    const foundPath = facesService.getFaceImagePath('sample_face_101.jpg');
    assert.strictEqual(foundPath, sampleFaceFile);

    assert.throws(() => {
      facesService.getFaceImagePath('non_existent_face_999.jpg');
    }, NotFoundException);
  });

  it('should delete batch of faces and associated disk files and sidecar entries', () => {
    const db = dbService.getDb();
    const testFaceId = 'face_batch_cleanup_01';
    const testCropFile = path.join(facesDir, `${testFaceId}.jpg`);
    fs.writeFileSync(testCropFile, 'crop-bytes');

    const testSidecar = path.join(tmpDir, 'photo_test.jpg.json');
    fs.writeFileSync(
      testSidecar,
      JSON.stringify({
        faces: [{ face_id: testFaceId, name: 'BatchPerson' }, { face_id: 'face_keep_02', name: 'KeepPerson' }],
      })
    );

    db.prepare(`
      INSERT INTO face_registry (face_id, name, confidence, source_file, image_path, is_reference)
      VALUES (?, 'BatchPerson', 0.9, ?, ?, 0)
    `).run(testFaceId, 'photo_test.jpg', testCropFile);

    assert.strictEqual(fs.existsSync(testCropFile), true);

    const batchRes = facesService.deleteFacesBatch([testFaceId]);
    assert.strictEqual(batchRes.status, 'success');
    assert.strictEqual(batchRes.deleted_count, 1);

    // Verify crop file on disk was removed
    assert.strictEqual(fs.existsSync(testCropFile), false);

    // Verify sidecar was updated to remove the deleted face
    const updatedSidecar = JSON.parse(fs.readFileSync(testSidecar, 'utf-8'));
    assert.strictEqual(updatedSidecar.faces.length, 1);
    assert.strictEqual(updatedSidecar.faces[0].face_id, 'face_keep_02');
  });
});
