import React, { useState, useEffect, useMemo, useCallback, useRef, useTransition } from 'react';
import type {
  PersonItem,
  UISettings,
  GalleryMediaFile,
  DetectedFaceRecord,
  DateGroupNode,
  PersonGroupNode,
  GalleryViewMode,
  MediaSortField,
  MediaSortOrder,
  FolderTreeNode,
} from '../../models';
import { useLanguage } from '../../i18n/LanguageContext';
import { mediaOrganizationService } from '../../services/mediaOrganizationService';
import { mediaCacheService } from '../../services/mediaCacheService';
import { FlagsManager } from '../../services/featureFlagsContext';
import { errorInterceptor } from '../../utils/errorInterceptor';
import MediaViewerModal from './MediaViewerModal';
import ViewSwitcherButtonGroup from './ViewSwitcherButtonGroup';
import FilterSortSearchBar from './FilterSortSearchBar';
import { SearchBar } from './FilterSortSearchBar';
import FaceRegistryUI from '../faces/FaceRegistryUI';
import TimelineCalendarView from './TimelineCalendarView';
import ModuleStatusBadges from './ModuleStatusBadges';

export type { GalleryMediaFile, DetectedFaceRecord };


interface InputSourcesGalleryProps {
  mediaFiles?: GalleryMediaFile[];
  isLoading?: boolean;
  isBackgroundLoading?: boolean;
  totalKnownFiles?: number | null;
  onRefresh?: () => void;
  onFetchMore?: () => void;
  onStartSingleAnalysis?: (
    filePath: string,
    onSuccess?: () => void,
    onError?: (errMsg: string) => void
  ) => Promise<boolean | void> | void;
  onSwitchToControls?: () => void;
  persons?: PersonItem[];
  uiSettings?: UISettings;
  disabled?: boolean;
  onReloadFaces?: () => Promise<void>;
  onViewInFamilyTree?: (personName: string, personId?: string) => void;
  currentLoadingFile?: string | null;
  currentLoadingFilename?: string | null;
  scannedFilesCount?: number;
  activeInputFolders?: string[];
  isEngineConnected?: boolean;
}

export default function InputSourcesGallery({
  mediaFiles = [],
  isLoading = false,
  isBackgroundLoading: _isBackgroundLoading = false,
  totalKnownFiles,
  onRefresh,
  onFetchMore,
  onStartSingleAnalysis,
  onSwitchToControls,
  persons = [],
  uiSettings,
  disabled = false,
  onReloadFaces,
  onViewInFamilyTree,
  currentLoadingFile,
  currentLoadingFilename,
  scannedFilesCount = 0,
  activeInputFolders = [],
  isEngineConnected = true,
}: InputSourcesGalleryProps) {
  const { language, t } = useLanguage();

  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'images' | 'videos'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'PROCESSED' | 'UNPROCESSED' | 'PENDING'>('all');
  const [faceFilter, setFaceFilter] = useState<'all' | 'with_faces' | 'no_faces' | 'unassigned'>('all');
  const [selectedPerson, setSelectedPerson] = useState<string>('all');
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);

  // View & Organization modes
  const [viewMode, setViewMode] = useState<GalleryViewMode>('gallery');
  const [dateSubView, setDateSubView] = useState<'calendar' | 'list'>('calendar');
  const [sortBy, setSortBy] = useState<MediaSortField>('date');
  const [sortOrder, setSortOrder] = useState<MediaSortOrder>('desc');

  // Expanded/Collapsed node sets
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['root', 'Root']));
  const [collapsedDates, setCollapsedDates] = useState<Set<string>>(new Set());
  const [collapsedPersons, setCollapsedPersons] = useState<Set<string>>(new Set());

  // Configured max rows batch size (default: 10)
  const batchRows = Math.max(1, Number(uiSettings?.galleryMaxRows) || 10);
  const [loadedRows, setLoadedRows] = useState<number>(batchRows);
  const [columnCount, setColumnCount] = useState<number>(() => uiSettings?.maxImagesPerRow || 8);


  const gridRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Selected media item for full-screen Lightbox / Media Viewer modal
  const [selectedMedia, setSelectedMedia] = useState<GalleryMediaFile | null>(null);

  // Keep selectedMedia synchronized if background scan or face update alters current media
  useEffect(() => {
    if (selectedMedia && Array.isArray(mediaFiles)) {
      const match = mediaFiles.find(
        (f) =>
          (f.file_path && f.file_path === selectedMedia.file_path) ||
          f.filename === selectedMedia.filename
      );
      if (
        match &&
        (match.status !== selectedMedia.status ||
          match.face_count !== selectedMedia.face_count ||
          match.description !== selectedMedia.description)
      ) {
        setSelectedMedia((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            ...match,
            similar_group_files: prev.similar_group_files || match.similar_group_files,
            similar_files_count: prev.similar_files_count || match.similar_files_count,
            similarity_group_id: prev.similarity_group_id || match.similarity_group_id,
          };
        });
      }
    }
  }, [mediaFiles]);

  // Extract distinct recognized people and face counts across all media files
  const distinctPeople = useMemo(() => {
    const counts: Record<string, number> = {};
    mediaFiles.forEach((file) => {
      if (file.face_names && Array.isArray(file.face_names)) {
        file.face_names.forEach((name) => {
          if (name) {
            counts[name] = (counts[name] || 0) + 1;
          }
        });
      }
    });

    if (Array.isArray(persons)) {
      persons.forEach((p) => {
        if (p.name && !(p.name in counts)) {
          counts[p.name] = 0;
        }
      });
    }

    return Object.entries(counts).sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    });
  }, [mediaFiles, persons]);

  // Aggregated list of known persons with optional avatar crop
  const knownPersonOptions = useMemo(() => {
    const map = new Map<string, { name: string; avatarUrl?: string | null; count: number }>();
    if (Array.isArray(persons)) {
      persons.forEach((p) => {
        if (p.name) {
          const sample = p.sample_images && p.sample_images.length > 0 ? p.sample_images[0] : null;
          const sampleFile = sample ? sample.split(/[/\\]/).pop() : null;
          const avatar = sampleFile && !sampleFile.startsWith('manual_') && !sampleFile.startsWith('face_manual_')
            ? `/api/faces/image/${sampleFile}`
            : null;
          map.set(p.name, { name: p.name, avatarUrl: avatar, count: p.reference_count || 0 });
        }
      });
    }
    if (Array.isArray(distinctPeople)) {
      distinctPeople.forEach(([name, count]) => {
        if (name && !name.startsWith('face_') && name.toLowerCase() !== 'unknown') {
          if (!map.has(name)) {
            map.set(name, { name, avatarUrl: null, count });
          }
        }
      });
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [persons, distinctPeople]);

  // Format file size
  const formatBytes = (bytes?: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // Format timestamp
  const formatDate = (mtime?: number) => {
    if (!mtime) return '';
    try {
      const d = new Date(mtime * 1000);
      const loc = language === 'ru' ? 'ru-RU' : 'en-US';
      return d.toLocaleDateString(loc) + ' ' + d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  // Filtered and sorted files
  const [isSimilarityGrouped, setIsSimilarityGrouped] = useState(true);
  const [filteredFiles, setFilteredFiles] = useState<GalleryMediaFile[]>([]);
  const [folderTree, setFolderTree] = useState<FolderTreeNode[]>([]);
  const [dateGroups, setDateGroups] = useState<DateGroupNode[]>([]);
  const [personGroups, setPersonGroups] = useState<PersonGroupNode[]>([]);

  const [, startTransition] = useTransition();

  // Find series group files for currently selected media (from file itself or matching item in filteredFiles)
  const currentSeriesGroupFiles = useMemo(() => {
    if (!selectedMedia) return undefined;
    if (selectedMedia.similar_group_files && selectedMedia.similar_group_files.length > 1) {
      return selectedMedia.similar_group_files;
    }
    const match = filteredFiles.find(
      (f) =>
        ((f.file_path && f.file_path === selectedMedia.file_path) || f.filename === selectedMedia.filename) &&
        f.similar_group_files &&
        f.similar_group_files.length > 1
    ) || filteredFiles.find(
      (f) =>
        f.similar_group_files &&
        f.similar_group_files.some(
          (sf) => (sf.file_path && sf.file_path === selectedMedia.file_path) || sf.filename === selectedMedia.filename
        )
    );
    return match?.similar_group_files;
  }, [selectedMedia, filteredFiles]);

  // Async process for filtering and sorting (debounced to avoid UI freezes on rapid chunk arrivals)
  useEffect(() => {
    let isActive = true;
    const timer = setTimeout(async () => {
      try {
        const filtered = await mediaOrganizationService.filterMediaFiles(mediaFiles, {
          searchQuery,
          typeFilter,
          statusFilter,
          faceFilter,
          selectedPerson,
          selectedFolder: selectedFolder || undefined,
        });
        const sorted = await mediaOrganizationService.sortMediaFiles(filtered, sortBy, sortOrder);
        let finalSorted = sorted;

        if (isSimilarityGrouped) {
          finalSorted = await mediaOrganizationService.groupBySimilarity(sorted, 0.90);
          finalSorted = await mediaOrganizationService.sortMediaFiles(finalSorted, sortBy, sortOrder);
        }

        if (isActive) {
          startTransition(() => {
            setFilteredFiles(finalSorted);
          });
          if (selectedFolder) {
            console.log(`[FolderTree] Filtered by folder "${selectedFolder}": ${finalSorted.length} / ${mediaFiles.length} files matched`);
            if (finalSorted.length === 0 && mediaFiles.length > 0) {
              console.warn(`[FolderTree] No media files matched folder filter "${selectedFolder}"`);
              errorInterceptor.emitLog(
                'WARN',
                'FolderTree',
                `No media files matched folder "${selectedFolder}" (${mediaFiles.length} total files available)`
              );
            }
          }
        }
      } catch (e) {
        console.error("Filter error", e);
        errorInterceptor.emitLog('ERROR', 'MediaGallery', `Filter error: ${e instanceof Error ? e.message : String(e)}`);
      }
    }, 120);

    return () => {
      isActive = false;
      clearTimeout(timer);
    };
  }, [mediaFiles, searchQuery, typeFilter, statusFilter, faceFilter, selectedPerson, selectedFolder, sortBy, sortOrder, isSimilarityGrouped]);

  // Async process for folder tree (depends only on mediaFiles, debounced)
  useEffect(() => {
    let isActive = true;
    const timer = setTimeout(async () => {
      try {
        const tree = await mediaOrganizationService.buildFolderTree(mediaFiles);
        if (isActive) {
          startTransition(() => {
            setFolderTree(tree);
          });
        }
      } catch (e) {
        console.error("Tree error", e);
      }
    }, 200);

    return () => {
      isActive = false;
      clearTimeout(timer);
    };
  }, [mediaFiles]);

  // Async process for date groups (depends on filteredFiles and language, debounced)
  useEffect(() => {
    let isActive = true;
    const timer = setTimeout(async () => {
      try {
        const dates = await mediaOrganizationService.groupByDate(filteredFiles, language === 'ru' ? 'ru' : 'en');
        if (isActive) {
          startTransition(() => {
            setDateGroups(dates);
          });
        }
      } catch (e) {
        console.error("Dates error", e);
      }
    }, 180);

    return () => {
      isActive = false;
      clearTimeout(timer);
    };
  }, [filteredFiles, language]);

  // Async process for person groups (debounced)
  useEffect(() => {
    let isActive = true;
    const timer = setTimeout(async () => {
      try {
        const personsResult = await mediaOrganizationService.groupByPerson(filteredFiles, knownPersonOptions);
        if (isActive) {
          startTransition(() => {
            setPersonGroups(personsResult);
          });
        }
      } catch (e) {
        console.error("Persons error", e);
      }
    }, 180);

    return () => {
      isActive = false;
      clearTimeout(timer);
    };
  }, [filteredFiles, knownPersonOptions]);

  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    typeFilter !== 'all' ||
    statusFilter !== 'all' ||
    faceFilter !== 'all' ||
    selectedPerson !== 'all' ||
    selectedFolder !== null;

  const handleClearFilters = () => {
    setSearchQuery('');
    setTypeFilter('all');
    setStatusFilter('all');
    setFaceFilter('all');
    setSelectedPerson('all');
    setSelectedFolder(null);
  };

  // Toggle folder expansion in tree view
  const toggleFolderExpand = (folderPath: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderPath)) {
        next.delete(folderPath);
      } else {
        next.add(folderPath);
      }
      return next;
    });
  };

  // Toggle date group collapse
  const toggleDateCollapse = (dateKey: string) => {
    setCollapsedDates((prev) => {
      const next = new Set(prev);
      if (next.has(dateKey)) {
        next.delete(dateKey);
      } else {
        next.add(dateKey);
      }
      return next;
    });
  };

  // Toggle person group collapse
  const togglePersonCollapse = (personName: string) => {
    setCollapsedPersons((prev) => {
      const next = new Set(prev);
      if (next.has(personName)) {
        next.delete(personName);
      } else {
        next.add(personName);
      }
      return next;
    });
  };

  // Handle column header sort toggle
  const handleSortToggle = (field: MediaSortField) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortOrder(field === 'name' ? 'asc' : 'desc');
    }
  };

  // Lightbox Navigation
  const currentIndex = useMemo(() => {
    if (!selectedMedia) return -1;
    return filteredFiles.findIndex((f) => f.file_path === selectedMedia.file_path);
  }, [selectedMedia, filteredFiles]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      setSelectedMedia(filteredFiles[currentIndex - 1]);
    }
  }, [currentIndex, filteredFiles]);

  const handleNext = useCallback(() => {
    if (currentIndex >= 0 && currentIndex < filteredFiles.length - 1) {
      setSelectedMedia(filteredFiles[currentIndex + 1]);
    }
  }, [currentIndex, filteredFiles]);

  // Reset loaded rows on filter/search change, folder change, or batch size change
  useEffect(() => {
    setLoadedRows(batchRows);
  }, [batchRows, searchQuery, typeFilter, statusFilter, faceFilter, selectedPerson, selectedFolder, sortBy, sortOrder, mediaFiles.length]);


  // Dynamically detect column count
  const updateColumnCount = useCallback(() => {
    if (!gridRef.current) return;
    const computed = window.getComputedStyle(gridRef.current);
    const cols = computed.gridTemplateColumns.split(' ').filter(Boolean).length;
    if (cols > 0) {
      setColumnCount(cols);
    }
  }, []);

  useEffect(() => {
    updateColumnCount();
    const gridElem = gridRef.current;
    if (!gridElem) return;

    const resizeObserver = new ResizeObserver(() => {
      updateColumnCount();
    });
    resizeObserver.observe(gridElem);

    window.addEventListener('resize', updateColumnCount);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateColumnCount);
    };
  }, [updateColumnCount]);

  const effectiveCols = Math.max(1, columnCount);
  const visibleCount = loadedRows * effectiveCols;
  const visibleFiles = useMemo(() => {
    return filteredFiles.slice(0, visibleCount);
  }, [filteredFiles, visibleCount]);
  const canFetchMoreFromBackend = Boolean(
    onFetchMore && totalKnownFiles !== null && totalKnownFiles !== undefined && mediaFiles.length < totalKnownFiles
  );
  const hasMore = visibleCount < filteredFiles.length || canFetchMoreFromBackend;

  const loadMoreRows = useCallback(() => {
    if (visibleCount < filteredFiles.length) {
      setLoadedRows((prev) => prev + batchRows);
    } else if (onFetchMore) {
      onFetchMore();
      setLoadedRows((prev) => prev + batchRows);
    }
  }, [visibleCount, filteredFiles.length, batchRows, onFetchMore]);

  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(800);

  // IntersectionObserver on sentinel to load next rows when scrolled into view
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMoreRows();
        }
      },
      {
        root: containerRef.current || null,
        rootMargin: '200px',
        threshold: 0.05,
      }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadMoreRows]);

  const handleContainerScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const target = e.currentTarget;
      setScrollTop(target.scrollTop);
      setContainerHeight(target.clientHeight || 800);
      const { scrollTop: st, scrollHeight, clientHeight } = target;
      if (scrollHeight - st - clientHeight < 400 && hasMore) {
        loadMoreRows();
      }
    },
    [hasMore, loadMoreRows]
  );

  // Virtual windowing calculations for Grid view (card height ~260px)
  const CARD_ROW_HEIGHT = 260;
  const OVERSCAN_GRID_ROWS = 3;
  const totalGalleryRows = Math.ceil(visibleFiles.length / effectiveCols);
  const startGalleryRow = Math.max(0, Math.floor(scrollTop / CARD_ROW_HEIGHT) - OVERSCAN_GRID_ROWS);
  const endGalleryRow = Math.min(totalGalleryRows, Math.ceil((scrollTop + containerHeight) / CARD_ROW_HEIGHT) + OVERSCAN_GRID_ROWS);
  const startGalleryIndex = startGalleryRow * effectiveCols;
  const endGalleryIndex = Math.min(visibleFiles.length, endGalleryRow * effectiveCols);
  const virtualizedGalleryFiles = useMemo(() => {
    return visibleFiles.slice(startGalleryIndex, endGalleryIndex);
  }, [visibleFiles, startGalleryIndex, endGalleryIndex]);

  const galleryTopPadding = startGalleryRow * CARD_ROW_HEIGHT;
  const galleryBottomPadding = Math.max(0, (totalGalleryRows - endGalleryRow) * CARD_ROW_HEIGHT);

  // Virtual windowing calculations for List view (row height ~48px)
  const TABLE_ROW_HEIGHT = 48;
  const OVERSCAN_LIST_ROWS = 6;
  const totalListRows = visibleFiles.length;
  const startListRow = Math.max(0, Math.floor(scrollTop / TABLE_ROW_HEIGHT) - OVERSCAN_LIST_ROWS);
  const endListRow = Math.min(totalListRows, Math.ceil((scrollTop + containerHeight) / TABLE_ROW_HEIGHT) + OVERSCAN_LIST_ROWS);
  const virtualizedListFiles = useMemo(() => {
    return visibleFiles.slice(startListRow, endListRow);
  }, [visibleFiles, startListRow, endListRow]);

  const listTopPadding = startListRow * TABLE_ROW_HEIGHT;
  const listBottomPadding = Math.max(0, (totalListRows - endListRow) * TABLE_ROW_HEIGHT);

  const totalCount = mediaFiles.length;
  const videoCount = mediaFiles.filter((f) => f.is_video).length;
  const showSwitchToControls = FlagsManager.IsActive('app-show-controls-switch');
  const isFilterBarDropdown = FlagsManager.IsActive('filter_bar_dropdown', false);
  const isFaceRegistryDropdown = FlagsManager.IsActive('face_registry_dropdown', false);

  // Render single media card item with thumbnail miniature and async decoding
  const renderCardItem = (file: GalleryMediaFile) => {
    const thumbUrl = `/api/media/thumbnail?path=${encodeURIComponent(file.file_path || file.filename)}&size=360`;

    const localizedDescription =
      language === 'ru'
        ? file.description_ru || file.description || file.summary_ru || file.summary
        : file.description || file.description_ru || file.summary || file.summary_ru;

    const isVideoThumbActive = FlagsManager.IsActive('first-frame-thumbnail-generation');
    const shouldLoadThumbnail = file.is_image || isVideoThumbActive;
    const hasSeries = Boolean(file.similar_files_count && file.similar_files_count > 1);

    return (
      <div
        className={`gallery-card-item ${hasSeries ? 'is-series-stack' : ''}`}
        key={file.file_path || file.filename}
        onClick={() => setSelectedMedia(file)}
        title={
          hasSeries
            ? `${file.filename} (${file.similar_files_count} ${t('similarPhotosInGroup' as any) || 'photos in series'})`
            : `${t('clickToView')}: ${file.filename}`
        }
      >
        <div className="gallery-thumb-wrap">
          {shouldLoadThumbnail ? (
            <>
              <img
                src={thumbUrl}
                alt={file.filename}
                className="gallery-thumb-img"
                loading="lazy"
                decoding="async"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                  const fallback = target.nextElementSibling as HTMLElement;
                  if (fallback) fallback.style.display = 'flex';
                }}
              />
              <div
                className="gallery-thumb-fallback-placeholder"
                style={{
                  display: 'none',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '100%',
                  height: '100%',
                  flexDirection: 'column',
                  background: file.is_video
                    ? 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)'
                    : 'rgba(255, 255, 255, 0.03)',
                  color: file.is_video ? '#c7d2fe' : 'var(--text-muted)',
                }}
              >
                <span style={{ fontSize: '1.8rem' }}>{file.is_video ? '🎥' : '📷'}</span>
                <span style={{ fontSize: '0.68rem', marginTop: '4px', textAlign: 'center', padding: '0 4px' }}>
                  {file.filename}
                </span>
              </div>
            </>
          ) : (
            <div
              className="gallery-thumb-fallback-placeholder"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                height: '100%',
                flexDirection: 'column',
                background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)',
                color: '#c7d2fe',
              }}
            >
              <span style={{ fontSize: '2rem' }}>🎥</span>
              <span style={{ fontSize: '0.68rem', marginTop: '4px', textAlign: 'center', padding: '0 4px' }}>
                {file.filename}
              </span>
            </div>
          )}

          {/* Video Play Overlay Indicator */}
          {file.is_video && isVideoThumbActive && (
            <div className="gallery-video-play-overlay">
              <div className="gallery-video-play-btn" title="Video file">
                <span>▶</span>
              </div>
            </div>
          )}

          {/* Media Type & Status Badges */}
          <div className="gallery-thumb-badges">
            {/* <span className="gallery-tag gallery-tag-type">
              {file.is_video ? '🎥' : '📷'}
            </span> */}
            {Boolean(file.face_count && file.face_count > 0) && (
              <span
                className="gallery-tag gallery-tag-faces"
                title={`${file.face_count} ${t('cardFaceCount')}`}
              >
                👤 {file.face_count}
              </span>
            )}
            {hasSeries && (
              <span
                className="gallery-tag gallery-tag-series"
                title={`${file.similar_files_count} ${t('similarPhotosInGroup' as any) || 'photos in series'}`}
              >
                🗂️ {file.similar_files_count}
              </span>
            )}
            {file.family_context && (
              <span
                className="gallery-tag gallery-tag-family"
                style={{ background: 'linear-gradient(135deg, #a855f7, #6366f1)', color: '#ffffff', fontWeight: 600 }}
                title={file.family_context?.suggested_caption || 'Family Kinship Context'}
              >
                {/* 🌳 */}
              </span>
            )}
            <ModuleStatusBadges media={file} variant="dots" />
          </div>
        </div>

        <div className="gallery-card-info">
          <div className="gallery-card-title" title={file.filename}>
            {file.filename}
          </div>

          {localizedDescription && (
            <div
              className="gallery-card-desc"
              title={localizedDescription}
            >
              {localizedDescription}
            </div>
          )}

          {file.face_names && file.face_names.length > 0 && (
            <div className="gallery-card-faces-row" title={`Recognized: ${file.face_names.join(', ')}`}>
              {file.face_names.slice(0, 2).map((name) => (
                <span key={name} className="gallery-face-chip">
                  👤 {name}
                </span>
              ))}
              {file.face_names.length > 2 && (
                <span className="gallery-face-chip-more">
                  +{file.face_names.length - 2} {t('cardMoreFaces')}
                </span>
              )}
            </div>
          )}
          <div className="gallery-card-meta">
            <span>{formatBytes(file.file_size)}</span>
            {file.folder && (
              <span className="gallery-card-folder" title={file.folder}>
                📁 {file.folder.split(/[/\\]/).pop()}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Render recursive Folder Tree node
  const renderTreeNode = (node: FolderTreeNode) => {
    const isExpanded = expandedFolders.has(node.fullPath) || expandedFolders.has(node.id);
    const isSelected = selectedFolder === node.fullPath;
    const hasChildren = node.children.length > 0;

    return (
      <div key={node.fullPath} className="folder-tree-item-wrap">
        <div
          className={`folder-tree-row ${isSelected ? 'active' : ''}`}
          style={{ paddingLeft: `${node.depth * 14 + 6}px` }}
          onClick={() => {
            const nextFolder = isSelected ? null : node.fullPath;
            if (nextFolder) {
              console.log(`[FolderTree] Selected folder "${node.name}" (${node.fullPath}, ${node.fileCount} file(s))`);
              errorInterceptor.emitLog(
                'INFO',
                'FolderTree',
                `Selected folder: "${node.name}" (${node.fileCount} items, path: ${node.fullPath})`
              );
            } else {
              console.log(`[FolderTree] Deselected folder "${node.name}"`);
              errorInterceptor.emitLog('INFO', 'FolderTree', `Cleared folder filter for "${node.name}"`);
            }
            setSelectedFolder(nextFolder);
          }}
        >
          {hasChildren ? (
            <button
              type="button"
              className="folder-tree-toggle-btn"
              onClick={(e) => {
                e.stopPropagation();
                toggleFolderExpand(node.fullPath);
              }}
              title={isExpanded ? 'Collapse' : 'Expand'}
            >
              {isExpanded ? '▼' : '▶'}
            </button>
          ) : (
            <span className="folder-tree-spacer" />
          )}

          <span className="folder-tree-icon">{isExpanded ? '📂' : '📁'}</span>
          <span className="folder-tree-name" title={node.fullPath}>
            {node.name}
          </span>
          <span className="folder-tree-badge" title={`${node.processedCount}/${node.fileCount} processed`}>
            {node.fileCount}
          </span>
        </div>

        {hasChildren && isExpanded && (
          <div className="folder-tree-children">
            {node.children.map((child) => renderTreeNode(child))}
          </div>
        )}
      </div>
    );
  };

  // 1. Gallery Grid View with Virtual Windowing
  const renderGalleryView = () => (
    <>
      <div
        className="gallery-grid"
        ref={gridRef}
        style={{
          '--gallery-item-min-width': '140px',
          paddingTop: galleryTopPadding > 0 ? `${galleryTopPadding}px` : undefined,
          paddingBottom: galleryBottomPadding > 0 ? `${galleryBottomPadding}px` : undefined,
        } as React.CSSProperties}
      >
        {virtualizedGalleryFiles.map((file) => renderCardItem(file))}
      </div>
      <div ref={sentinelRef} style={{ height: '6px', width: '100%' }} />
    </>
  );

  // 2. Tabular List View with Virtual Windowing
  const renderListView = () => (
    <div className="media-list-table-wrap">
      <table className="media-list-table">
        <thead>
          <tr>
            <th style={{ width: '44px' }}></th>
            <th onClick={() => handleSortToggle('name')} className="sortable-th">
              {t('colFilename')} {sortBy === 'name' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
            </th>
            <th style={{ width: '130px' }}>{t('colFolder')}</th>
            <th style={{ width: '80px' }}>{t('colType')}</th>
            <th onClick={() => handleSortToggle('size')} className="sortable-th" style={{ width: '90px' }}>
              {t('colSize')} {sortBy === 'size' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
            </th>
            <th onClick={() => handleSortToggle('date')} className="sortable-th" style={{ width: '130px' }}>
              {t('colDate')} {sortBy === 'date' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
            </th>
            <th onClick={() => handleSortToggle('status')} className="sortable-th" style={{ width: '110px' }}>
              {t('colStatus')} {sortBy === 'status' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
            </th>
            <th onClick={() => handleSortToggle('faces')} className="sortable-th" style={{ width: '140px' }}>
              {t('colFaces')} {sortBy === 'faces' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
            </th>
            <th style={{ width: '70px', textAlign: 'center' }}>{t('colActions')}</th>
          </tr>
        </thead>
        <tbody>
          {listTopPadding > 0 && <tr style={{ height: `${listTopPadding}px` }}><td colSpan={9} /></tr>}
          {virtualizedListFiles.map((file) => {
            const thumbUrl = `/api/media/thumbnail?path=${encodeURIComponent(file.file_path || file.filename)}&size=120`;
            const isVideoThumbActive = FlagsManager.IsActive('first-frame-thumbnail-generation');
            const shouldLoadThumb = file.is_image || isVideoThumbActive;
            const isProcessed = file.status === 'PROCESSED';
            const isPending = file.status === 'PENDING';

            return (
              <tr
                key={file.file_path || file.filename}
                className="media-list-row"
                onClick={() => setSelectedMedia(file)}
              >
                <td style={{ textAlign: 'center' }}>
                  <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    {shouldLoadThumb ? (
                      <>
                        <img
                          src={thumbUrl}
                          alt={file.filename}
                          className="media-list-thumb"
                          loading="lazy"
                          decoding="async"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                            const fallback = target.nextElementSibling as HTMLElement;
                            if (fallback) fallback.style.display = 'inline-block';
                          }}
                        />
                        <span style={{ display: 'none', fontSize: '1.2rem' }}>
                          {file.is_video ? '🎥' : '📷'}
                        </span>
                        {file.is_video && (
                          <span
                            style={{
                              position: 'absolute',
                              bottom: '2px',
                              right: '2px',
                              background: 'rgba(0, 0, 0, 0.75)',
                              color: '#ffffff',
                              fontSize: '0.62rem',
                              borderRadius: '3px',
                              padding: '1px 3px',
                              lineHeight: 1,
                              pointerEvents: 'none',
                            }}
                          >
                            ▶
                          </span>
                        )}
                      </>
                    ) : (
                      <span style={{ fontSize: '1.2rem' }}>🎥</span>
                    )}
                  </div>
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <div className="media-list-title" title={file.file_path || file.filename}>
                      {file.filename}
                    </div>
                    {Boolean(file.similar_files_count && file.similar_files_count > 1) && (
                      <span
                        className="gallery-tag gallery-tag-series"
                        style={{ fontSize: '0.66rem', padding: '1px 5px', borderRadius: '3px' }}
                        title={`${file.similar_files_count} ${t('similarPhotosInGroup' as any) || 'photos in series'}`}
                      >
                        🗂️ {file.similar_files_count}
                      </span>
                    )}
                  </div>
                  {Boolean(file.summary || file.summary_ru) && (
                    <div className="media-list-subdesc">
                      {language === 'ru' ? file.summary_ru || file.summary : file.summary || file.summary_ru}
                    </div>
                  )}
                </td>
                <td className="media-list-folder" title={file.folder}>
                  📁 {file.folder ? file.folder.split(/[/\\]/).pop() : '-'}
                </td>
                <td>
                  <span className="badge-pill" style={{ fontSize: '0.72rem', padding: '2px 6px' }}>
                    {file.is_video ? '🎥 Video' : '📷 Photo'}
                  </span>
                </td>
                <td style={{ color: 'var(--text-secondary)' }}>{formatBytes(file.file_size)}</td>
                <td style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>{formatDate(file.mtime)}</td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span
                      className={`badge-pill ${isProcessed
                          ? 'badge-pill-success'
                          : isPending
                            ? 'badge-pill-accent'
                            : 'badge-pill-secondary'
                        }`}
                      style={{ fontSize: '0.72rem', padding: '2px 6px' }}
                    >
                      {isProcessed ? '✓ Processed' : isPending ? '⏳ Pending' : '○ Unprocessed'}
                    </span>
                    <ModuleStatusBadges media={file} variant="dots" />
                  </div>
                </td>
                <td>
                  {file.face_names && file.face_names.length > 0 ? (
                    <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
                      {file.face_names.slice(0, 2).map((fn) => (
                        <span key={fn} className="gallery-face-chip" style={{ fontSize: '0.7rem' }}>
                          👤 {fn}
                        </span>
                      ))}
                      {file.face_names.length > 2 && (
                        <span className="gallery-face-chip-more" style={{ fontSize: '0.7rem' }}>
                          +{file.face_names.length - 2}
                        </span>
                      )}
                    </div>
                  ) : file.face_count && file.face_count > 0 ? (
                    <span style={{ color: '#ec4899', fontSize: '0.78rem' }}>👤 {file.face_count}</span>
                  ) : (
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>—</span>
                  )}
                </td>
                <td style={{ textAlign: 'center' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ padding: '2px 8px', fontSize: '0.75rem' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedMedia(file);
                    }}
                    title={t('clickToView')}
                  >
                    👁️
                  </button>
                </td>
              </tr>
            );
          })}
          {listBottomPadding > 0 && <tr style={{ height: `${listBottomPadding}px` }}><td colSpan={9} /></tr>}
        </tbody>
      </table>
      <div ref={sentinelRef} style={{ height: '6px', width: '100%' }} />
    </div>
  );

  // 3. Folder Tree View
  const renderFolderTreeView = () => (
    <div className="folder-tree-layout">
      {/* Tree Explorer Sidebar */}
      <div className="folder-tree-sidebar">
        <div className="folder-tree-sidebar-header">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>🗂️ {t('treeAllFolders')}</span>
            {selectedFolder && (
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '2px 6px', fontSize: '0.72rem' }}
                onClick={() => {
                  console.log('[FolderTree] Cleared folder filter via tree header button');
                  errorInterceptor.emitLog('INFO', 'FolderTree', 'Cleared folder filter');
                  setSelectedFolder(null);
                }}
                title={t('clearFolderFilter')}
              >
                ✕ {t('btnResetFilters')}
              </button>
            )}
          </div>
        </div>
        <div className="folder-tree-sidebar-body">
          {folderTree.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', padding: '0.5rem' }}>
              {t('treeNoFolders')}
            </p>
          ) : (
            folderTree.map((rootNode) => renderTreeNode(rootNode))
          )}
        </div>
      </div>

      {/* Folder Files Content */}
      <div className="folder-tree-content">
        {selectedFolder && (
          <div className="folder-tree-active-bar">
            <span>
              📁 <strong>{selectedFolder}</strong> ({filteredFiles.length} {t('badgeMediaFiles')})
            </span>
            <button
              type="button"
              className="search-clear-inline-btn"
              onClick={() => {
                console.log('[FolderTree] Cleared folder filter via active bar');
                errorInterceptor.emitLog('INFO', 'FolderTree', 'Cleared folder filter');
                setSelectedFolder(null);
              }}
              title={t('clearFolderFilter')}
            >
              ✕
            </button>
          </div>
        )}

        {filteredFiles.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
            <p style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>{t('noMediaFound')}</p>
            {selectedFolder ? (
              <p style={{ fontSize: '0.85rem' }}>
                {t('noMediaHintFiltered')}{' '}
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: '2px 8px', fontSize: '0.78rem', marginLeft: '0.5rem' }}
                  onClick={() => {
                    console.log('[FolderTree] Cleared folder filter via empty state button');
                    errorInterceptor.emitLog('INFO', 'FolderTree', 'Cleared folder filter from empty state');
                    setSelectedFolder(null);
                  }}
                >
                  {t('clearFolderFilter')}
                </button>
              </p>
            ) : (
              <p style={{ fontSize: '0.85rem' }}>{t('noMediaHintEmpty')}</p>
            )}
          </div>
        ) : (
          renderGalleryView()
        )}
      </div>
    </div>
  );

  // 4. Date / Timeline Grouped View
  const renderDateGroupedView = () => (
    <div className="grouped-sections-wrap">
      {/* Sub-view switcher between Calendar View and Timeline List */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '14px',
          flexWrap: 'wrap',
          gap: '8px',
        }}
      >
        <div className="filter-button-group view-switcher-group" style={{ margin: 0 }}>
          <button
            type="button"
            className={`filter-btn ${dateSubView === 'calendar' ? 'active' : ''}`}
            onClick={() => setDateSubView('calendar')}
            title={t('calendarViewSubtab')}
          >
            🗓️ {t('calendarViewSubtab')}
          </button>
          <button
            type="button"
            className={`filter-btn ${dateSubView === 'list' ? 'active' : ''}`}
            onClick={() => setDateSubView('list')}
            title={t('timelineListSubtab')}
          >
            📋 {t('timelineListSubtab')}
          </button>
        </div>
      </div>

      {dateSubView === 'calendar' ? (
        <TimelineCalendarView
          files={filteredFiles}
          onSelectMedia={setSelectedMedia}
        />
      ) : (
        dateGroups.map((group) => {
          const isCollapsed = collapsedDates.has(group.key);
          return (
            <div key={group.key} className="grouped-card-section">
              <div
                className="grouped-section-header"
                onClick={() => toggleDateCollapse(group.key)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span className="folder-tree-toggle-btn">{isCollapsed ? '▶' : '▼'}</span>
                  <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>📅 {group.label}</span>
                </div>
                <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                  <span className="badge-pill badge-pill-accent" style={{ fontSize: '0.75rem' }}>
                    {group.count} {t('badgeMediaFiles')}
                  </span>
                  <span className="badge-pill badge-pill-success" style={{ fontSize: '0.75rem' }}>
                    {group.processedCount} {t('badgeCataloged')}
                  </span>
                </div>
              </div>

              {!isCollapsed && (
                <div className="grouped-section-body">
                  <div
                    className="gallery-grid"
                    style={{
                      '--gallery-item-min-width': '140px',
                    } as React.CSSProperties}
                  >
                    {group.files.map((file: GalleryMediaFile) => renderCardItem(file))}
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );

  // 5. Person Grouped View
  const renderPersonGroupedView = () => (
    <div className="grouped-sections-wrap">
      {personGroups.map((group) => {
        const isCollapsed = collapsedPersons.has(group.personName);
        return (
          <div key={group.personName} className="grouped-card-section">
            <div
              className="grouped-section-header"
              onClick={() => togglePersonCollapse(group.personName)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <span className="folder-tree-toggle-btn">{isCollapsed ? '▶' : '▼'}</span>
                {group.avatarUrl ? (
                  <img
                    src={group.avatarUrl}
                    alt={group.personName}
                    style={{ width: '24px', height: '24px', borderRadius: '50%', objectFit: 'cover' }}
                  />
                ) : (
                  <span>👤</span>
                )}
                <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                  {group.personName}
                </span>
              </div>
              <span className="badge-pill badge-pill-accent" style={{ fontSize: '0.75rem' }}>
                {group.count} {t('badgeMediaFiles')}
              </span>
            </div>

            {!isCollapsed && (
              <div className="grouped-section-body">
                <div
                  className="gallery-grid"
                  style={{
                    '--gallery-item-min-width': '140px',
                  } as React.CSSProperties}
                >
                  {group.files.map((file: GalleryMediaFile) => renderCardItem(file))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="card media-gallery-card">
      <div className="gallery-header-row">
        <div className="gallery-title-wrap">
          <SearchBar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
          />
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', flexShrink: 0 }}>
          {/* Filter, Sort and Search Bar (dropdown representation on the same line when active) */}
          {isFilterBarDropdown && (
            <FilterSortSearchBar
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              typeFilter={typeFilter}
              onTypeFilterChange={setTypeFilter}
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
              faceFilter={faceFilter}
              onFaceFilterChange={setFaceFilter}
              selectedPerson={selectedPerson}
              onPersonChange={setSelectedPerson}
              distinctPeople={distinctPeople}
              sortBy={sortBy}
              onSortByChange={setSortBy}
              sortOrder={sortOrder}
              onToggleSortOrder={() => setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
              selectedFolder={selectedFolder}
              onClearFolder={() => setSelectedFolder(null)}
              hasActiveFilters={hasActiveFilters}
              onResetFilters={handleClearFilters}
              asDropdown={true}
            />
          )}

          {/* View Switcher Button Group */}
          <ViewSwitcherButtonGroup
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            isSimilarityGrouped={isSimilarityGrouped}
            onToggleSimilarityGrouped={() => setIsSimilarityGrouped((prev) => !prev)}
          />

          {/* Face Registry UI (dropdown representation on the same line) */}
          <FaceRegistryUI
            personsCount={persons.length}
            onOpenFaceRegistry={onSwitchToControls}
            asDropdown={isFaceRegistryDropdown}
          />


          {(showSwitchToControls && onSwitchToControls && !isFaceRegistryDropdown) && (
            <button
              className="btn btn-secondary"
              style={{ padding: '0.35rem 0.75rem', fontSize: '0.82rem' }}
              onClick={onSwitchToControls}
              type="button"
              title={t('btnControlsSwitch')}
            >
              ⚙️ {t('btnControlsSwitch')}
            </button>
          )}
        </div>
      </div>

      {/* Filter, Sort and Search Bar (expanded row representation when dropdown flag is inactive) */}
      {!isFilterBarDropdown && (
        <FilterSortSearchBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          typeFilter={typeFilter}
          onTypeFilterChange={setTypeFilter}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          faceFilter={faceFilter}
          onFaceFilterChange={setFaceFilter}
          selectedPerson={selectedPerson}
          onPersonChange={setSelectedPerson}
          distinctPeople={distinctPeople}
          sortBy={sortBy}
          onSortByChange={setSortBy}
          sortOrder={sortOrder}
          onToggleSortOrder={() => setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
          selectedFolder={selectedFolder}
          onClearFolder={() => setSelectedFolder(null)}
          hasActiveFilters={hasActiveFilters}
          onResetFilters={handleClearFilters}
          asDropdown={false}
        />
      )}

      {/* Main Content Area based on View Mode */}
      <div
        className="gallery-grid-container"
        ref={containerRef}
        onScroll={handleContainerScroll}
      >
        {isLoading && mediaFiles.length === 0 ? (
          <div className="gallery-loading-overlay">
            <div className="gallery-spinner-ring-wrap">
              <div className="gallery-spinner-ring" />
              <span className="gallery-spinner-inner-icon">📁</span>
            </div>
            <h3 style={{ margin: '0 0 0.4rem 0', fontSize: '1.15rem', color: 'var(--text-primary)' }}>
              {t('scanningSources')}
            </h3>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)', maxWidth: '440px' }}>
              {language === 'ru'
                ? 'Индексирование и загрузка медиафайлов из настроенных папок источников...'
                : 'Indexing and loading media files from configured input sources...'}
            </p>

            {/* Currently loaded file / input folder under spinner */}
            {(currentLoadingFile || currentLoadingFilename || (activeInputFolders && activeInputFolders.length > 0)) && (
              <div className="gallery-spinner-current-file-badge">
                <span className="gallery-spinner-current-file-label">
                  {currentLoadingFile || currentLoadingFilename
                    ? (language === 'ru' ? 'Обработка:' : 'Processing:')
                    : (language === 'ru' ? 'Папка источника:' : 'Input folder:')}
                </span>
                <span
                  className="gallery-spinner-current-file-name"
                  title={currentLoadingFile || activeInputFolders?.join(', ')}
                >
                  {currentLoadingFilename || (currentLoadingFile ? currentLoadingFile.split(/[/\\]/).pop() : `📁 ${activeInputFolders?.[0]}`)}
                </span>
              </div>
            )}

            {Boolean(scannedFilesCount && scannedFilesCount > 0) && (
              <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                <span className="spinner-icon">⚡</span>
                <span>
                  {language === 'ru'
                    ? `Найдено файлов: ${scannedFilesCount.toLocaleString()}`
                    : `Discovered files: ${scannedFilesCount.toLocaleString()}`}
                </span>
              </div>
            )}
          </div>
        ) : filteredFiles.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-secondary)' }}>
            <p style={{ fontSize: '1.1rem', margin: '0 0 0.5rem 0' }}>{t('noMediaFound')}</p>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              {searchQuery || typeFilter !== 'all' || statusFilter !== 'all' || selectedFolder
                ? t('noMediaHintFiltered')
                : t('noMediaHintEmpty')}
            </p>
          </div>
        ) : (
          <>
            {viewMode === 'gallery' && renderGalleryView()}
            {viewMode === 'list' && renderListView()}
            {viewMode === 'folder_tree' && renderFolderTreeView()}
            {viewMode === 'date_grouped' && renderDateGroupedView()}
            {viewMode === 'person_grouped' && renderPersonGroupedView()}

            {/* Pagination & Infinite Row Status Footer */}
            {filteredFiles.length > 0 && (
              <div
                className="gallery-pagination-footer"
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.75rem 0.5rem 0.25rem 0.5rem',
                  fontSize: '0.82rem',
                  color: 'var(--text-secondary)',
                  borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                  marginTop: '0.75rem',
                }}
              >
                <span>
                  {t('showingFilesCount')}: <strong>{Math.min(visibleFiles.length, filteredFiles.length)}</strong> / {totalCount} {t('badgeMediaFiles')}
                  {videoCount > 0 && ` • 🎥 ${videoCount} ${t('badgeVideos')}`}
                  {' '}({Math.min(loadedRows, Math.ceil(filteredFiles.length / effectiveCols))} / {Math.ceil(filteredFiles.length / effectiveCols)} rows)
                </span>

                {hasMore ? (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ padding: '0.3rem 0.8rem', fontSize: '0.78rem' }}
                    onClick={loadMoreRows}
                    title={t('loadNextChunkBtn')}
                  >
                    ⬇️ {t('loadNextChunkBtn')} (+{batchRows})
                  </button>
                ) : (
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                    ✓ {t('allLoaded')}
                  </span>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Lightbox / Media Viewer Modal */}
      <MediaViewerModal
        isOpen={Boolean(selectedMedia)}
        mediaFile={selectedMedia}
        seriesGroupFiles={currentSeriesGroupFiles}
        onClose={() => setSelectedMedia(null)}
        currentIndex={currentIndex}
        totalFiles={filteredFiles.length}
        onPrev={handlePrev}
        onNext={handleNext}
        hasPrev={currentIndex > 0}
        hasNext={currentIndex >= 0 && currentIndex < filteredFiles.length - 1}
        onRefresh={onRefresh}
        onReloadFaces={onReloadFaces}
        onStartSingleAnalysis={onStartSingleAnalysis}
        onViewInFamilyTree={onViewInFamilyTree}
        persons={persons}
        knownPersonOptions={knownPersonOptions}
        disabled={disabled}
        isEngineConnected={isEngineConnected}
        onMediaUpdated={(updated) => {
          setSelectedMedia(updated);
          mediaCacheService.upsert(updated);
          if (onRefresh) onRefresh();
        }}
      />
    </div>
  );
}
