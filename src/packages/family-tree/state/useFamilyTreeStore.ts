import { useState, useEffect, useCallback } from 'react';
import type { PersonEventRecord } from '../types/event.types.js';
import type {
  NodeViewStyle,
  DateFormatStyle,
  LifeFactsFilterConfig,
  CelebrationBadgeConfig,
  GalleryKinshipFactsConfig,
} from '../types/tree.types.js';
import { DEFAULT_GALLERY_KINSHIP_FACTS_CONFIG } from '../types/tree.types.js';

export interface FamilyTreeState {
  selectedPersonId: string | null;
  selectedUnionId: string | null;
  hoveredPersonId: string | null;
  isDetailDrawerOpen: boolean;
  drawerActiveTab: 'bio' | 'family' | 'timeline';
  isQuickAddModalOpen: boolean;
  quickAddTargetPersonId: string | null;
  quickAddInitialRelation: 'PARENT' | 'CHILD' | 'SPOUSE' | 'SIBLING';
  isFaceLinkModalOpen: boolean;
  faceLinkTargetPersonId: string | null;
  isAddFactModalOpen: boolean;
  factToEdit: PersonEventRecord | null;
  isGalleryPickerOpen: boolean;
  layoutDirection: 'TB' | 'LR';
  foldedNodeIds: Set<string>;
  foldedDivorcedUnionIds: Set<string>;
  searchQuery: string;
  highlightedPersonId: string | null;
  activeTimelineCategory: string;
  activeTreeId: string;
  activeSubTab: 'canvas' | 'settings';
  nodeViewStyle: NodeViewStyle;
  dateFormatStyle: DateFormatStyle;
  lifeFactsConfig: LifeFactsFilterConfig;
  celebrationConfig: CelebrationBadgeConfig;
  galleryKinshipFactsConfig: GalleryKinshipFactsConfig;
  treeDataVersion: number;
}

const DEFAULT_LIFE_FACTS_CONFIG: LifeFactsFilterConfig = {
  showOwnFacts: true,
  showParentsFacts: true,
  showSiblingsFacts: true,
  showChildrenFacts: true,
  showGrandparentsFacts: true,
  showSpousesFacts: true,
  includedFactTypes: [
    'BIRTH', 'DEATH', 'MARRIAGE', 'DIVORCE', 'CHILD_BORN',
    'GRADUATION', 'RELOCATION', 'TRAVEL', 'CAREER', 'MILITARY', 'RELATIONSHIP', 'CUSTOM'
  ],
};

const DEFAULT_CELEBRATION_CONFIG: CelebrationBadgeConfig = {
  enabled: true,
  daysThreshold: 7,
  showBirthday: true,
  showAnniversary: true,
  showMemorial: true,
  badgeStyle: 'pill',
  badgeColor: '#ec4899',
  customIcon: '🎂',
  contentDisplay: 'icon_and_text',
};

function loadStoredJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return { ...fallback, ...JSON.parse(raw) };
  } catch {
    return fallback;
  }
}

let globalState: FamilyTreeState = {
  selectedPersonId: null,
  selectedUnionId: null,
  hoveredPersonId: null,
  isDetailDrawerOpen: false,
  drawerActiveTab: 'bio',
  isQuickAddModalOpen: false,
  quickAddTargetPersonId: null,
  quickAddInitialRelation: 'CHILD',
  isFaceLinkModalOpen: false,
  faceLinkTargetPersonId: null,
  isAddFactModalOpen: false,
  factToEdit: null,
  isGalleryPickerOpen: false,
  layoutDirection: 'TB',
  foldedNodeIds: new Set<string>(),
  foldedDivorcedUnionIds: new Set<string>(),
  searchQuery: '',
  highlightedPersonId: null,
  activeTimelineCategory: 'ALL',
  activeTreeId: 'default_tree',
  activeSubTab: 'canvas',
  nodeViewStyle: (typeof window !== 'undefined' && localStorage.getItem('ft_nodeViewStyle') as NodeViewStyle) || 'default',
  dateFormatStyle: (typeof window !== 'undefined' && localStorage.getItem('ft_dateFormatStyle') as DateFormatStyle) || 'YYYY-MM-DD',
  lifeFactsConfig: loadStoredJson('ft_lifeFactsConfig', DEFAULT_LIFE_FACTS_CONFIG),
  celebrationConfig: loadStoredJson('ft_celebrationConfig', DEFAULT_CELEBRATION_CONFIG),
  galleryKinshipFactsConfig: loadStoredJson('ft_galleryKinshipFactsConfig', DEFAULT_GALLERY_KINSHIP_FACTS_CONFIG),
  treeDataVersion: 1,
};

const listeners = new Set<(state: FamilyTreeState) => void>();

function emit() {
  listeners.forEach((listener) => listener(globalState));
}

export function setTreeStore(partial: Partial<FamilyTreeState> | ((prev: FamilyTreeState) => Partial<FamilyTreeState>)) {
  const next = typeof partial === 'function' ? partial(globalState) : partial;
  globalState = { ...globalState, ...next };
  emit();
}

/**
 * Notifies all subscribers and external components (like MediaViewerModal and MediaGallery)
 * that family tree data (members, unions, facts, face links, or kinship settings) has updated.
 */
export function notifyFamilyTreeUpdated() {
  setTreeStore((prev) => ({ treeDataVersion: (prev.treeDataVersion || 1) + 1 }));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('family_tree_updated', { detail: { timestamp: Date.now() } }));
  }
}

export function useFamilyTreeStore() {
  const [state, setState] = useState<FamilyTreeState>(globalState);

  useEffect(() => {
    listeners.add(setState);
    return () => {
      listeners.delete(setState);
    };
  }, []);

  const selectPerson = useCallback((personId: string | null, openDrawer: boolean = false) => {
    setTreeStore((prev) => ({
      selectedPersonId: personId,
      selectedUnionId: null,
      isDetailDrawerOpen: openDrawer ? true : prev.isDetailDrawerOpen,
    }));
  }, []);

  const openDrawer = useCallback((tab: 'bio' | 'family' | 'timeline' = 'bio', personId?: string) => {
    setTreeStore((prev) => ({
      isDetailDrawerOpen: true,
      drawerActiveTab: tab,
      selectedPersonId: personId || prev.selectedPersonId,
    }));
  }, []);

  const closeDrawer = useCallback(() => {
    setTreeStore({ isDetailDrawerOpen: false });
  }, []);

  const openQuickAdd = useCallback((targetPersonId: string, relation: 'PARENT' | 'CHILD' | 'SPOUSE' | 'SIBLING' = 'CHILD') => {
    setTreeStore({
      isQuickAddModalOpen: true,
      quickAddTargetPersonId: targetPersonId,
      quickAddInitialRelation: relation,
    });
  }, []);

  const closeQuickAdd = useCallback(() => {
    setTreeStore({ isQuickAddModalOpen: false, quickAddTargetPersonId: null });
  }, []);

  const openFaceLink = useCallback((targetPersonId: string) => {
    setTreeStore({
      isFaceLinkModalOpen: true,
      faceLinkTargetPersonId: targetPersonId,
    });
  }, []);

  const closeFaceLink = useCallback(() => {
    setTreeStore({ isFaceLinkModalOpen: false, faceLinkTargetPersonId: null });
  }, []);

  const openAddFact = useCallback((fact?: PersonEventRecord | null) => {
    setTreeStore({
      isAddFactModalOpen: true,
      factToEdit: fact || null,
    });
  }, []);

  const closeAddFact = useCallback(() => {
    setTreeStore({ isAddFactModalOpen: false, factToEdit: null });
  }, []);

  const toggleFoldBranch = useCallback((personId: string) => {
    setTreeStore((prev) => {
      const nextSet = new Set(prev.foldedNodeIds);
      if (nextSet.has(personId)) {
        nextSet.delete(personId);
      } else {
        nextSet.add(personId);
      }
      return { foldedNodeIds: nextSet };
    });
  }, []);

  const setLayoutDirection = useCallback((dir: 'TB' | 'LR') => {
    setTreeStore({ layoutDirection: dir });
  }, []);

  const setSearchQuery = useCallback((query: string) => {
    setTreeStore({ searchQuery: query });
  }, []);

  const setHighlightedPersonId = useCallback((id: string | null) => {
    setTreeStore({ highlightedPersonId: id });
  }, []);

  const setActiveTimelineCategory = useCallback((category: string) => {
    setTreeStore({ activeTimelineCategory: category });
  }, []);

  const toggleFoldDivorcedUnion = useCallback((unionId: string) => {
    setTreeStore((prev) => {
      const nextSet = new Set(prev.foldedDivorcedUnionIds);
      if (nextSet.has(unionId)) {
        nextSet.delete(unionId);
      } else {
        nextSet.add(unionId);
      }
      return { foldedDivorcedUnionIds: nextSet };
    });
  }, []);

  const setActiveTreeId = useCallback((id: string) => {
    setTreeStore({ activeTreeId: id });
  }, []);

  const setActiveSubTab = useCallback((tab: 'canvas' | 'settings') => {
    setTreeStore({ activeSubTab: tab });
  }, []);

  const setNodeViewStyle = useCallback((style: NodeViewStyle) => {
    try {
      localStorage.setItem('ft_nodeViewStyle', style);
    } catch {
      // ignore
    }
    setTreeStore({ nodeViewStyle: style });
  }, []);

  const setDateFormatStyle = useCallback((style: DateFormatStyle) => {
    try {
      localStorage.setItem('ft_dateFormatStyle', style);
    } catch {
      // ignore
    }
    setTreeStore({ dateFormatStyle: style });
  }, []);

  const setLifeFactsConfig = useCallback((config: Partial<LifeFactsFilterConfig> | ((prev: LifeFactsFilterConfig) => LifeFactsFilterConfig)) => {
    setTreeStore((prev) => {
      const nextConfig = typeof config === 'function' ? config(prev.lifeFactsConfig) : { ...prev.lifeFactsConfig, ...config };
      try {
        localStorage.setItem('ft_lifeFactsConfig', JSON.stringify(nextConfig));
      } catch {
        // ignore
      }
      return { lifeFactsConfig: nextConfig };
    });
  }, []);

  const setCelebrationConfig = useCallback((config: Partial<CelebrationBadgeConfig> | ((prev: CelebrationBadgeConfig) => CelebrationBadgeConfig)) => {
    setTreeStore((prev) => {
      const nextConfig = typeof config === 'function' ? config(prev.celebrationConfig) : { ...prev.celebrationConfig, ...config };
      try {
        localStorage.setItem('ft_celebrationConfig', JSON.stringify(nextConfig));
      } catch {
        // ignore
      }
      return { celebrationConfig: nextConfig };
    });
  }, []);

  const setGalleryKinshipFactsConfig = useCallback((config: Partial<GalleryKinshipFactsConfig> | ((prev: GalleryKinshipFactsConfig) => GalleryKinshipFactsConfig)) => {
    setTreeStore((prev) => {
      const nextConfig = typeof config === 'function' ? config(prev.galleryKinshipFactsConfig) : { ...prev.galleryKinshipFactsConfig, ...config };
      try {
        localStorage.setItem('ft_galleryKinshipFactsConfig', JSON.stringify(nextConfig));
      } catch {
        // ignore
      }
      return {
        galleryKinshipFactsConfig: nextConfig,
        treeDataVersion: (prev.treeDataVersion || 1) + 1,
      };
    });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('family_tree_updated', { detail: { timestamp: Date.now() } }));
    }
  }, []);

  return {
    ...state,
    selectPerson,
    openDrawer,
    closeDrawer,
    openQuickAdd,
    closeQuickAdd,
    openFaceLink,
    closeFaceLink,
    openAddFact,
    closeAddFact,
    toggleFoldBranch,
    toggleFoldDivorcedUnion,
    setLayoutDirection,
    setSearchQuery,
    setHighlightedPersonId,
    setActiveTimelineCategory,
    setActiveTreeId,
    setActiveSubTab,
    setNodeViewStyle,
    setDateFormatStyle,
    setLifeFactsConfig,
    setCelebrationConfig,
    setGalleryKinshipFactsConfig,
    notifyFamilyTreeUpdated,
    setTreeStore,
  };
}
