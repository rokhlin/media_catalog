import { Injectable, NotFoundException, BadRequestException, Logger, Inject, Optional, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { AppConfigService } from '../config/config.service.js';
import { DatabaseService } from '../database/database.service.js';
import { FamilyTreePublicService } from '../family-tree/family-tree-public.service.js';
import { UpdateMediaMetadataDto } from './dto/media.dto.js';

export interface ScannedMediaFile {
  filePath: string;
  folder: string;
}

export interface ScanStatusInfo {
  is_scanning: boolean;
  scanned_count: number;
  current_file: string | null;
  current_filename: string | null;
  current_folder: string | null;
  started_at: number | null;
  elapsed_ms: number;
  total_known: number;
}

export function computeNextScheduledRecache(scheduleTime: string): string {
  const parts = (scheduleTime || '03:00').split(':');
  const hours = parseInt(parts[0], 10) || 3;
  const minutes = parseInt(parts[1], 10) || 0;
  const next = new Date();
  next.setHours(hours, minutes, 0, 0);
  if (next.getTime() <= Date.now()) {
    next.setDate(next.getDate() + 1);
  }
  return next.toISOString();
}

@Injectable()
export class MediaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService,
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Optional() @Inject(FamilyTreePublicService) private readonly familyTreePublicService?: FamilyTreePublicService,
  ) {}

  private cachedMediaList: any[] | null = null;
  private cacheTimestamp: number = 0;
  private readonly CACHE_TTL_MS = 86400000; // 24 hours cache TTL (persisted in SQLite, daily incremental sync)
  private sidecarCache: Map<string, { mtime: number; data: any }> = new Map();
  private filePathMap: Map<string, string> = new Map();
  private baseNamePathMap: Map<string, string> = new Map();
  private automationTimer: NodeJS.Timeout | null = null;
  private hasInitialScanRun = false;

  private hydrateItemsFromPersisted(rows: any[]): any[] {
    const faceCounts = this.db.getFacesCountBySourceFile();
    const allFacesByFile = this.db.getAllFacesBySourceFile();

    return rows.map((r) => {
      const ext = path.extname(r.file_path || r.filename || '').toLowerCase();
      const isVideo = this.config.supportedVideoExts.has(ext) || r.media_type === 'video';
      const isImage = this.config.supportedPhotoExts.has(ext) || r.media_type === 'photo';
      const fileFaces = allFacesByFile[r.file_path] || [];
      const faceNames = fileFaces.map((f: any) => f.name || f.person_name).filter(Boolean);

      return {
        file_path: r.file_path,
        filename: r.filename || path.basename(r.file_path),
        folder: r.folder,
        file_size: r.file_size,
        mtime: r.mtime,
        capture_date: r.media_date,
        media_date: r.media_date,
        phash: r.phash,
        is_video: isVideo,
        is_image: isImage,
        status: r.status || 'PROCESSED',
        sidecar_path: r.sidecar_path,
        description: r.description,
        description_ru: r.description_ru,
        summary: r.summary,
        summary_ru: r.summary_ru,
        environment: r.environment,
        lighting: r.lighting,
        lighting_ru: r.lighting_ru,
        weather: r.weather,
        weather_ru: r.weather_ru,
        time_of_day: r.time_of_day,
        time_of_day_ru: r.time_of_day_ru,
        ocr_text: r.ocr_text,
        exif_analysis: r.exif_analysis,
        exif_analysis_ru: r.exif_analysis_ru,
        transcription: r.transcription,
        transcription_ru: r.transcription_ru,
        timeline_events: r.timeline_events,
        camera_make: r.camera_make,
        camera_model: r.camera_model,
        location_name: r.location_name,
        face_count: fileFaces.length || faceCounts[r.file_path] || 0,
        faces: fileFaces,
        face_names: faceNames,
        has_unassigned_faces: fileFaces.some((f: any) => !f.is_reference || f.name?.startsWith('face_')),
        modules_status: r.modules_status ? (typeof r.modules_status === 'string' ? JSON.parse(r.modules_status) : r.modules_status) : {
          transcribe: r.media_type === 'video' ? Boolean(r.transcription) : null,
          faces: fileFaces.length > 0 || faceNames.length > 0,
          duplicates: Boolean(r.phash),
          vision: Boolean(r.summary || r.description),
        },
        is_vault: Boolean(r.is_vault),
        error_message: null,
      };
    });
  }

  onModuleInit() {
    this.startDailyAutomation();
  }

  onModuleDestroy() {
    if (this.automationTimer) {
      clearInterval(this.automationTimer);
      this.automationTimer = null;
    }
  }

  private scanStatus: ScanStatusInfo = {
    is_scanning: false,
    scanned_count: 0,
    current_file: null,
    current_filename: null,
    current_folder: null,
    started_at: null,
    elapsed_ms: 0,
    total_known: 0,
  };

  /**
   * Get real-time folder scanning and indexing status
   */
  getScanStatus(): ScanStatusInfo {
    const elapsed = this.scanStatus.started_at ? Date.now() - this.scanStatus.started_at : 0;
    return {
      ...this.scanStatus,
      elapsed_ms: elapsed,
      total_known: this.cachedMediaList ? this.cachedMediaList.length : this.scanStatus.scanned_count,
    };
  }

  /**
   * Register a resolved media file path in fast in-memory lookup indices.
   */
  registerIndexedFile(filePath: string, baseFolder?: string): void {
    if (!filePath) return;
    const norm = filePath.replace(/\\/g, '/');
    const baseName = path.basename(filePath).toLowerCase();
    this.filePathMap.set(filePath, filePath);
    this.filePathMap.set(norm, filePath);
    this.filePathMap.set(filePath.toLowerCase(), filePath);
    this.filePathMap.set(norm.toLowerCase(), filePath);
    this.baseNamePathMap.set(baseName, filePath);

    if (baseFolder) {
      try {
        const rel = path.relative(baseFolder, filePath).replace(/\\/g, '/');
        if (rel && !rel.startsWith('..')) {
          this.filePathMap.set(rel, filePath);
          this.filePathMap.set(rel.toLowerCase(), filePath);
        }
      } catch {
        // ignore relative path errors
      }
    }
  }

  /**
   * Check if a given file path belongs to secret vault
   */
  isVaultPath(filePath: string): boolean {
    if (!filePath) return false;
    const norm = filePath.replace(/\\/g, '/');
    if (this.db.isItemInVault(filePath) || this.db.isItemInVault(norm)) {
      return true;
    }
    const config = this.db.getVaultConfig();
    const vaultFolder = config?.vault_folder;
    if (vaultFolder && vaultFolder.trim()) {
      const normFolder = vaultFolder.replace(/\\/g, '/').toLowerCase();
      const normPathLower = norm.toLowerCase();
      if (
        normPathLower.includes(`/${normFolder}/`) ||
        normPathLower.startsWith(`${normFolder}/`) ||
        normPathLower.endsWith(`/${normFolder}`) ||
        path.basename(path.dirname(norm)).toLowerCase() === normFolder
      ) {
        return true;
      }
    }
    const parts = norm.toLowerCase().split('/');
    if (parts.some((p) => p === '.vault' || p === 'vault' || p === '_vault')) {
      return true;
    }
    return false;
  }

  /**
   * Invalidate in-memory scan cache
   */
  invalidateCache(): void {
    this.cachedMediaList = null;
    this.cacheTimestamp = 0;
    this.hasInitialScanRun = false;
    this.sidecarCache.clear();
    this.filePathMap.clear();
    this.baseNamePathMap.clear();
    this.scanStatus.is_scanning = false;
    this.scanStatus.current_file = null;
    this.scanStatus.current_filename = null;
  }

  /**
   * Get real-time caching status, performance metrics, and automation state
   */
  getCacheStatus(): {
    status: 'warm' | 'indexing' | 'idle';
    total_cached_files: number;
    memory_cached_count: number;
    cache_timestamp: number;
    last_cached_at: string | null;
    next_scheduled_recache: string | null;
    daily_automation_enabled: boolean;
    daily_schedule_time: string;
    incremental_only: boolean;
    last_run_duration_ms: number;
    input_folders: string[];
    indexed_folders: Array<{ folder: string; count: number }>;
  } {
    const strategy = this.db.getCacheStrategyConfig();
    const isScanning = this.scanStatus.is_scanning;
    const memCount = this.cachedMediaList ? this.cachedMediaList.length : 0;
    const status: 'warm' | 'indexing' | 'idle' = isScanning ? 'indexing' : memCount > 0 ? 'warm' : 'idle';

    // Folder counts
    const folderMap = new Map<string, number>();
    if (this.cachedMediaList) {
      for (const item of this.cachedMediaList) {
        const f = item.folder || 'Unknown';
        folderMap.set(f, (folderMap.get(f) || 0) + 1);
      }
    }
    const indexedFolders = Array.from(folderMap.entries()).map(([folder, count]) => ({ folder, count }));

    return {
      status,
      total_cached_files: memCount || strategy.last_cached_count || 0,
      memory_cached_count: memCount,
      cache_timestamp: this.cacheTimestamp,
      last_cached_at: strategy.last_cached_at,
      next_scheduled_recache: strategy.next_scheduled_recache || (strategy.daily_automation_enabled ? computeNextScheduledRecache(strategy.daily_schedule_time) : null),
      daily_automation_enabled: strategy.daily_automation_enabled,
      daily_schedule_time: strategy.daily_schedule_time,
      incremental_only: strategy.incremental_only,
      last_run_duration_ms: strategy.last_run_duration_ms,
      input_folders: this.config.inputFolders,
      indexed_folders: indexedFolders,
    };
  }

  /**
   * Save caching strategy settings and schedule next recache
   */
  saveCacheStrategy(config: {
    daily_automation_enabled?: boolean;
    daily_schedule_time?: string;
    incremental_only?: boolean;
  }) {
    const updated = this.db.saveCacheStrategyConfig(config);
    if (updated.daily_automation_enabled) {
      const nextDate = computeNextScheduledRecache(updated.daily_schedule_time);
      this.db.updateCacheStats({ next_scheduled_recache: nextDate });
    }
    return this.getCacheStatus();
  }

  /**
   * Manual or automated recache of files (for all folders or a specific folder, incremental or full)
   */
  async recache(options: { folder?: string; incremental?: boolean } = {}): Promise<{
    status: string;
    total_cached: number;
    duration_ms: number;
    folder?: string;
  }> {
    const start = Date.now();
    this.logger.log(`Recache initiated (folder=${options.folder || 'ALL'}, incremental=${Boolean(options.incremental)})`);

    const isIncremental = Boolean(options.incremental);
    const targetFolder = options.folder && options.folder.trim() ? options.folder.trim() : undefined;

    await this.buildMediaIndex(true, targetFolder, isIncremental);
    const duration = Date.now() - start;
    const total = this.cachedMediaList ? this.cachedMediaList.length : 0;
    const strategy = this.db.getCacheStrategyConfig();

    const nowIso = new Date().toISOString();
    const nextRecache = strategy.daily_automation_enabled ? computeNextScheduledRecache(strategy.daily_schedule_time) : null;
    this.db.updateCacheStats({
      last_cached_at: nowIso,
      next_scheduled_recache: nextRecache || undefined,
      last_run_duration_ms: duration,
      last_cached_count: total,
    });

    return {
      status: 'success',
      total_cached: total,
      duration_ms: duration,
      folder: targetFolder,
    };
  }

  /**
   * Recalculate and update the cache for remaining files after duplicate file(s) are deleted.
   * Keeps remaining files warm in memory and updates indices.
   */
  recalculateCacheAfterDeletion(deletedPaths: string[]): void {
    if (!deletedPaths || deletedPaths.length === 0) return;
    const deletedNorms = new Set(deletedPaths.map((p) => p.replace(/\\/g, '/').toLowerCase()));

    // 1. Delete from SQLite in an atomic transaction
    try {
      this.db.deleteMediaItemsBatch(deletedPaths);
    } catch (e) {
      this.logger.warn(`Failed deleting media items from database: ${e}`);
    }

    // 2. Update in-memory cache
    if (this.cachedMediaList) {
      this.cachedMediaList = this.cachedMediaList.filter((item) => {
        const itemNorm = (item.file_path || '').replace(/\\/g, '/').toLowerCase();
        return !deletedNorms.has(itemNorm);
      });
      this.cacheTimestamp = Date.now();
      this.scanStatus.scanned_count = this.cachedMediaList.length;
    } else {
      // Hydrate from SQLite if cache was empty rather than running a full disk scan
      const persisted = this.db.getAllPersistedMediaItems();
      if (persisted && persisted.length > 0) {
        this.cachedMediaList = persisted;
        this.cacheTimestamp = Date.now();
        this.scanStatus.scanned_count = persisted.length;
      }
    }

    for (const dp of deletedPaths) {
      const norm = dp.replace(/\\/g, '/');
      const base = path.basename(dp).toLowerCase();
      this.filePathMap.delete(dp);
      this.filePathMap.delete(norm);
      this.filePathMap.delete(dp.toLowerCase());
      this.filePathMap.delete(norm.toLowerCase());
      if (this.baseNamePathMap.get(base) === dp || this.baseNamePathMap.get(base) === norm) {
        this.baseNamePathMap.delete(base);
      }
      this.sidecarCache.delete(dp);
      this.sidecarCache.delete(norm);
    }

    const currentTotal = this.cachedMediaList ? this.cachedMediaList.length : 0;
    this.db.updateCacheStats({ last_cached_count: currentTotal });

    this.logger.log(`Recalculated cache after deleting ${deletedPaths.length} file(s). Remaining cache items: ${currentTotal}`);
  }

  /**
   * Recalculate cache after input folders are removed or renamed.
   * Filters out deleted folder paths and updates renamed folders in-place.
   */
  recalculateCacheAfterFolderChange(change: {
    removedFolders?: string[];
    renamedFolders?: Array<{ oldPath: string; newPath: string }>;
  }): void {
    const { removedFolders = [], renamedFolders = [] } = change;
    if (removedFolders.length === 0 && renamedFolders.length === 0) return;

    if (this.cachedMediaList) {
      const normRemoved = removedFolders.map((f) => f.replace(/\\/g, '/').toLowerCase().replace(/\/+$/, ''));

      // Filter out removed folders
      if (normRemoved.length > 0) {
        this.cachedMediaList = this.cachedMediaList.filter((item) => {
          const itemPath = (item.file_path || '').replace(/\\/g, '/').toLowerCase();
          const itemFolder = (item.folder || '').replace(/\\/g, '/').toLowerCase().replace(/\/+$/, '');
          return !normRemoved.some((rf) => itemPath.startsWith(rf + '/') || itemFolder === rf);
        });
      }

      // Update renamed folders
      for (const { oldPath, newPath } of renamedFolders) {
        const normOld = oldPath.replace(/\\/g, '/').toLowerCase().replace(/\/+$/, '');
        for (const item of this.cachedMediaList) {
          const itemPathNorm = (item.file_path || '').replace(/\\/g, '/').toLowerCase();
          const itemFolderNorm = (item.folder || '').replace(/\\/g, '/').toLowerCase().replace(/\/+$/, '');

          if (itemPathNorm.startsWith(normOld + '/')) {
            const relSuffix = (item.file_path || '').replace(/\\/g, '/').slice(normOld.length);
            item.file_path = newPath.replace(/\\/g, '/') + relSuffix;
          }
          if (itemFolderNorm === normOld) {
            item.folder = newPath;
          }
        }
      }

      this.cacheTimestamp = Date.now();
      this.scanStatus.scanned_count = this.cachedMediaList.length;
    }

    // Synchronize folder changes to SQLite
    try {
      const db = this.db.getDb();
      for (const rf of removedFolders) {
        const normF = rf.replace(/\\/g, '/');
        db.prepare('DELETE FROM media_items WHERE folder = ? OR file_path LIKE ?').run(normF, `${normF}/%`);
      }
      for (const { oldPath, newPath } of renamedFolders) {
        const normOld = oldPath.replace(/\\/g, '/');
        const normNew = newPath.replace(/\\/g, '/');
        db.prepare('UPDATE media_items SET folder = ? WHERE folder = ?').run(normNew, normOld);
        db.prepare('UPDATE media_items SET file_path = ? || SUBSTR(file_path, ?) WHERE file_path LIKE ?').run(normNew, normOld.length + 1, `${normOld}/%`);
      }
    } catch (e) {
      this.logger.warn(`Failed syncing folder change to SQLite: ${e}`);
    }

    // Rebuild lookup maps
    this.filePathMap.clear();
    this.baseNamePathMap.clear();
    if (this.cachedMediaList) {
      for (const item of this.cachedMediaList) {
        this.registerIndexedFile(item.file_path, item.folder);
      }
    }

    const currentTotal = this.cachedMediaList ? this.cachedMediaList.length : 0;
    this.db.updateCacheStats({ last_cached_count: currentTotal });

    this.logger.log(
      `Recalculated cache after folder changes (removed=${removedFolders.length}, renamed=${renamedFolders.length}). Remaining cache items: ${currentTotal}`,
    );
  }

  /**
   * Start periodic daily automation timer
   */
  startDailyAutomation(): void {
    if (this.automationTimer) return;
    this.automationTimer = setInterval(() => {
      this.checkScheduledAutomation();
    }, 60000);
  }

  private async checkScheduledAutomation(): Promise<void> {
    try {
      const config = this.db.getCacheStrategyConfig();
      if (!config.daily_automation_enabled) return;
      if (this.scanStatus.is_scanning) return;

      const nextIso = config.next_scheduled_recache || computeNextScheduledRecache(config.daily_schedule_time);
      const nextTime = new Date(nextIso).getTime();
      const now = Date.now();

      if (now >= nextTime) {
        this.logger.log(`Executing scheduled daily caching automation (scheduled=${nextIso})`);
        await this.recache({ incremental: config.incremental_only });
      }
    } catch (err: any) {
      this.logger.warn(`Daily cache automation execution error: ${err.message}`);
    }
  }

  private get catalogerBaseUrl(): string {
    return this.config.catalogerApiUrl.replace(/\/+$/, '');
  }

  private inFlightScanPromise: Promise<any[]> | null = null;

  async scanInputFolders(targetFolder?: string): Promise<ScannedMediaFile[]> {
    const results: ScannedMediaFile[] = [];
    const supported = new Set([...this.config.supportedPhotoExts, ...this.config.supportedVideoExts]);
    const visitedFiles = new Set<string>();
    const visitedDirs = new Set<string>();

    this.scanStatus.is_scanning = true;
    this.scanStatus.started_at = Date.now();
    this.scanStatus.scanned_count = 0;

    let opCounter = 0;
    const yieldIfNecessary = async () => {
      opCounter++;
      if (opCounter % 25 === 0) {
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
    };

    const traverse = async (dir: string, baseFolder: string) => {
      try {
        let realDir = dir;
        try {
          realDir = fs.realpathSync(dir);
        } catch {
          // fallback to dir if realpath fails
        }
        const normDir = realDir.toLowerCase().replace(/\\/g, '/');
        if (visitedDirs.has(normDir)) {
          return;
        }
        visitedDirs.add(normDir);

        this.scanStatus.current_folder = dir;
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            // Ignore hidden directories or outputs
            if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === '__pycache__') {
              continue;
            }
            await yieldIfNecessary();
            await traverse(fullPath, baseFolder);
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (supported.has(ext)) {
              let realFile = fullPath;
              try {
                realFile = fs.realpathSync(fullPath);
              } catch {}
              const normFile = realFile.toLowerCase().replace(/\\/g, '/');
              if (visitedFiles.has(normFile)) {
                continue;
              }
              visitedFiles.add(normFile);

              results.push({ filePath: fullPath, folder: baseFolder });
              this.registerIndexedFile(fullPath, baseFolder);
              this.scanStatus.scanned_count = results.length;
              this.scanStatus.current_file = fullPath;
              this.scanStatus.current_filename = entry.name;
              await yieldIfNecessary();
            }
          }
        }
      } catch (err) {
        this.logger.warn(`Failed reading directory ${dir}: ${err}`);
      }
    };

    const foldersToScan = targetFolder ? [targetFolder] : this.config.inputFolders;

    try {
      for (const folder of foldersToScan) {
        let scanTarget = folder;
        if (!fs.existsSync(scanTarget)) {
          // If in Docker container with Windows UNC / drive path, fallback to mounted container media_input
          const cand1 = path.resolve(this.config.projectRoot, 'media_input');
          const cand2 = '/app/media_input';
          if (fs.existsSync(cand1) && fs.statSync(cand1).isDirectory()) {
            scanTarget = cand1;
          } else if (fs.existsSync(cand2) && fs.statSync(cand2).isDirectory()) {
            scanTarget = cand2;
          }
        }

        if (fs.existsSync(scanTarget)) {
          await traverse(scanTarget, folder);
        }
      }
    } finally {
      this.scanStatus.is_scanning = false;
      this.scanStatus.current_file = null;
      this.scanStatus.current_filename = null;
    }

    return results;
  }

  /**
   * Find candidate sidecar JSON file for a given media file path across output and input folders.
   */
  findSidecarFile(filePath: string, baseFolder?: string, sidecarHint?: string | null, outputDirFiles?: Set<string>): string | null {
    const baseName = path.basename(filePath);
    const ext = path.extname(filePath);
    const stem = ext ? baseName.slice(0, -ext.length) : baseName;

    if (sidecarHint && String(sidecarHint).trim()) {
      const hint = String(sidecarHint).trim();
      if (fs.existsSync(hint)) return hint;
      const hintInOutput = path.join(this.config.outputFolder, path.basename(hint));
      if (fs.existsSync(hintInOutput)) return hintInOutput;
    }

    // Fast in-memory check if pre-read output directory entries set is provided
    if (outputDirFiles) {
      const bLower = `${baseName}.json`.toLowerCase();
      const sLower = `${stem}.json`.toLowerCase();
      const infoLower = `${baseName}.info.json`.toLowerCase();
      if (outputDirFiles.has(bLower)) {
        return path.join(this.config.outputFolder, `${baseName}.json`);
      }
      if (outputDirFiles.has(sLower)) {
        return path.join(this.config.outputFolder, `${stem}.json`);
      }
      if (outputDirFiles.has(infoLower)) {
        return path.join(this.config.outputFolder, `${baseName}.info.json`);
      }
    }

    const candidates: string[] = [];

    // Direct output folder candidates
    candidates.push(path.join(this.config.outputFolder, `${baseName}.json`));
    candidates.push(path.join(this.config.outputFolder, `${stem}.json`));
    candidates.push(path.join(this.config.outputFolder, `${baseName}.info.json`));

    // Nested relative candidates in outputFolder
    if (baseFolder) {
      try {
        const rel = path.relative(baseFolder, filePath);
        if (rel && !rel.startsWith('..')) {
          candidates.push(path.join(this.config.outputFolder, `${rel}.json`));
          const relStem = ext ? rel.slice(0, -ext.length) : rel;
          candidates.push(path.join(this.config.outputFolder, `${relStem}.json`));
        }
      } catch {
        // ignore relative path errors
      }
    }

    // Adjacent candidates next to media file
    const dir = path.dirname(filePath);
    candidates.push(path.join(dir, `${baseName}.json`));
    candidates.push(path.join(dir, `${stem}.json`));
    candidates.push(path.join(dir, `${baseName}.info.json`));

    for (const cand of candidates) {
      try {
        if (fs.existsSync(cand) && fs.statSync(cand).isFile()) {
          return cand;
        }
      } catch {
        // ignore stat errors
      }
    }

    return null;
  }

  private readParsedSidecar(resolvedSidecar: string): any | null {
    try {
      const stat = fs.statSync(resolvedSidecar);
      const cached = this.sidecarCache.get(resolvedSidecar);
      if (cached && cached.mtime === stat.mtimeMs) {
        return cached.data;
      }
      const raw = fs.readFileSync(resolvedSidecar, 'utf-8');
      const data = JSON.parse(raw);
      this.sidecarCache.set(resolvedSidecar, { mtime: stat.mtimeMs, data });
      return data;
    } catch {
      return null;
    }
  }

  private async buildMediaIndex(
    _isRefresh: boolean = false,
    targetFolder?: string,
    isIncremental: boolean = false,
  ): Promise<any[]> {
    this.scanStatus.is_scanning = true;
    this.scanStatus.started_at = Date.now();

    try {
      const scanned = await this.scanInputFolders(targetFolder);
      const syncRecords = this.db.getAllSyncRecords();
      const faceCounts = this.db.getFacesCountBySourceFile();
      const allFacesByFile = this.db.getAllFacesBySourceFile();
      const dbMetadata = this.db.getAllMediaMetadata();
      const allMediaHashes = this.db.getAllMediaHashes ? this.db.getAllMediaHashes() : [];
      const mediaHashMap = new Map<string, any>();
      for (const h of allMediaHashes) {
        if (h && h.file_path) {
          mediaHashMap.set(h.file_path.toLowerCase().replace(/\\/g, '/'), h);
          mediaHashMap.set(path.basename(h.file_path).toLowerCase(), h);
        }
      }

      // Pre-read output folder files to avoid hundreds of thousands of network stats over NAS
      const outputDirSidecars = new Set<string>();
      try {
        if (fs.existsSync(this.config.outputFolder)) {
          for (const name of fs.readdirSync(this.config.outputFolder)) {
            if (name.endsWith('.json')) {
              outputDirSidecars.add(name.toLowerCase());
            }
          }
        }
      } catch {}

      // Secondary index by basename
      const baseFaceCounts: Record<string, number> = {};
      for (const [srcFile, count] of Object.entries(faceCounts)) {
        const bn = path.basename(srcFile).toLowerCase();
        baseFaceCounts[bn] = (baseFaceCounts[bn] || 0) + count;
      }

      const baseFaces: Record<string, any[]> = {};
      for (const [srcFile, fList] of Object.entries(allFacesByFile)) {
        const bn = path.basename(srcFile).toLowerCase();
        if (!baseFaces[bn]) baseFaces[bn] = [];
        baseFaces[bn].push(...fList);
      }

      const existingMap = new Map<string, any>();
      if (isIncremental) {
        if (this.cachedMediaList) {
          for (const it of this.cachedMediaList) {
            if (it && it.file_path) {
              existingMap.set(it.file_path.toLowerCase().replace(/\\/g, '/'), it);
            }
          }
        }
        if (existingMap.size === 0) {
          const persisted = this.db.getAllPersistedMediaItems();
          for (const it of persisted) {
            if (it && it.file_path) {
              existingMap.set(it.file_path.toLowerCase().replace(/\\/g, '/'), it);
            }
          }
        }
      }

      const items: any[] = [];
      let itemIdx = 0;
      for (const { filePath, folder } of scanned) {
        itemIdx++;
        this.scanStatus.scanned_count = itemIdx;
        this.scanStatus.current_file = filePath;
        this.scanStatus.current_filename = path.basename(filePath);

        if (itemIdx % 5 === 0) {
          await new Promise<void>((resolve) => setImmediate(resolve));
        }

        let size = 0;
        let mtime = 0;
        try {
          const stat = await fs.promises.stat(filePath);
          size = stat.size;
          mtime = stat.mtimeMs / 1000;
        } catch {
          // file unreadable
        }

        const normFp = filePath.toLowerCase().replace(/\\/g, '/');
        if (isIncremental && existingMap.has(normFp)) {
          const existing = existingMap.get(normFp);
          if (existing && existing.mtime === mtime && existing.size === size) {
            items.push(existing);
            continue;
          }
        }

      const baseName = path.basename(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const isVideo = this.config.supportedVideoExts.has(ext);
      const isImage = this.config.supportedPhotoExts.has(ext);

      let syncRec = syncRecords[filePath];
      if (!syncRec) {
        for (const [k, v] of Object.entries(syncRecords)) {
          if (path.basename(k).toLowerCase() === baseName.toLowerCase()) {
            syncRec = v;
            break;
          }
        }
      }

      let fileFacesRaw = allFacesByFile[filePath];
      if (!fileFacesRaw || fileFacesRaw.length === 0) {
        fileFacesRaw = baseFaces[baseName.toLowerCase()] || [];
      }

      const seenFids = new Set<string>();
      const dedupFaces: any[] = [];
      const faceNames: string[] = [];
      let hasUnassigned = false;

      for (const f of fileFacesRaw) {
        const fid = f.face_id || f.id;
        if (fid && seenFids.has(fid)) continue;
        if (fid) seenFids.add(fid);
        dedupFaces.push(f);
        const fname = f.name || f.person_name;
        if (fname && !faceNames.includes(fname)) {
          faceNames.push(fname);
        }
        if (!f.is_reference || (fname && fname.startsWith('face_'))) {
          hasUnassigned = true;
        }
      }

      let status = syncRec ? syncRec.status : 'UNPROCESSED';
      let sidecar = syncRec ? syncRec.sidecar_path : null;

      let desc: string | null = null;
      let descRu: string | null = null;
      let summ: string | null = null;
      let summRu: string | null = null;
      let environment: string | null = null;
      let lighting: string | null = null;
      let lightingRu: string | null = null;
      let weather: string | null = null;
      let weatherRu: string | null = null;
      let timeOfDay: string | null = null;
      let timeOfDayRu: string | null = null;
      let ocrText: string | null = null;
      let exifAnalysis: string | null = null;
      let exifAnalysisRu: string | null = null;
      let transcription: string | null = null;
      let transcriptionRu: string | null = null;
      let timelineEvents: any = null;

      let captureDate: string | null = null;
      let mediaDate: string | null = null;
      const m = dbMetadata[filePath] || dbMetadata[baseName.toLowerCase()];
      if (m) {
        mediaDate = m.media_date || null;
        captureDate = (m as any).capture_date || m.media_date || null;
        desc = m.description || null;
        descRu = m.description_ru || null;
        summ = m.summary || null;
        summRu = m.summary_ru || null;
        environment = m.environment || null;
        lighting = m.lighting || null;
        lightingRu = m.lighting_ru || null;
        weather = m.weather || null;
        weatherRu = m.weather_ru || null;
        timeOfDay = m.time_of_day || null;
        timeOfDayRu = m.time_of_day_ru || null;
        ocrText = m.ocr_text || null;
        exifAnalysis = m.exif_analysis || null;
        exifAnalysisRu = m.exif_analysis_ru || null;
        transcription = m.transcription || null;
        transcriptionRu = m.transcription_ru || null;
        if (m.timeline_events) {
          try {
            timelineEvents = typeof m.timeline_events === 'string' ? JSON.parse(m.timeline_events) : m.timeline_events;
          } catch {
            timelineEvents = m.timeline_events;
          }
        }
      }

      // Check and ingest sidecar JSON file from disk (using sidecar cache)
      let sdata: any = null;
      const resolvedSidecar = this.findSidecarFile(filePath, folder, sidecar, outputDirSidecars);
      if (resolvedSidecar) {
        sidecar = resolvedSidecar;
        sdata = this.readParsedSidecar(resolvedSidecar);
        if (sdata) {
          const ga = sdata.gemini_analysis || sdata.analysis || sdata.metadata || {};

          if (ga.description || sdata.description) desc = ga.description || sdata.description;
          if (ga.description_ru || sdata.description_ru) descRu = ga.description_ru || sdata.description_ru;
          if (ga.summary || sdata.summary) summ = ga.summary || sdata.summary;
          if (ga.summary_ru || sdata.summary_ru) summRu = ga.summary_ru || sdata.summary_ru;
          if (ga.environment || sdata.environment) environment = ga.environment || sdata.environment;
          if (ga.lighting || sdata.lighting) lighting = ga.lighting || sdata.lighting;
          if (ga.lighting_ru || sdata.lighting_ru) lightingRu = ga.lighting_ru || sdata.lighting_ru;
          if (ga.weather || sdata.weather) weather = ga.weather || sdata.weather;
          if (ga.weather_ru || sdata.weather_ru) weatherRu = ga.weather_ru || sdata.weather_ru;
          if (ga.time_of_day || sdata.time_of_day) timeOfDay = ga.time_of_day || sdata.time_of_day;
          if (ga.time_of_day_ru || sdata.time_of_day_ru) timeOfDayRu = ga.time_of_day_ru || sdata.time_of_day_ru;
          if (ga.ocr_text || sdata.ocr_text) ocrText = ga.ocr_text || sdata.ocr_text;
          if (ga.exif_analysis || sdata.exif_analysis) exifAnalysis = ga.exif_analysis || sdata.exif_analysis;
          if (ga.exif_analysis_ru || sdata.exif_analysis_ru) exifAnalysisRu = ga.exif_analysis_ru || sdata.exif_analysis_ru;
          if (ga.transcription || sdata.transcription) transcription = ga.transcription || sdata.transcription;
          if (ga.transcription_ru || sdata.transcription_ru) transcriptionRu = ga.transcription_ru || sdata.transcription_ru;
          if (ga.timeline_events || sdata.timeline_events) timelineEvents = ga.timeline_events || sdata.timeline_events;
          if (sdata.capture_date) captureDate = sdata.capture_date;
          else if (sdata.exif?.DateTimeOriginal) captureDate = sdata.exif.DateTimeOriginal;
          else if (sdata.exif?.CreateDate) captureDate = sdata.exif.CreateDate;
          else if (sdata.media_date) captureDate = sdata.media_date;

          if (sdata.media_date) mediaDate = sdata.media_date;
          else if (captureDate && !mediaDate) mediaDate = captureDate;

          // If faces are missing from DB, extract them from sidecar JSON
          const rawSidecarFaces = sdata.faces || sdata.detected_faces || ga.faces || ga.detected_faces || [];
          if (Array.isArray(rawSidecarFaces) && rawSidecarFaces.length > 0) {
            const sidecarFaceObjs = rawSidecarFaces.map((item: any, idx: number) => {
              if (typeof item === 'string') {
                return {
                  face_id: `face_${baseName}_${idx}`,
                  name: item,
                  confidence: 1.0,
                  is_reference: !item.startsWith('face_') ? 1 : 0,
                  source_file: filePath,
                };
              }
              return {
                face_id: item.face_id || item.id || `face_${baseName}_${idx}`,
                person_id: item.person_id || null,
                name: item.name || item.person_name || `face_${idx}`,
                confidence: typeof item.confidence === 'number' ? item.confidence : 0.95,
                bbox: item.bbox || null,
                image_path: item.image_path || item.crop_path || item.image || null,
                time_start: item.time_start || null,
                time_end: item.time_end || null,
                is_reference: item.is_reference !== undefined ? (item.is_reference ? 1 : 0) : (item.name && !item.name.startsWith('face_') ? 1 : 0),
                source_file: filePath,
              };
            });

            for (const sf of sidecarFaceObjs) {
              const fid = sf.face_id;
              if (fid && !seenFids.has(fid)) {
                seenFids.add(fid);
                dedupFaces.push(sf);
                if (sf.name && !faceNames.includes(sf.name)) {
                  faceNames.push(sf.name);
                }
                if (!sf.is_reference || (sf.name && sf.name.startsWith('face_'))) {
                  hasUnassigned = true;
                }
              }
            }

            // Auto-persist sidecar faces to SQLite
            try {
              this.db.saveMediaFaces(filePath, dedupFaces);
            } catch {
              // ignore persistence failures during list scan
            }
          }

          if (sdata.face_names && Array.isArray(sdata.face_names)) {
            for (const fn of sdata.face_names) {
              if (fn && !faceNames.includes(fn)) {
                faceNames.push(fn);
              }
            }
          }

          // If sidecar exists with analysis or metadata, mark status as PROCESSED
          if (desc || descRu || summ || summRu || dedupFaces.length > 0 || status === 'UNPROCESSED') {
            status = 'PROCESSED';
          }

          // Auto-persist sidecar metadata to SQLite
          try {
            this.db.saveSyncRecord({
              filePath: filePath,
              fileSize: size,
              mtime: mtime,
              status: status,
              sidecarPath: sidecar,
            });

            this.db.saveMediaMetadata(filePath, {
              media_type: isVideo ? 'video' : 'photo',
              file_size: size,
              mtime: mtime,
              summary: summ,
              summary_ru: summRu,
              description: desc,
              description_ru: descRu,
              environment: environment,
              lighting: lighting,
              lighting_ru: lightingRu,
              weather: weather,
              weather_ru: weatherRu,
              time_of_day: timeOfDay,
              time_of_day_ru: timeOfDayRu,
              ocr_text: ocrText,
              exif_analysis: exifAnalysis,
              exif_analysis_ru: exifAnalysisRu,
              transcription: transcription,
              transcription_ru: transcriptionRu,
              timeline_events: timelineEvents,
              camera_make: sdata.exif?.camera_make || null,
              camera_model: sdata.camera_model || null,
              location_name: sdata.location_name || null,
            });
          } catch {
            // ignore persistence failures during scan
          }
        }
      }

      const fc = dedupFaces.length > 0 ? dedupFaces.length : (faceCounts[filePath] || baseFaceCounts[baseName.toLowerCase()] || 0);

      const normPath = filePath.toLowerCase().replace(/\\/g, '/');
      const hashRec = mediaHashMap.get(normPath) || mediaHashMap.get(baseName.toLowerCase());
      const phash = hashRec?.phash || null;

      let modulesStatus = sdata?.modules_status || null;
      if (!modulesStatus) {
        const hasTranscribe = isVideo ? Boolean(transcription && transcription.trim().length > 0) : null;
        const hasFaces = (dedupFaces && dedupFaces.length > 0) || (faceNames && faceNames.length > 0);
        const hasDuplicates = Boolean(phash || sdata?.phash);
        const hasVision = Boolean((summ && summ.trim().length > 0) || (desc && desc.trim().length > 0) || (sdata?.tags && sdata.tags.length > 0));
        modulesStatus = {
          transcribe: hasTranscribe,
          faces: hasFaces,
          duplicates: hasDuplicates,
          vision: hasVision,
        };
      }

      const item: any = {
        file_path: filePath,
        filename: baseName,
        folder: folder,
        file_size: size,
        mtime: mtime,
        capture_date: captureDate,
        media_date: mediaDate,
        phash: phash,
        is_video: isVideo,
        is_image: isImage,
        status: status,
        sidecar_path: sidecar,
        modules_status: modulesStatus,
        description: desc,
        description_ru: descRu,
        summary: summ,
        summary_ru: summRu,
        environment: environment,
        lighting: lighting,
        lighting_ru: lightingRu,
        weather: weather,
        weather_ru: weatherRu,
        time_of_day: timeOfDay,
        time_of_day_ru: timeOfDayRu,
        ocr_text: ocrText,
        exif_analysis: exifAnalysis,
        exif_analysis_ru: exifAnalysisRu,
        transcription: transcription,
        transcription_ru: transcriptionRu,
        timeline_events: timelineEvents,
        face_count: fc,
        faces: dedupFaces,
        face_names: faceNames,
        has_unassigned_faces: hasUnassigned,
        is_vault: this.isVaultPath(filePath),
        error_message: syncRec ? syncRec.error_message : null,
      };

      // Enrich with family context if face names are recognized
      if (this.familyTreePublicService && faceNames.length > 0) {
        try {
          const photoKinship = this.familyTreePublicService.analyzePhotoKinship({
            person_names: faceNames,
            media_file_path: filePath,
            media_date: mediaDate || captureDate || (mtime ? new Date(mtime * 1000).toISOString() : undefined),
          });

          if (photoKinship.identifiedPersons.length > 0) {
            item.family_context = {
              suggested_caption: photoKinship.suggestedCaption,
              summary_description: photoKinship.summaryDescription,
              identified_members: photoKinship.identifiedPersons.map((p) => ({
                name: p.name,
                tree_person_id: p.treePersonId,
                kinship: p.kinshipToRoot?.primaryTerm || null,
                kinshipToRoot: p.kinshipToRoot?.primaryTerm || null,
                category: p.kinshipToRoot?.category || null,
              })),
              relationships: photoKinship.relationships.map((r) => ({
                person1: r.personA,
                person2: r.personB,
                relationship: r.kinshipAtoB,
                person_a: r.personA,
                person_b: r.personB,
                kinship: r.kinshipAtoB,
              })),
              milestones: photoKinship.contextualMilestones,
            };

            // If no AI description exists, use the rich family kinship caption
            if (!item.description && photoKinship.suggestedCaption) {
              item.enriched_family_caption = photoKinship.suggestedCaption;
            }
          }
        } catch {
          // ignore family context enrichment failures
        }
      }

      items.push(item);
      if (items.length % 50 === 0 && !targetFolder) {
        this.cachedMediaList = items;
      }
    }

      // Reconcile deleted files in incremental mode
      if (isIncremental) {
        const dbIndex = this.db.getExistingFilesIndex();
        const allKnownPaths = new Set([...existingMap.keys(), ...dbIndex.keys()]);
        if (allKnownPaths.size > 0) {
          const scannedNormPaths = new Set(scanned.map((s) => s.filePath.toLowerCase().replace(/\\/g, '/')));
          const deletedPaths: string[] = [];
          for (const existingPath of allKnownPaths) {
            if (targetFolder) {
              const normTarget = targetFolder.toLowerCase().replace(/\\/g, '/').replace(/\/+$/, '');
              if (!existingPath.startsWith(normTarget + '/') && !existingPath.includes(`/${normTarget}/`)) {
                continue;
              }
            }
            if (!scannedNormPaths.has(existingPath)) {
              deletedPaths.push(existingPath);
            }
          }
          if (deletedPaths.length > 0) {
            this.logger.log(`Incremental sync reconciled ${deletedPaths.length} removed files`);
            try {
              this.db.deleteMediaItemsBatch(deletedPaths);
            } catch (err) {
              this.logger.warn(`Failed batch deleting reconciled removed files: ${err}`);
            }
          }
        }
      }

      // Batch persist all items to SQLite
      try {
        this.db.saveMediaItemsBatch(items);
      } catch (err) {
        this.logger.warn(`Failed persisting media items batch to SQLite: ${err}`);
      }

      if (targetFolder && this.cachedMediaList) {
        const normTarget = targetFolder.toLowerCase().replace(/\\/g, '/').replace(/\/+$/, '');
        const remaining = this.cachedMediaList.filter((it) => {
          const itFolder = (it.folder || '').toLowerCase().replace(/\\/g, '/').replace(/\/+$/, '');
          const itPath = (it.file_path || '').toLowerCase().replace(/\\/g, '/');
          return itFolder !== normTarget && !itPath.startsWith(normTarget + '/');
        });
        this.cachedMediaList = [...remaining, ...items];
      } else {
        this.cachedMediaList = items;
      }
      this.cacheTimestamp = Date.now();
      this.hasInitialScanRun = true;
      return this.cachedMediaList;
    } finally {
      this.scanStatus.is_scanning = false;
      this.scanStatus.current_file = null;
      this.scanStatus.current_filename = null;
    }
  }

  async listMediaFiles(query?: {
    offset?: number | string;
    limit?: number | string;
    page?: number | string;
    search?: string;
    type?: 'all' | 'images' | 'videos';
    status?: 'all' | 'PROCESSED' | 'UNPROCESSED' | 'PENDING';
    face_filter?: 'all' | 'with_faces' | 'no_faces' | 'unassigned';
    person?: string;
    folder?: string;
    sort_by?: 'name' | 'date' | 'size' | 'status' | 'faces';
    sort_order?: 'asc' | 'desc';
    refresh?: boolean | string;
    vault?: 'false' | 'true' | 'all';
  }) {
    this.db.initDb();

    const isRefresh = query?.refresh === true || query?.refresh === 'true';
    const now = Date.now();
    const targetOffset = Number(query?.offset) || 0;
    const targetLimit = Number(query?.limit) || 100;
    const targetCount = targetOffset + targetLimit;

    // 1. If in-memory cache is empty and not a forced refresh, first hydrate instantly from SQLite
    if (!this.cachedMediaList && !isRefresh) {
      const persisted = this.db.getAllPersistedMediaItems();
      if (persisted && persisted.length > 0) {
        this.cachedMediaList = this.hydrateItemsFromPersisted(persisted);
        this.cacheTimestamp = Date.now();
        for (const it of this.cachedMediaList) {
          this.registerIndexedFile(it.file_path, it.folder);
        }
        this.logger.log(`Hydrated ${persisted.length} media items instantly from SQLite database`);
      }
    }

    // 2. Strict Mutex on scanning: never launch parallel scans
    const needsScan = !this.cachedMediaList || isRefresh || !this.hasInitialScanRun || now - this.cacheTimestamp > this.CACHE_TTL_MS;
    if (needsScan) {
      if (!this.inFlightScanPromise && !this.scanStatus.is_scanning) {
        const shouldRunIncremental = Boolean(this.cachedMediaList && !isRefresh);
        this.inFlightScanPromise = this.buildMediaIndex(isRefresh, undefined, shouldRunIncremental).finally(() => {
          this.inFlightScanPromise = null;
        });
      }

      // If cache is empty, initial scan has not completed, or explicit refresh requested, wait for initial chunk
      if (!this.cachedMediaList || !this.hasInitialScanRun || isRefresh) {
        let waitIter = 0;
        while (
          this.scanStatus.is_scanning &&
          (!this.cachedMediaList || this.cachedMediaList.length < targetCount) &&
          waitIter < 30
        ) {
          waitIter++;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
    }

    const allItems = this.cachedMediaList || [];

    // Catalog stats over complete set
    const stats = {
      total: allItems.length,
      processed: allItems.filter((f) => f.status === 'PROCESSED').length,
      photos: allItems.filter((f) => f.is_image).length,
      videos: allItems.filter((f) => f.is_video).length,
    };

    // Filter items
    let filtered = allItems;

    // Secret Vault isolation filter: default is to exclude all vault items
    if (query?.vault === 'true') {
      filtered = filtered.filter((item) => item.is_vault);
    } else if (query?.vault !== 'all') {
      filtered = filtered.filter((item) => !item.is_vault);
    }

    if (query) {
      const search = query.search?.trim().toLowerCase();
      if (search) {
        filtered = filtered.filter((item) => {
          const matchDesc = Boolean(item.description && item.description.toLowerCase().includes(search));
          const matchDescRu = Boolean(item.description_ru && item.description_ru.toLowerCase().includes(search));
          const matchSummary = Boolean(item.summary && item.summary.toLowerCase().includes(search));
          const matchSummaryRu = Boolean(item.summary_ru && item.summary_ru.toLowerCase().includes(search));
          const matchName = Boolean(item.filename && item.filename.toLowerCase().includes(search));
          const matchFolder = Boolean(item.folder && item.folder.toLowerCase().includes(search));
          const matchFaces = Boolean(item.face_names && item.face_names.some((fn: string) => fn.toLowerCase().includes(search)));
          const matchOcr = Boolean(item.ocr_text && item.ocr_text.toLowerCase().includes(search));
          return matchDesc || matchDescRu || matchSummary || matchSummaryRu || matchName || matchFolder || matchFaces || matchOcr;
        });
      }

      if (query.type && query.type !== 'all') {
        if (query.type === 'images') filtered = filtered.filter((f) => f.is_image);
        if (query.type === 'videos') filtered = filtered.filter((f) => f.is_video);
      }

      if (query.status && query.status !== 'all') {
        filtered = filtered.filter((f) => (f.status || 'UNPROCESSED') === query.status);
      }

      if (query.face_filter && query.face_filter !== 'all') {
        if (query.face_filter === 'with_faces') {
          filtered = filtered.filter((f) => (f.face_count && f.face_count > 0) || (f.faces && f.faces.length > 0));
        } else if (query.face_filter === 'no_faces') {
          filtered = filtered.filter((f) => (!f.face_count || f.face_count === 0) && (!f.faces || f.faces.length === 0));
        } else if (query.face_filter === 'unassigned') {
          filtered = filtered.filter((f) => f.has_unassigned_faces);
        }
      }

      if (query.person && query.person !== 'all') {
        filtered = filtered.filter(
          (f) =>
            (f.face_names && f.face_names.includes(query.person)) ||
            (f.faces && f.faces.some((fc: any) => fc.name === query.person || fc.person_id === query.person))
        );
      }

      if (query.folder) {
        const folderTarget = query.folder.toLowerCase();
        filtered = filtered.filter(
          (f) =>
            (f.folder && f.folder.toLowerCase() === folderTarget) ||
            (f.file_path && f.file_path.toLowerCase().startsWith(folderTarget))
        );
      }

      // Sorting
      const sortBy = query.sort_by || 'date';
      const sortOrder = query.sort_order || 'desc';

      filtered = [...filtered].sort((a, b) => {
        let cmp = 0;
        if (sortBy === 'name') {
          cmp = (a.filename || '').localeCompare(b.filename || '');
        } else if (sortBy === 'size') {
          cmp = (a.file_size || 0) - (b.file_size || 0);
        } else if (sortBy === 'faces') {
          cmp = (a.face_count || 0) - (b.face_count || 0);
        } else if (sortBy === 'status') {
          cmp = (a.status || '').localeCompare(b.status || '');
        } else {
          // Default: date (mtime)
          cmp = (a.mtime || 0) - (b.mtime || 0);
        }
        return sortOrder === 'asc' ? cmp : -cmp;
      });
    }

    const totalFiltered = filtered.length;
    const totalFilesCount = this.scanStatus.is_scanning
      ? Math.max(totalFiltered, this.scanStatus.scanned_count)
      : totalFiltered;

    // Pagination
    let limitNum: number | undefined;
    let offsetNum = 0;

    if (query?.limit !== undefined) {
      limitNum = Math.max(1, Number(query.limit));
    }
    if (query?.offset !== undefined) {
      offsetNum = Math.max(0, Number(query.offset));
    } else if (query?.page !== undefined) {
      const pageNum = Math.max(1, Number(query.page));
      offsetNum = (pageNum - 1) * (limitNum || 50);
    }

    let pagedFiles = filtered;
    let hasMore = false;

    if (limitNum !== undefined) {
      pagedFiles = filtered.slice(offsetNum, offsetNum + limitNum);
      hasMore = this.scanStatus.is_scanning
        ? offsetNum + limitNum < totalFilesCount
        : offsetNum + limitNum < totalFiltered;
    }

    return {
      total_files: totalFilesCount,
      total: totalFilesCount,
      files: pagedFiles,
      offset: offsetNum,
      limit: limitNum || totalFiltered,
      has_more: hasMore,
      hasMore: hasMore,
      stats: stats,
    };
  }


  resolveMediaFilePath(target: string): string {
    if (!target || !target.trim()) {
      throw new NotFoundException('Empty media file path specified');
    }
    const trimmed = target.trim();

    // 1. Direct file existence check
    if (fs.existsSync(trimmed)) {
      try {
        if (fs.statSync(trimmed).isFile()) return trimmed;
      } catch {}
    }

    const normFwd = trimmed.replace(/\\/g, '/');
    if (fs.existsSync(normFwd)) {
      try {
        if (fs.statSync(normFwd).isFile()) return normFwd;
      } catch {}
    }

    // 2. Fast in-memory map lookup
    if (this.filePathMap.has(trimmed)) return this.filePathMap.get(trimmed)!;
    if (this.filePathMap.has(normFwd)) return this.filePathMap.get(normFwd)!;
    if (this.filePathMap.has(trimmed.toLowerCase())) return this.filePathMap.get(trimmed.toLowerCase())!;
    if (this.filePathMap.has(normFwd.toLowerCase())) return this.filePathMap.get(normFwd.toLowerCase())!;

    // 3. Clean Windows drive letter & UNC share prefix
    let subpath = normFwd.replace(/^[a-zA-Z]:\/?/, ''); // strip Z:/ or C:/
    if (subpath.startsWith('//')) {
      const parts = subpath.replace(/^\/+/, '').split('/');
      subpath = parts.slice(2).join('/');
    }
    subpath = subpath.replace(/^\/+/, '');
    const baseName = path.basename(subpath).toLowerCase();

    if (subpath) {
      if (this.filePathMap.has(subpath)) return this.filePathMap.get(subpath)!;
      if (this.filePathMap.has(subpath.toLowerCase())) return this.filePathMap.get(subpath.toLowerCase())!;
    }

    // 4. Test candidate paths in input and output folders
    const candidateFolders = [
      ...this.config.inputFolders,
      this.config.outputFolder,
      '/app/media_input',
      '/app/media_output',
      path.resolve(this.config.projectRoot, 'media_input'),
      path.resolve(this.config.projectRoot, 'media_output'),
    ];

    for (const folder of candidateFolders) {
      if (!folder || !fs.existsSync(folder)) continue;

      // Test subpath joined to folder
      if (subpath) {
        const p1 = path.join(folder, subpath);
        if (fs.existsSync(p1)) {
          try {
            if (fs.statSync(p1).isFile()) {
              this.registerIndexedFile(p1, folder);
              return p1;
            }
          } catch {}
        }
      }

      // Test basename joined to folder
      const p2 = path.join(folder, path.basename(trimmed));
      if (fs.existsSync(p2)) {
        try {
          if (fs.statSync(p2).isFile()) {
            this.registerIndexedFile(p2, folder);
            return p2;
          }
        } catch {}
      }
    }

    // 5. Test basename in fast in-memory map
    if (this.baseNamePathMap.has(baseName)) {
      const p = this.baseNamePathMap.get(baseName)!;
      if (fs.existsSync(p)) return p;
    }

    // 6. Test SQLite database records
    try {
      const syncRec = this.db.getSyncRecord(trimmed) || this.db.getSyncRecord(normFwd) || this.db.getSyncRecord(baseName);
      if (syncRec && syncRec.file_path && fs.existsSync(syncRec.file_path)) {
        this.registerIndexedFile(syncRec.file_path);
        return syncRec.file_path;
      }
    } catch {
      // ignore db error
    }

    throw new NotFoundException(`Media file '${trimmed}' not found`);
  }

  /**
   * Verify read access to a given media file target path or filename.
   */
  verifyFileAccess(target: string): { accessible: boolean; resolvedPath?: string; error?: string } {
    try {
      const resolved = this.resolveMediaFilePath(target);
      fs.accessSync(resolved, fs.constants.R_OK);
      return { accessible: true, resolvedPath: resolved };
    } catch (err: any) {
      return {
        accessible: false,
        error: err.message || `File '${target}' is not accessible or not found`,
      };
    }
  }

  /**
   * Get single media file full details, merging database metadata, sidecar JSON, and faces
   */
  async getMediaFileInfo(target: string): Promise<any> {
    if (!target || !target.trim()) {
      throw new BadRequestException('Empty media file path specified');
    }
    const trimmed = target.trim();
    let resolved = trimmed;
    try {
      resolved = this.resolveMediaFilePath(trimmed);
    } catch {
      resolved = trimmed;
    }

    this.db.initDb();

    let size = 0;
    let mtime = 0;
    try {
      if (fs.existsSync(resolved)) {
        const stat = fs.statSync(resolved);
        size = stat.size;
        mtime = stat.mtimeMs / 1000;
      }
    } catch {}

    const baseName = path.basename(resolved);
    const ext = path.extname(resolved).toLowerCase();
    const isVideo = this.config.supportedVideoExts.has(ext);
    const isImage = this.config.supportedPhotoExts.has(ext);

    const syncRec = this.db.getSyncRecord(resolved) || this.db.getSyncRecord(trimmed) || this.db.getSyncRecord(baseName);
    const dbMeta = this.db.getMediaMetadata(resolved) || this.db.getMediaMetadata(trimmed) || this.db.getMediaMetadata(baseName.toLowerCase());
    let fileFaces = this.db.getFacesBySourceFile(resolved);
    if (!fileFaces || fileFaces.length === 0) {
      fileFaces = this.db.getFacesBySourceFile(trimmed);
    }

    let status = syncRec ? syncRec.status : 'UNPROCESSED';
    let sidecar = syncRec ? syncRec.sidecar_path : null;

    let desc: string | null = dbMeta?.description || null;
    let descRu: string | null = dbMeta?.description_ru || null;
    let summ: string | null = dbMeta?.summary || null;
    let summRu: string | null = dbMeta?.summary_ru || null;
    let environment: string | null = dbMeta?.environment || null;
    let lighting: string | null = dbMeta?.lighting || null;
    let lightingRu: string | null = dbMeta?.lighting_ru || null;
    let weather: string | null = dbMeta?.weather || null;
    let weatherRu: string | null = dbMeta?.weather_ru || null;
    let timeOfDay: string | null = dbMeta?.time_of_day || null;
    let timeOfDayRu: string | null = dbMeta?.time_of_day_ru || null;
    let ocrText: string | null = dbMeta?.ocr_text || null;
    let exifAnalysis: string | null = dbMeta?.exif_analysis || null;
    let exifAnalysisRu: string | null = dbMeta?.exif_analysis_ru || null;
    let transcription: string | null = dbMeta?.transcription || null;
    let transcriptionRu: string | null = dbMeta?.transcription_ru || null;
    let timelineEvents: any = null;
    if (dbMeta?.timeline_events) {
      try {
        timelineEvents = typeof dbMeta.timeline_events === 'string' ? JSON.parse(dbMeta.timeline_events) : dbMeta.timeline_events;
      } catch {
        timelineEvents = dbMeta.timeline_events;
      }
    }

    // Invalidate sidecar cache for this file to ensure freshest read
    const resolvedSidecar = this.findSidecarFile(resolved, undefined, sidecar);
    if (resolvedSidecar) {
      this.sidecarCache.delete(resolvedSidecar);
      sidecar = resolvedSidecar;
      const sdata = this.readParsedSidecar(resolvedSidecar);
      if (sdata) {
        const ga = sdata.gemini_analysis || sdata.analysis || sdata.metadata || {};
        if (ga.description || sdata.description) desc = ga.description || sdata.description;
        if (ga.description_ru || sdata.description_ru) descRu = ga.description_ru || sdata.description_ru;
        if (ga.summary || sdata.summary) summ = ga.summary || sdata.summary;
        if (ga.summary_ru || sdata.summary_ru) summRu = ga.summary_ru || sdata.summary_ru;
        if (ga.environment || sdata.environment) environment = ga.environment || sdata.environment;
        if (ga.lighting || sdata.lighting) lighting = ga.lighting || sdata.lighting;
        if (ga.lighting_ru || sdata.lighting_ru) lightingRu = ga.lighting_ru || sdata.lighting_ru;
        if (ga.weather || sdata.weather) weather = ga.weather || sdata.weather;
        if (ga.weather_ru || sdata.weather_ru) weatherRu = ga.weather_ru || sdata.weather_ru;
        if (ga.time_of_day || sdata.time_of_day) timeOfDay = ga.time_of_day || sdata.time_of_day;
        if (ga.time_of_day_ru || sdata.time_of_day_ru) timeOfDayRu = ga.time_of_day_ru || sdata.time_of_day_ru;
        if (ga.ocr_text || sdata.ocr_text) ocrText = ga.ocr_text || sdata.ocr_text;
        if (ga.exif_analysis || sdata.exif_analysis) exifAnalysis = ga.exif_analysis || sdata.exif_analysis;
        if (ga.exif_analysis_ru || sdata.exif_analysis_ru) exifAnalysisRu = ga.exif_analysis_ru || sdata.exif_analysis_ru;
        if (ga.transcription || sdata.transcription) transcription = ga.transcription || sdata.transcription;
        if (ga.transcription_ru || sdata.transcription_ru) transcriptionRu = ga.transcription_ru || sdata.transcription_ru;
        if (ga.timeline_events || sdata.timeline_events) timelineEvents = ga.timeline_events || sdata.timeline_events;

        if (desc || descRu || summ || summRu || status === 'UNPROCESSED') {
          status = 'PROCESSED';
        }
      }
    }

    const seenFids = new Set<string>();
    const dedupFaces: any[] = [];
    const faceNames: string[] = [];
    let hasUnassigned = false;

    for (const f of fileFaces || []) {
      const fid = f.face_id || f.id;
      if (fid && seenFids.has(fid)) continue;
      if (fid) seenFids.add(fid);
      dedupFaces.push(f);
      const fname = f.name || f.person_name;
      if (fname && !faceNames.includes(fname)) {
        faceNames.push(fname);
      }
      if (!f.is_reference || (fname && fname.startsWith('face_'))) {
        hasUnassigned = true;
      }
    }

    let folder = '';
    for (const inFolder of this.config.inputFolders) {
      if (resolved.startsWith(inFolder)) {
        folder = inFolder;
        break;
      }
    }

    const item: any = {
      file_path: resolved,
      filename: baseName,
      folder: folder || path.dirname(resolved),
      file_size: size,
      mtime: mtime,
      is_video: isVideo,
      is_image: isImage,
      status: status,
      sidecar_path: sidecar,
      description: desc,
      description_ru: descRu,
      summary: summ,
      summary_ru: summRu,
      environment: environment,
      lighting: lighting,
      lighting_ru: lightingRu,
      weather: weather,
      weather_ru: weatherRu,
      time_of_day: timeOfDay,
      time_of_day_ru: timeOfDayRu,
      ocr_text: ocrText,
      exif_analysis: exifAnalysis,
      exif_analysis_ru: exifAnalysisRu,
      transcription: transcription,
      transcription_ru: transcriptionRu,
      timeline_events: timelineEvents,
      face_count: dedupFaces.length,
      faces: dedupFaces,
      face_names: faceNames,
      has_unassigned_faces: hasUnassigned,
      is_vault: this.isVaultPath(resolved),
      error_message: syncRec ? syncRec.error_message : null,
    };

    if (this.familyTreePublicService && faceNames.length > 0) {
      try {
        const photoKinship = this.familyTreePublicService.analyzePhotoKinship({
          person_names: faceNames,
          media_file_path: resolved,
          media_date: dbMeta?.media_date || dbMeta?.capture_date || (mtime ? new Date(mtime * 1000).toISOString() : undefined),
        });
        if (photoKinship.identifiedPersons.length > 0) {
          item.family_context = {
            suggested_caption: photoKinship.suggestedCaption,
            summary_description: photoKinship.summaryDescription,
            identified_members: photoKinship.identifiedPersons.map((p) => ({
              name: p.name,
              tree_person_id: p.treePersonId,
              kinship: p.kinshipToRoot?.primaryTerm || null,
              kinshipToRoot: p.kinshipToRoot?.primaryTerm || null,
              category: p.kinshipToRoot?.category || null,
            })),
            relationships: photoKinship.relationships.map((r) => ({
              person1: r.personA,
              person2: r.personB,
              relationship: r.kinshipAtoB,
              person_a: r.personA,
              person_b: r.personB,
              kinship: r.kinshipAtoB,
            })),
            milestones: photoKinship.contextualMilestones,
          };
          if (!item.description && photoKinship.suggestedCaption) {
            item.enriched_family_caption = photoKinship.suggestedCaption;
          }
        }
      } catch {}
    }

    // Update in cachedMediaList if present
    if (this.cachedMediaList) {
      const idx = this.cachedMediaList.findIndex(
        (f) => f.file_path === resolved || f.filename === baseName
      );
      if (idx !== -1) {
        this.cachedMediaList[idx] = item;
      }
    }

    return item;
  }

  async getMediaSidecar(target: string): Promise<any> {
    const trimmed = target.trim();
    this.db.initDb();

    // Check if sidecar file exists on disk
    const sidecarFile = this.findSidecarFile(trimmed);
    if (sidecarFile && fs.existsSync(sidecarFile)) {
      try {
        const raw = fs.readFileSync(sidecarFile, 'utf-8');
        return JSON.parse(raw);
      } catch (err) {
        throw new BadRequestException(`Failed to read sidecar file: ${err}`);
      }
    }

    // Check database records if sidecar file is not on disk
    const allMeta = this.db.getAllMediaMetadata();
    const meta = allMeta[trimmed] || allMeta[path.basename(trimmed).toLowerCase()];
    const faces = this.db.getFacesBySourceFile(trimmed);

    if (meta || faces.length > 0) {
      return {
        file: trimmed,
        filename: path.basename(trimmed),
        description: meta?.description || null,
        description_ru: meta?.description_ru || null,
        summary: meta?.summary || null,
        summary_ru: meta?.summary_ru || null,
        gemini_analysis: {
          description: meta?.description || null,
          description_ru: meta?.description_ru || null,
          summary: meta?.summary || null,
          summary_ru: meta?.summary_ru || null,
          environment: meta?.environment || null,
          lighting: meta?.lighting || null,
          lighting_ru: meta?.lighting_ru || null,
          weather: meta?.weather || null,
          weather_ru: meta?.weather_ru || null,
          time_of_day: meta?.time_of_day || null,
          time_of_day_ru: meta?.time_of_day_ru || null,
          ocr_text: meta?.ocr_text || null,
          exif_analysis: meta?.exif_analysis || null,
          exif_analysis_ru: meta?.exif_analysis_ru || null,
          transcription: meta?.transcription || null,
          transcription_ru: meta?.transcription_ru || null,
          timeline_events: meta?.timeline_events || null,
        },
        faces: faces,
        face_names: Array.from(new Set(faces.map((f: any) => f.name).filter(Boolean))),
      };
    }

    // Fallback: Query remote cataloger daemon API
    try {
      const res = await axios.get(
        `${this.catalogerBaseUrl}/api/media/sidecar?file=${encodeURIComponent(trimmed)}`,
        { timeout: 4000 }
      );
      if (res.data && typeof res.data === 'object' && res.data.file_path) {
        const sdata = res.data;
        const outFolder = this.config.outputFolder;
        if (!fs.existsSync(outFolder)) {
          fs.mkdirSync(outFolder, { recursive: true });
        }
        const localSidecarPath = path.join(outFolder, `${path.basename(trimmed)}.json`);
        try {
          fs.writeFileSync(localSidecarPath, JSON.stringify(sdata, null, 2), 'utf-8');
        } catch {
          // ignore
        }

        const ga = sdata.gemini_analysis || sdata.analysis || sdata.metadata || {};
        this.db.saveSyncRecord({
          filePath: trimmed,
          fileSize: sdata.file_size || 0,
          mtime: sdata.mtime || 0,
          status: 'PROCESSED',
          sidecarPath: localSidecarPath,
        });
        this.db.saveMediaMetadata(trimmed, {
          summary: ga.summary || sdata.summary,
          summary_ru: ga.summary_ru || sdata.summary_ru,
          description: ga.description || sdata.description,
          description_ru: ga.description_ru || sdata.description_ru,
          environment: ga.environment || sdata.environment,
          lighting: ga.lighting || sdata.lighting,
          lighting_ru: ga.lighting_ru || sdata.lighting_ru,
          weather: ga.weather || sdata.weather,
          weather_ru: ga.weather_ru || sdata.weather_ru,
          time_of_day: ga.time_of_day || sdata.time_of_day,
          time_of_day_ru: ga.time_of_day_ru || sdata.time_of_day_ru,
          ocr_text: ga.ocr_text || sdata.ocr_text,
          exif_analysis: ga.exif_analysis || sdata.exif_analysis,
          exif_analysis_ru: ga.exif_analysis_ru || sdata.exif_analysis_ru,
          transcription: ga.transcription || sdata.transcription,
          transcription_ru: ga.transcription_ru || sdata.transcription_ru,
          timeline_events: ga.timeline_events || sdata.timeline_events,
          camera_make: sdata.exif?.camera_make || null,
          camera_model: sdata.exif?.camera_model || null,
          location_name: ga.location_name || null,
          media_type: sdata.media_type || 'image',
        });

        if (Array.isArray(sdata.faces) && sdata.faces.length > 0) {
          this.db.saveMediaFaces(trimmed, sdata.faces);
        }

        return sdata;
      }
    } catch {
      // ignore
    }

    throw new NotFoundException(`Sidecar metadata not found for '${trimmed}'`);
  }

  async getFacesForFile(file: string): Promise<any[]> {
    if (!file || !file.trim()) {
      throw new BadRequestException('File parameter cannot be empty');
    }
    this.db.initDb();
    const trimmed = file.trim();
    let faces = this.db.getFacesBySourceFile(trimmed);
    if (faces.length > 0) {
      return faces;
    }

    // Fallback: check sidecar on disk
    const sidecarFile = this.findSidecarFile(trimmed);
    if (sidecarFile && fs.existsSync(sidecarFile)) {
      try {
        const raw = fs.readFileSync(sidecarFile, 'utf-8');
        const sdata = JSON.parse(raw);
        const rawFaces = sdata.faces || sdata.detected_faces || sdata.gemini_analysis?.faces || [];
        if (Array.isArray(rawFaces) && rawFaces.length > 0) {
          const dedupMap = new Map<string, any>();
          for (let idx = 0; idx < rawFaces.length; idx++) {
            const item = rawFaces[idx];
            if (typeof item === 'string') {
              const fid = `face_${path.basename(trimmed)}_${idx}`;
              if (!dedupMap.has(fid)) {
                dedupMap.set(fid, {
                  face_id: fid,
                  name: item,
                  confidence: 1.0,
                  is_reference: !item.startsWith('face_') ? 1 : 0,
                  source_file: trimmed,
                });
              }
            } else if (item && typeof item === 'object') {
              const fid = item.face_id || item.id || `face_${path.basename(trimmed)}_${idx}`;
              if (!dedupMap.has(fid)) {
                const name = item.name || item.person_name || `face_${idx}`;
                dedupMap.set(fid, {
                  face_id: fid,
                  person_id: item.person_id || null,
                  name: name,
                  confidence: typeof item.confidence === 'number' ? item.confidence : 0.95,
                  bbox: item.bbox || null,
                  image_path: item.image_path || item.crop_path || item.image || null,
                  time_start: item.time_start || null,
                  time_end: item.time_end || null,
                  is_reference: item.is_reference !== undefined ? (item.is_reference ? 1 : 0) : (name && !name.startsWith('face_') ? 1 : 0),
                  source_file: trimmed,
                });
              }
            }
          }

          const sidecarFaces = Array.from(dedupMap.values());

          // Ingest into database
          try {
            this.db.saveMediaFaces(trimmed, sidecarFaces);
          } catch {
            // ignore
          }

          return sidecarFaces;
        }
      } catch {
        // ignore
      }
    }

    // Fallback: query remote cataloger faces API
    try {
      const res = await axios.get(
        `${this.catalogerBaseUrl}/api/media/faces-for-file?file=${encodeURIComponent(trimmed)}`,
        { timeout: 4000 }
      );
      if (Array.isArray(res.data) && res.data.length > 0) {
        this.db.saveMediaFaces(trimmed, res.data);
        return res.data;
      }
    } catch {
      // ignore
    }

    return [];
  }

  addPersonToFile(file: string, name: string) {
    if (!file || !file.trim()) throw new BadRequestException('File parameter cannot be empty');
    if (!name || !name.trim()) throw new BadRequestException('Person name cannot be empty');

    const trimmedFile = file.trim();
    const trimmedName = name.trim();

    this.db.initDb();
    const res = this.db.addPersonToMediaFile(trimmedFile, trimmedName);

    // Sync with sidecar JSON on disk if exists
    const sidecarFile = this.findSidecarFile(trimmedFile);
    if (sidecarFile && fs.existsSync(sidecarFile)) {
      try {
        const raw = fs.readFileSync(sidecarFile, 'utf-8');
        const sdata = JSON.parse(raw);
        if (!Array.isArray(sdata.faces)) sdata.faces = [];
        if (!Array.isArray(sdata.face_names)) sdata.face_names = [];

        sdata.faces.push({
          face_id: res.face_id,
          person_id: res.person_id,
          name: trimmedName,
          confidence: 1.0,
          is_reference: 1,
        });

        if (!sdata.face_names.includes(trimmedName)) {
          sdata.face_names.push(trimmedName);
        }

        fs.writeFileSync(sidecarFile, JSON.stringify(sdata, null, 2), 'utf-8');
      } catch {
        // ignore sidecar write error
      }
    }

    this.invalidateCache();

    return {
      status: 'success',
      message: `Person '${trimmedName}' successfully linked to file.`,
      data: res,
    };
  }

  removeFaceFromFile(file: string, faceId: string) {
    if (!file || !file.trim()) throw new BadRequestException('File parameter cannot be empty');
    if (!faceId || !faceId.trim()) throw new BadRequestException('Face ID cannot be empty');

    const trimmedFile = file.trim();
    const trimmedFaceId = faceId.trim();

    this.db.initDb();
    this.db.removeFaceFromMediaFile(trimmedFile, trimmedFaceId);

    // Sync with sidecar JSON on disk if exists
    const sidecarFile = this.findSidecarFile(trimmedFile);
    if (sidecarFile && fs.existsSync(sidecarFile)) {
      try {
        const raw = fs.readFileSync(sidecarFile, 'utf-8');
        const sdata = JSON.parse(raw);
        if (Array.isArray(sdata.faces)) {
          sdata.faces = sdata.faces.filter((f: any) => (typeof f === 'string' ? f !== trimmedFaceId : f.face_id !== trimmedFaceId));
          sdata.face_names = Array.from(new Set(sdata.faces.map((f: any) => (typeof f === 'string' ? f : f.name)).filter(Boolean)));
          fs.writeFileSync(sidecarFile, JSON.stringify(sdata, null, 2), 'utf-8');
        }
      } catch {
        // ignore sidecar write error
      }
    }

    this.invalidateCache();

    return {
      status: 'success',
      message: `Face/Person '${trimmedFaceId}' removed from file.`,
    };
  }

  /**
   * Update metadata attributes for a media file, synchronizing changes
   * to both the SQLite database and the local sidecar JSON file.
   */
  async updateMediaMetadata(dto: UpdateMediaMetadataDto): Promise<any> {
    if (!dto.file || !dto.file.trim()) {
      throw new BadRequestException('File parameter cannot be empty');
    }

    const trimmedFile = dto.file.trim();
    let resolvedFile: string;
    try {
      resolvedFile = this.resolveMediaFilePath(trimmedFile);
    } catch {
      resolvedFile = trimmedFile;
    }

    this.db.initDb();

    // Prepare tags array / string
    let parsedTags: string[] = [];
    if (Array.isArray(dto.tags)) {
      parsedTags = dto.tags.map((t) => String(t).trim()).filter(Boolean);
    } else if (typeof dto.tags === 'string' && dto.tags.trim()) {
      parsedTags = dto.tags.split(',').map((t) => t.trim()).filter(Boolean);
    }

    const dbUpdates: Record<string, any> = {
      ...dto,
      tags: parsedTags,
    };
    delete dbUpdates.file;

    // 1. Update SQLite Database
    const updatedDbRecord = this.db.updateMediaMetadata(resolvedFile, dbUpdates);

    // 2. Synchronize Sidecar JSON file on disk
    let sidecarFile = this.findSidecarFile(resolvedFile);
    if (!sidecarFile) {
      const outFolder = this.config.outputFolder;
      if (!fs.existsSync(outFolder)) {
        fs.mkdirSync(outFolder, { recursive: true });
      }
      sidecarFile = path.join(outFolder, `${path.basename(resolvedFile)}.json`);
    }

    try {
      let sidecarData: any = {};
      if (fs.existsSync(sidecarFile)) {
        try {
          const raw = fs.readFileSync(sidecarFile, 'utf-8');
          sidecarData = JSON.parse(raw);
        } catch {
          sidecarData = {};
        }
      }

      // Merge into sidecar metadata/analysis structure
      if (!sidecarData.gemini_analysis && !sidecarData.analysis && !sidecarData.metadata) {
        sidecarData.gemini_analysis = {};
      }
      const targetAnalysis = sidecarData.gemini_analysis || sidecarData.analysis || sidecarData.metadata;

      if (dto.summary !== undefined) {
        targetAnalysis.summary = dto.summary;
        sidecarData.summary = dto.summary;
      }
      if (dto.summary_ru !== undefined) {
        targetAnalysis.summary_ru = dto.summary_ru;
        sidecarData.summary_ru = dto.summary_ru;
      }
      if (dto.description !== undefined) {
        targetAnalysis.description = dto.description;
        sidecarData.description = dto.description;
      }
      if (dto.description_ru !== undefined) {
        targetAnalysis.description_ru = dto.description_ru;
        sidecarData.description_ru = dto.description_ru;
      }
      if (dto.environment !== undefined) {
        targetAnalysis.environment = dto.environment;
        sidecarData.environment = dto.environment;
      }
      if (dto.lighting !== undefined) {
        targetAnalysis.lighting = dto.lighting;
        sidecarData.lighting = dto.lighting;
      }
      if (dto.lighting_ru !== undefined) {
        targetAnalysis.lighting_ru = dto.lighting_ru;
        sidecarData.lighting_ru = dto.lighting_ru;
      }
      if (dto.weather !== undefined) {
        targetAnalysis.weather = dto.weather;
        sidecarData.weather = dto.weather;
      }
      if (dto.weather_ru !== undefined) {
        targetAnalysis.weather_ru = dto.weather_ru;
        sidecarData.weather_ru = dto.weather_ru;
      }
      if (dto.time_of_day !== undefined) {
        targetAnalysis.time_of_day = dto.time_of_day;
        sidecarData.time_of_day = dto.time_of_day;
      }
      if (dto.time_of_day_ru !== undefined) {
        targetAnalysis.time_of_day_ru = dto.time_of_day_ru;
        sidecarData.time_of_day_ru = dto.time_of_day_ru;
      }
      if (dto.ocr_text !== undefined) {
        targetAnalysis.ocr_text = dto.ocr_text;
        sidecarData.ocr_text = dto.ocr_text;
      }
      if (dto.location_name !== undefined) {
        targetAnalysis.location_name = dto.location_name;
        sidecarData.location_name = dto.location_name;
      }
      if (dto.camera_make !== undefined) {
        if (!sidecarData.exif) sidecarData.exif = {};
        sidecarData.exif.camera_make = dto.camera_make;
        sidecarData.camera_make = dto.camera_make;
      }
      if (dto.camera_model !== undefined) {
        if (!sidecarData.exif) sidecarData.exif = {};
        sidecarData.exif.camera_model = dto.camera_model;
        sidecarData.camera_model = dto.camera_model;
      }
      if (dto.lens_model !== undefined) {
        if (!sidecarData.exif) sidecarData.exif = {};
        sidecarData.exif.lens_model = dto.lens_model;
        sidecarData.lens_model = dto.lens_model;
      }
      if (dto.media_date !== undefined) {
        sidecarData.media_date = dto.media_date;
      }
      if (dto.transcription !== undefined) {
        targetAnalysis.transcription = dto.transcription;
        sidecarData.transcription = dto.transcription;
      }
      if (dto.transcription_ru !== undefined) {
        targetAnalysis.transcription_ru = dto.transcription_ru;
        sidecarData.transcription_ru = dto.transcription_ru;
      }
      if (dto.timeline_events !== undefined) {
        targetAnalysis.timeline_events = dto.timeline_events;
        sidecarData.timeline_events = dto.timeline_events;
      }
      if (dto.tags !== undefined) {
        sidecarData.tags = parsedTags;
        targetAnalysis.tags = parsedTags;
      }

      sidecarData.updated_at = new Date().toISOString();
      if (!sidecarData.file_path) {
        sidecarData.file_path = resolvedFile;
      }
      if (!sidecarData.filename) {
        sidecarData.filename = path.basename(resolvedFile);
      }

      const sidecarDir = path.dirname(sidecarFile);
      if (!fs.existsSync(sidecarDir)) {
        fs.mkdirSync(sidecarDir, { recursive: true });
      }
      fs.writeFileSync(sidecarFile, JSON.stringify(sidecarData, null, 2), 'utf-8');
    } catch (err) {
      this.logger.warn(`Sidecar sync notice for '${resolvedFile}': ${err}`);
    }

    // 3. Clear cache and re-index
    this.invalidateCache();

    return {
      status: 'success',
      message: 'Media metadata successfully updated and synchronized.',
      data: updatedDbRecord,
    };
  }
}


