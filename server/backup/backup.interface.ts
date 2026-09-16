export interface BackupManifest {
  version: string;
  backupId: string;
  timestamp: string;
  trigger: 'manual' | 'scheduled';
  description?: string;
  appVersion: string;
  stats: {
    personsCount: number;
    facesCount: number;
    mediaItemsCount: number;
    syncHistoryCount: number;
    kinshipMembersCount: number;
    kinshipRelationshipsCount: number;
    featureFlagsCount: number;
  };
  files: string[];
}

export interface BackupItemInfo {
  filename: string;
  filePath: string;
  sizeBytes: number;
  createdAt: string;
  trigger: 'manual' | 'scheduled';
  description?: string;
  stats?: BackupManifest['stats'];
  isValid: boolean;
  errorMessage?: string;
}

export interface BackupConfigDto {
  backupPath: string;
  cron: string;
  retentionCount: number;
  enabled: boolean;
  nextRunDate: string | null;
}

export interface RestoreOptions {
  createSafetyBackup?: boolean;
  restoreConfig?: boolean;
  restoreFlags?: boolean;
  restoreDatabase?: boolean;
  restoreKinship?: boolean;
  restoreFaces?: boolean;
}

export interface RestoreResult {
  success: boolean;
  message: string;
  safetyBackupFilename?: string;
  restoredComponents: string[];
  timestamp: string;
}
