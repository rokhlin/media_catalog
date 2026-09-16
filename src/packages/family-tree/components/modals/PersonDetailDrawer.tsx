import { useState, useEffect } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useFamilyTreeStore } from '../../state/useFamilyTreeStore.js';
import { useKinship } from '../../hooks/useKinship.js';
import type { TreeGraphPerson, TreeGraphData, Gender, UnionType, TreeGraphUnion } from '../../types/tree.types.js';
import { PersonTimelineView } from '../timeline/PersonTimelineView.js';
import { CustomDatePicker } from '../common/CustomDatePicker.js';
import { formatTreeDate } from '../../utils/dateUtils.js';
import { useLanguage } from '../../../../i18n/LanguageContext.js';
import { localizeKinshipTerm } from '../../utils/kinshipUtils.js';

interface PersonDetailDrawerProps {
  person: TreeGraphPerson | null;
  graphData: TreeGraphData | null;
  onUpdatePerson: (id: string, data: Record<string, any>) => Promise<any>;
  onDeletePerson: (id: string) => Promise<void>;
  onSetRootPerson: (treeId: string, personId: string) => Promise<void>;
  onOpenQuickAdd: (targetPersonId: string, relation?: 'PARENT' | 'CHILD' | 'SPOUSE' | 'SIBLING') => void;
  onOpenFaceLink: (targetPersonId: string) => void;
}

export const PersonDetailDrawer = ({
  person,
  graphData,
  onUpdatePerson,
  onDeletePerson,
  onSetRootPerson: _onSetRootPerson,
  onOpenQuickAdd,
  onOpenFaceLink,
}: PersonDetailDrawerProps) => {
  const { language, t } = useLanguage();
  const {
    isDetailDrawerOpen,
    drawerActiveTab,
    closeDrawer,
    selectPerson,
    openDrawer,
    dateFormatStyle,
  } = useFamilyTreeStore();

  const { fitView } = useReactFlow();

  // Bio Form State
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [maidenName, setMaidenName] = useState('');
  const [gender, setGender] = useState<Gender>('UNKNOWN');
  const [birthDate, setBirthDate] = useState('');
  const [birthPlace, setBirthPlace] = useState('');
  const [isLiving, setIsLiving] = useState(true);
  const [deathDate, setDeathDate] = useState('');
  const [deathPlace, setDeathPlace] = useState('');
  const [bio, setBio] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isEditingBio, setIsEditingBio] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Spouse Union Editing State
  const [editingUnion, setEditingUnion] = useState<TreeGraphUnion | null>(null);
  const [editingSpouseName, setEditingSpouseName] = useState('');
  const [unionType, setUnionType] = useState<UnionType>('MARRIAGE');
  const [unionStartDate, setUnionStartDate] = useState('');
  const [unionEndDate, setUnionEndDate] = useState('');
  const [unionStartPlace, setUnionStartPlace] = useState('');
  const [unionNotes, setUnionNotes] = useState('');
  const [isSavingUnion, setIsSavingUnion] = useState(false);

  const rootPersonId = graphData?.root_person_id;
  const isRoot = person?.id === rootPersonId;
  const { kinship } = useKinship(rootPersonId, person?.id);
  const { getPersonContext } = useKinship();
  const [personContext, setPersonContext] = useState<any>(null);

  useEffect(() => {
    if (person) {
      setFirstName(person.first_name || '');
      setMiddleName(person.middle_name || '');
      setLastName(person.last_name || '');
      setMaidenName(person.maiden_name || '');
      setGender(person.gender || 'UNKNOWN');
      setBirthDate(person.birth_date || '');
      setBirthPlace(person.birth_place || '');
      setIsLiving(person.is_living === 1);
      setDeathDate(person.death_date || '');
      setDeathPlace(person.death_place || '');
      setBio(person.bio || '');
      setIsEditingBio(false);
      setShowDeleteConfirm(false);
      setDeleteError(null);

      // Load full person context (relatives)
      getPersonContext({ personId: person.id }).then((ctx) => {
        setPersonContext(ctx);
      });
    }
  }, [person]);

  if (!isDetailDrawerOpen || !person) return null;

  const fullName = person.full_name || `${person.first_name} ${person.last_name || ''}`.trim();
  const avatarUrl = person.avatar_url || (person.avatar_face_id && !person.avatar_face_id.startsWith('manual_') && !person.avatar_face_id.startsWith('face_manual_') ? `/api/faces/image/${person.avatar_face_id}` : null);

  const handleSaveBio = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await onUpdatePerson(person.id, {
        first_name: firstName.trim(),
        middle_name: middleName.trim() || undefined,
        last_name: lastName.trim() || undefined,
        maiden_name: maidenName.trim() || undefined,
        gender,
        birth_date: birthDate.trim() || undefined,
        birth_place: birthPlace.trim() || undefined,
        is_living: isLiving,
        death_date: !isLiving ? deathDate.trim() || undefined : undefined,
        death_place: !isLiving ? deathPlace.trim() || undefined : undefined,
        bio: bio.trim() || undefined,
      });
      setIsEditingBio(false);
    } catch {
      // ignore
    } finally {
      setIsSaving(false);
    }
  };

  const handleFlyToNode = () => {
    fitView({
      nodes: [{ id: `p_${person.id}` }],
      duration: 600,
      maxZoom: 1.2,
    });
  };

  const handleDeleteConfirmed = async () => {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await onDeletePerson(person.id);
      setShowDeleteConfirm(false);
      closeDrawer();
    } catch (err: any) {
      setDeleteError(err?.message || 'Failed to delete person.');
    } finally {
      setIsDeleting(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'var(--input-bg)',
    border: '1px solid var(--border-color)',
    borderRadius: 8,
    padding: '8px 12px',
    color: 'var(--text-primary)',
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text-secondary)',
    marginBottom: 4,
  };

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        width: 460,
        zIndex: 50,
        background: 'var(--modal-bg)',
        borderLeft: '1px solid var(--border-color)',
        backdropFilter: 'blur(20px)',
        boxShadow: 'var(--shadow-modal)',
        display: 'flex',
        flexDirection: 'column',
        animation: 'fadeIn 0.2s ease-out',
      }}
    >
      {/* Drawer Header */}
      <div
        style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          background: 'var(--card-bg)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {/* Avatar with Face Link Button */}
          <div style={{ position: 'relative' }}>
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={fullName}
                style={{
                  width: 58,
                  height: 58,
                  borderRadius: '50%',
                  objectFit: 'cover',
                  border: '2px solid #6366f1',
                  boxShadow: '0 4px 14px rgba(0, 0, 0, 0.4)',
                }}
              />
            ) : (
              <div
                style={{
                  width: 58,
                  height: 58,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #6366f1, #a855f7)',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: 20,
                  boxShadow: '0 4px 14px rgba(0, 0, 0, 0.4)',
                }}
              >
                {person.first_name[0]}
              </div>
            )}
            <button
              type="button"
              style={{
                position: 'absolute',
                bottom: -2,
                right: -2,
                background: '#6366f1',
                color: '#ffffff',
                border: '1.5px solid var(--card-bg-solid)',
                borderRadius: '50%',
                width: 20,
                height: 20,
                fontSize: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
              title={t('btnLinkFace')}
              onClick={() => onOpenFaceLink(person.id)}
            >
              📷
            </button>
          </div>

          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>{fullName}</span>
              {isRoot && (
                <span
                  style={{
                    background: 'linear-gradient(135deg, #a855f7, #6366f1)',
                    color: '#ffffff',
                    fontSize: 9,
                    fontWeight: 800,
                    padding: '2px 6px',
                    borderRadius: 8,
                  }}
                >
                  {t('hudMe')}
                </span>
              )}
            </div>

            {person.maiden_name && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                {language === 'ru' ? `урожд. ${person.maiden_name}` : `née ${person.maiden_name}`}
              </div>
            )}

            {kinship && kinship.primaryTerm !== 'Self' && (
              <div style={{ marginTop: 4 }}>
                <span
                  style={{
                    background: 'var(--nav-tab-active-bg)',
                    border: '1px solid var(--primary-color, #6366f1)',
                    color: 'var(--primary-color, #6366f1)',
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 6,
                  }}
                >
                  {localizeKinshipTerm(kinship.primaryTerm, language)}
                </span>
              </div>
            )}
          </div>
        </div>

        <button
          type="button"
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-secondary)',
            fontSize: 18,
            cursor: 'pointer',
            padding: 4,
          }}
          onClick={closeDrawer}
        >
          ✕
        </button>
      </div>

      {/* Action Shortcut Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 20px',
          background: 'var(--nav-tab-bg)',
          borderBottom: '1px solid var(--border-color)',
          overflowX: 'auto',
        }}
      >
        <button
          type="button"
          style={{
            background: 'var(--card-bg-solid)',
            border: '1px solid var(--border-color)',
            color: 'var(--text-primary)',
            borderRadius: 6,
            padding: '4px 10px',
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
          onClick={handleFlyToNode}
        >
          🎯 {t('btnFocusInCanvas')}
        </button>

        <button
          type="button"
          style={{
            background: 'var(--nav-tab-active-bg)',
            border: '1px solid var(--primary-color, #6366f1)',
            color: 'var(--primary-color, #6366f1)',
            borderRadius: 6,
            padding: '4px 10px',
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
          onClick={() => onOpenQuickAdd(person.id)}
        >
          ➕ {t('btnAddRelative')}
        </button>

        <button
          type="button"
          style={{
            background: showDeleteConfirm ? 'rgba(239, 68, 68, 0.3)' : 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: 'var(--error-color, #ef4444)',
            borderRadius: 6,
            padding: '4px 10px',
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
          onClick={() => {
            setShowDeleteConfirm((v) => !v);
            setDeleteError(null);
          }}
        >
          🗑️ {t('delete')}
        </button>
      </div>

      {/* Inline Delete Confirmation Bar */}
      {showDeleteConfirm && (
        <div
          style={{
            margin: '0 20px 0',
            padding: '10px 14px',
            background: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid rgba(239, 68, 68, 0.35)',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontSize: 12, color: 'var(--error-color, #ef4444)', fontWeight: 600, flex: 1 }}>
            ⚠️ {t('confirmDeletePersonPrompt')} <strong>{fullName}</strong>?
          </span>
          {deleteError && (
            <span style={{ fontSize: 11, color: 'var(--error-color, #ef4444)', width: '100%', marginTop: 2 }}>
              {deleteError}
            </span>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              style={{
                background: 'transparent',
                border: '1px solid var(--border-color)',
                color: 'var(--text-secondary)',
                borderRadius: 6,
                padding: '4px 12px',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
              }}
              onClick={() => { setShowDeleteConfirm(false); setDeleteError(null); }}
              disabled={isDeleting}
            >
              {t('cancel')}
            </button>
            <button
              type="button"
              style={{
                background: 'rgba(239, 68, 68, 0.85)',
                border: 'none',
                color: '#ffffff',
                borderRadius: 6,
                padding: '4px 12px',
                fontSize: 11,
                fontWeight: 700,
                cursor: isDeleting ? 'not-allowed' : 'pointer',
                opacity: isDeleting ? 0.7 : 1,
              }}
              onClick={handleDeleteConfirmed}
              disabled={isDeleting}
            >
              {isDeleting ? t('deletingPerson') : t('confirm')}
            </button>
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--border-color)',
          background: 'var(--card-bg)',
        }}
      >
        <button
          type="button"
          style={{
            flex: 1,
            padding: '10px 0',
            border: 'none',
            background: 'transparent',
            color: drawerActiveTab === 'bio' ? 'var(--primary-color, #6366f1)' : 'var(--text-secondary)',
            borderBottom: drawerActiveTab === 'bio' ? '2px solid var(--primary-color, #6366f1)' : '2px solid transparent',
            fontWeight: 600,
            fontSize: 13,
            cursor: 'pointer',
          }}
          onClick={() => openDrawer('bio', person.id)}
        >
          👤 {t('drawerTabBio')}
        </button>

        <button
          type="button"
          style={{
            flex: 1,
            padding: '10px 0',
            border: 'none',
            background: 'transparent',
            color: drawerActiveTab === 'family' ? 'var(--primary-color, #6366f1)' : 'var(--text-secondary)',
            borderBottom: drawerActiveTab === 'family' ? '2px solid var(--primary-color, #6366f1)' : '2px solid transparent',
            fontWeight: 600,
            fontSize: 13,
            cursor: 'pointer',
          }}
          onClick={() => openDrawer('family', person.id)}
        >
          👨‍👩‍👧‍👦 {t('drawerTabFamily')}
        </button>

        <button
          type="button"
          style={{
            flex: 1,
            padding: '10px 0',
            border: 'none',
            background: 'transparent',
            color: drawerActiveTab === 'timeline' ? 'var(--primary-color, #6366f1)' : 'var(--text-secondary)',
            borderBottom: drawerActiveTab === 'timeline' ? '2px solid var(--primary-color, #6366f1)' : '2px solid transparent',
            fontWeight: 600,
            fontSize: 13,
            cursor: 'pointer',
          }}
          onClick={() => openDrawer('timeline', person.id)}
        >
          📖 {t('drawerTabTimeline')}
        </button>
      </div>

      {/* Tab Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        {/* Tab 1: Bio & Details */}
        {drawerActiveTab === 'bio' && (
          <div>
            {!isEditingBio ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    style={{
                      background: 'rgba(99, 102, 241, 0.2)',
                      border: '1px solid rgba(99, 102, 241, 0.4)',
                      color: '#c7d2fe',
                      padding: '4px 12px',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                    onClick={() => setIsEditingBio(true)}
                  >
                    ✏️ {t('btnEditBio')}
                  </button>
                </div>

                <div style={{ background: 'var(--card-bg)', borderRadius: 10, padding: 14, border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{t('birthInformation')}</div>
                  <div style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 600 }}>
                    {person.birth_date ? formatTreeDate(person.birth_date, dateFormatStyle, language) : t('dateUnknown')} {person.birth_place ? `• ${person.birth_place}` : ''}
                  </div>
                </div>

                {!person.is_living && (
                  <div style={{ background: 'var(--card-bg)', borderRadius: 10, padding: 14, border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{t('passingInformation')}</div>
                    <div style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 600 }}>
                      {person.death_date ? formatTreeDate(person.death_date, dateFormatStyle, language) : t('dateUnknown')} {person.death_place ? `• ${person.death_place}` : ''}
                    </div>
                  </div>
                )}

                <div style={{ background: 'var(--card-bg)', borderRadius: 10, padding: 14, border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{t('labelGender')}</div>
                  <div style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 600 }}>
                    {person.gender === 'MALE' ? t('genderMale') : person.gender === 'FEMALE' ? t('genderFemale') : person.gender === 'NON_BINARY' ? t('genderOther') : t('genderUnknown')}
                  </div>
                </div>

                <div style={{ background: 'var(--card-bg)', borderRadius: 10, padding: 14, border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{t('labelBioNotes')}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                    {person.bio || t('noBioWritten')}
                  </div>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSaveBio} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={labelStyle}>{t('labelFirstName')}</label>
                    <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>{t('labelLastName')}</label>
                    <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} style={inputStyle} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={labelStyle}>{t('labelMiddleName')}</label>
                    <input type="text" value={middleName} onChange={(e) => setMiddleName(e.target.value)} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>{t('labelMaidenName')}</label>
                    <input type="text" value={maidenName} onChange={(e) => setMaidenName(e.target.value)} style={inputStyle} />
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>{t('labelGender')}</label>
                  <select value={gender} onChange={(e) => setGender(e.target.value as any)} style={inputStyle}>
                    <option value="UNKNOWN">{t('genderUnknown')}</option>
                    <option value="MALE">{t('genderMale')}</option>
                    <option value="FEMALE">{t('genderFemale')}</option>
                    <option value="NON_BINARY">{t('genderOther')}</option>
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={labelStyle}>{t('labelBirthDate')}</label>
                    <CustomDatePicker value={birthDate} onChange={setBirthDate} placeholder="e.g. 1985-04-12, 12.04.1985..." />
                  </div>
                  <div>
                    <label style={labelStyle}>{t('labelBirthPlace')}</label>
                    <input type="text" value={birthPlace} onChange={(e) => setBirthPlace(e.target.value)} style={inputStyle} />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-primary)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={isLiving} onChange={(e) => setIsLiving(e.target.checked)} />
                    <span>{t('currentlyLivingCheckbox')}</span>
                  </label>
                </div>

                {!isLiving && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={labelStyle}>{t('labelDeathDate')}</label>
                      <CustomDatePicker value={deathDate} onChange={setDeathDate} placeholder="e.g. 2020-05-10, 10.05.2020..." />
                    </div>
                    <div>
                      <label style={labelStyle}>{t('labelDeathPlace')}</label>
                      <input type="text" value={deathPlace} onChange={(e) => setDeathPlace(e.target.value)} style={inputStyle} />
                    </div>
                  </div>
                )}

                <div>
                  <label style={labelStyle}>{t('labelBioNotes')}</label>
                  <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={4} style={{ ...inputStyle, resize: 'vertical' }} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                  <button
                    type="button"
                    style={{ background: 'var(--nav-tab-bg)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: 8, padding: '8px 16px', fontSize: 13, cursor: 'pointer' }}
                    onClick={() => setIsEditingBio(false)}
                  >
                    {t('cancel')}
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)', color: '#ffffff', border: 'none', borderRadius: 8, padding: '8px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                  >
                    {isSaving ? t('btnSavingUnion') : t('btnSaveBio')}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* Tab 2: Family & Relatives */}
        {drawerActiveTab === 'family' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Parents */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {t('labelParents')} ({personContext?.immediateFamily?.parents?.length || 0})
                </div>
                <button
                  type="button"
                  style={{ background: 'transparent', border: 'none', color: 'var(--primary-color, #6366f1)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                  onClick={() => onOpenQuickAdd(person.id, 'PARENT')}
                >
                  + {t('btnAddParent')}
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {personContext?.immediateFamily?.parents?.map((p: any) => (
                  <div
                    key={p.id}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--card-bg)', border: '1px solid var(--border-color)', padding: '8px 12px', borderRadius: 8, cursor: 'pointer' }}
                    onClick={() => selectPerson(p.id, true)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span>👤</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{p.name}</span>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--primary-color, #6366f1)', fontWeight: 600 }}>{localizeKinshipTerm(p.relation, language)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Spouses & Partners */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {t('sectionSpousesPartners')} ({personContext?.immediateFamily?.spouses?.length || 0})
                </div>
                <button
                  type="button"
                  style={{ background: 'transparent', border: 'none', color: 'var(--primary-color, #6366f1)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                  onClick={() => onOpenQuickAdd(person.id, 'SPOUSE')}
                >
                  + {t('btnAddPartner')}
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {personContext?.immediateFamily?.spouses?.map((s: any) => {
                  const u = graphData?.unions?.find(
                    (unionItem) => unionItem.partner_ids.includes(person.id) && unionItem.partner_ids.includes(s.id)
                  );
                  const isDivorced = u?.union_type === 'DIVORCED';
                  const uIcon = isDivorced ? '💔' : u?.union_type === 'MARRIAGE' ? '💍' : '💞';
                  const statusLabel = isDivorced
                    ? t('unionTypeDivorced')
                    : u?.union_type === 'MARRIAGE'
                      ? t('unionTypeMarriage')
                      : u?.union_type === 'SEPARATED'
                        ? t('unionTypeDivorced')
                        : (localizeKinshipTerm(u?.union_type || s.relation, language));

                  const dateDetails = [
                    u?.start_date ? `${t('sincePrefix')} ${formatTreeDate(u.start_date, dateFormatStyle, language)}` : null,
                    u?.end_date ? `${t('endedPrefix')} ${formatTreeDate(u.end_date, dateFormatStyle, language)}` : null,
                  ].filter(Boolean).join(' • ');

                  return (
                    <div
                      key={s.id}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        background: 'var(--card-bg)',
                        border: isDivorced ? '1px dashed #f43f5e' : '1px solid var(--border-color)',
                        padding: '10px 12px',
                        borderRadius: 8,
                        gap: 6,
                      }}
                    >
                      <div
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
                        onClick={() => selectPerson(s.id, true)}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span>{uIcon}</span>
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{s.name}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span
                            style={{
                              fontSize: 11,
                              color: isDivorced ? '#f43f5e' : '#f472b6',
                              fontWeight: 700,
                              background: isDivorced ? 'rgba(244, 63, 94, 0.15)' : 'rgba(244, 114, 182, 0.15)',
                              padding: '2px 8px',
                              borderRadius: 6,
                            }}
                          >
                            {statusLabel}
                          </span>
                          {u && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingUnion(u);
                                setEditingSpouseName(s.name);
                                setUnionType(u.union_type);
                                setUnionStartDate(u.start_date || '');
                                setUnionEndDate(u.end_date || '');
                                setUnionStartPlace(u.start_place || '');
                                setUnionNotes(u.notes || '');
                              }}
                              style={{
                                background: 'transparent',
                                border: '1px solid var(--border-color)',
                                borderRadius: 4,
                                color: 'var(--text-secondary)',
                                padding: '2px 6px',
                                fontSize: 11,
                                cursor: 'pointer',
                              }}
                              title={t('btnEditUnion')}
                            >
                              ✏️ {t('btnEditUnion')}
                            </button>
                          )}
                        </div>
                      </div>

                      {dateDetails && (
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)', paddingLeft: 24 }}>
                          {dateDetails}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Spouse Union Editing Modal */}
            {editingUnion && (
              <div
                style={{
                  position: 'fixed',
                  inset: 0,
                  zIndex: 200,
                  background: 'rgba(0,0,0,0.65)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 20,
                  backdropFilter: 'blur(8px)',
                }}
                onClick={() => setEditingUnion(null)}
              >
                <div
                  style={{
                    background: 'var(--modal-bg)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 16,
                    width: '100%',
                    maxWidth: 480,
                    padding: 24,
                    boxShadow: 'var(--shadow-modal)',
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                    {t('spouseUnionDetailsModalTitle')}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>
                    {t('relationshipBetween')} {person.first_name} {t('labelAnd')} {editingSpouseName}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                      <label style={labelStyle}>{t('labelUnionType')}</label>
                      <select value={unionType} onChange={(e) => setUnionType(e.target.value as UnionType)} style={inputStyle}>
                        <option value="MARRIAGE">💍 {t('unionTypeMarriage')}</option>
                        <option value="DIVORCED">💔 {t('unionTypeDivorced')}</option>
                        <option value="SEPARATED">⚡ {t('unionTypeDivorced')}</option>
                        <option value="PARTNERSHIP">💞 {t('unionTypeUnmarried')}</option>
                        <option value="CIVIL_UNION">📜 {t('unionTypeCivilUnion')}</option>
                      </select>
                    </div>

                    <div>
                      <label style={labelStyle}>{t('labelUnionStartDate')}</label>
                      <CustomDatePicker value={unionStartDate} onChange={setUnionStartDate} placeholder="e.g. 1980-06-21, 21.06.1980..." />
                    </div>

                    <div>
                      <label style={labelStyle}>
                        {t('labelUnionEndDate')}
                      </label>
                      <CustomDatePicker value={unionEndDate} onChange={setUnionEndDate} placeholder="e.g. 1995-11-04, 04.11.1995..." />
                    </div>

                    <div>
                      <label style={labelStyle}>{t('labelUnionPlace')}</label>
                      <input
                        type="text"
                        value={unionStartPlace}
                        onChange={(e) => setUnionStartPlace(e.target.value)}
                        style={inputStyle}
                        placeholder={language === 'ru' ? 'Город, регион, страна' : 'City, State, Country'}
                      />
                    </div>

                    <div>
                      <label style={labelStyle}>{t('labelUnionNotes')}</label>
                      <textarea
                        value={unionNotes}
                        onChange={(e) => setUnionNotes(e.target.value)}
                        rows={2}
                        style={{ ...inputStyle, resize: 'vertical' }}
                        placeholder={language === 'ru' ? 'Дополнительные подробности или воспоминания...' : 'Optional details or memories...'}
                      />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                      <button
                        type="button"
                        style={{
                          background: 'var(--nav-tab-bg)',
                          color: 'var(--text-primary)',
                          border: '1px solid var(--border-color)',
                          borderRadius: 8,
                          padding: '8px 16px',
                          fontSize: 13,
                          cursor: 'pointer',
                        }}
                        onClick={() => setEditingUnion(null)}
                      >
                        {t('cancel')}
                      </button>
                      <button
                        type="button"
                        disabled={isSavingUnion}
                        style={{
                          background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: 8,
                          padding: '8px 20px',
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                        onClick={async () => {
                          if (!editingUnion) return;
                          setIsSavingUnion(true);
                          try {
                            const res = await fetch(`/api/family-tree/unions/${editingUnion.id}`, {
                              method: 'PUT',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                union_type: unionType,
                                start_date: unionStartDate.trim() || undefined,
                                end_date: unionEndDate.trim() || undefined,
                                start_place: unionStartPlace.trim() || undefined,
                                notes: unionNotes.trim() || undefined,
                              }),
                            });
                            if (res.ok) {
                              setEditingUnion(null);
                              getPersonContext({ personId: person.id }).then((ctx) => setPersonContext(ctx));
                              await onUpdatePerson(person.id, {});
                            }
                          } finally {
                            setIsSavingUnion(false);
                          }
                        }}
                      >
                        {isSavingUnion ? t('btnSavingUnion') : t('btnSaveUnion')}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Siblings */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {t('labelSiblings')} ({personContext?.immediateFamily?.siblings?.length || 0})
                </div>
                <button
                  type="button"
                  style={{ background: 'transparent', border: 'none', color: 'var(--primary-color, #6366f1)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                  onClick={() => onOpenQuickAdd(person.id, 'SIBLING')}
                >
                  + {t('btnAddSibling')}
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {personContext?.immediateFamily?.siblings?.map((sib: any) => (
                  <div
                    key={sib.id}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--card-bg)', border: '1px solid var(--border-color)', padding: '8px 12px', borderRadius: 8, cursor: 'pointer' }}
                    onClick={() => selectPerson(sib.id, true)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span>↔️</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{sib.name}</span>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }}>{localizeKinshipTerm(sib.relation, language)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Children */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {t('labelChildren')} ({personContext?.immediateFamily?.children?.length || 0})
                </div>
                <button
                  type="button"
                  style={{ background: 'transparent', border: 'none', color: 'var(--primary-color, #6366f1)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                  onClick={() => onOpenQuickAdd(person.id, 'CHILD')}
                >
                  + {t('btnAddChild')}
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {personContext?.immediateFamily?.children?.map((c: any) => (
                  <div
                    key={c.id}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--card-bg)', border: '1px solid var(--border-color)', padding: '8px 12px', borderRadius: 8, cursor: 'pointer' }}
                    onClick={() => selectPerson(c.id, true)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span>👶</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{c.name}</span>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--primary-color, #6366f1)', fontWeight: 600 }}>{localizeKinshipTerm(c.relation, language)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Life Story & Facts */}
        {drawerActiveTab === 'timeline' && (
          <PersonTimelineView personId={person.id} personName={fullName} />
        )}
      </div>
    </div>
  );
};
