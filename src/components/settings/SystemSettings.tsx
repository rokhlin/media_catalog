import React, { useState, useEffect, useCallback } from 'react';
import type { SettingsData, UISettings } from '../../models';
import type { ThemeMode } from '../../models/theme';
import { useLanguage } from '../../i18n/LanguageContext';
import { useTheme } from '../../theme/ThemeContext';
import { mediaCacheService } from '../../services/mediaCacheService';
import DirectoryBrowserModal from './DirectoryBrowserModal';
import { setTreeStore } from '../../packages/family-tree/state/useFamilyTreeStore.js';
import './SystemSettings.css';

export type SettingsTab = 'execution' | 'paths' | 'models' | 'appearance' | 'preferences' | 'duplicates';

export interface SystemSettingsProps {
  settings: SettingsData | null;
  onSaveSettings: (newSettings: SettingsData) => Promise<boolean>;
  onPickFolder?: (title?: string) => Promise<string>;
  isRunning?: boolean;
  isPaused?: boolean;
  currentTask?: string | null;
  onStartSync: (force: boolean) => void;
  onPauseSync: () => void;
  onResumeSync: () => void;
  onStopSync: () => void;
  onStartSingleAnalysis: (path: string) => void;
  onPickSingleFile?: () => Promise<string>;
  pickerPending?: boolean;
  uiSettings?: UISettings;
  onSaveUiSettings?: (settings: UISettings) => void;
  initialTab?: SettingsTab;
  onTabChange?: (tab: SettingsTab) => void;
  onRefreshMedia?: () => Promise<void> | void;
  onRescanSeries?: () => Promise<void> | void;
  scanProgress?: any;
  onNavigateToTreeSettings?: () => void;
}

const formatBytes = (bytes?: number): string => {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
};

export default function SystemSettings({
  settings,
  onSaveSettings,
  isRunning = false,
  isPaused = false,
  pickerPending = false,
  uiSettings = { maxImagesPerRow: 10, maxRows: 1, maxWidth: 1600, galleryMaxRows: 10 },
  onSaveUiSettings,
  initialTab = 'paths',
  onTabChange,
  onRefreshMedia,
  onRescanSeries,
  scanProgress,
  onNavigateToTreeSettings,
}: SystemSettingsProps) {
  const { language, setLanguage, t } = useLanguage();
  const {
    themeId,
    themeMode,
    presets,
    customThemes,
    setThemeId,
    saveCustomTheme,
    deleteCustomTheme,
    toggleThemeMode,
  } = useTheme();

  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  const [formData, setFormData] = useState<SettingsData>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Directory Browser Modal state
  const [browserModal, setBrowserModal] = useState<{
    isOpen: boolean;
    title: string;
    initialPath: string;
    mode: 'folder' | 'file';
    targetType: 'input' | 'output' | 'singleFile';
    inputIndex?: number;
  }>({
    isOpen: false,
    title: '',
    initialPath: '',
    mode: 'folder',
    targetType: 'input',
  });

  // Folders reindex & series rescan states
  const [isReindexing, setIsReindexing] = useState(false);
  const [isRescanningSeries, setIsRescanningSeries] = useState(false);
  const [reindexMessage, setReindexMessage] = useState<string | null>(null);

  const handleReindexFolders = async () => {
    setIsReindexing(true);
    setReindexMessage(null);
    try {
      const res = await fetch('/api/media/files?refresh=true&limit=50');
      if (res.ok) {
        setReindexMessage(t('reindexingSuccess'));
        if (onRefreshMedia) {
          await onRefreshMedia();
        }
      } else {
        setReindexMessage('Failed to trigger folder reindex.');
      }
    } catch (err: any) {
      setReindexMessage(`Error: ${err.message}`);
    } finally {
      setIsReindexing(false);
    }
  };

  const handleRescanSeries = async () => {
    setIsRescanningSeries(true);
    setReindexMessage(null);
    try {
      if (onRescanSeries) {
        await onRescanSeries();
      } else if (onRefreshMedia) {
        await onRefreshMedia();
      }
      setReindexMessage(t('rescanSeriesSuccess'));
    } catch (err: any) {
      setReindexMessage(`Error: ${err.message}`);
    } finally {
      setIsRescanningSeries(false);
    }
  };

  // UI preferences local state
  const [localUiSettings, setLocalUiSettings] = useState<UISettings>(uiSettings);

  // Duplicate & Similarity configuration state
  const [dupConfig, setDupConfig] = useState<{
    default_engine: 'auto' | 'cpu' | 'gpu';
    similarity_threshold: number;
    burst_window_seconds: number;
    default_keep_strategy: string;
    target_move_folder: string;
    auto_scan_on_sync: boolean;
  }>({
    default_engine: 'auto',
    similarity_threshold: 0.90,
    burst_window_seconds: 3.0,
    default_keep_strategy: 'highest_resolution',
    target_move_folder: '',
    auto_scan_on_sync: false,
  });

  useEffect(() => {
    fetch('/api/duplicates/config')
      .then((res) => res.json())
      .then((data) => {
        if (data) {
          setDupConfig({
            default_engine: data.default_engine || 'auto',
            similarity_threshold: data.similarity_threshold || 0.85,
            burst_window_seconds: data.burst_window_seconds || 3.0,
            default_keep_strategy: data.default_keep_strategy || 'highest_resolution',
            target_move_folder: data.target_move_folder || '',
            auto_scan_on_sync: Boolean(data.auto_scan_on_sync),
          });
        }
      })
      .catch(() => {});
  }, []);

  // LM Studio Local models state for input autocomplete
  const [localModels, setLocalModels] = useState<Array<{ id: string; name: string; isVision: boolean; isLoaded: boolean }>>([]);
  useEffect(() => {
    fetch('/api/models/local')
      .then((res) => res.json())
      .then((data) => {
        if (data && Array.isArray(data.models)) {
          setLocalModels(data.models);
        }
      })
      .catch(() => {});
  }, []);

  // Connection validation state
  const [validatingConnection, setValidatingConnection] = useState(false);
  const [connectionResult, setConnectionResult] = useState<{ connected?: boolean; message?: string } | null>(null);

  // Custom theme builder form state
  const [customName, setCustomName] = useState('My Custom Theme');
  const [customMode, setCustomMode] = useState<ThemeMode>('dark');
  const [customBg, setCustomBg] = useState('#0d1117');
  const [customCard, setCustomCard] = useState('#161b22');
  const [customPrimary, setCustomPrimary] = useState('#58a6ff');
  const [customAccent, setCustomAccent] = useState('#bc8cff');
  const [customText, setCustomText] = useState('#c9d1d9');
  const [customSavedMsg, setCustomSavedMsg] = useState('');

  // Caching Strategy state
  const [cacheStatus, setCacheStatus] = useState<any>(null);
  const [cacheSelectedFolder, setCacheSelectedFolder] = useState<string>('');
  const [isRecaching, setIsRecaching] = useState<boolean>(false);
  const [isPruningFolders, setIsPruningFolders] = useState<boolean>(false);
  const [isResettingAll, setIsResettingAll] = useState<boolean>(false);
  const [isSavingCacheStrategy, setIsSavingCacheStrategy] = useState<boolean>(false);
  const [cacheFeedback, setCacheFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [dailyAutomationEnabled, setDailyAutomationEnabled] = useState<boolean>(true);
  const [dailyScheduleTime, setDailyScheduleTime] = useState<string>('03:00');
  const [incrementalOnly, setIncrementalOnly] = useState<boolean>(true);

  const loadCacheStatus = useCallback(async () => {
    try {
      const data = await mediaCacheService.getCacheStatus();
      setCacheStatus(data);
      if (data) {
        setDailyAutomationEnabled(data.daily_automation_enabled ?? true);
        setDailyScheduleTime(data.daily_schedule_time || '03:00');
        setIncrementalOnly(data.incremental_only ?? true);
      }
    } catch (e) {
      console.warn('Failed loading cache status:', e);
    }
  }, []);

  useEffect(() => {
    loadCacheStatus();
  }, [loadCacheStatus]);

  const handleRecache = async (folder?: string) => {
    setIsRecaching(true);
    setCacheFeedback(null);
    try {
      const target = folder !== undefined ? folder : cacheSelectedFolder;
      await mediaCacheService.recache({
        folder: target ? target : undefined,
        incremental: incrementalOnly,
      });
      setCacheFeedback({ type: 'success', message: t('cacheRecacheSuccess' as any) || 'Cache refreshed successfully.' });
      await loadCacheStatus();
      onRefreshMedia?.();
      setTimeout(() => setCacheFeedback(null), 4000);
    } catch (err: any) {
      setCacheFeedback({ type: 'error', message: err.message || 'Recache failed' });
    } finally {
      setIsRecaching(false);
    }
  };

  const handlePruneDisconnectedFolders = async () => {
    setIsPruningFolders(true);
    setCacheFeedback(null);
    try {
      const res = await fetch('/api/media/cache/prune-folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || (t('pruneFoldersError' as any) || 'Failed pruning folders'));
      }

      // Prune client IndexedDB cache
      if (data.removed_folders && data.removed_folders.length > 0) {
        await mediaCacheService.removeFolders(data.removed_folders);
      }
      const currentConfigured = (formData.input_folders || []).filter(Boolean);
      const allCached = mediaCacheService.getAll();
      const normConfigured = currentConfigured.map((f) => f.replace(/\\/g, '/').toLowerCase().replace(/\/+$/, ''));
      const orphanedKeys = allCached
        .filter((it) => {
          const itPath = (it.file_path || '').replace(/\\/g, '/').toLowerCase();
          const itFolder = (it.folder || '').replace(/\\/g, '/').toLowerCase().replace(/\/+$/, '');
          return !normConfigured.some((cf) => itPath.startsWith(cf + '/') || itFolder === cf || itFolder.startsWith(cf + '/'));
        })
        .map((it) => it.file_path || it.filename);

      if (orphanedKeys.length > 0) {
        await mediaCacheService.removeFiles(orphanedKeys);
      }

      const countMsg = data.deleted_files_count !== undefined ? ` (${data.deleted_files_count} files)` : '';
      setCacheFeedback({
        type: 'success',
        message: `${t('pruneFoldersSuccess' as any) || 'Disconnected folders cache pruned successfully'}${countMsg}`,
      });
      await loadCacheStatus();
      onRefreshMedia?.();
      setTimeout(() => setCacheFeedback(null), 5000);
    } catch (err: any) {
      setCacheFeedback({ type: 'error', message: err.message || (t('pruneFoldersError' as any) || 'Pruning failed') });
    } finally {
      setIsPruningFolders(false);
    }
  };

  const handleResetAllData = async () => {
    const confirmed = window.confirm(
      t('confirmResetAllData' as any) ||
        'Are you sure you want to reset all data and cache? All indexed media records, metadata, faces, sync history, and cached thumbnails will be permanently wiped (clean slate installation). Your original media files will NOT be deleted.'
    );
    if (!confirmed) return;

    setIsResettingAll(true);
    setCacheFeedback(null);
    try {
      const res = await fetch('/api/media/cache/reset-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || (t('resetAllDataError' as any) || 'Reset failed'));
      }

      // Completely clear client-side IndexedDB cache
      await mediaCacheService.clear();

      setCacheFeedback({
        type: 'success',
        message: t('resetAllDataSuccess' as any) || 'All catalog data, thumbnails, and cache successfully reset.',
      });
      await loadCacheStatus();
      onRefreshMedia?.();
      setTimeout(() => setCacheFeedback(null), 5000);
    } catch (err: any) {
      setCacheFeedback({ type: 'error', message: err.message || (t('resetAllDataError' as any) || 'Reset failed') });
    } finally {
      setIsResettingAll(false);
    }
  };

  const handleSaveCacheStrategy = async () => {
    setIsSavingCacheStrategy(true);
    setCacheFeedback(null);
    try {
      const updated = await mediaCacheService.saveCacheStrategy({
        daily_automation_enabled: dailyAutomationEnabled,
        daily_schedule_time: dailyScheduleTime,
        incremental_only: incrementalOnly,
      });
      setCacheStatus(updated);
      setCacheFeedback({ type: 'success', message: t('cacheSaveStrategySuccess' as any) || 'Caching strategy saved successfully.' });
      setTimeout(() => setCacheFeedback(null), 4000);
    } catch (err: any) {
      setCacheFeedback({ type: 'error', message: err.message || 'Failed saving strategy' });
    } finally {
      setIsSavingCacheStrategy(false);
    }
  };

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const handleSelectTab = (tab: SettingsTab) => {
    setActiveTab(tab);
    if (onTabChange) {
      onTabChange(tab);
    }
  };

  const handleGoToTreeSettings = () => {
    setTreeStore({ activeSubTab: 'settings' });
    if (onNavigateToTreeSettings) {
      onNavigateToTreeSettings();
    }
  };

  useEffect(() => {
    if (settings) {
      setFormData({
        input_folders: settings.input_folders ? [...settings.input_folders] : [],
        output_folder: settings.output_folder || '',
        model_provider: settings.model_provider || 'gemini',
        gemini_model: settings.gemini_model || 'gemini-3.6-flash',
        gemini_api_key: settings.gemini_api_key || '',
        is_gemini_api_key_set: settings.is_gemini_api_key_set,
        local_model_name: settings.local_model_name || '',
        gemini_max_workers: settings.gemini_max_workers || 3,
        local_max_workers: settings.local_max_workers || 2,
        whisper_model: settings.whisper_model || 'large-v3-turbo',
        preserve_structure: settings.preserve_structure !== undefined ? settings.preserve_structure : true,
        vision_prompt_template: settings.vision_prompt_template || '',
        default_vision_prompt_template: settings.default_vision_prompt_template || '',
      });
    }
  }, [settings]);

  useEffect(() => {
    setLocalUiSettings(uiSettings);
  }, [uiSettings]);

  const handleInputChange = (field: keyof SettingsData, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleAddFolder = () => {
    setFormData((prev) => ({
      ...prev,
      input_folders: [...(prev.input_folders || []), ''],
    }));
  };

  const handleFolderChange = (index: number, value: string) => {
    setFormData((prev) => {
      const updated = [...(prev.input_folders || [])];
      updated[index] = value;
      return { ...prev, input_folders: updated };
    });
  };

  const handleRemoveFolder = (index: number) => {
    setFormData((prev) => {
      const updated = [...(prev.input_folders || [])];
      updated.splice(index, 1);
      return { ...prev, input_folders: updated };
    });
  };

  const handlePickInputFolder = (index: number) => {
    const currentVal = formData.input_folders?.[index] || '';
    setBrowserModal({
      isOpen: true,
      title: t('browserTitle'),
      initialPath: currentVal,
      mode: 'folder',
      targetType: 'input',
      inputIndex: index,
    });
  };

  const handlePickOutputFolder = () => {
    setBrowserModal({
      isOpen: true,
      title: t('outputFolder'),
      initialPath: formData.output_folder || '',
      mode: 'folder',
      targetType: 'output',
    });
  };

  const handleBrowserSelect = (selectedPath: string) => {
    if (!selectedPath) return;
    if (browserModal.targetType === 'input' && browserModal.inputIndex !== undefined) {
      handleFolderChange(browserModal.inputIndex, selectedPath);
    } else if (browserModal.targetType === 'output') {
      handleInputChange('output_folder', selectedPath);
    }
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSaving(true);
    setSaveStatus(null);

    const cleanedFolders = (formData.input_folders || [])
      .map((f) => f.trim())
      .filter((f) => f.length > 0);

    const payload: SettingsData = {
      ...formData,
      input_folders: cleanedFolders,
      output_folder: formData.output_folder ? formData.output_folder.trim() : '',
    };

    try {
      const success = await onSaveSettings(payload);

      if (onSaveUiSettings) {
        onSaveUiSettings(localUiSettings);
      }

      // Save duplicate configuration
      try {
        await fetch('/api/duplicates/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dupConfig),
        });
      } catch {}

      if (success) {
        // Recalculate client cache for removed folders
        const prevFolders = settings?.input_folders || [];
        const normCleaned = new Set(cleanedFolders.map((p) => p.toLowerCase().replace(/\\/g, '/')));
        const removed = prevFolders.filter((p) => !normCleaned.has(p.toLowerCase().replace(/\\/g, '/')));
        if (removed.length > 0) {
          await mediaCacheService.removeFolders(removed);
          onRefreshMedia?.();
        }

        setSaveStatus({ type: 'success', message: t('settingsSavedSuccess') });
        setTimeout(() => setSaveStatus(null), 4000);
      } else {
        setSaveStatus({ type: 'error', message: 'Failed to update settings.' });
      }
    } catch (err: any) {
      setSaveStatus({ type: 'error', message: err.message || 'Error saving settings' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetDefaults = () => {
    if (window.confirm(t('promptResetSettingsConfirm'))) {
      setFormData({
        input_folders: [],
        output_folder: '',
        model_provider: 'gemini',
        gemini_model: 'gemini-1.5-flash',
        local_model_name: '',
        whisper_model: 'base',
        preserve_structure: true,
      });
      setLocalUiSettings({
        maxImagesPerRow: 10,
        maxRows: 1,
        maxWidth: 1600,
        galleryMaxRows: 10,
      });
      setThemeId('dark');
    }
  };

  const handleSaveCustomTheme = () => {
    saveCustomTheme({
      name: customName,
      mode: customMode,
      bgColor: customBg,
      cardBgSolid: customCard,
      primaryColor: customPrimary,
      accentColor: customAccent,
      textColor: customText,
    });
    setCustomSavedMsg(t('customThemeCreated'));
    setTimeout(() => setCustomSavedMsg(''), 3500);
  };

  const handleDeleteCustomTheme = (id: string, name: string) => {
    if (window.confirm(`${t('confirmDeleteTheme')} (${name})`)) {
      deleteCustomTheme(id);
    }
  };

  const disabled = isRunning || isPaused || pickerPending;

  const handleValidateConnection = async () => {
    setValidatingConnection(true);
    setConnectionResult(null);
    try {
      const startTime = Date.now();
      let res = await fetch('/api/validate-connection');
      if (res.status === 404) {
        // Graceful fallback to /api/status for running instances
        res = await fetch('/api/status');
      }
      if (res.ok) {
        const data = await res.json();
        const latencyMs = Date.now() - startTime;
        const isConnected = data.connected !== undefined 
          ? Boolean(data.connected) 
          : (data.status !== undefined && data.status !== 'offline');
        setConnectionResult({
          connected: isConnected,
          message: data.message || (isConnected ? `Connected to media_cataloger (${latencyMs}ms)` : 'Cataloger service offline or unreachable'),
        });
      } else {
        setConnectionResult({
          connected: false,
          message: `Server returned HTTP ${res.status}`,
        });
      }
    } catch (err: any) {
      setConnectionResult({
        connected: false,
        message: `Network error: ${err.message}`,
      });
    } finally {
      setValidatingConnection(false);
    }
  };

  const allPresets = [...presets, ...customThemes];

  return (
    <div className="system-settings-container" id="system-settings-page">

      {/* Save feedback banner */}
      {saveStatus && (
        <div className={`settings-alert-banner ${saveStatus.type}`}>
          <span>{saveStatus.type === 'success' ? '✅' : '❌'}</span>
          <span>{saveStatus.message}</span>
        </div>
      )}

      {/* Settings Navigation Subtabs */}
      <nav className="system-settings-tabs-nav" aria-label="System Settings Tabs">
        <button
          type="button"
          className={`settings-nav-btn ${activeTab === 'paths' ? 'active' : ''}`}
          onClick={() => handleSelectTab('paths')}
          id="tab-settings-paths"
        >
          <span>📁</span>
          <span>{t('tabPaths')}</span>
          {Boolean(settings?.is_custom_input || settings?.is_custom_output) && (
            <span className="badge-pill badge-pill-accent" style={{ marginLeft: '4px', fontSize: '0.65rem' }}>
              {t('badgeCustomPath')}
            </span>
          )}
        </button>
        <button
          type="button"
          className={`settings-nav-btn ${activeTab === 'models' ? 'active' : ''}`}
          onClick={() => handleSelectTab('models')}
          id="tab-settings-models"
        >
          <span>🤖</span>
          <span>{t('tabModels')}</span>
        </button>
        <button
          type="button"
          className={`settings-nav-btn ${activeTab === 'appearance' ? 'active' : ''}`}
          onClick={() => handleSelectTab('appearance')}
          id="tab-settings-appearance"
        >
          <span>🎨</span>
          <span>{t('tabAppearance')}</span>
        </button>
        <button
          type="button"
          className={`settings-nav-btn ${activeTab === 'preferences' ? 'active' : ''}`}
          onClick={() => handleSelectTab('preferences')}
          id="tab-settings-preferences"
        >
          <span>🖼️</span>
          <span>{t('tabPreferences')}</span>
        </button>
        <button
          type="button"
          className={`settings-nav-btn ${activeTab === 'duplicates' ? 'active' : ''}`}
          onClick={() => handleSelectTab('duplicates')}
          id="tab-settings-duplicates"
        >
          <span>🗂️</span>
          <span>{t('tabDuplicates' as any) || 'Duplicates & Similarity'}</span>
        </button>
        <button
          type="button"
          className="settings-nav-btn settings-nav-link"
          onClick={handleGoToTreeSettings}
          id="tab-settings-tree"
          title={t('tabTreeSettings')}
          aria-label={t('tabTreeSettings')}
        >
          <span>🌳</span>
          <span>{t('tabTreeSettings')}</span>
          <span className="settings-nav-external-icon" aria-hidden="true">↗</span>
        </button>
      </nav>

      {/* Form Content */}
      <form onSubmit={handleSave}>
        {/* Tab 1: File Metadata Operations / Execution Redirect */}
        {activeTab === 'execution' && (
          <div className="settings-section-card" id="settings-pane-execution">
            <div className="settings-card-header">
              <h3>⚡ {t('tabFileMetadataOperations' as any) || t('tabExecution')}</h3>
            </div>
            <div className="form-group" style={{ padding: '1.5rem', textAlign: 'center' }}>
              <p style={{ fontSize: '1rem', marginBottom: '1.25rem', color: 'var(--text-primary)' }}>
                Pipeline execution, modular AI controls, and single file analysis have been unified into the central <strong>Media Recognition</strong> hub.
              </p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => handleSelectTab('paths')}
              >
                📁 Open Storage Paths
              </button>
            </div>
          </div>
        )}

        {/* Tab 2: Folders & Paths */}
        {activeTab === 'paths' && (
          <div className="settings-section-card" id="settings-pane-paths">
            <div className="settings-card-header">
              <h3>📁 {t('tabPaths')}</h3>
            </div>

            {/* Input Folders */}
            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                <label style={{ margin: 0 }}>
                  {t('inputFolders')}
                  {settings?.is_custom_input ? (
                    <span className="badge-custom" style={{ marginLeft: '8px' }}>
                      {t('badgeCustomPath')}
                    </span>
                  ) : (
                    <span className="badge-default" style={{ marginLeft: '8px' }}>
                      {t('badgeDefaultPath')}
                    </span>
                  )}
                </label>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: '0.4rem 0.85rem', fontSize: '0.85rem' }}
                  onClick={handleAddFolder}
                >
                  + {t('btnAddFolder')}
                </button>
              </div>
              <p className="description">{t('inputFoldersDesc')}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginTop: '0.5rem' }}>
                {(formData.input_folders || []).map((folder, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: '0.5rem' }}>
                    <input
                      type="text"
                      className="input-control"
                      value={folder}
                      onChange={(e) => handleFolderChange(idx, e.target.value)}
                      placeholder="e.g. C:\Users\Media\Pictures"
                    />
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ padding: '0.5rem 0.85rem' }}
                      title={t('btnBrowse')}
                      onClick={() => handlePickInputFolder(idx)}
                      disabled={pickerPending}
                    >
                      📂
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger"
                      style={{ padding: '0.5rem 0.85rem' }}
                      onClick={() => handleRemoveFolder(idx)}
                      title={t('delete')}
                    >
                      ✕
                    </button>
                  </div>
                ))}
                {(!formData.input_folders || formData.input_folders.length === 0) && (
                  <div style={{ fontStyle: 'italic', color: 'var(--text-muted)', fontSize: '0.9rem', padding: '0.5rem 0' }}>
                    {t('default')}: (defined in .env / INPUT_FOLDERS)
                  </div>
                )}
              </div>
            </div>

            {/* Output Folder */}
            <div className="form-group" style={{ marginTop: '1rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem' }}>
              <label>
                {t('outputFolder')}
                {settings?.is_custom_output ? (
                  <span className="badge-custom" style={{ marginLeft: '8px' }}>
                    {t('badgeCustomPath')}
                  </span>
                ) : (
                  <span className="badge-default" style={{ marginLeft: '8px' }}>
                    {t('badgeDefaultPath')}
                  </span>
                )}
              </label>
              <p className="description">{t('outputFolderDesc')}</p>
              <div style={{ display: 'flex', gap: '0.5rem', maxWidth: '650px' }}>
                <input
                  type="text"
                  className="input-control"
                  value={formData.output_folder || ''}
                  onChange={(e) => handleInputChange('output_folder', e.target.value)}
                  placeholder={settings?.default_output_folder || 'e.g. ./output'}
                />
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: '0.5rem 0.85rem' }}
                  title={t('btnBrowse')}
                  onClick={handlePickOutputFolder}
                  disabled={pickerPending}
                >
                  📂
                </button>
              </div>
            </div>

            {/* Preserve Structure */}
            <div className="form-group" style={{ marginTop: '0.75rem' }}>
              <label className="checkbox-group">
                <input
                  type="checkbox"
                  checked={formData.preserve_structure}
                  onChange={(e) => handleInputChange('preserve_structure', e.target.checked)}
                />
                {t('preserveStructure')}
              </label>
            </div>

            {/* Indexing & Series Management Action Card */}
            <div
              className="card"
              style={{
                marginTop: '1.5rem',
                borderTop: '1px solid var(--border-color)',
                paddingTop: '1.25rem',
                background: 'rgba(0, 0, 0, 0.2)',
                borderRadius: '12px',
                padding: '1.25rem',
                border: '1px solid var(--border-color)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '1.2rem' }}>⚡</span>
                <strong style={{ fontSize: '1rem' }}>{t('indexingAndSeriesActions')}</strong>
              </div>
              <p className="description" style={{ marginBottom: '1rem' }}>
                {t('indexingAndSeriesDesc')}
              </p>

              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={isReindexing || scanProgress?.is_scanning}
                  onClick={handleReindexFolders}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <span>{isReindexing || scanProgress?.is_scanning ? '⏳' : '🔄'}</span>
                  <span>{isReindexing || scanProgress?.is_scanning ? t('reindexingInProgress') : t('reindexFolders')}</span>
                </button>

                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={isRescanningSeries}
                  onClick={handleRescanSeries}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <span>{isRescanningSeries ? '⏳' : '🗂️'}</span>
                  <span>{isRescanningSeries ? t('rescanningInProgress') : t('rescanSeries')}</span>
                </button>
              </div>

              {(reindexMessage || scanProgress?.is_scanning) && (
                <div style={{ marginTop: '0.85rem', fontSize: '0.85rem', color: 'var(--accent-color)' }}>
                  {scanProgress?.is_scanning
                    ? `Indexing: ${scanProgress.current_filename || scanProgress.current_file || 'reading folders...'} (${scanProgress.scanned_count || 0} files)`
                    : reindexMessage}
                </div>
              )}
            </div>

            {/* Cache & Database Maintenance Action Card */}
            <div
              className="card"
              style={{
                marginTop: '1.25rem',
                background: 'rgba(0, 0, 0, 0.22)',
                borderRadius: '12px',
                padding: '1.25rem',
                border: '1px solid var(--border-color)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '1.2rem' }}>🧹</span>
                <strong style={{ fontSize: '1rem' }}>{t('cacheMaintenanceTitle' as any) || 'Cache & Database Maintenance'}</strong>
              </div>
              <p className="description" style={{ marginBottom: '1rem' }}>
                {t('cacheMaintenanceDesc' as any) ||
                  'Prune cached items and thumbnails belonging to disconnected/removed folders, or completely wipe catalog data for a clean slate.'}
              </p>

              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={isPruningFolders || isResettingAll}
                  onClick={handlePruneDisconnectedFolders}
                  id="btn-prune-disconnected-folders-paths"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <span>{isPruningFolders ? '⏳' : '🧹'}</span>
                  <span>{isPruningFolders ? (t('btnPruningFolders' as any) || 'Pruning...') : (t('btnPruneFoldersCache' as any) || 'Prune Disconnected Folders')}</span>
                </button>

                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={isPruningFolders || isResettingAll}
                  onClick={handleResetAllData}
                  id="btn-reset-all-data-paths"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <span>{isResettingAll ? '⏳' : '⚠️'}</span>
                  <span>{isResettingAll ? (t('btnResettingAllData' as any) || 'Resetting...') : (t('btnResetAllData' as any) || 'Reset All Data (Clean Slate)')}</span>
                </button>
              </div>

              {cacheFeedback && (
                <div
                  style={{
                    marginTop: '0.85rem',
                    padding: '0.6rem 0.85rem',
                    borderRadius: '8px',
                    fontSize: '0.85rem',
                    background: cacheFeedback.type === 'success' ? 'rgba(46, 125, 50, 0.2)' : 'rgba(211, 47, 47, 0.2)',
                    color: cacheFeedback.type === 'success' ? '#81c784' : '#e57373',
                    border: `1px solid ${cacheFeedback.type === 'success' ? '#2e7d32' : '#d32f2f'}`,
                  }}
                >
                  {cacheFeedback.message}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 3: AI & Models */}
        {activeTab === 'models' && (
          <div className="settings-section-card" id="settings-pane-models">
            <div className="settings-card-header">
              <h3>🤖 {t('tabModels')}</h3>
            </div>

            {/* AI Engine Connection & Status */}
            <div
              className="card"
              style={{
                background: 'rgba(0, 0, 0, 0.25)',
                border: '1px solid var(--border-color)',
                padding: '1rem 1.25rem',
                borderRadius: '12px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '1.25rem' }}>🔗</span>
                  <strong style={{ fontSize: '1rem' }}>AI Engine Service Connection</strong>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleValidateConnection}
                  disabled={validatingConnection}
                  style={{ padding: '0.4rem 0.95rem', fontSize: '0.85rem' }}
                >
                  {validatingConnection ? '⏳ Testing...' : '⚡ Test Connection'}
                </button>
              </div>
              <p className="description" style={{ margin: '0 0 0.75rem 0', fontSize: '0.85rem' }}>
                The Python <code>media_cataloger</code> engine executes AI pipelines, InsightFace embeddings, and vision processing.
              </p>
              {connectionResult && (
                <div
                  style={{
                    padding: '0.6rem 0.9rem',
                    borderRadius: '8px',
                    fontSize: '0.88rem',
                    backgroundColor: connectionResult.connected ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                    border: `1px solid ${connectionResult.connected ? '#22c55e' : '#ef4444'}`,
                    color: connectionResult.connected ? '#4ade80' : '#f87171',
                  }}
                >
                  {connectionResult.connected ? '✅' : '❌'} {connectionResult.message}
                </div>
              )}
            </div>

            <div className="settings-grid-two-cols" style={{ marginTop: '0.5rem' }}>
              {/* Model Provider */}
              <div className="form-group">
                <label>{t('modelProvider')}</label>
                <select
                  className="input-control"
                  value={formData.model_provider}
                  onChange={(e) => handleInputChange('model_provider', e.target.value)}
                >
                  <option value="gemini">Gemini API (Cloud AI)</option>
                  <option value="local">LM Studio / Local LLM (Local AI)</option>
                  <option value="hybrid">Hybrid (Gemini with Local Fallback)</option>
                </select>
              </div>

              {/* Gemini Model & Backend API Key */}
              {(formData.model_provider === 'gemini' || formData.model_provider === 'hybrid') && (
                <>
                  <div className="form-group">
                    <label>{t('geminiModel')}</label>
                    <select
                      className="input-control"
                      value={formData.gemini_model}
                      onChange={(e) => handleInputChange('gemini_model', e.target.value)}
                    >
                      <option value="gemini-3.6-flash">gemini-3.6-flash (Fast & Recommended)</option>
                      <option value="gemini-2.5-flash">gemini-2.5-flash (Balanced)</option>
                      <option value="gemini-2.5-pro">gemini-2.5-pro (High Reasoning)</option>
                      <option value="gemini-1.5-flash">gemini-1.5-flash (Legacy Fast)</option>
                      <option value="gemini-1.5-pro">gemini-1.5-pro (Legacy Precision)</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>Google Gemini API Key</span>
                      {formData.is_gemini_api_key_set && (
                        <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 600 }}>
                          ✓ Backend Configured
                        </span>
                      )}
                    </label>
                    <input
                      type="password"
                      className="input-control"
                      value={formData.gemini_api_key || ''}
                      onChange={(e) => handleInputChange('gemini_api_key', e.target.value)}
                      placeholder={formData.is_gemini_api_key_set ? '•••••••••••••••••••• (Configured on backend)' : 'Enter Gemini API key (AQ...)'}
                      autoComplete="off"
                    />
                  </div>
                </>
              )}

              {/* Local Model Name */}
              {(formData.model_provider === 'local' || formData.model_provider === 'hybrid') && (
                <div className="form-group">
                  <label>{t('localModelName')}</label>
                  <input
                    type="text"
                    list="lm-studio-models-list"
                    className="input-control"
                    value={formData.local_model_name || ''}
                    onChange={(e) => handleInputChange('local_model_name', e.target.value)}
                    placeholder="e.g. qwen2.5-vl-7b-instruct"
                  />
                  <datalist id="lm-studio-models-list">
                    {localModels.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.isVision ? '👁️ ' : ''}{m.name} {m.isLoaded ? '(Loaded)' : ''}
                      </option>
                    ))}
                  </datalist>
                </div>
              )}

              {/* Whisper Speech Model */}
              <div className="form-group">
                <label>{t('whisperModel')}</label>
                <select
                  className="input-control"
                  value={formData.whisper_model}
                  onChange={(e) => handleInputChange('whisper_model', e.target.value)}
                >
                  <option value="tiny">tiny (Fastest, Lower accuracy)</option>
                  <option value="base">base (Balanced & Recommended)</option>
                  <option value="small">small (High accuracy)</option>
                  <option value="medium">medium (Very high accuracy)</option>
                  <option value="large-v3-turbo">large-v3-turbo (State of the art)</option>
                </select>
              </div>
            </div>

            {/* Parallel Worker Queue Section */}
            <div className="form-group" style={{ marginTop: '1rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem' }}>
              <label style={{ fontSize: '1.05rem', fontWeight: 600 }}>⚡ Parallel Processing & Worker Queue</label>
              <p className="description" style={{ marginBottom: '1rem' }}>
                Configure how many media files are analyzed simultaneously in the background worker queue.
              </p>

              <div className="settings-grid-two-cols">
                {/* Gemini Parallel Workers */}
                <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                  <label style={{ fontSize: '0.9rem', fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>
                    Gemini API Parallel Workers: <span style={{ color: 'var(--primary-color)' }}>{formData.gemini_max_workers || 3}</span>
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="15"
                    step="1"
                    value={formData.gemini_max_workers || 3}
                    onChange={(e) => handleInputChange('gemini_max_workers', parseInt(e.target.value, 10))}
                    style={{ width: '100%', accentColor: 'var(--primary-color)' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                    <span>1 (Sequential)</span>
                    <span>3 (Recommended)</span>
                    <span>15 (Max)</span>
                  </div>
                </div>

                {/* Local Model Parallel Workers */}
                <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                  <label style={{ fontSize: '0.9rem', fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>
                    Local Model Parallel Workers: <span style={{ color: 'var(--accent-color)' }}>{formData.local_max_workers || 2}</span>
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="8"
                    step="1"
                    value={formData.local_max_workers || 2}
                    onChange={(e) => handleInputChange('local_max_workers', parseInt(e.target.value, 10))}
                    style={{ width: '100%', accentColor: 'var(--accent-color)' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                    <span>1 (Single)</span>
                    <span>2 (Recommended)</span>
                    <span>8 (High VRAM)</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Vision Prompt Template Section */}
            <div className="form-group" style={{ marginTop: '1.25rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div>
                  <label style={{ fontSize: '1.05rem', fontWeight: 600, display: 'block', marginBottom: '0.2rem' }}>
                    📝 {t('visionPromptTemplateLabel' as any) || 'Vision Prompt Template'}
                  </label>
                  <p className="description" style={{ margin: 0, fontSize: '0.85rem' }}>
                    {t('visionPromptTemplateDesc' as any) || 'Customize prompt template used for AI photo/video analysis.'}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ fontSize: '0.82rem', padding: '0.35rem 0.75rem' }}
                  onClick={() => {
                    handleInputChange('vision_prompt_template', formData.default_vision_prompt_template || '');
                  }}
                  title="Reset prompt template to system default"
                >
                  {t('btnResetPromptTemplate' as any) || '↺ Reset to Default'}
                </button>
              </div>

              {/* Placeholders Cheat Sheet */}
              <div
                style={{
                  background: 'rgba(0, 0, 0, 0.25)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  padding: '0.65rem 0.85rem',
                  marginBottom: '0.75rem',
                  fontSize: '0.82rem',
                }}
              >
                <span style={{ fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.4rem' }}>
                  💡 {t('placeholdersCheatSheet' as any) || 'Available Dynamic Placeholders'}:
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <span
                    className="badge-pill"
                    style={{ cursor: 'pointer', fontFamily: 'monospace', background: 'rgba(99, 102, 241, 0.15)', border: '1px solid rgba(99, 102, 241, 0.4)', color: '#818cf8' }}
                    onClick={() => {
                      const current = formData.vision_prompt_template || '';
                      if (!current.includes('{media_type}')) {
                        handleInputChange('vision_prompt_template', current + '\n{media_type}');
                      }
                    }}
                    title={t('placeholderMediaTypeDesc' as any) || 'Type of media: "photo" or "video"'}
                  >
                    {'{media_type}'} — {t('placeholderMediaTypeDesc' as any) || '"photo" / "video"'}
                  </span>
                  <span
                    className="badge-pill"
                    style={{ cursor: 'pointer', fontFamily: 'monospace', background: 'rgba(34, 197, 94, 0.15)', border: '1px solid rgba(34, 197, 94, 0.4)', color: '#4ade80' }}
                    onClick={() => {
                      const current = formData.vision_prompt_template || '';
                      if (!current.includes('{people}')) {
                        handleInputChange('vision_prompt_template', current + '\n{people}');
                      }
                    }}
                    title={t('placeholderPeopleDesc' as any) || 'Names and bounding boxes of recognized people [x1, y1, x2, y2]'}
                  >
                    {'{people}'} — {t('placeholderPeopleDesc' as any) || 'Recognized people list'}
                  </span>
                  <span
                    className="badge-pill"
                    style={{ cursor: 'pointer', fontFamily: 'monospace', background: 'rgba(234, 179, 8, 0.15)', border: '1px solid rgba(234, 179, 8, 0.4)', color: '#facc15' }}
                    onClick={() => {
                      const current = formData.vision_prompt_template || '';
                      if (!current.includes('{context}')) {
                        handleInputChange('vision_prompt_template', current + '\n{context}');
                      }
                    }}
                    title={t('placeholderContextDesc' as any) || 'Metadata, EXIF, audio transcription context'}
                  >
                    {'{context}'} — {t('placeholderContextDesc' as any) || 'Metadata & EXIF context'}
                  </span>
                  <span
                    className="badge-pill"
                    style={{ cursor: 'pointer', fontFamily: 'monospace', background: 'rgba(168, 85, 247, 0.15)', border: '1px solid rgba(168, 85, 247, 0.4)', color: '#c084fc' }}
                    onClick={() => {
                      const current = formData.vision_prompt_template || '';
                      if (!current.includes('{tag_instructions}')) {
                        handleInputChange('vision_prompt_template', current + '\n{tag_instructions}');
                      }
                    }}
                    title={t('placeholderTagInstructionsDesc' as any) || 'Tag formatting rules and category taxonomy instructions'}
                  >
                    {'{tag_instructions}'} — {t('placeholderTagInstructionsDesc' as any) || 'Tag instructions'}
                  </span>
                </div>
              </div>

              <textarea
                className="input-control"
                rows={6}
                style={{
                  fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                  fontSize: '0.85rem',
                  lineHeight: '1.45',
                  width: '100%',
                  boxSizing: 'border-box',
                  resize: 'vertical',
                }}
                value={formData.vision_prompt_template || ''}
                onChange={(e) => handleInputChange('vision_prompt_template', e.target.value)}
                placeholder="Enter vision prompt template..."
              />
            </div>
          </div>
        )}

        {/* Tab 4: Theme & Appearance */}
        {activeTab === 'appearance' && (
          <div className="settings-section-card" id="settings-pane-appearance">
            <div className="settings-card-header">
              <h3>🎨 {t('tabAppearance')}</h3>
            </div>

            {/* Theme Mode Quick Switch */}
            <div className="form-group">
              <label>{t('themeModeLabel')}</label>
              <div className="theme-mode-toggle-group" style={{ marginTop: '0.5rem' }}>
                <button
                  type="button"
                  className={`theme-mode-btn ${themeMode === 'dark' ? 'active' : ''}`}
                  onClick={() => themeMode !== 'dark' && toggleThemeMode()}
                >
                  🌙 {t('modeDark')}
                </button>
                <button
                  type="button"
                  className={`theme-mode-btn ${themeMode === 'light' ? 'active' : ''}`}
                  onClick={() => themeMode !== 'light' && toggleThemeMode()}
                >
                  ☀️ {t('modeLight')}
                </button>
              </div>
            </div>

            {/* Presets Selection Grid */}
            <div className="form-group" style={{ marginTop: '1.25rem' }}>
              <label>{t('themePresetsLabel')}</label>
              <p className="description">{t('themePresetsDesc')}</p>
              
              <div className="theme-presets-grid" style={{ marginTop: '0.75rem' }}>
                {allPresets.map((preset) => {
                  const isSelected = preset.id === themeId;
                  const isCustom = preset.id.startsWith('custom-');
                  const name = 'nameKey' in preset ? t(preset.nameKey as any) : preset.name;

                  return (
                    <div
                      key={preset.id}
                      className={`theme-preset-card ${isSelected ? 'selected' : ''}`}
                      onClick={() => setThemeId(preset.id)}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="theme-preset-header">
                        <span className="theme-preset-icon">{preset.icon || '🎨'}</span>
                        <span className="theme-preset-name">{name}</span>
                        <span className="theme-preset-mode-badge">{preset.mode === 'dark' ? 'Dark' : 'Light'}</span>
                      </div>

                      <div className="theme-preset-swatches">
                        {preset.previewColors.map((color, idx) => (
                          <span
                            key={idx}
                            className="theme-preset-swatch-circle"
                            style={{ backgroundColor: color }}
                            title={color}
                          />
                        ))}
                      </div>

                      {isCustom && (
                        <button
                          type="button"
                          className="btn-delete-custom-preset"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteCustomTheme(preset.id, name);
                          }}
                          title={t('btnDeleteCustomTheme')}
                        >
                          ✕
                        </button>
                      )}

                      {isSelected && <div className="theme-preset-active-check">✓</div>}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Custom Theme Builder Section */}
            <div className="custom-theme-builder-section" style={{ marginTop: '1.75rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem' }}>
              <div className="settings-section-title">
                <span>🎨 {t('customThemeBuilder')}</span>
              </div>
              <p className="description">{t('customThemeBuilderDesc')}</p>

              <div className="custom-builder-grid" style={{ marginTop: '0.75rem' }}>
                <div className="form-group">
                  <label>{t('customThemeName')}</label>
                  <input
                    type="text"
                    className="input-control"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder="e.g. Cyberpunk Violet"
                  />
                </div>

                <div className="form-group">
                  <label>{t('themeModeLabel')}</label>
                  <select
                    className="input-control"
                    value={customMode}
                    onChange={(e) => {
                      const newMode = e.target.value as ThemeMode;
                      setCustomMode(newMode);
                      if (newMode === 'light') {
                        setCustomBg('#f8fafc');
                        setCustomCard('#ffffff');
                        setCustomText('#0f172a');
                      } else {
                        setCustomBg('#0d1117');
                        setCustomCard('#161b22');
                        setCustomText('#c9d1d9');
                      }
                    }}
                  >
                    <option value="dark">🌙 Dark Mode Base</option>
                    <option value="light">☀️ Light Mode Base</option>
                  </select>
                </div>
              </div>

              <div className="custom-color-pickers-row" style={{ marginTop: '1rem' }}>
                <div className="color-picker-item">
                  <label>{t('customThemeBg')}</label>
                  <div className="color-input-wrapper">
                    <input
                      type="color"
                      value={customBg}
                      onChange={(e) => setCustomBg(e.target.value)}
                      className="native-color-picker"
                    />
                    <span className="color-hex-text">{customBg}</span>
                  </div>
                </div>

                <div className="color-picker-item">
                  <label>{t('customThemeCard')}</label>
                  <div className="color-input-wrapper">
                    <input
                      type="color"
                      value={customCard}
                      onChange={(e) => setCustomCard(e.target.value)}
                      className="native-color-picker"
                    />
                    <span className="color-hex-text">{customCard}</span>
                  </div>
                </div>

                <div className="color-picker-item">
                  <label>{t('customThemePrimary')}</label>
                  <div className="color-input-wrapper">
                    <input
                      type="color"
                      value={customPrimary}
                      onChange={(e) => setCustomPrimary(e.target.value)}
                      className="native-color-picker"
                    />
                    <span className="color-hex-text">{customPrimary}</span>
                  </div>
                </div>

                <div className="color-picker-item">
                  <label>{t('customThemeAccent')}</label>
                  <div className="color-input-wrapper">
                    <input
                      type="color"
                      value={customAccent}
                      onChange={(e) => setCustomAccent(e.target.value)}
                      className="native-color-picker"
                    />
                    <span className="color-hex-text">{customAccent}</span>
                  </div>
                </div>

                <div className="color-picker-item">
                  <label>{t('customThemeText')}</label>
                  <div className="color-input-wrapper">
                    <input
                      type="color"
                      value={customText}
                      onChange={(e) => setCustomText(e.target.value)}
                      className="native-color-picker"
                    />
                    <span className="color-hex-text">{customText}</span>
                  </div>
                </div>
              </div>

              {/* Live preview mini card */}
              <div
                className="custom-theme-live-preview"
                style={{
                  backgroundColor: customBg,
                  borderColor: customPrimary,
                  color: customText,
                  marginTop: '1.25rem',
                }}
              >
                <div
                  className="preview-card"
                  style={{
                    backgroundColor: customCard,
                    borderColor: `${customPrimary}44`,
                    color: customText,
                  }}
                >
                  <span className="preview-title" style={{ color: customPrimary }}>
                    Preview: {customName || 'Custom Palette'}
                  </span>
                  <p className="preview-text" style={{ color: customText, opacity: 0.85 }}>
                    Glassmorphic dashboard surfaces and interactive components render seamlessly.
                  </p>
                  <div className="preview-buttons-row">
                    <button
                      type="button"
                      className="btn"
                      style={{
                        background: `linear-gradient(135deg, ${customPrimary} 0%, ${customAccent} 100%)`,
                        color: '#ffffff',
                        padding: '0.4rem 0.9rem',
                        fontSize: '0.8rem',
                      }}
                    >
                      Primary Action
                    </button>
                    <button
                      type="button"
                      className="btn"
                      style={{
                        background: `linear-gradient(135deg, ${customAccent} 0%, ${customPrimary} 100%)`,
                        color: '#ffffff',
                        padding: '0.4rem 0.9rem',
                        fontSize: '0.8rem',
                      }}
                    >
                      Accent Action
                    </button>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center', marginTop: '1.25rem' }}>
                <button
                  type="button"
                  className="btn btn-accent"
                  onClick={handleSaveCustomTheme}
                >
                  💾 {t('btnSaveCustomTheme')}
                </button>
                {customSavedMsg && (
                  <span className="custom-theme-saved-toast">
                    ✨ {customSavedMsg}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab 5: Display & Preferences */}
        {activeTab === 'preferences' && (
          <div className="settings-section-card" id="settings-pane-preferences">
            <div className="settings-card-header">
              <h3>🖼️ {t('tabPreferences')}</h3>
            </div>

            {/* Language Selection */}
            <div className="form-group" style={{ maxWidth: '450px' }}>
              <label>{t('languageSetting')}</label>
              <p className="description">{t('languageSettingDesc')}</p>
              <select
                className="input-control"
                value={language}
                onChange={(e) => setLanguage(e.target.value as 'en' | 'ru')}
              >
                <option value="en">🇬🇧 English (EN)</option>
                <option value="ru">🇷🇺 Русский (RU)</option>
              </select>
            </div>

            <div className="settings-section-title" style={{ marginTop: '1.5rem' }}>
              <span>🖼️ Grid & View Dimensions</span>
            </div>

            <div className="settings-grid-row" style={{ marginTop: '0.5rem' }}>
              <div className="form-group">
                <label>{t('maxImagesPerRowLabel')}</label>
                <p className="description">{t('maxImagesPerRowDesc')}</p>
                <input
                  type="number"
                  className="input-control"
                  min={4}
                  max={24}
                  value={localUiSettings.maxImagesPerRow}
                  onChange={(e) =>
                    setLocalUiSettings((prev) => ({
                      ...prev,
                      maxImagesPerRow: Math.max(4, Math.min(24, parseInt(e.target.value, 10) || 10)),
                    }))
                  }
                />
              </div>

              <div className="form-group">
                <label>{t('galleryMaxRowsLabel')}</label>
                <p className="description">{t('galleryMaxRowsDesc')}</p>
                <input
                  type="number"
                  className="input-control"
                  min={1}
                  max={100}
                  value={localUiSettings.galleryMaxRows ?? 10}
                  onChange={(e) =>
                    setLocalUiSettings((prev) => ({
                      ...prev,
                      galleryMaxRows: Math.max(1, Math.min(100, parseInt(e.target.value, 10) || 10)),
                    }))
                  }
                />
              </div>

              <div className="form-group">
                <label>{t('maxDashboardWidthLabel')}</label>
                <p className="description">{t('maxDashboardWidthDesc')}</p>
                <input
                  type="number"
                  className="input-control"
                  min={1000}
                  max={2560}
                  step={50}
                  value={localUiSettings.maxWidth}
                  onChange={(e) =>
                    setLocalUiSettings((prev) => ({
                      ...prev,
                      maxWidth: Math.max(1000, Math.min(2560, parseInt(e.target.value, 10) || 1600)),
                    }))
                  }
                />
              </div>
            </div>

            {/* Caching Strategy Section inside Preferences */}
            <div className="form-group cache-strategy-section" id="section-caching-strategy" style={{ marginTop: '2rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem' }}>
              <div>
                <label style={{ fontSize: '1.05rem', fontWeight: 600 }}>💾 {t('cachingStrategyTitle' as any) || 'Caching Strategy'}</label>
                <p className="description">
                  {t('cachingStrategyDesc' as any) || 'Configure high-performance static cache, daily automation, and manual recaching controls.'}
                </p>
              </div>

              {cacheFeedback && (
                <div className={`settings-alert-banner ${cacheFeedback.type}`}>
                  <span>{cacheFeedback.type === 'success' ? '✅' : '❌'}</span>
                  <span>{cacheFeedback.message}</span>
                </div>
              )}

              {/* Cache Metrics Overview */}
              <div className="cache-metrics-grid">
                <div className="cache-metric-card">
                  <span className="metric-label">{t('cacheMetricEntries' as any) || 'Cached Entries'}</span>
                  <span className="metric-value">{cacheStatus ? cacheStatus.total_entries : '—'}</span>
                </div>
                <div className="cache-metric-card">
                  <span className="metric-label">{t('cacheMetricSize' as any) || 'Cache File Size'}</span>
                  <span className="metric-value">{cacheStatus ? formatBytes(cacheStatus.cache_file_size_bytes) : '—'}</span>
                </div>
                <div className="cache-metric-card">
                  <span className="metric-label">{t('cacheMetricStatus' as any) || 'Cache Status'}</span>
                  <span className="metric-value" style={{ color: cacheStatus?.is_valid ? '#4ade80' : '#f87171' }}>
                    {cacheStatus ? (cacheStatus.is_valid ? 'Valid / Active' : 'Stale / Rebuilt') : '—'}
                  </span>
                </div>
                <div className="cache-metric-card">
                  <span className="metric-label">{t('cacheMetricUpdated' as any) || 'Last Generated'}</span>
                  <span className="metric-value" style={{ fontSize: '0.85rem' }}>
                    {cacheStatus?.last_generated ? new Date(cacheStatus.last_generated).toLocaleString() : 'Never'}
                  </span>
                </div>
              </div>

              {/* Strategy Form Controls */}
              <div className="cache-strategy-form">
                <label className="checkbox-group">
                  <input
                    type="checkbox"
                    checked={incrementalOnly}
                    onChange={(e) => setIncrementalOnly(e.target.checked)}
                    disabled={isSavingCacheStrategy || disabled}
                  />
                  <span>{t('enableStaticCache' as any) || 'Incremental update only (scan modified files)'}</span>
                </label>

                <label className="checkbox-group">
                  <input
                    type="checkbox"
                    checked={dailyAutomationEnabled}
                    onChange={(e) => setDailyAutomationEnabled(e.target.checked)}
                    disabled={isSavingCacheStrategy || disabled}
                  />
                  <span>{t('enableDailyAutomation' as any) || 'Enable Daily Automated Background Recaching'}</span>
                </label>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.25rem' }}>
                  <label style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    {t('dailyAutomationHour' as any) || 'Execution Time:'}
                  </label>
                  <input
                    type="time"
                    className="input-control"
                    value={dailyScheduleTime}
                    onChange={(e) => setDailyScheduleTime(e.target.value)}
                    disabled={!dailyAutomationEnabled || isSavingCacheStrategy || disabled}
                    style={{ width: '130px' }}
                  />
                </div>

                <div style={{ marginTop: '0.5rem' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleSaveCacheStrategy}
                    disabled={isSavingCacheStrategy || disabled}
                    id="btn-save-cache-strategy"
                    style={{ padding: '0.5rem 1.25rem', fontSize: '0.85rem' }}
                  >
                    {isSavingCacheStrategy ? '💾 Saving...' : '💾 Save Strategy'}
                  </button>
                </div>
              </div>

              {/* Manual Recaching Controls */}
              <div>
                <label style={{ fontWeight: 600 }}>🚀 Manual Caching Actions</label>
                <p className="description">
                  {t('cachingStrategyDesc' as any) || 'Run an on-demand recache for all configured media folders or a specific folder.'}
                </p>

                <div className="cache-actions-row">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', flex: 1, minWidth: '280px' }}>
                    <label style={{ margin: 0, fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                      {t('cacheFolderSelectLabel' as any) || 'Target Folder:'}
                    </label>
                    <select
                      className="input-control"
                      value={cacheSelectedFolder}
                      onChange={(e) => setCacheSelectedFolder(e.target.value)}
                      disabled={isRecaching || disabled}
                      style={{ flex: 1, minWidth: '180px' }}
                      id="select-cache-target-folder"
                    >
                      <option value="">📂 {t('cacheFolderSelectAll' as any) || 'All Configured Folders'}</option>
                      {(formData.input_folders || []).filter(Boolean).map((f, i) => (
                        <option key={i} value={f}>
                          📁 {f}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => handleRecache()}
                    disabled={isRecaching || disabled}
                    id="btn-recache-action"
                    style={{ padding: '0.65rem 1.25rem' }}
                  >
                    {isRecaching ? '⏳ Recaching...' : cacheSelectedFolder ? `📁 ${t('btnRecacheFolder' as any) || 'Recache Folder'}` : `🚀 ${t('btnRecacheAll' as any) || 'Recache All Files'}`}
                  </button>

                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handlePruneDisconnectedFolders}
                    disabled={isPruningFolders || isResettingAll || disabled}
                    id="btn-prune-disconnected-folders-pref"
                    style={{ padding: '0.65rem 1.15rem' }}
                  >
                    {isPruningFolders ? '⏳ Pruning...' : `🧹 ${t('btnPruneFoldersCache' as any) || 'Prune Folders'}`}
                  </button>

                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={handleResetAllData}
                    disabled={isResettingAll || isPruningFolders || disabled}
                    id="btn-reset-all-data-pref"
                    style={{ padding: '0.65rem 1.15rem' }}
                  >
                    {isResettingAll ? '⏳ Resetting...' : `⚠️ ${t('btnResetAllData' as any) || 'Reset All Data (Clean Slate)'}`}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 6: Duplicates & Similarity Detection Settings */}
        {activeTab === 'duplicates' && (
          <div className="settings-section-card" id="settings-pane-duplicates">
            <div className="settings-card-header">
              <h3>🗂️ {t('tabDuplicates' as any) || 'Duplicate & Similarity Detection'}</h3>
            </div>

            <div className="form-group">
              <label>{t('duplicateEngine' as any) || 'Default Processing Engine'}</label>
              <p className="description">
                Choose between low-memory CPU processing (Zimaboard/low-power safe) or hardware-accelerated GPU tensor processing.
              </p>
              <select
                className="input-control"
                value={dupConfig.default_engine}
                onChange={(e) =>
                  setDupConfig((prev) => ({ ...prev, default_engine: e.target.value as any }))
                }
              >
                <option value="auto">Auto-Detect (GPU with CPU Fallback)</option>
                <option value="cpu">CPU Engine (Zimaboard Low-Memory Safe)</option>
                <option value="gpu">GPU AI Engine (RTX 4080 Accelerated)</option>
              </select>
            </div>

            <div className="form-group">
              <label>
                {t('similarityThreshold' as any) || 'Default Similarity Threshold'}: {Math.round(dupConfig.similarity_threshold * 100)}%
              </label>
              <p className="description">
                Perceptual hash threshold for visual similarity grouping (70% - 100%).
              </p>
              <input
                type="range"
                className="input-control"
                min="0.70"
                max="1.00"
                step="0.01"
                value={dupConfig.similarity_threshold}
                onChange={(e) =>
                  setDupConfig((prev) => ({ ...prev, similarity_threshold: parseFloat(e.target.value) }))
                }
              />
            </div>

            <div className="form-group">
              <label>
                {t('burstWindow' as any) || 'Burst Series Time Window'}: {dupConfig.burst_window_seconds}s
              </label>
              <p className="description">
                Maximum time delta in seconds between sequential photos to group them as burst shots.
              </p>
              <input
                type="range"
                className="input-control"
                min="1"
                max="30"
                step="1"
                value={dupConfig.burst_window_seconds}
                onChange={(e) =>
                  setDupConfig((prev) => ({ ...prev, burst_window_seconds: parseInt(e.target.value, 10) }))
                }
              />
            </div>

            <div className="form-group">
              <label>{t('defaultKeepStrategy' as any) || 'Smart Auto-Keep Recommendation Strategy'}</label>
              <p className="description">
                Heuristic used to designate the recommended primary file in each duplicate group. Deletion is never automatic.
              </p>
              <select
                className="input-control"
                value={dupConfig.default_keep_strategy}
                onChange={(e) =>
                  setDupConfig((prev) => ({ ...prev, default_keep_strategy: e.target.value }))
                }
              >
                <option value="highest_resolution">Highest Resolution (Megapixels & Dimensions)</option>
                <option value="largest_file_size">Largest File Size (Highest Quality/Bitrate)</option>
                <option value="newest">Newest Capture Date</option>
                <option value="oldest">Oldest / Original Date</option>
              </select>
            </div>

            <div className="form-group">
              <label>{t('targetArchiveFolder' as any) || 'Default Archive Folder for Moved Duplicates'}</label>
              <p className="description">
                Default directory where user-moved duplicate files will be relocated.
              </p>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="text"
                  className="input-control"
                  placeholder="e.g. Z:\duplicates_archive"
                  value={dupConfig.target_move_folder || ''}
                  onChange={(e) =>
                    setDupConfig((prev) => ({ ...prev, target_move_folder: e.target.value }))
                  }
                />
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() =>
                    setBrowserModal({
                      isOpen: true,
                      title: 'Select Duplicate Archive Folder',
                      initialPath: dupConfig.target_move_folder || '',
                      mode: 'folder',
                      targetType: 'output',
                    })
                  }
                >
                  📁 Browse
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Bottom Save & Action Bar */}
        <div className="settings-bottom-actions" style={{ marginTop: '1.5rem' }}>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ color: '#f87171' }}
            onClick={handleResetDefaults}
          >
            {t('btnResetDefaults')}
          </button>
          <div style={{ display: 'flex', gap: '0.8rem' }}>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSaving}
              style={{ minWidth: '160px', padding: '0.75rem 1.5rem', fontSize: '0.95rem' }}
            >
              {isSaving ? `⏳ ${t('btnSavingSettings')}` : `💾 ${t('btnSaveSettings')}`}
            </button>
          </div>
        </div>
      </form>

      {/* Interactive Directory / File Browser Modal */}
      <DirectoryBrowserModal
        isOpen={browserModal.isOpen}
        title={browserModal.title}
        initialPath={browserModal.initialPath}
        mode={browserModal.mode}
        onSelect={handleBrowserSelect}
        onClose={() => setBrowserModal((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
