import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { MediaService } from '../media.service.js';
import { DatabaseService } from '../../database/database.service.js';
import { AppConfigService } from '../../config/config.service.js';

describe('MediaService', () => {
  let mediaService: MediaService;
  let dbService: DatabaseService;
  let tmpDir: string;
  let inputDir: string;
  let dbPath: string;

  before(() => {
    tmpDir = path.join(process.cwd(), 'media_output', `test_media_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`);
    inputDir = path.join(tmpDir, 'input_photos');
    fs.mkdirSync(inputDir, { recursive: true });
    dbPath = path.join(tmpDir, 'test_media.db');

    // Create test files
    fs.writeFileSync(path.join(inputDir, 'vacation.jpg'), 'fake-image-data');
    fs.writeFileSync(path.join(inputDir, 'photo.heic'), 'fake-heic-data');
    fs.writeFileSync(path.join(inputDir, 'photo.heif'), 'fake-heif-data');
    fs.writeFileSync(path.join(inputDir, 'clip.mp4'), 'fake-video-data');
    fs.writeFileSync(path.join(inputDir, 'notes.txt'), 'text data'); // Should be ignored

    // Create subfolder
    const subDir = path.join(inputDir, '2024');
    fs.mkdirSync(subDir, { recursive: true });
    fs.writeFileSync(path.join(subDir, 'beach.png'), 'fake-png-data');

    // Create ignored folder
    const pycache = path.join(inputDir, '__pycache__');
    fs.mkdirSync(pycache, { recursive: true });
    fs.writeFileSync(path.join(pycache, 'ignored.jpg'), 'ignored-image');

    const mockConfig = {
      dbPath: dbPath,
      inputFolders: [inputDir],
      outputFolder: tmpDir,
      projectRoot: tmpDir,
      supportedPhotoExts: new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif']),
      supportedVideoExts: new Set(['.mp4', '.mov', '.avi', '.mkv']),
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

  it('should scan input folders filtering supported media extensions and ignoring excluded directories', async () => {
    const scanned = await mediaService.scanInputFolders();
    const filenames = scanned.map((s) => path.basename(s.filePath));

    assert.ok(filenames.includes('vacation.jpg'), 'Should include vacation.jpg');
    assert.ok(filenames.includes('photo.heic'), 'Should include photo.heic');
    assert.ok(filenames.includes('photo.heif'), 'Should include photo.heif');
    assert.ok(filenames.includes('clip.mp4'), 'Should include clip.mp4');
    assert.ok(filenames.includes('beach.png'), 'Should include beach.png from subfolder');
    assert.strictEqual(filenames.includes('notes.txt'), false, 'Should ignore notes.txt');
    assert.strictEqual(filenames.includes('ignored.jpg'), false, 'Should ignore files in __pycache__');
  });

  it('should list media files and associate with database records', async () => {
    const db = dbService.getDb();
    const vacationPath = path.join(inputDir, 'vacation.jpg');

    db.prepare(`
      INSERT INTO sync_history (file_path, file_size, mtime, status, sidecar_path)
      VALUES (?, ?, ?, ?, ?)
    `).run(vacationPath, 15, 1700000000, 'COMPLETED', '/output/vacation.json');

    db.prepare(`
      INSERT INTO media_items (id, file_path, file_name, media_type, file_size, media_date)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('item_vacation', vacationPath, 'vacation.jpg', 'photo', 15, '2024-07-01');

    db.prepare(`
      INSERT INTO media_metadata (media_id, summary, location_name)
      VALUES (?, ?, ?)
    `).run('item_vacation', 'Sunny beach vacation', 'Malibu');

    const result = await mediaService.listMediaFiles();
    assert.ok(Array.isArray(result.files), 'Result should contain files array');
    assert.ok(result.files.length >= 3, 'Should list scanned files');

    const vacationItem = result.files.find((f: any) => f.filename === 'vacation.jpg');
    assert.ok(vacationItem, 'vacation.jpg should be found');
    assert.strictEqual(vacationItem.status, 'COMPLETED');
    assert.strictEqual(vacationItem.summary, 'Sunny beach vacation');
    assert.strictEqual(vacationItem.is_image, true);
  });

  it('should ingest metadata, localized attributes, and faces from on-disk sidecar JSON files', async () => {
    const clipPath = path.join(inputDir, 'clip.mp4');
    const clipSidecar = path.join(tmpDir, 'clip.json');

    // Write a mock sidecar JSON with full English & Russian AI metadata and faces
    const sidecarData = {
      description: 'A cheerful family gathering in a sunny park.',
      description_ru: 'Веселая семейная встреча в солнечном парке.',
      summary: 'Family picnic in the park.',
      summary_ru: 'Семейный пикник в парке.',
      gemini_analysis: {
        environment: 'outdoor',
        lighting: 'bright sunlight',
        lighting_ru: 'яркий солнечный свет',
        weather: 'clear sky',
        weather_ru: 'ясное небо',
        time_of_day: 'afternoon',
        time_of_day_ru: 'день',
        transcription: 'Hello everyone!',
        transcription_ru: 'Всем привет!',
        timeline_events: [{ timestamp: '00:01', label: 'Laughing' }],
      },
      faces: [
        {
          face_id: 'face_clip_0',
          name: 'Anna Smith',
          confidence: 0.98,
          image_path: 'crops/anna_0.jpg',
        },
        {
          face_id: 'face_clip_1',
          name: 'face_1',
          confidence: 0.85,
          image_path: 'crops/unknown_1.jpg',
        },
      ],
      face_names: ['Anna Smith'],
    };

    fs.writeFileSync(clipSidecar, JSON.stringify(sidecarData, null, 2), 'utf-8');
    mediaService.invalidateCache();

    const result = await mediaService.listMediaFiles({ refresh: true });
    const clipItem = result.files.find((f: any) => f.filename === 'clip.mp4');

    assert.ok(clipItem, 'clip.mp4 should be found');
    assert.strictEqual(clipItem.status, 'PROCESSED');
    assert.strictEqual(clipItem.description_ru, 'Веселая семейная встреча в солнечном парке.');
    assert.strictEqual(clipItem.summary_ru, 'Семейный пикник в парке.');
    assert.strictEqual(clipItem.lighting_ru, 'яркий солнечный свет');
    assert.strictEqual(clipItem.weather_ru, 'ясное небо');
    assert.strictEqual(clipItem.time_of_day_ru, 'день');
    assert.strictEqual(clipItem.transcription_ru, 'Всем привет!');
    assert.strictEqual(clipItem.faces.length, 2);
    assert.ok(clipItem.face_names.includes('Anna Smith'));
    assert.strictEqual(clipItem.has_unassigned_faces, true);

    // Verify sidecar endpoint
    const sidecarApiResult = await mediaService.getMediaSidecar(clipPath);
    assert.strictEqual(sidecarApiResult.description, 'A cheerful family gathering in a sunny park.');

    // Verify getFacesForFile
    const facesResult = await mediaService.getFacesForFile(clipPath);
    assert.strictEqual(facesResult.length, 2);
    assert.strictEqual(facesResult[0].name, 'Anna Smith');
  });

  it('should tag a person on a media file and keep database and sidecar in sync', async () => {
    const beachPath = path.join(inputDir, '2024', 'beach.png');

    const addRes = mediaService.addPersonToFile(beachPath, 'John Doe');
    assert.strictEqual(addRes.status, 'success');

    const facesAfterAdd = await mediaService.getFacesForFile(beachPath);
    assert.ok(facesAfterAdd.some((f) => f.name === 'John Doe'));

    // Remove face
    const faceToRemove = facesAfterAdd.find((f) => f.name === 'John Doe');
    assert.ok(faceToRemove);
    const removeRes = mediaService.removeFaceFromFile(beachPath, faceToRemove.face_id);
    assert.strictEqual(removeRes.status, 'success');

    const facesAfterRemove = await mediaService.getFacesForFile(beachPath);
    assert.strictEqual(facesAfterRemove.some((f) => f.name === 'John Doe'), false);
  });


  it('should support pagination, sorting, and filtering on listMediaFiles', async () => {
    // Test pagination with limit and offset
    const page1 = await mediaService.listMediaFiles({ limit: 2, offset: 0 });
    assert.strictEqual(page1.files.length, 2, 'Page 1 should return 2 items');
    assert.strictEqual(page1.total, 5, 'Total items should be 5');
    assert.strictEqual(page1.hasMore, true, 'hasMore should be true for page 1');
    assert.ok(page1.stats, 'Stats should be returned');
    assert.strictEqual(page1.stats.total, 5);

    const page2 = await mediaService.listMediaFiles({ limit: 2, offset: 2 });
    assert.strictEqual(page2.files.length, 2, 'Page 2 should return 2 items');
    assert.strictEqual(page2.hasMore, true, 'hasMore should be true for page 2');

    const page3 = await mediaService.listMediaFiles({ limit: 2, offset: 4 });
    assert.strictEqual(page3.files.length, 1, 'Page 3 should return 1 item');
    assert.strictEqual(page3.hasMore, false, 'hasMore should be false for page 3');

    // Test sorting by name asc
    const sortedByName = await mediaService.listMediaFiles({ sort_by: 'name', sort_order: 'asc' });
    const names = sortedByName.files.map((f: any) => f.filename);
    assert.deepStrictEqual(names, ['beach.png', 'clip.mp4', 'photo.heic', 'photo.heif', 'vacation.jpg']);

    // Test filter by type
    const imagesOnly = await mediaService.listMediaFiles({ type: 'images' });
    assert.strictEqual(imagesOnly.files.length, 4);
    assert.ok(imagesOnly.files.every((f: any) => f.is_image));

    const videosOnly = await mediaService.listMediaFiles({ type: 'videos' });
    assert.strictEqual(videosOnly.files.length, 1);
    assert.strictEqual(videosOnly.files[0].filename, 'clip.mp4');

    // Test cache invalidation
    mediaService.invalidateCache();
    const freshList = await mediaService.listMediaFiles({ refresh: true });
    assert.strictEqual(freshList.total, 5);
  });

  it('should resolve media file paths for direct, relative, subfolder, and Windows/UNC paths', () => {
    // Direct path
    const direct = mediaService.resolveMediaFilePath(path.join(inputDir, 'vacation.jpg'));
    assert.strictEqual(fs.existsSync(direct), true);

    // Subpath
    const subpath = mediaService.resolveMediaFilePath('2024/beach.png');
    assert.strictEqual(fs.existsSync(subpath), true);

    // Basename
    const byBasename = mediaService.resolveMediaFilePath('beach.png');
    assert.strictEqual(fs.existsSync(byBasename), true);

    // Windows drive style subpath simulation
    const winStyle = mediaService.resolveMediaFilePath('Z:\\2024\\beach.png');
    assert.strictEqual(fs.existsSync(winStyle), true);

    // UNC style subpath simulation
    const uncStyle = mediaService.resolveMediaFilePath('\\\\NAS\\photos\\2024\\beach.png');
    assert.strictEqual(fs.existsSync(uncStyle), true);

    // File access verification
    const access = mediaService.verifyFileAccess('vacation.jpg');
    assert.strictEqual(access.accessible, true);
    assert.ok(access.resolvedPath);

    // Nonexistent file
    assert.throws(() => {
      mediaService.resolveMediaFilePath('non_existent_image_12345.jpg');
    });
  });

  it('should get single media file info with latest metadata, sidecar, and faces', async () => {
    // Create sidecar JSON
    const sidecarPath = path.join(tmpDir, 'vacation.jpg.json');
    fs.writeFileSync(sidecarPath, JSON.stringify({
      filename: 'vacation.jpg',
      summary: 'Updated beach sidecar summary',
      description: 'Crystal clear waters on the shoreline.',
      lighting: 'Bright daylight',
      weather: 'Sunny',
      environment: 'outdoor',
      faces: [{ face_id: 'face_1', name: 'Alice', confidence: 0.98, is_reference: 1 }]
    }, null, 2));

    const info = await mediaService.getMediaFileInfo('vacation.jpg');
    assert.strictEqual(info.filename, 'vacation.jpg');
    assert.strictEqual(info.status, 'PROCESSED');
    assert.strictEqual(info.summary, 'Updated beach sidecar summary');
    assert.strictEqual(info.description, 'Crystal clear waters on the shoreline.');
    assert.strictEqual(info.lighting, 'Bright daylight');
    assert.strictEqual(info.environment, 'outdoor');
  });
});

