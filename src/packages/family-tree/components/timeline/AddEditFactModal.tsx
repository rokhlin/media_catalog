import { useState, useEffect, useMemo } from 'react';
import { useLanguage } from '../../../../i18n/LanguageContext.js';
import type { PersonEventRecord, EventType } from '../../types/event.types.js';
import { GalleryPhotoPicker } from './GalleryPhotoPicker.js';
import { CustomDatePicker } from '../common/CustomDatePicker.js';

interface AddEditFactModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: {
    event_type: EventType;
    title: string;
    description?: string;
    event_date?: string;
    end_date?: string;
    date_is_approximate?: boolean;
    location_name?: string;
    latitude?: number;
    longitude?: number;
    relationship_target_type?: 'PERSON' | 'FAMILY' | 'EXTERNAL_PERSON' | 'FAMILY_TO_FAMILY';
    relationship_target_name?: string;
    relationship_target_id?: string;
    relationship_status?: string;
    pinned_media?: Array<{ media_id?: string; media_file_path: string; caption?: string }>;
  }) => Promise<void>;
  factToEdit?: PersonEventRecord | null;
  personName?: string;
}

export const AddEditFactModal = ({
  isOpen,
  onClose,
  onSave,
  factToEdit,
  personName,
}: AddEditFactModalProps) => {
  const { language, t } = useLanguage();
  const [eventType, setEventType] = useState<EventType>('GRADUATION');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [dateApprox, setDateApprox] = useState(false);
  const [locationName, setLocationName] = useState('');
  const [relTargetType, setRelTargetType] = useState<'PERSON' | 'FAMILY' | 'EXTERNAL_PERSON' | 'FAMILY_TO_FAMILY'>('EXTERNAL_PERSON');
  const [relTargetName, setRelTargetName] = useState('');
  const [relStatus, setRelStatus] = useState('dating');
  const [pinnedPhotos, setPinnedPhotos] = useState<Array<{ media_file_path: string; caption?: string }>>([]);
  const [isPhotoPickerOpen, setIsPhotoPickerOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const categories: Array<{ type: EventType; label: string; icon: string }> = useMemo(() => [
    { type: 'GRADUATION', label: `🎓 ${t('factTypeEducation')}`, icon: '🎓' },
    { type: 'CAREER', label: `💼 ${t('factTypeCareer')}`, icon: '💼' },
    { type: 'RELOCATION', label: `📍 ${t('factTypeResidence')}`, icon: '📍' },
    { type: 'TRAVEL', label: `✈️ ${t('filterCategoryTravel')}`, icon: '✈️' },
    { type: 'MARRIAGE', label: `💍 ${t('factTypeMarriage')}`, icon: '💍' },
    { type: 'DIVORCE', label: `💔 ${t('factTypeDivorce')}`, icon: '💔' },
    { type: 'RELATIONSHIP', label: `💞 ${t('factTypeRelationship')}`, icon: '💞' },
    { type: 'MILITARY', label: `🎖️ ${t('factTypeMilitary')}`, icon: '🎖️' },
    { type: 'CUSTOM', label: `📝 ${t('factTypeOther')}`, icon: '📝' },
  ], [t]);

  useEffect(() => {
    if (!isOpen) return;

    if (factToEdit) {
      setEventType(factToEdit.event_type);
      setTitle(factToEdit.title);
      setDescription(factToEdit.description || '');
      setEventDate(factToEdit.event_date || '');
      setEndDate(factToEdit.end_date || '');
      setDateApprox(factToEdit.date_is_approximate === 1);
      setLocationName(factToEdit.location_name || '');
      setRelTargetType(factToEdit.relationship_target_type || 'EXTERNAL_PERSON');
      setRelTargetName(factToEdit.relationship_target_name || '');
      setRelStatus(factToEdit.relationship_status || 'dating');
      setPinnedPhotos(factToEdit.pinned_media?.map((p: any) => ({ media_file_path: p.media_file_path, caption: p.caption || undefined })) || []);
    } else {
      setEventType('GRADUATION');
      setTitle('');
      setDescription('');
      setEventDate('');
      setEndDate('');
      setDateApprox(false);
      setLocationName('');
      setRelTargetType('EXTERNAL_PERSON');
      setRelTargetName('');
      setRelStatus('dating');
      setPinnedPhotos([]);
    }
  }, [isOpen, factToEdit]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSubmitting(true);
    try {
      await onSave({
        event_type: eventType,
        title: title.trim(),
        description: description.trim() || undefined,
        event_date: eventDate.trim() || undefined,
        end_date: endDate.trim() || undefined,
        date_is_approximate: dateApprox,
        location_name: locationName.trim() || undefined,
        relationship_target_type: ['RELATIONSHIP', 'MARRIAGE', 'DIVORCE'].includes(eventType) ? relTargetType : undefined,
        relationship_target_name: ['RELATIONSHIP', 'MARRIAGE', 'DIVORCE'].includes(eventType) ? relTargetName.trim() || undefined : undefined,
        relationship_status: ['RELATIONSHIP', 'MARRIAGE', 'DIVORCE'].includes(eventType) ? relStatus : undefined,
        pinned_media: pinnedPhotos,
      });
      onClose();
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

  const isRelationshipEvent = ['RELATIONSHIP', 'MARRIAGE', 'DIVORCE'].includes(eventType);

  return (
    <>
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
            maxWidth: 580,
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
                {factToEdit ? t('modalEditFactTitle') : t('modalAddFactTitle')}
              </div>
              {personName && (
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {t('recordingEventFor')} {personName}
                </div>
              )}
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
            {/* Category selection */}
            <div>
              <label style={labelStyle}>{t('labelFactType')}</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {categories.map((cat) => {
                  const isSelected = eventType === cat.type;
                  return (
                    <button
                      key={cat.type}
                      type="button"
                      style={{
                        background: isSelected ? 'var(--nav-tab-active-bg)' : 'var(--card-bg)',
                        border: isSelected ? '1.5px solid var(--primary-color, #6366f1)' : '1px solid var(--border-color)',
                        borderRadius: 8,
                        padding: '8px 6px',
                        color: isSelected ? 'var(--primary-color, #6366f1)' : 'var(--text-secondary)',
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 4,
                        textAlign: 'center',
                      }}
                      onClick={() => setEventType(cat.type)}
                    >
                      <span style={{ fontSize: 16 }}>{cat.icon}</span>
                      <span>{cat.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Title */}
            <div>
              <label style={labelStyle}>{t('labelFactTitle')} *</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={
                  isRelationshipEvent
                    ? (language === 'ru' ? 'напр. Начали встречаться, Свадьба, Расставание' : 'e.g. Started dating, Wedding in Rome, Amicable separation')
                    : (language === 'ru' ? 'напр. Окончание школы, степень магистра' : 'e.g. Master\'s Degree in Computer Science from MIT')
                }
                style={inputStyle}
              />
            </div>

            {/* Relationship Target Configuration */}
            {isRelationshipEvent && (
              <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {t('relationshipDetailsSection')}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={labelStyle}>{t('relationshipStatusLabel')}</label>
                    <select value={relStatus} onChange={(e) => setRelStatus(e.target.value)} style={inputStyle}>
                      <option value="dating">{language === 'ru' ? 'Начали встречаться' : 'Started Dating'}</option>
                      <option value="engaged">{language === 'ru' ? 'Помолвлены' : 'Engaged'}</option>
                      <option value="married">{t('unionTypeMarriage')}</option>
                      <option value="divorced">{t('unionTypeDivorced')}</option>
                      <option value="separated">{language === 'ru' ? 'Расстались' : 'Separated'}</option>
                      <option value="partner">{t('unionTypeUnmarried')}</option>
                    </select>
                  </div>

                  <div>
                    <label style={labelStyle}>{t('connectWithLabel')}</label>
                    <select value={relTargetType} onChange={(e) => setRelTargetType(e.target.value as any)} style={inputStyle}>
                      <option value="EXTERNAL_PERSON">{t('connectWithExternal')}</option>
                      <option value="PERSON">{t('connectWithMember')}</option>
                      <option value="FAMILY">{t('connectWithBranch')}</option>
                      <option value="FAMILY_TO_FAMILY">{t('connectWithTwoFamilies')}</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>
                    {t('partnerOrFamilyNameLabel')}
                  </label>
                  <input
                    type="text"
                    value={relTargetName}
                    onChange={(e) => setRelTargetName(e.target.value)}
                    placeholder={language === 'ru' ? 'напр. Иван Иванов или Семья Ивановых' : 'e.g. Jordan Miller or The Johnson Family'}
                    style={inputStyle}
                  />
                </div>
              </div>
            )}

            {/* Dates: Start & End */}
            <div style={{ display: 'grid', gridTemplateColumns: isRelationshipEvent ? '1fr 1fr' : '1fr auto', gap: 12, alignItems: 'flex-start' }}>
              <div>
                <label style={labelStyle}>
                  {isRelationshipEvent ? t('labelUnionStartDate') : t('labelFactDate')}
                </label>
                <CustomDatePicker value={eventDate} onChange={setEventDate} placeholder="e.g. 2018-06-15, 15.06.2018" />
              </div>

              {isRelationshipEvent ? (
                <div>
                  <label style={labelStyle}>{t('labelUnionEndDate')}</label>
                  <CustomDatePicker value={endDate} onChange={setEndDate} placeholder="e.g. 2022-08-10, 10.08.2022" />
                </div>
              ) : (
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 12,
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    marginTop: 26,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={dateApprox}
                    onChange={(e) => setDateApprox(e.target.checked)}
                  />
                  <span>{t('approximateCircaCheckbox')}</span>
                </label>
              )}
            </div>

            {/* Location */}
            <div>
              <label style={labelStyle}>{t('labelFactPlace')}</label>
              <input
                type="text"
                value={locationName}
                onChange={(e) => setLocationName(e.target.value)}
                placeholder={language === 'ru' ? 'напр. Москва, Россия' : 'e.g. Cambridge, MA, United States'}
                style={inputStyle}
              />
            </div>

            {/* Description */}
            <div>
              <label style={labelStyle}>{t('storyNotesLabel')}</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={language === 'ru' ? 'Дополнительные подробности, воспоминания, примечания...' : 'Additional context, memories, notes...'}
                rows={3}
                style={{ ...inputStyle, resize: 'vertical', minHeight: 60 }}
              />
            </div>

            {/* Gallery Photos Pinning Section */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <label style={labelStyle}>
                  {t('attachedGalleryPhotosLabel')} ({pinnedPhotos.length})
                </label>
                <button
                  type="button"
                  style={{
                    background: 'rgba(99, 102, 241, 0.2)',
                    border: '1px solid rgba(99, 102, 241, 0.4)',
                    color: '#c7d2fe',
                    padding: '3px 10px',
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                  onClick={() => setIsPhotoPickerOpen(true)}
                >
                  {t('btnBrowseGallery')}
                </button>
              </div>

              {pinnedPhotos.length > 0 && (
                <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
                  {pinnedPhotos.map((p, idx) => (
                    <div
                      key={idx}
                      style={{
                        position: 'relative',
                        width: 60,
                        height: 60,
                        borderRadius: 8,
                        overflow: 'hidden',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        flexShrink: 0,
                      }}
                    >
                      <img
                        src={`/api/media/file?file=${encodeURIComponent(p.media_file_path)}`}
                        alt="Pinned preview"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                      <button
                        type="button"
                        style={{
                          position: 'absolute',
                          top: 2,
                          right: 2,
                          background: 'rgba(0, 0, 0, 0.7)',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '50%',
                          width: 16,
                          height: 16,
                          fontSize: 10,
                          cursor: 'pointer',
                        }}
                        onClick={() => {
                          setPinnedPhotos((prev) => prev.filter((_, i) => i !== idx));
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
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
                {isSubmitting ? (language === 'ru' ? 'Сохранение…' : 'Saving...') : factToEdit ? t('btnUpdateFact') : t('btnCreateFact')}
              </button>
            </div>
          </form>
        </div>
      </div>

      <GalleryPhotoPicker
        isOpen={isPhotoPickerOpen}
        onClose={() => setIsPhotoPickerOpen(false)}
        defaultPersonName={personName}
        onSelectPhotos={(photos) => {
          setPinnedPhotos((prev) => [...prev, ...photos]);
        }}
      />
    </>
  );
};
