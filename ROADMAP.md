# Project Roadmap

## 🚀 Completed Features (v0.7.0)

- **Standalone Web & Server Architecture**: Decoupled `media_cataloger_web` into a dedicated full-stack TypeScript application powered by **NestJS** backend and **React 19 (Vite)** frontend with OpenAPI/Swagger at `/api/docs`.
- **High-Performance SQLite Database**: Embedded SQLite (`better-sqlite3`) in Write-Ahead Logging (WAL) mode for sub-millisecond query performance on low-power hardware.
- **Authentication & RBAC**: Multi-user account management, role-based access control, JWT session guards, and encrypted private Vault folder.
- **Cross-Machine AI Engine Integration**: `CatalogerClientService` proxying execution controls, scan triggers, worker status, and real-time streaming logs to the Python AI service (`media_cataloger`).
- **Interactive Family Tree Explorer**: Layered graph visualization powered by `@xyflow/react` and **ELK.js (Eclipse Layout Kernel)** in a dedicated Web Worker (`elk-layout.worker.ts`) with horizontal/vertical layouts, sub-tree branch folding, and navigation controls.
- **Automated Kinship Calculation**: `KinshipEngineService` and `kinshipUtils.ts` calculating multi-generational biological and non-biological family relationships (including affinity/in-law relationships).
- **Life Events, Facts Deduplication & Person Timeline**: `FamilyEventsService`, `PersonTimelineView`, `AddEditFactModal`, `FactCard`, and gallery photo attachment picker.
- **Tree Settings & Data Management**: Node styling (Default, Circle, Square with mourning styling), celebration badges, CSV export/import with `# FACTS` section, and high-resolution export to PNG/JPG/SVG.
- **Timeline Calendar View**: Chronological calendar view with photo stack visualization and badges for dates with dense media capture (>10 photos).
- **Similar & Duplicate File Manager**: `DuplicatesManagerTab` with background duplicate discovery, visual side-by-side comparator, exact/perceptual thresholding, and batch deletion.
- **Metadata Editing & In-Viewer Editor**: `MetadataEditorModal` with atomic persistence in SQLite and bidirectional sidecar JSON file synchronization.
- **Rich Media Gallery & Lightbox**: Virtualized media grid with chunked infinite scrolling, multi-source folder aggregation, timeline grouping, and full-screen Lightbox with localized EXIF/AI sidecar inspector and HTTP 206 video streaming.
- **Inline Person Tagging**: On-media face tagging and person assignment with automatic bidirectional sidecar JSON synchronization.
- **Client-Side Media Cache & Aggregator**: `MediaCacheService` (IndexedDB with memory fallback) and `MediaOrganizationWorker` for instant client-side folder and timeline grouping.
- **Automatic Thumbnail Service**: On-the-fly Sharp thumbnail generation, multi-tier disk caching, and native Apple HEIC/HEIF photo conversion (`heic-convert`).
- **Face Registry Management**: Face crop catalog, person name assignment, face re-assignment, and face clustering (`FacesService`).
- **Admin Panel & Feature Flags**: Diagnostics dashboard, system metrics, dynamic runtime feature flag toggles (`data/feature_flags.json`), and configuration export/import.
- **App Settings & Filesystem Browser**: Directory picker modal and cross-platform path normalization in `AppConfigService`.
- **Theme Engine**: 12 curated glassmorphism presets and dynamic custom theme builder.
- **Internationalization (i18n)**: 100% key parity English 🇬🇧 and Russian 🇷🇺 interface localization.
- **Developer Tooling & Testing**: Comprehensive unit and integration test suites covering Kinship, Family Tree, Settings, Config, Thumbnails, i18n, Themes, and Cache.

---

## 📋 Development Plan & Planned Features

### Architecture & Core Infrastructure
- [ ] **Comprehensive Documentation**: Create complete architecture, API, and setup documentation.
- [x] **Feature Development Guidelines**: Create developer guidelines and standards for contributing new features.
- [x] **TypeScript Support**: Migrate/add TypeScript support across the frontend and interface definitions.
- [x] **Modular Architecture & Interface Structuring**: Refactor files, models, and interfaces into clean, structured layers.
- [x] **Error handling & recovery**: Handle errors gracefully and provide options for recovery. Define rules for:
    - source not available
    - file not exist / deleted
    - transcription error
    - face recognition error
    - LLM API error (Gemini, LM Studio)
    - image analysis error
    - db error
- [x] **Test Coverage**: Comprehensive unit and integration test suites covering Kinship, Family Tree, Settings, Config, Thumbnails, i18n, Themes, and Cache.
- [x] **Docker / Host Decoupling**: Separate application core dependencies from local host environment for robust Docker deployment.
- [x] **Caching strategies: controls section**: Rename `Execution controls` tab insettings to `File metadata operations`. Change UI accordingly. Add `Caching strategy` section to control cache
- [x] **Cahcing strategies**: Review current caching strategies and implement more efficient caching where needed. Main requirement to increase the system performance and reduce the response time of the application:
    -  Media library mostly is static and doesnt have a lot of realtime changes. So we should keep fast caching, allow to user trigger a mannual caching for the specific folder or for all. 
    - Define Daily caching automation: for the mediafiles added on a last time. Store last cached datetime, schedule the next recache. and do it onl for the new/changed that time files.
    - Add controls to run caching manually in `Caching strategy` section.
- [x] **Caching strategies: on duplicates removing**: after remove duplicates, recalculate the cache for the remaining files.
- [x] **Caching strategies: on folder remove**: after remove folder, recalculate the cache for the remaining files. It's also make sense for the folders rename operation.
- [x] **System Backup**: add to admin panel the section: `System Backups`. Provide functionality to back up and restore. Include to backup configuration data (envs, custom_dirs, custom_names), feature flags, face registry, kinshup data and metadata from db. Add In configuration file/ and in `docker-compose.yml`(optional: if not exist use from envs ) to save backups. Add cron job.

### Metadata, Processing & AI Pipeline
- [ ] **Transcription Integration**: Fully embed audio transcription into the main media analysis pipeline.
- [x] **Media Tagging System**: Support custom and person tagging for media assets with sidecar synchronization.
    - [x] AI Tag Recognition with configurable format (`categorized`, `flat`, `prefixed`) and custom target criteria / vocabulary.
    - [x] Ingest and persist structured tags to SQLite `media_tags` table with real-time synchronization.
- [x] **Metadata Editing**: Add full support for viewing and editing metadata.
- [x] **Write Analysis to File Metadata**: Option to embed analysis results directly back into media files (EXIF/XMP/ID3). Toggleable in Organization & Duplicates panel with sidecar and SQLite persistence.
- [x] **Direct Metadata & Tag Writing for HEIC and HEVC**:
    - [x] Add dedicated `.heic` and `.hevc` metadata tracking with loss-free sidecar and SQLite persistence across cataloger and web applications.
    - [x] Add automated test suite validating in-file tag embedding and reading for media formats.
- [x] **In-Viewer Metadata Editor**: Direct inline metadata editing within the preview modal/window.
- [ ] **AI Analysis Agent**: Dedicated autonomous AI agent for deep file analysis and insights.
- [ ] **Face Optimization Service**: Background service for periodic face embedding optimization and clustering.
- [ ] **Semantic Search**: Vector-based semantic search across media content, transcripts, and metadata.
- [x] **Worker Queue**: Configure a queue of media files for analysis with parallel processing capabilities.

### Organizing & Grouping Files
- [x] **Organize Files Workspace & Media Library Organization**: Dedicated workspace with collapsible accordion sections for (1) Media Library Organization (Year, Month, Common Event, Content Type classification, renaming, tagging, rollback, non-blocking background execution) and (2) Duplicates & Cleanup Manager.
- [x] **Similar files or series Grouping**: Group similar files or series of files based on similarity threshold. Similar files should be grouped together Show only one file from each group and a badge indicating the number of similar files. Allow user to see all files in a group in viewer. Keep analysis logic in `media_cataloger` as much as possible. File management put in `media_cataloger_web`. 
- [x] **Advanced Duplicate Grouping**: Enhanced UI and pipeline for managing duplicate and burst photos. Duplicate finding should be a dedicated feature that allow used to clean up duplicates. Allow to process duplicates in background. After search is done, show summary of duplicates found. User should be able to review duplicates and decide which ones to keep and which ones to delete. User should be able to delete duplicates. Allow to find duplicates in chuncks of folders. Split duplicate definition (similarity threshold, grouping logic) from ai analysis results. Add configuration for duplicate definition in admin panel. Users can use it to define their own duplicate detection logic. Show duplicates in group view with one selected file and list of other files in the group. Allow user to compare selected file with other files in the group. Allow user to select files to delete. Allow to move files to another folder.Keep analysis logic in `media_cataloger` as much as possible. File management put in `media_cataloger_web`. Search duplicates by similarity threshold (user defined) is one use case. Find exact duplicates is another use case. Find files that are identical in content but with different file names or extention type or file size. 

### UI / UX & Visual Features
- [x] **Navigation Overhaul**: Redesign layout, sidebars, header navigation tabs, and workflow navigation.
- [x] **Internationalization (i18n)**: Multi-language interface and localization support (EN/RU).
- [x] **Theme System**: Dark, Light, and custom theme presets with glassmorphism design.
- [x] **Calendar Timeline View**: View photos and events on chronological timeline groupings by capture date/time.
- [x] **Timeline in Calendar**: show calendar with photos in stack in it, If in one date is more than 10 photos, show badge with number of photos. 
- [ ] **Album Management**: Create, curate, and share custom photo and video albums.
- [x] **Family Tree**: Interactive genealogy / family relationship visualization connected to recognized faces.
- [ ] **Photo Stories**: Dynamic story creation and presentation from photo series.
- [ ] **AI Story Generation**: Automatic AI narrative and story generation based on photo context.
- [ ] **Memories & Flashbacks**: "On this day" and smart milestone memory reminders.
- [x] **View Switcher Button Group**  refactoring. Export to a dedicated component. Create a duplicate of the menu as dropdown. Add the feature flag show list if flag is active and as buttons if flag is not active. 
- [x] **Filter, Sort and Search Bar** Refactor the search bar. Export to a dedicated component. Create a duplicate of the menu as dropdown. Add the feature flag show list if flag is active and as buttons if flag is not active. Dropdown menu should be at the same line with `View Switcher Button Group` dropdown
- [x] **Face Registry UI** Refactor the face registry UI. Export to a dedicated component. Create a duplicate of the menu as dropdown. Add the feature flag show list if flag is active and as buttons if flag is not active. Dropdown menu should be at the same line with `Filter, Sort and Search Bar` dropdown
- [x] **UI refactoring** Refactor the UI. Put all screens in a dedicated folder `screens`. Keep under components UI components groupped by features. Create `common` folder for common UI components. 
    Example: 
    - `Header component` in `components/header` folder, All nested components like header-settings, header-theme, header-profile, etc should be in `components/header` folder.
    -  in `components/common` create generic component `button` to cover all buttons with the same style like button With Icon and text.
    -  in `components/common` create generic component `toggle` to cover all toggles with the same style.
    -  in `components/common` create generic component `image-view` to cover all image views.
    -  in `components/common` create generic component `modal-container` to cover all modal containers.
    - Make sure that all components are split by features and are self-contained.
    - Avoid circular dependencies. Use hooks to share logic between components. 
Do the same for all components. Do not change functionality. Add tests.
- [x] **Refactoring: Buttons** :
      Buttons: 
        -  All buttons should have `id` also if it not in use
        -  Use common button component if it possible to keep one single styling in the whole project. Create the new common button component if wasnt exist.
        -  Create rule to use common components for: buttons, toggles, modals, etc.
        - Export Styles from Component tree. create a hook that by name provides the specific style.
- [x] **Feature flags for buttons** : Add in feature flags the functionality to toggle on/off buttons by Id. Add under `CSS Class Names (Optional)` in `Create Feature flag`
the same input for button id's. It also should be ooptional. User can add buttonIds or clas name or together to toggle feature on/off.
- [ ] **Documentation and Help**: Create One docummentation base that explaim all features. Usercan open help to see all features avaliable. Add help icon in each section to explaim the functionality. Show this help icon on hover. Add the same functionality to the feature flags edit modal. 
### Family Tree 
- [x] **Represent Divorced person**: If couple is divorced, then show connection as striped line and connection icon should reflect the status. add a mechanism to expand and collapse the subtree of the divorced spounse. Only theyr own children. Don't show the subtree of the current partner.
- [x] **Live facts: Sponse**: Add to life facts option to define maritage and divocing dates and show spounse. In person card if the person has spounse need to add an ability to view and edit spounse ditails: add start and end date if divorced.
- [x] **Live facts: Relationship**: Add to life facts option to define if user started a new relationship (started dating, got married, divorced, etc) with a person and show it on the graph. The relationship can be defined between two persons and can have a start and end date. The relationship can be defined between a person and a family. The relationship can be defined between two families. In person card if the person has spounse need to add an ability to view and edit spounse ditails: add start and end date if divorced. For relationship you cannot add person to the tree but you can add the name of the person.
- [x] **Live facts: Configuration**: Add to Tree settings a configuration for Live facts. User should be able to define the following: 
    1. What to show in Person Life facts: All own facts, Farts of close relatives (Parents, Siblings, Children, Grandparents, etc), configure in a checkbox style.
    2. Also which facts to include: Not applicable like a relationship of other peopele. I need to be able to define it in the settings.
- [x] **Export Import Tree**: Add a feature to export and import the family tree to a .csv file. Add a subtab Tree Settings and place there that logic
- [x] **Tree view styles**: Add support to define and change node Item styles. Add to Tree Settings change node style. Initially add 3 styles:
    1. Default - the current style
    2. Circle - node with circle image: only Image and Name
    3. Square - node with square image: image, Name and birth date.
- [x] **Add Celebration Badge**: Add relevant badge on Tree node if that person has a birthday, anniversary, mariage, etc on that day. Provide a configuration to define what celebration should be displayed. Configure how many days before the event the badge should be displayed, Badge style, Picture/Icon, color
- [x] **Date formats and date picker**: 
    - Add support of the different input date formats: YYYY-MM-DD, YYYY-MM, YYYY, DD.MM.YYYY, DD.MM, DD, MM.YYYY, MM/DD/YYYY, MM/DD. Define format automatically and save in one style.
    - Date picker should support all formats. Put the Date picker in a separate component.
    - Add to Tree settings a configuration for date formats. User should be able to select the format to show dates on screens. Add those options as a drop down menu:
    Example:
        - YYYY-MM-DD, YYYY-MM, YYYY
        - DD Month YYYY, DD Month
        - DD.MM.YYYY, MM.YYYY
        - MM/DD/YYYY, MM/YYYY
- [x] **Russian language support**: Add Russian language support for the UI. 
- [x] **Export to PNG/JPG/SVG for Tree and Timeline** : Add in tree settings the section with ability to export tree and timeline to PNG/JPG/SVG. Export options: Export Tree, Export Timeline. Tree should be exported with current settings and with items shown, e.g. node style, celebration badges, etc. Export with high quality. 
- [x] **Kinship in media gallery configuration**: add option to configure facts including in media gallery for chained person( only own facts, own and closest family members, all). add only facts which date is close (birtday, marriage, anniversary, death) and config for period before date.
- [x] **Refactoring: Export to PNG/JPG/SVG** : move **Export to PNG/JPG/SVG for Tree and Timeline** section under csv import export section.

### Security, Access Control & Admin
- [x] **Authentication & Route Guards**: User login, JWT sessions, and route protection. Protect the admin panel and Face Registry. Only the admin should have access to these. In the first iteration, we can just have one user/admin.
- [x] **User & Role Management (RBAC)**: Multi-user support with custom roles and permission levels. Admin can give specific permissions to users. For example: view-only mode for some users. Admin can manage user accounts (create, edit, delete).
- [x] **Admin Dashboard**: System health monitoring, feature flag controls, and administrative settings.
- [x] **Secret / Vault Folder**: Encrypted private folder protected by password/PIN.
- [x] **Vault Search Exclusion**: Strictly exclude hidden and private vault items from global searches and indexing.

### Clients & Platforms
- [ ] **Mobile Application**: Dedicated mobile app support (iOS / Android / PWA) with responsive synchronization.
