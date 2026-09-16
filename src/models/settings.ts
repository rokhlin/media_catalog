export interface SettingsData {
  input_folders?: string[];
  output_folder?: string;
  default_output_folder?: string;
  is_custom_input?: boolean;
  is_custom_output?: boolean;
  is_dev?: boolean;
  model_provider?: string;
  gemini_model?: string;
  gemini_api_key?: string;
  gemini_api_key_masked?: string;
  is_gemini_api_key_set?: boolean;
  clear_gemini_api_key?: boolean;
  rpm_limit?: number;
  local_model_name?: string;
  gemini_max_workers?: number;
  local_max_workers?: number;
  max_workers?: number;
  whisper_model?: string;
  preserve_structure?: boolean;
  db_path?: string;
  target_tags?: string[];
  tag_format?: 'categorized' | 'flat' | 'prefixed';
  vision_prompt_template?: string;
  default_vision_prompt_template?: string;
  [key: string]: unknown;
}

export interface UISettings {
  maxImagesPerRow: number;
  maxRows: number;
  maxWidth: number;
  galleryMaxRows?: number;
}
