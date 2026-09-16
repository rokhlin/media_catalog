export type MediaType = 'image' | 'video' | string;
export type MediaProcessingStatus = 'PROCESSED' | 'UNPROCESSED' | 'PENDING' | string;

export interface TimelineEventItem {
  timestamp_start?: string;
  timestamp_end?: string;
  activity?: string;
  activity_ru?: string;
}

export interface FamilyMemberContext {
  name: string;
  kinshipToRoot?: string;
  category?: string;
}

export interface FamilyRelationshipContext {
  person1: string;
  person2: string;
  relationship: string;
}

export interface FamilyMilestoneContext {
  id?: string;
  personName: string;
  type?: string;
  eventType?: string;
  title: string;
  description?: string | null;
  date?: string | null;
  end_date?: string | null;
  date_is_approximate?: boolean | number;
  location?: string | null;
  category?: string;
  relativeName?: string;
  relativeRelation?: string;
}

export interface FamilyContextData {
  suggested_caption?: string;
  summary_description?: string;
  identified_members?: FamilyMemberContext[];
  relationships?: FamilyRelationshipContext[];
  milestones?: FamilyMilestoneContext[];
}

export interface ModulesStatus {
  transcribe?: boolean | null;
  faces?: boolean;
  duplicates?: boolean;
  vision?: boolean;
}

export interface MediaFileItem {
  filename: string;
  file_path?: string;
  modules_status?: ModulesStatus;
  relative_path?: string;
  absolute_path?: string;
  type?: MediaType;
  is_image?: boolean;
  is_video?: boolean;
  file_size?: number;
  mtime?: number;
  status?: MediaProcessingStatus;
  face_count?: number;
  face_names?: string[];
  capture_date?: string;
  size_bytes?: number;
  has_sidecar?: boolean;
  thumbnail_url?: string;
  duration?: number;
  resolution?: string;
  description?: string;
  description_ru?: string;
  summary?: string;
  summary_ru?: string;
  environment?: 'indoor' | 'outdoor' | 'unknown' | string;
  lighting?: string;
  lighting_ru?: string;
  weather?: string;
  weather_ru?: string;
  time_of_day?: string;
  time_of_day_ru?: string;
  ocr_text?: string;
  exif_analysis?: string;
  exif_analysis_ru?: string;
  transcription?: string;
  transcription_ru?: string;
  timeline_events?: TimelineEventItem[];
  camera_make?: string;
  camera_model?: string;
  lens_model?: string;
  location_name?: string;
  media_date?: string;
  tags?: string[];
  folder?: string;
  sidecar_path?: string;
  sidecar?: Record<string, unknown> | null;
  family_context?: FamilyContextData;
  is_vault?: boolean;
  phash?: string;
  content_hash?: string;
  width?: number;
  height?: number;
  similarity_group_id?: string;
  similar_files_count?: number;
  is_primary_in_group?: boolean;
}

export interface GalleryMediaFile extends MediaFileItem {
  faces?: Array<{
    face_id?: string;
    person_id?: string;
    name?: string;
    image_path?: string;
    confidence?: number;
    is_reference?: boolean | number;
  }>;
  has_unassigned_faces?: boolean;
  similarity_group_id?: string;
  similar_files_count?: number;
  is_primary_in_group?: boolean;
  similar_group_files?: GalleryMediaFile[];
}

export type GalleryViewMode = 'gallery' | 'list' | 'folder_tree' | 'date_grouped' | 'person_grouped' | 'similarity_grouped';

export type MediaSortField = 'name' | 'date' | 'size' | 'status' | 'faces';
export type MediaSortOrder = 'asc' | 'desc';

export interface FolderTreeNode {
  id: string;
  name: string;
  fullPath: string;
  relativePath: string;
  depth: number;
  isFolder: boolean;
  fileCount: number;
  processedCount: number;
  totalBytes: number;
  children: FolderTreeNode[];
  files: GalleryMediaFile[];
}

export interface DateGroupNode {
  key: string;
  label: string;
  year: string;
  month?: string;
  count: number;
  processedCount: number;
  files: GalleryMediaFile[];
}

export interface PersonGroupNode {
  personName: string;
  avatarUrl?: string | null;
  count: number;
  isUnassigned: boolean;
  files: GalleryMediaFile[];
}

export interface SimilarityGroupNode {
  groupId: string;
  matchType: 'exact' | 'visual' | 'burst';
  similarity: number;
  count: number;
  primaryFile: GalleryMediaFile;
  files: GalleryMediaFile[];
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
  isPrimary: boolean;
  similarityToPrimary?: number;
  captureDate?: string | null;
}

export interface DuplicateGroup {
  id: string;
  matchType: 'exact' | 'visual' | 'burst';
  similarity: number;
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

export interface DuplicateConfig {
  default_engine: 'cpu' | 'gpu' | 'auto';
  similarity_threshold: number;
  burst_window_seconds: number;
  default_keep_strategy: 'highest_resolution' | 'largest_file_size' | 'newest' | 'oldest';
  target_move_folder: string | null;
  auto_scan_on_sync: boolean;
  updated_at?: string;
}

export interface MediaCatalogResponse {
  files: GalleryMediaFile[];
  total: number;
  total_files?: number;
  offset: number;
  limit: number;
  hasMore: boolean;
  has_more?: boolean;
  stats?: {
    total: number;
    processed: number;
    photos: number;
    videos: number;
  };
}


