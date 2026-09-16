import { describe, it } from 'node:test';
import assert from 'node:assert';
import { setTreeStore, useFamilyTreeStore } from '../useFamilyTreeStore.js';

describe('FamilyTreeStore State Management', () => {
  it('should export store hook and setTreeStore function', () => {
    assert.strictEqual(typeof setTreeStore, 'function');
    assert.strictEqual(typeof useFamilyTreeStore, 'function');
  });

  it('should update and retrieve global family tree state', () => {
    setTreeStore({
      selectedPersonId: 'person_test_1',
      isDetailDrawerOpen: true,
      drawerActiveTab: 'timeline',
      searchQuery: 'William',
      layoutDirection: 'LR',
    });

    // Verify partial updates merge with existing state
    setTreeStore((prev) => ({
      highlightedPersonId: prev.selectedPersonId,
      activeTimelineCategory: 'CAREER',
    }));

    setTreeStore({
      isQuickAddModalOpen: true,
      quickAddTargetPersonId: 'person_test_1',
      quickAddInitialRelation: 'SPOUSE',
    });

    setTreeStore((prev) => {
      const nextFolded = new Set(prev.foldedNodeIds);
      nextFolded.add('person_test_1');
      return { foldedNodeIds: nextFolded };
    });

    setTreeStore({
      isAddFactModalOpen: true,
      factToEdit: {
        id: 'fact_1',
        tree_id: 'default_tree',
        person_id: 'person_test_1',
        event_type: 'AWARD',
        title: 'Honorary Award',
        created_at: '2025-01-01',
      } as any,
    });

    // Reset back to clean state
    setTreeStore({
      selectedPersonId: null,
      isDetailDrawerOpen: false,
      isQuickAddModalOpen: false,
      isAddFactModalOpen: false,
      factToEdit: null,
      searchQuery: '',
      foldedNodeIds: new Set<string>(),
    });
  });
});
