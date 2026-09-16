import { useState, useEffect, useCallback, useRef } from 'react';
import Header from './components/header/Header';
import HeaderNavTabs from './components/header/HeaderNavTabs';
import {
  GalleryScreen,
  DuplicatesScreen,
  VaultScreen,
  MediaLibraryScreen,
  FamilyTreeScreen,
  SettingsScreen,
  AdminScreen,
} from './screens';
import { PipelineLogs } from './components/logs';
import { LoginModal, VaultModal } from './components/modals';
import type { GalleryMediaFile } from './components/gallery';
import type {
  FaceRegistryFace,
  FaceRegistryPerson,
  FaceRegistryGroup,
} from './components/faces';
import type { SettingsTab } from './components/settings';
import { setTreeStore } from './packages/family-tree/index.js';
import type { StatusInfo, SettingsData, UISettings } from './models';
import { errorInterceptor } from './utils/errorInterceptor';
import { mediaCacheService } from './services/mediaCacheService';
import { AuthProvider, useAuth } from './services/authContext';
import { VaultProvider, useVault } from './services/vaultContext';
import './App.css';

function AppMain() {
  const { canAccessAdmin, canManageFaces, authFetch } = useAuth();
  const { isUnlocked, isConfigured } = useVault();
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isVaultOpen, setIsVaultOpen] = useState(false);

  const [statusInfo, setStatusInfo] = useState<StatusInfo>({
    status: 'checking',
    current_task: null,
    error: null,
    progress: null,
  });
  const [logsList, setLogsList] = useState<string[]>([]);
  const [faces, setFaces] = useState<Array<{ face_id: string; name?: string }>>([]);
  const [persons, setPersons] = useState<FaceRegistryPerson[]>([]);
  const [unrecognizedFaces, setUnrecognizedFaces] = useState<FaceRegistryFace[]>([]);
  const [unrecognizedGroups, setUnrecognizedGroups] = useState<FaceRegistryGroup[]>([]);
  const [facesLoading, setFacesLoading] = useState(false);
  const [facesError, setFacesError] = useState<string | null>(null);

  // Media files from input sources
  const [mediaFiles, setMediaFiles] = useState<GalleryMediaFile[]>([]);
  const [isMediaLoading, setIsMediaLoading] = useState(false);
  const [scanProgress, setScanProgress] = useState<{
    is_scanning: boolean;
    scanned_count: number;
    current_file: string | null;
    current_filename: string | null;
    current_folder: string | null;
  } | null>(null);

  // Tab navigation: 'main' (Sources / Gallery) or 'media_library' (Face Registry & Controls)
  const [activeTab, setActiveTab] = useState<'main' | 'media_library' | string>('main');

  // Navigation sidebar expanded state
  const [isNavExpanded, setIsNavExpanded] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('media_cataloger_nav_expanded');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });

  const handleToggleNav = useCallback(() => {
    setIsNavExpanded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('media_cataloger_nav_expanded', String(next));
      } catch (e) {
        console.warn('Failed to save nav expanded state:', e);
      }
      return next;
    });
  }, []);

  // Logs visibility: hidden by default
  const [showLogs, setShowLogs] = useState(false);

  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('execution');
  const [pickerPending, setPickerPending] = useState(false);
  const [isRefreshingLogs, setIsRefreshingLogs] = useState(false);

  // UI preferences loaded from localStorage
  const [uiSettings, setUiSettings] = useState<UISettings>(() => {
    try {
      const saved = localStorage.getItem('media_cataloger_ui_settings');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.warn('Failed to parse uiSettings from localStorage:', e);
    }
    return {
      maxImagesPerRow: 10,
      maxRows: 1,
      maxWidth: 1600,
      galleryMaxRows: 10,
    };
  });

  const handleSaveUiSettings = useCallback((newSettings: UISettings) => {
    setUiSettings(newSettings);
    try {
      localStorage.setItem('media_cataloger_ui_settings', JSON.stringify(newSettings));
    } catch (e) {
      console.warn('Failed to save uiSettings to localStorage:', e);
    }
  }, []);

  const statusRef = useRef(statusInfo.status);

  useEffect(() => {
    statusRef.current = statusInfo.status;
  }, [statusInfo.status]);

  const appendConsoleMessage = useCallback(
    (message: string, level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' = 'INFO', context = 'App', details?: string) => {
      errorInterceptor.emitLog(level, context, message, details);
    },
    []
  );

  // Fetch logs
  const fetchLogsInternal = useCallback(async () => {
    try {
      const res = await fetch('/api/logs');
      if (res.ok) {
        const data = await res.json();
        if (data.logs) {
          const lines = (data.logs as string).split('\n').filter((l) => l.length > 0);
          setLogsList(lines);
        }
      }
    } catch (err) {
      console.error('Error fetching logs:', err);
    }
  }, []);

  // Initialize error interceptor on mount and subscribe to captured logs
  useEffect(() => {
    errorInterceptor.init();
    const unsubscribe = errorInterceptor.subscribe((entry) => {
      setLogsList((prev) => [...prev, entry.raw]);
    });
    return () => unsubscribe();
  }, []);

  const handleClearLogs = useCallback(async () => {
    try {
      await authFetch('/api/logs/clear', { method: 'POST' });
    } catch (err) {
      console.error('Failed to clear logs on server:', err);
    }
    setLogsList([]);
  }, [authFetch]);

  // Poll live media scan status continuously so Header status always shows real-time progress
  useEffect(() => {
    let isMounted = true;
    const fetchScanStatus = async () => {
      try {
        const res = await fetch('/api/media/scan-status');
        if (res.ok && isMounted) {
          const data = await res.json();
          setScanProgress(data);
        }
      } catch {
        // ignore polling errors
      }
    };

    fetchScanStatus();
    const interval = setInterval(fetchScanStatus, 1500);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const [isBackgroundLoading, setIsBackgroundLoading] = useState(false);
  const [totalKnownFiles, setTotalKnownFiles] = useState<number | null>(null);
  const chunkAbortControllerRef = useRef<AbortController | null>(null);
  const wasScanningRef = useRef(false);

  // Load initial portion of media files (100 files) without re-rendering loops
  const loadMediaFiles = useCallback(async (refresh = false) => {
    if (chunkAbortControllerRef.current) {
      chunkAbortControllerRef.current.abort();
    }
    const abortCtrl = new AbortController();
    chunkAbortControllerRef.current = abortCtrl;

    const CHUNK_SIZE = 100;
    setIsMediaLoading(true);

    try {
      await mediaCacheService.init();
      // Initially, render whatever is instantly available in the local cache
      const cached = mediaCacheService.getAll();
      if (cached.length > 0) {
        setMediaFiles(cached);
        setTotalKnownFiles(mediaCacheService.total);
      }

      // Then fetch from server
      const res = await mediaCacheService.fetchChunk({
        offset: 0,
        limit: CHUNK_SIZE,
        refresh
      });
      
      setMediaFiles(mediaCacheService.getAll());
      setTotalKnownFiles(res.total);

      // Start prefetching next chunks in the background if needed
      mediaCacheService.prefetchNextChunk(0, CHUNK_SIZE);
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Error loading media files:', err);
      }
    } finally {
      setIsMediaLoading(false);
    }
  }, []);

  // Automatically reload media files and recalculate series when background indexing completes
  useEffect(() => {
    if (wasScanningRef.current && !scanProgress?.is_scanning) {
      loadMediaFiles(false);
    }
    wasScanningRef.current = Boolean(scanProgress?.is_scanning);
  }, [scanProgress?.is_scanning, loadMediaFiles]);

  // Fetch more files on scroll on demand
  const fetchMoreMediaFiles = useCallback(async () => {
    if (isBackgroundLoading) return;
    const currentOffset = mediaFiles.length;
    if (totalKnownFiles !== null && currentOffset >= totalKnownFiles) return;

    setIsBackgroundLoading(true);
    try {
      const res = await mediaCacheService.fetchChunk({ offset: currentOffset, limit: 100 });
      setMediaFiles(mediaCacheService.getAll());
      setTotalKnownFiles(res.total);

      mediaCacheService.prefetchNextChunk(currentOffset, 100);
    } catch (err) {
      console.error('Error fetching more media files on scroll:', err);
    } finally {
      setIsBackgroundLoading(false);
    }
  }, [mediaFiles.length, totalKnownFiles, isBackgroundLoading]);

  // Load face registry, persons, unrecognized faces and groups
  const loadFaces = useCallback(async () => {
    try {
      const [resFaces, resPersons, resUnrec, resGroups] = await Promise.all([
        fetch('/api/faces'),
        fetch('/api/faces/persons'),
        fetch('/api/faces/unrecognized'),
        fetch('/api/faces/unrecognized-groups'),
      ]);

      if (resFaces.ok) {
        const data = await resFaces.json();
        setFaces(data);
      }
      if (resPersons.ok) {
        const dataPersons = await resPersons.json();
        setPersons(dataPersons);
      }
      if (resUnrec.ok) {
        const dataUnrec = await resUnrec.json();
        setUnrecognizedFaces(dataUnrec);
      }
      if (resGroups.ok) {
        const dataGroups = await resGroups.json();
        setUnrecognizedGroups(dataGroups);
      }
      setFacesError(null);
    } catch (err) {
      console.error('Error loading faces:', err);
      setFacesError('Network error loading faces');
    } finally {
      setFacesLoading(false);
    }
  }, []);

  // Fetch live system status
  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/status');
      if (res.ok) {
        const data = await res.json();
        const prev = statusRef.current;
        setStatusInfo(data);
        if (data.status === 'running' || data.status === 'paused') {
          // Auto-poll logs when running or paused
          fetchLogsInternal();
        } else if (prev === 'running' || prev === 'paused') {
          // Process completed or stopped -> refresh media files, faces, and logs immediately
          loadMediaFiles();
          loadFaces();
          fetchLogsInternal();
        }
      } else {
        setStatusInfo((prev) => ({
          ...prev,
          status: 'idle',
          connected: false,
          error: `HTTP ${res.status}: ${res.statusText}`,
        }));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Connection error';
      console.warn('Error checking status (server or AI engine offline):', msg);
      setStatusInfo((prev) => ({
        ...prev,
        status: 'idle',
        connected: false,
        error: msg,
      }));
    }
  }, [fetchLogsInternal, loadMediaFiles, loadFaces]);

  const handleRefreshLogs = async () => {
    setIsRefreshingLogs(true);
    await fetchLogsInternal();
    setIsRefreshingLogs(false);
  };

  // Rename face or person
  const handleRenameFace = async (faceId: string, newName: string) => {
    try {
      const res = await authFetch('/api/faces/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ face_id: faceId, name: newName }),
      });

      if (res.ok) {
        appendConsoleMessage(`[Face Registry] Renamed ${faceId} to "${newName}"`);
        await loadFaces();
        await loadMediaFiles();
        return true;
      } else {
        if (res.status === 401) setIsLoginOpen(true);
        const err = await res.json().catch(() => ({}));
        alert(`Error: ${err.detail || err.message || 'Could not rename face'}`);
        await loadFaces();
        return false;
      }
    } catch (err) {
      console.error('Error renaming face:', err);
      alert('Network error. Could not rename face.');
      await loadFaces();
      return false;
    }
  };

  // Assign unrecognized face to person
  const handleAssignFace = async (faceId: string, personName: string) => {
    try {
      const res = await authFetch('/api/faces/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ face_id: faceId, name: personName }),
      });

      if (res.ok) {
        appendConsoleMessage(`[Face Registry] Assigned ${faceId} to "${personName}" as reference sample`);
        await loadFaces();
        await loadMediaFiles();
        return true;
      } else {
        if (res.status === 401) setIsLoginOpen(true);
        const err = await res.json().catch(() => ({}));
        alert(`Error: ${err.detail || err.message || 'Could not assign face'}`);
        await loadFaces();
        return false;
      }
    } catch (err) {
      console.error('Error assigning face:', err);
      alert('Network error. Could not assign face.');
      await loadFaces();
      return false;
    }
  };

  // Assign group of faces to person
  const handleAssignGroup = async (faceIds: string[], personName: string) => {
    try {
      const res = await authFetch('/api/faces/assign-group', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ face_ids: faceIds, name: personName }),
      });

      if (res.ok) {
        appendConsoleMessage(`[Face Registry] Assigned group of ${faceIds.length} faces to "${personName}"`);
        await loadFaces();
        await loadMediaFiles();
        return true;
      } else {
        if (res.status === 401) setIsLoginOpen(true);
        const err = await res.json().catch(() => ({}));
        alert(`Error: ${err.detail || err.message || 'Could not assign face group'}`);
        await loadFaces();
        return false;
      }
    } catch (err) {
      console.error('Error assigning group:', err);
      alert('Network error. Could not assign face group.');
      await loadFaces();
      return false;
    }
  };

  // Reset face assignment
  const handleResetFace = async (faceId: string) => {
    try {
      const res = await authFetch('/api/faces/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ face_id: faceId }),
      });

      if (res.ok) {
        appendConsoleMessage(`[Face Registry] Reset assignment for face ${faceId}`);
        await loadFaces();
        await loadMediaFiles();
        return true;
      } else {
        if (res.status === 401) setIsLoginOpen(true);
        const err = await res.json().catch(() => ({}));
        alert(`Error: ${err.detail || err.message || 'Could not reset face'}`);
        await loadFaces();
        return false;
      }
    } catch (err) {
      console.error('Error resetting face:', err);
      alert('Network error. Could not reset face.');
      await loadFaces();
      return false;
    }
  };

  // Reset faces by filename
  const handleResetFacesByFilename = async (filename: string) => {
    try {
      const res = await authFetch('/api/faces/reset-by-filename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        appendConsoleMessage(`[Face Registry] Reset ${data.reset_count || 0} faces for file "${filename}"`);
        await loadFaces();
        await loadMediaFiles();
        alert(`Successfully reset ${data.reset_count || 0} face assignment(s) for "${filename}".`);
        return true;
      } else {
        if (res.status === 401) setIsLoginOpen(true);
        alert(`Error: ${data.detail || data.message || 'Could not reset faces by filename'}`);
        await loadFaces();
        return false;
      }
    } catch (err) {
      console.error('Error resetting faces by filename:', err);
      alert('Network error. Could not reset faces by filename.');
      await loadFaces();
      return false;
    }
  };

  // Delete face
  const handleDeleteFace = async (faceId: string) => {
    try {
      const res = await authFetch('/api/faces/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ face_id: faceId }),
      });

      if (res.ok) {
        appendConsoleMessage(`[Face Registry] Deleted face ${faceId}`);
        await loadFaces();
        await loadMediaFiles();
        return true;
      } else {
        if (res.status === 401) setIsLoginOpen(true);
        const err = await res.json().catch(() => ({}));
        alert(`Error: ${err.detail || err.message || 'Could not delete face'}`);
        await loadFaces();
        return false;
      }
    } catch (err) {
      console.error('Error deleting face:', err);
      alert('Network error. Could not delete face.');
      await loadFaces();
      return false;
    }
  };

  // Delete batch / group of faces
  const handleDeleteFacesBatch = async (faceIds: string[]) => {
    try {
      const res = await authFetch('/api/faces/delete-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ face_ids: faceIds }),
      });

      if (res.ok) {
        appendConsoleMessage(`[Face Registry] Deleted ${faceIds.length} face(s) and their file assets`);
        await loadFaces();
        await loadMediaFiles();
        return true;
      } else {
        if (res.status === 401) setIsLoginOpen(true);
        const err = await res.json().catch(() => ({}));
        alert(`Error: ${err.detail || err.message || 'Could not delete faces'}`);
        await loadFaces();
        return false;
      }
    } catch (err) {
      console.error('Error deleting faces batch:', err);
      alert('Network error. Could not delete faces.');
      await loadFaces();
      return false;
    }
  };

  // Load settings
  const loadSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
      }
    } catch (err) {
      console.error('Error loading settings:', err);
    }
  }, []);

  // Save settings
  const handleSaveSettings = async (settingsPayload: SettingsData) => {
    try {
      const res = await authFetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingsPayload),
      });

      const data = await res.json();
      if (res.ok) {
        appendConsoleMessage(`[Settings] Dynamic paths updated successfully: ${data.message || 'Saved'}`);
        await loadSettings();
        await loadMediaFiles(true);
        return true;
      } else {
        if (res.status === 401) {
          setIsLoginOpen(true);
        }
        alert(`Error: ${data.message || data.detail || 'Failed to update settings'}`);
        await loadSettings();
        return false;
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      alert(`Network error. Could not update settings: ${message}`);
      await loadSettings();
      return false;
    }
  };

  // Pick folder
  const handlePickFolder = async () => {
    setPickerPending(true);
    try {
      const res = await fetch('/api/select-folder', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        return (data.folder as string) || '';
      } else {
        const err = await res.json();
        alert(`Picker error: ${err.detail || 'Failed to select folder'}`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      alert(`Network error: ${message}`);
    } finally {
      setPickerPending(false);
    }
    return '';
  };

  // Pick single file
  const handlePickFile = async () => {
    setPickerPending(true);
    try {
      const res = await fetch('/api/select-file', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        return (data.file as string) || '';
      } else {
        const err = await res.json();
        alert(`Picker error: ${err.detail || 'Failed to select file'}`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      alert(`Network error: ${message}`);
    } finally {
      setPickerPending(false);
    }
    return '';
  };

  // Start Sync
  const handleStartSync = async (force: boolean, modes?: string[]) => {
    const modeDesc = modes && modes.length ? ` (modes=${modes.join(', ')})` : '';
    appendConsoleMessage(`Triggering catalog sync pipeline (force=${Boolean(force)}${modeDesc})...`, 'INFO', 'Pipeline');
    try {
      const modesQuery = modes && modes.length ? `&modes=${encodeURIComponent(modes.join(','))}` : '';
      const payload = modes && modes.length ? { force: Boolean(force), modes } : undefined;
      const res = await authFetch(`/api/run?force=${Boolean(force)}${modesQuery}`, {
        method: 'POST',
        headers: payload ? { 'Content-Type': 'application/json' } : undefined,
        body: payload ? JSON.stringify(payload) : undefined,
      });
      const result = await res.json();
      if (res.ok) {
        const countMsg = result.provided_files_count !== undefined ? ` (${result.provided_files_count} files sent to backend)` : '';
        appendConsoleMessage(`Triggered sync successfully: ${result.message || 'Started'}${countMsg}`, 'INFO', 'Pipeline');
        checkStatus();
      } else {
        if (res.status === 401) {
          setIsLoginOpen(true);
        }
        const errMsg = result.message || result.detail || result.error || 'Failed to start sync';
        appendConsoleMessage(
          `Failed to run sync: ${errMsg}`,
          'ERROR',
          'Pipeline',
          `HTTP ${res.status} on POST /api/run\nDiagnosis: Cataloger backend execution failed.\nSuggestion: Verify user permissions and that cataloger background worker is running.`
        );
        alert(`Could not start cataloging sync:\n${errMsg}`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      appendConsoleMessage(
        `Connection failed while starting sync: ${message}`,
        'ERROR',
        'Pipeline',
        `Network error on POST /api/run. Ensure server is reachable.`,
      );
      alert(`Network error connecting to server: ${message}`);
    }
  };

  // Pause Sync
  const handlePauseSync = async () => {
    appendConsoleMessage('Requesting pipeline pause...', 'INFO', 'Pipeline');
    try {
      const res = await authFetch('/api/pause', { method: 'POST' });
      const result = await res.json();
      if (res.ok) {
        appendConsoleMessage(`Execution paused: ${result.message || 'Paused'}`, 'INFO', 'Pipeline');
        checkStatus();
      } else {
        if (res.status === 401) setIsLoginOpen(true);
        appendConsoleMessage(`Failed to pause: ${result.message || result.detail || 'Error'}`, 'ERROR', 'Pipeline');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      appendConsoleMessage(`Connection failed while pausing: ${message}`, 'ERROR', 'Pipeline');
    }
  };

  // Resume Sync
  const handleResumeSync = async () => {
    appendConsoleMessage('Requesting pipeline resume...', 'INFO', 'Pipeline');
    try {
      const res = await authFetch('/api/resume', { method: 'POST' });
      const result = await res.json();
      if (res.ok) {
        appendConsoleMessage(`Execution resumed: ${result.message || 'Resumed'}`, 'INFO', 'Pipeline');
        checkStatus();
      } else {
        if (res.status === 401) setIsLoginOpen(true);
        appendConsoleMessage(`Failed to resume: ${result.message || result.detail || 'Error'}`, 'ERROR', 'Pipeline');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      appendConsoleMessage(`Connection failed while resuming: ${message}`, 'ERROR', 'Pipeline');
    }
  };

  // Stop Sync
  const handleStopSync = async () => {
    appendConsoleMessage('Requesting pipeline stop...', 'WARN', 'Pipeline');
    try {
      const res = await authFetch('/api/stop', { method: 'POST' });
      const result = await res.json();
      if (res.ok) {
        appendConsoleMessage(`Stop requested: ${result.message || 'Stopping'}`, 'INFO', 'Pipeline');
        checkStatus();
      } else {
        if (res.status === 401) setIsLoginOpen(true);
        appendConsoleMessage(`Failed to stop: ${result.message || result.detail || 'Error'}`, 'ERROR', 'Pipeline');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      appendConsoleMessage(`Connection failed while stopping: ${message}`, 'ERROR', 'Pipeline');
    }
  };

  // Start Single Analysis
  const handleStartSingleAnalysis = async (
    file: string,
    onSuccess?: () => void,
    onError?: ((errMsg: string) => void) | string[],
    modes?: string[]
  ): Promise<boolean> => {
    let resolvedModes = modes;
    let resolvedOnError = typeof onError === 'function' ? onError : undefined;
    if (Array.isArray(onError)) {
      resolvedModes = onError;
    }

    if (statusInfo.connected === false) {
      const offlineMsg = 'media_cataloger AI Engine is offline or disconnected. Please ensure the Python service is running.';
      appendConsoleMessage(
        'Cannot trigger single file analysis: media_cataloger AI Engine is offline or disconnected.',
        'WARN',
        'Pipeline'
      );
      if (resolvedOnError) {
        resolvedOnError(offlineMsg);
      } else {
        alert(offlineMsg);
      }
      return false;
    }

    const modeDesc = resolvedModes && resolvedModes.length ? ` [${resolvedModes.join(', ')}]` : '';
    appendConsoleMessage(`Triggering single file AI analysis for '${file}'${modeDesc}...`, 'INFO', 'Pipeline');
    try {
      const modesQuery = resolvedModes && resolvedModes.length ? `&modes=${encodeURIComponent(resolvedModes.join(','))}` : '';
      const payload = resolvedModes && resolvedModes.length ? { file, modes: resolvedModes } : undefined;
      const res = await authFetch(`/api/analyze-file?file=${encodeURIComponent(file)}${modesQuery}`, {
        method: 'POST',
        headers: payload ? { 'Content-Type': 'application/json' } : undefined,
        body: payload ? JSON.stringify(payload) : undefined,
      });
      const result = await res.json().catch(() => ({}));
      if (res.ok) {
        appendConsoleMessage(`Triggered file analysis successfully: ${result.message || 'Started'}`, 'INFO', 'Pipeline');
        if (onSuccess) onSuccess();
        checkStatus();
        fetchLogsInternal();
        // Follow-up refreshes to ensure new metadata/faces are shown as soon as worker completes
        setTimeout(() => { loadMediaFiles(true); loadFaces(); fetchLogsInternal(); }, 2500);
        setTimeout(() => { loadMediaFiles(true); loadFaces(); fetchLogsInternal(); }, 6000);
        setTimeout(() => { loadMediaFiles(true); loadFaces(); fetchLogsInternal(); }, 12000);
        return true;
      } else {
        if (res.status === 401) {
          setIsLoginOpen(true);
        }
        const errMsg = result.message || result.detail || result.error || `HTTP ${res.status}: Failed to start file analysis`;
        appendConsoleMessage(
          `Failed to analyze file '${file}': ${errMsg}`,
          'ERROR',
          'Pipeline',
          `HTTP ${res.status} on POST /api/analyze-file?file=${encodeURIComponent(file)}\nDiagnosis: Single-file AI cataloging worker failed.\nSuggestion: Check if media_cataloger Python service is active and responsive.`
        );
        if (resolvedOnError) {
          resolvedOnError(errMsg);
        } else {
          alert(`Analysis Error:\n${errMsg}`);
        }
        return false;
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown network error';
      appendConsoleMessage(`Network error during single file analysis: ${message}`, 'ERROR', 'Pipeline');
      if (resolvedOnError) {
        resolvedOnError(`Network error connecting to backend: ${message}`);
      } else {
        alert(`Network error connecting to server: ${message}`);
      }
      return false;
    }
  };

  // Initial load
  useEffect(() => {
    checkStatus();
    loadSettings();
    loadFaces();
    loadMediaFiles();
    fetchLogsInternal();

    // Poll status every 2 seconds
    const statusInterval = setInterval(() => {
      checkStatus();
    }, 2000);

    // Poll face registry and media files every 10 seconds when idle
    const facesInterval = setInterval(() => {
      if (statusRef.current !== 'running' && statusRef.current !== 'paused') {
        loadFaces();
        loadMediaFiles();
      }
    }, 10000);

    return () => {
      clearInterval(statusInterval);
      clearInterval(facesInterval);
    };
  }, [checkStatus, loadSettings, loadFaces, loadMediaFiles, fetchLogsInternal]);

  // Navigate to Family Tree and focus on person
  const handleViewInFamilyTree = useCallback((personName: string, personId?: string) => {
    setActiveTab('family_tree');
    if (personId) {
      setTreeStore({
        selectedPersonId: personId,
        highlightedPersonId: personId,
        isDetailDrawerOpen: true,
        drawerActiveTab: 'bio',
      });
    } else if (personName) {
      setTreeStore({
        searchQuery: personName,
      });
    }
  }, []);

  const isRunning = statusInfo.status === 'running';
  const isPaused = statusInfo.status === 'paused';

  return (
    <div
      className="app-container"
      style={{ '--max-dashboard-width': `${uiSettings.maxWidth || 1600}px` } as React.CSSProperties}
    >
      <Header
        statusInfo={statusInfo}
        onOpenSettings={() => {
          setSettingsTab('execution');
          setActiveTab('settings');
        }}
        onOpenAppearanceSettings={() => {
          setSettingsTab('appearance');
          setActiveTab('settings');
        }}
        onOpenLogin={() => setIsLoginOpen(true)}
        onOpenVault={() => setIsVaultOpen(true)}
        showLogs={showLogs}
        onToggleLogs={() => setShowLogs((prev) => !prev)}
        isScanning={isMediaLoading || Boolean(scanProgress?.is_scanning)}
        scannedFilesCount={scanProgress?.scanned_count || 0}
        currentLoadingFilename={
          scanProgress?.current_filename ||
          (scanProgress?.current_file ? scanProgress.current_file.split(/[/\\]/).pop() : null)
        }
        isNavExpanded={isNavExpanded}
        onToggleNavExpanded={handleToggleNav}
        activeTab={activeTab}
      />

      <div className="app-body-layout">
        {/* Dedicated Navigation items container on the left side */}
        <HeaderNavTabs
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          isExpanded={isNavExpanded}
        />

        <main className="app-main-content">
          {activeTab === 'main' && (
            <GalleryScreen
              mediaFiles={mediaFiles}
              isLoading={isMediaLoading}
              isBackgroundLoading={isBackgroundLoading}
              totalKnownFiles={totalKnownFiles}
              onRefresh={loadMediaFiles}
              onFetchMore={fetchMoreMediaFiles}
              onStartSingleAnalysis={handleStartSingleAnalysis}
              onSwitchToControls={() => setActiveTab('media_library')}
              persons={persons}
              uiSettings={uiSettings}
              disabled={isRunning || isPaused}
              onReloadFaces={loadFaces}
              onViewInFamilyTree={handleViewInFamilyTree}
              currentLoadingFile={
                scanProgress?.current_file ||
                statusInfo.progress?.current_file ||
                (statusInfo.queue?.in_flight_files && statusInfo.queue.in_flight_files.length > 0
                  ? statusInfo.queue.in_flight_files[0]
                  : null)
              }
              currentLoadingFilename={
                scanProgress?.current_filename ||
                (scanProgress?.current_file ? scanProgress.current_file.split(/[/\\]/).pop() : null)
              }
              scannedFilesCount={scanProgress?.scanned_count || 0}
              activeInputFolders={settings?.input_folders || []}
              isEngineConnected={Boolean(statusInfo.connected)}
            />
          )}

          {activeTab === 'duplicates' && (
            <DuplicatesScreen
              onRefreshMedia={() => loadMediaFiles(true)}
              activeInputFolders={settings?.input_folders || []}
            />
          )}

          {activeTab === 'vault' && (
            <VaultScreen
              isUnlocked={isUnlocked}
              isConfigured={isConfigured}
              onOpenVaultModal={() => setIsVaultOpen(true)}
              mediaFiles={mediaFiles}
              isLoading={isMediaLoading}
              isBackgroundLoading={isBackgroundLoading}
              onRefresh={loadMediaFiles}
              onFetchMore={fetchMoreMediaFiles}
              onStartSingleAnalysis={handleStartSingleAnalysis}
              onSwitchToControls={() => setActiveTab('media_library')}
              persons={persons}
              uiSettings={uiSettings}
              disabled={isRunning || isPaused}
              onReloadFaces={loadFaces}
              onViewInFamilyTree={handleViewInFamilyTree}
              scannedFilesCount={scanProgress?.scanned_count || 0}
              activeInputFolders={settings?.input_folders || []}
            />
          )}

          {activeTab === 'media_library' && (
            <MediaLibraryScreen
              faces={faces}
              persons={persons}
              unrecognizedFaces={unrecognizedFaces}
              unrecognizedGroups={unrecognizedGroups}
              isLoading={facesLoading}
              error={facesError}
              onRenameFace={handleRenameFace}
              onAssignFace={handleAssignFace}
              onAssignGroup={handleAssignGroup}
              onResetFace={handleResetFace}
              onResetFacesByFilename={handleResetFacesByFilename}
              onDeleteFace={handleDeleteFace}
              onDeleteFacesBatch={handleDeleteFacesBatch}
              disabled={isRunning || isPaused || !canManageFaces}
              uiSettings={uiSettings}
              onViewInFamilyTree={handleViewInFamilyTree}
              isRunning={isRunning}
              isPaused={isPaused}
              currentTask={statusInfo.current_task}
              onStartSync={handleStartSync}
              onPauseSync={handlePauseSync}
              onResumeSync={handleResumeSync}
              onStopSync={handleStopSync}
              onStartSingleAnalysis={handleStartSingleAnalysis}
              onPickSingleFile={handlePickFile}
              pickerPending={pickerPending}
              statusInfo={statusInfo}
              settings={settings}
              onSaveSettings={handleSaveSettings}
              onRefreshMedia={() => loadMediaFiles(true)}
              onRescanSeries={async () => {
                await mediaCacheService.clear();
                await loadMediaFiles(true);
              }}
              scanProgress={scanProgress}
            />
          )}

          {activeTab === 'family_tree' && (
            <FamilyTreeScreen />
          )}

          {activeTab === 'settings' && (
            <SettingsScreen
              settings={settings}
              onSaveSettings={handleSaveSettings}
              onPickFolder={handlePickFolder}
              isRunning={isRunning}
              isPaused={isPaused}
              currentTask={statusInfo.current_task}
              onStartSync={handleStartSync}
              onPauseSync={handlePauseSync}
              onResumeSync={handleResumeSync}
              onStopSync={handleStopSync}
              onStartSingleAnalysis={handleStartSingleAnalysis}
              onPickSingleFile={handlePickFile}
              pickerPending={pickerPending}
              uiSettings={uiSettings}
              onSaveUiSettings={handleSaveUiSettings}
              initialTab={settingsTab}
              onTabChange={(tab) => setSettingsTab(tab)}
              onRefreshMedia={() => loadMediaFiles(true)}
              onRescanSeries={async () => {
                await mediaCacheService.clear();
                await loadMediaFiles(true);
              }}
              scanProgress={scanProgress}
              onNavigateToTreeSettings={() => {
                setActiveTab('family_tree');
                setTreeStore({ activeSubTab: 'settings' });
              }}
            />
          )}

          {activeTab === 'admin' && (
            <AdminScreen
              canAccessAdmin={canAccessAdmin}
              onOpenLogin={() => setIsLoginOpen(true)}
              statusInfo={statusInfo}
              mediaFilesCount={mediaFiles.length}
              facesCount={faces.length}
              mediaFiles={mediaFiles}
              onRefreshMedia={() => loadMediaFiles(true)}
              onStartSingleAnalysis={handleStartSingleAnalysis}
              uiSettings={uiSettings}
              onReloadFaces={loadFaces}
              onViewInFamilyTree={handleViewInFamilyTree}
            />
          )}
        </main>
      </div>

      <PipelineLogs
        isOpen={showLogs}
        onClose={() => setShowLogs(false)}
        logs={logsList}
        onRefreshLogs={handleRefreshLogs}
        onClearLogs={handleClearLogs}
        isRefreshing={isRefreshingLogs}
      />

      <LoginModal
        isOpen={isLoginOpen}
        onClose={() => setIsLoginOpen(false)}
      />

      <VaultModal
        isOpen={isVaultOpen}
        onClose={() => setIsVaultOpen(false)}
        onUnlocked={() => {
          loadMediaFiles(true);
        }}
      />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <VaultProvider>
        <AppMain />
      </VaultProvider>
    </AuthProvider>
  );
}
