import { useState, useEffect, useMemo } from 'react';
import type {
  GalleryMediaFile,
  DetectedFaceRecord,
  PersonItem,
  FamilyContextData,
} from '../../models';
import { useLanguage } from '../../i18n/LanguageContext';
import { useAuth } from '../../services/authContext';
import { useVault } from '../../services/vaultContext';
import { useFamilyTreeStore } from '../../packages/family-tree/state/useFamilyTreeStore';
import MetadataEditorModal from './MetadataEditorModal';
import ModuleStatusBadges from './ModuleStatusBadges';
import './MediaViewerModal.css';

const CATEGORY_ICONS: Record<string, string> = {
  BIRTH: '👶',
  DEATH: '🕊️',
  MARRIAGE: '💍',
  DIVORCE: '💔',
  RELATIONSHIP: '💞',
  CHILD_BORN: '🍼',
  GRADUATION: '🎓',
  RELOCATION: '📍',
  TRAVEL: '✈️',
  CAREER: '💼',
  MILITARY: '🎖️',
  CUSTOM: '📝',
  ANNIVERSARY: '🥂',
};

const CATEGORY_COLORS: Record<string, string> = {
  BIRTH: '#10b981',
  DEATH: '#94a3b8',
  MARRIAGE: '#ec4899',
  DIVORCE: '#f43f5e',
  RELATIONSHIP: '#f43f5e',
  CHILD_BORN: '#38bdf8',
  GRADUATION: '#f59e0b',
  RELOCATION: '#8b5cf6',
  TRAVEL: '#06b6d4',
  CAREER: '#6366f1',
  MILITARY: '#14b8a6',
  CUSTOM: '#a855f7',
  ANNIVERSARY: '#eab308',
};

export interface MediaViewerModalProps {
  isOpen?: boolean;
  mediaFile: GalleryMediaFile | null;
  seriesGroupFiles?: GalleryMediaFile[];
  onClose: () => void;
  currentIndex?: number;
  totalFiles?: number;
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  onRefresh?: () => void;
  onReloadFaces?: () => Promise<void> | void;
  onStartSingleAnalysis?: (
    filePath: string,
    onSuccess?: () => void,
    onError?: (errMsg: string) => void
  ) => Promise<boolean | void> | void;
  onViewInFamilyTree?: (personName: string, personId?: string) => void;
  persons?: PersonItem[];
  knownPersonOptions?: { name: string; avatarUrl?: string | null; count: number }[];
  disabled?: boolean;
  isEngineConnected?: boolean;
  onMediaUpdated?: (updated: GalleryMediaFile) => void;
}

export default function MediaViewerModal({
  isOpen = true,
  mediaFile,
  seriesGroupFiles,
  onClose,
  currentIndex = -1,
  totalFiles = 0,
  onPrev,
  onNext,
  hasPrev = false,
  hasNext = false,
  onRefresh,
  onReloadFaces,
  onStartSingleAnalysis,
  onViewInFamilyTree,
  persons = [],
  knownPersonOptions = [],
  disabled = false,
  isEngineConnected = true,
  onMediaUpdated,
}: MediaViewerModalProps) {
  const { t, language } = useLanguage();
  const { authFetch, isAdmin, canEdit, canManageFaces } = useAuth();
  const { addVaultItem, removeVaultItem } = useVault();
  const { galleryKinshipFactsConfig, treeDataVersion } = useFamilyTreeStore();

  // Selected media state (can be updated locally on tagging/vault actions)
  const [selectedMedia, setSelectedMedia] = useState<GalleryMediaFile | null>(() => {
    if (!mediaFile) return null;
    return {
      ...mediaFile,
      similar_group_files: mediaFile.similar_group_files || seriesGroupFiles,
      similar_files_count: mediaFile.similar_files_count || seriesGroupFiles?.length,
    };
  });
  const [facesForSelected, setFacesForSelected] = useState<DetectedFaceRecord[]>([]);
  const [selectedFaceId, setSelectedFaceId] = useState<string | null>(null);
  const [imageNaturalDimensions, setImageNaturalDimensions] = useState<{ width: number; height: number } | null>(null);
  const [loadingFaces, setLoadingFaces] = useState(false);
  const [engineOnline, setEngineOnline] = useState<boolean>(isEngineConnected);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisSuccess, setAnalysisSuccess] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Sync prop changes while preserving series group files
  useEffect(() => {
    if (mediaFile) {
      setSelectedMedia((prev) => {
        const groupFiles = mediaFile.similar_group_files || seriesGroupFiles || prev?.similar_group_files;
        return {
          ...mediaFile,
          similar_group_files: groupFiles,
          similar_files_count: groupFiles ? groupFiles.length : (mediaFile.similar_files_count || prev?.similar_files_count),
          similarity_group_id: mediaFile.similarity_group_id || prev?.similarity_group_id,
        };
      });
    } else {
      setSelectedMedia(null);
    }
  }, [mediaFile, seriesGroupFiles]);

  const [videoPlaybackError, setVideoPlaybackError] = useState(false);
  useEffect(() => {
    setVideoPlaybackError(false);
    setSelectedFaceId(null);
    setImageNaturalDimensions(null);
  }, [selectedMedia?.file_path, selectedMedia?.filename]);

  // Derived effective group files for the carousel
  const effectiveGroupFiles = useMemo(() => {
    if (selectedMedia?.similar_group_files && selectedMedia.similar_group_files.length > 1) {
      return selectedMedia.similar_group_files;
    }
    if (seriesGroupFiles && seriesGroupFiles.length > 1) {
      return seriesGroupFiles;
    }
    return undefined;
  }, [selectedMedia?.similar_group_files, seriesGroupFiles]);

  useEffect(() => {
    setEngineOnline(isEngineConnected);
  }, [isEngineConnected]);

  // Dynamically poll status to track AI engine availability in real-time
  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;
    const verifyConnection = async () => {
      try {
        const res = await fetch('/api/status');
        if (res.ok && isMounted) {
          const data = await res.json();
          setEngineOnline(Boolean(data.connected));
        } else if (isMounted) {
          setEngineOnline(false);
        }
      } catch {
        if (isMounted) {
          setEngineOnline(false);
        }
      }
    };

    verifyConnection();
    const interval = setInterval(verifyConnection, 2500);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [isOpen]);

  // Fetch the absolute freshest media details and sidecar analysis for the current file
  const fetchCurrentMediaDetails = async (filePathTarget?: string) => {
    const target = filePathTarget || selectedMedia?.file_path || selectedMedia?.filename;
    if (!target) return;
    try {
      const fetchFn = authFetch || fetch;
      const res = await fetchFn(`/api/media/file-info?file=${encodeURIComponent(target)}`);
      if (res.ok) {
        const freshData: GalleryMediaFile = await res.json();
        if (freshData) {
          setSelectedMedia((prev) => {
            if (!prev) return freshData;
            return {
              ...prev,
              ...freshData,
              // preserve client-side series grouping context
              similar_group_files: prev.similar_group_files || seriesGroupFiles,
              similar_files_count: prev.similar_files_count || seriesGroupFiles?.length,
              similarity_group_id: prev.similarity_group_id,
              // ensure we don't accidentally wipe faces if backend returns empty during transit
              faces: (freshData.faces && freshData.faces.length > 0) ? freshData.faces : prev.faces,
              face_names: (freshData.face_names && freshData.face_names.length > 0) ? freshData.face_names : prev.face_names,
            };
          });
          if (onMediaUpdated) onMediaUpdated(freshData);
          if (Array.isArray(freshData.faces) && freshData.faces.length > 0) {
            const validFaces = (freshData.faces as DetectedFaceRecord[]).filter((f) => Boolean(f && f.face_id));
            const uniqueFaces = Array.from(new Map(validFaces.map((f) => [f.face_id, f])).values());
            setFacesForSelected(uniqueFaces);
          }
        }
      }
    } catch (err) {
      console.warn('Could not refresh current media details:', err);
    }
  };

  const handleAnalyzeClick = async () => {
    if (!isEngineConnected || !engineOnline) {
      setAnalysisError(t('aiEngineErrorDescription') || t('aiEngineOfflineTooltip'));
      return;
    }
    if (!onStartSingleAnalysis || !selectedMedia) return;

    setIsAnalyzing(true);
    setAnalysisSuccess(false);
    setAnalysisError(null);
    try {
      const filePath = selectedMedia.file_path || selectedMedia.filename;
      await onStartSingleAnalysis(
        filePath,
        () => {
          setAnalysisSuccess(true);
          setTimeout(() => setAnalysisSuccess(false), 5000);
          fetchCurrentMediaDetails(filePath);
          if (onRefresh) onRefresh();
          if (onReloadFaces) onReloadFaces();

          // Periodically re-fetch details in case AI semantics arrive a few seconds later
          setTimeout(() => { fetchCurrentMediaDetails(filePath); if (onRefresh) onRefresh(); }, 2000);
          setTimeout(() => { fetchCurrentMediaDetails(filePath); if (onRefresh) onRefresh(); }, 5000);
          setTimeout(() => { fetchCurrentMediaDetails(filePath); if (onRefresh) onRefresh(); }, 10000);
        },
        (errMsg) => {
          setAnalysisError(errMsg || t('aiEngineErrorDescription'));
        }
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('aiEngineErrorDescription');
      setAnalysisError(msg);
    } finally {
      setIsAnalyzing(false);
    }
  };
  const [lightboxLang, setLightboxLang] = useState<'active' | 'ru' | 'en'>('active');

  // Person tagging & reassignment state in Lightbox
  const [isAddingPerson, setIsAddingPerson] = useState(false);
  const [selectedPersonToTag, setSelectedPersonToTag] = useState('');
  const [customPersonName, setCustomPersonName] = useState('');
  const [isTagging, setIsTagging] = useState(false);

  const [reassigningFaceId, setReassigningFaceId] = useState<string | null>(null);
  const [reassignTargetPerson, setReassignTargetPerson] = useState('');
  const [reassignCustomName, setReassignCustomName] = useState('');
  const [isReassigning, setIsReassigning] = useState(false);
  const [isEditingMetadata, setIsEditingMetadata] = useState(false);

  // Reset lightbox local UI state when media changes or modal opens
  useEffect(() => {
    if (selectedMedia) {
      setLightboxLang('active');
      setIsAddingPerson(false);
      setIsEditingMetadata(false);
      setSelectedPersonToTag('');
      setCustomPersonName('');
      setReassigningFaceId(null);
      setReassignTargetPerson('');
      setReassignCustomName('');
    }
  }, [selectedMedia?.file_path, selectedMedia?.filename]);

  // Effective language for AI descriptions & EXIF
  const activeDetailLang = lightboxLang === 'active' ? language : lightboxLang;

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

  // Keyboard navigation for Lightbox
  useEffect(() => {
    if (!isOpen || !selectedMedia) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft' && onPrev && (hasPrev ?? currentIndex > 0)) {
        onPrev();
      } else if (e.key === 'ArrowRight' && onNext && (hasNext ?? (currentIndex >= 0 && currentIndex < totalFiles - 1))) {
        onNext();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedMedia, onPrev, onNext, hasPrev, hasNext, currentIndex, totalFiles, onClose]);

  // Fetch faces detected in the selected media file
  useEffect(() => {
    if (!isOpen || !selectedMedia) {
      setFacesForSelected([]);
      return;
    }

    let isMounted = true;
    setLoadingFaces(true);
    const fetchFaces = async () => {
      try {
        const fetchFn = authFetch || fetch;
        const res = await fetchFn(
          `/api/media/faces-for-file?file=${encodeURIComponent(selectedMedia.file_path || selectedMedia.filename)}`
        );
        if (res.ok && isMounted) {
          const data = await res.json();
          const uniqueFaces = Array.isArray(data)
            ? Array.from(new Map(data.map((f: DetectedFaceRecord) => [f.face_id, f])).values())
            : [];
          setFacesForSelected(uniqueFaces);
        }
      } catch (err) {
        console.error('Failed to load faces for file:', err);
      } finally {
        if (isMounted) setLoadingFaces(false);
      }
    };

    fetchFaces();
    return () => {
      isMounted = false;
    };
  }, [isOpen, selectedMedia?.file_path, selectedMedia?.filename, authFetch]);

  // Dynamically analyze & refresh photo kinship and contextual milestones
  useEffect(() => {
    if (!isOpen || !selectedMedia) return;
    const filePath = selectedMedia.file_path || selectedMedia.filename;
    if (!filePath) return;

    let isMounted = true;

    // Collect all known names and face IDs for the current file
    const namesSet = new Set<string>();
    if (Array.isArray(selectedMedia.face_names)) {
      selectedMedia.face_names.forEach((n) => {
        if (n && typeof n === 'string' && n.trim()) namesSet.add(n.trim());
      });
    }
    if (Array.isArray(facesForSelected)) {
      facesForSelected.forEach((f) => {
        if (f.name && typeof f.name === 'string' && f.name.trim()) namesSet.add(f.name.trim());
      });
    }
    if (selectedMedia.family_context?.identified_members) {
      selectedMedia.family_context.identified_members.forEach((m) => {
        if (m.name && typeof m.name === 'string' && m.name.trim()) namesSet.add(m.name.trim());
      });
    }

    const faceIds = Array.from(
      new Set(
        (facesForSelected || [])
          .map((f) => f.face_id)
          .filter((id): id is string => Boolean(id && typeof id === 'string' && !id.startsWith('manual_')))
      )
    );
    const personNames = Array.from(namesSet);

    // If there are no person names or faces, and no existing family context, skip
    if (personNames.length === 0 && faceIds.length === 0 && !selectedMedia.family_context) {
      return;
    }

    const fetchKinship = async () => {
      try {
        const fetchFn = authFetch || fetch;
        const res = await fetchFn('/api/family-tree/public/photo-kinship', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            face_ids: faceIds.length > 0 ? faceIds : undefined,
            person_names: personNames.length > 0 ? personNames : undefined,
            media_file_path: filePath,
            media_date:
              selectedMedia.media_date ||
              selectedMedia.capture_date ||
              (() => {
                const name = selectedMedia.filename || selectedMedia.file_path || '';
                const m = name.match(/(\d{4})[-_](\d{2})[-_](\d{2})/);
                if (m) {
                  return `${m[1]}-${m[2]}-${m[3]}`;
                }
                return selectedMedia.mtime ? new Date(selectedMedia.mtime * 1000).toISOString() : undefined;
              })(),
            gallery_facts_scope: galleryKinshipFactsConfig.scope,
            only_close_events: galleryKinshipFactsConfig.onlyCloseEvents,
            period_before_days: galleryKinshipFactsConfig.periodBeforeDays,
            close_event_types: galleryKinshipFactsConfig.closeEventTypes,
            enabled: galleryKinshipFactsConfig.enabled,
          }),
        });

        if (res.ok && isMounted) {
          const data = await res.json();
          if (data && isMounted) {
            const updatedContext: FamilyContextData = {
              suggested_caption: data.suggestedCaption || undefined,
              summary_description: data.summaryDescription || undefined,
              identified_members: (data.identifiedPersons || []).map((p: any) => ({
                name: p.name,
                tree_person_id: p.treePersonId,
                kinshipToRoot: p.kinshipToRoot?.primaryTerm || p.kinship || null,
                kinship: p.kinshipToRoot?.primaryTerm || p.kinship || null,
                category: p.kinshipToRoot?.category || null,
              })),
              relationships: (data.relationships || []).map((r: any) => ({
                person1: r.personA || r.person1 || r.person_a,
                person2: r.personB || r.person2 || r.person_b,
                relationship: r.kinshipAtoB || r.relationship || r.kinship,
              })),
              milestones: data.contextualMilestones || [],
            };

            setSelectedMedia((prev) => (prev ? { ...prev, family_context: updatedContext } : null));
            if (onMediaUpdated && isMounted) {
              onMediaUpdated({
                ...selectedMedia,
                family_context: updatedContext,
              });
            }
          }
        }
      } catch (err) {
        console.warn('Could not update family kinship context:', err);
      }
    };

    fetchKinship();

    const handleTreeUpdated = () => {
      if (isMounted) fetchKinship();
    };
    window.addEventListener('family_tree_updated', handleTreeUpdated);

    return () => {
      isMounted = false;
      window.removeEventListener('family_tree_updated', handleTreeUpdated);
    };
  }, [
    isOpen,
    selectedMedia?.file_path,
    selectedMedia?.filename,
    facesForSelected,
    galleryKinshipFactsConfig,
    treeDataVersion,
    authFetch,
  ]);

  // Tag / Link a known or new Person to the selected media file
  const handleTagPerson = async () => {
    if (!selectedMedia) return;
    const targetName = selectedPersonToTag === '__custom__' ? customPersonName.trim() : selectedPersonToTag.trim();
    if (!targetName) return;

    setIsTagging(true);
    try {
      const fetchFn = authFetch || fetch;
      const res = await fetchFn('/api/media/add-person', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file: selectedMedia.file_path || selectedMedia.filename,
          name: targetName,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const newFace: DetectedFaceRecord = data.data || {
          face_id: `manual_${Date.now()}`,
          name: targetName,
          person_id: targetName,
          confidence: 1.0,
          is_reference: 1,
          source_file: selectedMedia.file_path || selectedMedia.filename,
        };
        setFacesForSelected((prev) => [...prev, newFace]);
        const existingNames = selectedMedia.face_names || [];
        const newNames = existingNames.includes(targetName) ? existingNames : [...existingNames, targetName];
        const updated: GalleryMediaFile = {
          ...selectedMedia,
          face_count: (selectedMedia.face_count || 0) + 1,
          face_names: newNames,
          faces: [...(selectedMedia.faces || []), newFace],
        };
        setSelectedMedia(updated);
        if (onMediaUpdated) onMediaUpdated(updated);
        setSelectedPersonToTag('');
        setCustomPersonName('');
        setIsAddingPerson(false);
        if (onRefresh) onRefresh();
        if (onReloadFaces) onReloadFaces();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.detail || err.message || 'Failed to tag person');
      }
    } catch (err) {
      console.error('Failed to tag person:', err);
    } finally {
      setIsTagging(false);
    }
  };

  // Remove or unlink a face / person from the selected media file
  const handleRemoveFace = async (faceId: string) => {
    if (!selectedMedia) return;
    try {
      const fetchFn = authFetch || fetch;
      const res = await fetchFn('/api/media/remove-face', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file: selectedMedia.file_path || selectedMedia.filename,
          face_id: faceId,
        }),
      });
      if (res.ok) {
        setFacesForSelected((prev) => prev.filter((f) => f.face_id !== faceId));
        const updatedFaces = (selectedMedia.faces || []).filter((f) => f.face_id !== faceId);
        const remainingNames = Array.from(new Set(updatedFaces.map((f) => f.name).filter(Boolean))) as string[];
        const updated: GalleryMediaFile = {
          ...selectedMedia,
          face_count: Math.max(0, (selectedMedia.face_count || 1) - 1),
          face_names: remainingNames,
          faces: updatedFaces,
        };
        setSelectedMedia(updated);
        if (onMediaUpdated) onMediaUpdated(updated);
        if (onRefresh) onRefresh();
        if (onReloadFaces) onReloadFaces();
      }
    } catch (err) {
      console.error('Failed to remove face:', err);
    }
  };

  // Reassign a detected face to a known or new Person
  const handleReassignFace = async (faceId: string, targetName: string) => {
    if (!selectedMedia || !targetName.trim()) return;
    const trimmed = targetName.trim();
    setIsReassigning(true);
    try {
      const fetchFn = authFetch || fetch;
      const res = await fetchFn('/api/faces/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          face_id: faceId,
          name: trimmed,
        }),
      });
      if (res.ok) {
        setFacesForSelected((prev) =>
          prev.map((f) => (f.face_id === faceId ? { ...f, name: trimmed, person_id: trimmed, is_reference: 1 } : f))
        );
        const updatedFaces = (selectedMedia.faces || []).map((f) =>
          f.face_id === faceId ? { ...f, name: trimmed, person_id: trimmed, is_reference: 1 } : f
        );
        const newNames = Array.from(new Set(updatedFaces.map((f) => f.name).filter(Boolean))) as string[];
        const updated: GalleryMediaFile = {
          ...selectedMedia,
          face_names: newNames,
          faces: updatedFaces,
        };
        setSelectedMedia(updated);
        if (onMediaUpdated) onMediaUpdated(updated);
        setReassigningFaceId(null);
        setReassignTargetPerson('');
        setReassignCustomName('');
        if (onRefresh) onRefresh();
        if (onReloadFaces) onReloadFaces();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.detail || err.message || 'Failed to reassign face');
      }
    } catch (err) {
      console.error('Failed to reassign face:', err);
    } finally {
      setIsReassigning(false);
    }
  };

  const handleMetadataSaved = (updated: GalleryMediaFile) => {
    setSelectedMedia(updated);
    if (onMediaUpdated) onMediaUpdated(updated);
    if (onRefresh) onRefresh();
  };

  if (!isOpen || !selectedMedia) {
    return null;
  }

  const isPrevDisabled = hasPrev !== undefined ? !hasPrev : currentIndex <= 0;
  const isNextDisabled = hasNext !== undefined ? !hasNext : currentIndex < 0 || currentIndex >= totalFiles - 1;

  return (
    <>
      <div className="modal-overlay active" onClick={onClose}>
        <div
          className="modal-card media-lightbox-card"
          onClick={(e) => e.stopPropagation()}
          style={{ maxWidth: '1120px', width: '92vw', padding: 0 }}
        >
          {/* Lightbox Header */}
          <div className="media-lightbox-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', minWidth: 0 }}>
              <span style={{ fontSize: '1.2rem' }}>{selectedMedia.is_video ? '🎥' : '📷'}</span>
              <div style={{ minWidth: 0 }}>
                <h3 className="media-lightbox-title" title={selectedMedia.filename}>
                  {selectedMedia.filename}
                </h3>
                <span className="media-lightbox-subtitle">
                  {formatBytes(selectedMedia.file_size)} • {formatDate(selectedMedia.mtime)}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {/* Language View Switcher inside Lightbox */}
              <div
                className="lang-switcher-wrap"
                style={{ marginRight: '0.5rem' }}
                title={t('langPreviewToggle')}
              >
                <button
                  type="button"
                  className={`lang-btn ${activeDetailLang === 'ru' ? 'active' : ''}`}
                  onClick={() => setLightboxLang('ru')}
                  title="Русский"
                >
                  🇷🇺 RU
                </button>
                <button
                  type="button"
                  className={`lang-btn ${activeDetailLang === 'en' ? 'active' : ''}`}
                  onClick={() => setLightboxLang('en')}
                  title="English"
                >
                  🇬🇧 EN
                </button>
              </div>

              {onPrev && (
                <button
                  className="btn-icon"
                  onClick={onPrev}
                  disabled={isPrevDisabled}
                  title={t('prevImageTooltip')}
                  type="button"
                >
                  ◀
                </button>
              )}

              {totalFiles > 0 && currentIndex >= 0 && (
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', padding: '0 0.3rem' }}>
                  {currentIndex + 1} / {totalFiles}
                </span>
              )}

              {onNext && (
                <button
                  className="btn-icon"
                  onClick={onNext}
                  disabled={isNextDisabled}
                  title={t('nextImageTooltip')}
                  type="button"
                >
                  ▶
                </button>
              )}

              <button
                className="close-btn"
                onClick={onClose}
                type="button"
                title={t('closeTooltip')}
                style={{ marginLeft: '0.5rem' }}
              >
                &times;
              </button>
            </div>
          </div>

          {/* Lightbox Main Content Grid */}
          <div className="media-lightbox-body">
            {/* Media Preview Viewport */}
            <div className="media-lightbox-preview">
              <div className="media-preview-content">
                {selectedMedia.is_video ? (
                  <div className="media-lightbox-video-wrap">
                    {!videoPlaybackError ? (
                      <video
                        key={selectedMedia.file_path || selectedMedia.filename}
                        src={`/api/media/file?path=${encodeURIComponent(selectedMedia.file_path || selectedMedia.filename)}`}
                        poster={`/api/media/thumbnail?path=${encodeURIComponent(selectedMedia.file_path || selectedMedia.filename)}&size=1920`}
                        controls
                        autoPlay
                        playsInline
                        preload="metadata"
                        className="media-lightbox-video"
                        onError={() => setVideoPlaybackError(true)}
                      />
                    ) : (
                      <div className="media-lightbox-video-fallback">
                        <img
                          src={`/api/media/thumbnail?path=${encodeURIComponent(selectedMedia.file_path || selectedMedia.filename)}&size=1920`}
                          alt="Video thumbnail preview"
                          className="media-lightbox-video-fallback-img"
                        />
                        <div className="media-lightbox-video-fallback-overlay">
                          <span style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🎥</span>
                          <p style={{ margin: '0 0 0.4rem', fontWeight: 600, color: '#f8fafc', fontSize: '1rem' }}>
                            {selectedMedia.filename}
                          </p>
                          <p style={{ margin: '0 0 1rem', fontSize: '0.82rem', color: '#94a3b8', maxWidth: '420px', lineHeight: 1.4 }}>
                            {t('videoCodecNotice' as any) ||
                              'This video format (.MOV / HEVC) cannot be played directly by the browser. You can download or play it with your local media player.'}
                          </p>
                          <a
                            href={`/api/media/file?path=${encodeURIComponent(selectedMedia.file_path || selectedMedia.filename)}&download=true`}
                            download={selectedMedia.filename}
                            className="btn btn-primary"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none' }}
                          >
                            ⬇️ {t('downloadVideo' as any) || 'Download Original Video'}
                          </a>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <div
                      className="media-lightbox-image-wrapper"
                      style={{
                        position: 'relative',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        maxWidth: '100%',
                        maxHeight: '100%',
                      }}
                    >
                      <img
                        src={
                          /\.(heic|heif)$/i.test(selectedMedia.filename || selectedMedia.file_path || '')
                            ? `/api/media/thumbnail?path=${encodeURIComponent(selectedMedia.file_path || selectedMedia.filename)}&size=1920`
                            : `/api/media/file?path=${encodeURIComponent(selectedMedia.file_path || selectedMedia.filename)}`
                        }
                        alt={selectedMedia.filename}
                        className="media-lightbox-image"
                        onLoad={(e) => {
                          const target = e.currentTarget;
                          setImageNaturalDimensions({
                            width: target.naturalWidth,
                            height: target.naturalHeight,
                          });
                        }}
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          const fallback = target.closest('.media-preview-content')?.querySelector('.media-lightbox-fallback') as HTMLElement;
                          if (fallback) fallback.style.display = 'flex';
                        }}
                      />

                      {/* Green semi-transparent highlight rectangle for selected face/person */}
                      {(() => {
                        if (!selectedFaceId || !imageNaturalDimensions || !imageNaturalDimensions.width || !imageNaturalDimensions.height) {
                          return null;
                        }
                        const face = facesForSelected.find((f) => f.face_id === selectedFaceId);
                        if (!face) return null;
                        const rawBbox = face.bbox || (face as any).bounding_box;
                        let bbox: number[] | null = null;
                        if (Array.isArray(rawBbox)) {
                          bbox = rawBbox;
                        } else if (typeof rawBbox === 'string') {
                          try {
                            bbox = JSON.parse(rawBbox);
                          } catch {
                            bbox = null;
                          }
                        }
                        if (!bbox || bbox.length < 4) return null;

                        const [x1, y1, x2, y2] = bbox;
                        const nw = imageNaturalDimensions.width;
                        const nh = imageNaturalDimensions.height;
                        const leftPct = Math.max(0, Math.min(100, (x1 / nw) * 100));
                        const topPct = Math.max(0, Math.min(100, (y1 / nh) * 100));
                        const widthPct = Math.max(0, Math.min(100 - leftPct, ((x2 - x1) / nw) * 100));
                        const heightPct = Math.max(0, Math.min(100 - topPct, ((y2 - y1) / nh) * 100));

                        return (
                          <div
                            className="face-highlight-rect"
                            style={{
                              position: 'absolute',
                              left: `${leftPct}%`,
                              top: `${topPct}%`,
                              width: `${widthPct}%`,
                              height: `${heightPct}%`,
                              backgroundColor: 'rgba(34, 197, 94, 0.25)',
                              border: '2px solid #22c55e',
                              borderRadius: '4px',
                              boxShadow: '0 0 14px rgba(34, 197, 94, 0.6), inset 0 0 8px rgba(34, 197, 94, 0.2)',
                              pointerEvents: 'none',
                              zIndex: 10,
                              transition: 'all 0.15s ease-out',
                            }}
                          >
                            <div
                              className="face-highlight-label"
                              style={{
                                position: 'absolute',
                                bottom: '100%',
                                left: '0',
                                marginBottom: '4px',
                                background: 'rgba(20, 83, 45, 0.95)',
                                border: '1px solid #22c55e',
                                color: '#f0fdf4',
                                fontSize: '0.72rem',
                                fontWeight: 600,
                                padding: '2px 6px',
                                borderRadius: '4px',
                                whiteSpace: 'nowrap',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
                              }}
                            >
                              <span>{face.name || face.face_id}</span>
                              <span style={{ opacity: 0.85, fontSize: '0.68rem', fontFamily: 'monospace' }}>
                                [{x1}, {y1}, {x2}, {y2}]
                              </span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    <div className="media-lightbox-fallback">
                      <span style={{ fontSize: '3.5rem', marginBottom: '1rem' }}>📷</span>
                      <p style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {selectedMedia.filename}
                      </p>
                      <span style={{ fontSize: '0.82rem', marginTop: '0.5rem', color: 'var(--text-muted)' }}>
                        {selectedMedia.file_path}
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* Similar & Burst Series Minimap Filmstrip */}
              {effectiveGroupFiles && effectiveGroupFiles.length > 1 && (
                <div className="media-viewer-similarity-strip">
                  <div className="similarity-strip-title">
                    <span>{t('similarPhotosInGroup')} ({effectiveGroupFiles.length})</span>
                  </div>
                  <div className="similarity-strip-thumbs">
                    {effectiveGroupFiles.map((simFile: GalleryMediaFile, idx: number) => {
                      const isCurrent =
                        (simFile.file_path && simFile.file_path === selectedMedia?.file_path) ||
                        (simFile.filename && simFile.filename === selectedMedia?.filename);
                      const thumbUrl = `/api/media/thumbnail?path=${encodeURIComponent(simFile.file_path || simFile.filename)}&size=150`;

                      return (
                        <button
                          key={simFile.file_path || simFile.filename || idx}
                          type="button"
                          className={`similarity-strip-thumb ${isCurrent ? 'active' : ''}`}
                          onClick={() => {
                            const updatedSimFile = {
                              ...simFile,
                              similar_group_files: effectiveGroupFiles,
                              similar_files_count: effectiveGroupFiles.length,
                              similarity_group_id: simFile.similarity_group_id || selectedMedia.similarity_group_id,
                            };
                            setSelectedMedia(updatedSimFile);
                            fetchCurrentMediaDetails(updatedSimFile.file_path || updatedSimFile.filename);
                            if (onMediaUpdated) onMediaUpdated(updatedSimFile);
                          }}
                          title={`${simFile.filename} (#${idx + 1})`}
                        >
                          <img
                            src={thumbUrl}
                            alt={simFile.filename}
                            loading="lazy"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                              const fallback = target.nextElementSibling as HTMLElement;
                              if (fallback) fallback.style.display = 'flex';
                            }}
                          />
                          <div
                            className="similarity-thumb-fallback"
                            style={{
                              display: 'none',
                              width: '100%',
                              height: '100%',
                              alignItems: 'center',
                              justifyContent: 'center',
                              background: '#1e1b4b',
                              fontSize: '1rem',
                            }}
                          >
                            {simFile.is_video ? '🎥' : '📷'}
                          </div>
                          <span className="strip-index-badge">#{idx + 1}</span>
                          {simFile.is_video && (
                            <span className="strip-video-indicator" title="Video">▶</span>
                          )}
                          {simFile.is_primary_in_group && (
                            <span className="strip-primary-badge" title="Representative Primary">★</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Media Sidebar / Details Panel */}
            <div className="media-lightbox-sidebar">
              {/* File Details Section */}
              <div className="lightbox-section">
                <div className="btn-edit-metadata-button" style={{ display: 'flex', justifyContent: 'left', alignItems: 'center', marginBottom: '0.4rem' }}>
                  {isAdmin && (
                    <button
                      className="btn btn-secondary"
                      style={{ padding: '0.2rem 0.55rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem'}}
                      onClick={async () => {
                        const filePath = selectedMedia.file_path || selectedMedia.filename;
                        if (selectedMedia.is_vault) {
                          await removeVaultItem(filePath);
                          const updated = { ...selectedMedia, is_vault: false };
                          setSelectedMedia(updated);
                          if (onMediaUpdated) onMediaUpdated(updated);
                        } else {
                          await addVaultItem(filePath);
                          const updated = { ...selectedMedia, is_vault: true };
                          setSelectedMedia(updated);
                          if (onMediaUpdated) onMediaUpdated(updated);
                        }
                        if (onRefresh) onRefresh();
                      }}
                      type="button"
                      title={selectedMedia.is_vault
                        ? `🔒 ${t('vaultRemoveFromVault' as any) || 'Remove from Secret Vault'}`
                        : `🔓 ${t('vaultAddToVault' as any) || 'Move to Secret Vault'}`}
                    >
                      {selectedMedia.is_vault
                        ? `🔒`
                        : `🔓`}
                    </button>
                  )}
                  <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                    <h4 className="lightbox-section-title" style={{ margin: 0 }}>{t('fileDetails')}</h4>
                    {canEdit && selectedMedia.status === 'PROCESSED' && (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ padding: '0.2rem 0.55rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                        onClick={() => setIsEditingMetadata(true)}
                        title={t('btnEditMetadata')}
                      >
                        {t('btnEditMetadata')}
                      </button>
                    )}
                  </div>
                </div>
                <div className="lightbox-detail-row">
                  <span className="lightbox-label">{t('fullPath')}:</span>
                  <span className="lightbox-value" title={selectedMedia.file_path || selectedMedia.filename}>
                    {selectedMedia.file_path || selectedMedia.filename}
                  </span>
                </div>
                <div className="lightbox-detail-row" style={{ alignItems: 'flex-start' }}>
                  <span className="lightbox-label">{t('status')}:</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', flex: 1 }}>
                    <span
                      className={`badge-pill ${selectedMedia.status === 'PROCESSED'
                        ? 'badge-pill-success'
                        : selectedMedia.status === 'PENDING'
                          ? 'badge-pill-warning'
                          : 'badge-pill-secondary'
                        }`}
                      style={{ alignSelf: 'flex-start' }}
                    >
                      {selectedMedia.status || 'UNPROCESSED'}
                    </span>
                    <ModuleStatusBadges media={selectedMedia} variant="chips" />
                  </div>
                </div>
              </div>

              {/* Family Tree Kinship & Context Section */}
              {Boolean(
                selectedMedia.family_context?.suggested_caption ||
                (selectedMedia.family_context?.identified_members &&
                  selectedMedia.family_context.identified_members.length > 0) ||
                (selectedMedia.family_context?.milestones &&
                  selectedMedia.family_context.milestones.length > 0)
              ) && (
                  <div className="lightbox-section lightbox-family-context">
                    {selectedMedia.family_context?.relationships &&
                      selectedMedia.family_context.relationships.length > 0 && (
                        <div className="lightbox-family-relationships">
                          {selectedMedia.family_context.relationships.map((rel, idx) => {
                            const p1 = rel.person1 || (rel as any).personA || (rel as any).person_a;
                            const p2 = rel.person2 || (rel as any).personB || (rel as any).person_b;
                            const r = rel.relationship || (rel as any).kinshipAtoB || (rel as any).kinship;
                            return (
                              <div key={idx}>
                                💞 <strong style={{ color: 'var(--text-primary)' }}>{p1}</strong> &amp;{' '}
                                <strong style={{ color: 'var(--text-primary)' }}>{p2}</strong>: {r}
                              </div>
                            );
                          })}
                        </div>
                      )}

                    {(() => {
                      const rawMilestones = selectedMedia.family_context?.milestones;
                      if (!rawMilestones || rawMilestones.length === 0) return null;

                      const uniqueMilestones: typeof rawMilestones = [];
                      const seenCoupleKeys = new Set<string>();
                      const seenSharedKeys = new Set<string>();

                      for (const ms of rawMilestones) {
                        const pName = (ms.personName || '').replace(/\s*\([^)]*\)\s*$/, '').trim().toLowerCase();
                        const title = (ms.title || '').trim();
                        const titleLower = title.toLowerCase();
                        const date = (ms.date || '').trim();

                        // Reciprocal couple duplicate check (e.g. "Partnership with Oxana Wagner" on Anton and "Partnership with Anton Rokhlin" on Oxana)
                        const partnerMatch = titleLower
                          .replace(/^(partnership with|married to|married|divorced from|divorced|separated from|брак с|партнерство с|развод с)\s+/i, '')
                          .trim();
                        if (partnerMatch && partnerMatch !== titleLower) {
                          const coupleKey = [pName, partnerMatch].sort().join('___') + '_' + date;
                          if (seenCoupleKeys.has(coupleKey)) continue;
                          seenCoupleKeys.add(coupleKey);
                        }

                        // Exact same title & date across different relatives
                        const sharedKey = `${titleLower}_${date}`;
                        if (seenSharedKeys.has(sharedKey)) continue;
                        seenSharedKeys.add(sharedKey);

                        uniqueMilestones.push(ms);
                      }

                      if (uniqueMilestones.length === 0) return null;

                      return (
                        <div className="lightbox-family-milestones" style={{ marginTop: '0.6rem', borderTop: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))', paddingTop: '0.5rem' }}>
                          <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                            <span className="lightbox-family-caption">
                              ✨ Important facts for You
                            </span>
                            {selectedMedia.family_context?.identified_members &&
                              selectedMedia.family_context.identified_members.length > 0 && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: '0.4rem' }}>
                                  {selectedMedia.family_context.identified_members.map((m) => {
                                    return (
                                      <button
                                        key={m.name}
                                        type="button"
                                        className="badge-pill"
                                        style={{
                                          background: 'var(--nav-tab-active-bg, rgba(99, 102, 241, 0.25))',
                                          border: '1px solid var(--border-color-hover, rgba(99, 102, 241, 0.5))',
                                          color: 'var(--text-primary)',
                                          cursor: onViewInFamilyTree ? 'pointer' : 'default',
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: '0.25rem',
                                        }}
                                        onClick={() => {
                                          if (onViewInFamilyTree) {
                                            onClose();
                                            onViewInFamilyTree(m.name);
                                          }
                                        }}
                                        title={onViewInFamilyTree ? t('viewInFamilyTree', { name: m.name }) : m.name}
                                      >
                                        <span className="lightbox-badge-pill-text-variant-1">👤 {m.name}</span>
                                        <span className="lightbox-badge-pill-text-variant-2" style={{ color: 'var(--primary-color)', fontWeight: 700 }}>Me In Family Tree</span>

                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                          </div>
                          <div
                            className="lightbox-family-milestones-list"
                            style={{
                              maxHeight: 280,
                              overflowY: 'auto',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '0.4rem',
                              paddingRight: '4px',
                            }}
                          >
                            {uniqueMilestones.map((ms, idx) => {
                              const cat = (ms.eventType || ms.type || ms.category || 'CUSTOM').toUpperCase();
                              const icon = CATEGORY_ICONS[cat] || '⭐';
                              const color = CATEGORY_COLORS[cat] || '#6366f1';
                              const approxPrefix = ms.date_is_approximate ? (language === 'ru' ? 'ок. ' : 'circa ') : '';
                              const dateDisplay = ms.date
                                ? `${approxPrefix}${ms.date}${ms.end_date ? ` – ${ms.end_date}` : ''}`
                                : null;

                              return (
                                <div
                                  key={idx}
                                  style={{
                                    background: 'var(--card-bg, rgba(255, 255, 255, 0.03))',
                                    border: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
                                    borderRadius: 8,
                                    padding: '6px 10px',
                                    fontSize: '0.75rem',
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '2px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                      <span
                                        style={{
                                          background: `${color}25`,
                                          color: color,
                                          border: `1px solid ${color}40`,
                                          borderRadius: 4,
                                          padding: '1px 6px',
                                          fontSize: '0.65rem',
                                          fontWeight: 700,
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '3px',
                                        }}
                                      >
                                        <span>{icon}</span>
                                        <span>{cat}</span>
                                      </span>
                                      {ms.personName && (
                                        <span
                                          style={{
                                            color: 'var(--text-primary)',
                                            fontWeight: 600,
                                            fontSize: '0.72rem',
                                          }}
                                        >
                                          👤 {ms.personName}
                                        </span>
                                      )}
                                    </div>
                                    {dateDisplay && (
                                      <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', fontWeight: 500 }}>
                                        📅 {dateDisplay}
                                      </span>
                                    )}
                                  </div>
                                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: '2px', lineHeight: 1.3 }}>
                                    {ms.title}
                                  </div>
                                  {ms.description && (
                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '2px', lineHeight: 1.35 }}>
                                      {ms.description}
                                    </div>
                                  )}
                                  {ms.location && (
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '3px', marginTop: '3px' }}>
                                      <span>📍</span>
                                      <span>{ms.location}</span>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}

              {/* AI Semantic Description & Attributes Section */}
              {(selectedMedia.description_ru ||
                selectedMedia.description ||
                selectedMedia.summary_ru ||
                selectedMedia.summary ||
                selectedMedia.lighting ||
                selectedMedia.weather ||
                selectedMedia.time_of_day ||
                selectedMedia.ocr_text ||
                selectedMedia.exif_analysis ||
                selectedMedia.transcription) && (
                  <div className="lightbox-section">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h4 className="lightbox-section-title">{t('aiDescription')}</h4>
                    </div>

                    {/* Localized Description & Summary */}
                    {activeDetailLang === 'ru' ? (
                      <>
                        {(selectedMedia.description_ru || selectedMedia.description) && (
                          <div className="lightbox-desc-block">
                            <p className="lightbox-desc-text">
                              {selectedMedia.description_ru || selectedMedia.description}
                            </p>
                          </div>
                        )}
                        {(selectedMedia.summary_ru || selectedMedia.summary) && (
                          <div className="lightbox-desc-block" style={{ marginTop: '0.4rem' }}>
                            <span className="lightbox-desc-lang-tag">{t('summaryBadge')}</span>
                            <p className="lightbox-desc-text" style={{ fontSize: '0.82rem' }}>
                              {selectedMedia.summary_ru || selectedMedia.summary}
                            </p>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        {(selectedMedia.description || selectedMedia.description_ru) && (
                          <div className="lightbox-desc-block">
                            <p className="lightbox-desc-text">
                              {selectedMedia.description || selectedMedia.description_ru}
                            </p>
                          </div>
                        )}
                        {(selectedMedia.summary || selectedMedia.summary_ru) && (
                          <div className="lightbox-desc-block" style={{ marginTop: '0.4rem' }}>
                            <span className="lightbox-desc-lang-tag">{t('summaryBadge')}</span>
                            <p className="lightbox-desc-text" style={{ fontSize: '0.82rem' }}>
                              {selectedMedia.summary || selectedMedia.summary_ru}
                            </p>
                          </div>
                        )}
                      </>
                    )}

                    {/* Rich Localized Semantic Badges/Details */}
                    <div className="lightbox-meta-grid" style={{ marginTop: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      {selectedMedia.environment && (
                        <div className="lightbox-detail-row">
                          <span className="lightbox-label">{t('environment')}:</span>
                          <span className="lightbox-value">
                            {selectedMedia.environment === 'indoor'
                              ? t('environmentIndoor')
                              : selectedMedia.environment === 'outdoor'
                                ? t('environmentOutdoor')
                                : selectedMedia.environment}
                          </span>
                        </div>
                      )}

                      {(selectedMedia.lighting_ru || selectedMedia.lighting) && (
                        <div className="lightbox-detail-row">
                          <span className="lightbox-label">{t('lighting')}:</span>
                          <span className="lightbox-value">
                            {activeDetailLang === 'ru'
                              ? selectedMedia.lighting_ru || selectedMedia.lighting
                              : selectedMedia.lighting || selectedMedia.lighting_ru}
                          </span>
                        </div>
                      )}

                      {(selectedMedia.weather_ru || selectedMedia.weather) && (
                        <div className="lightbox-detail-row">
                          <span className="lightbox-label">{t('weather')}:</span>
                          <span className="lightbox-value">
                            {activeDetailLang === 'ru'
                              ? selectedMedia.weather_ru || selectedMedia.weather
                              : selectedMedia.weather || selectedMedia.weather_ru}
                          </span>
                        </div>
                      )}

                      {(selectedMedia.time_of_day_ru || selectedMedia.time_of_day) && (
                        <div className="lightbox-detail-row">
                          <span className="lightbox-label">{t('timeOfDay')}:</span>
                          <span className="lightbox-value">
                            {activeDetailLang === 'ru'
                              ? selectedMedia.time_of_day_ru || selectedMedia.time_of_day
                              : selectedMedia.time_of_day || selectedMedia.time_of_day_ru}
                          </span>
                        </div>
                      )}

                      {(selectedMedia.exif_analysis_ru || selectedMedia.exif_analysis) && (
                        <div className="lightbox-detail-row">
                          <span className="lightbox-label">{t('exifAnalysis')}:</span>
                          <span className="lightbox-value" style={{ fontSize: '0.78rem' }}>
                            {activeDetailLang === 'ru'
                              ? selectedMedia.exif_analysis_ru || selectedMedia.exif_analysis
                              : selectedMedia.exif_analysis || selectedMedia.exif_analysis_ru}
                          </span>
                        </div>
                      )}

                      {selectedMedia.ocr_text && (
                        <div className="lightbox-detail-row">
                          <span className="lightbox-label">{t('ocrText')}:</span>
                          <span className="lightbox-value" style={{ fontStyle: 'italic' }}>
                            «{selectedMedia.ocr_text}»
                          </span>
                        </div>
                      )}

                      {(selectedMedia.transcription_ru || selectedMedia.transcription) && (
                        <div className="lightbox-detail-row">
                          <span className="lightbox-label">{t('audioTranscription')}:</span>
                          <span className="lightbox-value" style={{ fontStyle: 'italic' }}>
                            {activeDetailLang === 'ru'
                              ? selectedMedia.transcription_ru || selectedMedia.transcription
                              : selectedMedia.transcription || selectedMedia.transcription_ru}
                          </span>
                        </div>
                      )}

                      {selectedMedia.location_name && (
                        <div className="lightbox-detail-row">
                          <span className="lightbox-label">📍 {t('editLocationName')}:</span>
                          <span className="lightbox-value">{selectedMedia.location_name}</span>
                        </div>
                      )}

                      {(selectedMedia.camera_make || selectedMedia.camera_model || selectedMedia.lens_model) && (
                        <div className="lightbox-detail-row">
                          <span className="lightbox-label">📷 {t('editCameraMake')}:</span>
                          <span className="lightbox-value">
                            {[selectedMedia.camera_make, selectedMedia.camera_model, selectedMedia.lens_model].filter(Boolean).join(' ')}
                          </span>
                        </div>
                      )}

                      {selectedMedia.tags && (Array.isArray(selectedMedia.tags) ? selectedMedia.tags.length > 0 : Boolean(selectedMedia.tags)) && (
                        <div style={{ marginTop: '0.4rem', display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                          {(Array.isArray(selectedMedia.tags)
                            ? selectedMedia.tags
                            : typeof selectedMedia.tags === 'string'
                              ? (selectedMedia.tags as string).split(',').map((tagItem: string) => tagItem.trim()).filter(Boolean)
                              : []
                          ).map((tag: string) => (
                            <span
                              key={tag}
                              className="badge-pill"
                              style={{
                                background: 'var(--nav-tab-active-bg, rgba(59, 130, 246, 0.18))',
                                border: '1px solid var(--border-color-hover, rgba(59, 130, 246, 0.35))',
                                color: 'var(--primary-color)',
                                fontSize: '0.72rem',
                                padding: '0.15rem 0.45rem',
                              }}
                            >
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Timeline events for video */}
                    {selectedMedia.timeline_events && selectedMedia.timeline_events.length > 0 && (
                      <div style={{ marginTop: '0.6rem' }}>
                        <span className="lightbox-label" style={{ display: 'block', marginBottom: '0.3rem' }}>
                          {t('timelineEvents')}:
                        </span>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                          {selectedMedia.timeline_events.map((evt, idx) => (
                            <div key={idx} style={{ fontSize: '0.75rem', background: 'var(--input-bg)', border: '1px solid var(--border-color)', padding: '0.3rem 0.5rem', borderRadius: '4px' }}>
                              <span style={{ color: 'var(--accent-color)', fontWeight: 600 }}>
                                {evt.timestamp_start} - {evt.timestamp_end}:
                              </span>{' '}
                              <span>{activeDetailLang === 'ru' ? evt.activity_ru || evt.activity : evt.activity || evt.activity_ru}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

              {/* Detected Faces & Persons on this Image */}
              <div className="lightbox-section" style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                  <h4 className="lightbox-section-title" style={{ margin: 0 }}>
                    {t('detectedFaces')} ({facesForSelected.length})
                  </h4>
                  <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                    {loadingFaces && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {t('loadingFaces')}
                      </span>
                    )}
                    {canManageFaces && (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ padding: '0.2rem 0.55rem', fontSize: '0.75rem' }}
                        onClick={() => setIsAddingPerson((prev) => !prev)}
                        title={t('tagPerson')}
                      >
                        {isAddingPerson ? '✕ ' + t('closeTooltip') : t('tagPerson')}
                      </button>
                    )}
                  </div>
                </div>

                {/* Tag Person Selector Widget */}
                {isAddingPerson && (
                  <div className="lightbox-tag-person-box">
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <select
                        className="input-control select-control"
                        style={{ flex: 1, minWidth: '150px', fontSize: '0.8rem', padding: '0.35rem 0.5rem' }}
                        value={selectedPersonToTag}
                        onChange={(e) => setSelectedPersonToTag(e.target.value)}
                      >
                        <option value="">-- {t('selectPersonPlaceholder')} --</option>
                        {knownPersonOptions.map((p) => (
                          <option key={p.name} value={p.name}>
                            {p.name} ({p.count})
                          </option>
                        ))}
                        <option value="__custom__">{t('addNewPersonOption')}</option>
                      </select>

                      {selectedPersonToTag === '__custom__' && (
                        <input
                          type="text"
                          className="input-control"
                          placeholder={t('customPersonNamePlaceholder')}
                          style={{ flex: 1, minWidth: '130px', fontSize: '0.8rem', padding: '0.35rem 0.5rem' }}
                          value={customPersonName}
                          onChange={(e) => setCustomPersonName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleTagPerson();
                          }}
                        />
                      )}

                      <button
                        type="button"
                        className="btn btn-accent"
                        style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                        onClick={handleTagPerson}
                        disabled={
                          isTagging ||
                          !selectedPersonToTag ||
                          (selectedPersonToTag === '__custom__' && !customPersonName.trim())
                        }
                      >
                        {isTagging ? '...' : t('btnTagPerson')}
                      </button>
                    </div>
                  </div>
                )}

                {facesForSelected.length === 0 ? (
                  <div className='no-faces-indexed-container' style={{ margin: '0.5rem 0' }}>
                    <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '0 0 0.4rem 0' }}>
                      {loadingFaces ? t('loadingFaces') : t('noFacesIndexed')}
                    </p>
                    {!isAddingPerson && canManageFaces && (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ width: '100%', fontSize: '0.8rem', padding: '0.35rem' }}
                        onClick={() => setIsAddingPerson(true)}
                      >
                        {t('tagPerson')}
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="lightbox-faces-list">
                    {facesForSelected.map((f) => {
                      const isManual = !f.face_id || f.face_id.startsWith('manual_') || f.face_id.startsWith('face_manual_');
                      const cropUrl = !isManual
                        ? (f.image_path
                          ? `/api/faces/image/${f.image_path.split(/[/\\]/).pop()}`
                          : f.face_id
                            ? `/api/faces/image/${f.face_id}`
                            : null)
                        : null;
                      const isEditing = reassigningFaceId === f.face_id;
                      const isSelected = selectedFaceId === f.face_id;
                      const rawBbox = f.bbox || (f as any).bounding_box;
                      let bbox: number[] | null = null;
                      if (Array.isArray(rawBbox)) {
                        bbox = rawBbox;
                      } else if (typeof rawBbox === 'string') {
                        try {
                          bbox = JSON.parse(rawBbox);
                        } catch {
                          bbox = null;
                        }
                      }

                      return (
                        <div
                          className={`lightbox-face-item ${isSelected ? 'selected-face' : ''}`}
                          key={f.face_id}
                          onClick={(e) => {
                            if ((e.target as HTMLElement).closest('button, input, select, a')) return;
                            setSelectedFaceId((prev) => (prev === f.face_id ? null : f.face_id));
                          }}
                          style={{ cursor: 'pointer' }}
                          title={bbox ? `Click to highlight face [${bbox.join(', ')}] on photo` : 'Click to select face'}
                        >
                          {cropUrl ? (
                            <img
                              src={cropUrl}
                              alt={f.name || f.face_id}
                              className="lightbox-face-crop"
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = 'none';
                              }}
                            />
                          ) : (
                            <div className="lightbox-face-placeholder">👤</div>
                          )}

                          <div style={{ minWidth: 0, flex: 1 }}>
                            {isEditing ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginTop: '0.2rem' }}>
                                <select
                                  className="input-control select-control"
                                  style={{ fontSize: '0.75rem', padding: '0.25rem' }}
                                  value={reassignTargetPerson}
                                  onChange={(e) => setReassignTargetPerson(e.target.value)}
                                >
                                  <option value="">-- {t('selectPersonPlaceholder')} --</option>
                                  {knownPersonOptions.map((p) => (
                                    <option key={p.name} value={p.name}>
                                      {p.name}
                                    </option>
                                  ))}
                                  <option value="__custom__">{t('addNewPersonOption')}</option>
                                </select>

                                {reassignTargetPerson === '__custom__' && (
                                  <input
                                    type="text"
                                    className="input-control"
                                    placeholder={t('customPersonNamePlaceholder')}
                                    style={{ fontSize: '0.75rem', padding: '0.25rem' }}
                                    value={reassignCustomName}
                                    onChange={(e) => setReassignCustomName(e.target.value)}
                                  />
                                )}

                                <div style={{ display: 'flex', gap: '0.3rem' }}>
                                  <button
                                    type="button"
                                    className="btn btn-accent"
                                    style={{ padding: '0.2rem 0.5rem', fontSize: '0.72rem' }}
                                    disabled={
                                      isReassigning ||
                                      !reassignTargetPerson ||
                                      (reassignTargetPerson === '__custom__' && !reassignCustomName.trim())
                                    }
                                    onClick={() => {
                                      const finalName =
                                        reassignTargetPerson === '__custom__' ? reassignCustomName.trim() : reassignTargetPerson.trim();
                                      handleReassignFace(f.face_id, finalName);
                                    }}
                                  >
                                    ✓
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-secondary"
                                    style={{ padding: '0.2rem 0.5rem', fontSize: '0.72rem' }}
                                    onClick={() => setReassigningFaceId(null)}
                                  >
                                    ✕
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <div className="lightbox-face-name">
                                  {f.name || f.face_id}
                                </div>
                                <div className='known_faces_badge_confidence' style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                  {isManual ? (
                                    <span>{t('badgeManual')}</span>
                                  ) : (
                                    <span>
                                      {f.face_id} • {t('confidence')}: {f.confidence ? `${(f.confidence * 100).toFixed(0)}%` : 'N/A'}
                                    </span>
                                  )}
                                </div>
                                {bbox && bbox.length >= 4 && (
                                  <div
                                    className="lightbox-face-coords"
                                    style={{
                                      fontSize: '0.72rem',
                                      color: isSelected ? '#4ade80' : 'var(--text-muted)',
                                      marginTop: '0.2rem',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '0.35rem',
                                      fontFamily: 'monospace',
                                      flexWrap: 'wrap',
                                    }}
                                  >
                                    <span>📐 {t('faceCoordinates' as any) || 'Coordinates'}: [{bbox[0]}, {bbox[1]}, {bbox[2]}, {bbox[3]}]</span>
                                    {isSelected && (
                                      <span
                                        style={{
                                          background: 'rgba(34, 197, 94, 0.2)',
                                          border: '1px solid #22c55e',
                                          color: '#22c55e',
                                          fontSize: '0.65rem',
                                          padding: '1px 5px',
                                          borderRadius: '4px',
                                          fontFamily: 'sans-serif',
                                          fontWeight: 600,
                                        }}
                                      >
                                        ● {t('highlightFace' as any) || 'Highlighted'}
                                      </span>
                                    )}
                                  </div>
                                )}
                                {!isEditing && (() => {
                                  const matchedPerson = f.name ? persons.find((p) => p.name.toLowerCase() === f.name?.toLowerCase()) : null;
                                  return (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.2rem' }}>
                                      {matchedPerson?.family_tree?.kinship_to_root && (
                                        <span
                                          className="badge-pill"
                                          style={{
                                            background: 'var(--nav-tab-active-bg, rgba(168, 85, 247, 0.25))',
                                            border: '1px solid var(--border-color-hover, rgba(168, 85, 247, 0.5))',
                                            color: 'var(--text-primary)',
                                            fontSize: '0.68rem',
                                            fontWeight: 600,
                                          }}
                                          title="Genealogical Kinship to 'ME' (Root)"
                                        >
                                          🧬 {matchedPerson.family_tree.kinship_to_root}
                                        </span>
                                      )}

                                      {onViewInFamilyTree && f.name && (
                                        <button
                                          id='known_faces_badge_genealogy'
                                          type="button"
                                          className="btn btn-secondary"
                                          style={{
                                            padding: '0.15rem 0.45rem',
                                            fontSize: '0.72rem',
                                            background: 'var(--nav-tab-active-bg, rgba(99, 102, 241, 0.15))',
                                            border: '1px solid var(--border-color-hover, rgba(99, 102, 241, 0.35))',
                                            color: 'var(--primary-color)',
                                          }}
                                          onClick={() => {
                                            onClose();
                                            onViewInFamilyTree(f.name!);
                                          }}
                                          title={t('viewInFamilyTree', { name: f.name })}
                                        >
                                          🌳
                                        </button>
                                      )}
                                    </div>
                                  );
                                })()}
                              </>
                            )}
                          </div>

                          {!isEditing && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                              {canManageFaces && (
                                <>
                                  <button
                                    type="button"
                                    className="btn-icon-subtle"
                                    onClick={() => {
                                      setReassigningFaceId(f.face_id);
                                      setReassignTargetPerson(f.name || '');
                                      setReassignCustomName('');
                                    }}
                                    title={t('changePerson')}
                                  >
                                    ✏️
                                  </button>

                                  <button
                                    type="button"
                                    className="btn-icon-subtle"
                                    style={{ color: 'var(--error-color, #ef4444)' }}
                                    onClick={() => handleRemoveFace(f.face_id)}
                                    title={t('removePersonTooltip')}
                                  >
                                    🗑️
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="lightbox-section lightbox-actions-footer" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {canEdit && selectedMedia.status === 'PROCESSED' && (
                  <button
                    id="edit_metadata_button_id"
                    className="btn btn-secondary"
                    style={{ width: '100%', fontSize: '0.85rem', padding: '0.5rem' }}
                    onClick={() => setIsEditingMetadata(true)}
                    type="button"
                  >
                    ✏️ {t('btnEditMetadata' as any) || 'Edit Metadata'}
                  </button>
                )}

                {isAdmin && (
                  <button
                    id="mov_to_vault_button_id"
                    className="btn btn-secondary"
                    style={{ width: '100%', fontSize: '0.85rem', padding: '0.5rem' }}
                    onClick={async () => {
                      const filePath = selectedMedia.file_path || selectedMedia.filename;
                      if (selectedMedia.is_vault) {
                        await removeVaultItem(filePath);
                        const updated = { ...selectedMedia, is_vault: false };
                        setSelectedMedia(updated);
                        if (onMediaUpdated) onMediaUpdated(updated);
                      } else {
                        await addVaultItem(filePath);
                        const updated = { ...selectedMedia, is_vault: true };
                        setSelectedMedia(updated);
                        if (onMediaUpdated) onMediaUpdated(updated);
                      }
                      if (onRefresh) onRefresh();
                    }}
                    type="button"
                  >
                    {selectedMedia.is_vault
                      ? `🔓 ${t('vaultRemoveFromVault' as any) || 'Remove from Secret Vault'}`
                      : `🔒 ${t('vaultAddToVault' as any) || 'Move to Secret Vault'}`}
                  </button>
                )}

                <button
                  className="btn btn-accent"
                  style={{
                    width: '100%',
                    fontSize: '0.85rem',
                    padding: '0.5rem',
                    opacity: disabled || isAnalyzing || !isEngineConnected || !engineOnline ? 0.6 : 1,
                    cursor: disabled || isAnalyzing || !isEngineConnected || !engineOnline ? 'not-allowed' : 'pointer',
                  }}
                  onClick={handleAnalyzeClick}
                  disabled={disabled || isAnalyzing || !isEngineConnected || !engineOnline}
                  title={!isEngineConnected || !engineOnline ? t('aiEngineOfflineTooltip') : t('btnAnalyzeFile')}
                  type="button"
                >
                  {isAnalyzing ? t('aiAnalyzingInProgress') : t('btnAnalyzeFile')}
                </button>

                {analysisSuccess && (
                  <div
                    style={{
                      padding: '0.45rem 0.65rem',
                      borderRadius: '8px',
                      backgroundColor: 'rgba(34, 197, 94, 0.15)',
                      border: '1px solid rgba(34, 197, 94, 0.3)',
                      color: '#4ade80',
                      fontSize: '0.78rem',
                      textAlign: 'center',
                      animation: 'fadeIn 0.2s ease-out',
                    }}
                  >
                    {t('aiAnalysisStartedSuccess')}
                  </div>
                )}

                <a
                  href={`/api/media/file?path=${encodeURIComponent(selectedMedia.file_path || selectedMedia.filename)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-secondary"
                  style={{ width: '100%', fontSize: '0.85rem', padding: '0.5rem', textAlign: 'center', textDecoration: 'none' }}
                >
                  {t('btnOpenOriginal')}
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* AI Engine Analysis Error Pop-up Modal */}
      {analysisError && (
        <div
          className="modal-overlay active"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            zIndex: 11000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
          onClick={() => setAnalysisError(null)}
        >
          <div
            className="modal-card"
            style={{
              maxWidth: '480px',
              width: '100%',
              backgroundColor: 'var(--modal-bg, #1a1e2d)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              borderRadius: '16px',
              padding: '1.5rem',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.7)',
              animation: 'fadeIn 0.2s ease-out',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '1.8rem' }}>⚠️</span>
              <h3 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--text-primary)' }}>
                {t('aiEngineErrorTitle')}
              </h3>
            </div>
            <p style={{ margin: '0 0 1rem 0', color: 'var(--text-secondary, #94a3b8)', fontSize: '0.88rem', lineHeight: '1.5' }}>
              {t('aiEngineErrorDescription')}
            </p>
            {analysisError && typeof analysisError === 'string' && analysisError.trim() && (
              <div
                style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  borderRadius: '8px',
                  padding: '0.6rem 0.8rem',
                  marginBottom: '1.25rem',
                  fontSize: '0.8rem',
                  color: '#f87171',
                  fontFamily: 'monospace',
                  wordBreak: 'break-word',
                  maxHeight: '120px',
                  overflowY: 'auto',
                }}
              >
                {analysisError}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button
                type="button"
                className="btn btn-primary"
                style={{ padding: '0.45rem 1.2rem', fontSize: '0.88rem' }}
                onClick={() => setAnalysisError(null)}
              >
                {t('close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* In-Viewer Metadata Editor Modal */}
      <MetadataEditorModal
        isOpen={isEditingMetadata}
        onClose={() => setIsEditingMetadata(false)}
        mediaFile={selectedMedia}
        onSaved={handleMetadataSaved}
      />
    </>
  );
}
