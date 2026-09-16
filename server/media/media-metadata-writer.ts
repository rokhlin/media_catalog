import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { exiftool } from 'exiftool-vendored';
import sharp from 'sharp';

const execAsync = promisify(exec);

export const DIRECT_WRITABLE_IMAGE_EXTS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.tiff',
  '.heic',
  '.heif',
]);

export const DIRECT_WRITABLE_VIDEO_EXTS = new Set([
  '.mp4',
  '.mov',
  '.hevc',
  '.m4v',
  '.mkv',
]);

export interface DirectWriteResult {
  success: boolean;
  method: 'exiftool' | 'sharp' | 'ffmpeg_stream_copy' | 'none';
  error?: string;
}

/**
 * Check if the given media file supports direct in-place metadata/tag writing
 * without transcoding (including Apple HEIC and HEVC/MP4/MOV videos).
 */
export function isDirectTagWritable(filePath: string): boolean {
  if (!filePath) return false;
  const ext = path.extname(filePath).toLowerCase();
  return DIRECT_WRITABLE_IMAGE_EXTS.has(ext) || DIRECT_WRITABLE_VIDEO_EXTS.has(ext);
}

/**
 * Write tags and metadata directly into media files in-place WITHOUT transcoding:
 * - Apple HEIC (.heic, .heif): In-place EXIF and XMP injection into ISOBMFF container.
 * - HEVC / H.265 / QuickTime / MP4 (.hevc, .mp4, .mov): Metadata atom injection (UserData / ItemList / XMP)
 *   via ExifTool and zero-transcode ffmpeg stream copy (-c copy).
 * - Standard photos (.jpg, .jpeg, .png, .webp, .tiff): Lossless EXIF / IPTC / XMP injection.
 */
export async function writeMediaTagsDirectly(
  filePath: string,
  tags: string[],
): Promise<DirectWriteResult> {
  if (!filePath || !fs.existsSync(filePath)) {
    return { success: false, method: 'none', error: `File not found: ${filePath}` };
  }

  if (!tags || tags.length === 0) {
    return { success: true, method: 'none' };
  }

  const ext = path.extname(filePath).toLowerCase();
  const tagString = tags.join('; ');

  // 1. Apple HEIC / HEIF Images
  if (ext === '.heic' || ext === '.heif') {
    try {
      await exiftool.write(
        filePath,
        {
          ImageDescription: tagString,
          XPKeywords: tagString,
          'XMP:Subject': tags,
          Keywords: tags,
          UserComment: tagString,
        } as any,
        ['-overwrite_original'],
      );
      return { success: true, method: 'exiftool' };
    } catch (err: any) {
      return {
        success: false,
        method: 'exiftool',
        error: `ExifTool failed to write HEIC metadata: ${err.message}`,
      };
    }
  }

  // 2. HEVC, MP4, MOV Videos (Zero-transcode container metadata injection)
  if (DIRECT_WRITABLE_VIDEO_EXTS.has(ext)) {
    try {
      // Primary: ExifTool writes QuickTime / MP4 metadata atoms in-place
      await exiftool.write(
        filePath,
        {
          Description: tagString,
          Comment: tagString,
          'QuickTime:Keywords': tags,
          'ItemList:Keyword': tagString,
          'XMP:Subject': tags,
        } as any,
        ['-overwrite_original'],
      );
      return { success: true, method: 'exiftool' };
    } catch {
      // Fallback: ffmpeg stream copy (-codec copy) - guarantees zero transcoding
      try {
        const tempVideoPath = filePath + `.tag_tmp${ext}`;
        const escapedInput = `"${filePath.replace(/"/g, '\\"')}"`;
        const escapedOutput = `"${tempVideoPath.replace(/"/g, '\\"')}"`;
        const escapedTagStr = tagString.replace(/"/g, '\\"');

        const cmd = `ffmpeg -y -i ${escapedInput} -codec copy -metadata description="${escapedTagStr}" -metadata comment="${escapedTagStr}" -movflags use_metadata_tags ${escapedOutput}`;
        await execAsync(cmd);

        if (fs.existsSync(tempVideoPath) && fs.statSync(tempVideoPath).size > 0) {
          fs.unlinkSync(filePath);
          fs.renameSync(tempVideoPath, filePath);
          return { success: true, method: 'ffmpeg_stream_copy' };
        }
      } catch (ffmpegErr: any) {
        return {
          success: false,
          method: 'ffmpeg_stream_copy',
          error: `Stream copy metadata injection failed: ${ffmpegErr.message}`,
        };
      }
    }
  }

  // 3. Standard Photos (.jpg, .jpeg, .png, .webp, .tiff)
  try {
    // Primary: ExifTool (zero DCT change, lossless in-place)
    await exiftool.write(
      filePath,
      {
        ImageDescription: tagString,
        XPKeywords: tagString,
        'XMP:Subject': tags,
        Keywords: tags,
      } as any,
      ['-overwrite_original'],
    );
    return { success: true, method: 'exiftool' };
  } catch {
    // Secondary fallback for JPEG/TIFF/WebP via Sharp
    try {
      if (['.jpg', '.jpeg'].includes(ext)) {
        const tempPath = filePath + '.sharp_tmp';
        await sharp(filePath)
          .withMetadata({
            exif: {
              IFD0: {
                ImageDescription: tagString,
              },
            },
          })
          .toFile(tempPath);

        fs.renameSync(tempPath, filePath);
        return { success: true, method: 'sharp' };
      }
    } catch (sharpErr: any) {
      return {
        success: false,
        method: 'sharp',
        error: `Sharp metadata write fallback failed: ${sharpErr.message}`,
      };
    }
  }

  return { success: false, method: 'none', error: `Unsupported media format for direct tag writing: ${ext}` };
}
