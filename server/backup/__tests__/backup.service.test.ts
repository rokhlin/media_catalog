import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import AdmZip from 'adm-zip';
import { BackupService } from '../backup.service.js';
import { BackupSchedulerService } from '../backup-scheduler.service.js';
import { AppConfigService } from '../../config/config.service.js';
import { DatabaseService } from '../../database/database.service.js';
import { FamilyTreeDatabaseService } from '../../family-tree/family-tree-db.service.js';

describe('BackupService & Scheduler', () => {
  let tmpDir: string;
  let backupDir: string;
  let dbPath: string;
  let ftDbPath: string;
  let settingsPath: string;
  let flagsPath: string;

  let configService: AppConfigService;
  let dbService: DatabaseService;
  let ftDbService: FamilyTreeDatabaseService;
  let backupService: BackupService;
  let schedulerService: BackupSchedulerService;

  before(() => {
    tmpDir = path.join(
      process.cwd(),
      'media_output',
      `test_backup_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    );
    backupDir = path.join(tmpDir, 'backups');
    dbPath = path.join(tmpDir, 'catalog_history.db');
    ftDbPath = path.join(tmpDir, 'family_tree.db');
    settingsPath = path.join(tmpDir, 'settings.json');
    flagsPath = path.join(tmpDir, 'feature_flags.json');

    fs.mkdirSync(backupDir, { recursive: true });

    // Set test environment variables
    process.env.BACKUP_PATH = backupDir;
    process.env.DB_PATH = dbPath;
    process.env.FAMILY_TREE_DB_PATH = ftDbPath;
    process.env.SETTINGS_PATH = settingsPath;
    process.env.FEATURE_FLAGS_PATH = flagsPath;
    process.env.BACKUP_RETENTION_COUNT = '3';
    process.env.BACKUP_CRON = '0 2 * * *';
    process.env.BACKUP_ENABLED = 'true';

    // Create dummy feature flags & settings files
    fs.writeFileSync(flagsPath, JSON.stringify([{ key: 'test_flag', isEnabled: true }]), 'utf8');
    fs.writeFileSync(settingsPath, JSON.stringify({ MODEL_PROVIDER: 'gemini', BACKUP_RETENTION_COUNT: 3 }), 'utf8');

    configService = new AppConfigService();
    dbService = new DatabaseService(configService);
    dbService.initDb();

    // Populate some data in database
    const db = dbService.getDb();
    db.prepare("INSERT OR REPLACE INTO persons (id, name) VALUES ('p1', 'Alice')").run();
    db.prepare("INSERT OR REPLACE INTO face_registry (face_id, person_id, name) VALUES ('f1', 'p1', 'Alice')").run();

    ftDbService = new FamilyTreeDatabaseService(configService);
    ftDbService.initDb();

    backupService = new BackupService(configService, dbService, ftDbService);
    schedulerService = new BackupSchedulerService(configService, backupService);
  });

  after(() => {
    try {
      schedulerService.stopScheduler();
      dbService.close();
      ftDbService.close();
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch {
      // ignore
    }
  });

  it('should retrieve correct initial backup configuration', () => {
    const config = backupService.getBackupConfig();
    assert.strictEqual(config.enabled, true);
    assert.strictEqual(config.cron, '0 2 * * *');
    assert.strictEqual(config.retentionCount, 3);
    assert.ok(config.backupPath.includes('backups'));
  });

  it('should update backup configuration', async () => {
    const updated = await backupService.updateBackupConfig({
      cron: '0 4 * * *',
      retentionCount: 5,
      enabled: false,
    });

    assert.strictEqual(updated.cron, '0 4 * * *');
    assert.strictEqual(updated.retentionCount, 5);
    assert.strictEqual(updated.enabled, false);
  });

  it('should create an on-demand system backup archive', async () => {
    const result = await backupService.createBackup({
      trigger: 'manual',
      description: 'Test Unit Backup',
    });

    assert.ok(result.filename.endsWith('.zip'));
    assert.ok(result.sizeBytes > 0);
    assert.strictEqual(result.trigger, 'manual');
    assert.strictEqual(result.description, 'Test Unit Backup');
    assert.strictEqual(result.isValid, true);
    assert.ok(fs.existsSync(result.filePath));

    // Verify zip archive contents
    const zip = new AdmZip(result.filePath);
    const entries = zip.getEntries().map((e) => e.entryName.replace(/\\/g, '/'));

    assert.ok(entries.includes('manifest.json'), 'Must contain manifest.json');
    assert.ok(entries.includes('database/catalog_history.db'), 'Must contain catalog_history.db');
    assert.ok(entries.includes('database/family_tree.db'), 'Must contain family_tree.db');
    assert.ok(entries.includes('config/settings.json'), 'Must contain settings.json');
    assert.ok(entries.includes('config/feature_flags.json'), 'Must contain feature_flags.json');
    assert.ok(entries.includes('config/env_config.json'), 'Must contain env_config.json');

    // Read and verify manifest stats
    const manifestEntry = zip.getEntry('manifest.json');
    assert.ok(manifestEntry);
    const manifest = JSON.parse(manifestEntry.getData().toString('utf8'));
    assert.strictEqual(manifest.trigger, 'manual');
    assert.strictEqual(manifest.stats.personsCount, 1);
    assert.strictEqual(manifest.stats.facesCount, 1);
  });

  it('should list backups ordered by creation date descending', async () => {
    // Create second backup
    await new Promise((r) => setTimeout(r, 100));
    await backupService.createBackup({
      trigger: 'scheduled',
      description: 'Second Scheduled Backup',
    });

    const list = await backupService.listBackups();
    assert.ok(list.length >= 2);
    assert.strictEqual(list[0].description, 'Second Scheduled Backup');
    assert.strictEqual(list[0].trigger, 'scheduled');
  });

  it('should automatically enforce retention limit', async () => {
    // Configure retention limit to 2
    await backupService.updateBackupConfig({ retentionCount: 2 });

    // Create 2 more backups (total would be 4, should be trimmed to 2)
    await backupService.createBackup({ description: 'Backup 3' });
    await backupService.createBackup({ description: 'Backup 4' });

    const list = await backupService.listBackups();
    assert.strictEqual(list.length, 2);
    assert.strictEqual(list[0].description, 'Backup 4');
  });

  it('should restore from an existing backup archive', async () => {
    // Current person in DB is Alice. Let's add Bob, then restore the earlier backup
    const db = dbService.getDb();
    db.prepare("INSERT OR REPLACE INTO persons (id, name) VALUES ('p2', 'Bob')").run();
    const countBefore = (db.prepare('SELECT count(*) as c FROM persons').get() as any).c;
    assert.strictEqual(countBefore, 2);

    const list = await backupService.listBackups();
    const targetBackup = list[list.length - 1]; // Oldest backup (had only Alice)

    const restoreResult = await backupService.restoreBackup(targetBackup.filename, {
      createSafetyBackup: true,
      restoreDatabase: true,
      restoreKinship: true,
      restoreConfig: true,
      restoreFlags: true,
    });

    assert.strictEqual(restoreResult.success, true);
    assert.ok(restoreResult.restoredComponents.includes('database'));
    assert.ok(restoreResult.safetyBackupFilename, 'Safety backup should be created');

    // Check that database reconnected and data reverted to Alice only
    const restoredDb = dbService.getDb();
    const persons = restoredDb.prepare('SELECT * FROM persons').all() as any[];
    assert.strictEqual(persons.length, 1);
    assert.strictEqual(persons[0].name, 'Alice');
  });

  it('should delete a backup archive file', async () => {
    const listBefore = await backupService.listBackups();
    const toDelete = listBefore[0];

    const deleted = await backupService.deleteBackup(toDelete.filename);
    assert.strictEqual(deleted, true);

    const listAfter = await backupService.listBackups();
    assert.strictEqual(listAfter.length, listBefore.length - 1);
    assert.ok(!listAfter.some((b) => b.filename === toDelete.filename));
  });

  it('should support BackupSchedulerService lifecycle', () => {
    schedulerService.initScheduler();
    schedulerService.updateSchedule('0 3 * * *', true);
    const nextRun = schedulerService.getNextRunDate();
    assert.ok(nextRun, 'nextRunDate should be a valid string');

    schedulerService.stopScheduler();
    assert.strictEqual(schedulerService.getNextRunDate(), null);
  });

  it('should stream backup download without 500 error', async () => {
    const backup = await backupService.createBackup({ description: 'Download Stream Test' });
    const filePath = backupService.getBackupFilePath(backup.filename);
    assert.ok(fs.existsSync(filePath));

    // Mock Express Response
    const headers: Record<string, any> = {};
    let statusCode = 0;
    const streamChunks: Buffer[] = [];

    const mockRes: any = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      setHeader(name: string, value: any) {
        headers[name.toLowerCase()] = value;
        return this;
      },
      write(chunk: Buffer) {
        streamChunks.push(chunk);
        return true;
      },
      end() {
        return this;
      },
      headersSent: false,
    };

    const controller = new (await import('../backup.controller.js')).BackupController(
      backupService,
      schedulerService,
    );

    await new Promise<void>((resolve, reject) => {
      mockRes.on = (event: string, _callback: any) => {
        if (event === 'finish') {
          setTimeout(resolve, 50);
        }
      };
      mockRes.emit = (event: string) => {
        if (event === 'finish') resolve();
      };
      mockRes.once = mockRes.on;
      mockRes.removeListener = () => {};

      try {
        controller.downloadBackup(backup.filename, mockRes);
        setTimeout(resolve, 100);
      } catch (err) {
        reject(err);
      }
    });

    assert.strictEqual(statusCode, 200);
    assert.strictEqual(headers['content-type'], 'application/zip');
    assert.ok(headers['content-disposition'].includes(backup.filename));
    assert.ok(headers['content-length'] > 0);
  });
});

