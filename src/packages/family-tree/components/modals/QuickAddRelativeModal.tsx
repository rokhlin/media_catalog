import { useState, useMemo, useEffect, useRef } from 'react';
import type { Gender, FiliationType, TreeGraphData } from '../../types/tree.types.js';
import { useLanguage } from '../../../../i18n/LanguageContext.js';

interface QuickAddRelativeModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetPersonId: string | null;
  targetPersonName?: string;
  initialRelationship?: 'PARENT' | 'CHILD' | 'SPOUSE' | 'SIBLING';
  graphData?: TreeGraphData | null;
  onAddRelative: (data: {
    relationship: 'PARENT' | 'CHILD' | 'SPOUSE' | 'SIBLING';
    target_person_id: string;
    other_parent_id?: string;
    person: Record<string, any>;
    filiation?: FiliationType;
  }) => Promise<void>;
}

export const QuickAddRelativeModal = ({
  isOpen,
  onClose,
  targetPersonId,
  targetPersonName,
  initialRelationship = 'CHILD',
  graphData,
  onAddRelative,
}: QuickAddRelativeModalProps) => {
  const { language, t } = useLanguage();
  const [relationship, setRelationship] = useState<'PARENT' | 'CHILD' | 'SPOUSE' | 'SIBLING'>(initialRelationship);
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [maidenName, setMaidenName] = useState('');
  const [gender, setGender] = useState<Gender>('UNKNOWN');
  // Selected spouse ID (or empty string for unknown / single parent) when adding a child
  const [otherParentId, setOtherParentId] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [birthPlace, setBirthPlace] = useState('');
  const [isLiving, setIsLiving] = useState(true);
  const [deathDate, setDeathDate] = useState('');
  const [filiation, setFiliation] = useState<FiliationType>('BIOLOGICAL');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Compute all spouses/partners of targetPersonId from graphData
  const spouses = useMemo(() => {
    if (!graphData || !targetPersonId) return [];
    const spouseMap = new Map<string, { id: string; name: string }>();

    const userUnions = (graphData.unions || []).filter((u) => u.partner_ids.includes(targetPersonId));
    for (const u of userUnions) {
      for (const pid of u.partner_ids) {
        if (pid !== targetPersonId && !spouseMap.has(pid)) {
          const person = (graphData.persons || []).find((p) => p.id === pid);
          const name = person?.full_name || [person?.first_name, person?.last_name].filter(Boolean).join(' ') || 'Unknown Person';
          const unionStatus = u.union_type === 'DIVORCED'
            ? (language === 'ru' ? ' (В разводе)' : ' (Divorced)')
            : u.union_type === 'SEPARATED'
            ? (language === 'ru' ? ' (Расстались)' : ' (Separated)')
            : '';
          spouseMap.set(pid, {
            id: pid,
            name: `${name}${unionStatus}`,
          });
        }
      }
    }
    return Array.from(spouseMap.values());
  }, [graphData, targetPersonId, language]);

  // When modal opens, initialize relationship and default spouse if exactly 1 spouse
  const prevOpenRef = useRef(false);
  useEffect(() => {
    if (isOpen && !prevOpenRef.current) {
      setRelationship(initialRelationship);
      if (initialRelationship === 'CHILD' && spouses.length === 1) {
        setOtherParentId(spouses[0].id);
      } else {
        setOtherParentId('');
      }
    }
    prevOpenRef.current = isOpen;
  }, [isOpen, initialRelationship, spouses]);

  if (!isOpen || !targetPersonId) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim()) return;

    setIsSubmitting(true);
    try {
      await onAddRelative({
        relationship,
        // Include other_parent_id only if a spouse was selected (not empty / unknown)
        ...(relationship === 'CHILD' && otherParentId.trim() ? { other_parent_id: otherParentId.trim() } : {}),
        target_person_id: targetPersonId,
        person: {
          first_name: firstName.trim(),
          middle_name: middleName.trim() || undefined,
          last_name: lastName.trim() || undefined,
          maiden_name: maidenName.trim() || undefined,
          gender,
          birth_date: birthDate.trim() || undefined,
          birth_place: birthPlace.trim() || undefined,
          is_living: isLiving,
          death_date: !isLiving ? deathDate.trim() || undefined : undefined,
        },
        filiation: (relationship === 'CHILD' || relationship === 'PARENT' || relationship === 'SIBLING') ? filiation : undefined,
      });
      onClose();
      // Reset
      setFirstName('');
      setMiddleName('');
      setLastName('');
      setMaidenName('');
      setBirthDate('');
      setBirthPlace('');
      setDeathDate('');
      setIsLiving(true);
      setOtherParentId('');
    } catch {
      // ignore
    } finally {
      setIsSubmitting(false);
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

  const RELATIONSHIPS = [
    { id: 'PARENT', label: t('relationParentDetailed'), icon: '⬆️' },
    { id: 'SPOUSE', label: t('relationSpouseDetailed'), icon: '💍' },
    { id: 'SIBLING', label: t('relationSiblingDetailed'), icon: '↔️' },
    { id: 'CHILD', label: t('relationChildDetailed'), icon: '⬇️' },
  ];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(0, 0, 0, 0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backdropFilter: 'blur(8px)',
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--modal-bg)',
          border: '1px solid var(--border-color)',
          borderRadius: 16,
          width: '100%',
          maxWidth: 540,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: 'var(--shadow-modal)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
              {t('modalAddRelativeTitle')}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {targetPersonName ? `${t('connectingRelativeTo')} ${targetPersonName}` : t('emptyTreeAddButton')}
            </div>
          </div>
          <button
            type="button"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              fontSize: 16,
              cursor: 'pointer',
            }}
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: 20, overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Relationship Selector */}
          <div>
            <label style={labelStyle}>{t('relationshipToPerson')} {targetPersonName || 'Selection'}</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
              {RELATIONSHIPS.map((rel) => {
                const isSelected = relationship === rel.id;
                return (
                  <button
                    key={rel.id}
                    type="button"
                    style={{
                      background: isSelected ? 'var(--nav-tab-active-bg)' : 'var(--card-bg)',
                      border: isSelected ? '1.5px solid var(--primary-color, #6366f1)' : '1px solid var(--border-color)',
                      borderRadius: 8,
                      padding: '10px 12px',
                      color: isSelected ? 'var(--primary-color, #6366f1)' : 'var(--text-secondary)',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                    onClick={() => {
                      setRelationship(rel.id as any);
                      if (rel.id === 'CHILD' && spouses.length === 1 && !otherParentId) {
                        setOtherParentId(spouses[0].id);
                      }
                    }}
                  >
                    <span>{rel.icon}</span>
                    <span>{rel.label}</span>
                  </button>
                );
              })}
            </div>
            {/* If adding a child, allow specifying other parent from spouse list or unknown */}
            {relationship === 'CHILD' && (
              <div style={{ marginTop: 10 }}>
                <label style={labelStyle}>{t('labelOtherParent')}</label>
                <select
                  value={otherParentId}
                  onChange={(e) => setOtherParentId(e.target.value)}
                  style={inputStyle}
                >
                  <option value="">{t('unknownOtherParent')}</option>
                  {spouses.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                  {otherParentId
                    ? (language === 'ru' ? 'Ребёнок будет привязан к этому супругу как ко второму родителю.' : 'Child will be linked to this spouse as second parent.')
                    : spouses.length === 0
                    ? (language === 'ru' ? 'Нет данных о супруге. Второй родитель останется незаполненным.' : 'No spouse on record. Child\'s second parent will remain empty.')
                    : (language === 'ru' ? 'При выборе «Не указан» второй родитель останется пустым.' : 'Selecting "Unknown" keeps the child\'s second parent empty.')}
                </div>
              </div>
            )}
          </div>

          {/* Names */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>{t('labelFirstName')} *</label>
              <input
                type="text"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder={language === 'ru' ? 'напр. Анна' : 'e.g. Sarah'}
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>{t('labelLastName')}</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder={language === 'ru' ? 'напр. Иванова' : 'e.g. Johnson'}
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>{t('labelMiddleName')}</label>
              <input
                type="text"
                value={middleName}
                onChange={(e) => setMiddleName(e.target.value)}
                placeholder={language === 'ru' ? 'напр. Сергеевна' : 'e.g. Elizabeth'}
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>{t('labelMaidenName')}</label>
              <input
                type="text"
                value={maidenName}
                onChange={(e) => setMaidenName(e.target.value)}
                placeholder={language === 'ru' ? 'напр. Смирнова' : 'e.g. Smith'}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Gender and Filiation */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>{t('labelGender')}</label>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value as Gender)}
                style={inputStyle}
              >
                <option value="UNKNOWN">{t('genderUnknown')}</option>
                <option value="MALE">{t('genderMale')}</option>
                <option value="FEMALE">{t('genderFemale')}</option>
                <option value="NON_BINARY">{t('genderOther')}</option>
                <option value="OTHER">{t('genderOther')}</option>
              </select>
            </div>

            {(relationship === 'CHILD' || relationship === 'PARENT' || relationship === 'SIBLING') && (
              <div>
                <label style={labelStyle}>{t('filiationTypeLabel')}</label>
                <select
                  value={filiation}
                  onChange={(e) => setFiliation(e.target.value as FiliationType)}
                  style={inputStyle}
                >
                  <option value="BIOLOGICAL">{t('filiationBiological')}</option>
                  <option value="ADOPTED">{t('filiationAdopted')}</option>
                  <option value="FOSTER">{t('filiationFoster')}</option>
                  <option value="STEP">{t('filiationStep')}</option>
                  <option value="SURROGATE">{t('filiationSurrogate')}</option>
                </select>
              </div>
            )}
          </div>

          {/* Birth Info */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>{t('labelBirthDate')}</label>
              <input
                type="text"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                placeholder="e.g. 1968-05-14"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>{t('labelBirthPlace')}</label>
              <input
                type="text"
                value={birthPlace}
                onChange={(e) => setBirthPlace(e.target.value)}
                placeholder={language === 'ru' ? 'напр. Москва, Россия' : 'e.g. Boston, MA'}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Living vs Deceased */}
          <div>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 13,
                color: 'var(--text-primary)',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={isLiving}
                onChange={(e) => setIsLiving(e.target.checked)}
              />
              <span>{t('currentlyLivingCheckbox')}</span>
            </label>

            {!isLiving && (
              <div style={{ marginTop: 10 }}>
                <label style={labelStyle}>{t('labelDeathDate')}</label>
                <input
                  type="text"
                  value={deathDate}
                  onChange={(e) => setDeathDate(e.target.value)}
                  placeholder="e.g. 2015-11-20"
                  style={inputStyle}
                />
              </div>
            )}
          </div>

          {/* Footer Buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
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
              onClick={onClose}
            >
              {t('cancel')}
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                color: '#ffffff',
                border: 'none',
                borderRadius: 8,
                padding: '8px 20px',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(99, 102, 241, 0.4)',
              }}
            >
              {isSubmitting ? t('addingFamilyMember') : t('btnAddFamilyMember')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
