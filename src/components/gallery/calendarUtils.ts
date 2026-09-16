import type { GalleryMediaFile } from '../../models/media';

export interface CalendarDay {
  date: Date;
  dateKey: string; // YYYY-MM-DD
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  files: GalleryMediaFile[];
}

/**
 * Extracts a normalized Date object from media file metadata.
 * Prefers capture_date, falls back to mtime.
 */
export function getMediaDate(file: GalleryMediaFile): Date | null {
  if (file.capture_date) {
    const parsed = new Date(file.capture_date);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  if (file.mtime) {
    const parsed = new Date(file.mtime * 1000);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

/**
 * Formats a Date to YYYY-MM-DD key.
 */
export function formatDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Resolves the thumbnail URL for a media file, using the backend /api/media/thumbnail endpoint.
 */
export function getThumbnailSrc(file: GalleryMediaFile, size: number = 300): string {
  if (file.thumbnail_url) return file.thumbnail_url;
  const path = file.file_path || file.absolute_path || file.relative_path || file.filename || '';
  if (!path) return '';
  return `/api/media/thumbnail?path=${encodeURIComponent(path)}&size=${size}`;
}

