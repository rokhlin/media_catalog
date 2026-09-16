import { Injectable, Logger, Inject } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import AdmZip from 'adm-zip';
import { AppConfigService } from '../config/config.service.js';
import { DatabaseService } from '../database/database.service.js';
import { FamilyTreeDatabaseService } from '../family-tree/family-tree-db.service.js';
import type {
  BackupManifest,
  BackupItemInfo,
  BackupConfigDto,
  RestoreOptions,
  RestoreResult,
} from './backup.interface.js';

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);

  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService,
    @Inject(DatabaseService) private readonly databaseService: DatabaseService,
    @Inject(FamilyTreeDatabaseService) private readonly familyTreeDbService: FamilyTreeDatabaseService,
  ) {}

  public ensureBackupDir(): string {
    const dir = this.config.backupPath;
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  public getBackupConfig(nextRunDate: string | null = null): BackupConfigDto {
    return {
      backupPath: this.ensureBackupDir(),
      cron: this.config.backupCron,
      retentionCount: this.config.backupRetentionCount,
      enabled: this.config.backupEnabled,
      nextRunDate,
    };
  }

  public async updateBackupConfig(updates: {
    cron?: string;
    retentionCount?: number;
    enabled?: boolean;
    backupPath?: string;
  }): Promise<BackupConfigDto> {
    const additionalSettings: Record<string, any> = {};

    if (updates.cron !== undefined) {
      additionalSettings.BACKUP_CRON = updates.cron.trim();
    }
    if (updates.retentionCount !== undefined) {
      additionalSettings.BACKUP_RETENTION_COUNT = Math.max(1, Number(updates.retentionCount));
    }
    if (updates.enabled !== undefined) {
      additionalSettings.BACKUP_ENABLED = Boolean(updates.enabled);
    }
    if (updates.backupPath !== undefined && updates.backupPath.trim()) {
      additionalSettings.BACKUP_PATH = updates.backupPath.trim();
    }

    this.config.saveSettings(undefined, undefined, additionalSettings);
    this.logger.log(`Updated backup configuration: ${JSON.stringify(additionalSettings)}`);
    return this.getBackupConfig();
  }

  public async listBackups(): Promise<BackupItemInfo[]> {
    const dir = this.ensureBackupDir();
    const files = fs.readdirSync(dir);
    const backups: BackupItemInfo[] = [];

    for (const file of files) {
      if (!file.endsWith('.zip')) continue;

      const fullPath = path.join(dir, file);
      try {
        const stats = fs.statSync(fullPath);
        let manifest: BackupManifest | null = null;
        let isValid = true;
        let errorMessage: string | undefined = undefined;

        try {
          const zip = new AdmZip(fullPath);
          const manifestEntry = zip.getEntry('manifest.json');
          if (manifestEntry) {
            manifest = JSON.parse(manifestEntry.getData().toString('utf8'));
          } else {
            isValid = false;
            errorMessage = 'Missing manifest.json inside archive';
          }
        } catch (zipErr: any) {
          isValid = false;
          errorMessage = `Corrupt zip archive: ${zipErr.message}`;
        }

        backups.push({
          filename: file,
          filePath: fullPath,
          sizeBytes: stats.size,
          createdAt: manifest?.timestamp || stats.mtime.toISOString(),
          trigger: manifest?.trigger || 'manual',
          description: manifest?.description,
          stats: manifest?.stats,
          isValid,
          errorMessage,
        });
      } catch (err: any) {
        this.logger.warn(`Failed to inspect backup file ${file}: ${err.message}`);
      }
    }

    // Sort newest to oldest
    return backups.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public async createBackup(options?: {
    trigger?: 'manual' | 'scheduled';
    description?: string;
    includeFaces?: boolean;
  }): Promise<BackupItemInfo> {
    const backupDir = this.ensureBackupDir();
    const timestampStr = new Date().toISOString().replace(/[:.]/g, '-');
    const backupId = `backup_${timestampStr}`;
    const zipFilename = `${backupId}.zip`;
    const finalZipPath = path.join(backupDir, zipFilename);

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'media_backup_'));

    try {
      this.logger.log(`Starting system backup [${backupId}] (trigger: ${options?.trigger || 'manual'})...`);
      const stagedFiles: string[] = [];

      // 1. Hot Backup of catalog_history.db (Metadata, Persons, Face Registry, Duplicates)
      let personsCount = 0;
      let facesCount = 0;
      let mediaItemsCount = 0;
      let syncHistoryCount = 0;

      try {
        const db = this.databaseService.getDb();
        if (db) {
          try {
            const pRow = db.prepare('SELECT count(*) as c FROM persons').get() as any;
            personsCount = pRow?.c || 0;
          } catch {}
          try {
            const fRow = db.prepare('SELECT count(*) as c FROM face_registry').get() as any;
            facesCount = fRow?.c || 0;
          } catch {}
          try {
            const mRow = db.prepare('SELECT count(*) as c FROM media_items').get() as any;
            mediaItemsCount = mRow?.c || 0;
          } catch {}
          try {
            const sRow = db.prepare('SELECT count(*) as c FROM sync_history').get() as any;
            syncHistoryCount = sRow?.c || 0;
          } catch {}

          const stagedCatalogDb = path.join(tempDir, 'catalog_history.db');
          await db.backup(stagedCatalogDb);
          stagedFiles.push('database/catalog_history.db');
        }
      } catch (err: any) {
        this.logger.error(`Error performing hot backup of catalog_history.db: ${err.message}`);
      }

      // 2. Hot Backup of family_tree.db (Kinship Data)
      let kinshipMembersCount = 0;
      let kinshipRelationshipsCount = 0;

      try {
        const ftDb = this.familyTreeDbService.getDb();
        if (ftDb) {
          try {
            const mRow = ftDb.prepare('SELECT count(*) as c FROM family_tree_members').get() as any;
            kinshipMembersCount = mRow?.c || 0;
          } catch {}
          try {
            const rRow = ftDb.prepare('SELECT count(*) as c FROM family_tree_relationships').get() as any;
            kinshipRelationshipsCount = rRow?.c || 0;
          } catch {}

          const stagedFamilyTreeDb = path.join(tempDir, 'family_tree.db');
          await ftDb.backup(stagedFamilyTreeDb);
          stagedFiles.push('database/family_tree.db');
        }
      } catch (err: any) {
        this.logger.error(`Error performing hot backup of family_tree.db: ${err.message}`);
      }

      // 3. Configuration & Feature Flags
      let featureFlagsCount = 0;
      const flagsPath = this.config.featureFlagsFilePath;
      if (fs.existsSync(flagsPath)) {
        try {
          const rawFlags = fs.readFileSync(flagsPath, 'utf8');
          const parsed = JSON.parse(rawFlags);
          featureFlagsCount = Array.isArray(parsed) ? parsed.length : (parsed?.flags?.length || 0);
          fs.writeFileSync(path.join(tempDir, 'feature_flags.json'), rawFlags, 'utf8');
          stagedFiles.push('config/feature_flags.json');
        } catch (err: any) {
          this.logger.warn(`Failed to copy feature flags: ${err.message}`);
        }
      }

      const settingsPath = this.config.settingsFilePath;
      if (fs.existsSync(settingsPath)) {
        try {
          const rawSettings = fs.readFileSync(settingsPath, 'utf8');
          try {
            const parsed = JSON.parse(rawSettings);
            if (parsed.GEMINI_API_KEY) parsed.GEMINI_API_KEY = '[REDACTED_BY_BACKUP]';
            if (parsed.gemini_api_key) parsed.gemini_api_key = '[REDACTED_BY_BACKUP]';
            fs.writeFileSync(path.join(tempDir, 'settings.json'), JSON.stringify(parsed, null, 2), 'utf8');
          } catch {
            fs.writeFileSync(path.join(tempDir, 'settings.json'), rawSettings, 'utf8');
          }
          stagedFiles.push('config/settings.json');
        } catch (err: any) {
          this.logger.warn(`Failed to copy settings.json: ${err.message}`);
        }
      }

      // Save environment configuration snapshot (sanitizing passwords / secrets)
      const envSnapshot: Record<string, string> = {
        PORT: String(this.config.port),
        CATALOGER_API_URL: this.config.catalogerApiUrl,
        INPUT_FOLDERS: JSON.stringify(this.config.inputFolders),
        OUTPUT_FOLDER: this.config.outputFolder,
        BACKUP_PATH: this.config.backupPath,
        BACKUP_CRON: this.config.backupCron,
        BACKUP_RETENTION_COUNT: String(this.config.backupRetentionCount),
        NODE_ENV: process.env.NODE_ENV || 'development',
      };
      fs.writeFileSync(path.join(tempDir, 'env_config.json'), JSON.stringify(envSnapshot, null, 2), 'utf8');
      stagedFiles.push('config/env_config.json');

      // 4. Manifest
      const manifest: BackupManifest = {
        version: '1.0',
        backupId,
        timestamp: new Date().toISOString(),
        trigger: options?.trigger || 'manual',
        description: options?.description || '',
        appVersion: '1.0.0',
        stats: {
          personsCount,
          facesCount,
          mediaItemsCount,
          syncHistoryCount,
          kinshipMembersCount,
          kinshipRelationshipsCount,
          featureFlagsCount,
        },
        files: stagedFiles,
      };
      fs.writeFileSync(path.join(tempDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

      // 5. Build ZIP archive
      const zip = new AdmZip();
      zip.addLocalFile(path.join(tempDir, 'manifest.json'));

      const stagedCatDb = path.join(tempDir, 'catalog_history.db');
      if (fs.existsSync(stagedCatDb)) {
        zip.addLocalFile(stagedCatDb, 'database');
      }

      const stagedFtDb = path.join(tempDir, 'family_tree.db');
      if (fs.existsSync(stagedFtDb)) {
        zip.addLocalFile(stagedFtDb, 'database');
      }

      const stagedFlags = path.join(tempDir, 'feature_flags.json');
      if (fs.existsSync(stagedFlags)) {
        zip.addLocalFile(stagedFlags, 'config');
      }

      const stagedSettings = path.join(tempDir, 'settings.json');
      if (fs.existsSync(stagedSettings)) {
        zip.addLocalFile(stagedSettings, 'config');
      }

      const stagedEnv = path.join(tempDir, 'env_config.json');
      if (fs.existsSync(stagedEnv)) {
        zip.addLocalFile(stagedEnv, 'config');
      }

      zip.writeZip(finalZipPath);

      const fileStat = fs.statSync(finalZipPath);
      this.logger.log(`System backup created successfully: ${finalZipPath} (${fileStat.size} bytes)`);

      // Enforce retention limit automatically
      await this.enforceRetention();

      return {
        filename: zipFilename,
        filePath: finalZipPath,
        sizeBytes: fileStat.size,
        createdAt: manifest.timestamp,
        trigger: manifest.trigger,
        description: manifest.description,
        stats: manifest.stats,
        isValid: true,
      };
    } finally {
      // Clean up temporary staging directory
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (rmErr: any) {
        this.logger.warn(`Could not remove temp backup dir ${tempDir}: ${rmErr.message}`);
      }
    }
  }

  public async restoreBackup(filename: string, options?: RestoreOptions): Promise<RestoreResult> {
    const backupDir = this.ensureBackupDir();
    const backupPath = path.join(backupDir, filename);

    if (!fs.existsSync(backupPath)) {
      throw new Error(`Backup file not found: ${filename}`);
    }

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'media_restore_'));
    const restoredComponents: string[] = [];

    try {
      const zip = new AdmZip(backupPath);
      zip.extractAllTo(tempDir, true);

      // 1. Automatic safety backup before applying any restore operation
      let safetyBackupFilename: string | undefined = undefined;
      if (options?.createSafetyBackup !== false) {
        try {
          this.logger.log('Creating automatic pre-restore safety backup snapshot...');
          const safetyBackup = await this.createBackup({
            trigger: 'manual',
            description: `Automatic safety snapshot before restoring [${filename}]`,
          });
          safetyBackupFilename = safetyBackup.filename;
        } catch (safetyErr: any) {
          this.logger.error(`Failed to create pre-restore safety backup: ${safetyErr.message}`);
        }
      }

      // Read manifest if present
      const manifestPath = path.join(tempDir, 'manifest.json');
      if (fs.existsSync(manifestPath)) {
        try {
          const manifest: BackupManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
          this.logger.log(`Restoring archive created on ${manifest.timestamp} (App: ${manifest.appVersion})`);
        } catch {}
      }

      // 2. Restore catalog_history.db (Metadata & Face Registry)
      if (options?.restoreDatabase !== false) {
        const candidateDbPaths = [
          path.join(tempDir, 'database', 'catalog_history.db'),
          path.join(tempDir, 'catalog_history.db'),
        ];
        const restoredCatalogDb = candidateDbPaths.find((p) => fs.existsSync(p));

        if (restoredCatalogDb) {
          this.logger.log('Restoring catalog_history.db...');
          // Safely close connection before overwriting
          this.databaseService.close();

          const targetDbPath = this.config.dbPath;
          const targetDir = path.dirname(targetDbPath);
          if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
          }

          // Delete WAL and SHM files to prevent corruption from old transaction logs
          for (const suffix of ['', '-wal', '-shm']) {
            const p = `${targetDbPath}${suffix}`;
            if (fs.existsSync(p)) {
              try {
                fs.unlinkSync(p);
              } catch {}
            }
          }

          fs.copyFileSync(restoredCatalogDb, targetDbPath);
          this.databaseService.reconnect();
          restoredComponents.push('database');
        }
      }

      // 3. Restore family_tree.db (Kinship Data)
      if (options?.restoreKinship !== false) {
        const candidateFtPaths = [
          path.join(tempDir, 'database', 'family_tree.db'),
          path.join(tempDir, 'family_tree.db'),
        ];
        const restoredFtDb = candidateFtPaths.find((p) => fs.existsSync(p));

        if (restoredFtDb) {
          this.logger.log('Restoring family_tree.db...');
          this.familyTreeDbService.close();

          const targetFtDbPath = this.config.familyTreeDbPath;
          const targetFtDir = path.dirname(targetFtDbPath);
          if (!fs.existsSync(targetFtDir)) {
            fs.mkdirSync(targetFtDir, { recursive: true });
          }

          for (const suffix of ['', '-wal', '-shm']) {
            const p = `${targetFtDbPath}${suffix}`;
            if (fs.existsSync(p)) {
              try {
                fs.unlinkSync(p);
              } catch {}
            }
          }

          fs.copyFileSync(restoredFtDb, targetFtDbPath);
          this.familyTreeDbService.reconnect();
          restoredComponents.push('kinship');
        }
      }

      // 4. Restore feature_flags.json
      if (options?.restoreFlags !== false) {
        const candidateFlagPaths = [
          path.join(tempDir, 'config', 'feature_flags.json'),
          path.join(tempDir, 'feature_flags.json'),
        ];
        const restoredFlags = candidateFlagPaths.find((p) => fs.existsSync(p));

        if (restoredFlags) {
          const targetFlagsPath = this.config.featureFlagsFilePath;
          const targetFlagsDir = path.dirname(targetFlagsPath);
          if (!fs.existsSync(targetFlagsDir)) {
            fs.mkdirSync(targetFlagsDir, { recursive: true });
          }
          fs.copyFileSync(restoredFlags, targetFlagsPath);
          restoredComponents.push('feature_flags');
        }
      }

      // 5. Restore settings.json
      if (options?.restoreConfig !== false) {
        const candidateSettingsPaths = [
          path.join(tempDir, 'config', 'settings.json'),
          path.join(tempDir, 'settings.json'),
        ];
        const restoredSettings = candidateSettingsPaths.find((p) => fs.existsSync(p));

        if (restoredSettings) {
          const targetSettingsPath = this.config.settingsFilePath;
          const targetSettingsDir = path.dirname(targetSettingsPath);
          if (!fs.existsSync(targetSettingsDir)) {
            fs.mkdirSync(targetSettingsDir, { recursive: true });
          }
          fs.copyFileSync(restoredSettings, targetSettingsPath);
          restoredComponents.push('settings');
        }
      }

      this.logger.log(`Restore completed successfully: ${restoredComponents.join(', ')}`);

      return {
        success: true,
        message: `Restored successfully from ${filename} (${restoredComponents.join(', ')})`,
        safetyBackupFilename,
        restoredComponents,
        timestamp: new Date().toISOString(),
      };
    } finally {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {}
    }
  }

  public async deleteBackup(filename: string): Promise<boolean> {
    const backupDir = this.ensureBackupDir();
    const filePath = path.join(backupDir, filename);

    if (!fs.existsSync(filePath)) {
      throw new Error(`Backup file does not exist: ${filename}`);
    }

    fs.unlinkSync(filePath);
    this.logger.log(`Deleted backup archive: ${filename}`);
    return true;
  }

  public async enforceRetention(excludeFilenames: string[] = []): Promise<number> {
    const retentionLimit = this.config.backupRetentionCount;
    if (retentionLimit <= 0) return 0;

    const backups = await this.listBackups();
    if (backups.length <= retentionLimit) {
      return 0;
    }

    const toDelete = backups.slice(retentionLimit);
    let deletedCount = 0;

    for (const item of toDelete) {
      if (excludeFilenames.includes(item.filename)) {
        continue;
      }
      try {
        if (fs.existsSync(item.filePath)) {
          fs.unlinkSync(item.filePath);
          deletedCount++;
          this.logger.log(`Retention policy pruned old backup: ${item.filename}`);
        }
      } catch (err: any) {
        this.logger.warn(`Failed to prune backup ${item.filename}: ${err.message}`);
      }
    }

    return deletedCount;
  }

  public async importBackupFromBuffer(buffer: Buffer, originalFilename?: string): Promise<BackupItemInfo> {
    const backupDir = this.ensureBackupDir();
    const timestampStr = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = originalFilename && originalFilename.endsWith('.zip')
      ? originalFilename
      : `imported_backup_${timestampStr}.zip`;
    const targetPath = path.join(backupDir, filename);

    // Validate that buffer is a valid zip archive
    try {
      const testZip = new AdmZip(buffer);
      const manifestEntry = testZip.getEntry('manifest.json');
      if (!manifestEntry) {
        this.logger.warn('Imported archive is missing manifest.json; importing anyway');
      }
    } catch (zipErr: any) {
      throw new Error(`Uploaded file is not a valid zip archive: ${zipErr.message}`);
    }

    fs.writeFileSync(targetPath, buffer);
    this.logger.log(`Imported backup archive saved to: ${targetPath}`);

    const stat = fs.statSync(targetPath);
    let manifest: BackupManifest | null = null;
    try {
      const zip = new AdmZip(targetPath);
      const manifestEntry = zip.getEntry('manifest.json');
      if (manifestEntry) {
        manifest = JSON.parse(manifestEntry.getData().toString('utf8'));
      }
    } catch {}

    return {
      filename,
      filePath: targetPath,
      sizeBytes: stat.size,
      createdAt: manifest?.timestamp || stat.mtime.toISOString(),
      trigger: manifest?.trigger || 'manual',
      description: manifest?.description || 'Imported backup archive',
      stats: manifest?.stats,
      isValid: true,
    };
  }

  public getBackupFilePath(filename: string): string {
    const backupDir = this.ensureBackupDir();
    const safeFilename = path.basename(filename);
    const fullPath = path.join(backupDir, safeFilename);

    if (!fs.existsSync(fullPath)) {
      throw new Error(`Backup file not found: ${safeFilename}`);
    }
    return fullPath;
  }
}
