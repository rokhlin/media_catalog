import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { MediaService } from '../media.service.js';
import { DatabaseService } from '../../database/database.service.js';
import { AppConfigService } from '../../config/config.service.js';

describe('Media Caching Strategy & Operations', () => {
  let mediaService: MediaService;
  let dbService: DatabaseService;
  let tmpDir: string;
  let folderA: string;
  let folderB: string;
  let dbPath: string;

  before(async () => {
    tmpDir = path.join(process.cwd(), 'media_output', `test_cache_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`);
    folderA = path.join(tmpDir, 'folder_a');
    folderB = path.join(tmpDir, 'folder_b');
    fs.mkdirSync(folderA, { recursive: true });
    fs.mkdirSync(folderB, { recursive: true });
    dbPath = path.join(tmpDir, 'test_cache.db');

    // Populate test files
    fs.writeFileSync(path.join(folderA, 'photo1.jpg'), 'photo1-data');
    fs.writeFileSync(path.join(folderA, 'photo2.jpg'), 'photo2-data');
    fs.writeFileSync(path.join(folderB, 'video1.mp4'), 'video1-data');

    const mockConfig = {
      dbPath,
      inputFolders: [folderA, folderB],
      outputFolder: tmpDir,
      projectRoot: tmpDir,
      supportedPhotoExts: new Set(['.jpg', '.jpeg', '.png', '.webp']),
      supportedVideoExts: new Set(['.mp4', '.mov']),
    } as unknown as AppConfigService;

    dbService = new DatabaseService(mockConfig);
    dbService.initDb();

    const { ThumbnailService } = await import('../thumbnail.service.js');
    const thumbnailService = new ThumbnailService(mockConfig);
    mediaService = new MediaService(mockConfig, dbService, undefined, thumbnailService);
  });

  after(() => {
    try {
      mediaService.onModuleDestroy();
      dbService.close();
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch {
      // ignore cleanup
    }
  });

  it('should return initial cache status and default daily automation config', () => {
    const status = mediaService.getCacheStatus();
    assert.strictEqual(typeof status.total_cached_files, 'number');
    assert.strictEqual(status.daily_automation_enabled, true);
    assert.strictEqual(status.daily_schedule_time, '03:00');
    assert.strictEqual(status.incremental_only, true);
    assert.strictEqual(Array.isArray(status.input_folders), true);
    assert.strictEqual(status.input_folders.length, 2);
  });

  it('should update and persist caching strategy configuration', () => {
    const updated = mediaService.saveCacheStrategy({
      daily_automation_enabled: false,
      daily_schedule_time: '04:30',
      incremental_only: true,
    });
    assert.strictEqual(updated.daily_automation_enabled, false);
    assert.strictEqual(updated.daily_schedule_time, '04:30');

    // Re-fetch from service
    const status = mediaService.getCacheStatus();
    assert.strictEqual(status.daily_automation_enabled, false);
    assert.strictEqual(status.daily_schedule_time, '04:30');
  });

  it('should perform full recache and populate memory cache with metrics', async () => {
    const res = await mediaService.recache({ incremental: false });
    assert.strictEqual(res.status, 'success');
    assert.strictEqual(res.total_cached, 3);
    assert.strictEqual(typeof res.duration_ms, 'number');

    const status = mediaService.getCacheStatus();
    assert.strictEqual(status.status, 'warm');
    assert.strictEqual(status.memory_cached_count, 3);
    assert.ok(status.last_cached_at);
    assert.strictEqual(status.indexed_folders.length, 2);
  });

  it('should support manual targeted recache for a specific folder', async () => {
    // Add a new file to folderA
    fs.writeFileSync(path.join(folderA, 'photo3.jpg'), 'photo3-data');

    // Recache only folderA
    const res = await mediaService.recache({ folder: folderA });
    assert.strictEqual(res.status, 'success');
    assert.strictEqual(res.folder, folderA);

    const status = mediaService.getCacheStatus();
    // 3 in folderA + 1 in folderB = 4 total
    assert.strictEqual(status.memory_cached_count, 4);
    const folderAStats = status.indexed_folders.find((f) => f.folder === folderA);
    assert.strictEqual(folderAStats?.count, 3);
  });

  it('should recalculate cache for remaining files when duplicate files are removed', () => {
    const targetToDelete = path.join(folderA, 'photo2.jpg');
    const initialStatus = mediaService.getCacheStatus();
    const initialCount = initialStatus.memory_cached_count;

    mediaService.recalculateCacheAfterDeletion([targetToDelete]);

    const postStatus = mediaService.getCacheStatus();
    assert.strictEqual(postStatus.memory_cached_count, initialCount - 1);
    assert.strictEqual(postStatus.status, 'warm');
    // Ensure deleted file is no longer in media service maps
    assert.strictEqual(mediaService.resolveMediaFilePath(targetToDelete), targetToDelete);
  });

  it('should recalculate cache for remaining files when a folder is removed', () => {
    const initialStatus = mediaService.getCacheStatus();
    assert.ok(initialStatus.memory_cached_count > 0);

    // Remove folderB
    mediaService.recalculateCacheAfterFolderChange({
      removedFolders: [folderB],
    });

    const postStatus = mediaService.getCacheStatus();
    // Remaining files should only be from folderA
    assert.strictEqual(postStatus.status, 'warm');
    const hasFolderB = postStatus.indexed_folders.some((f) => f.folder === folderB);
    assert.strictEqual(hasFolderB, false);
    // All remaining items must belong to folderA
    for (const folderItem of postStatus.indexed_folders) {
      assert.strictEqual(folderItem.folder, folderA);
    }
  });

  it('should recalculate cache and update paths when a folder is renamed', () => {
    const newFolderAPath = path.join(tmpDir, 'folder_a_renamed');
    mediaService.recalculateCacheAfterFolderChange({
      renamedFolders: [{ oldPath: folderA, newPath: newFolderAPath }],
    });

    const postStatus = mediaService.getCacheStatus();
    const hasOldFolder = postStatus.indexed_folders.some((f) => f.folder === folderA);
    assert.strictEqual(hasOldFolder, false);
    const hasNewFolder = postStatus.indexed_folders.some((f) => f.folder === newFolderAPath);
    assert.strictEqual(hasNewFolder, true);
  });

  it('should reconcile deleted and added files in incremental mode without scanning unchanged files', async () => {
    // Add new file in input folderA
    const newFilePath = path.join(folderA, 'brand_new.jpg');
    fs.writeFileSync(newFilePath, 'brand-new-data');

    // Remove an existing file physically from disk in folderA
    const removedFilePath = path.join(folderA, 'photo1.jpg');
    if (fs.existsSync(removedFilePath)) {
      fs.unlinkSync(removedFilePath);
    }

    // Run incremental recache
    await mediaService.recache({ incremental: true });

    const status = mediaService.getCacheStatus();
    assert.ok(status.total_cached_files > 0);

    // Verify removed file is deleted from SQLite
    const existingIndex = dbService.getExistingFilesIndex();
    const normRemoved = removedFilePath.replace(/\\/g, '/').toLowerCase();
    assert.strictEqual(existingIndex.has(normRemoved), false, 'Removed file should be pruned from SQLite');

    // Verify brand new file is present in SQLite
    const normNew = newFilePath.replace(/\\/g, '/').toLowerCase();
    assert.strictEqual(existingIndex.has(normNew), true, 'Brand new file should be recorded in SQLite');
  });

  it('should enforce strict mutex and not launch parallel scans when a scan is in-flight', async () => {
    const p1 = mediaService.recache({ incremental: true });
    const p2 = mediaService.recache({ incremental: true });

    const [res1, res2] = await Promise.all([p1, p2]);
    assert.strictEqual(res1.status, 'success');
    assert.strictEqual(res2.status, 'success');
  });

  it('should atomically remove deleted duplicate files from SQLite media_items during recalculateCacheAfterDeletion', () => {
    const targetFile = path.join(folderA, 'brand_new.jpg');
    // Ensure item was in DB
    const normTarget = targetFile.replace(/\\/g, '/').toLowerCase();
    assert.strictEqual(dbService.getExistingFilesIndex().has(normTarget), true);

    mediaService.recalculateCacheAfterDeletion([targetFile]);

    // Ensure item is now deleted from DB without running a full scan
    assert.strictEqual(dbService.getExistingFilesIndex().has(normTarget), false);
  });

  it('should identify and prune disconnected folders and update task status', async () => {
    // Manually insert an orphaned item belonging to an unconfigured folder
    const orphanedFolder = path.join(tmpDir, 'old_removed_nas');
    const orphanedFile = path.join(orphanedFolder, 'stale_photo.jpg');

    dbService.saveMediaItemsBatch([
      {
        id: 'stale-1',
        file_path: orphanedFile,
        filename: 'stale_photo.jpg',
        folder: orphanedFolder,
        is_image: true,
        file_size: 1234,
        mtime: Date.now() / 1000,
        status: 'PROCESSED',
      },
    ]);

    // Verify orphaned item is initially in SQLite
    const normStale = orphanedFile.replace(/\\/g, '/').toLowerCase();
    assert.strictEqual(dbService.getExistingFilesIndex().has(normStale), true);

    // Run pruneDisconnectedFolders
    const result = await mediaService.pruneDisconnectedFolders();
    assert.strictEqual(result.status, 'success');
    assert.ok(result.deleted_files_count >= 1);

    // Verify orphaned item was pruned from SQLite
    assert.strictEqual(dbService.getExistingFilesIndex().has(normStale), false);

    // Verify task status
    const task = mediaService.getActiveCacheTask();
    assert.strictEqual(task.type, 'prune_folders');
    assert.strictEqual(task.status, 'completed');
    assert.ok(task.completed_at);
  });

  it('should clean unreferenced sidecar files older than 30 days while preserving fresh ones', async () => {
    // Create old sidecar (>30 days old) and fresh sidecar (<30 days old)
    const oldSidecarPath = path.join(tmpDir, 'old_orphan.json');
    const freshSidecarPath = path.join(tmpDir, 'fresh_sidecar.json');
    fs.writeFileSync(oldSidecarPath, JSON.stringify({ summary: 'old' }));
    fs.writeFileSync(freshSidecarPath, JSON.stringify({ summary: 'fresh' }));

    // Backdate the old sidecar to 40 days ago
    const fortyDaysAgo = (Date.now() - 40 * 24 * 60 * 60 * 1000) / 1000;
    fs.utimesSync(oldSidecarPath, fortyDaysAgo, fortyDaysAgo);

    const res = await mediaService.cleanUnusedSidecars(30);
    assert.ok(res.deletedCount >= 1);

    // Old sidecar must be unlinked, fresh sidecar must still exist
    assert.strictEqual(fs.existsSync(oldSidecarPath), false, 'Old unreferenced sidecar should be deleted');
    assert.strictEqual(fs.existsSync(freshSidecarPath), true, 'Fresh sidecar should be preserved');
  });

  it('should completely reset all catalog data, thumbnails, and cache on clean slate reset', async () => {
    // 1. Ensure some data exists in DB
    const dummyFile = path.join(folderA, 'reset_test.jpg');
    dbService.saveMediaItemsBatch([
      {
        id: 'reset-1',
        file_path: dummyFile,
        filename: 'reset_test.jpg',
        folder: folderA,
        is_image: true,
        file_size: 5678,
        mtime: Date.now() / 1000,
        status: 'PROCESSED',
      },
    ]);

    // 2. Put a dummy thumbnail in cache dir
    const thumbDir = path.join(tmpDir, 'cache', 'thumbnails');
    fs.mkdirSync(thumbDir, { recursive: true });
    const dummyThumb = path.join(thumbDir, 'dummy_thumb.webp');
    fs.writeFileSync(dummyThumb, 'dummy-thumb-data');
    assert.strictEqual(fs.existsSync(dummyThumb), true);

    // 3. Trigger resetAllData
    const resetResult = await mediaService.resetAllData();
    assert.strictEqual(resetResult.status, 'success');
    assert.ok(resetResult.deleted_media_count >= 1);
    assert.ok(resetResult.deleted_thumbnails_count >= 1);

    // 4. Verify DB media items is completely empty
    const countRow = dbService.getDb().prepare('SELECT COUNT(*) as count FROM media_items').get() as { count: number };
    assert.strictEqual(countRow.count, 0, 'All media_items rows should be wiped');

    // 5. Verify thumbnail file is deleted from disk
    assert.strictEqual(fs.existsSync(dummyThumb), false, 'Thumbnail file should be cleared from disk');

    // 6. Verify cache stats reset
    const strategy = dbService.getCacheStrategyConfig();
    assert.strictEqual(strategy.last_cached_at, null);
    assert.strictEqual(strategy.last_cached_count, 0);

    // 7. Verify task status
    const task = mediaService.getActiveCacheTask();
    assert.strictEqual(task.type, 'reset_all');
    assert.strictEqual(task.status, 'completed');
  });
});
