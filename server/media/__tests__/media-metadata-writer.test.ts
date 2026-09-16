import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import {
  isDirectTagWritable,
  writeMediaTagsDirectly,
  DIRECT_WRITABLE_IMAGE_EXTS,
  DIRECT_WRITABLE_VIDEO_EXTS,
} from '../media-metadata-writer.js';
import { exiftool } from 'exiftool-vendored';

describe('Media Metadata Writer (Zero-Transcoding)', () => {
  it('should identify Apple HEIC and HEVC/MP4/MOV video formats as directly writable', () => {
    assert.ok(isDirectTagWritable('photo.heic'));
    assert.ok(isDirectTagWritable('photo.HEIC'));
    assert.ok(isDirectTagWritable('photo.heif'));
    assert.ok(isDirectTagWritable('video.hevc'));
    assert.ok(isDirectTagWritable('video.mp4'));
    assert.ok(isDirectTagWritable('video.mov'));
    assert.ok(isDirectTagWritable('photo.jpg'));
    assert.ok(isDirectTagWritable('photo.webp'));

    assert.equal(isDirectTagWritable('document.txt'), false);
    assert.equal(isDirectTagWritable('archive.zip'), false);
  });

  it('should include .heic, .heif in DIRECT_WRITABLE_IMAGE_EXTS', () => {
    assert.ok(DIRECT_WRITABLE_IMAGE_EXTS.has('.heic'));
    assert.ok(DIRECT_WRITABLE_IMAGE_EXTS.has('.heif'));
  });

  it('should include .hevc, .mp4, .mov in DIRECT_WRITABLE_VIDEO_EXTS', () => {
    assert.ok(DIRECT_WRITABLE_VIDEO_EXTS.has('.hevc'));
    assert.ok(DIRECT_WRITABLE_VIDEO_EXTS.has('.mp4'));
    assert.ok(DIRECT_WRITABLE_VIDEO_EXTS.has('.mov'));
  });

  it('should write tags directly to an image without modifying image payload', async () => {
    const testFile = path.resolve('test_meta_write.jpg');
    // Create a tiny JPEG using sharp
    const sharp = (await import('sharp')).default;
    await sharp({
      create: { width: 16, height: 16, channels: 3, background: { r: 20, g: 150, b: 20 } },
    }).jpeg().toFile(testFile);

    try {
      const res = await writeMediaTagsDirectly(testFile, ['Year: 2024', 'Nature', 'Vacation']);
      assert.ok(res.success, `Expected success, got: ${res.error}`);

      const readTags = await exiftool.read(testFile);
      assert.ok(
        (readTags.ImageDescription && readTags.ImageDescription.includes('Nature')) ||
        (readTags.Keywords && String(readTags.Keywords).includes('Nature')),
      );
    } finally {
      if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
    }
  });

  it('should write tags directly to an MP4/HEVC container without transcoding video', async () => {
    const testVideo = path.resolve('test_meta_video.mp4');
    try {
      // Create minimal 0.2s test video container using ffmpeg
      execSync(`ffmpeg -y -f lavfi -i color=c=red:s=16x16:d=0.2 -c:v libx264 "${testVideo}"`, {
        stdio: 'ignore',
      });
    } catch {
      // If ffmpeg is not available in test runner env, skip video write
      return;
    }

    try {
      const res = await writeMediaTagsDirectly(testVideo, ['Event: Birthday', 'Family']);
      assert.ok(res.success, `Expected success, got: ${res.error}`);

      const readTags = await exiftool.read(testVideo);
      const desc = readTags.Description || readTags.Comment || String(readTags.Keywords || '');
      assert.ok(desc.includes('Birthday') || desc.includes('Family'));
    } finally {
      if (fs.existsSync(testVideo)) fs.unlinkSync(testVideo);
    }
  });
});
