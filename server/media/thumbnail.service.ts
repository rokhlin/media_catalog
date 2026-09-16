import { Injectable, Logger, Inject } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { spawn } from 'child_process';
import sharp from 'sharp';
import heicConvert from 'heic-convert';
import { AppConfigService } from '../config/config.service.js';

@Injectable()
export class ThumbnailService {
  private readonly logger = new Logger(ThumbnailService.name);
  private cacheDir: string;
  private inFlightGenerations: Map<string, Promise<string>> = new Map();
  private activeJobs = 0;
  private readonly maxConcurrentJobs = 8;
  private jobQueue: Array<() => void> = [];

  private readonly videoExtensions = new Set([
    '.mp4', '.mov', '.avi', '.mkv', '.webm', '.wmv', '.m4v',
    '.flv', '.3gp', '.ts', '.m2ts', '.mts', '.mpg', '.mpeg',
    '.vob', '.ogv', '.hevc'
  ]);

  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {
    const baseOutput = this.config.outputFolder || path.resolve(this.config.projectRoot || process.cwd(), 'media_output');
    this.cacheDir = path.resolve(baseOutput, 'cache', 'thumbnails');
    this.ensureCacheDir();
    this.migrateLegacyThumbnails();
  }

  private ensureCacheDir(): void {
    try {
      if (!fs.existsSync(this.cacheDir)) {
        fs.mkdirSync(this.cacheDir, { recursive: true });
      }
    } catch (err: any) {
      this.logger.warn(`Failed to create thumbnail cache directory: ${err.message}`);
    }
  }

  private migrateLegacyThumbnails(): void {
    try {
      const legacyCacheDir = path.resolve(this.config.projectRoot || process.cwd(), 'data', 'cache', 'thumbnails');
      if (fs.existsSync(legacyCacheDir) && legacyCacheDir !== this.cacheDir) {
        const files = fs.readdirSync(legacyCacheDir);
        for (const file of files) {
          const oldPath = path.join(legacyCacheDir, file);
          const newPath = path.join(this.cacheDir, file);
          if (!fs.existsSync(newPath)) {
            try {
              fs.renameSync(oldPath, newPath);
            } catch {
              fs.copyFileSync(oldPath, newPath);
              fs.unlinkSync(oldPath);
            }
          }
        }
        try {
          fs.rmdirSync(legacyCacheDir);
          const legacyParent = path.dirname(legacyCacheDir);
          if (fs.existsSync(legacyParent) && fs.readdirSync(legacyParent).length === 0) {
            fs.rmdirSync(legacyParent);
          }
        } catch {
          // ignore cleanup errors
        }
      }
    } catch (err: any) {
      this.logger.warn(`Legacy thumbnail migration check failed: ${err.message}`);
    }
  }

  private isVideoFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return this.videoExtensions.has(ext);
  }

  private isHeicFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return ext === '.heic' || ext === '.heif';
  }

  private async acquireSlot(): Promise<void> {
    if (this.activeJobs < this.maxConcurrentJobs) {
      this.activeJobs++;
      return;
    }
    return new Promise<void>((resolve) => {
      this.jobQueue.push(() => {
        this.activeJobs++;
        resolve();
      });
    });
  }

  private releaseSlot(): void {
    this.activeJobs--;
    if (this.jobQueue.length > 0) {
      const next = this.jobQueue.shift();
      if (next) next();
    }
  }

  /**
   * Extract first frame from a video file using FFmpeg and convert to WebP via Sharp.
   */
  private async generateVideoThumbnail(
    sourcePath: string,
    targetSize: number,
    tempPath: string,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      // Fast seek to 0.1s to avoid initial black frames, extract 1 frame
      const ffmpeg = spawn(
        'ffmpeg',
        [
          '-ss', '0.1',
          '-i', sourcePath,
          '-frames:v', '1',
          '-f', 'image2pipe',
          '-vcodec', 'png',
          '-',
        ],
        {
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        }
      );

      const sharpTransform = sharp({ failOn: 'none' })
        .rotate()
        .resize(targetSize, targetSize, {
          fit: 'inside',
          withoutEnlargement: true,
          fastShrinkOnLoad: true,
        })
        .webp({
          quality: 80,
          effort: 4,
        });

      const fileStream = fs.createWriteStream(tempPath);
      let stderrData = '';

      ffmpeg.stderr?.on('data', (chunk) => {
        stderrData += chunk.toString();
        if (stderrData.length > 2000) {
          stderrData = stderrData.slice(-2000);
        }
      });

      fileStream.on('finish', () => {
        resolve();
      });

      fileStream.on('error', (err) => {
        reject(err);
      });

      sharpTransform.on('error', (err) => {
        reject(err);
      });

      ffmpeg.on('error', (err) => {
        reject(new Error(`FFmpeg spawn error: ${err.message}`));
      });

      ffmpeg.on('close', (code) => {
        if (code !== 0 && !fs.existsSync(tempPath)) {
          // If seeking to 0.1s failed, try seeking from t=0s
          this.retryFromStart(sourcePath, targetSize, tempPath)
            .then(resolve)
            .catch(() => reject(new Error(`FFmpeg exited with code ${code}: ${stderrData.slice(-300)}`)));
        }
      });

      ffmpeg.stdout.pipe(sharpTransform).pipe(fileStream);
    });
  }

  /**
   * Fallback extraction at t=0s for ultra-short video clips.
   */
  private async retryFromStart(
    sourcePath: string,
    targetSize: number,
    tempPath: string,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const ffmpeg = spawn(
        'ffmpeg',
        [
          '-i', sourcePath,
          '-frames:v', '1',
          '-f', 'image2pipe',
          '-vcodec', 'png',
          '-',
        ],
        {
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        }
      );

      const sharpTransform = sharp({ failOn: 'none' })
        .rotate()
        .resize(targetSize, targetSize, {
          fit: 'inside',
          withoutEnlargement: true,
          fastShrinkOnLoad: true,
        })
        .webp({
          quality: 80,
          effort: 4,
        });

      const fileStream = fs.createWriteStream(tempPath);

      fileStream.on('finish', () => resolve());
      fileStream.on('error', reject);
      sharpTransform.on('error', reject);
      ffmpeg.on('error', reject);

      ffmpeg.stdout.pipe(sharpTransform).pipe(fileStream);
    });
  }

  /**
   * Decode HEIC/HEIF file to JPEG buffer and convert to WebP via Sharp.
   */
  private async generateHeicThumbnail(
    sourcePath: string,
    targetSize: number,
    tempPath: string,
  ): Promise<void> {
    const inputBuffer = await fs.promises.readFile(sourcePath);
    const jpegBuffer = await (heicConvert as any)({
      buffer: inputBuffer,
      format: 'JPEG',
      quality: 0.92,
    });

    await sharp(jpegBuffer, { failOn: 'none', animated: false })
      .rotate()
      .resize(targetSize, targetSize, {
        fit: 'inside',
        withoutEnlargement: true,
        fastShrinkOnLoad: true,
      })
      .webp({
        quality: 80,
        effort: 4,
      })
      .toFile(tempPath);
  }

  /**
   * Get or generate a cached WebP thumbnail for a given source image or video file.
   * @param sourcePath Absolute path to the original media file
   * @param size Target bounding box dimension in pixels (default 300)
   * @returns Path to the generated WebP thumbnail file
   */
  async getThumbnail(
    sourcePath: string,
    size: number = 300,
  ): Promise<{ filePath: string; isCached: boolean }> {
    const targetSize = Math.max(64, Math.min(size || 300, 1920));

    // Verify source exists
    const stats = await fs.promises.stat(sourcePath);
    if (!stats.isFile()) {
      throw new Error(`Source is not a file: ${sourcePath}`);
    }

    // Generate unique cache key based on path, modification time, file size, and target size
    const cacheKey = crypto
      .createHash('sha1')
      .update(`${sourcePath}:${stats.mtimeMs}:${stats.size}:${targetSize}`)
      .digest('hex');

    const thumbPath = path.join(this.cacheDir, `${cacheKey}.webp`);

    // Check if thumbnail already exists on disk
    try {
      await fs.promises.access(thumbPath, fs.constants.R_OK);
      return { filePath: thumbPath, isCached: true };
    } catch {
      // Cache miss, proceed to generate
    }

    // Deduplicate in-flight generation for the exact same file/size
    const inFlight = this.inFlightGenerations.get(cacheKey);
    if (inFlight) {
      const resultPath = await inFlight;
      return { filePath: resultPath, isCached: true };
    }

    const isVideo = this.isVideoFile(sourcePath);
    const isHeic = this.isHeicFile(sourcePath);

    const generationPromise = (async () => {
      await this.acquireSlot();
      const tempPath = path.join(this.cacheDir, `${cacheKey}.${Date.now()}.tmp.webp`);
      try {
        if (isVideo) {
          await this.generateVideoThumbnail(sourcePath, targetSize, tempPath);
        } else if (isHeic) {
          await this.generateHeicThumbnail(sourcePath, targetSize, tempPath);
        } else {
          try {
            await sharp(sourcePath, { failOn: 'none', animated: false })
              .rotate() // Auto-orient using EXIF orientation tag
              .resize(targetSize, targetSize, {
                fit: 'inside',
                withoutEnlargement: true,
                fastShrinkOnLoad: true,
              })
              .webp({
                quality: 80,
                effort: 4,
              })
              .toFile(tempPath);
          } catch (sharpErr) {
            // If sharp fails to decode an image (e.g., misnamed HEIC or custom container), fallback to HEIC decoder
            try {
              await this.generateHeicThumbnail(sourcePath, targetSize, tempPath);
            } catch {
              throw sharpErr;
            }
          }
        }

        await fs.promises.rename(tempPath, thumbPath);
        return thumbPath;
      } catch (err: any) {
        // Clean up temp file on error
        try {
          if (fs.existsSync(tempPath)) {
            await fs.promises.unlink(tempPath);
          }
        } catch {
          // ignore cleanup error
        }
        this.logger.error(`Failed to generate thumbnail for ${sourcePath}: ${err.message}`);
        throw err;
      } finally {
        this.releaseSlot();
        this.inFlightGenerations.delete(cacheKey);
      }
    })();

    this.inFlightGenerations.set(cacheKey, generationPromise);
    const resultPath = await generationPromise;
    return { filePath: resultPath, isCached: false };
  }
}
