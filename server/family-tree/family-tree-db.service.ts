import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Inject } from '@nestjs/common';
import DatabaseConstructor, { Database } from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { AppConfigService } from '../config/config.service.js';

@Injectable()
export class FamilyTreeDatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FamilyTreeDatabaseService.name);
  private db: Database | null = null;
  private currentDbPath: string | null = null;
  private readonly userTreeDbs = new Map<string, Database>();

  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  onModuleInit() {
    this.initDb();
  }

  onModuleDestroy() {
    this.close();
  }

  public getDb(userId?: string, customRoot?: string): Database {
    if (userId && userId.trim()) {
      return this.getUserDb(userId.trim(), customRoot);
    }
    const desiredPath = this.config.familyTreeDbPath;
    if (!this.db || !this.db.open || this.currentDbPath !== desiredPath) {
      this.initDb();
    }
    return this.db!;
  }

  public getUserDb(userId: string, customRoot?: string): Database {
    if (!userId || !userId.trim()) {
      return this.getDb();
    }
    const cleanId = userId.trim();
    if (this.userTreeDbs.has(cleanId)) {
      const existing = this.userTreeDbs.get(cleanId)!;
      if (existing.open) {
        return existing;
      }
    }

    const base = customRoot && customRoot.trim() ? customRoot.trim() : this.config.usersBaseDir;
    const userDbPath = path.resolve(base, cleanId, '.catalog', 'family_tree.db');
    const dbDir = path.dirname(userDbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    const db = new DatabaseConstructor(userDbPath, { timeout: 30000 });
    try {
      db.pragma('journal_mode = WAL');
    } catch {
      db.pragma('journal_mode = DELETE');
    }
    db.pragma('busy_timeout = 30000');
    db.pragma('foreign_keys = ON');
    db.pragma('synchronous = NORMAL');

    this.createTables(db);
    this.createIndexes(db);
    this.ensureDefaultTree(db);

    this.userTreeDbs.set(cleanId, db);
    this.logger.log(`Per-user Family Tree SQLite database connected for ${cleanId} at: ${userDbPath}`);
    return db;
  }

  public reconnect(): Database {
    this.logger.warn('Reconnecting Family Tree SQLite database connection...');
    this.close();
    this.initDb();
    return this.db!;
  }

  public close(): void {
    for (const [userId, udb] of this.userTreeDbs.entries()) {
      try {
        if (udb.open) udb.close();
      } catch (err) {
        this.logger.error(`Error closing family tree database for ${userId}: ${err}`);
      }
    }
    this.userTreeDbs.clear();

    if (this.db) {
      try {
        if (this.db.open) {
          this.db.close();
        }
      } catch (err) {
        this.logger.error(`Error closing family tree database: ${err}`);
      }
      this.db = null;
      this.currentDbPath = null;
    }
  }

  public initDb(): void {
    try {
      this.close();
      const dbPath = this.config.familyTreeDbPath;
      this.currentDbPath = dbPath;
      const dbDir = path.dirname(dbPath);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }

      this.db = new DatabaseConstructor(dbPath, { timeout: 30000 });
      try {
        this.db.pragma('journal_mode = WAL');
      } catch (walErr) {
        this.logger.warn(`WAL mode failed on ${dbPath}, falling back to DELETE mode: ${walErr}`);
        try {
          this.db.pragma('journal_mode = DELETE');
        } catch {
          // ignore fallback error
        }
      }
      this.db.pragma('busy_timeout = 30000');
      this.db.pragma('foreign_keys = ON');
      this.db.pragma('synchronous = NORMAL');
      this.db.pragma('cache_size = -32000'); // 32MB cache

      // Initialize schema
      this.createTables();
      this.ensureDefaultTree();
      this.logger.log(`Family Tree SQLite database connected at: ${dbPath}`);
    } catch (err) {
      this.logger.error(`Failed to initialize Family Tree SQLite database: ${err}`);
    }
  }

  private createTables(targetDb?: Database): void {
    const db = targetDb || this.db;
    if (!db) return;

    db.exec(`
      -- 1. Family Trees Table
      CREATE TABLE IF NOT EXISTS ft_trees (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        root_person_id TEXT,
        living_privacy_mode TEXT NOT NULL DEFAULT 'MASK_LIVING',
        created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
      );

      -- 2. Tree Persons Table
      CREATE TABLE IF NOT EXISTS ft_persons (
        id TEXT PRIMARY KEY,
        tree_id TEXT NOT NULL,
        media_person_id TEXT,
        first_name TEXT NOT NULL,
        middle_name TEXT,
        last_name TEXT,
        maiden_name TEXT,
        gender TEXT NOT NULL DEFAULT 'UNKNOWN',
        birth_date TEXT,
        birth_place TEXT,
        is_living INTEGER NOT NULL DEFAULT 1,
        death_date TEXT,
        death_place TEXT,
        bio TEXT,
        avatar_url TEXT,
        avatar_face_id TEXT,
        custom_attributes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
        FOREIGN KEY (tree_id) REFERENCES ft_trees(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_ft_persons_tree_id ON ft_persons(tree_id);
      CREATE INDEX IF NOT EXISTS idx_ft_persons_media_person_id ON ft_persons(media_person_id);
      CREATE INDEX IF NOT EXISTS idx_ft_persons_names ON ft_persons(last_name, first_name);

      -- 3. Tree Unions Table
      CREATE TABLE IF NOT EXISTS ft_unions (
        id TEXT PRIMARY KEY,
        tree_id TEXT NOT NULL,
        union_type TEXT NOT NULL DEFAULT 'MARRIAGE',
        start_date TEXT,
        start_place TEXT,
        end_date TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
        FOREIGN KEY (tree_id) REFERENCES ft_trees(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_ft_unions_tree_id ON ft_unions(tree_id);

      -- 4. Union Partners Table
      CREATE TABLE IF NOT EXISTS ft_union_partners (
        id TEXT PRIMARY KEY,
        union_id TEXT NOT NULL,
        person_id TEXT NOT NULL,
        display_order INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (union_id) REFERENCES ft_unions(id) ON DELETE CASCADE,
        FOREIGN KEY (person_id) REFERENCES ft_persons(id) ON DELETE CASCADE,
        UNIQUE(union_id, person_id)
      );

      CREATE INDEX IF NOT EXISTS idx_ft_union_partners_person ON ft_union_partners(person_id);

      -- 5. Child Relations Table
      CREATE TABLE IF NOT EXISTS ft_child_relations (
        id TEXT PRIMARY KEY,
        union_id TEXT NOT NULL,
        person_id TEXT NOT NULL,
        filiation TEXT NOT NULL DEFAULT 'BIOLOGICAL',
        birth_order INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (union_id) REFERENCES ft_unions(id) ON DELETE CASCADE,
        FOREIGN KEY (person_id) REFERENCES ft_persons(id) ON DELETE CASCADE,
        UNIQUE(union_id, person_id)
      );

      CREATE INDEX IF NOT EXISTS idx_ft_child_relations_person ON ft_child_relations(person_id);

      -- 6. Media Face Links & Photo References Table
      CREATE TABLE IF NOT EXISTS ft_person_face_links (
        id TEXT PRIMARY KEY,
        tree_person_id TEXT NOT NULL,
        media_person_name TEXT NOT NULL,
        media_face_id TEXT NOT NULL,
        is_primary_avatar INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
        FOREIGN KEY (tree_person_id) REFERENCES ft_persons(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_ft_face_links_person ON ft_person_face_links(tree_person_id);

      -- 7. Person Events & Life Facts Table
      CREATE TABLE IF NOT EXISTS ft_person_events (
        id TEXT PRIMARY KEY,
        person_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        event_date TEXT,
        date_is_approximate INTEGER NOT NULL DEFAULT 0,
        location_name TEXT,
        latitude REAL,
        longitude REAL,
        is_system_generated INTEGER NOT NULL DEFAULT 0,
        source_node_id TEXT,
        source_event_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
        FOREIGN KEY (person_id) REFERENCES ft_persons(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_ft_person_events_person ON ft_person_events(person_id);
      CREATE INDEX IF NOT EXISTS idx_ft_person_events_date ON ft_person_events(event_date);
      CREATE INDEX IF NOT EXISTS idx_ft_person_events_type ON ft_person_events(event_type);

      -- 8. Event Pinned Gallery Media Table
      CREATE TABLE IF NOT EXISTS ft_event_media_pins (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL,
        media_id TEXT,
        media_file_path TEXT NOT NULL,
        thumbnail_url TEXT,
        display_order INTEGER NOT NULL DEFAULT 0,
        caption TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
        FOREIGN KEY (event_id) REFERENCES ft_person_events(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_ft_event_media_pins_event ON ft_event_media_pins(event_id);
      CREATE INDEX IF NOT EXISTS idx_ft_event_media_pins_filepath ON ft_event_media_pins(media_file_path);

      -- 9. Tree Change History & Audit Logs
      CREATE TABLE IF NOT EXISTS ft_tree_history (
        id TEXT PRIMARY KEY,
        tree_id TEXT NOT NULL,
        action_type TEXT NOT NULL,
        description TEXT NOT NULL,
        details TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
        FOREIGN KEY (tree_id) REFERENCES ft_trees(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_ft_tree_history_tree ON ft_tree_history(tree_id);
      CREATE INDEX IF NOT EXISTS idx_ft_tree_history_date ON ft_tree_history(created_at);

      -- 10. Family Tree Settings
      CREATE TABLE IF NOT EXISTS ft_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
      );
    `);

    const safeAddColumn = (table: string, column: string, type: string) => {
      try {
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
      } catch {
        // Column already exists
      }
    };

    safeAddColumn('ft_person_events', 'end_date', 'TEXT');
    safeAddColumn('ft_person_events', 'relationship_target_type', 'TEXT');
    safeAddColumn('ft_person_events', 'relationship_target_name', 'TEXT');
    safeAddColumn('ft_person_events', 'relationship_target_id', 'TEXT');
    safeAddColumn('ft_person_events', 'relationship_status', 'TEXT');
  }

  private createIndexes(_targetDb?: Database): void {
    // Indexes are defined inline in createTables
  }

  private ensureDefaultTree(targetDb?: Database): void {
    const db = targetDb || this.db;
    if (!db) return;
    const existing = db.prepare('SELECT id FROM ft_trees LIMIT 1').get();
    if (!existing) {
      db.prepare(`
        INSERT INTO ft_trees (id, name, description, living_privacy_mode)
        VALUES ('default_tree', 'My Family Tree', 'Default genealogical tree for Media Cataloger', 'MASK_LIVING')
      `).run();
      this.logger.log('Initialized default family tree (id: default_tree)');
    }
  }
}
