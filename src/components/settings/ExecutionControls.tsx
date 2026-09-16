import React, { useState } from 'react';
import { useLanguage } from '../../i18n/LanguageContext';

export interface ExecutionControlsProps {
  isRunning?: boolean;
  isPaused?: boolean;
  currentTask?: string | null;
  statusInfo?: any;
  onStartSync: (force: boolean, modes?: string[]) => void;
  onPauseSync: () => void;
  onResumeSync: () => void;
  onStopSync: () => void;
  onStartSingleAnalysis: (path: string, onSuccess?: () => void, modes?: string[]) => void;
  onPickSingleFile: () => Promise<string>;
  pickerPending?: boolean;
}

export default function ExecutionControls({
  isRunning = false,
  isPaused = false,
  currentTask = null,
  statusInfo,
  onStartSync,
  onPauseSync,
  onResumeSync,
  onStopSync,
  onStartSingleAnalysis,
  onPickSingleFile,
  pickerPending = false,
}: ExecutionControlsProps) {
  const { t } = useLanguage();
  const [forceReprocess, setForceReprocess] = useState(false);
  const [singleFilePath, setSingleFilePath] = useState('');
  const [showDetails, setShowDetails] = useState(false);

  // Modular pipeline selection: transcribe, faces, duplicates, vision
  const [selectedModules, setSelectedModules] = useState<string[]>([
    'transcribe',
    'faces',
    'duplicates',
    'vision',
  ]);

  const toggleModule = (moduleKey: string) => {
    setSelectedModules((prev) =>
      prev.includes(moduleKey) ? prev.filter((k) => k !== moduleKey) : [...prev, moduleKey]
    );
  };

  const handleSelectAll = () => {
    setSelectedModules(['transcribe', 'faces', 'duplicates', 'vision']);
  };

  const handleDeselectAll = () => {
    setSelectedModules([]);
  };

  const handleSyncClick = () => {
    onStartSync(forceReprocess, selectedModules.length > 0 ? selectedModules : ['all']);
  };

  const handleAnalyzeClick = () => {
    const trimmed = singleFilePath.trim();
    if (!trimmed) {
      alert(t('alertEnterPath'));
      return;
    }
    onStartSingleAnalysis(trimmed, () => setSingleFilePath(''), selectedModules.length > 0 ? selectedModules : ['all']);
  };

  const handlePickFileClick = async () => {
    const selected = await onPickSingleFile();
    if (selected) {
      setSingleFilePath(selected);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleAnalyzeClick();
    }
  };

  const isSyncActive = (isRunning || isPaused) && (!currentTask || currentTask === 'sync');
  const disabled = isRunning || isPaused || pickerPending;

  // Live progress stats
  const progress = statusInfo?.progress;
  const queue = statusInfo?.queue;
  const currentFile = statusInfo?.current_file || progress?.current_file || '';
  const stage = progress?.stage || '';
  const percent = progress?.percent ?? progress?.percentage ?? (progress?.total ? Math.round((progress.current / progress.total) * 100) : 0);

  const modulesList = [
    { id: 'transcribe', label: t('moduleAudio'), desc: t('moduleAudioDesc'), icon: '🎙️', color: '#10b981' },
    { id: 'faces', label: t('moduleFaces'), desc: t('moduleFacesDesc'), icon: '👤', color: '#a855f7' },
    { id: 'duplicates', label: t('moduleDuplicates'), desc: t('moduleDuplicatesDesc'), icon: '🗂️', color: '#3b82f6' },
    { id: 'vision', label: t('moduleVision'), desc: t('moduleVisionDesc'), icon: '🖼️', color: '#06b6d4' },
  ];

  return (
    <div className="card execution-controls-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <h2 style={{ margin: 0 }}>⚡ {t('controlsTitle')}</h2>
        {isSyncActive && (
          <span className="badge-pill badge-pill-accent" style={{ fontSize: '0.8rem', padding: '0.2rem 0.6rem' }}>
            {isPaused ? `⏸️ ${t('statusPaused')}` : `⏳ ${t('statusRunning')}`}
          </span>
        )}
      </div>

      {/* Modular Pipeline Checkboxes */}
      <div
        className="modular-modules-selector"
        style={{
          background: 'var(--bg-secondary, rgba(255, 255, 255, 0.03))',
          border: '1px solid var(--border-color, rgba(255, 255, 255, 0.1))',
          borderRadius: '8px',
          padding: '1rem',
          margin: '0.75rem 0',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
          <div>
            <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>🧩 {t('modularExecutionTitle')}</span>
            <p className="description" style={{ margin: '0.2rem 0 0', fontSize: '0.8rem' }}>
              {t('modularExecutionDesc')}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleSelectAll}
              disabled={disabled}
              style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
            >
              {t('btnSelectAll')}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleDeselectAll}
              disabled={disabled}
              style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
            >
              {t('btnDeselectAll')}
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.6rem' }}>
          {modulesList.map((m) => {
            const isChecked = selectedModules.includes(m.id);
            return (
              <label
                key={m.id}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.6rem',
                  padding: '0.6rem',
                  borderRadius: '6px',
                  background: isChecked ? 'rgba(59, 130, 246, 0.08)' : 'rgba(0, 0, 0, 0.15)',
                  border: isChecked ? `1px solid ${m.color}66` : '1px solid transparent',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <input
                  type="checkbox"
                  id={`module-cb-${m.id}`}
                  checked={isChecked}
                  onChange={() => toggleModule(m.id)}
                  disabled={disabled}
                  style={{ marginTop: '0.2rem' }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: '0.85rem', color: isChecked ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                    {m.label}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #94a3b8)', marginTop: '0.15rem', lineHeight: '1.2' }}>
                    {m.desc}
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {/* Two-Level Progress Section (Compact + Expandable Details) */}
      {(isSyncActive || (progress && progress.total > 0)) && (
        <div
          className="execution-progress-container"
          style={{
            background: 'var(--bg-secondary, rgba(0, 0, 0, 0.2))',
            border: '1px solid var(--border-color, rgba(255, 255, 255, 0.1))',
            borderRadius: '8px',
            padding: '0.85rem',
            margin: '0.75rem 0',
          }}
        >
          {/* Level 1: Compact View */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
            <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>
              {stage || t('progressLabel')} ({percent}%)
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                {progress?.current || 0} / {progress?.total || 0}
              </span>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowDetails(!showDetails)}
                style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem' }}
              >
                {showDetails ? `▲ ${t('hideDetails')}` : `▼ ${t('toggleDetails')}`}
              </button>
            </div>
          </div>

          <div
            style={{
              width: '100%',
              height: '8px',
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              borderRadius: '4px',
              overflow: 'hidden',
              margin: '0.3rem 0 0.5rem',
            }}
          >
            <div
              style={{
                width: `${Math.min(100, Math.max(0, percent))}%`,
                height: '100%',
                backgroundColor: isPaused ? '#eab308' : '#3b82f6',
                borderRadius: '4px',
                transition: 'width 0.3s ease',
              }}
            />
          </div>

          {currentFile && (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
              📄 {t('currentFileLabel')}: <span style={{ color: 'var(--text-primary)' }}>{currentFile}</span>
            </div>
          )}

          {/* Level 2: Expanded Stage Queue Details */}
          {showDetails && (
            <div
              style={{
                marginTop: '0.6rem',
                paddingTop: '0.6rem',
                borderTop: '1px dashed var(--border-color, rgba(255, 255, 255, 0.1))',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                gap: '0.5rem',
                fontSize: '0.78rem',
              }}
            >
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.4rem 0.6rem', borderRadius: '4px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Active Workers:</span>{' '}
                <strong style={{ color: '#10b981' }}>{queue?.active_workers ?? 0} / {queue?.max_workers ?? 0}</strong>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.4rem 0.6rem', borderRadius: '4px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Pending Items:</span>{' '}
                <strong>{queue?.pending_count ?? Math.max(0, (progress?.total || 0) - (progress?.current || 0))}</strong>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.4rem 0.6rem', borderRadius: '4px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Completed:</span>{' '}
                <strong style={{ color: '#3b82f6' }}>{queue?.completed ?? (progress?.current || 0)}</strong>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.4rem 0.6rem', borderRadius: '4px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Failed:</span>{' '}
                <strong style={{ color: queue?.failed ? '#ef4444' : 'inherit' }}>{queue?.failed ?? 0}</strong>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Full Archive Sync Controls */}
      <div className="form-group" style={{ marginTop: '0.5rem' }}>
        <label>{t('syncSectionTitle')}</label>
        <p className="description">{t('syncSectionDesc')}</p>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0.5rem 0' }}>
          <label className="checkbox-group">
            <input
              type="checkbox"
              id="force-reprocess"
              checked={forceReprocess}
              onChange={(e) => setForceReprocess(e.target.checked)}
              disabled={isSyncActive || disabled}
            />
            {t('forceReprocessLabel')}
          </label>
        </div>

        {isSyncActive ? (
          <div style={{ display: 'flex', gap: '0.6rem' }}>
            {isPaused ? (
              <button
                className="btn btn-success"
                id="btn-resume-sync"
                onClick={onResumeSync}
                style={{ flex: 1 }}
                type="button"
              >
                ▶ {t('btnResume')}
              </button>
            ) : (
              <button
                className="btn btn-warning"
                id="btn-pause-sync"
                onClick={onPauseSync}
                style={{ flex: 1 }}
                type="button"
              >
                ⏸ {t('btnPause')}
              </button>
            )}
            <button
              className="btn btn-danger"
              id="btn-stop-sync"
              onClick={onStopSync}
              style={{ flex: 1 }}
              type="button"
            >
              ⏹ {t('btnStop')}
            </button>
          </div>
        ) : (
          <button
            className="btn btn-primary"
            id="btn-sync"
            onClick={handleSyncClick}
            disabled={disabled || selectedModules.length === 0}
            style={{ width: '100%', padding: '0.75rem 1.5rem', fontSize: '0.95rem' }}
          >
            ⚡ {selectedModules.length === 4 ? t('btnRunSync') : t('btnRunSelected')}
          </button>
        )}
      </div>

      {/* Single File Analysis */}
      <div
        className="form-group"
        style={{
          marginTop: '0.75rem',
          borderTop: '1px solid var(--border-color)',
          paddingTop: '1.5rem',
        }}
      >
        <label htmlFor="single-file-input">{t('singleFileSectionTitle')}</label>
        <p className="description">{t('singleFileSectionDesc')}</p>
        <div style={{ display: 'flex', gap: '0.6rem' }}>
          <input
            type="text"
            className="input-control"
            id="single-file-input"
            value={singleFilePath}
            onChange={(e) => setSingleFilePath(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('placeholderSingleFile')}
            disabled={disabled}
          />
          <button
            className="btn-icon"
            title={t('chooseFileTooltip')}
            id="btn-pick-file"
            onClick={handlePickFileClick}
            disabled={disabled}
            type="button"
          >
            📄
          </button>
          <button
            className="btn btn-accent"
            id="btn-analyze"
            onClick={handleAnalyzeClick}
            disabled={disabled || !singleFilePath.trim() || selectedModules.length === 0}
            type="button"
          >
            {t('analyzeButtonText')}
          </button>
        </div>
      </div>
    </div>
  );
}
