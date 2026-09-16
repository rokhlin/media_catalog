export type PipelineStatus =
  | 'idle'
  | 'running'
  | 'paused'
  | 'completed'
  | 'stopped'
  | 'failed'
  | 'checking';

export interface ProgressInfo {
  current: number;
  total: number;
  percent: number;
  current_file?: string;
  stage?: string;
}

export interface QueueInfo {
  max_workers: number;
  active_workers: number;
  in_flight_files: string[];
  completed: number;
  failed: number;
  total: number;
}

export interface StatusInfo {
  status: PipelineStatus;
  current_task: 'sync' | 'single' | string | null;
  error: string | null;
  progress: ProgressInfo | null;
  queue?: QueueInfo | null;
  connected?: boolean;
  cataloger_url?: string;
}
