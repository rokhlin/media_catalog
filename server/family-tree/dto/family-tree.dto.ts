import { IsString, IsOptional, IsNumber, IsBoolean, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import type {
  LivingPrivacyMode,
  Gender,
  UnionType,
  FiliationType,
  EventType,
} from '../types/family-tree.types.js';

export class CreateTreeDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  root_person_id?: string;

  @IsOptional()
  @IsString()
  living_privacy_mode?: LivingPrivacyMode;
}

export class UpdateTreeDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  root_person_id?: string;

  @IsOptional()
  @IsString()
  living_privacy_mode?: LivingPrivacyMode;
}

export class CreatePersonDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @IsString()
  tree_id?: string;

  @IsOptional()
  @IsString()
  media_person_id?: string;

  @IsString()
  first_name: string;

  @IsOptional()
  @IsString()
  middle_name?: string;

  @IsOptional()
  @IsString()
  last_name?: string;

  @IsOptional()
  @IsString()
  maiden_name?: string;

  @IsOptional()
  @IsString()
  gender?: Gender;

  @IsOptional()
  @IsString()
  birth_date?: string;

  @IsOptional()
  @IsString()
  birth_place?: string;

  @IsOptional()
  is_living?: boolean | number;

  @IsOptional()
  @IsString()
  death_date?: string;

  @IsOptional()
  @IsString()
  death_place?: string;

  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  @IsString()
  avatar_url?: string;

  @IsOptional()
  @IsString()
  avatar_face_id?: string;

  @IsOptional()
  custom_attributes?: Record<string, any> | string;
}

export class UpdatePersonDto {
  @IsOptional()
  @IsString()
  media_person_id?: string;

  @IsOptional()
  @IsString()
  first_name?: string;

  @IsOptional()
  @IsString()
  middle_name?: string;

  @IsOptional()
  @IsString()
  last_name?: string;

  @IsOptional()
  @IsString()
  maiden_name?: string;

  @IsOptional()
  @IsString()
  gender?: Gender;

  @IsOptional()
  @IsString()
  birth_date?: string;

  @IsOptional()
  @IsString()
  birth_place?: string;

  @IsOptional()
  is_living?: boolean | number;

  @IsOptional()
  @IsString()
  death_date?: string;

  @IsOptional()
  @IsString()
  death_place?: string;

  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  @IsString()
  avatar_url?: string | null;

  @IsOptional()
  @IsString()
  avatar_face_id?: string | null;

  @IsOptional()
  custom_attributes?: Record<string, any> | string;
}

export class CreateUnionDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @IsString()
  tree_id?: string;

  @IsArray()
  @IsString({ each: true })
  partner_ids: string[];

  @IsOptional()
  @IsString()
  union_type?: UnionType;

  @IsOptional()
  @IsString()
  start_date?: string;

  @IsOptional()
  @IsString()
  start_place?: string;

  @IsOptional()
  @IsString()
  end_date?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateUnionDto {
  @IsOptional()
  @IsString()
  union_type?: UnionType;

  @IsOptional()
  @IsString()
  start_date?: string;

  @IsOptional()
  @IsString()
  start_place?: string;

  @IsOptional()
  @IsString()
  end_date?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  partner_ids?: string[];
}

export class AddChildToUnionDto {
  @IsString()
  person_id: string;

  @IsOptional()
  @IsString()
  filiation?: FiliationType;

  @IsOptional()
  @IsNumber()
  birth_order?: number;
}

export class UpdateChildRelationDto {
  @IsOptional()
  @IsString()
  filiation?: FiliationType;

  @IsOptional()
  @IsNumber()
  birth_order?: number;
}

export class CreateEventDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  event_type: EventType;

  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  event_date?: string;

  @IsOptional()
  @IsString()
  end_date?: string;

  @IsOptional()
  date_is_approximate?: boolean | number;

  @IsOptional()
  @IsString()
  location_name?: string;

  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;

  @IsOptional()
  @IsString()
  relationship_target_type?: 'PERSON' | 'FAMILY' | 'EXTERNAL_PERSON';

  @IsOptional()
  @IsString()
  relationship_target_name?: string;

  @IsOptional()
  @IsString()
  relationship_target_id?: string;

  @IsOptional()
  @IsString()
  relationship_status?: string;

  @IsOptional()
  @IsArray()
  pinned_media?: Array<{
    media_id?: string;
    media_file_path: string;
    thumbnail_url?: string;
    display_order?: number;
    caption?: string;
  }>;
}

export class UpdateEventDto {
  @IsOptional()
  @IsString()
  event_type?: EventType;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  event_date?: string;

  @IsOptional()
  @IsString()
  end_date?: string;

  @IsOptional()
  date_is_approximate?: boolean | number;

  @IsOptional()
  @IsString()
  location_name?: string;

  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;

  @IsOptional()
  @IsString()
  relationship_target_type?: 'PERSON' | 'FAMILY' | 'EXTERNAL_PERSON';

  @IsOptional()
  @IsString()
  relationship_target_name?: string;

  @IsOptional()
  @IsString()
  relationship_target_id?: string;

  @IsOptional()
  @IsString()
  relationship_status?: string;
}

export class PinMediaDto {
  @IsOptional()
  @IsString()
  media_id?: string;

  @IsString()
  media_file_path: string;

  @IsOptional()
  @IsString()
  thumbnail_url?: string;

  @IsOptional()
  @IsNumber()
  display_order?: number;

  @IsOptional()
  @IsString()
  caption?: string;
}

export class UpdateMediaPinDto {
  @IsOptional()
  @IsNumber()
  display_order?: number;

  @IsOptional()
  @IsString()
  caption?: string;

  @IsOptional()
  @IsString()
  thumbnail_url?: string;
}

export class LinkFaceDto {
  @IsString()
  tree_person_id: string;

  @IsString()
  media_person_name: string;

  @IsString()
  media_face_id: string;

  @IsOptional()
  is_primary_avatar?: boolean | number;
}

export class QuickAddRelativeDto {
  @IsString()
  relationship: 'PARENT' | 'CHILD' | 'SPOUSE' | 'SIBLING';

  @IsString()
  target_person_id: string;

  @IsOptional()
  @IsString()
  other_parent_id?: string;

  @ValidateNested()
  @Type(() => CreatePersonDto)
  person: CreatePersonDto;

  @IsOptional()
  @IsString()
  filiation?: FiliationType;
}

export class PhotoKinshipDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  face_ids?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  person_names?: string[];

  @IsOptional()
  @IsString()
  media_id?: string;

  @IsOptional()
  @IsString()
  media_file_path?: string;

  @IsOptional()
  @IsString()
  media_date?: string;

  @IsOptional()
  @IsString()
  gallery_facts_scope?: 'OWN' | 'CLOSEST_FAMILY' | 'ALL';

  @IsOptional()
  @IsBoolean()
  only_close_events?: boolean;

  @IsOptional()
  @IsNumber()
  period_before_days?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  close_event_types?: string[];

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class GalleryKinshipFactsConfigDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  scope?: 'OWN' | 'CLOSEST_FAMILY' | 'ALL';

  @IsOptional()
  @IsBoolean()
  onlyCloseEvents?: boolean;

  @IsOptional()
  @IsNumber()
  periodBeforeDays?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  closeEventTypes?: string[];
}

export class UnlinkFaceDto {
  @IsOptional()
  @IsString()
  link_id?: string;

  @IsOptional()
  @IsString()
  tree_person_id?: string;

  @IsOptional()
  @IsString()
  media_face_id?: string;
}

export class RecordTreeHistoryDto {
  @IsString()
  action_type: string;

  @IsString()
  description: string;

  @IsOptional()
  details?: any;
}
