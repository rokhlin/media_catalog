import { useState, useEffect, useCallback, useMemo } from 'react';
import type {
  DuplicateGroup,
  DuplicateItemInfo,
  DuplicateSummary,
  DuplicateScanStatus,
  DuplicateConfig,
} from '../../models/media';
import { useLanguage } from '../../i18n/LanguageContext';
import { useAuth } from '../../services/authContext';
import { mediaCacheService } from '../../services/mediaCacheService';
import LibraryOrganizationPanel from './LibraryOrganizationPanel';
import DuplicateDetectionRules from './DuplicateDetectionRules';
import './DuplicatesManagerTab.css';

export interface DuplicatesManagerTabProps {
  onRefreshMedia?: () => void;
  activeInputFolders?: string[];
  onOpenViewer?: (filePath: string) => void;
}

export default function DuplicatesManagerTab({
  onRefreshMedia,
  activeInputFolders = [],
  onOpenViewer,
}: DuplicatesManagerTabProps) {
  const { t } = useLanguage();
  const { authFetch } = useAuth();

  // Data state
  const [summary, setSummary] = useState<DuplicateSummary | null>(null);
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [scanStatus, setScanStatus] = useState<DuplicateScanStatus | null>(null);
  const [, setConfig] = useState<DuplicateConfig | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const GROUPS_PER_PAGE = 25;

  // Scan settings state
  const [selectedEngine, setSelectedEngine] = useState<'auto' | 'cpu' | 'gpu'>('auto');
  const [selectedMode, setSelectedMode] = useState<'all' | 'exact' | 'visual' | 'burst'>('all');
  const [similarityThreshold, setSimilarityThreshold] = useState<number>(0.85);
  const [burstWindowSec, setBurstWindowSec] = useState<number>(3.0);
  const [selectedFolderScope, setSelectedFolderScope] = useState<string>('all');
  const [forceRehash, setForceRehash] = useState(false);

  // Selection state for batch actions (File paths selected for cleanup)
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());

  // Modal states
  const [comparatorGroup, setComparatorGroup] = useState<{
    primary: DuplicateItemInfo;
    duplicate: DuplicateItemInfo;
  } | null>(null);

  const [previewItem, setPreviewItem] = useState<{
    item: DuplicateItemInfo;
    isPrimary?: boolean;
    primaryFile?: DuplicateItemInfo;
  } | null>(null);

  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [targetMoveFolder, setTargetMoveFolder] = useState('');
  const [isActionPending, setIsActionPending] = useState(false);

  // Accordion sections state
  const [isOrganizeOpen, setIsOrganizeOpen] = useState(true);
  const [isDuplicatesOpen, setIsDuplicatesOpen] = useState(true);

  // Fetch groups & summary
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [resGroups, resSum, resConfig] = await Promise.all([
        fetch('/api/duplicates/groups'),
        fetch('/api/duplicates/summary'),
        fetch('/api/duplicates/config'),
      ]);

      if (resGroups.ok) {
        const data = await resGroups.json();
        setGroups(data);
        setCurrentPage(1);
      }
      if (resSum.ok) {
        const data = await resSum.json();
        setSummary(data);
      }
      if (resConfig.ok) {
        const data = await resConfig.json();
        setConfig(data);
        if (data.default_engine) setSelectedEngine(data.default_engine);
        if (data.similarity_threshold) setSimilarityThreshold(data.similarity_threshold);
        if (data.burst_window_seconds) setBurstWindowSec(data.burst_window_seconds);
        if (data.target_move_folder) setTargetMoveFolder(data.target_move_folder);
      }
    } catch (err) {
      console.error('Error loading duplicates data:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Poll scan status
  useEffect(() => {
    let timer: any;
    const checkStatus = async () => {
      try {
        const res = await fetch('/api/duplicates/scan-status');
        if (res.ok) {
          const st: DuplicateScanStatus = await res.json();
          setScanStatus(st);
          if (st.isScanning) {
            timer = setTimeout(checkStatus, 1000);
          } else if (scanStatus?.isScanning) {
            // Just finished scanning -> refresh groups
            loadData();
          }
        }
      } catch {
        // ignore polling errors
      }
    };

    checkStatus();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [loadData, scanStatus?.isScanning]);

  // Keyboard listener for Escape to close modals
  useEffect(() => {
    if (!previewItem && !comparatorGroup && !isDeleteConfirmOpen && !isMoveModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPreviewItem(null);
        setComparatorGroup(null);
        setIsDeleteConfirmOpen(false);
        setIsMoveModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewItem, comparatorGroup, isDeleteConfirmOpen, isMoveModalOpen]);

  // Trigger scan
  const handleStartScan = async () => {
    try {
      const folders = selectedFolderScope !== 'all' ? [selectedFolderScope] : undefined;
      const res = await authFetch('/api/duplicates/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          engine: selectedEngine,
          mode: selectedMode,
          similarity_threshold: similarityThreshold,
          burst_window_seconds: burstWindowSec,
          folders,
          force_rehash: forceRehash,
        }),
      });

      if (res.ok) {
        const st = await res.json();
        setScanStatus(st);
      } else {
        const err = await res.json();
        alert(`Error: ${err.message || 'Failed to start duplicate scan'}`);
      }
    } catch (err: any) {
      alert(`Network error: ${err.message}`);
    }
  };

  // Stop scan
  const handleStopScan = async () => {
    try {
      await authFetch('/api/duplicates/stop-scan', { method: 'POST' });
    } catch (err) {
      console.error('Failed to stop scan:', err);
    }
  };

  // Toggle individual file selection
  const handleToggleSelectFile = (filePath: string) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) {
        next.delete(filePath);
      } else {
        next.add(filePath);
      }
      return next;
    });
  };

  // Smart Selection: Select All Non-Primary Duplicates
  const handleSelectAllDuplicates = () => {
    const allDups = new Set<string>();
    groups.forEach((g) => {
      g.duplicates.forEach((d) => {
        allDups.add(d.filePath);
      });
    });
    setSelectedFiles(allDups);
  };

  const handleDeselectAll = () => {
    setSelectedFiles(new Set());
  };

  // Execute Deletion
  const handleConfirmDelete = async () => {
    if (selectedFiles.size === 0) return;
    setIsActionPending(true);

    try {
      const res = await authFetch('/api/duplicates/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: Array.from(selectedFiles) }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.deletedFiles && Array.isArray(data.deletedFiles)) {
          await mediaCacheService.removeFiles(data.deletedFiles);
        }
        alert(t('duplicatesDeleteSuccess' as any) || `Successfully deleted ${data.deletedCount} duplicate file(s).`);
        setSelectedFiles(new Set());
        setIsDeleteConfirmOpen(false);
        await loadData();
        onRefreshMedia?.();
      } else {
        const err = await res.json();
        alert(`Deletion error: ${err.message || 'Failed to delete files'}`);
      }
    } catch (err: any) {
      alert(`Network error: ${err.message}`);
    } finally {
      setIsActionPending(false);
    }
  };

  // Execute Move
  const handleConfirmMove = async () => {
    if (selectedFiles.size === 0 || !targetMoveFolder.trim()) return;
    setIsActionPending(true);

    try {
      const res = await authFetch('/api/duplicates/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: Array.from(selectedFiles),
          destination_folder: targetMoveFolder.trim(),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.movedFiles && Array.isArray(data.movedFiles)) {
          const originalPaths = data.movedFiles.map((m: any) => m.original);
          await mediaCacheService.removeFiles(originalPaths);
        }
        alert(t('duplicatesMoveSuccess' as any) || `Successfully moved ${data.movedCount} duplicate file(s).`);
        setSelectedFiles(new Set());
        setIsMoveModalOpen(false);
        await loadData();
        onRefreshMedia?.();
      } else {
        const err = await res.json();
        alert(`Move error: ${err.message || 'Failed to move files'}`);
      }
    } catch (err: any) {
      alert(`Network error: ${err.message}`);
    } finally {
      setIsActionPending(false);
    }
  };

  // Compute selected bytes
  const selectedBytesTotal = useMemo(() => {
    let total = 0;
    groups.forEach((g) => {
      g.duplicates.forEach((d) => {
        if (selectedFiles.has(d.filePath)) {
          total += d.fileSize;
        }
      });
      if (selectedFiles.has(g.primaryFile.filePath)) {
        total += g.primaryFile.fileSize;
      }
    });
    return total;
  }, [groups, selectedFiles]);

  const totalPages = Math.max(1, Math.ceil(groups.length / GROUPS_PER_PAGE));
  const paginatedGroups = useMemo(() => {
    const start = (currentPage - 1) * GROUPS_PER_PAGE;
    return groups.slice(start, start + GROUPS_PER_PAGE);
  }, [groups, currentPage]);

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const isScanning = Boolean(scanStatus?.isScanning);

  return (
    <div className="duplicates-manager-container">
      {/* Collapsible Section 1: Media Library Organization */}
      <div className="organize-accordion-section">
        <div
          className="organize-accordion-header"
          onClick={() => setIsOrganizeOpen((prev) => !prev)}
        >
          <div className="organize-accordion-title">
            <span className={`organize-accordion-toggle-icon ${isOrganizeOpen ? 'expanded' : ''}`}>
              ▶
            </span>
            <span>📚</span>
            <span>{t('sectionLibraryOrganize' as any) || 'Организация медиатеки'}</span>
          </div>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted, #94a3b8)' }}>
            {isOrganizeOpen ? 'Свернуть' : 'Развернуть'}
          </span>
        </div>

        {isOrganizeOpen && (
          <div className="organize-accordion-content">
            <LibraryOrganizationPanel onRefreshMedia={onRefreshMedia} />
          </div>
        )}
      </div>

      {/* Collapsible Section 2: Duplicates & Cleanup */}
      <div className="organize-accordion-section">
        <div
          className="organize-accordion-header"
          onClick={() => setIsDuplicatesOpen((prev) => !prev)}
        >
          <div className="organize-accordion-title">
            <span className={`organize-accordion-toggle-icon ${isDuplicatesOpen ? 'expanded' : ''}`}>
              ▶
            </span>
            <span>🗂️</span>
            <span>{t('sectionDuplicatesManager' as any) || 'Поиск и управление дубликатами'}</span>
          </div>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted, #94a3b8)' }}>
            {isDuplicatesOpen ? 'Свернуть' : 'Развернуть'}
          </span>
        </div>

        {isDuplicatesOpen && (
          <div className="organize-accordion-content">
            {/* Metric Summary Cards */}
      <div className="dup-metrics-grid">
        <div className="dup-metric-card">
          <span className="dup-metric-icon" aria-hidden="true">🗂️</span>
          <div className="dup-metric-info">
            <span className="dup-metric-value">{summary?.totalGroups || groups.length}</span>
            <span className="dup-metric-label">{t('duplicateGroups' as any) || 'Duplicate Groups'}</span>
          </div>
        </div>

        <div className="dup-metric-card">
          <span className="dup-metric-icon" aria-hidden="true">📑</span>
          <div className="dup-metric-info">
            <span className="dup-metric-value">{summary?.totalDuplicateFiles || 0}</span>
            <span className="dup-metric-label">{t('duplicateCopies' as any) || 'Duplicate Copies'}</span>
          </div>
        </div>

        <div className="dup-metric-card">
          <span className="dup-metric-icon" aria-hidden="true">💾</span>
          <div className="dup-metric-info">
            <span className="dup-metric-value" style={{ color: '#10b981' }}>
              {formatBytes(summary?.totalReclaimableBytes || 0)}
            </span>
            <span className="dup-metric-label">{t('reclaimableSpace' as any) || 'Reclaimable Space'}</span>
          </div>
        </div>

        <div className="dup-metric-card">
          <span className="dup-metric-icon" aria-hidden="true">⚡</span>
          <div className="dup-metric-info">
            <span className="dup-metric-value" style={{ fontSize: '1.1rem' }}>
              {summary?.engineUsed === 'gpu' ? 'GPU (RTX 4080)' : 'CPU (Low-Memory Safe)'}
            </span>
            <span className="dup-metric-label">{t('duplicateEngine' as any) || 'Engine Mode'}</span>
          </div>
        </div>
      </div>

      {/* Control Panel: Detection Rules & Thresholds */}
      <DuplicateDetectionRules
        activeInputFolders={activeInputFolders}
        selectedEngine={selectedEngine}
        setSelectedEngine={setSelectedEngine}
        selectedMode={selectedMode}
        setSelectedMode={setSelectedMode}
        similarityThreshold={similarityThreshold}
        setSimilarityThreshold={setSimilarityThreshold}
        burstWindowSec={burstWindowSec}
        setBurstWindowSec={setBurstWindowSec}
        selectedFolderScope={selectedFolderScope}
        setSelectedFolderScope={setSelectedFolderScope}
        forceRehash={forceRehash}
        setForceRehash={setForceRehash}
        isScanning={Boolean(scanStatus?.isScanning)}
        scanStatus={scanStatus}
        onStartScan={handleStartScan}
        onStopScan={handleStopScan}
      />

      {/* Smart Selection & Action Bar */}
      {groups.length > 0 && (
        <div className="dup-actions-bar">
          <div className="dup-selection-tools">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleSelectAllDuplicates}
              style={{ fontSize: '0.85rem' }}
            >
              ✨ {t('selectAllDuplicates' as any) || 'Select All Duplicates'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleDeselectAll}
              style={{ fontSize: '0.85rem' }}
              disabled={selectedFiles.size === 0}
            >
              ❌ {t('deselectAll' as any) || 'Deselect All'}
            </button>

            {selectedFiles.size > 0 && (
              <span style={{ fontSize: '0.9rem', color: '#a5b4fc', fontWeight: 600, marginLeft: '0.5rem' }}>
                {t('selectedSummary' as any) || `Selected ${selectedFiles.size} duplicate(s) (${formatBytes(selectedBytesTotal)})`}
              </span>
            )}
          </div>

          <div className="dup-action-buttons">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setIsMoveModalOpen(true)}
              disabled={selectedFiles.size === 0}
            >
              📦 {t('btnMoveDuplicates' as any) || 'Move Selected...'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setIsDeleteConfirmOpen(true)}
              disabled={selectedFiles.size === 0}
              style={{
                background: selectedFiles.size > 0 ? 'rgba(239, 68, 68, 0.15)' : undefined,
                borderColor: selectedFiles.size > 0 ? '#ef4444' : undefined,
                color: selectedFiles.size > 0 ? '#ef4444' : undefined,
              }}
            >
              🗑️ {t('btnDeleteDuplicates' as any) || 'Delete Selected'}
            </button>
          </div>
        </div>
      )}

      {/* Duplicate Groups List */}
      <div className="dup-groups-list">
        {groups.length === 0 && !isLoading && !isScanning ? (
          <div
            style={{
              padding: '3rem',
              textAlign: 'center',
              background: 'rgba(0, 0, 0, 0.2)',
              borderRadius: '16px',
              border: '1px dashed rgba(255, 255, 255, 0.15)',
              color: '#94a3b8',
            }}
          >
            <span style={{ fontSize: '3rem', display: 'block', marginBottom: '1rem' }}>🎉</span>
            <h3 style={{ color: '#fff', margin: '0 0 0.5rem' }}>
              {t('noDuplicatesFound' as any) || 'No duplicate files detected'}
            </h3>
            <p style={{ margin: 0 }}>
              {t('noDuplicatesHint' as any) || 'Run a duplicate scan above to inspect exact matches, visual similarities, and burst shots across your media libraries.'}
            </p>
          </div>
        ) : (
          paginatedGroups.map((group) => {
            const badgeClass =
              group.matchType === 'exact'
                ? 'dup-badge-exact'
                : group.matchType === 'visual'
                ? 'dup-badge-visual'
                : 'dup-badge-burst';

            const badgeLabel =
              group.matchType === 'exact'
                ? 'Exact Match (100%)'
                : group.matchType === 'visual'
                ? `Visual (${Math.round(group.similarity * 100)}%)`
                : 'Burst Series';

            return (
              <div key={group.id} className="dup-group-card">
                <div className="dup-group-header">
                  <div className="dup-group-badges">
                    <span className={`dup-badge ${badgeClass}`}>{badgeLabel}</span>
                    <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
                      {group.totalFiles} items ({formatBytes(group.reclaimableBytes)} reclaimable)
                    </span>
                  </div>

                  {group.duplicates.length > 0 && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem' }}
                      onClick={() =>
                        setComparatorGroup({
                          primary: group.primaryFile,
                          duplicate: group.duplicates[0],
                        })
                      }
                    >
                      ⚖️ {t('btnCompare' as any) || 'Compare Side-by-Side'}
                    </button>
                  )}
                </div>

                <div className="dup-group-items-grid">
                  {/* Primary Item */}
                  <div
                    className={`dup-item-card is-primary ${selectedFiles.has(group.primaryFile.filePath) ? 'is-selected' : ''}`}
                    onClick={() => handleToggleSelectFile(group.primaryFile.filePath)}
                  >
                    <div className="dup-item-preview-wrap">
                      <input
                        type="checkbox"
                        className="dup-item-checkbox"
                        checked={selectedFiles.has(group.primaryFile.filePath)}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => handleToggleSelectFile(group.primaryFile.filePath)}
                      />
                      <span className="dup-item-primary-tag">
                        🌟 {t('keepPrimary' as any) || 'KEEP'}
                      </span>
                      {group.primaryFile.isVideo && (
                        <span className="dup-item-video-tag" title="Video file">
                          🎥
                        </span>
                      )}
                      <img
                        className="dup-item-img"
                        src={`/api/media/thumbnail?path=${encodeURIComponent(group.primaryFile.filePath)}&size=300`}
                        alt={group.primaryFile.filename}
                        loading="lazy"
                      />
                      <button
                        type="button"
                        className="dup-item-zoom-btn"
                        title={t('previewImage' as any) || 'Full Preview'}
                        onClick={(e) => {
                          e.stopPropagation();
                          setPreviewItem({ item: group.primaryFile, isPrimary: true });
                        }}
                      >
                        🔍
                      </button>
                    </div>

                    <div className="dup-item-details">
                      <div className="dup-item-filename" title={group.primaryFile.filename}>
                        {group.primaryFile.filename}
                      </div>
                      <div className="dup-item-meta-row">
                        <span>Resolution</span>
                        <strong>
                          {group.primaryFile.width && group.primaryFile.height
                            ? `${group.primaryFile.width}x${group.primaryFile.height} (${group.primaryFile.megapixels} MP)`
                            : 'Unknown'}
                        </strong>
                      </div>
                      <div className="dup-item-meta-row">
                        <span>Size</span>
                        <strong>{formatBytes(group.primaryFile.fileSize)}</strong>
                      </div>
                      <div className="dup-item-meta-row">
                        <span>Folder</span>
                        <strong title={group.primaryFile.folder}>{group.primaryFile.folder.split(/[/\\]/).pop()}</strong>
                      </div>
                    </div>
                  </div>

                  {/* Duplicate Items */}
                  {group.duplicates.map((dup) => {
                    const isSelected = selectedFiles.has(dup.filePath);
                    return (
                      <div
                        key={dup.filePath}
                        className={`dup-item-card ${isSelected ? 'is-selected' : ''}`}
                        onClick={() => handleToggleSelectFile(dup.filePath)}
                      >
                        <div className="dup-item-preview-wrap">
                          <input
                            type="checkbox"
                            className="dup-item-checkbox"
                            checked={isSelected}
                            onClick={(e) => e.stopPropagation()}
                            onChange={() => handleToggleSelectFile(dup.filePath)}
                          />
                          {dup.isVideo && (
                            <span className="dup-item-video-tag" title="Video file">
                              🎥
                            </span>
                          )}
                          <img
                            className="dup-item-img"
                            src={`/api/media/thumbnail?path=${encodeURIComponent(dup.filePath)}&size=300`}
                            alt={dup.filename}
                            loading="lazy"
                          />
                          <button
                            type="button"
                            className="dup-item-zoom-btn"
                            title={t('previewImage' as any) || 'Full Preview'}
                            onClick={(e) => {
                              e.stopPropagation();
                              setPreviewItem({
                                item: dup,
                                isPrimary: false,
                                primaryFile: group.primaryFile,
                              });
                            }}
                          >
                            🔍
                          </button>
                        </div>

                        <div className="dup-item-details">
                          <div className="dup-item-filename" title={dup.filename}>
                            {dup.filename}
                          </div>
                          <div className="dup-item-meta-row">
                            <span>Resolution</span>
                            <strong>
                              {dup.width && dup.height
                                ? `${dup.width}x${dup.height} (${dup.megapixels} MP)`
                                : 'Unknown'}
                            </strong>
                          </div>
                          <div className="dup-item-meta-row">
                            <span>Size</span>
                            <strong>{formatBytes(dup.fileSize)}</strong>
                          </div>
                          <div className="dup-item-meta-row">
                            <span>Similarity</span>
                            <strong style={{ color: '#c084fc' }}>
                              {dup.similarityToPrimary ? `${Math.round(dup.similarityToPrimary * 100)}%` : 'Duplicate'}
                            </strong>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '1rem',
            margin: '1.5rem 0',
            padding: '0.75rem',
            background: 'rgba(255, 255, 255, 0.03)',
            borderRadius: '12px',
            border: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            style={{ fontSize: '0.85rem' }}
          >
            ◀ {t('btnPrevPage' as any) || 'Previous'}
          </button>
          <span style={{ fontSize: '0.9rem', color: '#94a3b8', fontWeight: 500 }}>
            Page {currentPage} of {totalPages} ({groups.length} {t('duplicateGroups' as any) || 'groups'})
          </span>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            style={{ fontSize: '0.85rem' }}
          >
            {t('btnNextPage' as any) || 'Next'} ▶
          </button>
        </div>
      )}
          </div>
        )}
      </div>

      {/* Single Item Full Preview Lightbox Modal */}
      {previewItem && (
        <div className="dup-comparator-modal" onClick={() => setPreviewItem(null)}>
          <div
            className="dup-comparator-container"
            style={{ maxWidth: '850px', width: '92vw', maxHeight: '90vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dup-comparator-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
                <span style={{ fontSize: '1.2rem' }}>🖼️</span>
                <div style={{ minWidth: 0 }}>
                  <h3 style={{ margin: 0, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {previewItem.item.filename}
                  </h3>
                  <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                    {previewItem.isPrimary ? '🌟 Recommended Primary File' : 'Duplicate Candidate'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="btn-icon"
                onClick={() => setPreviewItem(null)}
                title="Close (Esc)"
              >
                ✕
              </button>
            </div>

            <div className="dup-preview-modal-body">
              <div className="dup-preview-img-wrap">
                {previewItem.item.isVideo ? (
                  <video
                    className="dup-preview-modal-video"
                    src={`/api/media/file?path=${encodeURIComponent(previewItem.item.filePath)}`}
                    poster={`/api/media/thumbnail?path=${encodeURIComponent(previewItem.item.filePath)}&size=1080`}
                    controls
                    autoPlay
                    playsInline
                    preload="metadata"
                  />
                ) : (
                  <img
                    className="dup-preview-modal-img"
                    src={
                      /\.(heic|heif)$/i.test(previewItem.item.filePath)
                        ? `/api/media/thumbnail?path=${encodeURIComponent(previewItem.item.filePath)}&size=1920`
                        : `/api/media/file?path=${encodeURIComponent(previewItem.item.filePath)}`
                    }
                    alt={previewItem.item.filename}
                  />
                )}
              </div>

              <div className="dup-preview-meta-panel">
                <table className="dup-comparator-meta-table">
                  <tbody>
                    <tr>
                      <td>Resolution</td>
                      <td>
                        {previewItem.item.width && previewItem.item.height
                          ? `${previewItem.item.width}x${previewItem.item.height} (${previewItem.item.megapixels} MP)`
                          : 'Unknown'}
                      </td>
                    </tr>
                    <tr>
                      <td>File Size</td>
                      <td>{formatBytes(previewItem.item.fileSize)}</td>
                    </tr>
                    <tr>
                      <td>Folder</td>
                      <td>{previewItem.item.folder}</td>
                    </tr>
                    {previewItem.item.similarityToPrimary !== undefined && (
                      <tr>
                        <td>Similarity</td>
                        <td style={{ color: '#c084fc' }}>
                          {Math.round(previewItem.item.similarityToPrimary * 100)}%
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>

                <div className="dup-preview-modal-actions">
                  <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className={`btn ${selectedFiles.has(previewItem.item.filePath) ? 'btn-danger' : 'btn-secondary'}`}
                      onClick={() => handleToggleSelectFile(previewItem.item.filePath)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        background: selectedFiles.has(previewItem.item.filePath) ? '#ef4444' : undefined,
                        borderColor: selectedFiles.has(previewItem.item.filePath) ? '#ef4444' : undefined,
                        color: '#fff',
                      }}
                    >
                      {selectedFiles.has(previewItem.item.filePath) ? '☑️ Marked for Deletion' : '☐ Mark for Deletion'}
                    </button>

                    {!previewItem.isPrimary && previewItem.primaryFile && (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => {
                          const prim = previewItem.primaryFile!;
                          const dup = previewItem.item;
                          setPreviewItem(null);
                          setComparatorGroup({ primary: prim, duplicate: dup });
                        }}
                      >
                        ⚖️ Compare Side-by-Side
                      </button>
                    )}
                  </div>

                  {onOpenViewer && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => {
                        onOpenViewer(previewItem.item.filePath);
                        setPreviewItem(null);
                      }}
                      title="View file in Media Gallery"
                    >
                      ↗️ Open in Gallery
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Side-by-Side Visual Comparator Modal */}
      {comparatorGroup && (
        <div className="dup-comparator-modal" onClick={() => setComparatorGroup(null)}>
          <div className="dup-comparator-container" onClick={(e) => e.stopPropagation()}>
            <div className="dup-comparator-header">
              <h3 style={{ margin: 0, color: '#fff' }}>
                ⚖️ {t('visualComparator' as any) || 'Side-by-Side Duplicate Comparator'}
              </h3>
              <button
                type="button"
                className="btn-icon"
                onClick={() => setComparatorGroup(null)}
              >
                ✕
              </button>
            </div>

            <div className="dup-comparator-body">
              {/* Primary Item Pane */}
              <div className="dup-comparator-pane">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="dup-badge dup-badge-exact">🌟 Recommended Primary (Keep)</span>
                  <span style={{ fontWeight: 600, color: '#fff' }}>{comparatorGroup.primary.filename}</span>
                </div>
                {comparatorGroup.primary.isVideo ? (
                  <video
                    className="dup-comparator-preview"
                    src={`/api/media/file?path=${encodeURIComponent(comparatorGroup.primary.filePath)}`}
                    poster={`/api/media/thumbnail?path=${encodeURIComponent(comparatorGroup.primary.filePath)}&size=720`}
                    controls
                    playsInline
                    preload="metadata"
                  />
                ) : (
                  <img
                    className="dup-comparator-preview"
                    src={
                      /\.(heic|heif)$/i.test(comparatorGroup.primary.filePath)
                        ? `/api/media/thumbnail?path=${encodeURIComponent(comparatorGroup.primary.filePath)}&size=1080`
                        : `/api/media/file?path=${encodeURIComponent(comparatorGroup.primary.filePath)}`
                    }
                    alt="Primary"
                  />
                )}
                <table className="dup-comparator-meta-table">
                  <tbody>
                    <tr>
                      <td>Resolution</td>
                      <td>{comparatorGroup.primary.width}x{comparatorGroup.primary.height} ({comparatorGroup.primary.megapixels} MP)</td>
                    </tr>
                    <tr>
                      <td>File Size</td>
                      <td>{formatBytes(comparatorGroup.primary.fileSize)}</td>
                    </tr>
                    <tr>
                      <td>Folder</td>
                      <td>{comparatorGroup.primary.folder}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Duplicate Item Pane */}
              <div className="dup-comparator-pane">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="dup-badge dup-badge-burst">Duplicate Candidate</span>
                  <span style={{ fontWeight: 600, color: '#fff' }}>{comparatorGroup.duplicate.filename}</span>
                </div>
                {comparatorGroup.duplicate.isVideo ? (
                  <video
                    className="dup-comparator-preview"
                    src={`/api/media/file?path=${encodeURIComponent(comparatorGroup.duplicate.filePath)}`}
                    poster={`/api/media/thumbnail?path=${encodeURIComponent(comparatorGroup.duplicate.filePath)}&size=720`}
                    controls
                    playsInline
                    preload="metadata"
                  />
                ) : (
                  <img
                    className="dup-comparator-preview"
                    src={
                      /\.(heic|heif)$/i.test(comparatorGroup.duplicate.filePath)
                        ? `/api/media/thumbnail?path=${encodeURIComponent(comparatorGroup.duplicate.filePath)}&size=1080`
                        : `/api/media/file?path=${encodeURIComponent(comparatorGroup.duplicate.filePath)}`
                    }
                    alt="Duplicate"
                  />
                )}
                <table className="dup-comparator-meta-table">
                  <tbody>
                    <tr>
                      <td>Resolution</td>
                      <td>{comparatorGroup.duplicate.width}x{comparatorGroup.duplicate.height} ({comparatorGroup.duplicate.megapixels} MP)</td>
                    </tr>
                    <tr>
                      <td>File Size</td>
                      <td>{formatBytes(comparatorGroup.duplicate.fileSize)}</td>
                    </tr>
                    <tr>
                      <td>Folder</td>
                      <td>{comparatorGroup.duplicate.folder}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteConfirmOpen && (
        <div className="dup-comparator-modal" onClick={() => setIsDeleteConfirmOpen(false)}>
          <div
            className="dup-comparator-container"
            style={{ maxWidth: '540px', margin: 'auto', height: 'auto', padding: '1.75rem', gap: '1.25rem' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: 0, color: '#ef4444', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span>⚠️</span>
              <span>{t('confirmDeletionTitle' as any) || 'Confirm Duplicate Deletion'}</span>
            </h3>

            <p style={{ margin: 0, color: '#cbd5e1', lineHeight: 1.5 }}>
              {t('confirmDeletionPrompt' as any) || `You are about to permanently delete ${selectedFiles.size} duplicate file(s), freeing ${formatBytes(selectedBytesTotal)} of storage space. This action cannot be undone.`}
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setIsDeleteConfirmOpen(false)}
                disabled={isActionPending}
              >
                {t('btnCancel' as any) || 'Cancel'}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                style={{ background: '#ef4444', borderColor: '#ef4444' }}
                onClick={handleConfirmDelete}
                disabled={isActionPending}
              >
                {isActionPending ? 'Deleting...' : (t('btnConfirmDelete' as any) || 'Delete Files Permanently')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Move Confirmation Modal */}
      {isMoveModalOpen && (
        <div className="dup-comparator-modal" onClick={() => setIsMoveModalOpen(false)}>
          <div
            className="dup-comparator-container"
            style={{ maxWidth: '540px', margin: 'auto', height: 'auto', padding: '1.75rem', gap: '1.25rem' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: 0, color: '#fff', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span>📦</span>
              <span>{t('moveDuplicatesTitle' as any) || 'Move Duplicates to Archive'}</span>
            </h3>

            <p style={{ margin: 0, color: '#cbd5e1', lineHeight: 1.5 }}>
              {t('moveDuplicatesPrompt' as any) || `Select target destination directory to archive ${selectedFiles.size} duplicate file(s).`}
            </p>

            <div className="dup-form-group">
              <label>{t('destinationFolder' as any) || 'Destination Folder'}</label>
              <input
                type="text"
                className="dup-form-input"
                placeholder="e.g. Z:\duplicates_archive"
                value={targetMoveFolder}
                onChange={(e) => setTargetMoveFolder(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setIsMoveModalOpen(false)}
                disabled={isActionPending}
              >
                {t('btnCancel' as any) || 'Cancel'}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleConfirmMove}
                disabled={isActionPending || !targetMoveFolder.trim()}
              >
                {isActionPending ? 'Moving...' : (t('btnConfirmMove' as any) || 'Move Files')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
