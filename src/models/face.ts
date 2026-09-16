export interface FaceDetail {
  face_id?: string;
  person_name?: string;
  name?: string;
  bounding_box?: [number, number, number, number] | number[];
  confidence?: number;
  similarity?: number;
  thumbnail_url?: string;
  image_path?: string | null;
  is_reference?: boolean;
  source_file?: string | null;
  timestamp_ms?: number;
  person_id?: string;
  created_at?: string;
  detected_at?: string;
}

export interface FaceItem {
  face_id: string;
  person_name?: string;
  name?: string;
  source_file?: string | null;
  similarity?: number;
  thumbnail_url?: string;
  image_path?: string | null;
  is_reference?: boolean;
  detected_at?: string;
  created_at?: string;
  confidence?: number;
  person_id?: string;
  bounding_box?: [number, number, number, number] | number[];
  assigned_name?: string;
  timestamp_ms?: number;
  created_at_date?: string;
}

export interface PersonItem {
  name: string;
  person_id?: string;
  count?: number;
  face_count?: number;
  reference_count?: number;
  reference_face_count?: number;
  thumbnail_url?: string;
  sample_url?: string;
  primary_image?: string | null;
  sample_image?: string | null;
  sample_images?: string[];
  reference_faces?: FaceItem[];
  family_tree?: {
    is_in_tree: boolean;
    tree_person_id?: string;
    kinship_to_root?: string;
    category?: string;
    birth_year?: string | number | null;
    is_living?: boolean;
    recent_milestones?: Array<{
      type?: string;
      title: string;
      date?: string;
    }>;
  };
}

export interface UnrecognizedGroupItem {
  group_id: string;
  face_ids: string[];
  faces?: FaceItem[];
  count: number;
  source_files?: string[];
  representative_face?: FaceItem;
  primary_image?: string | null;
  sample_image?: string | null;
  sample_face_id?: string | null;
  sample_thumbnail_url?: string;
  avg_confidence?: number;
}

export interface DetectedFaceRecord {
  face_id: string;
  person_id?: string;
  name?: string;
  image_path?: string;
  confidence?: number;
  is_reference?: boolean | number;
  source_file?: string;
  bbox?: [number, number, number, number] | number[] | null;
  bounding_box?: [number, number, number, number] | number[] | null;
}

export interface AssignmentConfig {
  targetPerson: string;
  customName?: string;
}

// Aliases for Face Registry component models
export type FaceRegistryFace = FaceItem;
export type FaceRegistryPerson = PersonItem;
export type FaceRegistryGroup = UnrecognizedGroupItem;
