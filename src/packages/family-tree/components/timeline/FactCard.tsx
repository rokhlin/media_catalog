import { memo, useState } from 'react';
import { useLanguage } from '../../../../i18n/LanguageContext.js';
import type { PersonEventRecord, EventMediaPinRecord } from '../../types/event.types.js';
import { useFamilyTreeStore } from '../../state/useFamilyTreeStore.js';
import { formatTreeDate } from '../../utils/dateUtils.js';
import { localizeKinshipTerm } from '../../utils/kinshipUtils.js';
import {
  localizeEventType,
  localizeEventTitle,
  localizeEventDescription,
  localizeRelationshipStatus,
  localizeRelationshipTargetType,
} from '../../utils/eventLocalization.js';

interface FactCardProps {
  event: PersonEventRecord;
  onEdit?: (event: PersonEventRecord) => void;
  onDelete?: (eventId: string) => void;
  onPinMedia?: (eventId: string) => void;
  onUnpinMedia?: (pinId: string) => void;
}

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
};

export const FactCard = memo(({ event, onEdit, onDelete, onPinMedia, onUnpinMedia }: FactCardProps) => {
  const { language, t } = useLanguage();
  const { dateFormatStyle } = useFamilyTreeStore();
  const [selectedPin, setSelectedPin] = useState<EventMediaPinRecord | null>(null);

  const icon = CATEGORY_ICONS[event.event_type] || '📌';
  const color = CATEGORY_COLORS[event.event_type] || '#6366f1';
  const datePrefix = event.date_is_approximate ? `${language === 'ru' ? 'ок. ' : 'circa '}` : '';
  const formattedStart = event.event_date ? formatTreeDate(event.event_date, dateFormatStyle, language) : null;
  const formattedEnd = event.end_date ? formatTreeDate(event.end_date, dateFormatStyle, language) : null;
  const dateDisplay = formattedStart
    ? `${datePrefix}${formattedStart}${formattedEnd ? ` – ${formattedEnd}` : ''}`
    : t('factDateUnrecorded');

  return (
    <div
      style={{
        background: 'var(--card-bg)',
        border: '1px solid var(--border-color)',
        borderRadius: 12,
        padding: '12px 16px',
        marginBottom: 16,
        boxShadow: 'var(--shadow-card)',
        position: 'relative',
        transition: 'all 0.15s ease',
      }}
    >
      {/* Header: Date badge, Category, and Action Buttons */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              background: `${color}25`,
              color: color,
              border: `1px solid ${color}40`,
              borderRadius: 6,
              padding: '2px 8px',
              fontSize: 11,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <span>{icon}</span>
            <span>{localizeEventType(event.event_type, language).toUpperCase()}</span>
          </span>

          <span style={{ color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600 }}>
            {dateDisplay}
          </span>

          {(event as any).relativeRelation && (
            <span
              style={{
                background: 'rgba(168, 85, 247, 0.15)',
                color: 'var(--accent-color, #a855f7)',
                border: '1px solid rgba(168, 85, 247, 0.3)',
                borderRadius: 6,
                padding: '2px 8px',
                fontSize: 10,
                fontWeight: 700,
              }}
            >
              👤 {localizeKinshipTerm((event as any).relativeRelation, language)}: {(event as any).relativeName}
            </span>
          )}
        </div>

        {/* Action Buttons for non-system events */}
        {!event.is_system_generated && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {onPinMedia && (
              <button
                type="button"
                style={{
                  background: 'var(--nav-tab-bg)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 6,
                  color: 'var(--text-secondary)',
                  padding: '3px 8px',
                  fontSize: 11,
                  cursor: 'pointer',
                }}
                onClick={() => onPinMedia(event.id)}
                title={t('btnPinPhoto')}
              >
                📷 {t('btnPinPhoto')}
              </button>
            )}

            {onEdit && (
              <button
                type="button"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
                onClick={() => onEdit(event)}
                title={t('btnEditFact')}
              >
                ✏️
              </button>
            )}

            {onDelete && (
              <button
                type="button"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--error-color, #ef4444)',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
                onClick={() => onDelete(event.id)}
                title={t('btnDeleteFact')}
              >
                🗑️
              </button>
            )}
          </div>
        )}
      </div>

      {/* Title */}
      <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 4 }}>
        {localizeEventTitle(event.title, language)}
      </div>

      {/* Relationship Partner Details */}
      {(event.relationship_target_name || event.relationship_status) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <span
            style={{
              background: 'rgba(236, 72, 153, 0.15)',
              color: '#f472b6',
              border: '1px solid rgba(236, 72, 153, 0.3)',
              borderRadius: 6,
              padding: '2px 8px',
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            💞 {event.relationship_status ? `${localizeRelationshipStatus(event.relationship_status, language).toUpperCase()}: ` : ''}
            {event.relationship_target_name || (language === 'ru' ? 'Вне древа' : 'External')}
            {event.relationship_target_type ? ` (${localizeRelationshipTargetType(event.relationship_target_type, language)})` : ''}
          </span>
        </div>
      )}

      {/* Description */}
      {event.description && (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4, marginBottom: 8 }}>
          {localizeEventDescription(event.description, language)}
        </div>
      )}

      {/* Location */}
      {event.location_name && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
          <span>📍</span>
          <span>{event.location_name}</span>
        </div>
      )}

      {/* Pinned Gallery Media Strip */}
      {event.pinned_media && event.pinned_media.length > 0 && (
        <div style={{ marginTop: 10, borderTop: '1px solid var(--border-color)', paddingTop: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
            {t('pinnedPhotosCount')} ({event.pinned_media.length})
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
            {event.pinned_media.map((pin: EventMediaPinRecord) => {
              const src = pin.thumbnail_url || `/api/media/thumbnail?file=${encodeURIComponent(pin.media_file_path)}&size=160`;
              return (
                <div
                  key={pin.id}
                  style={{
                    position: 'relative',
                    flexShrink: 0,
                    width: 64,
                    height: 64,
                    borderRadius: 8,
                    overflow: 'hidden',
                    border: '1px solid var(--border-color)',
                    cursor: 'pointer',
                  }}
                  onClick={() => setSelectedPin(pin)}
                >
                  <img
                    src={src}
                    alt={pin.caption || 'Pinned photo'}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                  {onUnpinMedia && (
                    <button
                      type="button"
                      style={{
                        position: 'absolute',
                        top: 2,
                        right: 2,
                        background: 'rgba(0,0,0,0.7)',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '50%',
                        width: 16,
                        height: 16,
                        fontSize: 10,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onUnpinMedia(pin.id);
                      }}
                      title={t('unpinPhotoTooltip')}
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Lightbox / Full Preview Modal */}
      {selectedPin && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            background: 'rgba(0, 0, 0, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backdropFilter: 'blur(8px)',
            padding: 24,
          }}
          onClick={() => setSelectedPin(null)}
        >
          <div
            style={{
              maxWidth: '90vw',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 12,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={`/api/media/file?file=${encodeURIComponent(selectedPin.media_file_path)}`}
              alt={selectedPin.caption || t('fullResolutionPhoto')}
              style={{
                maxWidth: '85vw',
                maxHeight: '80vh',
                borderRadius: 10,
                objectFit: 'contain',
                boxShadow: '0 20px 60px rgba(0, 0, 0, 0.8)',
              }}
            />
            {selectedPin.caption && (
              <div style={{ color: '#f8fafc', fontSize: 13, textAlign: 'center' }}>
                {selectedPin.caption}
              </div>
            )}
            <button
              type="button"
              style={{
                background: 'rgba(255, 255, 255, 0.15)',
                color: '#ffffff',
                border: 'none',
                borderRadius: 20,
                padding: '6px 16px',
                fontSize: 12,
                cursor: 'pointer',
              }}
              onClick={() => setSelectedPin(null)}
            >
              {t('close')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

FactCard.displayName = 'FactCard';
