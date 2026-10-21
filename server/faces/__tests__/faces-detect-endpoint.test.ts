import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { DatabaseService } from '../../database/database.service.js';
import { FacesService } from '../faces.service.js';
import { FacesController } from '../faces.controller.js';

describe('BUG-016: Faces Detect Endpoint & Fallback', () => {
  let tmpDir: string;
  let dbService: DatabaseService;
  let facesService: FacesService;
  let facesController: FacesController;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'faces_detect_test_'));
    const mockConfig: any = {
      dbPath: path.join(tmpDir, 'catalog_history.db'),
      outputFolder: tmpDir,
      usersBaseDir: tmpDir,
    };
    dbService = new DatabaseService(mockConfig);
    dbService.initDb();

    facesService = new FacesService(mockConfig, dbService);
    facesController = new FacesController(facesService);
  });

  after(() => {
    dbService.close();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it('should return face detections from database via detectFacesForFile', async () => {
    const testFile = path.join(tmpDir, 'photo_faces.jpg');
    dbService.saveMediaFaces(testFile, [
      {
        face_id: 'face_detect_001',
        name: 'Mikhail',
        confidence: 0.95,
        bbox: [50, 60, 200, 220],
      },
    ]);

    const result = await facesController.detectFacesForFile(testFile);
    assert.ok(Array.isArray(result));
    assert.equal(result.length, 1);
    assert.equal(result[0].name, 'Mikhail');
    assert.equal(result[0].face_id, 'face_detect_001');
  });

  it('should fallback to sidecar file if database records do not exist yet', async () => {
    const testFile = path.join(tmpDir, 'sidecar_only.jpg');
    const sidecarFile = path.join(tmpDir, 'sidecar_only.jpg.json');

    fs.writeFileSync(
      sidecarFile,
      JSON.stringify({
        file_path: testFile,
        faces: [
          {
            face_id: 'face_from_sidecar',
            name: 'Elena',
            confidence: 0.92,
            bbox: [100, 100, 300, 300],
          },
        ],
      }),
      'utf-8',
    );

    const result = await facesController.detectFacesForFile(testFile);
    assert.ok(Array.isArray(result));
    assert.equal(result.length, 1);
    assert.equal(result[0].name, 'Elena');
    assert.equal(result[0].face_id, 'face_from_sidecar');
  });
});
