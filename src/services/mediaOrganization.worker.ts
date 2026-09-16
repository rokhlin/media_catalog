import { expose } from 'comlink';
import type {
  GalleryMediaFile,
  FolderTreeNode,
  DateGroupNode,
  PersonGroupNode,
  MediaSortField,
  MediaSortOrder,
} from '../models/media';

export interface FilterCriteria {
  searchQuery?: string;
  typeFilter?: 'all' | 'images' | 'videos';
  statusFilter?: 'all' | 'PROCESSED' | 'UNPROCESSED' | 'PENDING';
  faceFilter?: 'all' | 'with_faces' | 'no_faces' | 'unassigned';
  selectedPerson?: string;
  selectedFolder?: string;
}

export class MediaOrganizationWorker {
  buildFolderTree(files: GalleryMediaFile[]): FolderTreeNode[] {
    const rootMap = new Map<string, FolderTreeNode>();

    const getOrCreateNode = (fullPath: string, name: string, parentPath: string, depth: number): FolderTreeNode => {
      const key = (fullPath || 'root').toLowerCase();
      const existing = rootMap.get(key);
      if (existing) return existing;

      const node: FolderTreeNode = {
        id: fullPath || 'root',
        name: name || 'Root',
        fullPath: fullPath,
        relativePath: parentPath ? fullPath.replace(parentPath, '').replace(/^[/\\]+/, '') : name,
        depth: depth,
        isFolder: true,
        fileCount: 0,
        processedCount: 0,
        totalBytes: 0,
        children: [],
        files: [],
      };
      rootMap.set(key, node);
      return node;
    };

    for (const file of files) {
      const filePath = (file.file_path || file.filename || '').replace(/\\/g, '/');
      const baseFolder = (file.folder || '').replace(/\\/g, '/').replace(/\/+$/, '');

      let relPath = filePath;
      if (baseFolder && filePath.toLowerCase().startsWith(baseFolder.toLowerCase())) {
        relPath = filePath.slice(baseFolder.length).replace(/^\/+/, '');
      }

      const segments = relPath.split('/').filter(Boolean);
      const folderSegments = segments.length > 1 ? segments.slice(0, -1) : [];

      let currentPath = baseFolder || 'Root';
      let parentNode = getOrCreateNode(currentPath, currentPath.split('/').pop() || 'Root', '', 0);

      parentNode.fileCount += 1;
      parentNode.totalBytes += file.file_size || 0;
      if (file.status === 'PROCESSED') parentNode.processedCount += 1;

      let depth = 1;
      for (const seg of folderSegments) {
        const nextPath = `${currentPath}/${seg}`;
        let childNode = rootMap.get(nextPath.toLowerCase());
        if (!childNode) {
          childNode = getOrCreateNode(nextPath, seg, currentPath, depth);
          parentNode.children.push(childNode);
        }
        childNode.fileCount += 1;
        childNode.totalBytes += file.file_size || 0;
        if (file.status === 'PROCESSED') childNode.processedCount += 1;

        parentNode = childNode;
        currentPath = nextPath;
        depth += 1;
      }

      parentNode.files.push(file);
    }

    const rootNodes = Array.from(rootMap.values()).filter((n) => n.depth === 0);
    const sortTree = (node: FolderTreeNode) => {
      node.children.sort((a, b) => a.name.localeCompare(b.name));
      node.children.forEach(sortTree);
    };
    rootNodes.forEach(sortTree);
    return rootNodes;
  }

  groupByDate(files: GalleryMediaFile[], language: 'en' | 'ru' = 'en'): DateGroupNode[] {
    const groupMap = new Map<string, DateGroupNode>();
    const monthNamesEn = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const monthNamesRu = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

    for (const file of files) {
      let d: Date | null = null;
      if (file.mtime) {
        d = new Date(file.mtime * 1000);
      } else if (file.capture_date) {
        d = new Date(file.capture_date);
      }

      let key = 'undated';
      let year = language === 'ru' ? 'Без даты' : 'Undated';
      let label = language === 'ru' ? 'Без даты' : 'Undated';
      let month: string | undefined;

      if (d && !isNaN(d.getTime())) {
        const y = d.getFullYear();
        const mIdx = d.getMonth();
        const mName = language === 'ru' ? monthNamesRu[mIdx] : monthNamesEn[mIdx];
        key = `${y}-${String(mIdx + 1).padStart(2, '0')}`;
        year = String(y);
        month = mName;
        label = `${mName} ${y}`;
      }

      let group = groupMap.get(key);
      if (!group) {
        group = {
          key,
          label,
          year,
          month,
          count: 0,
          processedCount: 0,
          files: [],
        };
        groupMap.set(key, group);
      }

      group.count += 1;
      if (file.status === 'PROCESSED') group.processedCount += 1;
      group.files.push(file);
    }

    return Array.from(groupMap.values()).sort((a, b) => {
      if (a.key === 'undated') return 1;
      if (b.key === 'undated') return -1;
      return b.key.localeCompare(a.key);
    });
  }

  groupByPerson(
    files: GalleryMediaFile[],
    knownPersons?: Array<{ name: string; avatarUrl?: string | null }>
  ): PersonGroupNode[] {
    const personMap = new Map<string, PersonGroupNode>();
    const avatarMap = new Map<string, string | null>();

    if (knownPersons) {
      for (const kp of knownPersons) {
        if (kp.name) {
          avatarMap.set(kp.name.toLowerCase(), kp.avatarUrl || null);
        }
      }
    }

    const getOrCreateGroup = (name: string, isUnassigned: boolean): PersonGroupNode => {
      let group = personMap.get(name);
      if (!group) {
        const avatar = avatarMap.get(name.toLowerCase()) || null;
        group = {
          personName: name,
          avatarUrl: avatar,
          count: 0,
          isUnassigned: isUnassigned,
          files: [],
        };
        personMap.set(name, group);
      }
      return group;
    };

    const unassignedGroup = getOrCreateGroup('❓ Unassigned Faces', true);
    const noFacesGroup = getOrCreateGroup('🚫 No Faces', false);

    for (const file of files) {
      const faceNames = file.face_names || [];
      const hasFaces = (file.face_count && file.face_count > 0) || (file.faces && file.faces.length > 0);

      if (!hasFaces) {
        noFacesGroup.count += 1;
        noFacesGroup.files.push(file);
        continue;
      }

      let taggedAnyKnown = false;
      for (const name of faceNames) {
        if (name && !name.startsWith('face_') && name.toLowerCase() !== 'unknown') {
          const group = getOrCreateGroup(name, false);
          group.count += 1;
          group.files.push(file);
          taggedAnyKnown = true;
        }
      }

      if (file.has_unassigned_faces || !taggedAnyKnown) {
        unassignedGroup.count += 1;
        unassignedGroup.files.push(file);
      }
    }

    const knownGroups = Array.from(personMap.values()).filter(
      (g) => g !== unassignedGroup && g !== noFacesGroup && g.count > 0
    );
    knownGroups.sort((a, b) => b.count - a.count || a.personName.localeCompare(b.personName));

    const result: PersonGroupNode[] = [...knownGroups];
    if (unassignedGroup.count > 0) result.push(unassignedGroup);
    if (noFacesGroup.count > 0) result.push(noFacesGroup);

    return result;
  }

  sortMediaFiles(files: GalleryMediaFile[], field: MediaSortField, order: MediaSortOrder = 'desc'): GalleryMediaFile[] {
    const dir = order === 'asc' ? 1 : -1;
    return [...files].sort((a, b) => {
      switch (field) {
        case 'name':
          return dir * (a.filename || '').localeCompare(b.filename || '');
        case 'date':
          return dir * ((a.mtime || 0) - (b.mtime || 0));
        case 'size':
          return dir * ((a.file_size || 0) - (b.file_size || 0));
        case 'status':
          return dir * (a.status || 'UNPROCESSED').localeCompare(b.status || 'UNPROCESSED');
        case 'faces':
          return dir * ((a.face_count || 0) - (b.face_count || 0));
        default:
          return 0;
      }
    });
  }

  filterMediaFiles(files: GalleryMediaFile[], criteria: FilterCriteria): GalleryMediaFile[] {
    const trimmedSearch = (criteria.searchQuery || '').trim().toLowerCase();
    const isSearchActive = trimmedSearch.length >= 3;

    return files.filter((item) => {
      if (isSearchActive) {
        const matchDesc = Boolean(item.description && item.description.toLowerCase().includes(trimmedSearch));
        const matchDescRu = Boolean(item.description_ru && item.description_ru.toLowerCase().includes(trimmedSearch));
        const matchSummary = Boolean(item.summary && item.summary.toLowerCase().includes(trimmedSearch));
        const matchSummaryRu = Boolean(item.summary_ru && item.summary_ru.toLowerCase().includes(trimmedSearch));
        const matchName = Boolean(item.filename && item.filename.toLowerCase().includes(trimmedSearch));
        const matchFolder = Boolean(item.folder && item.folder.toLowerCase().includes(trimmedSearch));
        const matchFaces = Boolean(item.face_names && item.face_names.some((fn) => fn.toLowerCase().includes(trimmedSearch)));
        const matchOcr = Boolean(item.ocr_text && item.ocr_text.toLowerCase().includes(trimmedSearch));

        if (!matchDesc && !matchDescRu && !matchSummary && !matchSummaryRu && !matchName && !matchFolder && !matchFaces && !matchOcr) {
          return false;
        }
      }

      if (criteria.typeFilter === 'images' && !item.is_image) return false;
      if (criteria.typeFilter === 'videos' && !item.is_video) return false;

      if (criteria.statusFilter && criteria.statusFilter !== 'all') {
        const itemStatus = item.status || 'UNPROCESSED';
        if (itemStatus !== criteria.statusFilter) return false;
      }

      if (criteria.faceFilter === 'with_faces') {
        const hasFaces = (item.face_count && item.face_count > 0) || (item.faces && item.faces.length > 0);
        if (!hasFaces) return false;
      } else if (criteria.faceFilter === 'no_faces') {
        const hasFaces = (item.face_count && item.face_count > 0) || (item.faces && item.faces.length > 0);
        if (hasFaces) return false;
      } else if (criteria.faceFilter === 'unassigned') {
        if (!item.has_unassigned_faces) return false;
      }

      if (criteria.selectedPerson && criteria.selectedPerson !== 'all') {
        const hasPerson =
          (item.face_names && item.face_names.includes(criteria.selectedPerson)) ||
          (item.faces && item.faces.some((f) => f.name === criteria.selectedPerson || f.person_id === criteria.selectedPerson));
        if (!hasPerson) return false;
      }

      if (criteria.selectedFolder) {
        const rawTarget = criteria.selectedFolder.replace(/\\/g, '/').replace(/\/+$/, '');
        const target = rawTarget.toLowerCase();
        if (target && target !== 'root') {
          const itemFilePath = (item.file_path || item.filename || '').replace(/\\/g, '/');
          const itemFilePathLower = itemFilePath.toLowerCase();
          const lastSlash = itemFilePathLower.lastIndexOf('/');
          const itemDirLower = lastSlash >= 0 ? itemFilePathLower.slice(0, lastSlash) : '';
          const itemFolderLower = (item.folder || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();

          // Target without optional 'root/' prefix if tree was rooted at 'Root'
          const targetWithoutRoot = target.startsWith('root/') ? target.slice(5) : target;

          // Check if item belongs to selected folder:
          // 1. Direct directory match or subdirectory of selected folder
          const matchesDir =
            itemDirLower === target ||
            itemDirLower.startsWith(target + '/') ||
            itemDirLower === targetWithoutRoot ||
            itemDirLower.startsWith(targetWithoutRoot + '/');

          // 2. Base folder matches or is subfolder of target
          const matchesFolder =
            itemFolderLower === target ||
            itemFolderLower.startsWith(target + '/') ||
            itemFolderLower === targetWithoutRoot ||
            itemFolderLower.startsWith(targetWithoutRoot + '/');

          let matches = matchesDir || matchesFolder;

          if (!matches) {
            // Target might be a single folder name (no slashes) matching a path segment
            if (!target.includes('/')) {
              const dirSegments = itemDirLower.split('/').filter(Boolean);
              const folderSegments = itemFolderLower.split('/').filter(Boolean);
              matches = dirSegments.includes(target) || folderSegments.includes(target);
            } else {
              // Target might be a relative subpath matching the end of itemDir
              matches =
                itemDirLower.endsWith('/' + target) ||
                itemFolderLower.endsWith('/' + target) ||
                itemDirLower.endsWith('/' + targetWithoutRoot) ||
                itemFolderLower.endsWith('/' + targetWithoutRoot);
            }
          }

          if (!matches) {
            // Boundary-safe fallback ensuring full folder segment match (e.g. not matching 'vacation-other' for 'vacation')
            const targetSlash = target + '/';
            const targetWithoutRootSlash = targetWithoutRoot + '/';
            const normPathSlash = itemFilePathLower + '/';
            const normFolderSlash = itemFolderLower ? itemFolderLower + '/' : '';

            matches =
              normPathSlash.includes(targetSlash) ||
              (normFolderSlash.length > 0 && normFolderSlash.includes(targetSlash)) ||
              (targetWithoutRoot.length > 0 &&
                (normPathSlash.includes('/' + targetWithoutRootSlash) ||
                 normFolderSlash.includes('/' + targetWithoutRootSlash)));
          }

          if (!matches) return false;
        }
      }

      return true;
    });
  }

  /**
   * Calculate Hamming distance between two 16-hex perceptual hashes
   */
  private calculateHammingDistance(h1?: string, h2?: string): number {
    if (!h1 || !h2 || h1.length !== 16 || h2.length !== 16) return 64;
    let dist = 0;
    for (let i = 0; i < h1.length; i++) {
      const v1 = parseInt(h1[i], 16);
      const v2 = parseInt(h2[i], 16);
      let xor = v1 ^ v2;
      while (xor > 0) {
        dist += xor & 1;
        xor >>= 1;
      }
    }
    return dist;
  }

  /**
   * Helper to parse arbitrary date string or number to timestamp in seconds
   */
  private parseDateToSeconds(val: string | number | Date | undefined | null): number | null {
    if (!val) return null;
    if (typeof val === 'number') {
      return val > 1e11 ? val / 1000 : val;
    }
    const str = String(val).trim();
    if (!str) return null;

    // Support standard EXIF colon notation: "2016:07:02 12:25:42"
    const exifMatch = str.match(/^(\d{4}):(\d{2}):(\d{2})[T\s](\d{2}):(\d{2}):(\d{2})/);
    if (exifMatch) {
      const d = new Date(
        parseInt(exifMatch[1], 10),
        parseInt(exifMatch[2], 10) - 1,
        parseInt(exifMatch[3], 10),
        parseInt(exifMatch[4], 10),
        parseInt(exifMatch[5], 10),
        parseInt(exifMatch[6], 10)
      );
      const ts = d.getTime();
      return isNaN(ts) ? null : ts / 1000;
    }

    const ts = new Date(str).getTime();
    return isNaN(ts) ? null : ts / 1000;
  }

  /**
   * Helper to parse date from common camera and messenger filename patterns
   */
  private parseDateFromFilename(filename: string): number | null {
    if (!filename) return null;
    const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');

    // Pattern 1: ISO date & time: "2016-07-02 12-25-42", "2016-07-02_12-25-42", "2016-07-02 12:25:42"
    const isoMatch = nameWithoutExt.match(/(?:^|[^\d])(\d{4})[-_](\d{2})[-_](\d{2})[T_\s](\d{2})[-:_](\d{2})[-:_](\d{2})(?:[^\d]|$)/i);
    if (isoMatch) {
      const d = new Date(
        parseInt(isoMatch[1], 10),
        parseInt(isoMatch[2], 10) - 1,
        parseInt(isoMatch[3], 10),
        parseInt(isoMatch[4], 10),
        parseInt(isoMatch[5], 10),
        parseInt(isoMatch[6], 10)
      );
      const ts = d.getTime();
      if (!isNaN(ts)) return ts / 1000;
    }

    // Pattern 2: Compact camera timestamp: "20150412_190907", "IMG_20200810_123456"
    const compactMatch = nameWithoutExt.match(/(?:^|[A-Za-z_-])(\d{4})(\d{2})(\d{2})[-_](\d{2})(\d{2})(\d{2})(?:[^\d]|$)/);
    if (compactMatch) {
      const d = new Date(
        parseInt(compactMatch[1], 10),
        parseInt(compactMatch[2], 10) - 1,
        parseInt(compactMatch[3], 10),
        parseInt(compactMatch[4], 10),
        parseInt(compactMatch[5], 10),
        parseInt(compactMatch[6], 10)
      );
      const ts = d.getTime();
      if (!isNaN(ts)) return ts / 1000;
    }

    // Pattern 3: Date only with WhatsApp suffix: "VID-20260330-WA0000", "IMG-20260817-WA0001"
    const waMatch = nameWithoutExt.match(/(?:VID|IMG)[-_](\d{4})(\d{2})(\d{2})[-_]WA/i);
    if (waMatch) {
      const d = new Date(
        parseInt(waMatch[1], 10),
        parseInt(waMatch[2], 10) - 1,
        parseInt(waMatch[3], 10),
        0, 0, 0
      );
      const ts = d.getTime();
      if (!isNaN(ts)) return ts / 1000;
    }

    return null;
  }

  /**
   * Helper to extract normalized timestamp in seconds from file metadata.
   * Prioritizes real capture timestamps; NEVER falls back to filesystem mtime.
   */
  private getFileTimestamp(file: GalleryMediaFile): number | null {
    // 1. Explicit EXIF capture date
    if (file.capture_date) {
      const ts = this.parseDateToSeconds(file.capture_date);
      if (ts !== null) return ts;
    }

    // 2. EXIF / Media Date
    if (file.media_date) {
      const ts = this.parseDateToSeconds(file.media_date);
      if (ts !== null) return ts;
    }

    // 3. Date encoded directly in filename
    const fnDate = this.parseDateFromFilename(file.filename || '');
    if (fnDate !== null) {
      return fnDate;
    }

    // Never fall back to mtime if no other timestamp exists
    return null;
  }

  /**
   * Helper to extract series prefix and sequence index from filename
   * E.g. 'IMG_8427_10.HEIC' -> prefix 'img_8427', index 10, isExplicitBurst: true
   *      'IMG_8407_1.MOV'   -> prefix 'img_8407', index 1, isExplicitBurst: true
   *      'IMG_8407.MOV'     -> prefix 'img_8407', index 0, isExplicitBurst: false
   *      'Photo (1).jpg'    -> prefix 'photo', index 1, isExplicitBurst: true
   */
  private extractSeriesKey(filename: string): { seriesPrefix: string; index?: number; isExplicitBurst: boolean } {
    const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');

    // Reject date-time filenames from being misinterpreted as series prefixes
    // e.g. "2016-07-02 12-25-42" -> do NOT treat "-42" as sequence index 42!
    if (/\d{4}[-_]\d{2}[-_]\d{2}[T_\s-]\d{2}[-_:]\d{2}[-_:]\d{2}/i.test(nameWithoutExt)) {
      return { seriesPrefix: nameWithoutExt.toLowerCase(), index: 0, isExplicitBurst: false };
    }

    // Reject WhatsApp media files: "VID-20260330-WA0000_1"
    if (/^(?:VID|IMG)[-_]\d{8}[-_]WA\d+/i.test(nameWithoutExt)) {
      return { seriesPrefix: nameWithoutExt.toLowerCase(), index: 0, isExplicitBurst: false };
    }

    // 1. Explicit BURST tag: Name_BURST2020... or Name-BURST...
    const burstMatch = nameWithoutExt.match(/^(.*?)[_-]BURST(?:\d+)?(?:[_-](\d+|COVER))?$/i);
    if (burstMatch) {
      return {
        seriesPrefix: burstMatch[1].toLowerCase(),
        index: burstMatch[2] ? (parseInt(burstMatch[2], 10) || 0) : 0,
        isExplicitBurst: true,
      };
    }

    // 2. Parentheses index: e.g. "IMG_8427 (1)", "Photo (2)"
    const parenIndexMatch = nameWithoutExt.match(/^(.*?)\s*\((\d{1,4})\)$/);
    if (parenIndexMatch) {
      return {
        seriesPrefix: parenIndexMatch[1].toLowerCase(),
        index: parseInt(parenIndexMatch[2], 10),
        isExplicitBurst: true,
      };
    }

    // 3. Multi-segment index: e.g. "IMG_8427_1", "IMG_8427_10", "DSC_1234_1"
    // Base identifier must be a camera/series tag like IMG_8427 or DSC_1234
    const multiSegmentMatch = nameWithoutExt.match(/^((?:[A-Za-z]+[-_]\d+|[A-Za-z]{2,}[-_]))[-_](\d{1,3})$/);
    if (multiSegmentMatch) {
      return {
        seriesPrefix: multiSegmentMatch[1].toLowerCase(),
        index: parseInt(multiSegmentMatch[2], 10),
        isExplicitBurst: true,
      };
    }

    // Base name itself without index suffix
    return { seriesPrefix: nameWithoutExt.toLowerCase(), index: 0, isExplicitBurst: false };
  }

  /**
   * Helper to select the most suitable representative primary file from a group
   */
  private pickPrimaryFile(group: GalleryMediaFile[]): GalleryMediaFile {
    if (group.length === 1) return group[0];
    // Prefer PROCESSED files, then files with faces/descriptions, then first in sequence
    const scored = [...group].sort((a, b) => {
      const aProcessed = a.status === 'PROCESSED' ? 10 : 0;
      const bProcessed = b.status === 'PROCESSED' ? 10 : 0;
      const aFaces = (a.face_count || 0) > 0 ? 5 : 0;
      const bFaces = (b.face_count || 0) > 0 ? 5 : 0;
      return (bProcessed + bFaces) - (aProcessed + aFaces);
    });
    return scored[0] || group[0];
  }

  /**
   * Group series shots (burst photos and sequential shots) within the same folder.
   * Returns representative primary files with attached `similar_group_files` and `similar_files_count`.
   */
  groupBySimilarity(
    files: GalleryMediaFile[],
    _similarityThreshold = 0.90,
    burstWindowSec = 3.0
  ): GalleryMediaFile[] {
    const assignedFiles = new Set<string>();
    const result: GalleryMediaFile[] = [];

    const getKey = (f: GalleryMediaFile) => (f.file_path || f.filename || '').toLowerCase();

    // Group files by folder first (series grouping is strictly intra-folder)
    const folderMap = new Map<string, GalleryMediaFile[]>();
    for (const file of files) {
      const folderKey = (file.folder || '').toLowerCase();
      const list = folderMap.get(folderKey) || [];
      list.push(file);
      folderMap.set(folderKey, list);
    }

    for (const [, folderFiles] of folderMap.entries()) {
      // Separate images and videos: photos and videos are grouped in their own series
      const imageFiles = folderFiles.filter((f) => f.is_image);
      const videoFiles = folderFiles.filter((f) => f.is_video);
      const otherFiles = folderFiles.filter((f) => !f.is_image && !f.is_video);

      const processGroupCollection = (mediaList: GalleryMediaFile[], mediaType: 'image' | 'video' | 'other') => {
        if (mediaList.length === 0) return;

        // 1. Group by Series Prefix (e.g. IMG_8427_1..IMG_8427_10 or IMG_8407_1..IMG_8407_6, IMG_8407)
        const prefixMap = new Map<string, GalleryMediaFile[]>();
        const hasExplicitBurst = new Set<string>();

        for (const file of mediaList) {
          if (assignedFiles.has(getKey(file))) continue;
          const { seriesPrefix, isExplicitBurst } = this.extractSeriesKey(file.filename || '');
          if (seriesPrefix) {
            const list = prefixMap.get(seriesPrefix) || [];
            list.push(file);
            prefixMap.set(seriesPrefix, list);
            if (isExplicitBurst) {
              hasExplicitBurst.add(seriesPrefix);
            }
          }
        }

        for (const [prefix, group] of prefixMap.entries()) {
          // Group if at least one file had an explicit burst suffix
          if (group.length > 1 && hasExplicitBurst.has(prefix)) {
            // Sort group in natural sequential order (1, 2, ... 10)
            group.sort((a, b) => {
              const aKey = this.extractSeriesKey(a.filename || '');
              const bKey = this.extractSeriesKey(b.filename || '');
              if (aKey.index !== undefined && bKey.index !== undefined && aKey.index !== bKey.index) {
                return aKey.index - bKey.index;
              }
              const aTs = this.getFileTimestamp(a) || 0;
              const bTs = this.getFileTimestamp(b) || 0;
              return aTs - bTs || (a.filename || '').localeCompare(b.filename || '');
            });

            const primary = this.pickPrimaryFile(group);
            const groupId = `series_${prefix}`;

            // Clean non-circular member representation
            const cleanGroupMembers: GalleryMediaFile[] = group.map((item) => {
              const { similar_group_files: _, ...clean } = item;
              return {
                ...clean,
                similarity_group_id: groupId,
                is_primary_in_group: item === primary,
                similar_files_count: group.length,
              };
            });

            for (const f of group) {
              assignedFiles.add(getKey(f));
              f.similarity_group_id = groupId;
              f.is_primary_in_group = (f === primary);
              f.similar_files_count = group.length;
              f.similar_group_files = cleanGroupMembers;
            }
            result.push(primary);
          }
        }

        // 2. Group by Time-Proximity Burst Shots (strictly for photos, NOT videos)
        if (mediaType === 'image') {
          // Filter remaining candidates that have valid capture timestamps
          const remainingCandidates = mediaList.filter(
            (f) => !assignedFiles.has(getKey(f)) && this.getFileTimestamp(f) !== null
          );
          remainingCandidates.sort((a, b) => {
            const aTs = this.getFileTimestamp(a)!;
            const bTs = this.getFileTimestamp(b)!;
            return aTs - bTs || (a.filename || '').localeCompare(b.filename || '');
          });

          let currentBurst: GalleryMediaFile[] = [];
          let burstStartTs: number | null = null;

          const commitBurst = () => {
            if (currentBurst.length > 1) {
              const primary = this.pickPrimaryFile(currentBurst);
              const groupId = `burst_${primary.filename?.replace(/\.[^/.]+$/, '') || Date.now()}`;

              // Clean non-circular member representation
              const cleanGroupMembers: GalleryMediaFile[] = currentBurst.map((item) => {
                const { similar_group_files: _, ...clean } = item;
                return {
                  ...clean,
                  similarity_group_id: groupId,
                  is_primary_in_group: item === primary,
                  similar_files_count: currentBurst.length,
                };
              });

              for (const f of currentBurst) {
                assignedFiles.add(getKey(f));
                f.similarity_group_id = groupId;
                f.is_primary_in_group = (f === primary);
                f.similar_files_count = currentBurst.length;
                f.similar_group_files = cleanGroupMembers;
              }
              result.push(primary);
            }
          };

          for (let i = 0; i < remainingCandidates.length; i++) {
            const file = remainingCandidates[i];
            if (assignedFiles.has(getKey(file))) continue;
            const curTs = this.getFileTimestamp(file)!;

            if (currentBurst.length === 0) {
              currentBurst = [file];
              burstStartTs = curTs;
              continue;
            }

            // Anchor check: must be within burstWindowSec from the start of the burst
            const timeDiffFromStart = Math.abs(curTs - (burstStartTs ?? curTs));
            let isBurst = false;

            if (timeDiffFromStart <= burstWindowSec) {
              const anchorFile = currentBurst[0];
              const prevFile = currentBurst[currentBurst.length - 1];

              // Cascade confidence:
              // 1. If visual hashes exist on both, compare Hamming distance
              if (file.phash && (anchorFile.phash || prevFile.phash)) {
                const compareHash = prevFile.phash || anchorFile.phash!;
                const dist = this.calculateHammingDistance(file.phash, compareHash);
                isBurst = dist <= 20; // Visual threshold passed
              } else {
                // 2. If visual hashes are absent:
                // NEVER assume isBurst = true!
                // Only group if filenames have explicit matching burst patterns AND capture date is within threshold
                const keyA = this.extractSeriesKey(anchorFile.filename || '');
                const keyCur = this.extractSeriesKey(file.filename || '');
                if (keyA.isExplicitBurst && keyCur.isExplicitBurst && keyA.seriesPrefix === keyCur.seriesPrefix) {
                  isBurst = true;
                } else {
                  isBurst = false;
                }
              }
            }

            if (isBurst) {
              currentBurst.push(file);
            } else {
              commitBurst();
              currentBurst = [file];
              burstStartTs = curTs;
            }
          }

          commitBurst();
        }
      };

      processGroupCollection(imageFiles, 'image');
      processGroupCollection(videoFiles, 'video');
      processGroupCollection(otherFiles, 'other');
    }

    // Add all remaining unique files as individual cards
    for (const f of files) {
      if (!assignedFiles.has(getKey(f))) {
        f.similar_files_count = 1;
        f.similarity_group_id = undefined;
        f.similar_group_files = undefined;
        f.is_primary_in_group = true;
        result.push(f);
      }
    }

    return result;
  }
}

if (typeof self !== 'undefined' && typeof self.addEventListener !== 'undefined') {
  expose(new MediaOrganizationWorker());
}

