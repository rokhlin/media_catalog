import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { DatabaseService } from '../../database/database.service.js';
import { DuplicatesService } from '../duplicates.service.js';

describe('BUG-016: Duplicate Settings & Dynamic Re-Clustering', () => {
  let tmpDir: string;
  let dbService: DatabaseService;
  let duplicatesService: DuplicatesService;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dup_recluster_test_'));
    const mockConfig: any = {
      dbPath: path.join(tmpDir, 'catalog_history.db'),
      outputFolder: tmpDir,
      usersBaseDir: tmpDir,
      supportedPhotoExts: new Set(['.jpg', '.jpeg', '.png']),
      supportedVideoExts: new Set(['.mp4', '.mov']),
    };
    dbService = new DatabaseService(mockConfig);
    dbService.initDb();

    // Populate media_hashes with mock items
    // Item 1 & 2: Identical content hash (exact match)
    dbService.saveMediaHash({
      filePath: path.join(tmpDir, 'exact_a.jpg'),
      contentHash: 'hash_exact_123',
      phash: '1111111111111111',
      fileSize: 1000,
      mtime: 1700000000,
    });
    dbService.saveMediaHash({
      filePath: path.join(tmpDir, 'exact_b.jpg'),
      contentHash: 'hash_exact_123',
      phash: '1111111111111111',
      fileSize: 1000,
      mtime: 1700000001,
    });

    // Item 3 & 4: Perceptual hash distance = 2 (similarity = 1 - 2/64 = 0.96875 ~ 97%)
    dbService.saveMediaHash({
      filePath: path.join(tmpDir, 'visual_a.jpg'),
      contentHash: 'hash_diff_1',
      phash: 'ffff0000ffff0000',
      fileSize: 2000,
      mtime: 1700000100,
    });
    dbService.saveMediaHash({
      filePath: path.join(tmpDir, 'visual_b.jpg'),
      contentHash: 'hash_diff_2',
      phash: 'ffff0000ffff0003', // 2 bit differences from visual_a
      fileSize: 2050,
      mtime: 1700000105,
    });

    // Item 5: Perceptual hash distance = 10 from visual_a (similarity = 1 - 10/64 = 0.84375 ~ 84%)
    dbService.saveMediaHash({
      filePath: path.join(tmpDir, 'visual_distant.jpg'),
      contentHash: 'hash_diff_3',
      phash: 'ffff0000ffff03ff', // 10 bit differences
      fileSize: 2100,
      mtime: 1700000110,
    });

    duplicatesService = new DuplicatesService(
      mockConfig,
      dbService,
      {
        findSidecarFile: () => null,
      } as any,
    );
  });

  after(() => {
    dbService.close();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it('should filter only exact duplicates when mode is "exact"', async () => {
    const groups = await duplicatesService.getDuplicateGroups('exact', 0.90);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].matchType, 'exact');
    assert.equal(groups[0].duplicates.length, 1);
  });

  it('should find visual duplicates at 90% threshold (excludes 84% distant item)', async () => {
    const groups = await duplicatesService.getDuplicateGroups('visual', 0.90);
    // Visual group for visual_a and visual_b
    assert.ok(groups.length >= 1);
    const visGroup = groups.find((g) => g.matchType === 'visual');
    assert.ok(visGroup, 'Must have visual group');
    // Check that visual_distant is not included in the 90% cluster
    const fileNames = [visGroup.primaryFile.filePath, ...visGroup.duplicates.map((d) => d.filePath)];
    assert.ok(fileNames.some((f) => f.includes('visual_a.jpg')));
    assert.ok(fileNames.some((f) => f.includes('visual_b.jpg')));
    assert.ok(!fileNames.some((f) => f.includes('visual_distant.jpg')));
  });

  it('should include 84% distant item when threshold is lowered to 0.80', async () => {
    const groups = await duplicatesService.getDuplicateGroups('visual', 0.80);
    assert.ok(groups.length >= 1);
    const visGroup = groups.find((g) => g.matchType === 'visual');
    assert.ok(visGroup);
    const fileNames = [visGroup.primaryFile.filePath, ...visGroup.duplicates.map((d) => d.filePath)];
    assert.ok(fileNames.some((f) => f.includes('visual_distant.jpg')), '84% distant item must now be clustered at 80% threshold');
  });
});
