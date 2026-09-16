import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../services/authContext';
import { useLanguage } from '../../i18n/LanguageContext';

export interface BackupItem {
  filename: string;
  filePath: string;
  sizeBytes: number;
  createdAt: string;
  trigger: 'manual' | 'scheduled';
  description?: string;
  stats?: {
    personsCount: number;
    facesCount: number;
    mediaItemsCount: number;
    syncHistoryCount: number;
    kinshipMembersCount: number;
    kinshipRelationshipsCount: number;
    featureFlagsCount: number;
  };
  isValid: boolean;
  errorMessage?: string;
}

export interface BackupConfig {
  backupPath: string;
  cron: string;
  retentionCount: number;
  enabled: boolean;
  nextRunDate: string | null;
}

export default function AdminBackupTab() {
  const { authFetch } = useAuth();
  const { t } = useLanguage();

  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [config, setConfig] = useState<BackupConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Creating state
  const [isCreating, setIsCreating] = useState(false);
  const [createNote, setCreateNote] = useState('');

  // Schedule drawer state
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [scheduleEnabled, setScheduleEnabled] = useState(true);
  const [cronPreset, setCronPreset] = useState('0 2 * * *');
  const [customCron, setCustomCron] = useState('');
  const [retentionCount, setRetentionCount] = useState(10);
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  // Restore modal state
  const [restoreTarget, setRestoreTarget] = useState<BackupItem | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [createSafetyBackup, setCreateSafetyBackup] = useState(true);
  const [restoreConfig, setRestoreConfig] = useState(true);
  const [restoreFlags, setRestoreFlags] = useState(true);
  const [restoreDatabase, setRestoreDatabase] = useState(true);
  const [restoreKinship, setRestoreKinship] = useState(true);

  // File upload input ref
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Format bytes helper
  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Format date helper
  const formatDate = (isoStr: string) => {
    if (!isoStr) return '—';
    try {
      const d = new Date(isoStr);
      return d.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return isoStr;
    }
  };

  const fetchBackupsAndConfig = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [bRes, cRes] = await Promise.all([
        authFetch('/api/backup'),
        authFetch('/api/backup/config'),
      ]);

      if (bRes.ok) {
        const bData = await bRes.json();
        setBackups(bData);
      } else {
        setError('Failed to load backup list');
      }

      if (cRes.ok) {
        const cData: BackupConfig = await cRes.json();
        setConfig(cData);
        setScheduleEnabled(cData.enabled);
        setRetentionCount(cData.retentionCount || 10);
        const knownPresets = ['0 2 * * *', '0 0,12 * * *', '0 3 * * 0'];
        if (knownPresets.includes(cData.cron)) {
          setCronPreset(cData.cron);
          setCustomCron('');
        } else {
          setCronPreset('custom');
          setCustomCron(cData.cron);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Error communicating with server');
    } finally {
      setIsLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    fetchBackupsAndConfig();
  }, [fetchBackupsAndConfig]);

  // Create on-demand backup
  const handleCreateBackup = async () => {
    setIsCreating(true);
    setActionMessage(null);
    try {
      const res = await authFetch('/api/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: createNote.trim() || undefined }),
      });

      if (res.ok) {
        const created = await res.json();
        setActionMessage({
          type: 'success',
          message: `Backup created successfully: ${created.filename} (${formatBytes(created.sizeBytes)})`,
        });
        setCreateNote('');
        fetchBackupsAndConfig();
      } else {
        const err = await res.json().catch(() => ({}));
        setActionMessage({
          type: 'error',
          message: err.message || 'Failed to create backup',
        });
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', message: err.message || 'Network error' });
    } finally {
      setIsCreating(false);
    }
  };

  // Save schedule configuration
  const handleSaveSchedule = async () => {
    setIsSavingConfig(true);
    setActionMessage(null);
    const effectiveCron = cronPreset === 'custom' ? customCron.trim() : cronPreset;

    try {
      const res = await authFetch('/api/backup/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: scheduleEnabled,
          cron: effectiveCron,
          retentionCount: Number(retentionCount),
        }),
      });

      if (res.ok) {
        const updated = await res.json();
        setConfig(updated);
        setActionMessage({
          type: 'success',
          message: 'Backup schedule and retention settings saved successfully!',
        });
        setIsScheduleOpen(false);
      } else {
        const err = await res.json().catch(() => ({}));
        setActionMessage({
          type: 'error',
          message: err.message || 'Failed to update backup configuration',
        });
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', message: err.message || 'Network error' });
    } finally {
      setIsSavingConfig(false);
    }
  };

  // Download backup archive
  const handleDownloadBackup = async (filename: string) => {
    try {
      const res = await authFetch(`/api/backup/${encodeURIComponent(filename)}/download`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || errData.error || `Download failed with status ${res.status}`);
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      setActionMessage({ type: 'error', message: `Download error: ${err.message}` });
    }
  };

  // Upload backup file
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setActionMessage(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const token = localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token');
      const res = await fetch('/api/backup/upload', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        setActionMessage({
          type: 'success',
          message: `Backup imported successfully: ${data.filename}`,
        });
        fetchBackupsAndConfig();
      } else {
        const err = await res.json().catch(() => ({}));
        setActionMessage({
          type: 'error',
          message: err.message || 'Failed to upload backup',
        });
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', message: err.message || 'Network error' });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Delete backup
  const handleDeleteBackup = async (filename: string) => {
    const confirmed = window.confirm(
      t('backupConfirmDelete' as any) ||
        `Are you sure you want to permanently delete backup "${filename}"?`
    );
    if (!confirmed) return;

    try {
      const res = await authFetch(`/api/backup/${encodeURIComponent(filename)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setActionMessage({
          type: 'success',
          message: `Deleted backup: ${filename}`,
        });
        setBackups((prev) => prev.filter((b) => b.filename !== filename));
      } else {
        const err = await res.json().catch(() => ({}));
        setActionMessage({
          type: 'error',
          message: err.message || 'Failed to delete backup',
        });
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', message: err.message || 'Network error' });
    }
  };

  // Restore backup
  const handleExecuteRestore = async () => {
    if (!restoreTarget) return;

    setIsRestoring(true);
    setActionMessage(null);

    try {
      const res = await authFetch(
        `/api/backup/${encodeURIComponent(restoreTarget.filename)}/restore`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            createSafetyBackup,
            restoreConfig,
            restoreFlags,
            restoreDatabase,
            restoreKinship,
          }),
        }
      );

      if (res.ok) {
        const result = await res.json();
        setActionMessage({
          type: 'success',
          message: `${result.message}. ${
            result.safetyBackupFilename
              ? `(Safety snapshot saved as: ${result.safetyBackupFilename})`
              : ''
          }`,
        });
        setRestoreTarget(null);
        fetchBackupsAndConfig();
      } else {
        const err = await res.json().catch(() => ({}));
        setActionMessage({
          type: 'error',
          message: err.message || 'System restore failed',
        });
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', message: err.message || 'Network error' });
    } finally {
      setIsRestoring(false);
    }
  };

  // Stats calculations
  const totalSizeBytes = backups.reduce((acc, b) => acc + (b.sizeBytes || 0), 0);
  const latestBackupDate = backups.length > 0 ? backups[0].createdAt : null;

  return (
    <div className="admin-backups-container" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Top Section / Header */}
      <div
        className="admin-card"
        style={{
          padding: '1.5rem',
          borderRadius: '14px',
          background: 'var(--card-bg, rgba(30, 41, 59, 0.7))',
          border: '1px solid var(--border-color, rgba(255, 255, 255, 0.1))',
          backdropFilter: 'blur(12px)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>💾</span>
              <span>{t('backupSectionTitle' as any) || 'System Backups & Archives'}</span>
            </h3>
            <p style={{ margin: '0.35rem 0 0 0', color: 'var(--text-muted, #94a3b8)', fontSize: '0.88rem' }}>
              {t('backupSectionSubtitle' as any) ||
                'Create and restore comprehensive system snapshots including SQLite databases, kinship data, face registry, feature flags, and configuration.'}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setIsScheduleOpen((prev) => !prev)}
              id="btn-admin-backup-toggle-schedule"
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.88rem' }}
            >
              <span>⚙️</span>
              <span>{t('backupScheduleTitle' as any) || 'Schedule & Settings'}</span>
              <span>{isScheduleOpen ? '▲' : '▼'}</span>
            </button>

            <input
              type="file"
              ref={fileInputRef}
              accept=".zip"
              style={{ display: 'none' }}
              onChange={handleFileUpload}
            />

            <button
              type="button"
              className="btn btn-secondary"
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
              id="btn-admin-backup-upload"
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.88rem' }}
            >
              <span>📤</span>
              <span>{isUploading ? t('backupBtnUploading' as any) || 'Uploading...' : t('backupBtnUpload' as any) || 'Upload Backup'}</span>
            </button>

            <button
              type="button"
              className="btn btn-secondary"
              onClick={fetchBackupsAndConfig}
              disabled={isLoading}
              id="btn-admin-backup-refresh"
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.88rem' }}
            >
              <span>🔄</span>
              <span>{t('backupBtnRefresh' as any) || 'Refresh'}</span>
            </button>

            <button
              type="button"
              className="btn btn-primary"
              onClick={handleCreateBackup}
              disabled={isCreating}
              id="btn-admin-backup-create"
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.88rem', fontWeight: 600 }}
            >
              <span>⚡</span>
              <span>{isCreating ? t('backupBtnCreating' as any) || 'Creating...' : t('backupBtnCreateNow' as any) || 'Create Backup Now'}</span>
            </button>
          </div>
        </div>

        {/* Action Status Banner */}
        {actionMessage && (
          <div
            className={`settings-alert-banner ${actionMessage.type}`}
            style={{
              marginTop: '1.2rem',
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              background: actionMessage.type === 'success' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              border: `1px solid ${actionMessage.type === 'success' ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
              color: actionMessage.type === 'success' ? '#4ade80' : '#f87171',
            }}
          >
            <span>{actionMessage.type === 'success' ? '✅' : '❌'}</span>
            <span>{actionMessage.message}</span>
          </div>
        )}

        {/* Quick Stats Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem',
            marginTop: '1.5rem',
          }}
        >
          <div
            style={{
              padding: '1rem',
              borderRadius: '10px',
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
            }}
          >
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted, #94a3b8)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {t('backupTotalCount' as any) || 'Total Backups'}
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: '0.3rem', color: '#60a5fa' }}>
              {backups.length}
            </div>
          </div>

          <div
            style={{
              padding: '1rem',
              borderRadius: '10px',
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
            }}
          >
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted, #94a3b8)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {t('backupTotalSize' as any) || 'Total Archive Size'}
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: '0.3rem', color: '#a78bfa' }}>
              {formatBytes(totalSizeBytes)}
            </div>
          </div>

          <div
            style={{
              padding: '1rem',
              borderRadius: '10px',
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
            }}
          >
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted, #94a3b8)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {t('backupScheduleTitle' as any) || 'Cron Schedule'}
            </div>
            <div style={{ fontSize: '1.1rem', fontWeight: 600, marginTop: '0.3rem', color: config?.enabled ? '#34d399' : '#f87171' }}>
              {config?.enabled ? `🟢 ${t('backupStatusActive' as any) || 'Active'}` : `⚪ ${t('backupStatusDisabled' as any) || 'Disabled'}`}
            </div>
            {config?.nextRunDate && config?.enabled && (
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #94a3b8)', marginTop: '0.2rem' }}>
                {t('backupNextRunPrefix' as any) || 'Next'}: {formatDate(config.nextRunDate)}
              </div>
            )}
          </div>

          <div
            style={{
              padding: '1rem',
              borderRadius: '10px',
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
            }}
          >
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted, #94a3b8)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {t('backupLastCreated' as any) || 'Last Backup'}
            </div>
            <div style={{ fontSize: '1rem', fontWeight: 600, marginTop: '0.3rem', color: 'var(--text-main, #f8fafc)' }}>
              {latestBackupDate ? formatDate(latestBackupDate) : (t('backupNeverRun' as any) || 'Never')}
            </div>
          </div>
        </div>
      </div>

      {/* Schedule & Retention Settings Drawer */}
      {isScheduleOpen && (
        <div
          className="admin-card"
          style={{
            padding: '1.5rem',
            borderRadius: '14px',
            background: 'var(--card-bg, rgba(30, 41, 59, 0.8))',
            border: '1px solid #3b82f6',
            backdropFilter: 'blur(12px)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem' }}>
            <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>⚙️</span>
              <span>{t('backupScheduleTitle' as any) || 'Automated Backup & Cron Schedule'}</span>
            </h4>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setIsScheduleOpen(false)}
              style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem' }}
            >
              ✕
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
            {/* Enable switch */}
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', fontWeight: 600 }}>
                <input
                  type="checkbox"
                  checked={scheduleEnabled}
                  onChange={(e) => setScheduleEnabled(e.target.checked)}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
                <span>{scheduleEnabled ? t('backupScheduleEnabled' as any) || 'Automated Cron Backup is Active' : t('backupScheduleDisabled' as any) || 'Automated Cron Backup is Disabled'}</span>
              </label>
              <p style={{ margin: '0.4rem 0 0 2rem', fontSize: '0.82rem', color: 'var(--text-muted, #94a3b8)' }}>
                {t('backupScheduleDesc' as any) || 'When enabled, the background server creates automated snapshots on the specified cron schedule.'}
              </p>
            </div>

            {/* Preset selector */}
            <div>
              <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem', fontWeight: 600 }}>
                {t('backupSchedulePresetLabel' as any) || 'Schedule Preset'}
              </label>
              <select
                className="form-control"
                value={cronPreset}
                onChange={(e) => setCronPreset(e.target.value)}
                style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '8px' }}
              >
                <option value="0 2 * * *">{t('backupCronPresetDaily' as any) || 'Daily at 02:00 AM (Recommended)'}</option>
                <option value="0 0,12 * * *">{t('backupCronPresetTwiceDaily' as any) || 'Twice Daily (12:00 PM & 12:00 AM)'}</option>
                <option value="0 3 * * 0">{t('backupCronPresetWeekly' as any) || 'Weekly (Every Sunday at 03:00 AM)'}</option>
                <option value="custom">{t('backupCronPresetCustom' as any) || 'Custom Cron Expression'}</option>
              </select>

              {cronPreset === 'custom' && (
                <div style={{ marginTop: '0.6rem' }}>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. 0 */6 * * *"
                    value={customCron}
                    onChange={(e) => setCustomCron(e.target.value)}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '8px' }}
                  />
                  <small style={{ color: 'var(--text-muted, #94a3b8)', display: 'block', marginTop: '0.25rem' }}>
                    {t('backupCronHelp' as any) || 'Standard 5-part cron format (minute hour day month day-of-week).'}
                  </small>
                </div>
              )}
            </div>

            {/* Retention limit */}
            <div>
              <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem', fontWeight: 600 }}>
                {t('backupRetentionLabel' as any) || 'Max Backups to Retain (Prunes oldest)'}
              </label>
              <input
                type="number"
                min="1"
                max="100"
                className="form-control"
                value={retentionCount}
                onChange={(e) => setRetentionCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '8px' }}
              />
              <small style={{ color: 'var(--text-muted, #94a3b8)', display: 'block', marginTop: '0.25rem' }}>
                {t('backupRetentionHelp' as any) || 'Oldest backups beyond this threshold will be pruned automatically.'}
              </small>
            </div>

            {/* Storage directory */}
            <div>
              <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem', fontWeight: 600 }}>
                {t('backupPathLabel' as any) || 'Backup Archive Storage Directory'}
              </label>
              <div
                style={{
                  padding: '0.5rem 0.75rem',
                  borderRadius: '8px',
                  background: 'rgba(0, 0, 0, 0.2)',
                  fontFamily: 'monospace',
                  fontSize: '0.85rem',
                  overflowX: 'auto',
                }}
              >
                {config?.backupPath || 'data/backups'}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.2rem', gap: '0.75rem' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setIsScheduleOpen(false)}
            >
              {t('cancel' as any) || 'Cancel'}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSaveSchedule}
              disabled={isSavingConfig}
              id="btn-admin-backup-save-schedule"
            >
              {isSavingConfig ? t('backupSavingSchedule' as any) || 'Saving...' : t('backupSaveScheduleBtn' as any) || 'Save Schedule Settings'}
            </button>
          </div>
        </div>
      )}

      {/* Backups List Table */}
      <div
        className="admin-card"
        style={{
          padding: '1.5rem',
          borderRadius: '14px',
          background: 'var(--card-bg, rgba(30, 41, 59, 0.7))',
          border: '1px solid var(--border-color, rgba(255, 255, 255, 0.1))',
          backdropFilter: 'blur(12px)',
        }}
      >
        <h4 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', fontWeight: 600 }}>
          {t('backupAvailableTitle' as any) || 'Available System Backups'} ({backups.length})
        </h4>

        {isLoading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted, #94a3b8)' }}>
            {t('backupLoadingArchives' as any) || 'Loading backup archives...'}
          </div>
        ) : error ? (
          <div style={{ padding: '1rem', color: '#f87171' }}>
            {error}
          </div>
        ) : backups.length === 0 ? (
          <div
            style={{
              padding: '3rem',
              textAlign: 'center',
              color: 'var(--text-muted, #94a3b8)',
              border: '1px dashed rgba(255, 255, 255, 0.15)',
              borderRadius: '10px',
            }}
          >
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📦</div>
            <p style={{ margin: 0, fontSize: '0.95rem' }}>
              {t('backupNoBackupsFound' as any) ||
                'No system backups found. Click "Create Backup Now" to create your first archive.'}
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)', color: 'var(--text-muted, #94a3b8)' }}>
                  <th style={{ padding: '0.75rem 0.5rem' }}>{t('backupColFilename' as any) || 'Archive Name'}</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>{t('backupColDate' as any) || 'Date & Time'}</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>{t('backupColSize' as any) || 'Size'}</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>{t('backupColTrigger' as any) || 'Trigger'}</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>{t('backupColContents' as any) || 'Included Components'}</th>
                  <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>{t('backupColActions' as any) || 'Actions'}</th>
                </tr>
              </thead>
              <tbody>
                {backups.map((item) => (
                  <tr
                    key={item.filename}
                    style={{
                      borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                      transition: 'background 0.15s ease',
                    }}
                  >
                    {/* Filename & description */}
                    <td style={{ padding: '0.85rem 0.5rem' }}>
                      <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span>📁</span>
                        <span>{item.filename}</span>
                      </div>
                      {item.description && (
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted, #94a3b8)', marginTop: '0.2rem' }}>
                          {item.description}
                        </div>
                      )}
                      {!item.isValid && (
                        <div style={{ fontSize: '0.75rem', color: '#f87171', marginTop: '0.2rem' }}>
                          ⚠️ {item.errorMessage || (t('backupArchiveInvalid' as any) || 'Archive invalid')}
                        </div>
                      )}
                    </td>

                    {/* Date */}
                    <td style={{ padding: '0.85rem 0.5rem', whiteSpace: 'nowrap' }}>
                      {formatDate(item.createdAt)}
                    </td>

                    {/* Size */}
                    <td style={{ padding: '0.85rem 0.5rem', whiteSpace: 'nowrap' }}>
                      <span className="badge-pill" style={{ background: 'rgba(255, 255, 255, 0.08)', padding: '0.2rem 0.5rem', borderRadius: '6px' }}>
                        {formatBytes(item.sizeBytes)}
                      </span>
                    </td>

                    {/* Trigger */}
                    <td style={{ padding: '0.85rem 0.5rem' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.3rem',
                          padding: '0.2rem 0.5rem',
                          borderRadius: '6px',
                          fontSize: '0.78rem',
                          background: item.trigger === 'scheduled' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(168, 85, 247, 0.2)',
                          color: item.trigger === 'scheduled' ? '#93c5fd' : '#d8b4fe',
                          border: `1px solid ${item.trigger === 'scheduled' ? 'rgba(59, 130, 246, 0.3)' : 'rgba(168, 85, 247, 0.3)'}`,
                        }}
                      >
                        {item.trigger === 'scheduled' ? (t('backupTriggerScheduled' as any) || '⏱️ Scheduled') : (t('backupTriggerManual' as any) || '⚡ Manual')}
                      </span>
                    </td>

                    {/* Contents / Stats */}
                    <td style={{ padding: '0.85rem 0.5rem' }}>
                      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.75rem', background: 'rgba(255, 255, 255, 0.06)', padding: '0.15rem 0.4rem', borderRadius: '4px' }}>
                          ⚙️ {t('backupCompConfigShort' as any) || 'Config'}
                        </span>
                        <span style={{ fontSize: '0.75rem', background: 'rgba(255, 255, 255, 0.06)', padding: '0.15rem 0.4rem', borderRadius: '4px' }}>
                          ⚡ {t('backupCompFlagsShort' as any) || 'Flags'} ({item.stats?.featureFlagsCount ?? '—'})
                        </span>
                        <span style={{ fontSize: '0.75rem', background: 'rgba(255, 255, 255, 0.06)', padding: '0.15rem 0.4rem', borderRadius: '4px' }}>
                          🗄️ {t('backupCompDbShort' as any) || 'Media DB'} ({item.stats?.mediaItemsCount ?? '—'})
                        </span>
                        <span style={{ fontSize: '0.75rem', background: 'rgba(255, 255, 255, 0.06)', padding: '0.15rem 0.4rem', borderRadius: '4px' }}>
                          🌳 {t('backupCompKinshipShort' as any) || 'Kinship'} ({item.stats?.kinshipMembersCount ?? '—'})
                        </span>
                      </div>
                    </td>

                    {/* Actions */}
                    <td style={{ padding: '0.85rem 0.5rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => handleDownloadBackup(item.filename)}
                          title={t('backupDownloadArchiveTooltip' as any) || 'Download ZIP archive'}
                          style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}
                        >
                          ⬇️ {t('backupBtnDownload' as any) || 'Download'}
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => setRestoreTarget(item)}
                          title={t('backupRestoreArchiveTooltip' as any) || 'Restore system from this backup'}
                          style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem', color: '#60a5fa' }}
                        >
                          🔄 {t('backupBtnRestore' as any) || 'Restore'}
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => handleDeleteBackup(item.filename)}
                          title={t('backupDeleteArchiveTooltip' as any) || 'Delete backup archive'}
                          style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem', color: '#f87171' }}
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Restore Confirmation Modal */}
      {restoreTarget && (
        <div
          className="admin-modal-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
            backdropFilter: 'blur(6px)',
          }}
        >
          <div
            className="admin-modal-content"
            style={{
              background: 'var(--card-bg, #1e293b)',
              border: '1px solid #eab308',
              borderRadius: '16px',
              padding: '1.75rem',
              maxWidth: '560px',
              width: '100%',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#facc15' }}>
                <span>⚠️</span>
                <span>{t('backupRestoreModalTitle' as any) || 'Restore System from Backup'}</span>
              </h3>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={isRestoring}
                onClick={() => setRestoreTarget(null)}
                style={{ padding: '0.2rem 0.5rem', fontSize: '0.85rem' }}
              >
                ✕
              </button>
            </div>

            {/* Target backup info */}
            <div
              style={{
                padding: '0.85rem',
                borderRadius: '8px',
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                marginBottom: '1rem',
                fontSize: '0.85rem',
              }}
            >
              <div><strong>{t('backupArchiveLabel' as any) || 'Archive'}:</strong> {restoreTarget.filename}</div>
              <div style={{ marginTop: '0.25rem' }}><strong>{t('backupCreatedLabel' as any) || 'Created'}:</strong> {formatDate(restoreTarget.createdAt)} ({formatBytes(restoreTarget.sizeBytes)})</div>
              {restoreTarget.description && (
                <div style={{ marginTop: '0.25rem', color: 'var(--text-muted, #94a3b8)' }}><strong>{t('backupNoteLabel' as any) || 'Note'}:</strong> {restoreTarget.description}</div>
              )}
            </div>

            {/* Warning banner */}
            <div
              style={{
                padding: '0.85rem',
                borderRadius: '8px',
                background: 'rgba(234, 179, 8, 0.12)',
                border: '1px solid rgba(234, 179, 8, 0.4)',
                color: '#fde047',
                fontSize: '0.82rem',
                lineHeight: 1.4,
                marginBottom: '1.2rem',
              }}
            >
              {t('backupRestoreModalWarning' as any) ||
                'WARNING: Restoring will overwrite existing databases and configurations with the contents of this archive. An automatic safety snapshot will be created before restoring.'}
            </div>

            {/* Selective components */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1.2rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.88rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={createSafetyBackup}
                  onChange={(e) => setCreateSafetyBackup(e.target.checked)}
                />
                <span style={{ fontWeight: 600, color: '#38bdf8' }}>
                  {t('backupRestoreSafetyCheckbox' as any) || 'Create automatic safety backup of current state before restore (Recommended)'}
                </span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.88rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={restoreDatabase}
                  onChange={(e) => setRestoreDatabase(e.target.checked)}
                />
                <span>{t('backupRestoreCompDatabase' as any) || 'Restore Metadata Database (catalog_history.db)'}</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.88rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={restoreKinship}
                  onChange={(e) => setRestoreKinship(e.target.checked)}
                />
                <span>{t('backupRestoreCompKinship' as any) || 'Restore Family Tree & Kinship (family_tree.db)'}</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.88rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={restoreFlags}
                  onChange={(e) => setRestoreFlags(e.target.checked)}
                />
                <span>{t('backupRestoreCompFlags' as any) || 'Restore Feature Flags (feature_flags.json)'}</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.88rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={restoreConfig}
                  onChange={(e) => setRestoreConfig(e.target.checked)}
                />
                <span>{t('backupRestoreCompConfig' as any) || 'Restore Configuration (settings.json, env)'}</span>
              </label>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={isRestoring}
                onClick={() => setRestoreTarget(null)}
              >
                {t('cancel' as any) || 'Cancel'}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={isRestoring || (!restoreDatabase && !restoreKinship && !restoreFlags && !restoreConfig)}
                onClick={handleExecuteRestore}
                id="btn-admin-confirm-restore"
                style={{
                  background: '#eab308',
                  color: '#0f172a',
                  fontWeight: 600,
                  border: 'none',
                }}
              >
                {isRestoring ? t('backupRestoringBtn' as any) || 'Restoring System...' : t('backupRestoreConfirmBtn' as any) || 'Confirm & Restore System'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
