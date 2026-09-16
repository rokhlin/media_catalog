import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import sharp from 'sharp';
import { ThumbnailService } from '../thumbnail.service.js';
import { AppConfigService } from '../../config/config.service.js';

describe('ThumbnailService', () => {
  let thumbnailService: ThumbnailService;
  let tmpDir: string;
  let testImagePath: string;

  before(async () => {
    tmpDir = path.join(process.cwd(), 'media_output', `test_thumb_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`);
    fs.mkdirSync(tmpDir, { recursive: true });

    // Create a real 800x600 test JPEG using sharp
    testImagePath = path.join(tmpDir, 'test_sample.jpg');
    await sharp({
      create: {
        width: 800,
        height: 600,
        channels: 3,
        background: { r: 100, g: 150, b: 200 },
      },
    })
      .jpeg()
      .toFile(testImagePath);

    const mockConfig = {
      projectRoot: tmpDir,
      outputFolder: tmpDir,
    } as unknown as AppConfigService;

    thumbnailService = new ThumbnailService(mockConfig);
  });

  after(() => {
    try {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch {
      // ignore
    }
  });

  it('should generate a WebP thumbnail for a valid image', async () => {
    const res = await thumbnailService.getThumbnail(testImagePath, 200);
    assert.strictEqual(res.isCached, false);
    assert.ok(fs.existsSync(res.filePath));
    assert.ok(res.filePath.endsWith('.webp'));

    const meta = await sharp(res.filePath).metadata();
    assert.strictEqual(meta.format, 'webp');
    assert.ok((meta.width || 0) <= 200);
    assert.ok((meta.height || 0) <= 200);
  });

  it('should return cached thumbnail on subsequent requests', async () => {
    const res = await thumbnailService.getThumbnail(testImagePath, 200);
    assert.strictEqual(res.isCached, true);
    assert.ok(fs.existsSync(res.filePath));
  });

  it('should handle different thumbnail sizes independently', async () => {
    const res100 = await thumbnailService.getThumbnail(testImagePath, 100);
    assert.strictEqual(res100.isCached, false);
    const meta100 = await sharp(res100.filePath).metadata();
    assert.ok((meta100.width || 0) <= 100);
  });

  it('should recognize .heic and .heif file extensions', () => {
    const isHeic = (thumbnailService as any).isHeicFile('photo.heic');
    const isHeif = (thumbnailService as any).isHeicFile('/path/to/image.HEIF');
    const isJpg = (thumbnailService as any).isHeicFile('photo.jpg');

    assert.strictEqual(isHeic, true);
    assert.strictEqual(isHeif, true);
    assert.strictEqual(isJpg, false);
  });
});
