import { describe, it } from 'node:test';
import assert from 'node:assert';
import { MediaCacheService } from '../mediaCacheService.js';
import { settingsTranslationsEn, settingsTranslationsRu } from '../../i18n/translations.js';
import type { GalleryMediaFile } from '../../models/media.js';

describe('Client MediaCacheService & Strategy', () => {
  it('should remove deleted duplicate files and adjust totalCount', async () => {
    const cache = new MediaCacheService();
    const fakeFile1: GalleryMediaFile = {
      filename: 'dup1.jpg',
      file_path: 'C:/photos/dup1.jpg',
      folder: 'C:/photos',
      file_size: 1000,
      mtime: 12345,
      is_image: true,
      is_video: false,
      status: 'PROCESSED',
    };
    const fakeFile2: GalleryMediaFile = {
      filename: 'keep1.jpg',
      file_path: 'C:/photos/keep1.jpg',
      folder: 'C:/photos',
      file_size: 2000,
      mtime: 12346,
      is_image: true,
      is_video: false,
      status: 'PROCESSED',
    };

    await cache.mergeChunk([fakeFile1, fakeFile2], 2);
    assert.strictEqual(cache.loadedCount, 2);
    assert.strictEqual(cache.total, 2);

    // Remove dup1.jpg
    await cache.removeFiles(['C:/photos/dup1.jpg']);
    assert.strictEqual(cache.loadedCount, 1);
    assert.strictEqual(cache.total, 1);
    assert.strictEqual(cache.get('C:/photos/dup1.jpg'), undefined);
    assert.ok(cache.get('C:/photos/keep1.jpg'));
  });

  it('should remove files belonging to a removed folder', async () => {
    const cache = new MediaCacheService();
    const fileFolder1: GalleryMediaFile = {
      filename: 'pic1.jpg',
      file_path: 'C:/folder_remove/pic1.jpg',
      folder: 'C:/folder_remove',
      file_size: 1000,
      mtime: 12345,
      is_image: true,
      is_video: false,
      status: 'PROCESSED',
    };
    const fileFolder2: GalleryMediaFile = {
      filename: 'pic2.jpg',
      file_path: 'C:/folder_keep/pic2.jpg',
      folder: 'C:/folder_keep',
      file_size: 2000,
      mtime: 12346,
      is_image: true,
      is_video: false,
      status: 'PROCESSED',
    };

    await cache.mergeChunk([fileFolder1, fileFolder2], 2);
    assert.strictEqual(cache.loadedCount, 2);

    await cache.removeFolders(['C:/folder_remove']);
    assert.strictEqual(cache.loadedCount, 1);
    assert.strictEqual(cache.total, 1);
    assert.strictEqual(cache.get('C:/folder_remove/pic1.jpg'), undefined);
    assert.ok(cache.get('C:/folder_keep/pic2.jpg'));
  });

  it('should rename folders and update paths in cache', async () => {
    const cache = new MediaCacheService();
    const fileOld: GalleryMediaFile = {
      filename: 'pic1.jpg',
      file_path: 'C:/old_name/pic1.jpg',
      folder: 'C:/old_name',
      file_size: 1000,
      mtime: 12345,
      is_image: true,
      is_video: false,
      status: 'PROCESSED',
    };

    await cache.mergeChunk([fileOld], 1);
    await cache.renameFolder('C:/old_name', 'C:/new_name');

    assert.strictEqual(cache.get('C:/old_name/pic1.jpg'), undefined);
    const updated = cache.get('C:/new_name/pic1.jpg');
    assert.ok(updated);
    assert.strictEqual(updated.folder, 'C:/new_name');
    assert.strictEqual(updated.file_path, 'C:/new_name/pic1.jpg');
  });

  it('should have File Metadata Operations translations in English and Russian', () => {
    assert.strictEqual(settingsTranslationsEn.tabExecution, 'File Metadata Operations');
    assert.strictEqual(settingsTranslationsEn.tabFileMetadataOperations, 'File Metadata Operations');
    assert.ok(settingsTranslationsEn.cachingStrategyTitle);
    assert.ok(settingsTranslationsEn.btnRecacheAll);

    assert.strictEqual(settingsTranslationsRu.tabExecution, 'Операции с метаданными файлов');
    assert.strictEqual(settingsTranslationsRu.tabFileMetadataOperations, 'Операции с метаданными файлов');
    assert.ok(settingsTranslationsRu.cachingStrategyTitle);
    assert.ok(settingsTranslationsRu.btnRecacheAll);
  });
});
