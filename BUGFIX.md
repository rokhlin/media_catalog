# Bug Fixes & Known Issues

This document tracks all known bugs, regressions, and issues in `media_cataloger_web`.
Each bug is categorized by component and marked with its current status.

**Severity levels**: 🔴 Critical · 🟠 High · 🟡 Medium · 🟢 Low  
**Status**: `[ ]` Open · `[x]` Fixed · `[~]` In Progress · `[?]` Needs Reproduction

---

## 🏗️ Architecture & Core Infrastructure

*(No known issues)*

---

## 🗃️ Metadata, Processing & AI Pipeline

*(No known issues)*

---

## 🌳 Family Tree

- [x] 🟠 **Child node delete button not rendering**: The delete/remove button on child person nodes was missing from the canvas toolbar in specific tree configurations. Affected `CanvasToolbar.tsx` and `FamilyTreeTab.tsx`. Fixed by correcting conditional render logic and ensuring the button is always injected into the toolbar when a child node is selected.
  - **Affected version**: v0.3.x
  - **Fixed in**: v0.7.0
  - **References**: Conversation `3710b459` – *Troubleshooting Child Delete Button*
- [x] 🟠 **Filter facts on Family Tree**: The filter facts pill list was confined to a horizontal scroll container. Changed to a responsive multi-line wrapping flex container (`flexWrap: 'wrap'`) fitting the drawer width. Filter pills now dynamically filter to only show categories that actually exist across the person's aggregated timeline events (`availableCategories`), including support for the MILITARY category.
  - **Fixed in**: v0.7.0
  - **Files**: `PersonTimelineView.tsx`

- [x] 🟡 **Set as Root ME**: Removed the "Set as Root ME" button from the Person Detail Drawer (`PersonDetailDrawer.tsx`) to prevent unintended re-rooting from the drawer view.
  - **Fixed in**: v0.7.0
  - **Files**: `PersonDetailDrawer.tsx`

- [x] 🟡 **Top screen actions**: Added feature flag `hide_top_screen_zoom_actions` in `/data/feature_flags.json` (enabled by default) and integrated into `CanvasToolbar.tsx` using `FlagsManager.IsActive` to hide duplicate Zoom In, Zoom Out, and Fit view buttons from the top toolbar while preserving bottom-left canvas controls.
  - **Fixed in**: v0.7.0
  - **Files**: `data/feature_flags.json`, `CanvasToolbar.tsx`

- [x] 🟡 **Square card improvements & round card mourning styles**:
  - For square cards: when birthdate is unset, the subtitle dynamically displays the person's exact computed kinship relationship to the root "ME" person (e.g., Father, Mother, Son, Daughter, Brother, Sister, Spouse, Self, and affinity/in-law relationships like Father-in-law, Mother-in-law, Brother-in-law, Sister-in-law, Son-in-law, Daughter-in-law, Step-relations) instead of generic "Relative" or "Living". For instance, spouse's father (Miniyar Bayguildin) accurately evaluates to "Father-in-law".
  - Mourning styling: When a person has a death date (`isDeceased`), square cards render a solid 2px black border (`#000000`) and a 45-degree diagonal black mourning stripe in the bottom-left corner with `overflow: 'hidden'`. Round cards render a solid 2px black border around the avatar.
  - **Fixed in**: v0.7.0
  - **Files**: `kinshipUtils.ts`, `kinshipUtils.test.ts`, `elk-layout.worker.ts`, `useTreeLayoutWorker.ts`, `PersonCardNode.tsx`, `family-tree.service.ts`, `family-tree.types.ts`

- [x] 🟡 **Connection cards (unions)**: Removed the spouse name text label from union/marriage badges on the person card (`renderSpouseBadge`), keeping only the marriage/partnership icon badge and interactive drawer trigger.
  - **Fixed in**: v0.7.0
  - **Files**: `PersonCardNode.tsx`

- [x] 🟡 **Export to CSV with facts data**: Extended tree CSV export and import to include a dedicated `# FACTS` section storing person life events (`person_id`, `event_type`, `title`, `description`, `event_date`, `event_place`, `is_private`). Updated backend `getTreeGraph` to return `facts` from `ft_person_events`, updated frontend `TreeSettingsTab.tsx` import workflow, and expanded sample CSV template and test suites.
  - **Fixed in**: v0.7.0
  - **Files**: `server/family-tree/family-tree.service.ts`, `server/family-tree/types/family-tree.types.ts`, `src/packages/family-tree/types/tree.types.ts`, `csvTreeService.ts`, `TreeSettingsTab.tsx`, `csvTreeService.test.ts`
- [x] 🔴 **Import from csv: validation**: Import from CSV now thoroughly validates the data before importing (detecting syntax errors, duplicate IDs within CSV, and broken references). Reconciles incoming IDs against existing IDs in the active tree graph: if an entity exists, it compares fields and updates only changed properties without creating duplicate records; if it does not exist, it creates the entity while preserving original IDs. Fixed tree structure preservation on import by correcting partner arrays (`partner_ids`), fixing union child linking (`addChildToUnion`), and updating person life events via `/events`. Tracks all import modifications and changes in the tree history (`ft_tree_history` audit log).
  - **Fixed in**: v0.7.0
  - **Files**: `src/packages/family-tree/utils/csvTreeService.ts`, `src/packages/family-tree/utils/__tests__/csvTreeService.test.ts`, `server/family-tree/family-tree-db.service.ts`, `server/family-tree/types/family-tree.types.ts`, `src/packages/family-tree/types/tree.types.ts`, `server/family-tree/dto/family-tree.dto.ts`, `server/family-tree/family-tree.service.ts`, `server/family-events.service.ts`, `server/family-tree/family-tree.controller.ts`, `src/packages/family-tree/hooks/useFamilyTreeData.ts`, `src/packages/family-tree/components/FamilyTreeTab.tsx`, `src/packages/family-tree/components/settings/TreeSettingsTab.tsx`
---

## 🖼️ UI / UX & Visual Features

- [x] 🔴 **Duplicates Manager checkbox/image click closing window**: Clicking on a duplicate file checkbox or image card immediately closed the Duplicates Manager window and redirected to the Media gallery tab. Caused by missing `e.stopPropagation()` on the checkbox `onClick` event which bubbled to the preview wrapper's `onOpenViewer` handler, coupled with a disruptive `setActiveTab('main')` redirect in `App.tsx`. Fixed by stopping click event bubbling on checkboxes, toggling selection directly on card/image clicks, removing the tab redirect in `App.tsx`, and adding an in-place lightbox preview modal with zoom button (`dup-item-zoom-btn`).
  - **Affected version**: v0.3.x, v0.6.0
  - **Fixed in**: v0.7.0
  - **References**: Issue *Duplicates Manager - unable to mark duplicate file for further deletion*

- [x] 🔴 **Video file preview not working**: Previewing video files (`.mp4`, `.mov`, etc.) failed in both the main gallery lightbox (`MediaViewerModal`) and Duplicates Manager (`DuplicatesManagerTab`). Caused by two critical issues:
  1. Backend `streamFileSafely` in `server/media/media.controller.ts` lacked HTTP Range request support (`Range: bytes=start-end`), always returning `200 OK` with full Content-Length instead of `206 Partial Content` with `Content-Range` and `Accept-Ranges: bytes`. Modern browsers require HTTP byte ranges to buffer, seek, and parse metadata atoms (`moov`). Furthermore, `.mov` MIME type was served as `video/quicktime` instead of web-demuxer-compatible `video/mp4`.
  2. Frontend Duplicates Manager preview lightbox modal and side-by-side comparator unconditionally rendered `<img>` tags for all items, breaking preview for video files. `MediaViewerModal` lacked video `poster` frame extraction, `playsInline`, `preload="metadata"`, and had no error recovery fallback when browsers could not decode specific codecs (e.g. Apple QuickTime HEVC in `.mov`).
  - Fixed by implementing full HTTP 206 Range request streaming in `media.controller.ts`, serving `.mov` as `video/mp4`, adding `<video>` player support to Duplicates Manager preview modal and comparator, adding first-frame extracted WebP posters, and adding a friendly fallback overlay with direct video download button for unsupported codecs.
  - **Affected version**: v0.3.x, v0.6.0
  - **Fixed in**: v0.7.0
  - **References**: User issue *Preview for video files is not working*
  - **References**: User issue *Preview for video files is not working*

---

## 🔒 Security, Access Control & Admin

*(No known issues)*

---

## 📱 Clients & Platforms

*(No known issues)*

---

## 🗄️ Database & Caching

*(No known issues)*

---

## 🌐 Internationalization (i18n)

*(No known issues)*

---

> **How to add a new bug**
>
> 1. Choose the appropriate section above.
> 2. Add a bullet in the format:
>    ```
>    - [ ] 🟠 **Short description**: Detailed explanation. Affected files: `ComponentName.tsx`.
>      - **Affected version**: vX.Y.Z
>      - **Fixed in**: vA.B.C (Unreleased) — or "Not yet fixed"
>      - **References**: Link / conversation / issue
>    ```
> 3. Mark it `[x]` once a fix is merged and update **Fixed in** with the target release version.
> 4. Mirror the fix entry in `CHANGELOG.md` under `### Fixed` for the corresponding release.
