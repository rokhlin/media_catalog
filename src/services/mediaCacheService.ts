import type { GalleryMediaFile, MediaCatalogResponse } from '../models/media';
import { openDB, IDBPDatabase } from 'idb';

export interface FetchChunkOptions {
  offset?: number;
  limit?: number;
  search?: string;
  type?: 'all' | 'images' | 'videos';
  status?: 'all' | 'PROCESSED' | 'UNPROCESSED' | 'PENDING';
  face_filter?: 'all' | 'with_faces' | 'no_faces' | 'unassigned';
  person?: string;
  folder?: string;
  sort_by?: 'name' | 'date' | 'size' | 'status' | 'faces';
  sort_order?: 'asc' | 'desc';
  refresh?: boolean;
}

const DB_NAME = 'media-catalog-db';
const DB_VERSION = 1;
const STORE_NAME = 'media-files';

/**
 * High-performance client-side cache & background chunk loader for media items
 */
export class MediaCacheService {
  private cache: Map<string, GalleryMediaFile> = new Map();
  private orderedKeys: string[] = [];
  private totalCount: number = 0;
  private isPrefetching: boolean = false;
  private pendingRequests: Map<string, Promise<MediaCatalogResponse>> = new Map();
  private dbPromise: Promise<IDBPDatabase | null>;
  private initialized: boolean = false;

  constructor() {
    this.dbPromise = this.initDB();
  }

  private async initDB(): Promise<IDBPDatabase | null> {
    try {
      return await openDB(DB_NAME, DB_VERSION, {
        upgrade(db) {
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          }
        },
      });
    } catch (error) {
      console.warn('Failed to initialize IndexedDB, falling back to in-memory cache:', error);
      return null;
    }
  }

  /**
   * Initialize cache from IndexedDB
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    const db = await this.dbPromise;
    if (db) {
      try {
        const allFiles = await db.getAll(STORE_NAME);
        for (const fileRecord of allFiles) {
          const file = fileRecord.data;
          const key = file.file_path || file.filename;
          if (!this.cache.has(key)) {
            this.orderedKeys.push(key);
          }
          this.cache.set(key, file);
        }
        this.totalCount = this.cache.size;
      } catch (error) {
        console.warn('Failed to load from IndexedDB:', error);
      }
    }
    this.initialized = true;
  }

  /**
   * Clear all client-side cached files
   */
  async clear(): Promise<void> {
    this.cache.clear();
    this.orderedKeys = [];
    this.totalCount = 0;
    this.pendingRequests.clear();
    const db = await this.dbPromise;
    if (db) {
      try {
        await db.clear(STORE_NAME);
      } catch (error) {
        console.warn('Failed to clear IndexedDB:', error);
      }
    }
  }

  /**
   * Get all currently cached files in order
   */
  getAll(): GalleryMediaFile[] {
    return this.orderedKeys.map((k) => this.cache.get(k)!).filter(Boolean);
  }

  /**
   * Get file by path or filename
   */
  get(filePath: string): GalleryMediaFile | undefined {
    return this.cache.get(filePath);
  }

  /**
   * Get current cached item count
   */
  get loadedCount(): number {
    return this.cache.size;
  }

  /**
   * Get reported total from backend
   */
  get total(): number {
    return this.totalCount;
  }

  /**
   * Optimistically update or insert a file in the client cache
   */
  async upsert(file: GalleryMediaFile): Promise<void> {
    const key = file.file_path || file.filename;
    if (!this.cache.has(key)) {
      this.orderedKeys.push(key);
    }
    this.cache.set(key, file);
    const db = await this.dbPromise;
    if (db) {
      try {
        await db.put(STORE_NAME, { id: key, data: file });
      } catch (error) {
        console.warn('Failed to upsert to IndexedDB:', error);
      }
    }
  }

  /**
   * Merge new chunk of files into client cache preserving order
   */
  async mergeChunk(files: GalleryMediaFile[], total?: number): Promise<GalleryMediaFile[]> {
    if (typeof total === 'number') {
      this.totalCount = total;
    }
    const db = await this.dbPromise;
    const tx = db ? db.transaction(STORE_NAME, 'readwrite') : null;
    const store = tx ? tx.objectStore(STORE_NAME) : null;

    for (const f of files) {
      const key = f.file_path || f.filename;
      if (!this.cache.has(key)) {
        this.orderedKeys.push(key);
      }
      this.cache.set(key, f);
      if (store) {
        store.put({ id: key, data: f }).catch(() => {});
      }
    }
    
    if (tx) {
      await tx.done.catch(e => console.warn('IndexedDB transaction failed:', e));
    }
    
    return this.getAll();
  }

  /**
   * Generate cache key from request parameters
   */
  private getRequestKey(options: FetchChunkOptions): string {
    return JSON.stringify(options);
  }

  /**
   * Fetch a chunk of media files from the backend API with deduplication
   */
  async fetchChunk(options: FetchChunkOptions = {}): Promise<MediaCatalogResponse> {
    const reqKey = this.getRequestKey(options);

    // Reuse in-flight request if identical query is already pending
    if (this.pendingRequests.has(reqKey)) {
      return this.pendingRequests.get(reqKey)!;
    }

    const params = new URLSearchParams();
    if (options.offset !== undefined) params.set('offset', String(options.offset));
    if (options.limit !== undefined) params.set('limit', String(options.limit));
    if (options.search) params.set('search', options.search);
    if (options.type && options.type !== 'all') params.set('type', options.type);
    if (options.status && options.status !== 'all') params.set('status', options.status);
    if (options.face_filter && options.face_filter !== 'all') params.set('face_filter', options.face_filter);
    if (options.person && options.person !== 'all') params.set('person', options.person);
    if (options.folder) params.set('folder', options.folder);
    if (options.sort_by) params.set('sort_by', options.sort_by);
    if (options.sort_order) params.set('sort_order', options.sort_order);
    if (options.refresh) params.set('refresh', 'true');

    const promise = (async () => {
      try {
        const queryStr = params.toString();
        const url = `/api/media/files${queryStr ? `?${queryStr}` : ''}`;
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`Failed to fetch media chunk: ${res.statusText}`);
        }
        const data: MediaCatalogResponse = await res.json();
        const files = data.files || [];
        const total = data.total ?? data.total_files ?? files.length;
        const hasMore = data.hasMore ?? data.has_more ?? (options.limit ? (options.offset || 0) + files.length < total : false);

        if (options.refresh || options.offset === 0) {
          if (options.refresh) {
            await this.clear();
          }
        }

        await this.mergeChunk(files, total);

        return {
          files,
          total,
          offset: options.offset || 0,
          limit: options.limit || files.length,
          hasMore,
          stats: data.stats,
        };
      } finally {
        this.pendingRequests.delete(reqKey);
      }
    })();

    this.pendingRequests.set(reqKey, promise);
    return promise;
  }

  /**
   * Trigger background prefetch for the next chunk of media items
   */
  async prefetchNextChunk(currentOffset: number, chunkSize: number, options: Omit<FetchChunkOptions, 'offset' | 'limit'> = {}): Promise<void> {
    if (this.isPrefetching) return;
    const nextOffset = currentOffset + chunkSize;
    if (this.totalCount > 0 && nextOffset >= this.totalCount) return;

    this.isPrefetching = true;
    try {
      await this.fetchChunk({
        ...options,
        offset: nextOffset,
        limit: chunkSize,
      });
    } catch {
      // background prefetch errors are silent
    } finally {
      this.isPrefetching = false;
    }
  }

  /**
   * Remove deleted files from in-memory cache and IndexedDB
   */
  async removeFiles(filePaths: string[]): Promise<void> {
    if (!filePaths || filePaths.length === 0) return;
    const targets = new Set(filePaths.map((p) => p.replace(/\\/g, '/').toLowerCase()));

    const db = await this.dbPromise;
    const tx = db ? db.transaction(STORE_NAME, 'readwrite') : null;
    const store = tx ? tx.objectStore(STORE_NAME) : null;

    for (const key of Array.from(this.cache.keys())) {
      const normKey = key.replace(/\\/g, '/').toLowerCase();
      const item = this.cache.get(key);
      const normPath = item?.file_path ? item.file_path.replace(/\\/g, '/').toLowerCase() : '';
      const normName = item?.filename ? item.filename.toLowerCase() : '';

      if (targets.has(normKey) || (normPath && targets.has(normPath)) || (normName && targets.has(normName))) {
        this.cache.delete(key);
        if (store) {
          store.delete(key).catch(() => {});
        }
      }
    }

    this.orderedKeys = this.orderedKeys.filter((k) => this.cache.has(k));
    this.totalCount = Math.max(0, this.totalCount - filePaths.length);

    if (tx) {
      await tx.done.catch((e) => console.warn('IndexedDB transaction failed:', e));
    }
  }

  /**
   * Remove files belonging to specified folders from cache and IndexedDB
   */
  async removeFolders(folderPaths: string[]): Promise<void> {
    if (!folderPaths || folderPaths.length === 0) return;
    const normFolders = folderPaths.map((f) => f.replace(/\\/g, '/').toLowerCase().replace(/\/+$/, ''));

    const db = await this.dbPromise;
    const tx = db ? db.transaction(STORE_NAME, 'readwrite') : null;
    const store = tx ? tx.objectStore(STORE_NAME) : null;
    let removedCount = 0;

    for (const key of Array.from(this.cache.keys())) {
      const item = this.cache.get(key);
      const itemPath = (item?.file_path || key).replace(/\\/g, '/').toLowerCase();
      const itemFolder = (item?.folder || '').replace(/\\/g, '/').toLowerCase().replace(/\/+$/, '');

      const matches = normFolders.some((rf) => itemPath.startsWith(rf + '/') || itemFolder === rf);
      if (matches) {
        this.cache.delete(key);
        removedCount++;
        if (store) {
          store.delete(key).catch(() => {});
        }
      }
    }

    this.orderedKeys = this.orderedKeys.filter((k) => this.cache.has(k));
    this.totalCount = Math.max(0, this.totalCount - removedCount);

    if (tx) {
      await tx.done.catch((e) => console.warn('IndexedDB transaction failed:', e));
    }
  }

  /**
   * Update cache entries when a folder is renamed
   */
  async renameFolder(oldPath: string, newPath: string): Promise<void> {
    const normOld = oldPath.replace(/\\/g, '/').toLowerCase().replace(/\/+$/, '');
    const normNew = newPath.replace(/\\/g, '/').replace(/\/+$/, '');

    const db = await this.dbPromise;
    const tx = db ? db.transaction(STORE_NAME, 'readwrite') : null;
    const store = tx ? tx.objectStore(STORE_NAME) : null;

    for (const key of Array.from(this.cache.keys())) {
      const item = this.cache.get(key);
      if (!item) continue;
      const itemPath = (item.file_path || '').replace(/\\/g, '/');
      const itemFolder = (item.folder || '').replace(/\\/g, '/');

      let changed = false;
      if (itemPath.toLowerCase().startsWith(normOld + '/')) {
        const suffix = itemPath.slice(normOld.length);
        item.file_path = normNew + suffix;
        changed = true;
      }
      if (itemFolder.toLowerCase() === normOld) {
        item.folder = normNew;
        changed = true;
      }

      if (changed) {
        const newKey = item.file_path || item.filename;
        if (newKey !== key) {
          this.cache.delete(key);
          this.cache.set(newKey, item);
          const keyIdx = this.orderedKeys.indexOf(key);
          if (keyIdx >= 0) this.orderedKeys[keyIdx] = newKey;
          if (store) {
            store.delete(key).catch(() => {});
            store.put({ id: newKey, data: item }).catch(() => {});
          }
        }
      }
    }

    if (tx) {
      await tx.done.catch((e) => console.warn('IndexedDB transaction failed:', e));
    }
  }

  /**
   * Get caching strategy status from backend API
   */
  async getCacheStatus(): Promise<any> {
    const res = await fetch('/api/media/cache/status');
    if (!res.ok) throw new Error(`Failed fetching cache status: ${res.statusText}`);
    return res.json();
  }

  /**
   * Save caching strategy configuration to backend API
   */
  async saveCacheStrategy(config: {
    daily_automation_enabled?: boolean;
    daily_schedule_time?: string;
    incremental_only?: boolean;
  }): Promise<any> {
    const res = await fetch('/api/media/cache-strategy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    if (!res.ok) throw new Error(`Failed saving cache strategy: ${res.statusText}`);
    return res.json();
  }

  /**
   * Trigger manual recache for all or specific folder
   */
  async recache(options: { folder?: string; incremental?: boolean } = {}): Promise<any> {
    const res = await fetch('/api/media/cache/recache', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    });
    if (!res.ok) throw new Error(`Failed triggering recache: ${res.statusText}`);
    const data = await res.json();
    return data;
  }
}

export const mediaCacheService = new MediaCacheService();
