import { useState, useEffect, useCallback } from 'react';
import FaceRegistry, {
  type FaceRegistryFace,
  type FaceRegistryPerson,
  type FaceRegistryGroup,
} from '../components/faces';
import ExecutionControls from '../components/settings/ExecutionControls';
import DuplicateDetectionRules from '../components/duplicates/DuplicateDetectionRules';
import type { UISettings, SettingsData } from '../models';
import { useLanguage } from '../i18n/LanguageContext';
import { useAuth } from '../services/authContext';

export interface LocalModelOption {
  id: string;
  name: string;
  isVision: boolean;
  isLoaded: boolean;
  arch?: string;
  size?: string;
  params?: string;
}

export type MediaLibrarySubTab = 'execution' | 'faces' | 'metadata' | 'models';

export interface MediaLibraryScreenProps {
  faces: Array<{ face_id: string; name?: string }>;
  persons: FaceRegistryPerson[];
  unrecognizedFaces: FaceRegistryFace[];
  unrecognizedGroups: FaceRegistryGroup[];
  isLoading: boolean;
  error: string | null;
  onRenameFace: (faceId: string, newName: string) => Promise<boolean>;
  onAssignFace: (faceId: string, personName: string, personId?: string) => Promise<boolean>;
  onAssignGroup: (faceIds: string[], personName: string, personId?: string) => Promise<boolean>;
  onResetFace: (faceId: string) => Promise<boolean>;
  onResetFacesByFilename: (filename: string) => Promise<boolean>;
  onDeleteFace: (faceId: string) => Promise<boolean>;
  onDeleteFacesBatch: (faceIds: string[]) => Promise<boolean>;
  disabled?: boolean;
  uiSettings: UISettings;
  onViewInFamilyTree?: (personName: string, personId?: string) => void;
  // Execution Controls props
  isRunning: boolean;
  isPaused: boolean;
  currentTask: string | null | undefined;
  statusInfo?: any;
  onStartSync: (force: boolean, modes?: string[]) => void;
  onPauseSync: () => void;
  onResumeSync: () => void;
  onStopSync: () => void;
  onStartSingleAnalysis: (filePath: string, onSuccess?: () => void, modes?: string[]) => void;
  onPickSingleFile: () => Promise<string>;
  pickerPending: boolean;
  // Optional settings & metadata operations
  settings?: SettingsData | null;
  onSaveSettings?: (newSettings: SettingsData) => Promise<boolean>;
  onRefreshMedia?: () => Promise<void> | void;
  onRescanSeries?: () => Promise<void> | void;
  scanProgress?: any;
}

export default function MediaLibraryScreen({
  faces,
  persons,
  unrecognizedFaces,
  unrecognizedGroups,
  isLoading,
  error,
  onRenameFace,
  onAssignFace,
  onAssignGroup,
  onResetFace,
  onResetFacesByFilename,
  onDeleteFace,
  onDeleteFacesBatch,
  disabled,
  uiSettings,
  onViewInFamilyTree,
  isRunning,
  isPaused,
  currentTask,
  statusInfo,
  onStartSync,
  onPauseSync,
  onResumeSync,
  onStopSync,
  onStartSingleAnalysis,
  onPickSingleFile,
  pickerPending,
  settings,
  onSaveSettings,
  onRefreshMedia,
  onRescanSeries,
  scanProgress,
}: MediaLibraryScreenProps) {
  const { t } = useLanguage();
  const { authFetch } = useAuth();
  const [activeSubTab, setActiveSubTab] = useState<MediaLibrarySubTab>('execution');

  // Metadata operations states
  const [isReindexing, setIsReindexing] = useState(false);
  const [isRescanningSeries, setIsRescanningSeries] = useState(false);
  const [reindexMsg, setReindexMsg] = useState<string | null>(null);

  // Models tab state
  const [modelSettings, setModelSettings] = useState<SettingsData>(settings || {});
  const [isSavingModels, setIsSavingModels] = useState(false);
  const [modelSaveMsg, setModelSaveMsg] = useState<string | null>(null);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionResult, setConnectionResult] = useState<{ connected: boolean; message: string } | null>(null);

  // LM Studio Local Models state
  const [localModels, setLocalModels] = useState<LocalModelOption[]>([]);
  const [loadingLocalModels, setLoadingLocalModels] = useState(false);
  const [localModelsError, setLocalModelsError] = useState<string | null>(null);
  const [isCustomLocalModel, setIsCustomLocalModel] = useState(false);
  const [isCustomGeminiModel, setIsCustomGeminiModel] = useState(false);
  const [loadingModelIntoRam, setLoadingModelIntoRam] = useState(false);
  const [preloadStatus, setPreloadStatus] = useState<string | null>(null);

  // Keep modelSettings synced with prop updates
  useEffect(() => {
    if (settings) {
      setModelSettings((prev) => ({
        ...prev,
        ...settings,
      }));
    }
  }, [settings]);

  // Fetch installed models from LM Studio
  const fetchLocalModels = useCallback(async () => {
    setLoadingLocalModels(true);
    setLocalModelsError(null);
    try {
      const fetchFn = authFetch || fetch;
      const res = await fetchFn('/api/models/local');
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.models)) {
          setLocalModels(data.models);
          // Default selection if none set and models exist
          if (data.activeModel && !modelSettings.local_model_name) {
            setModelSettings((prev) => ({ ...prev, local_model_name: data.activeModel }));
          } else if (!modelSettings.local_model_name && data.models.length > 0) {
            setModelSettings((prev) => ({ ...prev, local_model_name: data.models[0].id }));
          }
        } else {
          setLocalModels([]);
        }
      } else {
        setLocalModelsError(`Failed to fetch models from LM Studio (HTTP ${res.status})`);
      }
    } catch (err: any) {
      setLocalModelsError(`Could not reach LM Studio: ${err.message}`);
    } finally {
      setLoadingLocalModels(false);
    }
  }, [authFetch, modelSettings.local_model_name]);

  // Trigger fetch when Models tab is active and local/hybrid provider is selected
  useEffect(() => {
    if (
      activeSubTab === 'models' &&
      (modelSettings.model_provider === 'local' || modelSettings.model_provider === 'hybrid') &&
      localModels.length === 0 &&
      !loadingLocalModels
    ) {
      fetchLocalModels();
    }
  }, [activeSubTab, modelSettings.model_provider, localModels.length, loadingLocalModels, fetchLocalModels]);

  // Preload selected local model into LM Studio memory
  const handlePreloadLocalModel = async (modelIdToLoad?: string) => {
    const targetId = modelIdToLoad || modelSettings.local_model_name;
    if (!targetId) return;
    setLoadingModelIntoRam(true);
    setPreloadStatus(null);
    try {
      const fetchFn = authFetch || fetch;
      const res = await fetchFn('/api/models/local/load', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_id: targetId, modelId: targetId, model: targetId }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setPreloadStatus(`Model "${targetId}" loaded into LM Studio!`);
        fetchLocalModels();
      } else {
        setPreloadStatus(`Load failed: ${data.message || data.detail || 'Unknown error'}`);
      }
    } catch (err: any) {
      setPreloadStatus(`Load request error: ${err.message}`);
    } finally {
      setLoadingModelIntoRam(false);
    }
  };

  const handleReindex = async () => {
    setIsReindexing(true);
    setReindexMsg(null);
    try {
      if (onRefreshMedia) {
        await onRefreshMedia();
      }
      setReindexMsg('Folder scan & reindex finished successfully.');
    } catch (err: any) {
      setReindexMsg(`Reindex failed: ${err.message}`);
    } finally {
      setIsReindexing(false);
    }
  };

  const handleRescan = async () => {
    setIsRescanningSeries(true);
    setReindexMsg(null);
    try {
      if (onRescanSeries) {
        await onRescanSeries();
      }
      setReindexMsg('Burst series and duplicate grouping completed.');
    } catch (err: any) {
      setReindexMsg(`Rescan failed: ${err.message}`);
    } finally {
      setIsRescanningSeries(false);
    }
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setConnectionResult(null);
    try {
      const res = await fetch('/api/validate-connection');
      if (res.ok) {
        const data = await res.json();
        setConnectionResult({
          connected: Boolean(data.connected),
          message: data.message || 'Connected to media_cataloger AI service.',
        });
      } else {
        setConnectionResult({
          connected: false,
          message: `Service returned HTTP ${res.status}`,
        });
      }
    } catch (err: any) {
      setConnectionResult({
        connected: false,
        message: `Network error: ${err.message}`,
      });
    } finally {
      setTestingConnection(false);
    }
  };

  const handleSaveModelConfig = async () => {
    if (!onSaveSettings) return;
    setIsSavingModels(true);
    setModelSaveMsg(null);
    try {
      const ok = await onSaveSettings(modelSettings);
      if (ok) {
        setModelSaveMsg('Model configuration saved successfully.');
      } else {
        setModelSaveMsg('Failed to save model configuration.');
      }
    } catch (err: any) {
      setModelSaveMsg(`Error: ${err.message}`);
    } finally {
      setIsSavingModels(false);
    }
  };

  return (
    <div className="tab-pane active media-library-layout" id="pane-media-library" style={{ width: '100%', boxSizing: 'border-box' }}>
      {/* Sub-tab Navigation Header */}
      <div
        className="media-library-subtabs-nav"
        style={{
          display: 'flex',
          gap: '0.5rem',
          borderBottom: '1px solid var(--border-color, rgba(255, 255, 255, 0.1))',
          paddingBottom: '0.75rem',
          marginBottom: '1rem',
          flexWrap: 'wrap',
          width: '100%',
        }}
      >
        <button
          type="button"
          className={`btn ${activeSubTab === 'execution' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveSubTab('execution')}
          id="subtab-execution"
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem', whiteSpace: 'nowrap' }}
        >
          {t('subTabExecution')}
          {isRunning && (
            <span
              style={{
                display: 'inline-block',
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: '#22c55e',
                animation: 'pulse 1.5s infinite',
              }}
            />
          )}
        </button>

        <button
          type="button"
          className={`btn ${activeSubTab === 'faces' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveSubTab('faces')}
          id="subtab-faces"
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem', whiteSpace: 'nowrap' }}
        >
          {t('subTabFaces')}
          {faces.length > 0 && (
            <span
              className="badge-pill"
              style={{
                fontSize: '0.7rem',
                background: 'rgba(255, 255, 255, 0.15)',
                padding: '0.1rem 0.4rem',
                borderRadius: '10px',
              }}
            >
              {faces.length}
            </span>
          )}
        </button>

        <button
          type="button"
          className={`btn ${activeSubTab === 'metadata' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveSubTab('metadata')}
          id="subtab-metadata"
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem', whiteSpace: 'nowrap' }}
        >
          {t('subTabMetadata')}
        </button>

        <button
          type="button"
          className={`btn ${activeSubTab === 'models' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveSubTab('models')}
          id="subtab-models"
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem', whiteSpace: 'nowrap' }}
        >
          {t('subTabModels')}
          {statusInfo?.device && (
            <span
              style={{
                fontSize: '0.7rem',
                background: 'rgba(16, 185, 129, 0.2)',
                color: '#10b981',
                padding: '0.1rem 0.4rem',
                borderRadius: '4px',
                fontWeight: 600,
              }}
            >
              {statusInfo.device.toUpperCase()}
            </span>
          )}
        </button>
      </div>

      {/* Sub-tab 1: Modular Execution Controls */}
      {activeSubTab === 'execution' && (
        <ExecutionControls
          isRunning={isRunning}
          isPaused={isPaused}
          currentTask={currentTask}
          statusInfo={statusInfo}
          onStartSync={onStartSync}
          onPauseSync={onPauseSync}
          onResumeSync={onResumeSync}
          onStopSync={onStopSync}
          onStartSingleAnalysis={onStartSingleAnalysis}
          onPickSingleFile={onPickSingleFile}
          pickerPending={pickerPending}
        />
      )}

      {/* Sub-tab 2: Face Registry */}
      {activeSubTab === 'faces' && (
        <FaceRegistry
          faces={faces}
          persons={persons}
          unrecognizedFaces={unrecognizedFaces}
          unrecognizedGroups={unrecognizedGroups}
          isLoading={isLoading}
          error={error}
          onRenameFace={onRenameFace}
          onAssignFace={onAssignFace}
          onAssignGroup={onAssignGroup}
          onResetFace={onResetFace}
          onResetFacesByFilename={onResetFacesByFilename}
          onDeleteFace={onDeleteFace}
          onDeleteFacesBatch={onDeleteFacesBatch}
          disabled={disabled}
          uiSettings={uiSettings}
          onViewInFamilyTree={onViewInFamilyTree}
        />
      )}

      {/* Sub-tab 3: File Metadata Operations */}
      {activeSubTab === 'metadata' && (
        <div className="card" style={{ padding: '1.25rem' }}>
          <h2 style={{ marginTop: 0 }}>📝 {t('subTabMetadata')}</h2>
          <p className="description" style={{ marginBottom: '1.25rem' }}>
            Manage media file tags, category indexing, and burst series clustering across your media archive.
          </p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '1rem',
              marginBottom: '1.25rem',
            }}
          >
            <div
              style={{
                background: 'var(--bg-secondary, rgba(0,0,0,0.2))',
                border: '1px solid var(--border-color, rgba(255,255,255,0.1))',
                borderRadius: '8px',
                padding: '1rem',
              }}
            >
              <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem' }}>🔄 Folder Scan & Indexing</h3>
              <p className="description" style={{ fontSize: '0.85rem' }}>
                Rescan configured input folders and update the relational SQLite database.
              </p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleReindex}
                disabled={isReindexing || scanProgress?.is_scanning}
                style={{ width: '100%', marginTop: '0.5rem' }}
              >
                {isReindexing || scanProgress?.is_scanning ? '⏳ Scanning Folders...' : '🔄 Reindex All Media Folders'}
              </button>
            </div>

            <div
              style={{
                background: 'var(--bg-secondary, rgba(0,0,0,0.2))',
                border: '1px solid var(--border-color, rgba(255,255,255,0.1))',
                borderRadius: '8px',
                padding: '1rem',
              }}
            >
              <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem' }}>🗂️ Burst & Duplicates Rescan</h3>
              <p className="description" style={{ fontSize: '0.85rem' }}>
                Analyze perceptual hashes to group burst photos and identify best frames.
              </p>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleRescan}
                disabled={isRescanningSeries}
                style={{ width: '100%', marginTop: '0.5rem' }}
              >
                {isRescanningSeries ? '⏳ Analyzing Duplicates...' : '🗂️ Rescan Series & Duplicates'}
              </button>
            </div>
          </div>

          {(reindexMsg || scanProgress?.is_scanning) && (
            <div
              style={{
                padding: '0.6rem 0.9rem',
                borderRadius: '6px',
                background: 'rgba(59, 130, 246, 0.1)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                color: '#60a5fa',
                fontSize: '0.85rem',
              }}
            >
              {scanProgress?.is_scanning
                ? `Indexing: ${scanProgress.current_filename || 'reading files...'} (${scanProgress.scanned_count || 0} files scanned)`
                : reindexMsg}
            </div>
          )}
        </div>
      )}

      {/* Sub-tab 4: AI & Models Configuration */}
      {activeSubTab === 'models' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%' }}>
          <div className="card" style={{ padding: '1.25rem', width: '100%', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <h2 style={{ margin: 0 }}>🤖 {t('subTabModels')}</h2>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleTestConnection}
                disabled={testingConnection}
                style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem' }}
              >
                {testingConnection ? '⏳ Testing Connection...' : '⚡ Test AI Service Connection'}
              </button>
            </div>

            {connectionResult && (
              <div
                style={{
                  padding: '0.6rem 0.9rem',
                  borderRadius: '6px',
                  marginBottom: '1rem',
                  background: connectionResult.connected ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                  border: `1px solid ${connectionResult.connected ? '#10b981' : '#ef4444'}`,
                  color: connectionResult.connected ? '#34d399' : '#f87171',
                  fontSize: '0.85rem',
                }}
              >
                {connectionResult.connected ? '✅' : '❌'} {connectionResult.message}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
              {/* Model Provider */}
              <div className="form-group">
                <label>{t('modelProvider')}</label>
                <select
                  className="input-control"
                  value={modelSettings.model_provider || 'gemini'}
                  onChange={(e) => {
                    const newProvider = e.target.value;
                    setModelSettings({ ...modelSettings, model_provider: newProvider });
                    if ((newProvider === 'local' || newProvider === 'hybrid') && localModels.length === 0) {
                      fetchLocalModels();
                    }
                  }}
                >
                  <option value="gemini">Gemini API (Cloud AI)</option>
                  <option value="local">LM Studio / Local LLM (Local AI)</option>
                  <option value="hybrid">Hybrid (Gemini with Local Fallback)</option>
                </select>
              </div>

              {/* Gemini Model (Shown if provider is gemini or hybrid) */}
              {(modelSettings.model_provider === 'gemini' || modelSettings.model_provider === 'hybrid' || !modelSettings.model_provider) && (
                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                    <label style={{ margin: 0 }}>{t('geminiModel')}</label>
                    <button
                      type="button"
                      onClick={() => setIsCustomGeminiModel(!isCustomGeminiModel)}
                      style={{ background: 'none', border: 'none', color: '#60a5fa', fontSize: '0.75rem', cursor: 'pointer', textDecoration: 'underline' }}
                    >
                      {isCustomGeminiModel ? 'Choose from list' : 'Custom model ID'}
                    </button>
                  </div>
                  {isCustomGeminiModel ? (
                    <input
                      type="text"
                      className="input-control"
                      value={modelSettings.gemini_model || ''}
                      onChange={(e) => setModelSettings({ ...modelSettings, gemini_model: e.target.value })}
                      placeholder="e.g. gemini-3.6-flash"
                    />
                  ) : (
                    <select
                      className="input-control"
                      value={modelSettings.gemini_model || 'gemini-3.6-flash'}
                      onChange={(e) => {
                        if (e.target.value === '__custom__') {
                          setIsCustomGeminiModel(true);
                        } else {
                          setModelSettings({ ...modelSettings, gemini_model: e.target.value });
                        }
                      }}
                    >
                      <option value="gemini-3.6-flash">gemini-3.6-flash (Fast & Recommended)</option>
                      <option value="gemini-2.5-flash">gemini-2.5-flash (Balanced)</option>
                      <option value="gemini-2.5-pro">gemini-2.5-pro (High Reasoning)</option>
                      <option value="gemini-1.5-flash">gemini-1.5-flash (Legacy Fast)</option>
                      {modelSettings.gemini_model && !['gemini-3.6-flash', 'gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-1.5-flash'].includes(modelSettings.gemini_model) && (
                        <option value={modelSettings.gemini_model}>{modelSettings.gemini_model}</option>
                      )}
                      <option value="__custom__">✏️ Custom Model ID...</option>
                    </select>
                  )}
                </div>
              )}

              {/* LM Studio Local Model (Shown if provider is local or hybrid) */}
              {(modelSettings.model_provider === 'local' || modelSettings.model_provider === 'hybrid') && (
                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                    <label style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      💻 {modelSettings.model_provider === 'hybrid' ? 'Local Fallback Model' : 'LM Studio Model'}
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <button
                        type="button"
                        onClick={fetchLocalModels}
                        disabled={loadingLocalModels}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#60a5fa',
                          fontSize: '0.75rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.2rem',
                          padding: 0,
                        }}
                        title="Query installed models in LM Studio"
                      >
                        {loadingLocalModels ? '⏳ Refreshing...' : '🔄 Refresh'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsCustomLocalModel(!isCustomLocalModel)}
                        style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '0.75rem', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                      >
                        {isCustomLocalModel ? 'Select list' : 'Custom'}
                      </button>
                    </div>
                  </div>

                  {isCustomLocalModel ? (
                    <input
                      type="text"
                      className="input-control"
                      value={modelSettings.local_model_name || ''}
                      onChange={(e) => setModelSettings({ ...modelSettings, local_model_name: e.target.value })}
                      placeholder="e.g. qwen2.5-vl-7b-instruct"
                    />
                  ) : (
                    <select
                      className="input-control"
                      value={modelSettings.local_model_name || ''}
                      onChange={(e) => {
                        if (e.target.value === '__custom__') {
                          setIsCustomLocalModel(true);
                        } else {
                          setModelSettings({ ...modelSettings, local_model_name: e.target.value });
                        }
                      }}
                    >
                      {loadingLocalModels ? (
                        <option disabled>Loading models from LM Studio...</option>
                      ) : localModels.length === 0 ? (
                        <option value="">No models found in LM Studio (Click 🔄 Refresh)</option>
                      ) : (
                        <option value="">-- Select installed LM Studio model --</option>
                      )}
                      {localModels.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.isVision ? '👁️ ' : '💬 '}
                          {m.name}
                          {m.isLoaded ? ' (● Loaded in RAM)' : ''}
                          {m.size ? ` [${m.size}]` : ''}
                        </option>
                      ))}
                      {modelSettings.local_model_name && !localModels.some((m) => m.id === modelSettings.local_model_name) && (
                        <option value={modelSettings.local_model_name}>⚙️ {modelSettings.local_model_name}</option>
                      )}
                      <option value="__custom__">✏️ Custom Model ID...</option>
                    </select>
                  )}

                  {/* Model status indicators & quick preload */}
                  <div style={{ marginTop: '0.35rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', fontSize: '0.75rem' }}>
                    {(() => {
                      const sel = localModels.find((m) => m.id === modelSettings.local_model_name);
                      if (sel?.isLoaded) {
                        return <span style={{ color: '#10b981', fontWeight: 600 }}>● Active in LM Studio memory</span>;
                      }
                      if (modelSettings.local_model_name) {
                        return (
                          <button
                            type="button"
                            onClick={() => handlePreloadLocalModel()}
                            disabled={loadingModelIntoRam}
                            style={{
                              background: 'rgba(59, 130, 246, 0.15)',
                              border: '1px solid rgba(59, 130, 246, 0.3)',
                              borderRadius: '4px',
                              color: '#60a5fa',
                              fontSize: '0.75rem',
                              padding: '0.15rem 0.45rem',
                              cursor: 'pointer',
                            }}
                          >
                            {loadingModelIntoRam ? '⏳ Preloading...' : '⚡ Preload into RAM'}
                          </button>
                        );
                      }
                      return null;
                    })()}

                    {localModels.length > 0 && (
                      <span style={{ color: '#94a3b8' }}>
                        👁️ = Vision capable
                      </span>
                    )}
                  </div>

                  {localModelsError && (
                    <span style={{ fontSize: '0.75rem', color: '#f87171', display: 'block', marginTop: '0.25rem' }}>
                      ⚠️ {localModelsError}
                    </span>
                  )}
                  {preloadStatus && (
                    <span style={{ fontSize: '0.75rem', color: preloadStatus.includes('failed') || preloadStatus.includes('error') ? '#f87171' : '#34d399', display: 'block', marginTop: '0.25rem' }}>
                      {preloadStatus}
                    </span>
                  )}
                </div>
              )}

              {/* Whisper Model */}
              <div className="form-group">
                <label>🎙️ Whisper Speech-to-Text Model</label>
                <select
                  className="input-control"
                  value={modelSettings.whisper_model || 'large-v3-turbo'}
                  onChange={(e) => setModelSettings({ ...modelSettings, whisper_model: e.target.value })}
                >
                  <option value="large-v3-turbo">large-v3-turbo (Recommended for GPU)</option>
                  <option value="medium">medium (Balanced)</option>
                  <option value="small">small (Fast)</option>
                  <option value="base">base (Ultra Fast)</option>
                </select>
              </div>

              {/* GPU Acceleration Status */}
              <div className="form-group">
                <label>⚡ Hardware Acceleration</label>
                <div
                  style={{
                    padding: '0.65rem 0.9rem',
                    borderRadius: '6px',
                    background: 'rgba(16, 185, 129, 0.1)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    color: '#34d399',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                >
                  <span>🚀</span>
                  <span>NVIDIA CUDA Accelerated ({statusInfo?.device ? statusInfo.device.toUpperCase() : 'GPU'})</span>
                </div>
              </div>
            </div>

            {modelSaveMsg && (
              <div
                style={{
                  marginTop: '1rem',
                  padding: '0.5rem 0.8rem',
                  borderRadius: '6px',
                  background: 'rgba(59, 130, 246, 0.1)',
                  color: '#60a5fa',
                  fontSize: '0.85rem',
                }}
              >
                {modelSaveMsg}
              </div>
            )}

            <div style={{ marginTop: '1.25rem', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSaveModelConfig}
                disabled={isSavingModels}
                style={{ minWidth: '160px' }}
              >
                {isSavingModels ? '⏳ Saving...' : '💾 Save Model Settings'}
              </button>
            </div>
          </div>

          {/* Card 2: Duplicate & Similarity Detection Rules and Thresholds */}
          <DuplicateDetectionRules
            activeInputFolders={settings?.input_folders || []}
            onScanCompleted={onRefreshMedia}
          />
        </div>
      )}
    </div>
  );
}

export { MediaLibraryScreen };
