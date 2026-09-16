# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.15.0] - Unreleased

### Added
- **AI Tag Recognition & Structured Tagging Pipeline (`server/cataloger-client/`, `server/database/`, `src/models/settings.ts`)**:
  - Added `analyzeWithTags` method to `CatalogerClientService` to execute single-file media analysis with configurable `target_tags` and `tag_format` (`categorized`, `flat`, `prefixed`).
  - Added `media_tags` table schema in `DatabaseService` (`better-sqlite3`) and implemented `saveMediaTags(filePathOrMediaId, tags)` with normalization support.
  - Automatically persist structured tags to `media_tags` SQLite table during remote file analysis sync (`syncRemoteFileAnalysis`).
  - Added `target_tags?: string[]` and `tag_format?: 'categorized' | 'flat' | 'prefixed'` in frontend `SettingsData` model.
- **Organize Files Workspace & Media Library Organization (`server/organize/`, `DuplicatesManagerTab`, `LibraryOrganizationPanel`)**:
  - Renamed `Duplicates Manager` tab, header title, and navigation breadcrumbs to **`Organize files`** (рус: **`Организация файлов`**).
  - Reorganized workspace into two independently collapsible accordion sections:
    1. **Media Library Organization** (`Организация медиатеки`): Full background reorganization by Year, Month, Common Event, and Content Type.
    2. **Duplicates & Cleanup Manager** (`Поиск и управление дубликатами`): Preserves duplicate search, thresholding, visual comparison, and batch cleanup.
  - **Heuristic Content Type Classifier**: Automatically classifies media into Documents (`documents`), Social networks (`social`), Nature (`nature`), Animals (`animals`), Screenshots (`screenshots`), and Non-family (`non_family`) using OCR text density, filename patterns, directory paths, and AI sidecar metadata.
  - **Custom Folder & Filename Templates**: Template interpolation supporting `{year}`, `{month}`, `{month_name}`, `{event}`, `{contentType}`, and `{original}`.
  - **Comprehensive Tagging & Toggleable In-File Writing**:
    - Generates and persists tags (`Год: 2024`, `Месяц: Май`, `Событие: ...`, `Категория: ...`) in SQLite and sidecar `.json`.
    - Added optional toggle for direct in-file metadata embedding (EXIF/IPTC) for supported formats (`.jpg`, `.jpeg`, `.png`, `.webp`, `.tiff`), alongside full sidecar and database synchronization for Apple HEIC and HEVC video files.
  - **Interactive Plan Review & Editable Proposed Plan**:
    - Interactive table displaying all proposed moves, target folders, target filenames, and assigned tags.
    - In-place editing allowing users to customize folder paths, file names, or tags for any item before or after execution.
  - **Audit History & Full Rollback**:
    - SQLite persistence in `organization_jobs` and `organization_items` storing `original_path`, `original_folder`, `original_filename`, and `status`.
    - One-click Rollback (`"Откатить изменения"`) restoring moved files, sidecars, and database records back to their original locations.
  - **Background Non-Blocking Execution & Resilience**:
    - Processes files asynchronously with `setImmediate` event loop yielding, completely preventing server or UI thread blockage.
    - Session-persistent execution: continues processing in background when switching tabs or closing browser; restores live progress (`percent`, `current_file`, `processed / total`) via `/api/organize/status`.
    - Concurrency lock protecting against simultaneous runs (`400 Bad Request`).
    - Cancel on any stage with preserved progress, supporting fresh restart (`resetPrevious`) or incremental runs.
  - **Bilingual i18n & Test Suite**:
    - Complete English 🇬🇧 and Russian 🇷🇺 localization for all accordion headers, criteria inputs, status badges, and action buttons.
    - Automated unit test suite `server/organize/__tests__/organize.service.test.ts` verifying job lifecycle, concurrency prevention, cancellation, and plan edits.
- **System Backup & Restore Architecture (`server/backup/`, `AdminBackupTab`)**:
  - Full system backup and restore engine capturing SQLite databases (`catalog_history.db` and `family_tree.db`), configuration data (`settings.json`, env snapshots, custom folder directories), feature flags (`feature_flags.json`), kinship relations, and face registry.
  - Zero-downtime atomic hot snapshots using `better-sqlite3`'s native SQLite online backup API (`db.backup()`), guaranteeing database consistency under concurrent reads/writes.
  - Automatic pre-restore safety snapshot creation protecting existing databases before applying any restore operation.
  - Configurable background cron scheduler (`BackupSchedulerService`) using `cron` with customizable expressions (e.g. daily at 02:00 AM) and dynamic runtime schedule updates.
  - Automated retention management pruning oldest backup archives beyond the configurable threshold.
  - REST API suite under `/api/backup` for listing, creating, downloading, uploading, restoring, deleting, and configuring backups with RBAC permission protection (`admin_panel`).
  - Container and environment integration: mapped `BACKUP_PATH` in `docker-compose.yml` (`/app/backups`), `.env`, and `.env.example`.
  - Added dedicated `System Backups` subtab in the Admin Panel (`AdminBackupTab`) with storage statistics, scheduled cron status, archive downloads, upload dropzone, and selective component restore modal.
  - Full English and Russian localization for all backup metrics, action buttons, and modal dialogs.
- **Advanced Caching Strategies & Management System**:
  - Renamed `Execution controls` settings tab to `File metadata operations` (`tabFileMetadataOperations`) with full English 🇬🇧 and Russian 🇷🇺 localization.
  - Implemented `Caching strategy` control section in `SystemSettings` featuring real-time cache metrics (item count, memory footprint, hit rate, last cache time, next scheduled run).
  - High-performance caching for static media libraries with manual single-folder or global recache triggers (`/api/media/cache/recache`).
  - Automated daily recaching background job (`checkScheduledAutomation`) with configurable time-of-day scheduling and incremental-only modes.
  - In-place warm cache recalculation on duplicate file deletion (`recalculateCacheAfterDeletion`), avoiding cold cache drops across both server and client IndexedDB.
  - Dynamic cache recalculation on folder removal and rename operations (`recalculateCacheAfterFolderChange`).
  - Added dedicated navigation link button to **Tree Settings** (`tab-settings-tree`) inside `SystemSettings` tabs navigation, automatically switching to the Family Tree screen and activating the Tree Settings subtab.

---

## [0.7.0] - 2026-09-05

### Added
- **Interactive Family Tree Explorer (`src/packages/family-tree/`)**:
  - Layered graph visualization powered by `@xyflow/react` and **ELK.js (Eclipse Layout Kernel)** computed in a dedicated Web Worker (`elk-layout.worker.ts`) with horizontal (LR) and vertical (TB) layouts, sub-tree branch folding, and navigation controls.
  - Automated Kinship Calculation Engine (`kinshipUtils.ts`, `KinshipEngineService`) resolving complex multi-generation biological and non-biological family relationships (including in-laws and step-relations).
  - Life Events & Timeline system (`FamilyEventsService`, `PersonTimelineView`, `AddEditFactModal`, `FactCard`) with gallery photo attachment picker and category filtering.
  - Graph integrity & cycle detection service (`GraphIntegrityService`) preventing circular parentage anomalies.
  - Tree settings management (`TreeSettingsTab`) with node styling options (Default, Circle, Square with mourning styling for deceased individuals), celebration badges (birthdays, anniversaries, weddings), and configurable date formats (dropdown selector).
  - Tree and timeline high-resolution export to PNG, JPG, and SVG (`treeExportService.ts`).
  - CSV Tree Import and Export with dedicated `# FACTS` lifecycle events section, syntax validation, entity reconciliation, and audit history (`ft_tree_history`).
  - Interactive modals and navigation: `PersonDetailDrawer`, `FaceLinkModal`, `QuickAddRelativeModal`, `CanvasToolbar`, and `TreeSearchBar`.
- **Timeline Calendar View (`TimelineCalendarView`)**:
  - Chronological calendar view with photo stack visualization and badges for dates with dense media capture (>10 photos).
- **UI Modularization & Component Architecture**:
  - Centralized component styling system (`screens/` directory separation, `VaultScreen`, `ViewSwitcherButtonGroup` dropdown/button modes controlled by feature flags).
  - Automatic `data/feature_flags.json` initialization from assets template on startup.
- **Native Apple HEIC/HEIF Image Support**:
  - Direct conversion and thumbnail extraction for `.heic` and `.heif` media via `heic-convert` in `ThumbnailService` and `MediaService`.
  - Comprehensive unit test coverage for HEIC/HEIF buffer conversion and error recovery.

### Fixed
- **Family Tree Life Story Facts Deduplication**:
  - Resolved duplicated facts appearing on a person's timeline when exploring with relatives enabled (spouses, parents, siblings, children).
  - Prevented reciprocal `MARRIAGE` and `DIVORCE` events from spouses from duplicating the person's own union records.
  - Filtered out a spouse's marriages to third parties (different spouses) and children with other spouses from being wrongly rendered on the person's life story.
  - Eliminated duplicate child birth facts where parent's `CHILD_BORN` event and child's `BIRTH` event were both rendered simultaneously.
  - Preserved single display of parents' marriage and divorce on child timelines.
  - Added unit test suite `timelineDeduplication.test.ts` verifying exact lifecycle event filtering.
- **Child Node Delete Action & Toolbar Display**:
  - Corrected conditional render logic in `CanvasToolbar` and `FamilyTreeTab` so child node delete/remove buttons always display when selected.
- **Filter Facts Category Responsiveness**:
  - Changed category pill container to wrap responsively (`flexWrap: 'wrap'`) and dynamically filter to categories present in active life events.
- **Canvas Top Actions Decluttering**:
  - Introduced `hide_top_screen_zoom_actions` feature flag in `CanvasToolbar` to hide duplicate top zoom buttons while preserving bottom-left canvas controls.
- **Duplicates Manager Selection & Video Streaming**:
  - Added `e.stopPropagation()` on duplicate item checkboxes and cards to prevent accidental closing of Duplicates Manager and redirection to gallery tab.
  - Added dedicated in-place Full Preview Lightbox modal with zoom button (`dup-item-zoom-btn`), metadata view, and keyboard navigation.
  - Implemented HTTP 206 Partial Content and `Range` header streaming in `server/media/media.controller.ts` for smooth video buffering, scrubbing, and seeking.

---

## [0.6.0] - 2026-09-02

### Added
- **Similar & Duplicate File Manager (`DuplicatesManagerTab`)**:
  - Dedicated duplicate and burst photo cleanup pipeline and background scanning service (`duplicates.service.ts`).
  - Configurable similarity threshold and duplicate detection criteria (exact hash/size match vs perceptual similarity).
  - Side-by-side visual comparison, metadata inspector, and batch file deletion/relocation.
  - Asynchronous organization and duplicate calculation via `mediaOrganization.worker.ts`.
- **Standalone Media Viewer Modal (`MediaViewerModal`)**:
  - Extracted standalone full-screen lightbox modal with deep image inspection, zoom controls, and EXIF/metadata drawer.
- **System Settings Overhaul (`SystemSettings`)**:
  - Replaced legacy modal with a comprehensive full-page tabbed settings interface (`SystemSettings.tsx` and `SystemSettings.css`).
  - Complete internationalization (i18n) for all settings controls.
- **Face Registry Management Component (`FaceRegistry`)**:
  - Dedicated UI for assigning, merging, and managing detected faces across media libraries.
- **Documentation & Integration Guides**:
  - Added comprehensive technical guides for AI engine integration, security, authentication setup, and SQLite schema migrations.

---

## [0.5.0] - 2026-09-01

### Added
- **Authentication & Role-Based Access Control (RBAC)**:
  - User authentication system with JWT sessions, password hashing, and route guards (`AuthGuard`, `RolesGuard`).
  - Multi-user management tab (`UserManagementTab`) with admin controls for role assignment and account creation/deletion.
  - Interactive login modal (`LoginModal`) and user profile status in `Header`.
- **Encrypted Secret Vault (`VaultModal`, `AdminVaultTab`)**:
  - Secure encrypted private vault folder protected by PIN/password.
  - Strict exclusion of vault media assets from general indexing and global search queries.
- **Metadata Editing & In-Viewer Editor (`MetadataEditorModal`)**:
  - Multi-tab in-viewer metadata editor modal in `MediaGallery` with instant reactive UI refresh and 100% English 🇬🇧 and Russian 🇷🇺 localization.
  - Atomic persistence in `DatabaseService` (`media_metadata` and `media_items` tables in `catalog_history.db`).
  - Automatic bidirectional synchronization with on-disk sidecar JSON files.

---

## [0.4.0] - 2026-09-01

### Added
- **Foundational Project Architecture & Guidelines**:
  - Modular NestJS backend structure with services, controllers, and dependency injection.
  - Standardized development rules: `.agents/rules/jest-testing-for-js-ts.md`, `.agents/rules/nest-js-development-best-practices.md`, `.agents/rules/react-js-development.md`, `.agents/rules/roadmap_and_changelog.md`, and `.agents/rules/database_migrations.md`.
  - Initial `ROADMAP.md` and `CHANGELOG.md` tracking setup.
  - Extended unit testing infrastructure for config, media, and thumbnail services.

---

## [0.3.0] - 2026-09-01

### Added
- **Admin Panel & System Health Dashboard**:
  - `AdminPanel` component for managing runtime feature flag configurations, system diagnostics, and hardware metric monitoring.
  - Configuration export/import profiles for portable backup and migration.
- **Automatic Thumbnail Service (`ThumbnailService`)**:
  - On-the-fly thumbnail generation using Sharp with multi-tier disk caching.
  - Video thumbnail frame extractions and multi-resolution generation (`small`, `medium`, `large`).
- **Rich Media Gallery & Viewer (`MediaGallery`)**:
  - Virtualized media grid with chunked infinite scrolling, multi-source folder aggregation, and timeline grouping.
  - Inline person tagging and face assignment directly on media files with automatic sidecar JSON synchronization.
  - Full-screen Lightbox Modal displaying EXIF metadata, camera settings, GPS coordinates, localized AI descriptions/summaries (EN/RU), detected lighting/environment, OCR text, and face highlights.
- **App Shell & Theme Customization**:
  - Sleek modern layout with responsive sidebar navigation, header status bar, and theme switcher UI.
  - 12 curated glassmorphism theme presets and dynamic custom theme builder.

---

## [0.2.0] - 2026-08-31

### Added
- **Input Sources Gallery (`InputSourcesGallery`)**:
  - Media source browsing interface with person tagging and media management capabilities.
  - Aggregation of media files across multiple configured storage input folders.
- **Media Gallery & Processing Pipeline**:
  - Face management controllers and API endpoints for linking recognized faces.
  - `CatalogerClientService` integration and media processing pipeline UI components.
  - Media source architecture refactoring (PR #2).

---

## [0.1.0] - 2026-08-30

### Added
- **Standalone Web & Server Architecture**:
  - Decoupled `media_cataloger_web` into a dedicated full-stack TypeScript application powered by **NestJS** backend and **React 19 (Vite)** frontend.
  - High-performance REST API with OpenAPI/Swagger documentation exposed at `/api/docs`.
  - Embedded **SQLite (`better-sqlite3`)** database running in Write-Ahead Logging (WAL) mode.
  - `CatalogerClientService` proxying execution controls, scan triggers, status monitoring, and real-time streaming logs to Python AI engine.
- **Media Ingestion & Client Caching**:
  - `MediaService` for folder scanning, sidecar JSON ingestion, and metadata synchronization.
  - `MediaCacheService` (IndexedDB with memory fallback) and worker-based aggregation via `MediaOrganizationWorker`.
- **Face Registry Management (`FaceRegistry`, `FacesService`)**:
  - Face crop catalog, person name assignment, face re-assignment, and face clustering.
- **App Settings & Filesystem Browser**:
  - Directory browser modal and `SettingsService` for configuring media source paths and AI processing options.
- **Internationalization (i18n)**:
  - 100% key parity English 🇬🇧 and Russian 🇷🇺 translation dictionaries (`src/i18n/translations.ts`) with `LanguageContext`.
- **Media Source Refactoring**:
  - Integrated PR #1 for media source refactoring and modular folder handling.

---

## [0.0.1] - 2026-08-29

### Added
- **Project Scaffolding & Initial Infrastructure**:
  - Standalone project structure for `media_cataloger_web`.
  - `AppConfigService` to handle cross-platform path normalization, environment variables, and configuration persistence.
  - `SettingsService` for configuration retrieval, persistence, and filesystem directory browsing.
  - Cross-platform helper runner scripts: `run.ps1` (PowerShell) and `run.sh` (Bash).
  - Core unit test suites for `CatalogerClientService`, `SettingsService`, and `AppConfigService`.
