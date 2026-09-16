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
  relative_relation?: string | null;
  created_at: string;
  updated_at: string;
  pinned_media?: EventMediaPinRecord[];
}

export interface CreateEventInput {
  event_type: EventType;
  title: string;
  description?: string;
  event_date?: string;
  end_date?: string;
  date_is_approximate?: boolean;
  location_name?: string;
  latitude?: number;
  longitude?: number;
  relationship_target_type?: 'PERSON' | 'FAMILY' | 'EXTERNAL_PERSON';
  relationship_target_name?: string;
  relationship_target_id?: string;
  relationship_status?: string;
  pinned_media?: Array<{
    media_id?: string;
    media_file_path: string;
    thumbnail_url?: string;
    display_order?: number;
    caption?: string;
  }>;
}

export interface UpdateEventInput {
  event_type?: EventType;
  title?: string;
  description?: string;
  event_date?: string;
  end_date?: string;
  date_is_approximate?: boolean;
  location_name?: string;
  latitude?: number;
  longitude?: number;
  relationship_target_type?: 'PERSON' | 'FAMILY' | 'EXTERNAL_PERSON';
  relationship_target_name?: string;
  relationship_target_id?: string;
  relationship_status?: string;
}

export interface PinMediaInput {
  media_id?: string;
  media_file_path: string;
  thumbnail_url?: string;
  display_order?: number;
  caption?: string;
}
