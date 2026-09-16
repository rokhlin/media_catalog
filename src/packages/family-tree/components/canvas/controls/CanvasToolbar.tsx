import { memo } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useFamilyTreeStore } from '../../../state/useFamilyTreeStore.js';
import type { TreeGraphData } from '../../../types/tree.types.js';
import { FlagsManager } from '../../../../../services/featureFlagsContext.js';
import { useLanguage } from '../../../../../i18n/LanguageContext.js';

interface CanvasToolbarProps {
  graphData: TreeGraphData | null;
  onAddMember: () => void;
  onRecalculateLayout?: () => void;
}

export const CanvasToolbar = memo(({ graphData, onAddMember, onRecalculateLayout: _onRecalculateLayout }: CanvasToolbarProps) => {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const { layoutDirection, setLayoutDirection, selectPerson } = useFamilyTreeStore();

  const hideTopScreenZoomActions = (() => {
    try {
      if (FlagsManager.IsActive('hide_top_screen_zoom_actions', true)) return true;
      if (!FlagsManager.IsActive('tree_top_zoom_controls', true)) return true;
      return false;
    } catch {
      return true;
    }
  })();

  const handleFocusRoot = () => {
    if (!graphData?.root_person_id) return;
    const rootNodeId = `p_${graphData.root_person_id}`;
    selectPerson(graphData.root_person_id, false);
    fitView({ nodes: [{ id: rootNodeId }], duration: 800, maxZoom: 1.2 });
  };

  const toggleDirection = () => {
    setLayoutDirection(layoutDirection === 'TB' ? 'LR' : 'TB');
  };

  const buttonStyle: React.CSSProperties = {
    background: 'var(--card-bg-solid)',
    border: '1px solid var(--border-color)',
    color: 'var(--text-primary)',
    padding: '7px 12px',
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    backdropFilter: 'blur(8px)',
    transition: 'all 0.15s ease',
  };

  const { t } = useLanguage();

  return (
    <div
      style={{
        position: 'absolute',
        top: 16,
        right: 16,
        zIndex: 20,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: 'var(--card-bg)',
        padding: '6px 8px',
        borderRadius: 12,
        border: '1px solid var(--border-color)',
        backdropFilter: 'blur(12px)',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      {!hideTopScreenZoomActions && (
        <div className="family-tree-top-zoom-actions tree-top-zoom-actions" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button type="button" style={buttonStyle} onClick={() => zoomIn({ duration: 300 })} title={t('toolbarZoomIn')}>
            ➕ {t('toolbarZoomIn').split(' ')[0]}
          </button>

          <button type="button" style={buttonStyle} onClick={() => zoomOut({ duration: 300 })} title={t('toolbarZoomOut')}>
            ➖ {t('toolbarZoomOut').split(' ')[0]}
          </button>

          <button type="button" style={buttonStyle} onClick={() => fitView({ duration: 500, padding: 0.2 })} title={t('toolbarFitView')}>
            🔍 {t('toolbarFitView')}
          </button>
        </div>
      )}

      <button
        type="button"
        style={{
          ...buttonStyle,
          background: 'var(--nav-tab-active-bg)',
          border: '1px solid var(--accent-color, #a855f7)',
          color: 'var(--accent-color, #a855f7)',
        }}
        onClick={handleFocusRoot}
        title={t('toolbarCenterRoot')}
      >
        ⭐ {t('hudMe')}
      </button>

      <button type="button" style={buttonStyle} onClick={toggleDirection} title={layoutDirection === 'TB' ? t('toolbarLayoutHorizontal') : t('toolbarLayoutVertical')}>
        {layoutDirection === 'TB' ? '⬇️ ' + t('toolbarLayoutVertical') : '➡️ ' + t('toolbarLayoutHorizontal')}
      </button>

      <button
        type="button"
        style={{
          ...buttonStyle,
          background: 'var(--primary-gradient, linear-gradient(135deg, #6366f1, #4f46e5))',
          border: 'none',
          color: '#ffffff',
          boxShadow: '0 2px 10px rgba(99, 102, 241, 0.4)',
        }}
        onClick={onAddMember}
        title={t('toolbarAddMember')}
      >
        ➕ {t('toolbarAddMember')}
      </button>
    </div>
  );
});

CanvasToolbar.displayName = 'CanvasToolbar';
