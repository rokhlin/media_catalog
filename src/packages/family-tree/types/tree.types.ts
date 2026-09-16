import type { PersonEventRecord } from './event.types.js';

export type LivingPrivacyMode = 'MASK_LIVING' | 'SHOW_ALL' | 'PRIVATE';

export type Gender = 'MALE' | 'FEMALE' | 'NON_BINARY' | 'OTHER' | 'UNKNOWN';

export type UnionType = 'MARRIAGE' | 'CIVIL_UNION' | 'PARTNERSHIP' | 'DIVORCED' | 'SEPARATED';

export type FiliationType = 'BIOLOGICAL' | 'ADOPTED' | 'FOSTER' | 'STEP' | 'SURROGATE' | 'GESTATIONAL';

export type KinshipCategory =
  | 'SELF'
  | 'DIRECT_ANCESTOR'
  | 'DIRECT_DESCENDANT'
  | 'COLLATERAL'
  | 'SPOUSE_PARTNER'
  | 'AFFINITY'
  | 'DISTANT'
  | 'UNKNOWN';

export type NodeViewStyle = 'default' | 'circle' | 'square';

export type DateFormatStyle =
  | 'YYYY-MM-DD'
  | 'DD Month YYYY'
  | 'DD.MM.YYYY'
  | 'MM/DD/YYYY';

export interface LifeFactsFilterConfig {
  showOwnFacts: boolean;
  showParentsFacts: boolean;
  showSiblingsFacts: boolean;
  showChildrenFacts: boolean;
  showGrandparentsFacts: boolean;
  showSpousesFacts: boolean;
  includedFactTypes: string[];
}

export interface CelebrationBadgeConfig {
  enabled: boolean;
  daysThreshold: number;
  showBirthday: boolean;
  showAnniversary: boolean;
  showMemorial: boolean;
  badgeStyle: 'pill' | 'glow' | 'ribbon';
  badgeColor: string;
  customIcon?: string;
  contentDisplay?: 'icon_only' | 'icon_and_text';
}

export type GalleryFactsScope = 'OWN' | 'CLOSEST_FAMILY' | 'ALL';

export interface GalleryKinshipFactsConfig {
  enabled: boolean;
  scope: GalleryFactsScope;
  onlyCloseEvents: boolean;
  periodBeforeDays: number;
  closeEventTypes: string[];
}

export const DEFAULT_GALLERY_KINSHIP_FACTS_CONFIG: GalleryKinshipFactsConfig = {
  enabled: true,
  scope: 'CLOSEST_FAMILY',
  onlyCloseEvents: true,
  periodBeforeDays: 7,
  closeEventTypes: ['BIRTH', 'MARRIAGE', 'ANNIVERSARY', 'DEATH'],
};

export interface TreeRecord {
  id: string;
  name: string;
  description?: string | null;
  root_person_id?: string | null;
  living_privacy_mode: LivingPrivacyMode;
  created_at: string;
  updated_at: string;
}

export interface PersonRecord {
  id: string;
  tree_id: string;
  media_person_id?: string | null;
  first_name: string;
  middle_name?: string | null;
  last_name?: string | null;
  maiden_name?: string | null;
  gender: Gender;
  birth_date?: string | null;
  birth_place?: string | null;
  is_living: number; // 1 or 0
  death_date?: string | null;
  death_place?: string | null;
  bio?: string | null;
  avatar_url?: string | null;
  avatar_face_id?: string | null;
  custom_attributes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface UnionRecord {
  id: string;
  tree_id: string;
  union_type: UnionType;
  start_date?: string | null;
  start_place?: string | null;
  end_date?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChildRelationItem {
  person_id: string;
  filiation: FiliationType;
  birth_order: number;
}

export interface TreeGraphPerson extends PersonRecord {
  full_name: string;
  kinship_to_root?: string | null;
}

export interface TreeGraphUnion extends UnionRecord {
  partner_ids: string[];
  children: ChildRelationItem[];
}

export interface TreeGraphData {
  tree: TreeRecord;
  persons: TreeGraphPerson[];
  unions: TreeGraphUnion[];
  root_person_id?: string | null;
  facts?: PersonEventRecord[];
}

export interface TreeHistoryRecord {
  id: string;
  tree_id: string;
  action_type: string;
  description: string;
  details?: string | null;
  created_at: string;
}


export interface KinshipInfo {
  primaryTerm: string;
  category: KinshipCategory;
  degreeOfConsanguinity: number;
  generationalDistance: number;
  isDirectBlood: boolean;
  pathDescription?: string;
  details?: string;
}

export interface PersonFaceLinkRecord {
  id: string;
  tree_person_id: string;
  media_person_name: string;
  media_face_id: string;
  is_primary_avatar: number;
  created_at: string;
}

export interface ImmediateRelative {
  id: string;
  name: string;
  relation: string;
  avatarUrl?: string | null;
}

export interface PersonContextResponse {
  found: boolean;
  treePersonId?: string;
  fullName?: string;
  firstName?: string;
  middleName?: string | null;
  lastName?: string | null;
  maidenName?: string | null;
  gender?: Gender;
  birthYear?: string | null;
  birthDate?: string | null;
  birthPlace?: string | null;
  isLiving?: boolean;
  deathDate?: string | null;
  deathPlace?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  avatarFaceId?: string | null;
  kinshipToRoot?: KinshipInfo | null;
  immediateFamily?: {
    parents: ImmediateRelative[];
    spouses: ImmediateRelative[];
    children: ImmediateRelative[];
    siblings: ImmediateRelative[];
  };
  recentMilestones?: Array<{
    type: string;
    title: string;
    description?: string | null;
    date?: string | null;
    location?: string | null;
    pinnedMediaCount?: number;
  }>;
}

export interface AutocompletePersonItem {
  id: string;
  fullName: string;
  firstName: string;
  lastName?: string | null;
  maidenName?: string | null;
  avatarUrl?: string | null;
  kinshipTerm?: string | null;
  birthYear?: string | null;
  isLiving: boolean;
  mediaPersonId?: string | null;
}
