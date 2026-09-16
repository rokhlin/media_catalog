import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { DatabaseService } from '../database.service.js';
import { AppConfigService } from '../../config/config.service.js';

describe('DatabaseService', () => {
  let dbService: DatabaseService;
  let dbPath: string;
  let tmpDir: string;

  before(() => {
    tmpDir = path.join(process.cwd(), 'media_output', `test_dbsvc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`);
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
    dbPath = path.join(tmpDir, 'test_media.db');

    const mockConfig = {
      dbPath: dbPath,
    } as AppConfigService;

    dbService = new DatabaseService(mockConfig);
    dbService.initDb();
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

  it('should initialize tables and execute pragmas correctly', () => {
    const db = dbService.getDb();
    assert.ok(db, 'database instance should be available');

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
    const tableNames = new Set(tables.map((t) => t.name));

    assert.ok(tableNames.has('sync_history'), 'sync_history table should exist');
    assert.ok(tableNames.has('persons'), 'persons table should exist');
    assert.ok(tableNames.has('face_registry'), 'face_registry table should exist');
    assert.ok(tableNames.has('media_items'), 'media_items table should exist');
    assert.ok(tableNames.has('media_metadata'), 'media_metadata table should exist');
    assert.ok(tableNames.has('media_faces'), 'media_faces table should exist');
    assert.ok(tableNames.has('schema_migrations'), 'schema_migrations table should exist');
  });

  it('should record and query sync history', () => {
    const db = dbService.getDb();
    db.prepare(`
      INSERT INTO sync_history (file_path, file_size, mtime, status, sidecar_path)
      VALUES (?, ?, ?, ?, ?)
    `).run('/photos/pic1.jpg', 1024, 1600000000, 'COMPLETED', '/photos/pic1.json');

    const record = dbService.getSyncRecord('/photos/pic1.jpg');
    assert.ok(record, 'sync record should be found');
    assert.strictEqual(record.file_size, 1024);
    assert.strictEqual(record.status, 'COMPLETED');

    const allRecords = dbService.getAllSyncRecords();
    assert.ok(allRecords['/photos/pic1.jpg']);
  });

  it('should record and query media items and metadata', () => {
    const db = dbService.getDb();
    db.prepare(`
      INSERT INTO media_items (id, file_path, file_name, media_type, file_size, media_date, phash)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('item_01', '/photos/family_dinner.jpg', 'family_dinner.jpg', 'photo', 2048, '2023-12-25', 'phash123');

    db.prepare(`
      INSERT INTO media_metadata (media_id, summary, description, camera_make, camera_model, location_name)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('item_01', 'Family dinner snapshot', 'A lovely dinner celebration', 'Canon', 'EOS R5', 'New York');

    const allMeta = dbService.getAllMediaMetadata();
    assert.ok(allMeta['/photos/family_dinner.jpg'], 'metadata indexed by file path');
    assert.ok(allMeta['family_dinner.jpg'], 'metadata indexed by lower filename');
    assert.strictEqual(allMeta['family_dinner.jpg'].summary, 'Family dinner snapshot');
    assert.strictEqual(allMeta['family_dinner.jpg'].camera_make, 'Canon');
  });

  it('should handle face registry operations and name mappings', () => {
    const db = dbService.getDb();
    db.prepare(`
      INSERT INTO face_registry (face_id, name, confidence, source_file, is_reference)
      VALUES (?, ?, ?, ?, ?)
    `).run('face_alice_1', 'Alice Smith', 0.98, '/photos/alice1.jpg', 1);

    db.prepare(`
      INSERT INTO face_registry (face_id, name, confidence, source_file, is_reference)
      VALUES (?, ?, ?, ?, ?)
    `).run('face_unrec_1', 'Unknown_101', 0.5, '/photos/crowd.jpg', 1);

    const mapping = dbService.getFaceNameMapping();
    assert.strictEqual(mapping['face_alice_1'], 'Alice Smith');
    assert.strictEqual(mapping['face_unrec_1'], 'Unknown_101');

    // Update name
    dbService.updateFaceName('face_alice_1', 'Alice Johnson');
    assert.strictEqual(dbService.getFaceNameMapping()['face_alice_1'], 'Alice Johnson');

    // Assign face
    dbService.assignFaceToPerson('face_unrec_1', 'Bob Smith');
    assert.strictEqual(dbService.getFaceNameMapping()['face_unrec_1'], 'Bob Smith');

    // Reset face
    dbService.resetFaceAssignment('face_unrec_1');
    assert.strictEqual(dbService.getFaceNameMapping()['face_unrec_1'], 'face_unrec_1');

    // Delete face
    dbService.deleteFace('face_unrec_1');
    assert.strictEqual(dbService.getFaceNameMapping()['face_unrec_1'], undefined);
  });

  it('should calculate face counts and face groups by source file', () => {
    const db = dbService.getDb();
    db.prepare(`
      INSERT INTO media_faces (media_id, face_id, name, confidence)
      VALUES (?, ?, ?, ?)
    `).run('item_01', 'face_alice_1', 'Alice Johnson', 0.95);

    const faceCounts = dbService.getFacesCountBySourceFile();
    assert.strictEqual(faceCounts['/photos/family_dinner.jpg'], 1);

    const facesByFile = dbService.getAllFacesBySourceFile();
    assert.ok(facesByFile['/photos/family_dinner.jpg']);
    assert.strictEqual(facesByFile['/photos/family_dinner.jpg'].length, 1);
    assert.strictEqual(facesByFile['/photos/family_dinner.jpg'][0].face_id, 'face_alice_1');
  });

  it('should deduplicate faces on saveMediaFaces and getFacesBySourceFile', () => {
    const file = '/photos/single_person.jpg';
    const rawFaces = [
      { face_id: 'face_100', name: 'John Doe', confidence: 0.99 },
      { face_id: 'face_100', name: 'John Doe', confidence: 0.99 }, // duplicate in list
    ];

    // Save multiple times as when user navigates or background scans run
    dbService.saveMediaFaces(file, rawFaces);
    dbService.saveMediaFaces(file, rawFaces);

    const faces = dbService.getFacesBySourceFile(file);
    assert.strictEqual(faces.length, 1, 'Should return exactly 1 face for the photo, no duplicates');
    assert.strictEqual(faces[0].face_id, 'face_100');
    assert.strictEqual(faces[0].name, 'John Doe');
  });
});
