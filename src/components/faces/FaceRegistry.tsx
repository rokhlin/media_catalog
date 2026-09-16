import React, { useState, useEffect } from 'react';
import type {
  UISettings,
  FaceItem as FaceRegistryFace,
  PersonItem as FaceRegistryPerson,
  UnrecognizedGroupItem as FaceRegistryGroup,
  ExpandedModalState,
  SourceImageModalState,
  AssignmentConfig,
} from '../../models';
import { useLanguage } from '../../i18n/LanguageContext';
import FaceRegistryUI from './FaceRegistryUI';

export type { FaceRegistryFace, FaceRegistryPerson, FaceRegistryGroup };

interface FaceRegistryProps {
  faces?: Array<{ face_id: string; name?: string }>;
  persons?: FaceRegistryPerson[];
  unrecognizedFaces?: FaceRegistryFace[];
  unrecognizedGroups?: FaceRegistryGroup[];
  isLoading?: boolean;
  error?: string | null;
  onRenameFace: (faceId: string, newName: string) => Promise<boolean>;
  onAssignFace: (faceId: string, name: string) => Promise<boolean>;
  onAssignGroup: (faceIds: string[], name: string) => Promise<boolean>;
  onResetFace: (faceId: string) => Promise<boolean>;
  onResetFacesByFilename: (filename: string) => Promise<boolean>;
  onDeleteFace: (faceId: string) => Promise<boolean>;
  onDeleteFacesBatch?: (faceIds: string[]) => Promise<boolean>;
  disabled?: boolean;
  uiSettings?: UISettings;
  onViewInFamilyTree?: (personName: string, personId?: string) => void;
}

export default function FaceRegistry({
  faces = [],
  persons = [],
  unrecognizedFaces = [],
  unrecognizedGroups = [],
  isLoading = false,
  error = null,
  onRenameFace,
  onAssignFace,
  onAssignGroup,
  onResetFace,
  onResetFacesByFilename,
  onDeleteFace,
  onDeleteFacesBatch,
  disabled = false,
  uiSettings = { maxImagesPerRow: 10, maxRows: 1, maxWidth: 1600 },
  onViewInFamilyTree,
}: FaceRegistryProps) {
  const { t } = useLanguage();

  const [activeTab, setActiveTab] = useState<'groups' | 'persons' | 'all-unrecognized'>('groups');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingPersonName, setEditingPersonName] = useState<string | null>(null);
  const [editNameValue, setEditNameValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Expanded gallery modal state
  const [expandedModal, setExpandedModal] = useState<ExpandedModalState | null>(null);

  // Source Image Viewer Modal state
  const [sourceImageModal, setSourceImageModal] = useState<SourceImageModalState | null>(null);

  // Assignment state for groups: groupId -> { targetPerson: string, customName: string }
  const [groupAssignmentMap, setGroupAssignmentMap] = useState<Record<string, AssignmentConfig>>({});
  // Assignment state for single cards: faceId -> { targetPerson: string, customName: string }
  const [assignmentMap, setAssignmentMap] = useState<Record<string, AssignmentConfig>>({});

  // Reset by filename modal state
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetFilenameInput, setResetFilenameInput] = useState('');
  const [isResetting, setIsResetting] = useState(false);

  // Keyboard navigation for source image modal
  useEffect(() => {
    if (!sourceImageModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSourceImageModal(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sourceImageModal]);

  // Open source image for a face
  const handleOpenSourceImage = (face: FaceRegistryFace | null) => {
    if (!face) return;
    const sourceFile = face.source_file;
    if (!sourceFile) {
      alert(t('promptNoSourcePath'));
      return;
    }
    setSourceImageModal({
      isOpen: true,
      sourceFile,
      face,
    });
  };

  // Start editing person name
  const startRename = (person: FaceRegistryPerson) => {
    setEditingPersonName(person.name);
    setEditNameValue(person.name);
  };

  const cancelRename = () => {
    setEditingPersonName(null);
    setEditNameValue('');
  };

  // Save renamed person
  const handleSaveRename = async (person: FaceRegistryPerson) => {
    const trimmed = editNameValue.trim();
    if (!trimmed || trimmed === person.name) {
      cancelRename();
      return;
    }

    setIsSaving(true);
    const targetFaceId = person.reference_faces?.[0]?.face_id || person.person_id || person.name;
    const success = await onRenameFace(targetFaceId, trimmed);
    setIsSaving(false);
    if (success) {
      cancelRename();
    }
  };

  // Handle assigning an entire group of similar faces
  const handleAssignGroup = async (group: FaceRegistryGroup) => {
    const config = groupAssignmentMap[group.group_id] || { targetPerson: '', customName: '' };
    let finalName = '';
    if (config.targetPerson === '__new__') {
      finalName = (config.customName || '').trim();
    } else if (config.targetPerson) {
      finalName = config.targetPerson.trim();
    } else {
      finalName = (config.customName || '').trim();
    }

    if (!finalName) {
      alert(t('promptSelectPersonOrName'));
      return;
    }

    setIsSaving(true);
    await onAssignGroup(group.face_ids, finalName);
    setIsSaving(false);

    setGroupAssignmentMap((prev) => {
      const next = { ...prev };
      delete next[group.group_id];
      return next;
    });
  };

  // Handle assigning a single unrecognized face
  const handleAssignSingle = async (faceId: string) => {
    const config = assignmentMap[faceId] || { targetPerson: '', customName: '' };
    let finalName = '';
    if (config.targetPerson === '__new__') {
      finalName = (config.customName || '').trim();
    } else if (config.targetPerson) {
      finalName = config.targetPerson.trim();
    } else {
      finalName = (config.customName || '').trim();
    }

    if (!finalName) {
      alert(t('promptSelectPersonOrName'));
      return;
    }

    setIsSaving(true);
    await onAssignFace(faceId, finalName);
    setIsSaving(false);

    setAssignmentMap((prev) => {
      const next = { ...prev };
      delete next[faceId];
      return next;
    });
  };

  // Handle reset single face assignment
  const handleResetFace = async (faceId: string) => {
    if (window.confirm(t('promptResetFaceConfirm'))) {
      setIsSaving(true);
      await onResetFace(faceId);
      setIsSaving(false);
    }
  };

  // Handle reset by filename
  const handleExecuteResetByFilename = async () => {
    const trimmed = resetFilenameInput.trim();
    if (!trimmed) {
      alert(t('promptEnterFileReset'));
      return;
    }
    setIsResetting(true);
    await onResetFacesByFilename(trimmed);
    setIsResetting(false);
    setIsResetModalOpen(false);
    setResetFilenameInput('');
  };

  const handleDelete = async (faceId: string) => {
    if (window.confirm(t('promptDeleteFaceConfirm'))) {
      setIsSaving(true);
      try {
        await onDeleteFace(faceId);
      } finally {
        setIsSaving(false);
      }
    }
  };

  const handleDeleteGroup = async (group: FaceRegistryGroup) => {
    const faceIds = group.face_ids && group.face_ids.length > 0
      ? group.face_ids
      : (group.faces?.map((f) => f.face_id).filter(Boolean) || [group.group_id.replace(/^group_/, '')]);

    if (!faceIds || faceIds.length === 0) return;

    if (window.confirm(t('promptDeleteGroupConfirm'))) {
      setIsSaving(true);
      try {
        if (onDeleteFacesBatch) {
          await onDeleteFacesBatch(faceIds);
        } else {
          for (const fid of faceIds) {
            await onDeleteFace(fid);
          }
        }
      } finally {
        setIsSaving(false);
      }
    }
  };

  // Get image URL helper with faceId fallback
  const getImageUrl = (imagePath?: string | null, fallbackFaceId?: string | null) => {
    if (imagePath && String(imagePath).trim()) {
      const filename = imagePath.split(/[/\\]/).pop();
      if (filename && !filename.startsWith('manual_') && !filename.startsWith('face_manual_')) {
        return `/api/faces/image/${filename}`;
      }
    }
    if (fallbackFaceId && String(fallbackFaceId).trim()) {
      const trimmedId = fallbackFaceId.trim();
      if (!trimmedId.startsWith('manual_') && !trimmedId.startsWith('face_manual_')) {
        return `/api/faces/image/${trimmedId}`;
      }
    }
    return null;
  };

  // Known person names list for dropdown
  const knownPersonNames = persons.map((p) => p.name).filter(Boolean);

  // Filter persons
  const displayPersons: FaceRegistryPerson[] =
    persons.length > 0
      ? persons
      : faces.map((f) => ({
          name: f.name || f.face_id,
          person_id: f.face_id,
          reference_count: 1,
          reference_faces: [{ face_id: f.face_id, image_path: null, source_file: null }],
          primary_image: null,
        }));

  const filteredPersons = displayPersons.filter((p) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      (p.name && p.name.toLowerCase().includes(q)) ||
      (p.person_id && p.person_id.toLowerCase().includes(q)) ||
      (p.reference_faces && p.reference_faces.some((rf) => rf.face_id && rf.face_id.toLowerCase().includes(q)))
    );
  });

  const filteredGroups = unrecognizedGroups.filter((g) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      (g.group_id && g.group_id.toLowerCase().includes(q)) ||
      (g.face_ids && g.face_ids.some((fid) => fid.toLowerCase().includes(q))) ||
      (g.source_files && g.source_files.some((sf) => sf.toLowerCase().includes(q)))
    );
  });

  const filteredUnrecognized = unrecognizedFaces.filter((u) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      (u.face_id && u.face_id.toLowerCase().includes(q)) ||
      (u.source_file && u.source_file.toLowerCase().includes(q))
    );
  });

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h2 style={{ margin: 0 }}>👤 {t('faceRegistryTitle')}</h2>
        <button
          className="btn btn-secondary"
          style={{ padding: '0.35rem 0.75rem', fontSize: '0.82rem' }}
          onClick={() => setIsResetModalOpen(true)}
          type="button"
          title={t('resetByFileModalTitle')}
        >
          {t('btnResetByFile')}
        </button>
      </div>

      {/* Tabs */}
      <FaceRegistryUI
        activeTab={activeTab}
        onTabChange={setActiveTab}
        clustersCount={unrecognizedGroups.length}
        personsCount={displayPersons.length}
        unrecognizedCount={unrecognizedFaces.length}
      />

      {/* Search bar */}
      <div className="search-box">
        <span className="search-icon">🔍</span>
        <input
          type="text"
          className="input-control"
          id="face-search"
          placeholder={
            activeTab === 'persons'
              ? t('searchPersonsPlaceholder')
              : activeTab === 'groups'
              ? t('searchGroupsPlaceholder')
              : t('searchFacesPlaceholder')
          }
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Main List Container */}
      <div className="face-list-container" id="face-list">
        {isLoading && displayPersons.length === 0 && unrecognizedGroups.length === 0 && unrecognizedFaces.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', textAlign: 'center', marginTop: '1.5rem' }}>
            {t('loadingFaceRegistry')}
          </p>
        ) : error ? (
          <p style={{ color: 'var(--error-color)', fontSize: '0.9rem', textAlign: 'center', marginTop: '1.5rem' }}>
            {error}
          </p>
        ) : activeTab === 'groups' ? (
          /* Face Similarity Groups View */
          filteredGroups.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', textAlign: 'center', marginTop: '1.5rem', fontSize: '0.9rem' }}>
              {searchQuery ? t('noMatchingGroups') : t('noClustersFound')}
            </p>
          ) : (
            <div className="face-groups-list">
              {filteredGroups.map((group) => {
                const currentConfig = groupAssignmentMap[group.group_id] || { targetPerson: '', customName: '' };
                const repFace = group.representative_face;
                const repUrl = getImageUrl(repFace?.image_path, repFace?.face_id || group.sample_face_id);

                return (
                  <div className="face-group-card" key={group.group_id} id={`group-card-${group.group_id}`}>
                    <div className="face-group-header">
                      <div className="face-group-title-wrap">
                        {repUrl ? (
                          <img
                            src={repUrl}
                            alt={group.group_id}
                            className="face-group-avatar"
                            onClick={() => handleOpenSourceImage(repFace || null)}
                            style={{ cursor: repFace?.source_file ? 'pointer' : 'default' }}
                            title={repFace?.source_file ? t('clickToView') : group.group_id}
                            onError={(e) => {
                              const target = e.target as HTMLElement;
                              target.style.display = 'none';
                              const fb = target.parentElement?.querySelector('.fallback-group-avatar') as HTMLElement;
                              if (fb) fb.style.display = 'flex';
                            }}
                          />
                        ) : null}
                        <div
                          className="face-group-avatar fallback-group-avatar"
                          onClick={() => handleOpenSourceImage(repFace || null)}
                          style={{
                            display: repUrl ? 'none' : 'flex',
                            cursor: repFace?.source_file ? 'pointer' : 'default',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          👥
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <span className="face-group-name">{group.group_id}</span>
                            <span className="badge-pill badge-pill-accent">
                              {group.count} {t('shotsCountUnit')}
                            </span>
                            {group.avg_confidence && (
                              <span className="badge-pill badge-pill-secondary">
                                {t('confidence')}: {(group.avg_confidence * 100).toFixed(0)}%
                              </span>
                            )}
                          </div>
                          {group.source_files && group.source_files.length > 0 && (
                            <div className="face-group-sources" title={group.source_files.join(', ')}>
                              📁 {t('appearedInLabel')} {group.source_files.map((s) => s.split(/[/\\]/).pop()).join(', ')}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Face crop thumbnails in this group */}
                    {group.faces && group.faces.length > 0 && (() => {
                      const maxCols = Number(uiSettings?.maxImagesPerRow) || 10;
                      const maxRows = Number(uiSettings?.maxRows) || 1;
                      const maxSlots = maxCols * maxRows;
                      const hasOverflow = group.faces.length > maxSlots;
                      const visibleFaces = hasOverflow ? group.faces.slice(0, maxSlots - 1) : group.faces;
                      const overflowCount = group.faces.length - (maxSlots - 1);

                      return (
                        <div
                          className="person-ref-gallery"
                          style={{ '--gallery-cols': maxCols } as React.CSSProperties}
                        >
                          {visibleFaces.map((f, idx) => {
                            const cropUrl = getImageUrl(f.image_path, f.face_id);
                            return (
                              <div className="person-ref-thumb-wrap" key={f.face_id || idx} title={`${t('clickToView')} • ${f.face_id} (${f.source_file || ''})`}>
                                {cropUrl ? (
                                  <img
                                    src={cropUrl}
                                    alt={f.face_id}
                                    className="person-ref-thumb"
                                    onClick={() => handleOpenSourceImage(f)}
                                    style={{ cursor: 'pointer' }}
                                    onError={(e) => {
                                      const target = e.target as HTMLElement;
                                      target.style.display = 'none';
                                      const fb = target.parentElement?.querySelector('.fallback-face-thumb') as HTMLElement;
                                      if (fb) fb.style.display = 'flex';
                                    }}
                                  />
                                ) : null}
                                <div
                                  className="person-ref-thumb fallback-face-thumb"
                                  onClick={() => handleOpenSourceImage(f)}
                                  style={{
                                    display: cropUrl ? 'none' : 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '0.7rem',
                                    cursor: 'pointer',
                                  }}
                                >
                                  {f.face_id}
                                </div>
                                <button
                                  className="person-ref-del-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDelete(f.face_id);
                                  }}
                                  title={t('delete')}
                                  type="button"
                                >
                                  ×
                                </button>
                              </div>
                            );
                          })}

                          {hasOverflow && (
                            <button
                              className="person-ref-more-btn"
                              onClick={() =>
                                setExpandedModal({
                                  title: `${t('tabClusters')} • ${group.group_id} (${group.faces?.length || 0})`,
                                  type: 'group',
                                  data: group,
                                  items: group.faces || [],
                                })
                              }
                              title={t('clickToView')}
                              type="button"
                            >
                              <span style={{ fontSize: '1rem', lineHeight: 1 }}>•••</span>
                              <span style={{ fontSize: '0.68rem', marginTop: '2px' }}>+{overflowCount}</span>
                            </button>
                          )}
                        </div>
                      );
                    })()}

                    {/* One-click Group Assignment Controls */}
                    <div className="unrecognized-controls" style={{ marginTop: '0.6rem', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '0.6rem' }}>
                      <select
                        className="input-control"
                        style={{ padding: '0.4rem 0.6rem', fontSize: '0.85rem', width: 'auto', flex: 1, minWidth: '160px' }}
                        value={currentConfig.targetPerson}
                        onChange={(e) => {
                          const val = e.target.value;
                          setGroupAssignmentMap((prev) => ({
                            ...prev,
                            [group.group_id]: {
                              ...prev[group.group_id],
                              targetPerson: val,
                            },
                          }));
                        }}
                      >
                        <option value="">{t('assignGroupToPersonOption')}</option>
                        {knownPersonNames.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                        <option value="__new__">{t('newPersonOption')}</option>
                      </select>

                      {currentConfig.targetPerson === '__new__' && (
                        <input
                          type="text"
                          className="input-control"
                          style={{ padding: '0.4rem 0.6rem', fontSize: '0.85rem', flex: 1, minWidth: '140px' }}
                          placeholder={t('enterPersonName')}
                          value={currentConfig.customName || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setGroupAssignmentMap((prev) => ({
                              ...prev,
                              [group.group_id]: {
                                ...prev[group.group_id],
                                customName: val,
                              },
                            }));
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleAssignGroup(group);
                          }}
                          autoFocus
                        />
                      )}

                      <button
                        className="btn btn-accent"
                        style={{ padding: '0.4rem 0.85rem', fontSize: '0.82rem', whiteSpace: 'nowrap' }}
                        onClick={() => handleAssignGroup(group)}
                        disabled={
                          isSaving ||
                          (!currentConfig.targetPerson && !currentConfig.customName) ||
                          (currentConfig.targetPerson === '__new__' && !currentConfig.customName?.trim())
                        }
                        type="button"
                        title={t('btnAssignGroup')}
                      >
                        {isSaving ? t('btnAssigning') : `✓ ${t('btnAssignGroup')} (${group.count})`}
                      </button>

                      <button
                        className="btn btn-secondary"
                        style={{
                          padding: '0.4rem 0.85rem',
                          fontSize: '0.82rem',
                          whiteSpace: 'nowrap',
                          color: '#f87171',
                          borderColor: 'rgba(239, 68, 68, 0.4)',
                          background: 'rgba(239, 68, 68, 0.1)',
                        }}
                        onClick={() => handleDeleteGroup(group)}
                        disabled={isSaving || disabled}
                        type="button"
                        title={t('btnDeleteGroup')}
                      >
                        🗑️ {t('btnDeleteGroup')} ({group.count})
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : activeTab === 'persons' ? (
          /* Known Persons View */
          filteredPersons.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', textAlign: 'center', marginTop: '1.5rem', fontSize: '0.9rem' }}>
              {searchQuery ? t('noMatchingPersons') : t('noPersonsFound')}
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {filteredPersons.map((person) => {
                const isEditing = editingPersonName === person.name;
                const primaryImg = getImageUrl(person.primary_image || person.sample_image, person.reference_faces?.[0]?.face_id);
                const refCount = person.reference_faces?.length || person.reference_count || 1;
                const primaryRef: FaceRegistryFace = person.reference_faces?.[0] || {
                  face_id: person.name,
                  source_file: null,
                };

                return (
                  <div className="person-card" key={person.name || person.person_id} id={`person-row-${person.name}`}>
                    <div className="person-header">
                      {isEditing ? (
                        <div className="face-edit-form">
                          <input
                            type="text"
                            className="input-control"
                            style={{ padding: '0.45rem 0.75rem', fontSize: '0.92rem' }}
                            value={editNameValue}
                            onChange={(e) => setEditNameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveRename(person);
                              if (e.key === 'Escape') cancelRename();
                            }}
                            autoFocus
                            disabled={isSaving}
                          />
                          <button
                            className="btn btn-accent"
                            style={{ padding: '0.4rem 0.8rem', fontSize: '0.82rem' }}
                            onClick={() => handleSaveRename(person)}
                            disabled={isSaving}
                            type="button"
                          >
                            {isSaving ? t('btnSaving') : t('btnSave')}
                          </button>
                          <button
                            className="btn btn-secondary"
                            style={{ padding: '0.4rem 0.8rem', fontSize: '0.82rem' }}
                            onClick={cancelRename}
                            disabled={isSaving}
                            type="button"
                          >
                            {t('btnCancel')}
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="person-title-wrap">
                            {primaryImg ? (
                              <img
                                src={primaryImg}
                                alt={person.name}
                                className="person-avatar-circle"
                                onClick={() => handleOpenSourceImage(primaryRef)}
                                style={{ cursor: primaryRef.source_file ? 'pointer' : 'default' }}
                                title={primaryRef.source_file ? t('clickToView') : person.name}
                                onError={(e) => {
                                  const target = e.target as HTMLElement;
                                  target.style.display = 'none';
                                  const fb = target.parentElement?.querySelector('.fallback-person-avatar') as HTMLElement;
                                  if (fb) fb.style.display = 'flex';
                                }}
                              />
                            ) : null}
                            <div
                              className="person-avatar-circle fallback-person-avatar"
                              onClick={() => handleOpenSourceImage(primaryRef)}
                              style={{
                                display: primaryImg ? 'none' : 'flex',
                                cursor: primaryRef.source_file ? 'pointer' : 'default',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              {(person.name || '?')[0].toUpperCase()}
                            </div>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                <span className="face-name-val" style={{ fontWeight: 600 }}>
                                  {person.name}
                                </span>
                                <span className="badge-pill badge-pill-accent">
                                  {refCount} {refCount === 1 ? t('refPhotoUnitSingle') : t('refPhotoUnitPlural')}
                                </span>
                                {person.family_tree?.kinship_to_root && (
                                  <span
                                    className="badge-pill"
                                    style={{
                                      background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.25), rgba(99, 102, 241, 0.25))',
                                      border: '1px solid rgba(168, 85, 247, 0.5)',
                                      color: '#e0e7ff',
                                      fontWeight: 600,
                                    }}
                                    title="Genealogical Kinship to 'ME' (Root)"
                                  >
                                    🧬 {person.family_tree.kinship_to_root}
                                  </span>
                                )}
                              </div>
                              {person.person_id && person.person_id !== person.name && (
                                <span className="face-id-label">{person.person_id}</span>
                              )}
                            </div>
                          </div>

                          <div className="face-actions" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            {onViewInFamilyTree && (
                              <button
                                className="btn btn-secondary"
                                style={{
                                  padding: '0.35rem 0.75rem',
                                  fontSize: '0.8rem',
                                  background: 'rgba(99, 102, 241, 0.15)',
                                  border: '1px solid rgba(99, 102, 241, 0.35)',
                                  color: '#c7d2fe',
                                }}
                                onClick={() => onViewInFamilyTree(person.name, person.person_id)}
                                disabled={disabled}
                                type="button"
                                title={t('btnOpenFamilyTree') || 'Open in Family Tree'}
                              >
                                🌳 {t('navFamilyTree') || 'Family Tree'}
                              </button>
                            )}

                            <button
                              className="btn btn-secondary"
                              style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                              onClick={() => startRename(person)}
                              disabled={disabled}
                              type="button"
                              title={t('renamePersonModalTitle')}
                            >
                              ✏️ {t('btnRename')}
                            </button>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Reference Face Thumbnails Strip */}
                    {person.reference_faces && person.reference_faces.length > 0 && (() => {
                      const maxCols = Number(uiSettings?.maxImagesPerRow) || 10;
                      const maxRows = Number(uiSettings?.maxRows) || 1;
                      const maxSlots = maxCols * maxRows;
                      const hasOverflow = person.reference_faces.length > maxSlots;
                      const visibleRefs = hasOverflow ? person.reference_faces.slice(0, maxSlots - 1) : person.reference_faces;
                      const overflowCount = person.reference_faces.length - (maxSlots - 1);

                      return (
                        <div
                          className="person-ref-gallery"
                          style={{ '--gallery-cols': maxCols } as React.CSSProperties}
                        >
                          {visibleRefs.map((refFace, idx) => {
                            const refUrl = getImageUrl(refFace.image_path, refFace.face_id);
                            return (
                              <div className="person-ref-thumb-wrap" key={refFace.face_id || idx} title={`${t('clickToView')} • ${refFace.face_id} (${refFace.source_file || ''})`}>
                                {refUrl ? (
                                  <img
                                    src={refUrl}
                                    alt={`${person.name} crop ${idx + 1}`}
                                    className="person-ref-thumb"
                                    onClick={() => handleOpenSourceImage(refFace)}
                                    style={{ cursor: 'pointer' }}
                                    onError={(e) => {
                                      const target = e.target as HTMLElement;
                                      target.style.display = 'none';
                                      const fb = target.parentElement?.querySelector('.fallback-face-thumb') as HTMLElement;
                                      if (fb) fb.style.display = 'flex';
                                    }}
                                  />
                                ) : null}
                                <div
                                  className="person-ref-thumb fallback-face-thumb"
                                  onClick={() => handleOpenSourceImage(refFace)}
                                  style={{
                                    display: refUrl ? 'none' : 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '0.75rem',
                                    color: 'var(--text-muted)',
                                    cursor: 'pointer',
                                  }}
                                >
                                  {refFace.face_id || 'Ref'}
                                </div>
                                {/* Reset individual face assignment */}
                                <button
                                  className="person-ref-reset-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleResetFace(refFace.face_id);
                                  }}
                                  title={t('btnReset')}
                                  type="button"
                                >
                                  🔄
                                </button>
                                <button
                                  className="person-ref-del-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDelete(refFace.face_id);
                                  }}
                                  title={t('btnDelete')}
                                  type="button"
                                >
                                  ×
                                </button>
                              </div>
                            );
                          })}

                          {hasOverflow && (
                            <button
                              className="person-ref-more-btn"
                              onClick={() =>
                                setExpandedModal({
                                  title: `${t('tabKnownPersons')} • ${person.name} (${person.reference_faces?.length || 0})`,
                                  type: 'person',
                                  data: person,
                                  items: person.reference_faces || [],
                                })
                              }
                              title={t('clickToView')}
                              type="button"
                            >
                              <span style={{ fontSize: '1rem', lineHeight: 1 }}>•••</span>
                              <span style={{ fontSize: '0.68rem', marginTop: '2px' }}>+{overflowCount}</span>
                            </button>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
          )
        ) : (
          /* All Unrecognized Crops View */
          filteredUnrecognized.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', textAlign: 'center', marginTop: '1.5rem', fontSize: '0.9rem' }}>
              {searchQuery ? t('noMatchingFaces') : t('noUnrecFacesFound')}
            </p>
          ) : (
            <div className="unrecognized-grid">
              {filteredUnrecognized.map((face) => {
                const imgUrl = getImageUrl(face.image_path, face.face_id);
                const currentConfig = assignmentMap[face.face_id] || { targetPerson: '', customName: '' };
                const confPercent = face.confidence ? (face.confidence * 100).toFixed(0) : null;

                return (
                  <div className="unrecognized-card" key={face.face_id} id={`unrec-card-${face.face_id}`}>
                    {imgUrl ? (
                      <img
                        src={imgUrl}
                        alt={`Unrecognized ${face.face_id}`}
                        className="unrecognized-thumb"
                        onClick={() => handleOpenSourceImage(face)}
                        style={{ cursor: 'pointer' }}
                        title={t('clickToView')}
                        onError={(e) => {
                          const target = e.target as HTMLElement;
                          target.style.display = 'none';
                          const fb = target.parentElement?.querySelector('.fallback-unrec-thumb') as HTMLElement;
                          if (fb) fb.style.display = 'flex';
                        }}
                      />
                    ) : null}
                    <div
                      className="unrecognized-thumb fallback-unrec-thumb"
                      onClick={() => handleOpenSourceImage(face)}
                      style={{
                        display: imgUrl ? 'none' : 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.5rem',
                        color: '#ef4444',
                        cursor: 'pointer',
                      }}
                    >
                      👤
                    </div>

                    <div className="unrecognized-info">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className="face-id-label" style={{ color: '#f87171' }}>
                          {face.face_id}
                        </span>
                        {confPercent !== null && (
                          <span
                            className={`badge-pill ${
                              Number(confPercent) < 70 ? 'badge-pill-warning' : 'badge-pill-accent'
                            }`}
                          >
                            {t('confidence')}: {confPercent}%
                          </span>
                        )}
                      </div>

                      <div className="unrecognized-meta">
                        {face.source_file && (
                          <span
                            style={{
                              fontSize: '0.78rem',
                              color: 'var(--text-muted)',
                              maxWidth: '220px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              cursor: 'pointer',
                            }}
                            title={`${t('sourceFileTitle')}: ${face.source_file}`}
                            onClick={() => handleOpenSourceImage(face)}
                          >
                            📁 {face.source_file.split(/[/\\]/).pop()}
                          </span>
                        )}
                        {face.created_at && (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            🕒 {face.created_at}
                          </span>
                        )}
                      </div>

                      {/* Assignment controls */}
                      <div className="unrecognized-controls">
                        <select
                          className="input-control"
                          style={{ padding: '0.35rem 0.55rem', fontSize: '0.8rem', width: 'auto', flex: 1, minWidth: '130px' }}
                          value={currentConfig.targetPerson}
                          onChange={(e) => {
                            const val = e.target.value;
                            setAssignmentMap((prev) => ({
                              ...prev,
                              [face.face_id]: {
                                ...prev[face.face_id],
                                targetPerson: val,
                              },
                            }));
                          }}
                        >
                          <option value="">{t('assignSingleToPersonOption')}</option>
                          {knownPersonNames.map((name) => (
                            <option key={name} value={name}>
                              {name}
                            </option>
                          ))}
                          <option value="__new__">{t('newPersonOption')}</option>
                        </select>

                        {currentConfig.targetPerson === '__new__' && (
                          <input
                            type="text"
                            className="input-control"
                            style={{ padding: '0.35rem 0.55rem', fontSize: '0.8rem', flex: 1, minWidth: '120px' }}
                            placeholder={t('enterPersonName')}
                            value={currentConfig.customName || ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              setAssignmentMap((prev) => ({
                                ...prev,
                                [face.face_id]: {
                                  ...prev[face.face_id],
                                  customName: val,
                                },
                              }));
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleAssignSingle(face.face_id);
                            }}
                            autoFocus
                          />
                        )}

                        <button
                          className="btn btn-accent"
                          style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
                          onClick={() => handleAssignSingle(face.face_id)}
                          disabled={
                            isSaving ||
                            (!currentConfig.targetPerson && !currentConfig.customName) ||
                            (currentConfig.targetPerson === '__new__' && !currentConfig.customName?.trim())
                          }
                          type="button"
                          title={t('btnAssign')}
                        >
                          ✓ {t('btnAssign')}
                        </button>

                        <button
                          className="btn btn-secondary"
                          style={{
                            padding: '0.35rem 0.65rem',
                            fontSize: '0.8rem',
                            whiteSpace: 'nowrap',
                            color: '#f87171',
                            borderColor: 'rgba(239, 68, 68, 0.4)',
                            background: 'rgba(239, 68, 68, 0.1)',
                          }}
                          onClick={() => handleDelete(face.face_id)}
                          disabled={isSaving || disabled}
                          type="button"
                          title={t('btnDelete')}
                        >
                          🗑️ {t('btnDelete')}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>

      {/* Full Source Image Viewer Modal */}
      {sourceImageModal && (
        <div className="modal-overlay active" onClick={() => setSourceImageModal(null)}>
          <div
            className="modal-card media-lightbox-card"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '1000px', width: '90vw', padding: 0 }}
          >
            <div className="media-lightbox-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', minWidth: 0 }}>
                <span style={{ fontSize: '1.2rem' }}>📷</span>
                <div style={{ minWidth: 0 }}>
                  <h3
                    style={{
                      margin: 0,
                      fontSize: '1.05rem',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={sourceImageModal.sourceFile}
                  >
                    {sourceImageModal.sourceFile.split(/[/\\]/).pop()}
                  </h3>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    {sourceImageModal.face?.face_id || t('faceIdentificationTitle')}
                  </span>
                </div>
              </div>

              <button
                className="close-btn"
                onClick={() => setSourceImageModal(null)}
                type="button"
                title={t('closeTooltip')}
              >
                &times;
              </button>
            </div>

            <div className="media-lightbox-body">
              {/* Full Source Image Viewport */}
              <div className="media-lightbox-preview" style={{ background: '#070a12' }}>
                <img
                  src={`/api/media/file?path=${encodeURIComponent(sourceImageModal.sourceFile)}`}
                  alt={sourceImageModal.sourceFile}
                  className="media-lightbox-image"
                />
              </div>

              {/* Face Details Sidebar */}
              <div className="media-lightbox-sidebar" style={{ width: '320px' }}>
                <div className="lightbox-section">
                  <h4 className="lightbox-section-title">👤 {t('faceIdentificationTitle')}</h4>
                  
                  {sourceImageModal.face && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '0.8rem' }}>
                      <img
                        src={getImageUrl(sourceImageModal.face.image_path, sourceImageModal.face.face_id) || undefined}
                        alt={sourceImageModal.face.face_id}
                        className="lightbox-face-crop"
                        style={{ width: '60px', height: '60px', borderRadius: '8px' }}
                      />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                          {sourceImageModal.face.name || sourceImageModal.face.face_id}
                        </div>
                        <span className="face-id-label">{sourceImageModal.face.face_id}</span>
                      </div>
                    </div>
                  )}

                  <div className="lightbox-detail-row">
                    <span className="lightbox-label">{t('personNameLabel')}</span>
                    <span className="lightbox-value" style={{ fontWeight: 600, color: 'var(--primary-color)' }}>
                      {sourceImageModal.face?.name || sourceImageModal.face?.person_id || t('unassignedName')}
                    </span>
                  </div>

                  {sourceImageModal.face?.confidence && (
                    <div className="lightbox-detail-row">
                      <span className="lightbox-label">{t('confidence')}:</span>
                      <span className="lightbox-value">
                        {(sourceImageModal.face.confidence * 100).toFixed(1)}%
                      </span>
                    </div>
                  )}

                  <div className="lightbox-detail-row">
                    <span className="lightbox-label">{t('status')}:</span>
                    <span
                      className={`badge-pill ${
                        sourceImageModal.face?.is_reference ? 'badge-pill-accent' : 'badge-pill-warning'
                      }`}
                    >
                      {sourceImageModal.face?.is_reference ? t('badgeKnown') : t('badgePending')}
                    </span>
                  </div>
                </div>

                <div className="lightbox-section" style={{ flex: 1 }}>
                  <h4 className="lightbox-section-title">📁 {t('sourceFileTitle')}</h4>
                  <div className="lightbox-detail-row">
                    <span className="lightbox-label">{t('fullPath')}:</span>
                    <span
                      className="lightbox-value"
                      style={{ wordBreak: 'break-all' }}
                      title={sourceImageModal.sourceFile}
                    >
                      {sourceImageModal.sourceFile}
                    </span>
                  </div>
                  {sourceImageModal.face?.created_at && (
                    <div className="lightbox-detail-row">
                      <span className="lightbox-label">{t('modifiedDate')}:</span>
                      <span className="lightbox-value">{sourceImageModal.face.created_at}</span>
                    </div>
                  )}
                </div>

                <div className="lightbox-section lightbox-actions-footer">
                  <button
                    className="btn btn-secondary"
                    onClick={() => setSourceImageModal(null)}
                    type="button"
                    style={{ width: '100%' }}
                  >
                    {t('btnClose')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reset by Filename Modal */}
      {isResetModalOpen && (
        <div className="modal-overlay active" onClick={() => setIsResetModalOpen(false)}>
          <div className="modal-card" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>🔄 {t('resetByFileModalTitle')}</h2>
              <button className="close-btn" onClick={() => setIsResetModalOpen(false)}>
                &times;
              </button>
            </div>
            <div className="modal-body">
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>
                {t('resetByFileDescription')}
              </p>
              <input
                type="text"
                className="input-control"
                placeholder={t('enterFileName')}
                value={resetFilenameInput}
                onChange={(e) => setResetFilenameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleExecuteResetByFilename();
                }}
                autoFocus
              />
            </div>
            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.8rem' }}>
              <button
                className="btn btn-secondary"
                onClick={() => setIsResetModalOpen(false)}
                disabled={isResetting}
                type="button"
              >
                {t('btnCancel')}
              </button>
              <button
                className="btn btn-accent"
                onClick={handleExecuteResetByFilename}
                disabled={isResetting || !resetFilenameInput.trim()}
                type="button"
              >
                {isResetting ? t('btnResetting') : t('btnConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Expanded Photos Popup Modal (No Row Limitation) */}
      {expandedModal && (
        <div className="modal-overlay active" onClick={() => setExpandedModal(null)}>
          <div className="modal-card expanded-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{expandedModal.title}</h2>
              <button className="close-btn" onClick={() => setExpandedModal(null)} type="button">
                &times;
              </button>
            </div>
            <div className="modal-body">
              <div className="expanded-photos-grid">
                {expandedModal.items.map((item, idx) => {
                  const cropUrl = getImageUrl(item.image_path, item.face_id);
                  const isPersonType = expandedModal.type === 'person';

                  return (
                    <div className="expanded-photo-item" key={item.face_id || idx} title={`${t('clickToView')} • ${item.face_id} (${item.source_file || ''})`}>
                      {cropUrl ? (
                        <img
                          src={cropUrl}
                          alt={item.face_id}
                          className="expanded-photo-img"
                          onClick={() => handleOpenSourceImage(item)}
                          style={{ cursor: 'pointer' }}
                          onError={(e) => {
                            const target = e.target as HTMLElement;
                            target.style.display = 'none';
                            const fb = target.parentElement?.querySelector('.fallback-expanded-img') as HTMLElement;
                            if (fb) fb.style.display = 'flex';
                          }}
                        />
                      ) : null}
                      <div
                        className="expanded-photo-img fallback-expanded-img"
                        onClick={() => handleOpenSourceImage(item)}
                        style={{
                          display: cropUrl ? 'none' : 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.75rem',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                        }}
                      >
                        {item.face_id}
                      </div>

                      {isPersonType && (
                        <button
                          className="person-ref-reset-btn"
                          onClick={async (e) => {
                            e.stopPropagation();
                            await handleResetFace(item.face_id);
                            setExpandedModal((prev) =>
                              prev ? { ...prev, items: prev.items.filter((i) => i.face_id !== item.face_id) } : null
                            );
                          }}
                          title={t('btnReset')}
                          type="button"
                        >
                          🔄
                        </button>
                      )}

                      <button
                        className="person-ref-del-btn"
                        onClick={async (e) => {
                          e.stopPropagation();
                          await handleDelete(item.face_id);
                          setExpandedModal((prev) =>
                            prev ? { ...prev, items: prev.items.filter((i) => i.face_id !== item.face_id) } : null
                          );
                        }}
                        title={t('btnDelete')}
                        type="button"
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '0.8rem', borderTop: '1px solid var(--border-color)' }}>
              <button className="btn btn-secondary" onClick={() => setExpandedModal(null)} type="button">
                {t('btnClose')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
