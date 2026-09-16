import React from 'react';
import type { ModulesStatus } from '../../models';
import { useLanguage } from '../../i18n/LanguageContext';

export interface ModuleStatusMediaLike {
  is_video?: boolean;
  modules_status?: ModulesStatus;
  status?: string;
  transcription?: string;
  face_count?: number;
  face_names?: string[];
  phash?: string;
  description?: string;
  summary?: string;
  tags?: string[];
}

export interface ModuleStatusBadgesProps {
  media: ModuleStatusMediaLike;
  variant?: 'dots' | 'chips';
  className?: string;
}

export const ModuleStatusBadges: React.FC<ModuleStatusBadgesProps> = ({
  media,
  variant = 'dots',
  className = '',
}) => {
  const { language } = useLanguage();
  const isRu = language === 'ru';

  const isVideo = Boolean(media.is_video);

  // Compute status for each module with smart fallback to existing fields
  const transcribeDone = isVideo
    ? media.modules_status?.transcribe !== undefined
      ? Boolean(media.modules_status.transcribe)
      : Boolean(media.transcription && media.transcription.trim())
    : null;

  const facesDone =
    media.modules_status?.faces !== undefined
      ? Boolean(media.modules_status.faces)
      : Boolean((media.face_count && media.face_count > 0) || (media.face_names && media.face_names.length > 0));

  const duplicatesDone =
    media.modules_status?.duplicates !== undefined
      ? Boolean(media.modules_status.duplicates)
      : Boolean(media.phash);

  const visionDone =
    media.modules_status?.vision !== undefined
      ? Boolean(media.modules_status.vision)
      : Boolean(media.description || media.summary || (media.tags && media.tags.length > 0));

  const modules = [
    ...(isVideo
      ? [
          {
            key: 'transcribe',
            icon: '🎙️',
            label: isRu ? 'Транскрипция' : 'Transcription',
            done: transcribeDone,
            activeColor: '#10b981',
            glowColor: 'rgba(16, 185, 129, 0.65)',
            bgColor: 'rgba(16, 185, 129, 0.15)',
            borderColor: 'rgba(16, 185, 129, 0.35)',
          },
        ]
      : []),
    {
      key: 'faces',
      icon: '👤',
      label: isRu ? 'Лица' : 'Faces',
      done: facesDone,
      activeColor: '#a855f7',
      glowColor: 'rgba(168, 85, 247, 0.65)',
      bgColor: 'rgba(168, 85, 247, 0.15)',
      borderColor: 'rgba(168, 85, 247, 0.35)',
    },
    {
      key: 'duplicates',
      icon: '🗂️',
      label: isRu ? 'Дубликаты' : 'Duplicates',
      done: duplicatesDone,
      activeColor: '#3b82f6',
      glowColor: 'rgba(59, 130, 246, 0.65)',
      bgColor: 'rgba(59, 130, 246, 0.15)',
      borderColor: 'rgba(59, 130, 246, 0.35)',
    },
    {
      key: 'vision',
      icon: '🖼️',
      label: isRu ? 'Vision AI' : 'Vision AI',
      done: visionDone,
      activeColor: '#06b6d4',
      glowColor: 'rgba(6, 182, 212, 0.65)',
      bgColor: 'rgba(6, 182, 212, 0.15)',
      borderColor: 'rgba(6, 182, 212, 0.35)',
    },
  ];

  if (variant === 'chips') {
    return (
      <div
        className={`module-status-chips-container ${className}`}
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '6px',
          alignItems: 'center',
        }}
      >
        {modules.map((m) => (
          <span
            key={m.key}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '2px 8px',
              borderRadius: '9999px',
              fontSize: '0.74rem',
              fontWeight: 500,
              background: m.done ? m.bgColor : 'rgba(148, 163, 184, 0.08)',
              color: m.done ? '#ffffff' : 'var(--text-secondary, #94a3b8)',
              border: `1px solid ${m.done ? m.borderColor : 'rgba(148, 163, 184, 0.18)'}`,
              boxShadow: m.done ? `0 0 8px ${m.glowColor}` : 'none',
              transition: 'all 0.2s ease',
            }}
            title={`${m.icon} ${m.label}: ${m.done ? (isRu ? 'Выполнено' : 'Completed') : (isRu ? 'Не выполнялось' : 'Not run')}`}
          >
            <span style={{ fontSize: '0.8rem' }}>{m.icon}</span>
            <span>{m.label}</span>
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: m.done ? m.activeColor : 'rgba(148, 163, 184, 0.4)',
                boxShadow: m.done ? `0 0 5px ${m.activeColor}` : 'none',
              }}
            />
          </span>
        ))}
      </div>
    );
  }

  // Default: 'dots' variant for gallery cards and list view
  const overallTooltip = modules
    .map((m) => `${m.icon} ${m.label}: ${m.done ? (isRu ? 'Готово' : 'Done') : (isRu ? 'Ожидает' : 'Not run')}`)
    .join(' • ');

  return (
    <div
      className={`module-status-dots-container ${className}`}
      title={overallTooltip}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '2px 5px',
        borderRadius: '9999px',
        background: 'rgba(15, 23, 42, 0.72)',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
      }}
    >
      {modules.map((m) => (
        <span
          key={m.key}
          style={{
            display: 'inline-block',
            width: '7px',
            height: '7px',
            borderRadius: '50%',
            background: m.done ? m.activeColor : 'rgba(148, 163, 184, 0.3)',
            boxShadow: m.done ? `0 0 6px ${m.glowColor}` : 'none',
            border: m.done ? 'none' : '1px solid rgba(255, 255, 255, 0.1)',
            transition: 'all 0.25s ease',
          }}
          title={`${m.icon} ${m.label}: ${m.done ? (isRu ? 'Готово' : 'Done') : (isRu ? 'Не выполнено' : 'Not run')}`}
        />
      ))}
    </div>
  );
};

export default ModuleStatusBadges;
