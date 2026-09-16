---
name: Database Schema Migrations & Production Persistence Rule
description: Architectural standards, safety rules, and operational protocols for SQLite database schema evolution and migrations in media_cataloger_web (better-sqlite3, NestJS).
applyTo: 'server/database/**, server/family-tree/**, **/*migration*, **/*database*'
---

# Database Schema Migrations & Production Persistence Rule

This rule defines the architecture, standard operating procedures, and safety mechanisms for evolving SQLite database schemas in **`media_cataloger_web`** while keeping production data 100% safe, persistent, and backward-compatible.

---

## 📌 1. Production Persistence Architecture

In production environments (ZimaOS, CasaOS, Unraid, TrueNAS, or generic Docker hosts), `media_cataloger_web` manages two persistent SQLite databases using **`better-sqlite3`** in high-performance Write-Ahead Logging (WAL) mode:

### 1. Catalog & Media History Database (`catalog_history.db`)
Managed by [`DatabaseService`](file:///c:/Users/rokhl/.gemini/antigravity/scratch/media_cataloger_web/server/database/database.service.ts):
- **Ingestion & Sync State**: `sync_history`, `media_items`
- **EXIF & AI Semantics**: `media_metadata` (summaries, descriptions, lighting, weather, OCR text, camera metadata, timeline events)
- **Face Recognition & Crop References**: `face_registry`, `media_faces`
- **Person Profiles**: `persons`
- **Schema Migration Tracking**: `schema_migrations`

### 2. Family Tree Graph Database (`family_tree.db`)
Managed by [`FamilyTreeDatabaseService`](file:///c:/Users/rokhl/.gemini/antigravity/scratch/media_cataloger_web/server/family-tree/family-tree-db.service.ts):
- **Tree Registry**: `ft_trees`
- **Individuals & Profiles**: `ft_persons` (biographical data, vital statistics, privacy flags)
- **Kinship & Edges**: `ft_relationships` (parent-child, spouse/partner, sibling relationships)
- **Life Events & Timeline**: `ft_events` (births, marriages, residences, graduations, custom events)
- **Evidence & Citations**: `ft_citations` (source records, documents, certificates)
- **DNA Markers**: `ft_dna_markers` (haplogroups, centimorgans, chromosome matches)

### Persistent Volume Mapping
The databases reside in `MEDIA_OUTPUT` (`./media_output/` by default or configured via environment variables). In `docker-compose.yml`:

```yaml
volumes:
  - ${CONFIG_PATH:-./data/config}:/app/data/config
  - ${MEDIA_INPUT:-./media_input}:/app/media_input
  - ${MEDIA_OUTPUT:-./media_output}:/app/media_output
```

> [!IMPORTANT]
> **Never store production databases inside container ephemeral layers.** Always verify that `MEDIA_OUTPUT` is mapped to a persistent host storage volume.

---

## ⚙️ 2. SQLite Engine Configuration & Pragmas

When initializing database instances in `DatabaseService` or `FamilyTreeDatabaseService`, the following SQLite pragmas MUST be configured:

```typescript
this.db = new DatabaseConstructor(dbPath, { timeout: 30000 });
this.db.pragma('journal_mode = WAL');         // Write-Ahead Logging for concurrent read/write
this.db.pragma('busy_timeout = 30000');       // 30s busy timeout to prevent lock contention
this.db.pragma('foreign_keys = ON');          // Enforce relational integrity & cascade deletes
this.db.pragma('synchronous = NORMAL');       // Optimal performance and safety balance with WAL
this.db.pragma('cache_size = -64000');        // 64MB memory cache for fast lookups
```

---

## 🛡️ 3. The Golden Rules of Schema Evolution

When modifying database schemas for new features in `media_cataloger_web`:

1. **NEVER use destructive operations (`DROP TABLE`, `DROP COLUMN`) directly on production.**
2. **Follow the Expand and Contract Pattern:**
   - **Phase 1 (Expand)**: Add new nullable columns or tables with default values. Both old and new frontend/backend versions continue to operate without disruption.
   - **Phase 2 (Migrate/Backfill)**: Populate or compute values for newly created columns in background tasks or data migration routines.
   - **Phase 3 (Contract)**: Only after all services have updated, stop querying or referencing legacy deprecated columns.
3. **Ensure Migration Idempotence**:
   - All DDL statements must be safe to execute repeatedly without throwing errors (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`).
   - For column additions, check existing table columns dynamically using `this.db.pragma('table_info(<table_name>)')` before issuing `ALTER TABLE ... ADD COLUMN`.
4. **Use Atomic Transactions for Multi-Step Changes**:
   - Wrap data backfills and multi-table updates in `this.db.transaction(() => { ... })()`.
5. **Update TypeScript Interfaces & DTOs**:
   - Whenever database columns are added or modified, immediately update the corresponding TypeScript interfaces, DTOs, and API responses.
6. **Pre-Migration Safety Backups**:
   - Before applying high-impact schema changes, create an atomic hot backup snapshot in `media_output/backups/`.

---

## 🚀 4. How to Add a New Database Migration

### Step 1: Update Schema in `DatabaseService` or `FamilyTreeDatabaseService`

Open [`server/database/database.service.ts`](file:///c:/Users/rokhl/.gemini/antigravity/scratch/media_cataloger_web/server/database/database.service.ts) or [`server/family-tree/family-tree-db.service.ts`](file:///c:/Users/rokhl/.gemini/antigravity/scratch/media_cataloger_web/server/family-tree/family-tree-db.service.ts):

#### 1. Add New Column Dynamically:
```typescript
// Example: Adding color palette and lens model to media_metadata in migrateSchema()
const mmCols = new Set(
  (this.db.pragma('table_info(media_metadata)') as any[]).map((c: any) => c.name.toLowerCase())
);

const newColumns: Record<string, string> = {
  lens_model: 'TEXT',
  color_palette: 'TEXT',
  audio_sample_rate: 'INTEGER DEFAULT 44100'
};

for (const [col, type] of Object.entries(newColumns)) {
  if (!mmCols.has(col)) {
    this.db.exec(`ALTER TABLE media_metadata ADD COLUMN ${col} ${type};`);
    this.logger.log(`Migrated media_metadata: added column ${col}`);
  }
}
```

#### 2. Add New Table:
Add table definitions in `createTables()` using `CREATE TABLE IF NOT EXISTS`:
```typescript
this.db.exec(`
  CREATE TABLE IF NOT EXISTS user_bookmarks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    media_id TEXT NOT NULL,
    user_id TEXT DEFAULT 'default',
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (media_id) REFERENCES media_items(id) ON DELETE CASCADE
  );
`);
```

#### 3. Add Covering & Query Indexes:
Add performance indexes in `createIndexes()`:
```typescript
this.db.exec(`
  CREATE INDEX IF NOT EXISTS idx_metadata_lens ON media_metadata(lens_model);
  CREATE INDEX IF NOT EXISTS idx_bookmarks_media_id ON user_bookmarks(media_id);
`);
```

#### 4. Record Migration Version (if applicable):
Record execution in `schema_migrations`:
```typescript
this.db.prepare(`
  INSERT OR IGNORE INTO schema_migrations (version, name, applied_at, duration_ms)
  VALUES (?, ?, datetime('now', 'localtime'), ?)
`).run(2, 'add_camera_lens_and_color_palette', 0.0);
```

---

### Step 2: Update TypeScript Types and DTOs

Ensure all backend interfaces and API responses reflect the new columns:
- Update types in `server/database/`, `server/media/`, or `server/family-tree/`.
- Update corresponding frontend models in `src/types/` or `src/packages/family-tree/types.ts`.

---

### Step 3: Write Automated Unit Tests

Add test cases in [`server/database/__tests__/database.service.test.ts`](file:///c:/Users/rokhl/.gemini/antigravity/scratch/media_cataloger_web/server/database/__tests__/database.service.test.ts) to verify:
1. Tables and new columns are initialized properly on fresh and existing databases.
2. Repeated calls to `initDb()` / `migrateSchema()` are idempotent and throw no errors.
3. Foreign key constraints and cascade deletions work as intended.
4. Existing record data is preserved intact across migrations.

Run the test suite:
```bash
npm run test:server
```

---

## 🛠️ 5. Development & Validation Commands

Execute these commands when making database alterations:

```bash
# 1. Run database unit tests
npm run test:server

# 2. Run full test suite (client + server)
npm test

# 3. Verify TypeScript type safety
npm run typecheck

# 4. Verify backend endpoints & database connection
npx tsx server/verify-server.ts

# 5. Start dev server with hot reload
npm run server:dev
```

---

## 🔄 6. Disaster Recovery & Rollback Runbook

If a deployment or database issue occurs in production:

### Step 1: Locate the Latest Database Backup
Backups are located in the `backups/` directory inside your persistent `media_output` volume:
```bash
ls -lh ./media_output/backups/
# Example: catalog_history_20260901_120000.bak.db
```

### Step 2: Stop Running Containers
```bash
docker compose down
```

### Step 3: Restore Database Snapshot
```bash
# On the host machine:
cd /path/to/persistent/media_output
cp backups/catalog_history_20260901_120000.bak.db catalog_history.db
# If family_tree.db is affected:
cp backups/family_tree_20260901_120000.bak.db family_tree.db
```

### Step 4: Restart Containers & Verify Health
```bash
docker compose up -d
curl http://localhost:8000/api/status
```

---

## 📋 7. Pre-Flight Checklist for Schema Upgrades

Before pushing a database schema change:
- [ ] Used `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` for all DDL definitions.
- [ ] Checked for column existence before running `ALTER TABLE ... ADD COLUMN`.
- [ ] Ensured all new columns are nullable or provide sensible `DEFAULT` values.
- [ ] Preserved foreign key integrity and cascade deletion rules (`ON DELETE CASCADE`).
- [ ] Synchronized TypeScript interfaces, DTOs, and frontend types.
- [ ] Added or updated automated tests in `server/database/__tests__/database.service.test.ts`.
- [ ] Verified `npm run test:server` and `npm run typecheck` pass with 0 errors.
