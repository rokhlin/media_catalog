import { Injectable, Logger, Inject, BadRequestException, Optional } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import sharp from 'sharp';
import heicConvert from 'heic-convert';
import axios from 'axios';
import { AppConfigService } from '../config/config.service.js';
import { DatabaseService } from '../database/database.service.js';
import { MediaService } from '../media/media.service.js';
import { CatalogerClientService } from '../cataloger-client/cataloger.service.js';
import { LogBufferService } from '../logging/log-buffer.service.js';

export type DuplicateMatchType = 'exact' | 'visual' | 'burst';
export type DuplicateEngine = 'cpu' | 'gpu' | 'auto';
export type KeepStrategy = 'highest_resolution' | 'largest_file_size' | 'newest' | 'oldest';

export interface DuplicateScanOptions {
  engine?: DuplicateEngine;
  mode?: 'exact' | 'visual' | 'burst' | 'all';
  similarityThreshold?: number; // 0.70 to 1.00 (default 0.90)
  burstWindowSeconds?: number; // 1 to 30 (default 3.0)
  folders?: string[];
  forceRehash?: boolean;
}

export interface DuplicateItemInfo {
  filePath: string;
  filename: string;
  folder: string;
  fileSize: number;
  mtime: number;
  width?: number | null;
  height?: number | null;
  megapixels?: number | null;
  phash?: string | null;
  contentHash?: string | null;
  isImage: boolean;
  isVideo: boolean;
  isPrimary?: boolean;
  similarityToPrimary?: number;
  captureDate?: string | null;
}

export interface DuplicateGroup {
  id: string;
  matchType: DuplicateMatchType;
  similarity: number; // 0.0 to 1.0 (1.0 = exact match)
  primaryFile: DuplicateItemInfo;
  duplicates: DuplicateItemInfo[];
  totalFiles: number;
  reclaimableBytes: number;
  folderBreakdown: string[];
}

export interface DuplicateSummary {
  totalGroups: number;
  totalDuplicateFiles: number;
  totalReclaimableBytes: number;
  exactGroupsCount: number;
  visualGroupsCount: number;
  burstGroupsCount: number;
  scannedFilesCount: number;
  lastScanTime: string | null;
  engineUsed: string;
}

export interface DuplicateScanStatus {
  isScanning: boolean;
  engine: string;
  stage: string;
  current: number;
  total: number;
  percent: number;
  currentFile: string | null;
  foundGroupsCount: number;
  foundDuplicatesCount: number;
  reclaimableBytes: number;
  startedAt: number | null;
  elapsedMs: number;
  error?: string | null;
}

@Injectable()
export class DuplicatesService {
  private readonly logger = new Logger(DuplicatesService.name);

  private scanStatus: DuplicateScanStatus = {
    isScanning: false,
    engine: 'idle',
    stage: 'Idle',
    current: 0,
    total: 0,
    percent: 0,
    currentFile: null,
    foundGroupsCount: 0,
    foundDuplicatesCount: 0,
    reclaimableBytes: 0,
    startedAt: null,
    elapsedMs: 0,
    error: null,
  };

  private cancelScanRequested = false;
  private cachedGroups: DuplicateGroup[] = [];
  private lastSummary: DuplicateSummary | null = null;

  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService,
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(MediaService) private readonly mediaService: MediaService,
    @Optional() @Inject(CatalogerClientService) private readonly catalogerClient?: CatalogerClientService,
    @Optional() @Inject(LogBufferService) private readonly logBuffer?: LogBufferService,
  ) {}

  getScanStatus(): DuplicateScanStatus {
    const elapsed = this.scanStatus.startedAt ? Date.now() - this.scanStatus.startedAt : 0;
    return {
      ...this.scanStatus,
      elapsedMs: elapsed,
    };
  }

  getConfig(): any {
    return this.db.getDuplicateConfig();
  }

  saveConfig(payload: any): any {
    const saved = this.db.saveDuplicateConfig(payload);
    this.logBuffer?.info('Duplicates', 'Duplicate detection configuration updated', saved);
    return saved;
  }

  getGroups(): DuplicateGroup[] {
    return this.cachedGroups;
  }

  /**
   * Run clustering directly on stored database hashes (used by tests & on-demand queries)
   */
  async getDuplicateGroups(
    matchType: 'all' | 'exact' | 'similar' | 'visual' | 'burst' = 'all',
    similarityThreshold: number = 0.90,
    burstWindow: number = 3.0,
    keepStrategy: KeepStrategy = 'highest_resolution',
    folderScope?: string,
  ): Promise<DuplicateGroup[]> {
    const rawHashes = this.db.getAllMediaHashes();
    const items: DuplicateItemInfo[] = rawHashes.map((h: any) => {
      const ext = path.extname(h.file_path).toLowerCase();
      const isImg = Boolean((h.width && h.height) || this.config.supportedPhotoExts.has(ext));
      return {
        filePath: h.file_path,
        filename: path.basename(h.file_path),
        folder: path.dirname(h.file_path),
        fileSize: h.file_size,
        mtime: h.mtime,
        width: h.width,
        height: h.height,
        megapixels: h.width && h.height ? parseFloat(((h.width * h.height) / 1000000).toFixed(2)) : null,
        phash: h.phash,
        contentHash: h.content_hash,
        isImage: isImg,
        isVideo: this.config.supportedVideoExts.has(ext),
        captureDate: h.media_date || null,
      };
    });
    const effectiveMode: 'all' | 'exact' | 'visual' | 'burst' = matchType === 'similar' ? 'visual' : matchType;
    return await this.clusterDuplicates(
      items,
      {
        engine: 'cpu',
        mode: effectiveMode,
        similarityThreshold,
        burstWindowSeconds: burstWindow,
        folders: folderScope ? [folderScope] : [],
        forceRehash: false,
      },
      keepStrategy,
    );
  }

  getSummary(): DuplicateSummary {
    if (this.lastSummary) return this.lastSummary;

    let totalDupFiles = 0;
    let totalReclaimable = 0;
    let exactCount = 0;
    let visualCount = 0;
    let burstCount = 0;

    for (const g of this.cachedGroups) {
      totalDupFiles += g.duplicates.length;
      totalReclaimable += g.reclaimableBytes;
      if (g.matchType === 'exact') exactCount++;
      else if (g.matchType === 'visual') visualCount++;
      else if (g.matchType === 'burst') burstCount++;
    }

    return {
      totalGroups: this.cachedGroups.length,
      totalDuplicateFiles: totalDupFiles,
      totalReclaimableBytes: totalReclaimable,
      exactGroupsCount: exactCount,
      visualGroupsCount: visualCount,
      burstGroupsCount: burstCount,
      scannedFilesCount: this.scanStatus.total || 0,
      lastScanTime: this.scanStatus.startedAt ? new Date(this.scanStatus.startedAt).toISOString() : null,
      engineUsed: this.scanStatus.engine || 'idle',
    };
  }

  stopScan(): { success: boolean; message: string } {
    if (this.scanStatus.isScanning) {
      this.cancelScanRequested = true;
      this.scanStatus.stage = 'Stopping...';
      this.logBuffer?.warn('Duplicates', 'Cancellation requested for duplicate scan');
      return { success: true, message: 'Scan cancellation requested' };
    }
    return { success: true, message: 'No active scan running' };
  }

  /**
   * Start duplicate and similarity scan
   */
  async startScan(options?: DuplicateScanOptions): Promise<DuplicateScanStatus> {
    if (this.scanStatus.isScanning) {
      throw new BadRequestException('A duplicate scan is already in progress');
    }

    const cfg = this.db.getDuplicateConfig();
    const effectiveEngine = options?.engine || (cfg.default_engine as DuplicateEngine) || 'auto';
    const effectiveThreshold = options?.similarityThreshold ?? cfg.similarity_threshold ?? 0.85;
    const effectiveBurstWindow = options?.burstWindowSeconds ?? cfg.burst_window_seconds ?? 3.0;
    const effectiveMode = options?.mode || 'all';

    if (options?.forceRehash) {
      this.cachedGroups = [];
      this.lastSummary = null;
    }

    this.cancelScanRequested = false;
    this.scanStatus = {
      isScanning: true,
      engine: effectiveEngine,
      stage: 'Scanning files across sources...',
      current: 0,
      total: 0,
      percent: 0,
      currentFile: null,
      foundGroupsCount: 0,
      foundDuplicatesCount: 0,
      reclaimableBytes: 0,
      startedAt: Date.now(),
      elapsedMs: 0,
      error: null,
    };

    // Execute scan asynchronously in background so client receives immediate response
    this.executeScan({
      engine: effectiveEngine,
      mode: effectiveMode,
      similarityThreshold: effectiveThreshold,
      burstWindowSeconds: effectiveBurstWindow,
      folders: options?.folders || [],
      forceRehash: Boolean(options?.forceRehash),
    }).catch((err) => {
      this.logger.error(`Error in duplicate scan: ${err.message}`, err.stack);
      this.scanStatus.isScanning = false;
      this.scanStatus.error = err.message;
      this.scanStatus.stage = `Error: ${err.message}`;
      this.logBuffer?.error('Duplicates', `Duplicate scan failed: ${err.message}`, { error: err.message });
    });

    return this.getScanStatus();
  }

  /**
   * Background scan runner orchestrating CPU vs GPU engines
   */
  private async executeScan(opts: Required<DuplicateScanOptions>): Promise<void> {
    this.logBuffer?.info('Duplicates', `Starting duplicate scan (engine=${opts.engine}, mode=${opts.mode}, threshold=${opts.similarityThreshold})`);

    // Determine whether to use GPU AI Engine
    let useGpu = false;
    if (opts.engine === 'gpu') {
      useGpu = true;
    } else if (opts.engine === 'auto' && this.catalogerClient) {
      try {
        const conn = await this.catalogerClient.validateConnection();
        useGpu = Boolean(conn.connected);
      } catch {
        useGpu = false;
      }
    }

    if (useGpu) {
      this.scanStatus.engine = 'gpu';
      try {
        await this.runGpuScan(opts);
        return;
      } catch (err: any) {
        this.logger.warn(`GPU scan error, falling back to low-memory CPU engine: ${err.message}`);
        this.logBuffer?.warn('Duplicates', `GPU engine failed (${err.message}), seamlessly falling back to CPU engine`);
        this.scanStatus.engine = 'cpu';
      }
    } else {
      this.scanStatus.engine = 'cpu';
    }

    // Run Low-Memory CPU Engine
    await this.runCpuScan(opts);
  }

  /**
   * Helper to retrieve media files to scan, preferring cataloged database items
   * to prevent disk re-traversal and global UI media scanning triggers.
   */
  private async getFilesToScan(filterFolders?: string[]): Promise<{ filePath: string; folder: string }[]> {
    // 1. Try reading indexed files from SQLite media_items first (fast, no disk traversal, avoids triggering global scan)
    const cataloged = this.db.getAllCatalogedMediaFiles();
    if (cataloged.length > 0) {
      return this.filterByFolders(cataloged, filterFolders);
    }

    // 2. Fallback to scanning disk if database is not yet populated
    const scanned = await this.mediaService.scanInputFolders();
    return this.filterByFolders(scanned, filterFolders);
  }

  /**
   * GPU-accelerated scan delegating to media_cataloger
   */
  private async runGpuScan(opts: Required<DuplicateScanOptions>): Promise<void> {
    const baseUrl = this.config.catalogerApiUrl.replace(/\/+$/, '');
    this.scanStatus.stage = 'Gathering media files...';

    const filesToScan = await this.getFilesToScan(opts.folders);
    this.scanStatus.total = filesToScan.length;
    this.scanStatus.stage = 'GPU Tensor Duplicate Analysis...';

    const payload = {
      files: filesToScan.map((s) => s.filePath),
      mode: opts.mode,
      similarity_threshold: opts.similarityThreshold,
      burst_window_seconds: opts.burstWindowSeconds,
    };

    const res = await axios.post(`${baseUrl}/api/duplicates/scan`, payload, {
      timeout: 300000, // 5 min timeout for GPU batch
    });

    if (res.data && Array.isArray(res.data.groups)) {
      this.cachedGroups = this.formatRawGroups(res.data.groups);
      this.finishScan();
      return;
    }

    throw new Error('Invalid response from GPU duplicate service');
  }

  /**
   * Low-Memory CPU Engine designed for low-power hardware (Zimaboard / mini-PC).
   * Processes files in throttled small batches, streams hash calculations,
   * immediately frees buffers to prevent GC pressure and system hangs.
   */
  private async runCpuScan(opts: Required<DuplicateScanOptions>): Promise<void> {
    this.scanStatus.stage = 'Gathering media files...';
    const targetFiles = await this.getFilesToScan(opts.folders);

    this.scanStatus.total = targetFiles.length;
    this.scanStatus.current = 0;

    if (targetFiles.length === 0) {
      this.cachedGroups = [];
      this.finishScan();
      return;
    }

    this.scanStatus.stage = 'Computing perceptual & cryptographic hashes (CPU)...';

    const fileRecords: DuplicateItemInfo[] = [];
    const BATCH_SIZE = 12; // Small batch size to strictly cap memory usage

    for (let i = 0; i < targetFiles.length; i += BATCH_SIZE) {
      if (this.cancelScanRequested) {
        this.scanStatus.stage = 'Cancelled';
        this.scanStatus.isScanning = false;
        return;
      }

      const batch = targetFiles.slice(i, i + BATCH_SIZE);
      const batchPromises = batch.map(async (fileItem) => {
        return this.processFileHash(fileItem.filePath, opts.forceRehash);
      });

      const batchResults = await Promise.all(batchPromises);
      for (const item of batchResults) {
        if (item) {
          fileRecords.push(item);
        }
      }

      this.scanStatus.current = Math.min(i + batch.length, targetFiles.length);
      this.scanStatus.percent = Math.round((this.scanStatus.current / targetFiles.length) * 100);
      if (batch.length > 0) {
        this.scanStatus.currentFile = path.basename(batch[batch.length - 1].filePath);
      }

      // Yield event loop to allow UI responsiveness and GC cleanup on low-power CPU
      await new Promise((resolve) => setImmediate(resolve));
    }

    // Now group files by similarity rules
    this.scanStatus.stage = 'Clustering duplicates & similarity groups...';
    this.cachedGroups = await this.clusterDuplicates(fileRecords, opts);
    this.finishScan();
  }

  /**
   * Process individual file hash with disk caching & media_items reuse
   */
  private async processFileHash(filePath: string, forceRehash: boolean): Promise<DuplicateItemInfo | null> {
    try {
      if (!fs.existsSync(filePath)) return null;

      const stat = await fs.promises.stat(filePath);
      const fileSize = stat.size;
      const mtime = stat.mtimeMs / 1000;
      const ext = path.extname(filePath).toLowerCase();
      const isImage = this.config.supportedPhotoExts.has(ext);
      const isVideo = this.config.supportedVideoExts.has(ext);

      // 1. Check if hash is cached in SQLite (checks media_hashes and media_items)
      const cached = !forceRehash ? this.db.getMediaHash(filePath) : null;
      if (cached && cached.content_hash && cached.phash && (!cached.file_size || cached.file_size === fileSize)) {
        return {
          filePath,
          filename: path.basename(filePath),
          folder: path.dirname(filePath),
          fileSize,
          mtime,
          width: cached.width || null,
          height: cached.height || null,
          megapixels: cached.width && cached.height ? parseFloat(((cached.width * cached.height) / 1000000).toFixed(2)) : null,
          phash: cached.phash,
          contentHash: cached.content_hash,
          isImage,
          isVideo,
          isPrimary: false,
          captureDate: cached.media_date || null,
        };
      }

      // 2. Retrieve or compute perceptual hash & dimensions if image
      let phash: string | null = cached?.phash || null;
      let width: number | null = cached?.width || null;
      let height: number | null = cached?.height || null;

      // Only invoke Sharp if pHash is missing and file is an image
      if (isImage && !phash) {
        try {
          let sharpInput: string | Buffer = filePath;
          if (ext === '.heic' || ext === '.heif') {
            try {
              const fileBuf = await fs.promises.readFile(filePath);
              sharpInput = await (heicConvert as any)({
                buffer: fileBuf,
                format: 'JPEG',
                quality: 0.85,
              });
            } catch (heicErr: any) {
              this.logger.warn(`HEIC decoding failed for ${filePath}: ${heicErr.message}`);
              sharpInput = filePath;
            }
          }

          const imgMeta = await sharp(sharpInput, { failOn: 'none' }).metadata();
          width = imgMeta.width || null;
          height = imgMeta.height || null;

          // dHash computation: resize to 9x8 grayscale, compare adjacent pixels
          const dhashBuffer = await sharp(sharpInput, { failOn: 'none' })
            .resize(9, 8, { fit: 'fill' })
            .grayscale()
            .raw()
            .toBuffer();

          phash = this.calculateDHash(dhashBuffer);
        } catch {
          phash = null;
        }
      } else if (isVideo) {
        phash = null;
      }

      // 3. Compute cryptographic content hash if missing
      let contentHash: string | null = cached?.content_hash || null;
      if (!contentHash) {
        contentHash = await this.computeContentHash(filePath, fileSize);
      }

      // 4. Cache in SQLite
      this.db.saveMediaHash({
        filePath,
        contentHash,
        phash,
        width,
        height,
        fileSize,
        mtime,
      });

      return {
        filePath,
        filename: path.basename(filePath),
        folder: path.dirname(filePath),
        fileSize,
        mtime,
        width,
        height,
        megapixels: width && height ? parseFloat(((width * height) / 1000000).toFixed(2)) : null,
        phash,
        contentHash,
        isImage,
        isVideo,
        isPrimary: false,
        captureDate: cached?.media_date || null,
      };
    } catch {
      return null;
    }
  }

  /**
   * Fast MD5 content hash for exact duplicate detection.
   * For large files (>20MB), hashes beginning, middle, and end chunks + size asynchronously.
   */
  private async computeContentHash(filePath: string, fileSize: number): Promise<string> {
    if (fileSize <= 20 * 1024 * 1024) {
      // Full hash for files up to 20MB
      return new Promise<string>((resolve, reject) => {
        const hash = crypto.createHash('md5');
        const stream = fs.createReadStream(filePath);
        stream.on('data', (chunk) => hash.update(chunk));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', reject);
      });
    }

    // Chunked sparse hash for large video/raw files to prevent CPU/IO freezing
    const hash = crypto.createHash('md5');
    hash.update(`size:${fileSize}`);
    const fileHandle = await fs.promises.open(filePath, 'r');
    try {
      const buffer = Buffer.alloc(64 * 1024);
      // Head
      await fileHandle.read(buffer, 0, 64 * 1024, 0);
      hash.update(buffer);
      // Mid
      const mid = Math.floor(fileSize / 2);
      await fileHandle.read(buffer, 0, 64 * 1024, mid);
      hash.update(buffer);
      // Tail
      const tail = Math.max(0, fileSize - 64 * 1024);
      await fileHandle.read(buffer, 0, 64 * 1024, tail);
      hash.update(buffer);
      return hash.digest('hex');
    } finally {
      await fileHandle.close();
    }
  }

  /**
   * 64-bit difference hash (dHash) from 9x8 grayscale raw buffer
   */
  private calculateDHash(rawBuffer: Buffer): string {
    let binary = '';
    // 8 rows of 8 comparisons (9 pixels per row)
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const left = rawBuffer[row * 9 + col];
        const right = rawBuffer[row * 9 + col + 1];
        binary += left > right ? '1' : '0';
      }
    }
    // Convert 64-bit binary to 16-character hex string
    let hex = '';
    for (let i = 0; i < binary.length; i += 4) {
      const nibble = binary.substring(i, i + 4);
      hex += parseInt(nibble, 2).toString(16);
    }
    return hex.padStart(16, '0');
  }

  /**
   * Fast popcount (number of set bits) for 64-bit unsigned BigInt in O(1)
   */
  popcount64(val: bigint): number {
    let v = BigInt.asUintN(64, val);
    v = v - ((v >> 1n) & 0x5555555555555555n);
    v = (v & 0x3333333333333333n) + ((v >> 2n) & 0x3333333333333333n);
    v = (v + (v >> 4n)) & 0x0f0f0f0f0f0f0f0fn;
    v = BigInt.asUintN(64, v * 0x0101010101010101n);
    return Number(v >> 56n);
  }

  /**
   * Calculate Hamming distance between two 16-character hex perceptual hashes using fast 64-bit BigInt popcount
   */
  calculateHammingDistance(hash1: string, hash2: string): number {
    if (!hash1 || !hash2 || hash1.length !== 16 || hash2.length !== 16) return 64;
    try {
      const b1 = BigInt(`0x${hash1}`);
      const b2 = BigInt(`0x${hash2}`);
      return this.popcount64(b1 ^ b2);
    } catch {
      return 64;
    }
  }

  /**
   * Compute similarity score (0.0 to 1.0) from Hamming distance
   */
  calculateSimilarity(hash1: string, hash2: string): number {
    const dist = this.calculateHammingDistance(hash1, hash2);
    return Math.max(0, parseFloat((1.0 - dist / 64).toFixed(3)));
  }

  getItemTimestamp(item: DuplicateItemInfo): number {
    if (item.captureDate) {
      const dt = Date.parse(item.captureDate);
      if (!isNaN(dt) && dt > 0) {
        return dt / 1000;
      }
    }
    return item.mtime || 0;
  }

  /**
   * Cluster file records into exact, visual, and burst duplicate groups with non-blocking event-loop yielding
   */
  private async clusterDuplicates(
    files: DuplicateItemInfo[],
    opts: Required<DuplicateScanOptions>,
    overrideKeepStrategy?: KeepStrategy,
  ): Promise<DuplicateGroup[]> {
    const groups: DuplicateGroup[] = [];
    const assignedFiles = new Set<string>();
    const cfg = this.db.getDuplicateConfig();
    const keepStrategy = overrideKeepStrategy || (cfg?.default_keep_strategy as KeepStrategy) || 'highest_resolution';

    // 1. Exact Duplicate Clustering (identical content hash)
    if (opts.mode === 'all' || opts.mode === 'exact') {
      const hashMap = new Map<string, DuplicateItemInfo[]>();
      for (const f of files) {
        if (f.contentHash) {
          const list = hashMap.get(f.contentHash) || [];
          list.push(f);
          hashMap.set(f.contentHash, list);
        }
      }

      for (const [hash, groupMembers] of hashMap.entries()) {
        if (groupMembers.length > 1) {
          const sorted = this.rankGroupMembers(groupMembers, keepStrategy);
          const primary = sorted[0];
          primary.isPrimary = true;
          const duplicates = sorted.slice(1).map((d) => ({
            ...d,
            isPrimary: false,
            similarityToPrimary: 1.0,
          }));

          for (const m of groupMembers) {
            assignedFiles.add(m.filePath);
          }

          const reclaimable = duplicates.reduce((acc, cur) => acc + cur.fileSize, 0);
          const folders = Array.from(new Set(groupMembers.map((m) => m.folder)));

          groups.push({
            id: `exact_${hash.substring(0, 12)}`,
            matchType: 'exact',
            similarity: 1.0,
            primaryFile: primary,
            duplicates,
            totalFiles: groupMembers.length,
            reclaimableBytes: reclaimable,
            folderBreakdown: folders,
          });
        }
      }
    }

    // 2. Visual Similarity Clustering (Perceptual Hash distance <= threshold) with BigInt & periodic yielding
    if (opts.mode === 'all' || opts.mode === 'visual') {
      const remainingImages = files.filter((f) => f.isImage && f.phash && !assignedFiles.has(f.filePath));
      const maxDistance = Math.floor((1.0 - opts.similarityThreshold) * 64);

      // Pre-parse 16-hex pHash to 64-bit BigInt once to avoid millions of string parsings in inner loop
      interface PreparedVisualItem {
        info: DuplicateItemInfo;
        hashBigInt: bigint;
      }
      const prepared: PreparedVisualItem[] = [];
      for (const f of remainingImages) {
        try {
          if (f.phash && f.phash.length === 16) {
            prepared.push({
              info: f,
              hashBigInt: BigInt(`0x${f.phash}`),
            });
          }
        } catch {
          // ignore malformed hash
        }
      }

      for (let i = 0; i < prepared.length; i++) {
        const itemA = prepared[i];
        if (assignedFiles.has(itemA.info.filePath)) continue;

        const similarGroup: DuplicateItemInfo[] = [itemA.info];
        let totalSimilarity = 1.0;

        for (let j = i + 1; j < prepared.length; j++) {
          const itemB = prepared[j];
          if (assignedFiles.has(itemB.info.filePath)) continue;

          const dist = this.popcount64(itemA.hashBigInt ^ itemB.hashBigInt);
          if (dist <= maxDistance) {
            const sim = 1.0 - dist / 64;
            similarGroup.push(itemB.info);
            totalSimilarity = Math.min(totalSimilarity, sim);
          }
        }

        if (similarGroup.length > 1) {
          for (const m of similarGroup) {
            assignedFiles.add(m.filePath);
          }

          const sorted = this.rankGroupMembers(similarGroup, keepStrategy);
          const primary = sorted[0];
          primary.isPrimary = true;
          const duplicates = sorted.slice(1).map((d) => ({
            ...d,
            isPrimary: false,
            similarityToPrimary: d.phash ? this.calculateSimilarity(primary.phash!, d.phash) : opts.similarityThreshold,
          }));

          const reclaimable = duplicates.reduce((acc, cur) => acc + cur.fileSize, 0);
          const folders = Array.from(new Set(similarGroup.map((m) => m.folder)));

          groups.push({
            id: `visual_${itemA.info.phash!.substring(0, 12)}_${i}`,
            matchType: 'visual',
            similarity: parseFloat(totalSimilarity.toFixed(2)),
            primaryFile: primary,
            duplicates,
            totalFiles: similarGroup.length,
            reclaimableBytes: reclaimable,
            folderBreakdown: folders,
          });
        }

        // Yield execution to Event Loop every 100 items to keep UI responsive and stream progress
        if (i % 100 === 0) {
          this.scanStatus.stage = `Clustering visual duplicates (${Math.round((i / Math.max(1, prepared.length)) * 100)}%)...`;
          await new Promise((resolve) => setImmediate(resolve));
        }
      }
    }

    // 3. Burst Photo Series Clustering (within time delta + high visual similarity to anchor photo)
    if (opts.mode === 'all' || opts.mode === 'burst') {
      // Must be an image and must have a valid perceptual hash; without phash, visual burst match is forbidden
      const remaining = files.filter((f) => !assignedFiles.has(f.filePath) && f.isImage && f.phash);
      remaining.sort((a, b) => this.getItemTimestamp(a) - this.getItemTimestamp(b));

      let currentBurst: DuplicateItemInfo[] = [];
      const requiredSimilarity = opts.similarityThreshold ?? 0.85;

      for (let i = 0; i < remaining.length; i++) {
        const item = remaining[i];
        if (assignedFiles.has(item.filePath)) continue;

        if (currentBurst.length === 0) {
          currentBurst.push(item);
          continue;
        }

        const anchor = currentBurst[0];
        const prev = currentBurst[currentBurst.length - 1];
        const itemTime = this.getItemTimestamp(item);
        const anchorTime = this.getItemTimestamp(anchor);
        const prevTime = this.getItemTimestamp(prev);

        const timeDiffFromAnchor = Math.abs(itemTime - anchorTime);
        const timeDiffFromPrev = Math.abs(itemTime - prevTime);

        // Strict condition: within burst window relative to anchor AND within step window from prev
        const isTimeMatch = timeDiffFromAnchor <= opts.burstWindowSeconds && timeDiffFromPrev <= opts.burstWindowSeconds;
        const isFolderMatch = item.folder === anchor.folder;

        // Strict condition: candidate MUST have phash AND match anchor with high similarity
        let isVisualMatch = false;
        if (item.phash && anchor.phash) {
          const sim = this.calculateSimilarity(anchor.phash, item.phash);
          isVisualMatch = sim >= requiredSimilarity;
        }

        if (isTimeMatch && isFolderMatch && isVisualMatch) {
          currentBurst.push(item);
        } else {
          if (currentBurst.length > 1) {
            this.pushBurstGroup(currentBurst, groups, assignedFiles, keepStrategy);
          }
          currentBurst = [item];
        }
      }

      if (currentBurst.length > 1) {
        this.pushBurstGroup(currentBurst, groups, assignedFiles, keepStrategy);
      }
    }

    // Sort groups by reclaimable bytes descending so users see largest space savings first
    return groups.sort((a, b) => b.reclaimableBytes - a.reclaimableBytes);
  }

  private pushBurstGroup(
    burst: DuplicateItemInfo[],
    groups: DuplicateGroup[],
    assignedFiles: Set<string>,
    keepStrategy: KeepStrategy,
  ): void {
    for (const m of burst) assignedFiles.add(m.filePath);
    const sorted = this.rankGroupMembers(burst, keepStrategy);
    const primary = sorted[0];
    primary.isPrimary = true;

    let minSim = 1.0;
    const duplicates = sorted.slice(1).map((d) => {
      const sim = (primary.phash && d.phash)
        ? this.calculateSimilarity(primary.phash, d.phash)
        : 0.85;
      minSim = Math.min(minSim, sim);
      return {
        ...d,
        isPrimary: false,
        similarityToPrimary: parseFloat(sim.toFixed(2)),
      };
    });

    const reclaimable = duplicates.reduce((acc, cur) => acc + cur.fileSize, 0);
    const folders = Array.from(new Set(burst.map((m) => m.folder)));

    groups.push({
      id: `burst_${path.basename(primary.filePath, path.extname(primary.filePath))}`,
      matchType: 'burst',
      similarity: parseFloat(minSim.toFixed(2)),
      primaryFile: primary,
      duplicates,
      totalFiles: burst.length,
      reclaimableBytes: reclaimable,
      folderBreakdown: folders,
    });
  }

  /**
   * Smart Ranking ("Keep Best" recommendation) - Non-destructive
   */
  private rankGroupMembers(members: DuplicateItemInfo[], strategy: KeepStrategy): DuplicateItemInfo[] {
    return [...members].sort((a, b) => {
      if (strategy === 'highest_resolution') {
        const mpA = (a.width || 0) * (a.height || 0);
        const mpB = (b.width || 0) * (b.height || 0);
        if (mpB !== mpA) return mpB - mpA;
        return b.fileSize - a.fileSize;
      }
      if (strategy === 'largest_file_size') {
        if (b.fileSize !== a.fileSize) return b.fileSize - a.fileSize;
        const mpA = (a.width || 0) * (a.height || 0);
        const mpB = (b.width || 0) * (b.height || 0);
        return mpB - mpA;
      }
      if (strategy === 'newest') {
        return b.mtime - a.mtime;
      }
      if (strategy === 'oldest') {
        return a.mtime - b.mtime;
      }
      return 0;
    });
  }

  private formatRawItem(item: any): DuplicateItemInfo {
    if (!item) return item;
    return {
      filePath: item.filePath || item.file_path,
      filename: item.filename || path.basename(item.filePath || item.file_path || ''),
      folder: item.folder || path.dirname(item.filePath || item.file_path || ''),
      fileSize: item.fileSize !== undefined ? item.fileSize : item.file_size || 0,
      mtime: item.mtime || 0,
      width: item.width || null,
      height: item.height || null,
      megapixels: item.megapixels !== undefined ? item.megapixels : (item.width && item.height ? parseFloat(((item.width * item.height) / 1000000).toFixed(2)) : null),
      phash: item.phash || null,
      contentHash: item.contentHash || item.content_hash || null,
      isImage: item.isImage !== undefined ? item.isImage : (item.is_image !== undefined ? item.is_image : true),
      isVideo: item.isVideo !== undefined ? item.isVideo : (item.is_video !== undefined ? item.is_video : false),
      isPrimary: item.isPrimary !== undefined ? item.isPrimary : item.is_primary,
      similarityToPrimary: item.similarityToPrimary !== undefined ? item.similarityToPrimary : item.similarity_to_primary,
      captureDate: item.captureDate || item.capture_date,
    };
  }

  private formatRawGroups(rawGroups: any[]): DuplicateGroup[] {
    return rawGroups.map((g, idx) => ({
      id: g.id || `group_${idx}`,
      matchType: g.match_type || g.matchType || 'visual',
      similarity: g.similarity || 0.9,
      primaryFile: this.formatRawItem(g.primary_file || g.primaryFile),
      duplicates: (g.duplicates || []).map((d: any) => this.formatRawItem(d)),
      totalFiles: g.total_files || (g.duplicates ? g.duplicates.length + 1 : 1),
      reclaimableBytes: g.reclaimable_bytes || g.reclaimableBytes || 0,
      folderBreakdown: g.folder_breakdown || g.folderBreakdown || [],
    }));
  }

  private filterByFolders(scanned: { filePath: string; folder: string }[], filterFolders?: string[]) {
    if (!filterFolders || filterFolders.length === 0) return scanned;
    const normalizedFilters = filterFolders.map((f) => f.toLowerCase().replace(/\\/g, '/'));
    return scanned.filter((s) => {
      const norm = s.filePath.toLowerCase().replace(/\\/g, '/');
      return normalizedFilters.some((nf) => norm.startsWith(nf) || norm.includes(nf));
    });
  }

  private finishScan(): void {
    let totalDup = 0;
    let totalReclaimable = 0;
    let exactCount = 0;
    let visualCount = 0;
    let burstCount = 0;

    for (const g of this.cachedGroups) {
      totalDup += g.duplicates.length;
      totalReclaimable += g.reclaimableBytes;
      if (g.matchType === 'exact') exactCount++;
      else if (g.matchType === 'visual') visualCount++;
      else if (g.matchType === 'burst') burstCount++;
    }

    this.scanStatus.isScanning = false;
    this.scanStatus.percent = 100;
    this.scanStatus.stage = 'Completed';
    this.scanStatus.foundGroupsCount = this.cachedGroups.length;
    this.scanStatus.foundDuplicatesCount = totalDup;
    this.scanStatus.reclaimableBytes = totalReclaimable;

    this.lastSummary = {
      totalGroups: this.cachedGroups.length,
      totalDuplicateFiles: totalDup,
      totalReclaimableBytes: totalReclaimable,
      exactGroupsCount: exactCount,
      visualGroupsCount: visualCount,
      burstGroupsCount: burstCount,
      scannedFilesCount: this.scanStatus.total,
      lastScanTime: new Date().toISOString(),
      engineUsed: this.scanStatus.engine,
    };

    this.logBuffer?.info(
      'Duplicates',
      `Duplicate scan completed: Found ${this.cachedGroups.length} group(s), ${totalDup} duplicate file(s), ${parseFloat((totalReclaimable / 1024 / 1024).toFixed(2))} MB reclaimable space.`,
      this.lastSummary,
    );
  }

  // --- File Management Actions (100% User-Directed, Never Automatic) ---

  /**
   * Safely delete specified duplicate files selected by the user.
   */
  async deleteFiles(filePaths: string[]): Promise<{
    deletedCount: number;
    freedBytes: number;
    deletedFiles: string[];
    errors: Array<{ file: string; error: string }>;
  }> {
    if (!filePaths || !Array.isArray(filePaths) || filePaths.length === 0) {
      throw new BadRequestException('No files specified for deletion');
    }

    const deleted: string[] = [];
    const errors: Array<{ file: string; error: string }> = [];
    let freedBytes = 0;

    for (const fp of filePaths) {
      const accessCheck = this.mediaService.verifyFileAccess(fp);
      if (!accessCheck.accessible || !accessCheck.resolvedPath) {
        errors.push({ file: fp, error: `Unauthorized or inaccessible: ${accessCheck.error}` });
        continue;
      }

      const targetPath = accessCheck.resolvedPath;
      try {
        if (fs.existsSync(targetPath)) {
          const stat = fs.statSync(targetPath);
          freedBytes += stat.size;
          fs.unlinkSync(targetPath);
          deleted.push(targetPath);
        } else {
          deleted.push(targetPath);
        }
      } catch (err: any) {
        errors.push({ file: fp, error: err.message });
      }
    }

    // Clean up SQLite indices, recalculate cache for remaining files, and update groups
    if (deleted.length > 0) {
      this.db.deleteMediaHashes(deleted);
      this.mediaService.recalculateCacheAfterDeletion(deleted);
      this.removeDeletedFromCachedGroups(deleted);
    }

    this.logBuffer?.info(
      'Duplicates',
      `User deleted ${deleted.length} duplicate file(s) freeing ${parseFloat((freedBytes / 1024 / 1024).toFixed(2))} MB`,
      { deletedFiles: deleted, errorsCount: errors.length },
    );

    return {
      deletedCount: deleted.length,
      freedBytes,
      deletedFiles: deleted,
      errors,
    };
  }

  /**
   * Safely move duplicate files to a designated archive folder selected by the user.
   */
  async moveFiles(
    filePaths: string[],
    destinationFolder: string,
  ): Promise<{
    movedCount: number;
    movedFiles: Array<{ original: string; destination: string }>;
    errors: Array<{ file: string; error: string }>;
  }> {
    if (!filePaths || !Array.isArray(filePaths) || filePaths.length === 0) {
      throw new BadRequestException('No files specified for moving');
    }
    if (!destinationFolder || !destinationFolder.trim()) {
      throw new BadRequestException('Destination folder must be specified');
    }

    const resolvedDest = path.resolve(destinationFolder.trim());
    if (!fs.existsSync(resolvedDest)) {
      fs.mkdirSync(resolvedDest, { recursive: true });
    }

    const moved: Array<{ original: string; destination: string }> = [];
    const errors: Array<{ file: string; error: string }> = [];
    const movedPaths: string[] = [];

    for (const fp of filePaths) {
      const accessCheck = this.mediaService.verifyFileAccess(fp);
      if (!accessCheck.accessible || !accessCheck.resolvedPath) {
        errors.push({ file: fp, error: `Unauthorized or inaccessible: ${accessCheck.error}` });
        continue;
      }

      const srcPath = accessCheck.resolvedPath;
      const baseName = path.basename(srcPath);
      let targetPath = path.join(resolvedDest, baseName);

      // Handle file name collision at destination
      if (fs.existsSync(targetPath)) {
        const ext = path.extname(baseName);
        const nameWithoutExt = path.basename(baseName, ext);
        targetPath = path.join(resolvedDest, `${nameWithoutExt}_${Date.now()}${ext}`);
      }

      try {
        fs.renameSync(srcPath, targetPath);
        moved.push({ original: srcPath, destination: targetPath });
        movedPaths.push(srcPath);
      } catch (err: any) {
        // Fallback for cross-device moves (copy + unlink)
        try {
          fs.copyFileSync(srcPath, targetPath);
          fs.unlinkSync(srcPath);
          moved.push({ original: srcPath, destination: targetPath });
          movedPaths.push(srcPath);
        } catch (copyErr: any) {
          errors.push({ file: fp, error: copyErr.message });
        }
      }
    }

    if (movedPaths.length > 0) {
      this.db.deleteMediaHashes(movedPaths);
      this.mediaService.recalculateCacheAfterDeletion(movedPaths);
      this.removeDeletedFromCachedGroups(movedPaths);
    }

    this.logBuffer?.info(
      'Duplicates',
      `User moved ${moved.length} duplicate file(s) to '${resolvedDest}'`,
      { destination: resolvedDest, movedCount: moved.length },
    );

    return {
      movedCount: moved.length,
      movedFiles: moved,
      errors,
    };
  }

  private removeDeletedFromCachedGroups(deletedPaths: string[]): void {
    const deletedSet = new Set(deletedPaths.map((p) => p.replace(/\\/g, '/').toLowerCase()));
    const updated: DuplicateGroup[] = [];

    for (const group of this.cachedGroups) {
      const isPrimaryDeleted = deletedSet.has(group.primaryFile.filePath.replace(/\\/g, '/').toLowerCase());
      const remainingDups = group.duplicates.filter(
        (d) => !deletedSet.has(d.filePath.replace(/\\/g, '/').toLowerCase()),
      );

      if (isPrimaryDeleted) {
        if (remainingDups.length > 1) {
          const newPrimary = remainingDups[0];
          newPrimary.isPrimary = true;
          const nextDups = remainingDups.slice(1);
          updated.push({
            ...group,
            primaryFile: newPrimary,
            duplicates: nextDups,
            totalFiles: nextDups.length + 1,
            reclaimableBytes: nextDups.reduce((acc, cur) => acc + cur.fileSize, 0),
          });
        }
      } else {
        if (remainingDups.length > 0) {
          updated.push({
            ...group,
            duplicates: remainingDups,
            totalFiles: remainingDups.length + 1,
            reclaimableBytes: remainingDups.reduce((acc, cur) => acc + cur.fileSize, 0),
          });
        }
      }
    }

    this.cachedGroups = updated;
  }
}
