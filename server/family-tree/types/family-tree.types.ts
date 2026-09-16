export type LivingPrivacyMode = 'MASK_LIVING' | 'SHOW_ALL' | 'PRIVATE';

export type Gender = 'MALE' | 'FEMALE' | 'NON_BINARY' | 'OTHER' | 'UNKNOWN';

export type UnionType = 'MARRIAGE' | 'CIVIL_UNION' | 'PARTNERSHIP' | 'DIVORCED' | 'SEPARATED';

export type FiliationType = 'BIOLOGICAL' | 'ADOPTED' | 'FOSTER' | 'STEP' | 'SURROGATE' | 'GESTATIONAL';

export type EventType =
  | 'BIRTH'
  | 'DEATH'
  | 'MARRIAGE'
  | 'DIVORCE'
  | 'CHILD_BORN'
  | 'GRADUATION'
  | 'RELOCATION'
  | 'TRAVEL'
  | 'CAREER'
  | 'MILITARY'
  | 'RELATIONSHIP'
  | 'CUSTOM';

export type KinshipCategory =
  | 'SELF'
  | 'DIRECT_ANCESTOR'
  | 'DIRECT_DESCENDANT'
  | 'COLLATERAL'
  | 'SPOUSE_PARTNER'
  | 'AFFINITY'
  | 'DISTANT'
  | 'UNKNOWN';

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
  custom_attributes?: string | null; // JSON string
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

export interface UnionPartnerRecord {
  id: string;
  union_id: string;
  person_id: string;
  display_order: number;
}

export interface ChildRelationRecord {
  id: string;
  union_id: string;
  person_id: string;
  filiation: FiliationType;
  birth_order: number;
}

export interface PersonFaceLinkRecord {
  id: string;
  tree_person_id: string;
  media_person_name: string;
  media_face_id: string;
  is_primary_avatar: number; // 1 or 0
  created_at: string;
}

export interface PersonEventRecord {
  id: string;
  person_id: string;
  event_type: EventType;
  title: string;
  description?: string | null;
  event_date?: string | null;
  end_date?: string | null;
  date_is_approximate: number; // 1 or 0
  location_name?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  is_system_generated: number; // 1 or 0
  source_node_id?: string | null;
  source_event_id?: string | null;
  relationship_target_type?: 'PERSON' | 'FAMILY' | 'EXTERNAL_PERSON' | null;
  relationship_target_name?: string | null;
  relationship_target_id?: string | null;
  relationship_status?: string | null;
  created_at: string;
  updated_at: string;
  pinned_media?: EventMediaPinRecord[];
}

export interface EventMediaPinRecord {
  id: string;
  event_id: string;
  media_id?: string | null;
  media_file_path: string;
  thumbnail_url?: string | null;
  display_order: number;
  caption?: string | null;
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

export interface TreeGraphPerson extends PersonRecord {
  full_name: string;
  kinship_to_root?: string | null;
}

export interface TreeGraphUnion extends UnionRecord {
  partner_ids: string[];
  children: Array<{
    person_id: string;
    filiation: FiliationType;
    birth_order: number;
  }>;
}

export interface TreeGraphData {
  tree: TreeRecord;
  persons: TreeGraphPerson[];
  unions: TreeGraphUnion[];
  root_person_id?: string | null;
  facts?: PersonEventRecord[];
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
    type: EventType | string;
    title: string;
    description?: string | null;
    date?: string | null;
    location?: string | null;
    pinnedMediaCount?: number;
  }>;
}

export interface PhotoKinshipResponse {
  identifiedPersons: Array<{
    name: string;
    treePersonId?: string;
    avatarUrl?: string | null;
    kinshipToRoot?: KinshipInfo | null;
  }>;
  relationships: Array<{
    personA: string;
    personB: string;
    kinshipAtoB: string;
    kinshipBtoA: string;
    category: KinshipCategory;
  }>;
  suggestedCaption: string;
  summaryDescription: string;
  contextualMilestones: Array<{
    id?: string;
    personName: string;
    eventType: string;
    title: string;
    description?: string | null;
    date?: string | null;
    end_date?: string | null;
    date_is_approximate?: boolean | number;
    location?: string | null;
    category?: string;
    relativeName?: string;
    relativeRelation?: string;
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

export interface TreeHistoryRecord {
  id: string;
  tree_id: string;
  action_type: string;
  description: string;
  details?: string | null;
  created_at: string;
}

