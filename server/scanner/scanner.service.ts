import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AppConfigService } from '../config/config.service.js';
import { DatabaseService } from '../database/database.service.js';
import * as fs from 'fs';
import * as path from 'path';
import xxhash from 'xxhash-wasm';

@Injectable()
export class ScannerService {
  private readonly logger = new Logger(ScannerService.name);
  private hasher: any;

  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService,
    @Inject(DatabaseService) private readonly dbService: DatabaseService,
  ) {
    this.initHasher();
  }

  private async initHasher() {
    this.hasher = await xxhash();
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleCron() {
    this.logger.log('Starting daily media scan...');
    const inputFolders = this.config.inputFolders;
    for (const folder of inputFolders) {
      if (fs.existsSync(folder)) {
        await this.scanDirectory(folder);
      } else {
        this.logger.warn(`Input folder not found: ${folder}`);
      }
    }
    this.logger.log('Daily media scan completed.');
  }

  private async scanDirectory(dir: string) {
    this.logger.log(`Scanning directory: ${dir}`);
    try {
      const files = await fs.promises.readdir(dir, { withFileTypes: true });
      for (const file of files) {
        const fullPath = path.join(dir, file.name);
        if (file.isDirectory()) {
          await this.scanDirectory(fullPath);
        } else if (file.isFile()) {
          await this.processFile(fullPath);
        }
      }
    } catch (err) {
      this.logger.error(`Error scanning directory ${dir}: ${err}`);
    }
  }

  private async processFile(filePath: string) {
    const ext = path.extname(filePath).toLowerCase();
    const isImage = this.config.supportedPhotoExts.has(ext);
    const isVideo = this.config.supportedVideoExts.has(ext);

    if (!isImage && !isVideo) return;

    try {
      const stat = await fs.promises.stat(filePath);
      const mtime = stat.mtimeMs;
      const size = stat.size;

      const db = this.dbService.getDb();
      const existing = db.prepare('SELECT mtime, file_size, content_hash FROM media_hashes WHERE file_path = ?').get(filePath) as any;

      if (!existing || existing.mtime !== mtime || existing.file_size !== size) {
        this.logger.log(`Updating hash for: ${filePath}`);
        // Read file and compute hash
        const buffer = await fs.promises.readFile(filePath);
        // Using xxhash-wasm (h32 is synchronous but init is async)
        const hash = this.hasher.h32ToString(buffer);

        // Update DB
        const stmt = db.prepare(`
          INSERT INTO media_hashes (file_path, content_hash, file_size, mtime, created_at)
          VALUES (?, ?, ?, ?, datetime('now', 'localtime'))
          ON CONFLICT(file_path) DO UPDATE SET
            content_hash = excluded.content_hash,
            file_size = excluded.file_size,
            mtime = excluded.mtime,
            created_at = excluded.created_at
        `);
        stmt.run(filePath, hash, size, mtime);

        // Generate thumbnail if image
        if (isImage) {
          await this.generateThumbnail(filePath);
        }
      }
    } catch (err) {
      this.logger.error(`Failed to process file ${filePath}: ${err}`);
    }
  }

  private async generateThumbnail(filePath: string) {
    try {
      const sharp = (await import('sharp')).default;
      const thumbDir = path.join(this.config.outputFolder, 'thumbnails');
      if (!fs.existsSync(thumbDir)) {
        await fs.promises.mkdir(thumbDir, { recursive: true });
      }

      const fileName = path.basename(filePath);
      const thumbPath = path.join(thumbDir, `${fileName}.webp`);

      if (!fs.existsSync(thumbPath)) {
        await sharp(filePath)
          .resize(300, 300, { fit: 'inside' })
          .webp({ quality: 80 })
          .toFile(thumbPath);
        this.logger.log(`Generated thumbnail for ${filePath}`);
      }
    } catch (err) {
      this.logger.warn(`Failed to generate thumbnail for ${filePath}: ${err}`);
    }
  }
}
