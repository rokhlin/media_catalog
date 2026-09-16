import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { FamilyTreeDatabaseService } from '../family-tree-db.service.js';

describe('DatabaseIsolationAndResilience', () => {
  let dbService: FamilyTreeDatabaseService;
  let dbPath: string;

  before(() => {
    const tmpDir = path.join(process.cwd(), 'media_output');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    dbPath = path.join(tmpDir, `test_isolation_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.db`);

    dbService = new FamilyTreeDatabaseService({ familyTreeDbPath: dbPath } as any);
  });

  after(() => {
    try {
      dbService.close();
      if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
      const wal = `${dbPath}-wal`;
      const shm = `${dbPath}-shm`;
      if (fs.existsSync(wal)) fs.unlinkSync(wal);
      if (fs.existsSync(shm)) fs.unlinkSync(shm);
    } catch {
      // ignore
    }
  });

  it('should operate in strict WAL mode with all 8 tables independently created', () => {
    const journalMode = dbService.getDb().pragma('journal_mode', { simple: true });
    assert.strictEqual(journalMode, 'wal', 'Database should be in WAL mode');

    const tables = [
      'ft_trees',
      'ft_persons',
      'ft_unions',
      'ft_union_partners',
      'ft_child_relations',
      'ft_person_face_links',
      'ft_person_events',
      'ft_event_media_pins',
    ];

    for (const table of tables) {
      const exists = dbService
        .getDb()
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
        .get(table);
      assert.ok(exists, `Table ${table} must exist in family_tree.db`);
    }
  });

  it('should allow independent online backup and restore of family_tree.db', async () => {
    // Insert test records
    dbService.getDb().prepare(`
      INSERT INTO ft_trees (id, name) VALUES ('backup_test_tree', 'Backup Test Tree')
    `).run();

    dbService.getDb().prepare(`
      INSERT INTO ft_persons (id, tree_id, first_name, is_living) VALUES ('p_backup_1', 'backup_test_tree', 'BackupPerson', 1)
    `).run();

    // Perform backup to a new file
    const backupPath = `${dbPath}.bak`;
    await dbService.getDb().backup(backupPath);

    assert.ok(fs.existsSync(backupPath), 'Backup file should be created');

    // Create a new db service instance reading the backup
    const restoredService = new FamilyTreeDatabaseService({ familyTreeDbPath: backupPath } as any);
    const restoredTree = restoredService.getDb().prepare(`SELECT * FROM ft_trees WHERE id='backup_test_tree'`).get();
    const restoredPerson = restoredService.getDb().prepare(`SELECT * FROM ft_persons WHERE id='p_backup_1'`).get();

    assert.ok(restoredTree, 'Tree restored successfully');
    assert.ok(restoredPerson, 'Person record restored successfully');

    restoredService.close();
    if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath);
  });
});
