import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { MediaService } from '../media.service.js';
import { DatabaseService } from '../../database/database.service.js';
import { AppConfigService } from '../../config/config.service.js';

describe('Metadata Editing & Sidecar Synchronization', () => {
  let mediaService: MediaService;
  let dbService: DatabaseService;
  let tmpDir: string;
  let inputDir: string;
  let dbPath: string;
  let testPhotoPath: string;

  before(() => {
    tmpDir = path.join(process.cwd(), 'media_output', `test_meta_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`);
    inputDir = path.join(tmpDir, 'photos');
    fs.mkdirSync(inputDir, { recursive: true });
    dbPath = path.join(tmpDir, 'test_meta.db');

    testPhotoPath = path.join(inputDir, 'sunset_beach.jpg');
    fs.writeFileSync(testPhotoPath, 'fake-jpeg-binary-data');

    const mockConfig = {
      dbPath: dbPath,
      inputFolders: [inputDir],
      outputFolder: tmpDir,
      projectRoot: tmpDir,
      supportedPhotoExts: new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif']),
      supportedVideoExts: new Set(['.mp4', '.mov', '.avi']),
    } as unknown as AppConfigService;

    dbService = new DatabaseService(mockConfig);
    dbService.initDb();

    mediaService = new MediaService(mockConfig, dbService);
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

  it('should update media metadata and persist to SQLite database', async () => {
    const updateResult = await mediaService.updateMediaMetadata({
      file: testPhotoPath,
      summary: 'Beautiful sunset over the ocean',
      summary_ru: 'Красивый закат над океаном',
      description: 'A vivid sunset captured during vacation with golden reflections on the waves.',
      description_ru: 'Яркий закат во время отпуска с золотыми бликами на волнах.',
      environment: 'outdoor',
      lighting: 'golden hour',
      lighting_ru: 'золотой час',
      weather: 'clear sky',
      weather_ru: 'ясное небо',
      time_of_day: 'sunset',
      time_of_day_ru: 'закат',
      location_name: 'Malibu Beach, California',
      media_date: '2024-07-20',
      camera_make: 'Sony',
      camera_model: 'ILCE-7RM4',
      lens_model: 'FE 24-70mm F2.8 GM',
      tags: ['sunset', 'vacation', 'beach', 'california'],
      ocr_text: 'MALIBU RESORT',
      transcription: 'Listen to the sound of the waves',
      transcription_ru: 'Послушайте шум волн',
    });

    assert.strictEqual(updateResult.status, 'success');
    assert.ok(updateResult.data, 'Updated data should be returned');
    assert.strictEqual(updateResult.data.summary, 'Beautiful sunset over the ocean');
    assert.strictEqual(updateResult.data.summary_ru, 'Красивый закат над океаном');
    assert.strictEqual(updateResult.data.location_name, 'Malibu Beach, California');
    assert.strictEqual(updateResult.data.camera_make, 'Sony');
    assert.strictEqual(updateResult.data.camera_model, 'ILCE-7RM4');
    assert.strictEqual(updateResult.data.lens_model, 'FE 24-70mm F2.8 GM');
    assert.strictEqual(updateResult.data.media_date, '2024-07-20');

    // Query DB directly
    const allMeta = dbService.getAllMediaMetadata();
    const dbRecord = allMeta[testPhotoPath] || allMeta['sunset_beach.jpg'];
    assert.ok(dbRecord, 'Record must exist in DB');
    assert.strictEqual(dbRecord.summary, 'Beautiful sunset over the ocean');
    assert.strictEqual(dbRecord.environment, 'outdoor');
  });

  it('should synchronize metadata to on-disk sidecar JSON file', async () => {
    const sidecarFile = path.join(tmpDir, 'sunset_beach.jpg.json');
    assert.ok(fs.existsSync(sidecarFile), 'Sidecar JSON file should be created/updated on disk');

    const sidecarContent = JSON.parse(fs.readFileSync(sidecarFile, 'utf-8'));
    assert.strictEqual(sidecarContent.summary, 'Beautiful sunset over the ocean');
    assert.strictEqual(sidecarContent.summary_ru, 'Красивый закат над океаном');
    assert.strictEqual(sidecarContent.location_name, 'Malibu Beach, California');
    assert.strictEqual(sidecarContent.camera_make, 'Sony');
    assert.strictEqual(sidecarContent.camera_model, 'ILCE-7RM4');
    assert.strictEqual(sidecarContent.lens_model, 'FE 24-70mm F2.8 GM');
    assert.strictEqual(sidecarContent.media_date, '2024-07-20');
    assert.deepStrictEqual(sidecarContent.tags, ['sunset', 'vacation', 'beach', 'california']);
    assert.ok(sidecarContent.gemini_analysis, 'gemini_analysis block must be present');
    assert.strictEqual(sidecarContent.gemini_analysis.lighting, 'golden hour');
    assert.strictEqual(sidecarContent.gemini_analysis.weather_ru, 'ясное небо');
  });

  it('should support comma-separated string tags and update selectively', async () => {
    const updateResult = await mediaService.updateMediaMetadata({
      file: testPhotoPath,
      location_name: 'Santa Monica Pier',
      tags: 'pier, night, carnival',
    });

    assert.strictEqual(updateResult.status, 'success');
    assert.strictEqual(updateResult.data.location_name, 'Santa Monica Pier');

    // Preserved previously set fields
    assert.strictEqual(updateResult.data.summary, 'Beautiful sunset over the ocean');
    assert.strictEqual(updateResult.data.camera_make, 'Sony');

    const sidecarFile = path.join(tmpDir, 'sunset_beach.jpg.json');
    const sidecarContent = JSON.parse(fs.readFileSync(sidecarFile, 'utf-8'));
    assert.strictEqual(sidecarContent.location_name, 'Santa Monica Pier');
    assert.deepStrictEqual(sidecarContent.tags, ['pier', 'night', 'carnival']);
  });

  it('should reject requests with empty file parameter', async () => {
    await assert.rejects(
      async () => {
        await mediaService.updateMediaMetadata({ file: '' });
      },
      {
        name: 'BadRequestException',
      }
    );
  });
});
