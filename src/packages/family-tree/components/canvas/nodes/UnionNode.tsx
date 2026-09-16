import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { TreeGraphUnion } from '../../../types/tree.types.js';
import { useFamilyTreeStore } from '../../../state/useFamilyTreeStore.js';
import { useLanguage } from '../../../../../i18n/LanguageContext.js';

export interface UnionNodeData {
  union: TreeGraphUnion;
  isFolded?: boolean;
}

export const UnionNode = memo(({ data }: NodeProps) => {
  const { union } = data as unknown as UnionNodeData;
  const { foldedDivorcedUnionIds, toggleFoldDivorcedUnion } = useFamilyTreeStore();
  const { language, t } = useLanguage();

  const isDivorced = union.union_type === 'DIVORCED';
  const isFolded = foldedDivorcedUnionIds.has(union.id);
  const icon = isDivorced ? '💔' : union.union_type === 'MARRIAGE' ? '💍' : '💞';

  const typeLabel = isDivorced
    ? t('unionTypeDivorced')
    : union.union_type === 'MARRIAGE'
      ? t('unionTypeMarriage')
      : t('unionTypeUnmarried');

  const tooltipText = [
    typeLabel,
    union.start_date ? `${language === 'ru' ? 'С' : 'Since'}: ${union.start_date}` : null,
    union.start_place ? `${language === 'ru' ? 'в' : 'at'} ${union.start_place}` : null,
    union.end_date ? `${language === 'ru' ? 'Развод' : 'Divorced/Ended'}: ${union.end_date}` : null,
    isDivorced ? (isFolded ? (language === 'ru' ? 'Ветвь бывшего супруга свёрнута' : 'Divorced spouse branch folded') : (language === 'ru' ? 'Ветвь бывшего супруга развёрнута' : 'Divorced spouse branch expanded')) : null,
  ]
    .filter(Boolean)
    .join(' • ');

  const handleToggleFold = (e: React.MouseEvent) => {
    if (isDivorced) {
      e.stopPropagation();
      toggleFoldDivorcedUnion(union.id);
    }
  };

  return (
    <div
      style={{
        width: 36,
        height: 36,
        borderRadius: '50%',
        backgroundColor: 'var(--card-bg-solid)',
        border: isDivorced ? '2px dashed #454045ff' : '2px solid var(--border-color-hover)',
        boxShadow: isDivorced ? '0 0 12px rgba(69, 65, 69, 0.35)' : 'var(--shadow-card)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 15,
        cursor: isDivorced ? 'pointer' : 'default',
        position: 'relative',
        transition: 'transform 0.15s ease',
      }}
      title={tooltipText || (language === 'ru' ? 'Семейный союз' : 'Partnership Union')}
      onClick={handleToggleFold}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{
          background: isDivorced ? '#454045ff' : 'var(--primary-color, #6366f1)',
          width: 6,
          height: 6,
          border: '1px solid var(--card-bg-solid)',
          top: -3,
        }}
      />

      {isDivorced ? <span style={{ filter: 'grayscale(100%)', opacity: isDivorced ? 1 : 0 }}>{icon}</span> : <span>{icon}</span>}

      {/* Collapse/Expand badge for Divorced Union */}
      {isDivorced && (
        <button
          type="button"
          onClick={handleToggleFold}
          style={{
            position: 'absolute',
            bottom: -8,
            right: -8,
            width: 16,
            height: 16,
            borderRadius: '50%',
            background: isFolded ? '#454045ff' : 'var(--card-bg-solid)',
            color: isFolded ? '#ffffff' : '#454045ff',
            border: '1px solid #454045ff',
            fontSize: 8,
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            padding: 0,
            boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
          }}
          title={isFolded ? (language === 'ru' ? 'Развернуть ветвь бывшего супруга' : 'Expand divorced spouse subtree') : (language === 'ru' ? 'Свернуть ветвь бывшего супруга' : 'Collapse divorced spouse subtree')}
        >
          {isFolded ? ' + ' : ' − '}
        </button>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          background: 'var(--accent-color, #a855f7)',
          width: 6,
          height: 6,
          border: '1px solid var(--card-bg-solid)',
          bottom: -3,
        }}
      />
    </div>
  );
});

UnionNode.displayName = 'UnionNode';
