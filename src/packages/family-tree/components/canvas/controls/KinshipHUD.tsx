import { memo } from 'react';
import { useFamilyTreeStore } from '../../../state/useFamilyTreeStore.js';
import { useKinship } from '../../../hooks/useKinship.js';
import { localizeKinshipTerm, localizeKinshipCategory } from '../../../utils/kinshipUtils.js';
import { useLanguage } from '../../../../../i18n/LanguageContext.js';
import type { TreeGraphData } from '../../../types/tree.types.js';

interface KinshipHUDProps {
  graphData: TreeGraphData | null;
}

export const KinshipHUD = memo(({ graphData }: KinshipHUDProps) => {
  const { selectedPersonId, openDrawer } = useFamilyTreeStore();
  const { language, t } = useLanguage();
  const rootPersonId = graphData?.root_person_id;

  const { kinship } = useKinship(rootPersonId, selectedPersonId);

  if (!selectedPersonId || !graphData) return null;

  const selectedPerson = graphData.persons.find((p) => p.id === selectedPersonId);
  const rootPerson = graphData.persons.find((p) => p.id === rootPersonId);

  if (!selectedPerson) return null;

  const selectedName = selectedPerson.full_name || `${selectedPerson.first_name} ${selectedPerson.last_name || ''}`.trim();
  const rootName = rootPerson ? (rootPerson.full_name || rootPerson.first_name) : (language === 'ru' ? 'Корень' : 'Root');

  const rawTerm = kinship?.primaryTerm || (language === 'ru' ? 'Выбран(а)' : 'Selected');
  const term = localizeKinshipTerm(rawTerm, language);
  const rawCat = kinship?.category ? localizeKinshipCategory(kinship.category, language) : '';
  const category = rawCat ? ` • ${rawCat}` : '';
  const genDist = kinship?.generationalDistance ? ` • ${kinship.generationalDistance > 0 ? `+${kinship.generationalDistance}` : kinship.generationalDistance} ${t('hudGeneration')}` : '';
  const blood = kinship?.isDirectBlood ? ` • 🩸 ${t('hudDirectBlood')}` : '';

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 20,
        background: 'var(--card-bg-solid)',
        border: '1.5px solid var(--primary-color, #6366f1)',
        borderRadius: 30,
        padding: '8px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        boxShadow: 'var(--shadow-modal)',
        backdropFilter: 'blur(16px)',
        color: 'var(--text-primary)',
        fontSize: 13,
        fontWeight: 500,
        userSelect: 'none',
        animation: 'fadeIn 0.2s ease-out',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 16 }}>🧬</span>
        <span>
          <strong style={{ color: 'var(--primary-color, #6366f1)' }}>{selectedName}</strong>
          {language === 'ru' ? ' — ' : ' is '}
          <span
            style={{
              background: 'linear-gradient(135deg, #a855f7, #6366f1)',
              color: '#ffffff',
              padding: '2px 8px',
              borderRadius: 6,
              fontWeight: 700,
            }}
          >
            {term}
          </span>
          {` ${t('hudRelationshipTo')} ${rootName}`}
          <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
            {category}
            {genDist}
            {blood}
          </span>
        </span>
      </div>

      <button
        type="button"
        style={{
          background: 'var(--nav-tab-bg)',
          border: '1px solid var(--border-color)',
          color: 'var(--text-primary)',
          padding: '4px 12px',
          borderRadius: 20,
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'all 0.15s ease',
        }}
        onClick={() => openDrawer('timeline', selectedPerson.id)}
      >
        📖 {t('hudViewLifeStory')}
      </button>
    </div>
  );
});

KinshipHUD.displayName = 'KinshipHUD';
