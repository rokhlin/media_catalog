import React, { useState, useEffect, useCallback } from 'react';
import type { DuplicateScanStatus, DuplicateConfig } from '../../models/media';
import { useLanguage } from '../../i18n/LanguageContext';
import { useAuth } from '../../services/authContext';
import './DuplicatesManagerTab.css';

export interface DuplicateDetectionRulesProps {
  activeInputFolders?: string[];
  onScanCompleted?: () => void;
  title?: string;
  showSaveButton?: boolean;
  // Optional controlled props for DuplicatesManagerTab
  selectedEngine?: 'auto' | 'cpu' | 'gpu';
  setSelectedEngine?: (engine: 'auto' | 'cpu' | 'gpu') => void;
  selectedMode?: 'all' | 'exact' | 'visual' | 'burst';
  setSelectedMode?: (mode: 'all' | 'exact' | 'visual' | 'burst') => void;
  similarityThreshold?: number;
  setSimilarityThreshold?: (val: number) => void;
  burstWindowSec?: number;
  setBurstWindowSec?: (val: number) => void;
  selectedFolderScope?: string;
  setSelectedFolderScope?: (folder: string) => void;
  forceRehash?: boolean;
  setForceRehash?: (val: boolean) => void;
  isScanning?: boolean;
  scanStatus?: DuplicateScanStatus | null;
  onStartScan?: () => void;
  onStopScan?: () => void;
}

export const DuplicateDetectionRules: React.FC<DuplicateDetectionRulesProps> = ({
  activeInputFolders = [],
  onScanCompleted,
  title,
  showSaveButton = true,
  selectedEngine: controlledEngine,
  setSelectedEngine: setControlledEngine,
  selectedMode: controlledMode,
  setSelectedMode: setControlledMode,
  similarityThreshold: controlledThreshold,
  setSimilarityThreshold: setControlledThreshold,
  burstWindowSec: controlledBurstWindow,
  setBurstWindowSec: setControlledBurstWindow,
  selectedFolderScope: controlledFolderScope,
  setSelectedFolderScope: setControlledFolderScope,
  forceRehash: controlledForceRehash,
  setForceRehash: setControlledForceRehash,
  isScanning: controlledIsScanning,
  scanStatus: controlledScanStatus,
  onStartScan: controlledStartScan,
  onStopScan: controlledStopScan,
}) => {
  const { t } = useLanguage();
  const { authFetch } = useAuth();

  // Local state if uncontrolled
  const [localEngine, setLocalEngine] = useState<'auto' | 'cpu' | 'gpu'>('auto');
  const [localMode, setLocalMode] = useState<'all' | 'exact' | 'visual' | 'burst'>('all');
  const [localThreshold, setLocalThreshold] = useState<number>(0.85);
  const [localBurstWindow, setLocalBurstWindow] = useState<number>(3.0);
  const [localFolderScope, setLocalFolderScope] = useState<string>('all');
  const [localForceRehash, setLocalForceRehash] = useState<boolean>(false);
  const [localScanStatus, setLocalScanStatus] = useState<DuplicateScanStatus | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const isControlled = controlledEngine !== undefined;

  const engine = isControlled ? controlledEngine : localEngine;
  const setEngine = isControlled && setControlledEngine ? setControlledEngine : setLocalEngine;

  const mode = isControlled ? controlledMode : localMode;
  const setMode = isControlled && setControlledMode ? setControlledMode : setLocalMode;

  const threshold = isControlled ? controlledThreshold : localThreshold;
  const setThreshold = isControlled && setControlledThreshold ? setControlledThreshold : setLocalThreshold;

  const burstWindow = isControlled ? controlledBurstWindow : localBurstWindow;
  const setBurstWindow = isControlled && setControlledBurstWindow ? setControlledBurstWindow : setLocalBurstWindow;

  const folderScope = isControlled ? controlledFolderScope : localFolderScope;
  const setFolderScope = isControlled && setControlledFolderScope ? setControlledFolderScope : setLocalFolderScope;

  const forceRehash = isControlled ? controlledForceRehash : localForceRehash;
  const setForceRehash = isControlled && setControlledForceRehash ? setControlledForceRehash : setLocalForceRehash;

  const scanStatus = isControlled && controlledScanStatus !== undefined ? controlledScanStatus : localScanStatus;
  const isScanning = isControlled && controlledIsScanning !== undefined ? controlledIsScanning : Boolean(scanStatus?.isScanning);

  // Load config on mount if uncontrolled
  useEffect(() => {
    if (isControlled) return;
    let isMounted = true;
    (async () => {
      try {
        const res = await fetch('/api/duplicates/config');
        if (res.ok) {
          const cfg: DuplicateConfig = await res.json();
          if (isMounted) {
            if (cfg.default_engine) setLocalEngine(cfg.default_engine);
            if (cfg.similarity_threshold) setLocalThreshold(cfg.similarity_threshold);
            if (cfg.burst_window_seconds) setLocalBurstWindow(cfg.burst_window_seconds);
          }
        }
      } catch (err) {
        console.error('Failed to load duplicate config:', err);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [isControlled]);

  // Polling for scan status if uncontrolled
  useEffect(() => {
    if (isControlled) return;
    let timer: any;
    const checkStatus = async () => {
      try {
        const res = await fetch('/api/duplicates/scan-status');
        if (res.ok) {
          const st: DuplicateScanStatus = await res.json();
          setLocalScanStatus(st);
          if (st.isScanning) {
            timer = setTimeout(checkStatus, 1000);
          } else if (localScanStatus?.isScanning) {
            if (onScanCompleted) onScanCompleted();
          }
        }
      } catch {
        // ignore network error during poll
      }
    };
    checkStatus();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [isControlled, localScanStatus?.isScanning, onScanCompleted]);

  // Handle start scan
  const handleStartScan = useCallback(async () => {
    if (controlledStartScan) {
      controlledStartScan();
      return;
    }
    try {
      const folders = folderScope !== 'all' ? [folderScope] : undefined;
      const res = await authFetch('/api/duplicates/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          engine,
          mode,
          similarity_threshold: threshold,
          burst_window_seconds: burstWindow,
          folders,
          force_rehash: forceRehash,
        }),
      });

      if (res.ok) {
        const st = await res.json();
        setLocalScanStatus(st);
      } else {
        const err = await res.json();
        alert(`Error: ${err.message || 'Failed to start duplicate scan'}`);
      }
    } catch (err: any) {
      alert(`Network error: ${err.message}`);
    }
  }, [authFetch, burstWindow, controlledStartScan, engine, folderScope, forceRehash, mode, threshold]);

  // Handle stop scan
  const handleStopScan = useCallback(async () => {
    if (controlledStopScan) {
      controlledStopScan();
      return;
    }
    try {
      await authFetch('/api/duplicates/stop-scan', { method: 'POST' });
    } catch (err) {
      console.error('Failed to stop duplicate scan:', err);
    }
  }, [authFetch, controlledStopScan]);

  // Save config to backend
  const handleSaveConfig = async () => {
    setIsSaving(true);
    setSaveMessage(null);
    try {
      const res = await authFetch('/api/duplicates/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          default_engine: engine,
          similarity_threshold: threshold,
          burst_window_seconds: burstWindow,
        }),
      });
      if (res.ok) {
        setSaveMessage(t('settingsSaved' as any) || 'Detection rules saved successfully.');
        setTimeout(() => setSaveMessage(null), 3000);
      } else {
        setSaveMessage('Failed to save configuration.');
      }
    } catch (err: any) {
      setSaveMessage(`Error: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="dup-control-panel" style={{ width: '100%', boxSizing: 'border-box' }}>
      <div className="dup-panel-header">
        <h3 className="dup-panel-title">
          <span>🔍</span>
          <span>{title || t('duplicateDetectionRules' as any) || 'Detection Rules & Thresholds'}</span>
        </h3>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {isScanning ? (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleStopScan}
              style={{ borderColor: '#ef4444', color: '#ef4444' }}
            >
              🛑 {t('btnStopScan' as any) || 'Stop Scan'}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleStartScan}
              id="btn-start-duplicate-scan"
            >
              🚀 {t('btnStartDuplicateScan' as any) || 'Find Duplicates'}
            </button>
          )}
        </div>
      </div>

      <div className="dup-controls-form">
        <div className="dup-form-group">
          <label>{t('duplicateEngine' as any) || 'Processing Engine'}</label>
          <select
            className="dup-form-select"
            value={engine}
            onChange={(e) => setEngine(e.target.value as any)}
            disabled={isScanning}
          >
            <option value="auto">Auto-Detect (GPU with CPU Fallback)</option>
            <option value="cpu">CPU Engine (Low-Memory Safe)</option>
            <option value="gpu">GPU AI Engine (NVIDIA CUDA Accelerated)</option>
          </select>
        </div>

        <div className="dup-form-group">
          <label>{t('duplicateMatchMode' as any) || 'Detection Mode'}</label>
          <select
            className="dup-form-select"
            value={mode}
            onChange={(e) => setMode(e.target.value as any)}
            disabled={isScanning}
          >
            <option value="all">All Methods (Exact + Visual + Burst)</option>
            <option value="exact">Exact Hash (100% Byte Identity)</option>
            <option value="visual">Visual Similarity (pHash Perceptual)</option>
            <option value="burst">Burst Series (Time Proximity)</option>
          </select>
        </div>

        <div className="dup-form-group">
          <label>
            <span>{t('similarityThreshold' as any) || 'Visual Similarity Threshold'}</span>
            <span className="dup-range-badge">{Math.round((threshold ?? 0.85) * 100)}%</span>
          </label>
          <div className="dup-range-wrap">
            <input
              type="range"
              className="dup-range-input"
              min="0.70"
              max="1.00"
              step="0.01"
              value={threshold}
              onChange={(e) => setThreshold(parseFloat(e.target.value))}
              disabled={isScanning}
            />
          </div>
        </div>

        <div className="dup-form-group">
          <label>
            <span>{t('burstWindow' as any) || 'Burst Series Time Window'}</span>
            <span className="dup-range-badge">{burstWindow}s</span>
          </label>
          <div className="dup-range-wrap">
            <input
              type="range"
              className="dup-range-input"
              min="1"
              max="30"
              step="1"
              value={burstWindow}
              onChange={(e) => setBurstWindow(parseInt(e.target.value, 10))}
              disabled={isScanning}
            />
          </div>
        </div>

        {activeInputFolders.length > 1 && (
          <div className="dup-form-group">
            <label>{t('targetFolderScope' as any) || 'Scan Folder Scope'}</label>
            <select
              className="dup-form-select"
              value={folderScope}
              onChange={(e) => setFolderScope(e.target.value)}
              disabled={isScanning}
            >
              <option value="all">All Input Sources</option>
              {activeInputFolders.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>
        )}

        <div className="dup-form-group" style={{ display: 'flex', alignItems: 'center', marginTop: '1.4rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.85rem' }}>
            <input
              type="checkbox"
              checked={forceRehash}
              onChange={(e) => setForceRehash(e.target.checked)}
              disabled={isScanning}
            />
            <span>Force Re-hash Files</span>
          </label>
        </div>
      </div>

      {/* Live Scan Progress Card */}
      {isScanning && (
        <div className="dup-progress-card">
          <div className="dup-progress-header">
            <span>{scanStatus?.stage || 'Scanning in progress...'}</span>
            <span><strong>{scanStatus?.current || 0}</strong> / {scanStatus?.total || 0} ({scanStatus?.percent || 0}%)</span>
          </div>
          <div className="dup-progress-bar-bg">
            <div
              className="dup-progress-bar-fill"
              style={{ width: `${scanStatus?.percent || 0}%` }}
            />
          </div>
          {scanStatus?.currentFile && (
            <div style={{ fontSize: '0.8rem', color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              📄 {scanStatus.currentFile}
            </div>
          )}
        </div>
      )}

      {showSaveButton && !isControlled && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          {saveMessage ? (
            <span style={{ fontSize: '0.85rem', color: '#34d399', fontWeight: 500 }}>
              {saveMessage}
            </span>
          ) : <span />}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleSaveConfig}
            disabled={isSaving || isScanning}
            style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem' }}
          >
            {isSaving ? '⏳ Saving...' : '💾 Save Detection Rules'}
          </button>
        </div>
      )}
    </div>
  );
};

export default DuplicateDetectionRules;
