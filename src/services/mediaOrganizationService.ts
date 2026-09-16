import { wrap, Remote } from 'comlink';
import type { MediaOrganizationWorker, FilterCriteria } from './mediaOrganization.worker';
import type {
  GalleryMediaFile,
  FolderTreeNode,
  DateGroupNode,
  PersonGroupNode,
  MediaSortField,
  MediaSortOrder,
} from '../models/media';

export type { FilterCriteria };

class MediaOrganizationServiceProxy {
  private worker: Worker;
  private proxy: Remote<MediaOrganizationWorker>;

  constructor() {
    this.worker = new Worker(new URL('./mediaOrganization.worker.ts', import.meta.url), { type: 'module' });
    this.proxy = wrap<MediaOrganizationWorker>(this.worker);
  }

  async buildFolderTree(files: GalleryMediaFile[]): Promise<FolderTreeNode[]> {
    return this.proxy.buildFolderTree(files);
  }

  async groupByDate(files: GalleryMediaFile[], language: 'en' | 'ru' = 'en'): Promise<DateGroupNode[]> {
    return this.proxy.groupByDate(files, language);
  }

  async groupByPerson(
    files: GalleryMediaFile[],
    knownPersons?: Array<{ name: string; avatarUrl?: string | null }>
  ): Promise<PersonGroupNode[]> {
    return this.proxy.groupByPerson(files, knownPersons);
  }

  async sortMediaFiles(files: GalleryMediaFile[], field: MediaSortField, order: MediaSortOrder = 'desc'): Promise<GalleryMediaFile[]> {
    return this.proxy.sortMediaFiles(files, field, order);
  }

  async filterMediaFiles(files: GalleryMediaFile[], criteria: FilterCriteria): Promise<GalleryMediaFile[]> {
    return this.proxy.filterMediaFiles(files, criteria);
  }

  async groupBySimilarity(
    files: GalleryMediaFile[],
    similarityThreshold = 0.90,
    burstWindowSec = 3.0
  ): Promise<GalleryMediaFile[]> {
    return this.proxy.groupBySimilarity(files, similarityThreshold, burstWindowSec);
  }

  /**
   * Helper formatting bytes (still synchronous, kept on main thread for quick UI updates)
   */
  formatBytes(bytes?: number): string {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  /**
   * Helper formatting date (still synchronous, kept on main thread)
   */
  formatDate(mtime?: number, language: 'en' | 'ru' = 'en'): string {
    if (!mtime) return '';
    try {
      const d = new Date(mtime * 1000);
      const loc = language === 'ru' ? 'ru-RU' : 'en-US';
      return d.toLocaleDateString(loc) + ' ' + d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }
}

export const mediaOrganizationService = new MediaOrganizationServiceProxy();

