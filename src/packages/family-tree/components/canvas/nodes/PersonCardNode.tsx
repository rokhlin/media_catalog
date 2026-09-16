import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { TreeGraphPerson } from '../../../types/tree.types.js';
import { useFamilyTreeStore } from '../../../state/useFamilyTreeStore.js';
import { formatTreeDate, checkCelebration } from '../../../utils/dateUtils.js';
import { localizeKinshipTerm } from '../../../utils/kinshipUtils.js';
import { useLanguage } from '../../../../../i18n/LanguageContext.js';

export interface SpouseSummary {
  unionId: string;
  unionType: string;
  spouseId?: string;
  spouseName: string;
  startDate?: string | null;
  endDate?: string | null;
}

export interface PersonCardNodeData {
  person: TreeGraphPerson;
  isRoot?: boolean;
  isFolded?: boolean;
  spouses?: SpouseSummary[];
  relationshipToRoot?: string;
}

export const PersonCardNode = memo(({ data, selected }: NodeProps) => {
  const { person, isRoot, isFolded, spouses = [], relationshipToRoot } = data as unknown as PersonCardNodeData;
  const {
    selectedPersonId,
    highlightedPersonId,
    nodeViewStyle,
    dateFormatStyle,
    celebrationConfig,
    selectPerson,
    openDrawer,
    openQuickAdd,
    toggleFoldBranch,
  } = useFamilyTreeStore();

  const { language, t } = useLanguage();

  const isCurrentSelected = selected || selectedPersonId === person.id;
  const isHighlighted = highlightedPersonId === person.id;

  const fullName = person.full_name || `${person.first_name} ${person.last_name || ''}`.trim();
  const formattedBirth = person.birth_date ? formatTreeDate(person.birth_date, dateFormatStyle, language) : '';
  const formattedDeath = person.death_date ? formatTreeDate(person.death_date, dateFormatStyle, language) : '';

  const isDeceased = Boolean(person.death_date) || !person.is_living || person.is_living === 0;
  const computedRelationship = relationshipToRoot || person.kinship_to_root;
  const relationshipText = isRoot ? t('hudMe') : (computedRelationship ? localizeKinshipTerm(computedRelationship, language) : t('hudRelative'));

  const lifespan = person.is_living
    ? formattedBirth ? `${t('bornPrefix')} ${formattedBirth}` : t('statusLiving')
    : formattedBirth && formattedDeath
      ? `${formattedBirth} – ${formattedDeath}`
      : formattedDeath ? `${t('diedPrefix')} ${formattedDeath}` : t('statusDeceased');

  const avatarUrl = person.avatar_url || (person.avatar_face_id && !person.avatar_face_id.startsWith('manual_') && !person.avatar_face_id.startsWith('face_manual_') ? `/api/faces/image/${person.avatar_face_id}` : null);
  const initials = `${person.first_name?.[0] || ''}${person.last_name?.[0] || ''}`.toUpperCase() || '?';

  // Gender colors
  const genderGradient =
    person.gender === 'MALE'
      ? 'linear-gradient(135deg, #3b82f6, #1d4ed8)'
      : person.gender === 'FEMALE'
        ? 'linear-gradient(135deg, #ec4899, #be185d)'
        : 'linear-gradient(135deg, #8b5cf6, #6d28d9)';

  const cardBorder = isHighlighted
    ? '2px solid #f59e0b'
    : isCurrentSelected
      ? '2px solid var(--primary-color, #6366f1)'
      : isRoot
        ? '1.5px solid var(--accent-color, #a855f7)'
        : '1px solid var(--border-color)';

  const cardShadow = isHighlighted
    ? '0 0 25px rgba(245, 158, 11, 0.5)'
    : isCurrentSelected
      ? '0 0 25px rgba(99, 102, 241, 0.5)'
      : isRoot
        ? '0 4px 20px rgba(168, 85, 247, 0.25)'
        : 'var(--shadow-card)';

  // Celebration calculation
  const celebration = celebrationConfig.enabled
    ? checkCelebration(person.birth_date, 'BIRTHDAY', celebrationConfig.daysThreshold, new Date(), language)
    : null;

  const renderCelebrationBadge = (compact = false) => {
    if (!celebration || !celebrationConfig.showBirthday) return null;

    const bg = celebrationConfig.badgeColor || '#ec4899';
    const icon = celebrationConfig.customIcon || celebration.icon;
    const isIconOnly = celebrationConfig.contentDisplay === 'icon_only';
    const showText = !compact && !isIconOnly;
    const detailedTooltip = `${celebration.title} (${celebration.isToday ? t('celebrationToday') : `${celebration.daysRemaining} ${t('celebrationDaysRemaining')}`})`;

    if (celebrationConfig.badgeStyle === 'ribbon') {
      return (
        <div
          style={{
            position: 'absolute',
            top: -12,
            right: 12,
            background: bg,
            color: '#ffffff',
            fontSize: 9,
            fontWeight: 800,
            padding: showText ? '2px 8px' : '3px 6px',
            borderRadius: '4px',
            boxShadow: `0 2px 8px ${bg}80`,
            zIndex: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            textTransform: 'uppercase',
            cursor: 'help',
          }}
          title={detailedTooltip}
        >
          <span>{icon}</span>
          {showText && <span>{celebration.isToday ? t('celebrationToday') : `${celebration.daysRemaining}d`}</span>}
        </div>
      );
    }

    // Default pill / glow
    return (
      <div
        style={{
          position: 'absolute',
          top: -10,
          right: 10,
          background: bg,
          color: '#ffffff',
          fontSize: 10,
          fontWeight: 700,
          padding: showText ? '2px 8px' : '3px 6px',
          borderRadius: 12,
          boxShadow: celebrationConfig.badgeStyle === 'glow' ? `0 0 14px ${bg}` : `0 2px 8px ${bg}80`,
          zIndex: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          animation: celebration.isToday ? 'pulse 1.5s infinite' : undefined,
          cursor: 'help',
        }}
        title={detailedTooltip}
      >
        <span>{icon}</span>
        {showText && <span>{celebration.isToday ? t('celebrationToday') : `${celebration.daysRemaining}d`}</span>}
      </div>
    );
  };

  const primarySpouse = spouses[0];
  const renderSpouseBadge = (compact = false) => {
    if (!primarySpouse) return null;
    const isDivorced = primarySpouse.unionType === 'DIVORCED';
    const icon = isDivorced ? '💔' : primarySpouse.unionType === 'MARRIAGE' ? '💍' : '💞';
    const dates = [
      primarySpouse.startDate ? formatTreeDate(primarySpouse.startDate, dateFormatStyle, language) : null,
      primarySpouse.endDate ? formatTreeDate(primarySpouse.endDate, dateFormatStyle, language) : null,
    ].filter(Boolean).join(' – ');
    const spouseLabel = isDivorced ? t('unionDivorced') : t('unionSpouse');

    if (compact) {
      return (
        <div
          style={{
            position: 'absolute',
            bottom: -8,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 15,
            background: isDivorced ? 'rgba(244, 63, 94, 0.95)' : 'rgba(99, 102, 241, 0.95)',
            color: '#ffffff',
            borderRadius: 10,
            padding: '2px 7px',
            fontSize: 10,
            fontWeight: 700,
            lineHeight: '1',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 3,
            boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
            whiteSpace: 'nowrap',
          }}
          title={`${spouseLabel}${dates ? ` (${dates})` : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            openDrawer('family', person.id);
          }}
        >
          <span>{icon}</span>
          {isDivorced && <span style={{ fontSize: 8, opacity: 0.9 }}>({t('unionDivorced').slice(0, 4)}.)</span>}
        </div>
      );
    }

    return (
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          background: isDivorced ? 'rgba(244, 63, 94, 0.15)' : 'rgba(99, 102, 241, 0.12)',
          border: isDivorced ? '1px solid rgba(244, 63, 94, 0.4)' : '1px solid rgba(99, 102, 241, 0.3)',
          color: isDivorced ? '#f43f5e' : 'var(--text-primary)',
          borderRadius: 6,
          padding: '2px 6px',
          fontSize: 10,
          fontWeight: 600,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          transition: 'all 0.15s ease',
        }}
        title={`${spouseLabel}${dates ? ` (${dates})` : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          openDrawer('family', person.id);
        }}
      >
        <span>{icon}</span>
        {isDivorced && <span style={{ fontSize: 9, opacity: 0.8 }}>({t('unionDivorced').slice(0, 4)}.)</span>}
      </div>
    );
  };

  const renderHandles = () => (
    <>
      <Handle
        type="target"
        position={Position.Top}
        style={{
          background: 'var(--primary-color, #6366f1)',
          width: 8,
          height: 8,
          border: '2px solid var(--card-bg-solid)',
          top: -4,
        }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          background: 'var(--accent-color, #a855f7)',
          width: 8,
          height: 8,
          border: '2px solid var(--card-bg-solid)',
          bottom: -4,
        }}
      />
      <Handle type="target" position={Position.Left} id="left" style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} id="right" style={{ opacity: 0 }} />
    </>
  );

  // ---------------------------------------------------------------------------
  // STYLE 2: CIRCLE (Only Image & Name)
  // ---------------------------------------------------------------------------
  if (nodeViewStyle === 'circle') {
    return (
      <div
        style={{
          width: 110,
          height: 120,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          position: 'relative',
          userSelect: 'none',
        }}
        onClick={(e) => {
          e.stopPropagation();
          selectPerson(person.id, true);
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          openDrawer('bio', person.id);
        }}
      >
        {renderHandles()}
        {renderCelebrationBadge(true)}

        {isRoot && (
          <div
            style={{
              position: 'absolute',
              top: -8,
              background: 'linear-gradient(135deg, #a855f7, #6366f1)',
              color: '#ffffff',
              fontSize: 8,
              fontWeight: 800,
              padding: '1px 6px',
              borderRadius: 8,
              zIndex: 10,
            }}
          >
            {t('hudMe').toUpperCase()}
          </div>
        )}

        {/* Circular Avatar */}
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: '50%',
            border: isDeceased ? '2px solid #000000' : cardBorder,
            boxShadow: isDeceased ? '0 0 10px rgba(0, 0, 0, 0.5)' : cardShadow,
            background: 'var(--card-bg-solid)',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            marginBottom: 6,
          }}
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={fullName}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <div
              style={{
                width: '100%',
                height: '100%',
                background: genderGradient,
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: 22,
              }}
            >
              {initials}
            </div>
          )}
        </div>

        {renderSpouseBadge(true)}

        {/* Person Name */}
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: 'var(--text-primary)',
            textAlign: 'center',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            width: 106,
            background: 'var(--card-bg-solid)',
            padding: '2px 6px',
            borderRadius: 6,
            border: '1px solid var(--border-color)',
            boxShadow: 'var(--shadow-card)',
          }}
          title={fullName}
        >
          {fullName}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // STYLE 3: SQUARE (Image, Name & Birth Date)
  // ---------------------------------------------------------------------------
  if (nodeViewStyle === 'square') {
    return (
      <div
        style={{
          width: 130,
          height: 140,
          backgroundColor: 'var(--card-bg-solid)',
          backdropFilter: 'blur(12px)',
          borderRadius: 12,
          border: isDeceased ? '2px solid #000000' : cardBorder,
          boxShadow: isDeceased ? '0 0 12px rgba(0, 0, 0, 0.45)' : cardShadow,
          padding: 8,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          position: 'relative',
          userSelect: 'none',
        }}
        onClick={(e) => {
          e.stopPropagation();
          selectPerson(person.id, true);
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          openDrawer('bio', person.id);
        }}
      >
        {renderHandles()}
        {renderCelebrationBadge(false)}

        {/* Mourning black stripe in the bottom-left corner */}
        {isDeceased && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: 12,
              overflow: 'hidden',
              pointerEvents: 'none',
              zIndex: 5,
            }}
          >
            <div
              style={{
                position: 'absolute',
                bottom: 6,
                left: -20,
                width: 54,
                height: 10,
                background: '#000000',
                transform: 'rotate(45deg)',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.6)',
              }}
              title={t('statusDeceased')}
            />
          </div>
        )}

        {isRoot && (
          <div
            style={{
              position: 'absolute',
              top: -8,
              left: 8,
              background: 'linear-gradient(135deg, #a855f7, #6366f1)',
              color: '#ffffff',
              fontSize: 8,
              fontWeight: 800,
              padding: '1px 6px',
              borderRadius: 6,
              zIndex: 10,
            }}
          >
            {t('hudMe').toUpperCase()}
          </div>
        )}

        {/* Square Avatar */}
        <div
          style={{
            width: 68,
            height: 68,
            borderRadius: 8,
            overflow: 'hidden',
            border: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--nav-tab-bg)',
            marginTop: 2,
          }}
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={fullName}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <div
              style={{
                width: '100%',
                height: '100%',
                background: genderGradient,
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: 20,
              }}
            >
              {initials}
            </div>
          )}
        </div>

        {/* Name and Birth date / Relationship to Me */}
        <div style={{ width: '100%', textAlign: 'center' }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: 'var(--text-primary)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
            title={fullName}
          >
            {fullName}
          </div>
          <div
            style={{
              fontSize: 10,
              color: isDeceased ? '#ef4444' : (person.is_living ? '#10b981' : 'var(--text-secondary)'),
              marginTop: 2,
              fontWeight: 500,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
            title={formattedBirth ? `Born: ${formattedBirth}` : `Relationship: ${relationshipText}`}
          >
            {formattedBirth ? `b. ${formattedBirth}` : relationshipText}
          </div>
          {renderSpouseBadge(true)}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // STYLE 1: DEFAULT (Rich Card Style)
  // ---------------------------------------------------------------------------
  return (
    <div
      style={{
        width: 250,
        height: 140,
        backgroundColor: 'var(--card-bg-solid)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderRadius: 14,
        border: cardBorder,
        boxShadow: cardShadow,
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        cursor: 'pointer',
        position: 'relative',
        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        userSelect: 'none',
      }}
      onClick={(e) => {
        e.stopPropagation();
        selectPerson(person.id, true);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        openDrawer('bio', person.id);
      }}
    >
      {renderHandles()}
      {renderCelebrationBadge(false)}

      {/* Root "ME" Anchor Badge */}
      {isRoot && (
        <div
          style={{
            position: 'absolute',
            top: -10,
            left: 12,
            background: 'linear-gradient(135deg, #a855f7, #6366f1)',
            color: '#ffffff',
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: '0.05em',
            padding: '2px 8px',
            borderRadius: 10,
            boxShadow: '0 2px 8px rgba(168, 85, 247, 0.4)',
            zIndex: 10,
          }}
        >
          ⭐ {language === 'ru' ? 'Я (КОРЕНЬ)' : 'ROOT (ME)'}
        </div>
      )}

      {/* Card Header: Avatar, Name, Maiden Name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={fullName}
            style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              objectFit: 'cover',
              border: '2px solid rgba(255, 255, 255, 0.15)',
              flexShrink: 0,
            }}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              background: genderGradient,
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: 16,
              flexShrink: 0,
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
            }}
          >
            {initials}
          </div>
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontWeight: 700,
              fontSize: 14,
              color: 'var(--text-primary)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
            title={fullName}
          >
            {fullName}
          </div>
          {person.maiden_name && (
            <div
              style={{
                fontSize: 11,
                color: 'var(--text-muted)',
                fontStyle: 'italic',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {language === 'ru' ? 'урожд.' : 'née'} {person.maiden_name}
            </div>
          )}
          <div
            style={{
              fontSize: 11,
              color: person.is_living ? '#10b981' : 'var(--text-secondary)',
              marginTop: 2,
              fontWeight: 500,
            }}
          >
            {lifespan}
          </div>
          {primarySpouse && (
            <div style={{ marginTop: 4 }}>
              {renderSpouseBadge(false)}
            </div>
          )}
        </div>
      </div>

      {/* Card Details: Birth Place & Attributes */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderTop: '1px solid var(--border-color)',
          paddingTop: 6,
          fontSize: 11,
          color: 'var(--text-secondary)',
        }}
      >
        <div
          style={{
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: 150,
          }}
          title={person.birth_place || ''}
        >
          {person.birth_place ? `📍 ${person.birth_place}` : `📍 ${language === 'ru' ? 'Место не указано' : 'Location unrecorded'}`}
        </div>

        {/* Action buttons: Quick-Add & Fold */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            type="button"
            style={{
              background: 'var(--nav-tab-bg)',
              border: '1px solid var(--border-color)',
              borderRadius: 6,
              color: 'var(--text-primary)',
              width: 22,
              height: 22,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 700,
            }}
            title={t('btnAddRelative')}
            onClick={(e) => {
              e.stopPropagation();
              openQuickAdd(person.id);
            }}
          >
            +
          </button>

          <button
            type="button"
            style={{
              background: isFolded ? 'rgba(168, 85, 247, 0.25)' : 'var(--nav-tab-bg)',
              border: isFolded ? '1px solid var(--accent-color, #a855f7)' : '1px solid var(--border-color)',
              borderRadius: 6,
              color: isFolded ? 'var(--accent-color, #a855f7)' : 'var(--text-primary)',
              width: 22,
              height: 22,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: 12,
            }}
            title={isFolded ? (language === 'ru' ? 'Развернуть ветвь' : 'Unfold branch') : (language === 'ru' ? 'Свернуть ветвь потомков' : 'Fold descendants branch')}
            onClick={(e) => {
              e.stopPropagation();
              toggleFoldBranch(person.id);
            }}
          >
            {isFolded ? '▼' : '▲'}
          </button>
        </div>
      </div>
    </div>
  );
});

PersonCardNode.displayName = 'PersonCardNode';
