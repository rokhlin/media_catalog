export type ContentCategory =
  | 'documents'
  | 'social'
  | 'nature'
  | 'animals'
  | 'screenshots'
  | 'non_family'
  | 'other';

export interface OrganizationCriteria {
  groupByYear?: boolean;
  groupByMonth?: boolean;
  eventName?: string;
  contentTypes?: ContentCategory[];
  folderTemplate?: string; // e.g. "{year}/{month}/{event}" or "{year}/{contentType}"
  filenameTemplate?: string; // e.g. "{original}" or "{year}_{month}_{event}_{original}"
  writeTagsToFile?: boolean;
  assignTags?: boolean;
  targetBaseFolder?: string;
  filterFolders?: string[];
  resetPrevious?: boolean;
}

export interface OrganizationJobStatus {
  id: string;
  status: 'idle' | 'analyzing' | 'ready_for_review' | 'applying' | 'completed' | 'cancelled' | 'error';
  mode: 'automatic' | 'semi_automatic';
  criteria: OrganizationCriteria;
  total_files: number;
  processed_files: number;
  percent: number;
  current_file?: string;
  message?: string;
  error?: string;
  created_at: string;
  updated_at: string;
}

export interface OrganizationItemDto {
  id: number;
  job_id: string;
  media_id?: string | null;
  original_path: string;
  original_folder?: string | null;
  original_filename: string;
  target_folder?: string | null;
  target_filename?: string | null;
  target_path?: string | null;
  detected_year?: number | null;
  detected_month?: number | null;
  detected_content_type?: ContentCategory | string | null;
  assigned_tags: string[];
  status: 'pending' | 'approved' | 'applied' | 'skipped' | 'rolled_back' | 'error';
  applied_at?: string | null;
  error?: string | null;
}
