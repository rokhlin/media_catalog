import { useState, useEffect, useCallback, useRef } from 'react';
import { useLanguage } from '../../i18n/LanguageContext';
import './LibraryOrganizationPanel.css';

export interface LibraryOrganizationPanelProps {
  onRefreshMedia?: () => void;
}

export type ContentCategory =
  | 'documents'
  | 'social'
  | 'nature'
  | 'animals'
  | 'screenshots'
  | 'non_family';

export interface OrganizationCriteria {
  groupByYear?: boolean;
  groupByMonth?: boolean;
  eventName?: string;
  contentTypes?: ContentCategory[];
  folderTemplate?: string;
  filenameTemplate?: string;
  writeTagsToFile?: boolean;
  assignTags?: boolean;
  targetBaseFolder?: string;
  resetPrevious?: boolean;
}

export interface OrganizationJobStatus {
  id: string;
  status: 'idle' | 'analyzing' | 'ready_for_review' | 'applying' | 'completed' | 'cancelled' | 'error';
  mode: 'automatic' | 'semi_automatic';
  criteria: OrganizationCriteria;
  total_files: number;
  processed_files: number;
  percent: number;
  current_file?: string;
  message?: string;
  error?: string;
  created_at: string;
  updated_at: string;
}

export interface OrganizationItem {
  id: number;
  job_id: string;
  media_id?: string | null;
  original_path: string;
  original_folder?: string | null;
  original_filename: string;
  target_folder?: string | null;
  target_filename?: string | null;
  target_path?: string | null;
  detected_year?: number | null;
  detected_month?: number | null;
  detected_content_type?: string | null;
  assigned_tags: string[];
  status: 'pending' | 'approved' | 'applied' | 'skipped' | 'rolled_back' | 'error';
  applied_at?: string | null;
  error?: string | null;
}

export default function LibraryOrganizationPanel({ onRefreshMedia }: LibraryOrganizationPanelProps) {
  const { t } = useLanguage();

  // Criteria State
  const [groupByYear, setGroupByYear] = useState<boolean>(true);
  const [groupByMonth, setGroupByMonth] = useState<boolean>(true);
  const [eventName, setEventName] = useState<string>('');
  const [contentTypes, setContentTypes] = useState<ContentCategory[]>([
    'documents',
    'social',
    'nature',
    'animals',
    'screenshots',
  ]);
  const [folderTemplate, setFolderTemplate] = useState<string>('{year}/{month_name}');
  const [filenameTemplate, setFilenameTemplate] = useState<string>('{original}');
  const [writeTagsToFile, setWriteTagsToFile] = useState<boolean>(false);
  const [mode, setMode] = useState<'semi_automatic' | 'automatic'>('semi_automatic');
  const [resetPrevious, setResetPrevious] = useState<boolean>(false);

  // Job and Execution State
  const [jobStatus, setJobStatus] = useState<OrganizationJobStatus | null>(null);
  const [items, setItems] = useState<OrganizationItem[]>([]);
  const [totalItems, setTotalItems] = useState<number>(0);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [loading, setLoading] = useState<boolean>(false);
  const [actionMessage, setActionMessage] = useState<string>('');

  // Editing items state
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [editFolder, setEditFolder] = useState<string>('');
  const [editFilename, setEditFilename] = useState<string>('');
  const [editTags, setEditTags] = useState<string>('');

  const pollingRef = useRef<any>(null);

  // Fetch Current Job Status
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/organize/status');
      if (res.ok) {
        const data: OrganizationJobStatus = await res.json();
        setJobStatus(data);
        return data;
      }
    } catch {
      // ignore
    }
    return null;
  }, []);

  // Fetch Items
  const fetchItems = useCallback(async (jobId: string, statusFilter = 'all') => {
    if (!jobId) return;
    try {
      const query = new URLSearchParams({
        jobId,
        limit: '150',
        offset: '0',
      });
      if (statusFilter !== 'all') {
        query.set('status', statusFilter);
      }
      const res = await fetch(`/api/organize/items?${query.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
        setTotalItems(data.total || 0);
      }
    } catch {
      // ignore
    }
  }, []);

  // Poll status periodically when job is active
  useEffect(() => {
    fetchStatus().then((job) => {
      if (job && job.id) {
        fetchItems(job.id, filterStatus);
      }
    });

    const checkPolling = async () => {
      const job = await fetchStatus();
      if (job && (job.status === 'analyzing' || job.status === 'applying')) {
        if (!pollingRef.current) {
          pollingRef.current = setInterval(async () => {
            const updated = await fetchStatus();
            if (updated && updated.id) {
              if (updated.status !== 'analyzing' && updated.status !== 'applying') {
                clearInterval(pollingRef.current);
                pollingRef.current = null;
                fetchItems(updated.id, filterStatus);
                if (onRefreshMedia) onRefreshMedia();
              }
            }
          }, 1500);
        }
      } else {
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      }
    };

    checkPolling();

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [fetchStatus, fetchItems, filterStatus, onRefreshMedia]);

  const handleToggleContentType = (cat: ContentCategory) => {
    setContentTypes((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    );
  };

  const handleStartJob = async () => {
    setLoading(true);
    setActionMessage('');
    try {
      const res = await fetch('/api/organize/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          criteria: {
            groupByYear,
            groupByMonth,
            eventName,
            contentTypes,
            folderTemplate,
            filenameTemplate,
            writeTagsToFile,
            resetPrevious,
          },
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to start organization');
      }

      const job: OrganizationJobStatus = await res.json();
      setJobStatus(job);
      setActionMessage('Organization job started in background.');

      // Start polling
      if (!pollingRef.current) {
        pollingRef.current = setInterval(async () => {
          const updated = await fetchStatus();
          if (updated && updated.id) {
            if (updated.status !== 'analyzing' && updated.status !== 'applying') {
              clearInterval(pollingRef.current);
              pollingRef.current = null;
              fetchItems(updated.id, filterStatus);
              if (onRefreshMedia) onRefreshMedia();
            }
          }
        }, 1500);
      }
    } catch (err: any) {
      setActionMessage(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelJob = async () => {
    if (!jobStatus?.id) return;
    try {
      const res = await fetch('/api/organize/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: jobStatus.id }),
      });
      if (res.ok) {
        const updated = await res.json();
        setJobStatus(updated);
        setActionMessage('Organization process cancelled.');
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      }
    } catch (err: any) {
      setActionMessage(`Cancel error: ${err.message}`);
    }
  };

  const handleApplyPlan = async () => {
    if (!jobStatus?.id) return;
    setLoading(true);
    setActionMessage('');
    try {
      const res = await fetch('/api/organize/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: jobStatus.id }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to apply plan');
      }
      const updated = await res.json();
      setJobStatus(updated);
      setActionMessage('Applying organization changes in background...');

      // Poll apply progress
      if (!pollingRef.current) {
        pollingRef.current = setInterval(async () => {
          const u = await fetchStatus();
          if (u && u.id && u.status !== 'applying') {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
            fetchItems(u.id, filterStatus);
            if (onRefreshMedia) onRefreshMedia();
          }
        }, 1500);
      }
    } catch (err: any) {
      setActionMessage(`Apply error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRollback = async () => {
    if (!jobStatus?.id) return;
    if (!window.confirm('Are you sure you want to rollback applied file moves and restore original locations?')) {
      return;
    }
    setLoading(true);
    setActionMessage('');
    try {
      const res = await fetch('/api/organize/rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: jobStatus.id }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Rollback failed');
      }
      const data = await res.json();
      setActionMessage(`Rollback finished: restored ${data.rolledBack} file(s).`);
      await fetchStatus();
      if (jobStatus.id) {
        fetchItems(jobStatus.id, filterStatus);
      }
      if (onRefreshMedia) onRefreshMedia();
    } catch (err: any) {
      setActionMessage(`Rollback error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const startEditItem = (item: OrganizationItem) => {
    setEditingItemId(item.id);
    setEditFolder(item.target_folder || '');
    setEditFilename(item.target_filename || item.original_filename);
    setEditTags((item.assigned_tags || []).join(', '));
  };

  const saveEditItem = async (id: number) => {
    try {
      const tagsArray = editTags
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await fetch(`/api/organize/items/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_folder: editFolder,
          target_filename: editFilename,
          assigned_tags: tagsArray,
        }),
      });

      if (res.ok) {
        const updated = await res.json();
        setItems((prev) => prev.map((item) => (item.id === id ? updated : item)));
        setEditingItemId(null);
      }
    } catch {
      // ignore
    }
  };

  const isBusy = jobStatus?.status === 'analyzing' || jobStatus?.status === 'applying';
  const hasAppliedItems = items.some((i) => i.status === 'applied');

  return (
    <div className="lib-org-panel">
      {/* Criteria & Configuration Card */}
      <div className="lib-org-card">
        <div className="lib-org-card-header">
          <h3 className="lib-org-card-title">
            <span>⚙️</span>
            {t('organizeCriteriaTitle' as any) || 'Organization Criteria & Rules'}
          </h3>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted, #94a3b8)' }}>
            {t('sectionLibraryOrganize' as any) || 'Media Library Organization'}
          </span>
        </div>

        <div className="lib-org-criteria-grid">
          {/* Time & Event Criteria */}
          <div className="lib-org-field">
            <span className="lib-org-label">📅 Год и месяц</span>
            <div className="lib-org-checkbox-group">
              <label className="lib-org-checkbox-label">
                <input
                  type="checkbox"
                  checked={groupByYear}
                  onChange={(e) => setGroupByYear(e.target.checked)}
                  disabled={isBusy}
                />
                {t('organizeGroupByYear' as any) || 'Split by Year (e.g. 2024)'}
              </label>
              <label className="lib-org-checkbox-label">
                <input
                  type="checkbox"
                  checked={groupByMonth}
                  onChange={(e) => setGroupByMonth(e.target.checked)}
                  disabled={isBusy}
                />
                {t('organizeGroupByMonth' as any) || 'Split by Month (e.g. 05 - May)'}
              </label>
            </div>
          </div>

          {/* Common Event */}
          <div className="lib-org-field">
            <label className="lib-org-label" htmlFor="org-event-name">
              🎉 {t('organizeEventNameLabel' as any) || 'Common Event Name'}
            </label>
            <input
              id="org-event-name"
              className="lib-org-input"
              type="text"
              placeholder={t('organizeEventNamePlaceholder' as any) || 'e.g. Vacation in Sochi, Birthday...'}
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
              disabled={isBusy}
            />
          </div>

          {/* Execution Mode */}
          <div className="lib-org-field">
            <span className="lib-org-label">🚀 {t('organizeModeLabel' as any) || 'Execution Mode'}</span>
            <div className="lib-org-checkbox-group">
              <label className="lib-org-checkbox-label">
                <input
                  type="radio"
                  name="org-mode"
                  value="semi_automatic"
                  checked={mode === 'semi_automatic'}
                  onChange={() => setMode('semi_automatic')}
                  disabled={isBusy}
                />
                {t('organizeModeSemiAuto' as any) || 'Semi-automatic (Review plan before apply)'}
              </label>
              <label className="lib-org-checkbox-label">
                <input
                  type="radio"
                  name="org-mode"
                  value="automatic"
                  checked={mode === 'automatic'}
                  onChange={() => setMode('automatic')}
                  disabled={isBusy}
                />
                {t('organizeModeAuto' as any) || 'Automatic (Apply immediately)'}
              </label>
            </div>
          </div>

          {/* Folder & Filename Templates */}
          <div className="lib-org-field">
            <label className="lib-org-label" htmlFor="org-folder-template">
              📁 {t('organizeFolderTemplateLabel' as any) || 'Folder Structure Template'}
            </label>
            <input
              id="org-folder-template"
              className="lib-org-input"
              type="text"
              value={folderTemplate}
              onChange={(e) => setFolderTemplate(e.target.value)}
              disabled={isBusy}
              placeholder="{year}/{month_name}/{event}"
            />
          </div>

          <div className="lib-org-field">
            <label className="lib-org-label" htmlFor="org-filename-template">
              🏷️ {t('organizeFilenameTemplateLabel' as any) || 'File Renaming Template'}
            </label>
            <input
              id="org-filename-template"
              className="lib-org-input"
              type="text"
              value={filenameTemplate}
              onChange={(e) => setFilenameTemplate(e.target.value)}
              disabled={isBusy}
              placeholder="{original}"
            />
          </div>
        </div>

        {/* Content Type Checkboxes */}
        <div className="lib-org-field">
          <span className="lib-org-label">
            🔍 {t('organizeContentTypesLabel' as any) || 'Content Type Classification'}
          </span>
          <div className="lib-org-checkbox-group">
            <label className="lib-org-checkbox-label">
              <input
                type="checkbox"
                checked={contentTypes.includes('documents')}
                onChange={() => handleToggleContentType('documents')}
                disabled={isBusy}
              />
              📄 {t('organizeContentTypeDocs' as any) || 'Documents & Scans'}
            </label>
            <label className="lib-org-checkbox-label">
              <input
                type="checkbox"
                checked={contentTypes.includes('social')}
                onChange={() => handleToggleContentType('social')}
                disabled={isBusy}
              />
              💬 {t('organizeContentTypeSocial' as any) || 'Social & Messengers'}
            </label>
            <label className="lib-org-checkbox-label">
              <input
                type="checkbox"
                checked={contentTypes.includes('nature')}
                onChange={() => handleToggleContentType('nature')}
                disabled={isBusy}
              />
              🌲 {t('organizeContentTypeNature' as any) || 'Nature & Landscapes'}
            </label>
            <label className="lib-org-checkbox-label">
              <input
                type="checkbox"
                checked={contentTypes.includes('animals')}
                onChange={() => handleToggleContentType('animals')}
                disabled={isBusy}
              />
              🐾 {t('organizeContentTypeAnimals' as any) || 'Animals & Pets'}
            </label>
            <label className="lib-org-checkbox-label">
              <input
                type="checkbox"
                checked={contentTypes.includes('screenshots')}
                onChange={() => handleToggleContentType('screenshots')}
                disabled={isBusy}
              />
              📱 {t('organizeContentTypeScreenshots' as any) || 'Screenshots'}
            </label>
            <label className="lib-org-checkbox-label">
              <input
                type="checkbox"
                checked={contentTypes.includes('non_family')}
                onChange={() => handleToggleContentType('non_family')}
                disabled={isBusy}
              />
              🗃️ {t('organizeContentTypeNonFamily' as any) || 'Non-family / Other'}
            </label>
          </div>
        </div>

        {/* Toggles: EXIF write & Reset previous */}
        <div className="lib-org-checkbox-group" style={{ marginTop: '0.5rem' }}>
          <label className="lib-org-checkbox-label">
            <input
              type="checkbox"
              checked={writeTagsToFile}
              onChange={(e) => setWriteTagsToFile(e.target.checked)}
              disabled={isBusy}
            />
            ✍️ {t('organizeWriteTagsToFile' as any) || 'Write tags directly into media file metadata (EXIF/IPTC)'}
          </label>
          <label className="lib-org-checkbox-label">
            <input
              type="checkbox"
              checked={resetPrevious}
              onChange={(e) => setResetPrevious(e.target.checked)}
              disabled={isBusy}
            />
            🔄 {t('organizeResetPrevious' as any) || 'Reset previous results and start fresh'}
          </label>
        </div>

        {/* Actions Toolbar */}
        <div className="lib-org-actions">
          <button
            type="button"
            className="lib-org-btn lib-org-btn-primary"
            onClick={handleStartJob}
            disabled={isBusy || loading}
          >
            ▶️ {t('btnStartOrganize' as any) || 'Start Organization'}
          </button>

          {isBusy && (
            <button
              type="button"
              className="lib-org-btn lib-org-btn-danger"
              onClick={handleCancelJob}
            >
              ⏹️ {t('btnCancelOrganize' as any) || 'Cancel Process'}
            </button>
          )}

          {jobStatus?.status === 'ready_for_review' && (
            <button
              type="button"
              className="lib-org-btn lib-org-btn-success"
              onClick={handleApplyPlan}
              disabled={loading}
            >
              ✅ {t('btnApplyPlan' as any) || 'Confirm & Apply Plan'}
            </button>
          )}

          {(hasAppliedItems || jobStatus?.status === 'completed') && (
            <button
              type="button"
              className="lib-org-btn lib-org-btn-secondary"
              onClick={handleRollback}
              disabled={isBusy || loading}
            >
              ↩️ {t('btnRollbackPlan' as any) || 'Rollback Applied Changes'}
            </button>
          )}

          <button
            type="button"
            className="lib-org-btn lib-org-btn-secondary"
            onClick={() => {
              fetchStatus();
              if (jobStatus?.id) fetchItems(jobStatus.id, filterStatus);
            }}
          >
            🔄 Refresh
          </button>
        </div>

        {actionMessage && (
          <div style={{ fontSize: '0.88rem', color: '#38bdf8', marginTop: '0.25rem' }}>
            ℹ️ {actionMessage}
          </div>
        )}
      </div>

      {/* Progress & Live Status Card */}
      {jobStatus && jobStatus.status !== 'idle' && (
        <div className="lib-org-status-card">
          <div className="lib-org-status-header">
            <span className={`lib-org-badge ${jobStatus.status}`}>
              ● {jobStatus.status.replace('_', ' ')}
            </span>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
              {jobStatus.percent}% ({jobStatus.processed_files} / {jobStatus.total_files})
            </span>
          </div>

          <div className="lib-org-progress-bar-wrap">
            <div
              className="lib-org-progress-bar-fill"
              style={{ width: `${jobStatus.percent}%` }}
            />
          </div>

          <div className="lib-org-status-details">
            <span>{jobStatus.message || 'Processing media library...'}</span>
            {jobStatus.current_file && (
              <span style={{ fontStyle: 'italic' }}>
                Current: {jobStatus.current_file}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Plan Items Review Table */}
      {items.length > 0 && (
        <div className="lib-org-card">
          <div className="lib-org-card-header">
            <h4 className="lib-org-card-title">
              <span>📋</span>
              {t('organizeCriteriaTitle' as any) || 'Planned Organization Changes'} ({totalItems} files)
            </h4>

            {/* Status Filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted, #94a3b8)' }}>Filter:</span>
              <select
                className="lib-org-select"
                value={filterStatus}
                onChange={(e) => {
                  setFilterStatus(e.target.value);
                  if (jobStatus?.id) fetchItems(jobStatus.id, e.target.value);
                }}
              >
                <option value="all">All</option>
                <option value="pending">Pending</option>
                <option value="applied">Applied</option>
                <option value="rolled_back">Rolled Back</option>
                <option value="error">Error</option>
              </select>
            </div>
          </div>

          <div className="lib-org-table-wrap">
            <table className="lib-org-table">
              <thead>
                <tr>
                  <th>{t('organizeTableOriginal' as any) || 'Original Location'}</th>
                  <th>{t('organizeTableTargetFolder' as any) || 'Target Folder'}</th>
                  <th>{t('organizeTableTargetFilename' as any) || 'Target Filename'}</th>
                  <th>{t('organizeTableContentType' as any) || 'Content Type'}</th>
                  <th>{t('organizeTableTags' as any) || 'Assigned Tags'}</th>
                  <th>{t('organizeTableStatus' as any) || 'Status'}</th>
                  <th>{t('organizeTableActions' as any) || 'Actions'}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const isEditing = editingItemId === item.id;
                  return (
                    <tr key={item.id}>
                      <td className="lib-org-cell-path">
                        <div className="lib-org-cell-orig-name">{item.original_filename}</div>
                        <div className="lib-org-cell-orig-sub">{item.original_folder || pathBasename(item.original_path)}</div>
                      </td>

                      <td>
                        {isEditing ? (
                          <input
                            className="lib-org-table-input"
                            value={editFolder}
                            onChange={(e) => setEditFolder(e.target.value)}
                          />
                        ) : (
                          <span>{item.target_folder || '—'}</span>
                        )}
                      </td>

                      <td>
                        {isEditing ? (
                          <input
                            className="lib-org-table-input"
                            value={editFilename}
                            onChange={(e) => setEditFilename(e.target.value)}
                          />
                        ) : (
                          <span>{item.target_filename || item.original_filename}</span>
                        )}
                      </td>

                      <td>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          {item.detected_content_type || 'other'}
                        </span>
                      </td>

                      <td>
                        {isEditing ? (
                          <input
                            className="lib-org-table-input"
                            value={editTags}
                            onChange={(e) => setEditTags(e.target.value)}
                            placeholder="Comma-separated tags"
                          />
                        ) : (
                          <div>
                            {(item.assigned_tags || []).map((tg, idx) => (
                              <span key={idx} className="lib-org-tag-pill">
                                {tg}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>

                      <td>
                        <span
                          style={{
                            padding: '0.2rem 0.5rem',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            background:
                              item.status === 'applied'
                                ? 'rgba(34, 197, 94, 0.2)'
                                : item.status === 'error'
                                ? 'rgba(239, 68, 68, 0.2)'
                                : item.status === 'rolled_back'
                                ? 'rgba(245, 158, 11, 0.2)'
                                : 'rgba(148, 163, 184, 0.2)',
                            color:
                              item.status === 'applied'
                                ? '#4ade80'
                                : item.status === 'error'
                                ? '#f87171'
                                : item.status === 'rolled_back'
                                ? '#fbbf24'
                                : 'var(--text-secondary)',
                          }}
                        >
                          {item.status}
                        </span>
                      </td>

                      <td>
                        {isEditing ? (
                          <div style={{ display: 'flex', gap: '0.25rem' }}>
                            <button
                              type="button"
                              className="lib-org-btn lib-org-btn-success"
                              style={{ padding: '0.3rem 0.6rem', fontSize: '0.78rem' }}
                              onClick={() => saveEditItem(item.id)}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              className="lib-org-btn lib-org-btn-secondary"
                              style={{ padding: '0.3rem 0.6rem', fontSize: '0.78rem' }}
                              onClick={() => setEditingItemId(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="lib-org-btn lib-org-btn-secondary"
                            style={{ padding: '0.3rem 0.6rem', fontSize: '0.78rem' }}
                            onClick={() => startEditItem(item)}
                            disabled={isBusy}
                          >
                            ✏️ Edit
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function pathBasename(p: string): string {
  if (!p) return '';
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1] || '';
}
