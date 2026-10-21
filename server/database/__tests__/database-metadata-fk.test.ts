import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { DatabaseService } from '../database.service.js';

describe('BUG-016: Database Media Metadata FK Healing', () => {
  let tmpDir: string;
  let dbService: DatabaseService;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'db_fk_test_'));
    const mockConfig: any = {
      dbPath: path.join(tmpDir, 'catalog_history.db'),
      outputFolder: tmpDir,
      usersBaseDir: tmpDir,
    };
    dbService = new DatabaseService(mockConfig);
    dbService.initDb();
  });

  after(() => {
    dbService.close();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it('should successfully save media metadata when item was pre-created with custom ID format', () => {
    const db = (dbService as any).getDb();
    const filePath = 'C:/photos/vacation/sample_01.jpg';
    const preExistingId = 'media_custom_sha256_hash_123';

    // Simulate item created by ai_engine with custom sha256 id
    db.prepare(`
      INSERT INTO media_items (id, file_path, file_name, media_type, file_size, mtime, status)
      VALUES (?, ?, ?, 'photo', 1024, 1700000000, 'UNPROCESSED')
    `).run(preExistingId, filePath, 'sample_01.jpg');

    // Save metadata without mediaId (simulating backend parser)
    assert.doesNotThrow(() => {
      dbService.saveMediaMetadata(filePath, {
        summary: 'A sunny beach scene',
        summary_ru: 'Солнечный пляж',
        description: 'Crystal clear water and white sand',
        description_ru: 'Прозрачная вода и белый песок',
        phash: '0123456789abcdef',
      });
    });

    // Verify row was properly inserted with the pre-existing ID into media_metadata
    const meta = db.prepare('SELECT * FROM media_metadata WHERE media_id = ?').get(preExistingId) as any;
    assert.ok(meta, 'Metadata record must exist with matching media_id');
    assert.equal(meta.summary, 'A sunny beach scene');
    assert.equal(meta.summary_ru, 'Солнечный пляж');

    // Verify phash was updated in media_items
    const item = db.prepare('SELECT * FROM media_items WHERE id = ?').get(preExistingId) as any;
    assert.equal(item.phash, '0123456789abcdef');
    assert.equal(item.status, 'PROCESSED');
  });

  it('should normalize slashes and find faces across all path representations', () => {
    const rawPath = 'C:\\photos\\vacation\\family.jpg';
    const faceList = [
      {
        face_id: 'face_fam_1',
        name: 'Anna',
        confidence: 0.98,
        bbox: [10, 20, 100, 120],
      },
    ];

    dbService.saveMediaFaces(rawPath, faceList);

    const allFaces = dbService.getAllFacesBySourceFile();
    assert.ok(allFaces[rawPath], 'Faces must be accessible by raw backslash path');
    assert.ok(allFaces['C:/photos/vacation/family.jpg'], 'Faces must be accessible by normalized slash path');
    assert.ok(allFaces['family.jpg'], 'Faces must be accessible by filename');

    const counts = dbService.getFacesCountBySourceFile();
    assert.equal(counts[rawPath], 1);
    assert.equal(counts['C:/photos/vacation/family.jpg'], 1);
    assert.equal(counts['family.jpg'], 1);
  });
});
