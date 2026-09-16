import { useState, useMemo } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { useFamilyTreeData } from '../hooks/useFamilyTreeData.js';
import { useFamilyTreeStore } from '../state/useFamilyTreeStore.js';
import { TreeCanvas } from './canvas/TreeCanvas.js';
import { PersonDetailDrawer } from './modals/PersonDetailDrawer.js';
import { QuickAddRelativeModal } from './modals/QuickAddRelativeModal.js';
import { FaceLinkModal } from './modals/FaceLinkModal.js';
import { TreeSettingsTab } from './settings/TreeSettingsTab.js';
import { useLanguage } from '../../../i18n/LanguageContext.js';
import './family-tree.css';

export const FamilyTreeTab = () => {
  const {
    activeTreeId,
    activeSubTab,
    setActiveSubTab,
    selectedPersonId,
    isQuickAddModalOpen,
    quickAddTargetPersonId,
    quickAddInitialRelation,
    isFaceLinkModalOpen,
    faceLinkTargetPersonId,
    openQuickAdd,
    closeQuickAdd,
    openFaceLink,
    closeFaceLink,
  } = useFamilyTreeStore();

  const { t } = useLanguage();

  const {
    graphData,
    isLoading,
    error,
    refreshGraph,
    createPerson,
    updatePerson,
    deletePerson,
    quickAddRelative,
    createUnion,
    updateUnion,
    addChildToUnion,
    linkFace,
    unlinkFace,
    setRootPerson,
    recordTreeHistory,
    getTreeHistory,
  } = useFamilyTreeData(activeTreeId);

  const [isCreatePersonOpen, setIsCreatePersonOpen] = useState(false);
  const [newPersonName, setNewPersonName] = useState('');

  const selectedPerson = useMemo(() => {
    if (!graphData || !selectedPersonId) return null;
    return graphData.persons.find((p) => p.id === selectedPersonId) || null;
  }, [graphData, selectedPersonId]);

  const quickAddTargetPerson = useMemo(() => {
    if (!graphData || !quickAddTargetPersonId) return null;
    return graphData.persons.find((p) => p.id === quickAddTargetPersonId) || null;
  }, [graphData, quickAddTargetPersonId]);

  const faceLinkTargetPerson = useMemo(() => {
    if (!graphData || !faceLinkTargetPersonId) return null;
    return graphData.persons.find((p) => p.id === faceLinkTargetPersonId) || null;
  }, [graphData, faceLinkTargetPersonId]);

  const handleAddNewStandalonePerson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPersonName.trim()) return;

    const parts = newPersonName.trim().split(' ');
    const first_name = parts[0];
    const last_name = parts.slice(1).join(' ') || undefined;

    await createPerson({
      tree_id: activeTreeId,
      first_name,
      last_name,
      gender: 'UNKNOWN',
      is_living: true,
    });

    setNewPersonName('');
    setIsCreatePersonOpen(false);
  };

  return (
    <ReactFlowProvider>
      <div
        className="family-tree-view-wrapper"
        style={{
          width: '100%',
          height: '100%',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          background: 'transparent',
          gap: '12px',
        }}
      >
        {/* Subtab Header Bar / Tabs Container */}
        <div
          className="family-tree-tabs-container"
          id="family-tree-tabs-container"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              id="subtab-family-tree-canvas"
              onClick={() => setActiveSubTab('canvas')}
              style={{
                background: activeSubTab === 'canvas' ? 'var(--primary-gradient, linear-gradient(135deg, #6366f1, #4f46e5))' : 'var(--nav-tab-bg)',
                color: activeSubTab === 'canvas' ? '#ffffff' : 'var(--text-primary)',
                border: activeSubTab === 'canvas' ? 'none' : '1px solid var(--border-color)',
                borderRadius: 8,
                padding: '7px 16px',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: activeSubTab === 'canvas' ? '0 2px 8px rgba(99, 102, 241, 0.35)' : undefined,
                transition: 'all 0.15s ease',
              }}
            >
              <span>🌳</span>
              <span>{t('tabInteractiveTree')}</span>
            </button>

            <button
              type="button"
              id="subtab-family-tree-settings"
              onClick={() => setActiveSubTab('settings')}
              style={{
                background: activeSubTab === 'settings' ? 'var(--primary-gradient, linear-gradient(135deg, #6366f1, #4f46e5))' : 'var(--nav-tab-bg)',
                color: activeSubTab === 'settings' ? '#ffffff' : 'var(--text-primary)',
                border: activeSubTab === 'settings' ? 'none' : '1px solid var(--border-color)',
                borderRadius: 8,
                padding: '7px 16px',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: activeSubTab === 'settings' ? '0 2px 8px rgba(99, 102, 241, 0.35)' : undefined,
                transition: 'all 0.15s ease',
              }}
            >
              <span>⚙️</span>
              <span>{t('tabTreeSettings')}</span>
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: 'var(--text-secondary)' }}>
            <span>
              {graphData?.persons?.length || 0} {t('countPersonsSuffix')} • {graphData?.unions?.length || 0} {t('countUnionsSuffix')}
            </span>
          </div>
        </div>

        {/* Subtab Content Viewport */}
        <div
          className="family-tree-content-viewport"
          id="family-tree-content-viewport"
          style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}
        >
          <div
            id="canvas-subtab-container"
            style={{
              width: '100%',
              height: '100%',
              position: 'absolute',
              top: 0,
              left: 0,
              zIndex: activeSubTab === 'canvas' ? 2 : 1,
              pointerEvents: activeSubTab === 'canvas' ? 'auto' : 'none',
              opacity: 1,
            }}
          >
            <TreeCanvas
              graphData={graphData}
              isLoading={isLoading}
              onAddMember={() => {
                if (graphData?.persons && graphData.persons.length > 0) {
                  const targetId = selectedPersonId || graphData.root_person_id || graphData.persons[0].id;
                  openQuickAdd(targetId, 'CHILD');
                } else {
                  setIsCreatePersonOpen(true);
                }
              }}
            />
          </div>

          <div
            id="settings-subtab-container"
            style={{
              width: '100%',
              height: '100%',
              position: 'absolute',
              top: 0,
              left: 0,
              zIndex: activeSubTab === 'settings' ? 3 : 0,
              display: activeSubTab === 'settings' ? 'block' : 'none',
              backgroundColor: 'var(--bg-color)',
              backgroundImage:
                'radial-gradient(circle at 15% 15%, var(--bg-radial-1, rgba(99, 102, 241, 0.12)) 0%, transparent 45%), radial-gradient(circle at 85% 85%, var(--bg-radial-2, rgba(168, 85, 247, 0.12)) 0%, transparent 45%)',
              color: 'var(--text-primary)',
              overflowY: 'auto',
            }}
          >
            <TreeSettingsTab
              graphData={graphData}
              refreshGraph={refreshGraph}
              createPerson={createPerson}
              updatePerson={updatePerson}
              createUnion={createUnion}
              updateUnion={updateUnion}
              addChildToUnion={addChildToUnion}
              recordTreeHistory={recordTreeHistory}
              getTreeHistory={getTreeHistory}
              onBackToCanvas={() => setActiveSubTab('canvas')}
            />
          </div>

          {/* Error Banner */}
          {error && !isLoading && (
            <div
              style={{
                position: 'absolute',
                top: 70,
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 40,
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                color: 'var(--error-color, #ef4444)',
                padding: '10px 18px',
                borderRadius: 10,
                fontSize: 13,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                backdropFilter: 'blur(10px)',
                boxShadow: 'var(--shadow-modal)',
              }}
            >
              <span>⚠️ {error}</span>
              <button
                type="button"
                id="btn-family-tree-retry"
                onClick={() => refreshGraph()}
                style={{
                  background: 'rgba(239, 68, 68, 0.3)',
                  border: '1px solid rgba(239, 68, 68, 0.5)',
                  color: '#ffffff',
                  borderRadius: 6,
                  padding: '4px 10px',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                {t('retry') || 'Retry'}
              </button>
            </div>
          )}

          {/* Sliding Detail Drawer */}
          <PersonDetailDrawer
            person={selectedPerson}
            graphData={graphData}
            onUpdatePerson={updatePerson}
            onDeletePerson={deletePerson}
            onSetRootPerson={setRootPerson}
            onOpenQuickAdd={openQuickAdd}
            onOpenFaceLink={openFaceLink}
          />
        </div>

        {/* Quick Add Relative Modal */}
        <QuickAddRelativeModal
          isOpen={isQuickAddModalOpen}
          onClose={closeQuickAdd}
          targetPersonId={quickAddTargetPersonId}
          targetPersonName={quickAddTargetPerson?.full_name || quickAddTargetPerson?.first_name}
          initialRelationship={quickAddInitialRelation}
          graphData={graphData}
          onAddRelative={quickAddRelative}
        />

        {/* Face Link Modal */}
        <FaceLinkModal
          isOpen={isFaceLinkModalOpen}
          onClose={closeFaceLink}
          person={faceLinkTargetPerson}
          onLinkFace={linkFace}
          onUnlinkFace={unlinkFace}
        />

        {/* New Standalone Member Modal (for empty tree) */}
        {isCreatePersonOpen && (
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
            onClick={() => setIsCreatePersonOpen(false)}
          >
            <div
              style={{
                background: 'var(--modal-bg)',
                border: '1px solid var(--border-color)',
                borderRadius: 16,
                width: '100%',
                maxWidth: 440,
                padding: 24,
                boxShadow: 'var(--shadow-modal)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>
                {t('emptyTreeAddButton')}
              </div>
              <form onSubmit={handleAddNewStandalonePerson}>
                <input
                  type="text"
                  required
                  autoFocus
                  value={newPersonName}
                  onChange={(e) => setNewPersonName(e.target.value)}
                  placeholder={`${t('labelFirstName')} ${t('labelLastName')}`}
                  style={{
                    width: '100%',
                    background: 'var(--input-bg)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 8,
                    padding: '10px 14px',
                    color: 'var(--text-primary)',
                    fontSize: 14,
                    outline: 'none',
                    boxSizing: 'border-box',
                    marginBottom: 16,
                  }}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                  <button
                    type="button"
                    id="btn-family-tree-create-cancel"
                    style={{
                      background: 'var(--nav-tab-bg)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 8,
                      padding: '8px 16px',
                      fontSize: 13,
                      cursor: 'pointer',
                    }}
                    onClick={() => setIsCreatePersonOpen(false)}
                  >
                    {t('btnCancel')}
                  </button>
                  <button
                    type="submit"
                    id="btn-family-tree-create-submit"
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
                  >
                    {t('emptyTreeAddButton')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </ReactFlowProvider>
  );
};
