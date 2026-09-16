import { Injectable, Logger, BadRequestException, Inject } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { DatabaseService } from '../database/database.service.js';
import { MediaService } from '../media/media.service.js';
import { LogBufferService } from '../logging/log-buffer.service.js';
import { isDirectTagWritable, writeMediaTagsDirectly } from '../media/media-metadata-writer.js';
import {
  OrganizationCriteria,
  OrganizationJobStatus,
  OrganizationItemDto,
  ContentCategory,
} from './organize.types.js';

const MONTH_NAMES_RU: Record<number, string> = {
  1: '01 - Январь',
  2: '02 - Февраль',
  3: '03 - Март',
  4: '04 - Апрель',
  5: '05 - Май',
  6: '06 - Июнь',
  7: '07 - Июль',
  8: '08 - Август',
  9: '09 - Сентябрь',
  10: '10 - Октябрь',
  11: '11 - Ноябрь',
  12: '12 - Декабрь',
};

const CATEGORY_NAMES_RU: Record<string, string> = {
  documents: 'Документы',
  social: 'Соцсети',
  nature: 'Природа',
  animals: 'Животные',
  screenshots: 'Скриншоты',
  non_family: 'Не семейное',
  other: 'Разное',
};

@Injectable()
export class OrganizeService {
  private readonly logger = new Logger(OrganizeService.name);
  private isRunning = false;
  private cancelRequested = false;
  private activeJobId: string | null = null;

  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(MediaService) private readonly mediaService: MediaService,
    @Inject(LogBufferService) private readonly logBuffer: LogBufferService,
  ) {}

  public getScanStatus(jobId?: string): OrganizationJobStatus {
    const job = this.db.getOrganizationJob(jobId || this.activeJobId || undefined);
    if (!job) {
      return {
        id: '',
        status: 'idle',
        mode: 'semi_automatic',
        criteria: {},
        total_files: 0,
        processed_files: 0,
        percent: 0,
        message: 'No organization job has run yet.',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    }

    let parsedCriteria: OrganizationCriteria = {};
    try {
      parsedCriteria = typeof job.criteria === 'string' ? JSON.parse(job.criteria) : job.criteria;
    } catch {
      parsedCriteria = {};
    }

    return {
      id: job.id,
      status: job.status,
      mode: job.mode,
      criteria: parsedCriteria,
      total_files: Number(job.total_files) || 0,
      processed_files: Number(job.processed_files) || 0,
      percent: Number(job.percent) || 0,
      current_file: job.current_file || undefined,
      message: job.message || undefined,
      error: job.error || undefined,
      created_at: job.created_at,
      updated_at: job.updated_at,
    };
  }

  public async startJob(options: {
    mode: 'automatic' | 'semi_automatic';
    criteria: OrganizationCriteria;
  }): Promise<OrganizationJobStatus> {
    if (this.isRunning) {
      throw new BadRequestException('An organization job is already in progress.');
    }

    const latest = this.db.getOrganizationJob();
    if (latest && (latest.status === 'analyzing' || latest.status === 'applying')) {
      throw new BadRequestException('An organization job is currently active in the background.');
    }

    const jobId = `org_${Date.now()}`;
    this.activeJobId = jobId;
    this.cancelRequested = false;
    this.isRunning = true;

    if (options.criteria.resetPrevious && latest) {
      this.db.clearOrganizationJob(latest.id);
    }

    this.db.createOrganizationJob({
      id: jobId,
      mode: options.mode || 'semi_automatic',
      criteria: JSON.stringify(options.criteria || {}),
      status: 'analyzing',
    });

    this.logBuffer.info('Organize', `Started organization job ${jobId} (Mode: ${options.mode})`);

    // Run in background without awaiting
    this.runAnalysisAsync(jobId, options.mode, options.criteria).catch((err) => {
      this.logger.error(`Error in organization background execution: ${err.message}`, err.stack);
      this.db.updateOrganizationJob(jobId, {
        status: 'error',
        error: err.message,
        message: 'Organization failed due to an error.',
      });
      this.isRunning = false;
    });

    return this.getScanStatus(jobId);
  }

  public cancelJob(jobId?: string): OrganizationJobStatus {
    const targetId = jobId || this.activeJobId;
    if (this.isRunning) {
      this.cancelRequested = true;
    }
    if (targetId) {
      this.db.updateOrganizationJob(targetId, {
        status: 'cancelled',
        message: 'Job was cancelled by user.',
      });
      this.logBuffer.info('Organize', `Job ${targetId} cancelled by user.`);
    }
    this.isRunning = false;
    return this.getScanStatus(targetId || undefined);
  }

  public getItems(
    jobId: string,
    limit: number = 200,
    offset: number = 0,
    status?: string,
  ): { items: OrganizationItemDto[]; total: number } {
    return this.db.getOrganizationItems(jobId, limit, offset, status);
  }

  public updateItem(
    id: number,
    updates: {
      target_folder?: string;
      target_filename?: string;
      assigned_tags?: string[];
      status?: string;
    },
  ): any {
    const existing = this.db.getOrganizationItemById(id);
    if (!existing) {
      throw new BadRequestException(`Organization item #${id} not found.`);
    }

    let targetPath = existing.target_path;
    const newFolder = updates.target_folder !== undefined ? updates.target_folder : existing.target_folder;
    const newFilename = updates.target_filename !== undefined ? updates.target_filename : existing.target_filename;

    if (newFolder && newFilename) {
      // Calculate target_path if folder or filename changed
      const baseDir = path.dirname(existing.original_path);
      targetPath = path.join(baseDir, newFolder, newFilename);
    }

    return this.db.updateOrganizationItem(id, {
      ...updates,
      target_path: targetPath,
    });
  }

  public async applyPlan(jobId: string): Promise<OrganizationJobStatus> {
    if (this.isRunning) {
      throw new BadRequestException('Another organization process is already active.');
    }

    const job = this.db.getOrganizationJob(jobId);
    if (!job) {
      throw new BadRequestException(`Organization job ${jobId} not found.`);
    }

    let parsedCriteria: OrganizationCriteria = {};
    try {
      parsedCriteria = typeof job.criteria === 'string' ? JSON.parse(job.criteria) : job.criteria;
    } catch {
      parsedCriteria = {};
    }

    this.isRunning = true;
    this.cancelRequested = false;
    this.activeJobId = jobId;

    this.db.updateOrganizationJob(jobId, {
      status: 'applying',
      message: 'Applying approved organization plan...',
    });

    this.applyItemsAsync(jobId, parsedCriteria).catch((err) => {
      this.logger.error(`Error during apply plan: ${err.message}`, err.stack);
      this.db.updateOrganizationJob(jobId, {
        status: 'error',
        error: err.message,
        message: 'Failed to apply organization plan.',
      });
      this.isRunning = false;
    });

    return this.getScanStatus(jobId);
  }

  public async rollbackPlan(jobId: string): Promise<{ rolledBack: number; errors: any[] }> {
    if (this.isRunning) {
      throw new BadRequestException('Cannot rollback while an organization process is active.');
    }

    const items = this.db.getOrganizationItems(jobId, 100000, 0, 'applied');
    let rolledBackCount = 0;
    const errors: any[] = [];

    this.logBuffer.info('Organize', `Starting rollback for job ${jobId} (${items.items.length} items)`);

    for (const item of items.items) {
      if (!item.target_path || !fs.existsSync(item.target_path)) {
        continue;
      }

      try {
        const originalDir = path.dirname(item.original_path);
        if (!fs.existsSync(originalDir)) {
          fs.mkdirSync(originalDir, { recursive: true });
        }

        // Move file back
        try {
          fs.renameSync(item.target_path, item.original_path);
        } catch {
          fs.copyFileSync(item.target_path, item.original_path);
          fs.unlinkSync(item.target_path);
        }

        // Move/update sidecar if present
        const movedSidecar = this.mediaService.findSidecarFile(item.target_path);
        if (movedSidecar && fs.existsSync(movedSidecar)) {
          const originalSidecar = item.original_path + '.json';
          try {
            fs.renameSync(movedSidecar, originalSidecar);
          } catch {
            // ignore
          }
        }

        // Update database media_items
        const sqlite = this.db.getDb();
        sqlite.prepare(`
          UPDATE media_items
          SET file_path = @orig_path, file_name = @orig_name, folder = @orig_folder
          WHERE file_path = @target_path OR id = @media_id
        `).run({
          orig_path: item.original_path,
          orig_name: item.original_filename,
          orig_folder: item.original_folder || null,
          target_path: item.target_path,
          media_id: item.media_id,
        });

        this.db.updateOrganizationItem(item.id, {
          status: 'rolled_back',
        });

        rolledBackCount++;
      } catch (err: any) {
        errors.push({ id: item.id, file: item.target_path, error: err.message });
      }
    }

    this.db.updateOrganizationJob(jobId, {
      status: 'idle',
      message: `Rollback completed: ${rolledBackCount} items restored to original locations.`,
    });

    this.logBuffer.info(
      'Organize',
      `Rollback finished for job ${jobId}. Restored: ${rolledBackCount}, Errors: ${errors.length}`,
    );

    return { rolledBack: rolledBackCount, errors };
  }

  // --- Background Asynchronous Execution ---

  private async runAnalysisAsync(
    jobId: string,
    mode: 'automatic' | 'semi_automatic',
    criteria: OrganizationCriteria,
  ): Promise<void> {
    try {
      const sqlite = this.db.getDb();
      let sql = `
        SELECT m.id, m.file_path, m.file_name, m.folder, m.media_date, m.mtime, m.media_type,
               meta.summary, meta.summary_ru, meta.description, meta.description_ru,
               meta.environment, meta.ocr_text, meta.tags
        FROM media_items m
        LEFT JOIN media_metadata meta ON m.id = meta.media_id
        WHERE m.is_vault = 0
      `;

      const rows = sqlite.prepare(sql).all() as any[];
      const total = rows.length;

      this.db.updateOrganizationJob(jobId, {
        total_files: total,
        processed_files: 0,
        percent: 0,
        status: 'analyzing',
        message: `Analyzing ${total} media files according to criteria...`,
      });

      const batchSize = 25;
      const plannedItems: any[] = [];

      for (let i = 0; i < total; i++) {
        if (this.cancelRequested) {
          this.db.updateOrganizationJob(jobId, {
            status: 'cancelled',
            message: 'Organization analysis cancelled by user.',
          });
          this.isRunning = false;
          return;
        }

        const row = rows[i];
        const classification = this.classifyItem(row, criteria);
        const target = this.computeTarget(row, classification, criteria);

        plannedItems.push({
          job_id: jobId,
          media_id: row.id,
          original_path: row.file_path,
          original_folder: row.folder,
          original_filename: row.file_name,
          target_folder: target.targetFolder,
          target_filename: target.targetFilename,
          target_path: target.targetPath,
          detected_year: classification.year,
          detected_month: classification.month,
          detected_content_type: classification.contentType,
          assigned_tags: target.assignedTags,
          status: 'pending',
        });

        // Batch save to DB & yield event loop
        if (plannedItems.length >= batchSize || i === total - 1) {
          this.db.insertOrganizationItems(plannedItems);
          plannedItems.length = 0;

          const processed = i + 1;
          const percent = Math.round((processed / total) * 100);
          this.db.updateOrganizationJob(jobId, {
            processed_files: processed,
            percent,
            current_file: row.file_name,
          });

          // Yield to Node.js event loop
          await new Promise((resolve) => setImmediate(resolve));
        }
      }

      this.db.updateOrganizationJob(jobId, {
        processed_files: total,
        percent: 100,
        current_file: '',
        status: mode === 'automatic' ? 'applying' : 'ready_for_review',
        message:
          mode === 'automatic'
            ? 'Analysis complete. Starting automatic execution...'
            : `Analysis complete! ${total} files planned. Ready for your review.`,
      });

      if (mode === 'automatic') {
        await this.applyItemsAsync(jobId, criteria);
      } else {
        this.isRunning = false;
      }
    } catch (err: any) {
      this.logger.error(`Failed during analysis phase: ${err.message}`, err.stack);
      this.db.updateOrganizationJob(jobId, {
        status: 'error',
        error: err.message,
        message: `Error during analysis: ${err.message}`,
      });
      this.isRunning = false;
    }
  }

  private async applyItemsAsync(jobId: string, criteria: OrganizationCriteria): Promise<void> {
    try {
      const items = this.db.getOrganizationItems(jobId, 100000, 0, 'pending');
      const total = items.total;
      let processed = 0;

      this.db.updateOrganizationJob(jobId, {
        status: 'applying',
        total_files: total,
        processed_files: 0,
        percent: 0,
        message: `Applying organization changes to ${total} files...`,
      });

      for (const item of items.items) {
        if (this.cancelRequested) {
          this.db.updateOrganizationJob(jobId, {
            status: 'cancelled',
            message: `Execution cancelled by user. Completed ${processed} of ${total} files.`,
          });
          this.isRunning = false;
          return;
        }

        try {
          await this.applySingleItem(item, criteria);
          this.db.updateOrganizationItem(item.id, {
            status: 'applied',
            applied_at: new Date().toISOString(),
          });
        } catch (itemErr: any) {
          this.db.updateOrganizationItem(item.id, {
            status: 'error',
            error: itemErr.message,
          });
        }

        processed++;
        const percent = Math.round((processed / total) * 100);

        if (processed % 10 === 0 || processed === total) {
          this.db.updateOrganizationJob(jobId, {
            processed_files: processed,
            percent,
            current_file: item.original_filename,
          });
          // Yield to event loop
          await new Promise((resolve) => setImmediate(resolve));
        }
      }

      this.db.updateOrganizationJob(jobId, {
        status: 'completed',
        processed_files: total,
        percent: 100,
        message: `Successfully organized ${total} files!`,
      });

      this.logBuffer.info('Organize', `Completed organization job ${jobId}. Processed: ${total} files.`);
      this.isRunning = false;
    } catch (err: any) {
      this.logger.error(`Failed during apply phase: ${err.message}`, err.stack);
      this.db.updateOrganizationJob(jobId, {
        status: 'error',
        error: err.message,
        message: `Error during apply: ${err.message}`,
      });
      this.isRunning = false;
    }
  }

  private async applySingleItem(item: OrganizationItemDto, criteria: OrganizationCriteria): Promise<void> {
    const srcPath = item.original_path;
    if (!fs.existsSync(srcPath)) {
      throw new Error(`Original file not found: ${srcPath}`);
    }

    const targetPath = item.target_path;
    if (!targetPath) {
      throw new Error('Target path is not defined for item');
    }

    // 1. If path is different, move file
    if (path.resolve(srcPath) !== path.resolve(targetPath)) {
      const targetDir = path.dirname(targetPath);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      // Safe move with cross-device copy fallback
      try {
        fs.renameSync(srcPath, targetPath);
      } catch {
        fs.copyFileSync(srcPath, targetPath);
        fs.unlinkSync(srcPath);
      }

      // Also move sidecar JSON if exists
      const existingSidecar = this.mediaService.findSidecarFile(srcPath);
      let targetSidecar: string | null = null;
      if (existingSidecar && fs.existsSync(existingSidecar)) {
        targetSidecar = targetPath + '.json';
        try {
          fs.renameSync(existingSidecar, targetSidecar);
        } catch {
          // ignore
        }
      }

      // Update database media_items
      const sqlite = this.db.getDb();
      sqlite.prepare(`
        UPDATE media_items
        SET file_path = @target_path,
            file_name = @target_filename,
            folder = @target_folder,
            updated_at = datetime('now', 'localtime')
        WHERE id = @media_id OR file_path = @src_path
      `).run({
        target_path: targetPath,
        target_filename: item.target_filename || path.basename(targetPath),
        target_folder: item.target_folder || path.basename(targetDir),
        media_id: item.media_id,
        src_path: srcPath,
      });

      // Update media_hashes if present
      sqlite.prepare(`
        UPDATE media_hashes
        SET file_path = @target_path
        WHERE file_path = @src_path
      `).run({
        target_path: targetPath,
        src_path: srcPath,
      });
    }

    // 2. Assign tags in sidecar & database
    const finalPath = fs.existsSync(targetPath) ? targetPath : srcPath;
    const tags = item.assigned_tags || [];

    if (tags.length > 0) {
      // Save tags in media_metadata
      const sqlite = this.db.getDb();
      const existingMeta = sqlite.prepare(`SELECT tags FROM media_metadata WHERE media_id = ?`).get(item.media_id) as any;
      let existingTags: string[] = [];
      try {
        existingTags = existingMeta && existingMeta.tags ? JSON.parse(existingMeta.tags) : [];
      } catch {
        existingTags = [];
      }

      const mergedTags = Array.from(new Set([...existingTags, ...tags]));
      sqlite.prepare(`
        INSERT INTO media_metadata (media_id, tags)
        VALUES (@media_id, @tags)
        ON CONFLICT(media_id) DO UPDATE SET tags = @tags
      `).run({
        media_id: item.media_id,
        tags: JSON.stringify(mergedTags),
      });

      // 3. Write tags directly into media file in-place without transcoding (including Apple HEIC and HEVC/MP4/MOV videos)
      if (criteria.writeTagsToFile && isDirectTagWritable(finalPath)) {
        try {
          await writeMediaTagsDirectly(finalPath, mergedTags);
        } catch (err: any) {
          this.logger.warn(`Could not write direct tags into ${finalPath}: ${err.message}`);
        }
      }
    }
  }

  // --- Classification Heuristics ---

  private classifyItem(
    row: any,
    _criteria?: OrganizationCriteria,
  ): {
    year: number | null;
    month: number | null;
    contentType: ContentCategory;
  } {
    // 1. Detect Year and Month
    let year: number | null = null;
    let month: number | null = null;

    if (row.media_date) {
      const d = new Date(row.media_date);
      if (!isNaN(d.getTime())) {
        year = d.getFullYear();
        month = d.getMonth() + 1;
      }
    }

    if (!year || !month) {
      // Regex match on filename: YYYYMMDD or YYYY-MM-DD
      const fn = row.file_name || '';
      const match = fn.match(/(19\d\d|20\d\d)[-_]?(0[1-9]|1[0-2])[-_]?(0[1-9]|[12]\d|3[01])/);
      if (match) {
        year = parseInt(match[1], 10);
        month = parseInt(match[2], 10);
      } else if (row.mtime) {
        const d = new Date(row.mtime);
        if (!isNaN(d.getTime())) {
          year = d.getFullYear();
          month = d.getMonth() + 1;
        }
      }
    }

    // 2. Detect Content Type
    const contentType = this.detectContentType(row);

    return { year, month, contentType };
  }

  private detectContentType(row: any): ContentCategory {
    const fn = (row.file_name || '').toLowerCase();
    const fp = (row.file_path || '').toLowerCase();
    const summary = ((row.summary || '') + ' ' + (row.summary_ru || '') + ' ' + (row.description || '') + ' ' + (row.description_ru || '')).toLowerCase();
    const env = (row.environment || '').toLowerCase();
    const ocr = (row.ocr_text || '').toLowerCase();

    // 1. Screenshots
    if (
      fn.includes('screenshot') ||
      fn.includes('screen_shot') ||
      fn.includes('screen-shot') ||
      fn.includes('снимок экрана') ||
      fp.includes('screenshot')
    ) {
      return 'screenshots';
    }

    // 2. Social Networks
    if (
      fn.startsWith('wa') ||
      fn.includes('whatsapp') ||
      fn.includes('telegram') ||
      fn.includes('tg_') ||
      fn.includes('fb_img') ||
      fn.includes('instagram') ||
      fn.includes('viber') ||
      fn.includes('vk_') ||
      fp.includes('whatsapp') ||
      fp.includes('telegram')
    ) {
      return 'social';
    }

    // 3. Documents
    if (
      ocr.length > 25 ||
      fn.includes('doc') ||
      fn.includes('scan') ||
      fn.includes('паспорт') ||
      fn.includes('чек') ||
      fn.includes('счет') ||
      fn.includes('документ') ||
      fn.includes('квитанция') ||
      fn.endsWith('.pdf') ||
      summary.includes('документ') ||
      summary.includes('текст') ||
      summary.includes('паспорт') ||
      summary.includes('квитанция')
    ) {
      return 'documents';
    }

    // 4. Animals
    if (
      summary.includes('кот') ||
      summary.includes('кошка') ||
      summary.includes('собака') ||
      summary.includes('птица') ||
      summary.includes('животное') ||
      summary.includes('щенок') ||
      summary.includes('котенок') ||
      summary.includes('cat') ||
      summary.includes('dog') ||
      summary.includes('animal') ||
      summary.includes('pet') ||
      summary.includes('bird')
    ) {
      return 'animals';
    }

    // 5. Nature
    if (
      env.includes('outdoor') ||
      env.includes('nature') ||
      env.includes('forest') ||
      env.includes('park') ||
      env.includes('beach') ||
      env.includes('sea') ||
      env.includes('lake') ||
      env.includes('mountain') ||
      env.includes('river') ||
      summary.includes('природа') ||
      summary.includes('пейзаж') ||
      summary.includes('закат') ||
      summary.includes('рассвет') ||
      summary.includes('лес') ||
      summary.includes('горы') ||
      summary.includes('море') ||
      summary.includes('пляж') ||
      summary.includes('парк')
    ) {
      return 'nature';
    }

    return 'other';
  }

  private computeTarget(
    row: any,
    classification: { year: number | null; month: number | null; contentType: ContentCategory },
    criteria: OrganizationCriteria,
  ): {
    targetFolder: string;
    targetFilename: string;
    targetPath: string;
    assignedTags: string[];
  } {
    const yearStr = classification.year ? String(classification.year) : 'Unknown_Year';
    const monthStr = classification.month ? (classification.month < 10 ? `0${classification.month}` : String(classification.month)) : 'Unknown_Month';
    const monthName = classification.month ? MONTH_NAMES_RU[classification.month] || monthStr : monthStr;
    const eventStr = criteria.eventName ? criteria.eventName.trim().replace(/[\\/:*?"<>|]/g, '_') : '';
    const contentTypeName = CATEGORY_NAMES_RU[classification.contentType] || 'Разное';

    // Folder template interpolation
    let folderPattern = criteria.folderTemplate || '';
    if (!folderPattern) {
      // Build default sensible folder structure based on toggles
      const parts: string[] = [];
      if (criteria.groupByYear) parts.push(yearStr);
      if (criteria.groupByMonth) parts.push(monthName);
      if (criteria.eventName) parts.push(eventStr);
      if (criteria.contentTypes && criteria.contentTypes.length > 0) parts.push(contentTypeName);
      folderPattern = parts.length > 0 ? parts.join('/') : (row.folder || 'Organized');
    } else {
      folderPattern = folderPattern
        .replace('{year}', yearStr)
        .replace('{month}', monthStr)
        .replace('{month_name}', monthName)
        .replace('{event}', eventStr)
        .replace('{contentType}', contentTypeName);
    }

    // Clean folder slashes
    const cleanFolder = folderPattern
      .split(/[\\/]+/)
      .filter(Boolean)
      .join(path.sep);

    // Filename template interpolation
    const origBase = row.file_name || path.basename(row.file_path);
    const ext = path.extname(origBase);
    const origNoExt = path.basename(origBase, ext);

    let targetFilename = origBase;
    if (criteria.filenameTemplate && criteria.filenameTemplate.trim()) {
      targetFilename = criteria.filenameTemplate
        .replace('{original}', origNoExt)
        .replace('{year}', yearStr)
        .replace('{month}', monthStr)
        .replace('{event}', eventStr)
        .replace('{contentType}', classification.contentType)
        + ext;
    }

    // Calculate full destination path
    let baseDir = criteria.targetBaseFolder?.trim();
    if (!baseDir) {
      baseDir = path.dirname(row.file_path);
    }
    const targetPath = path.join(baseDir, cleanFolder, targetFilename);

    // Compute assigned tags
    const assignedTags: string[] = [];
    if (criteria.assignTags !== false) {
      if (classification.year) assignedTags.push(`Год: ${classification.year}`);
      if (classification.month) assignedTags.push(`Месяц: ${MONTH_NAMES_RU[classification.month] || monthStr}`);
      if (criteria.eventName && criteria.eventName.trim()) assignedTags.push(`Событие: ${criteria.eventName.trim()}`);
      if (classification.contentType) assignedTags.push(`Категория: ${contentTypeName}`);
    }

    return {
      targetFolder: cleanFolder,
      targetFilename,
      targetPath,
      assignedTags,
    };
  }
}
