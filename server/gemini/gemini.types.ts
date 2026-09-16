import { Type, type Schema } from '@google/genai';

export interface TagItem {
  tag: string;
  category?: string;
  confidence?: number;
}

export interface PhotoAnalysis {
  summary: string;
  summary_ru: string;
  description: string;
  description_ru: string;
  environment: 'indoor' | 'outdoor' | 'unknown';
  lighting: string;
  lighting_ru: string;
  weather?: string | null;
  weather_ru?: string | null;
  time_of_day: string;
  time_of_day_ru: string;
  content_type?: string;
  tags: TagItem[];
  ocr_text?: string | null;
  exif_analysis?: string | null;
  exif_analysis_ru?: string | null;
  location_name?: string | null;
}

export interface TimelineEvent {
  timestamp_start: string;
  timestamp_end: string;
  activity: string;
  activity_ru: string;
}

export interface VideoAnalysis {
  summary: string;
  summary_ru: string;
  transcription: string;
  transcription_ru: string;
  timeline_events: TimelineEvent[];
  content_type?: string;
  tags: TagItem[];
}

export interface DefectAnalysis {
  filename: string;
  has_motion_blur: boolean;
  has_closed_eyes: boolean;
  has_defocus: boolean;
  has_bad_exposure: boolean;
  details: string;
  details_ru: string;
}

export interface GroupDuplicateAnalysis {
  changes_weight: 'negligible' | 'low' | 'medium' | 'high';
  defects: DefectAnalysis[];
  best_image_name: string;
  reasoning: string;
  reasoning_ru: string;
}

export const TagItemSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    tag: { type: Type.STRING, description: 'Tag name or label' },
    category: { type: Type.STRING, description: 'Category of the tag (e.g. content_type, event, objects, scene, people, mood)' },
    confidence: { type: Type.NUMBER, description: 'Confidence score between 0.0 and 1.0' },
  },
  required: ['tag'],
};

export const PhotoAnalysisSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    summary: { type: Type.STRING, description: 'Short summary of the frame content in English' },
    summary_ru: { type: Type.STRING, description: 'Short summary of the frame content translated into Russian' },
    description: { type: Type.STRING, description: 'Detailed semantic description of the scene in English' },
    description_ru: { type: Type.STRING, description: 'Detailed semantic description of the scene translated into Russian' },
    environment: {
      type: Type.STRING,
      enum: ['indoor', 'outdoor', 'unknown'],
      description: 'Type of environment',
    },
    lighting: { type: Type.STRING, description: 'Lighting characteristics (natural, studio, dim, etc.) in English' },
    lighting_ru: { type: Type.STRING, description: 'Lighting characteristics in Russian' },
    weather: { type: Type.STRING, description: 'Weather if photo was taken outdoors in English', nullable: true },
    weather_ru: { type: Type.STRING, description: 'Weather if photo was taken outdoors in Russian', nullable: true },
    time_of_day: { type: Type.STRING, description: 'Time of day (morning, day, evening, night) in English' },
    time_of_day_ru: { type: Type.STRING, description: 'Time of day in Russian' },
    content_type: { type: Type.STRING, description: 'High-level content classification: documents, social, nature, animals, screenshots, family, other' },
    tags: {
      type: Type.ARRAY,
      items: TagItemSchema,
      description: 'Categorized semantic tags matching requested format',
    },
    ocr_text: { type: Type.STRING, description: 'Recognized text in the image (OCR) if present', nullable: true },
    exif_analysis: { type: Type.STRING, description: 'Expert analysis based on EXIF metadata in English', nullable: true },
    exif_analysis_ru: { type: Type.STRING, description: 'Expert analysis based on EXIF metadata in Russian', nullable: true },
  },
  required: ['summary', 'summary_ru', 'description', 'description_ru', 'environment', 'lighting', 'lighting_ru', 'time_of_day', 'time_of_day_ru', 'tags'],
};

export const TimelineEventSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    timestamp_start: { type: Type.STRING, description: 'Start of event in MM:SS format' },
    timestamp_end: { type: Type.STRING, description: 'End of event in MM:SS format' },
    activity: { type: Type.STRING, description: 'Description of activity/event in English' },
    activity_ru: { type: Type.STRING, description: 'Description of activity/event translated into Russian' },
  },
  required: ['timestamp_start', 'timestamp_end', 'activity', 'activity_ru'],
};

export const VideoAnalysisSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    summary: { type: Type.STRING, description: 'General description of video plot in English' },
    summary_ru: { type: Type.STRING, description: 'General description of video plot translated into Russian' },
    transcription: { type: Type.STRING, description: 'Transcription of speech and key background sounds in English' },
    transcription_ru: { type: Type.STRING, description: 'Transcription of speech and key background sounds translated into Russian' },
    timeline_events: {
      type: Type.ARRAY,
      items: TimelineEventSchema,
      description: 'Segmented timeline of events with activity labels',
    },
    content_type: { type: Type.STRING, description: 'High-level content classification: documents, social, nature, animals, screenshots, family, other' },
    tags: {
      type: Type.ARRAY,
      items: TagItemSchema,
      description: 'Categorized semantic tags matching requested format',
    },
  },
  required: ['summary', 'summary_ru', 'transcription', 'transcription_ru', 'timeline_events', 'tags'],
};

export const DefectAnalysisSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    filename: { type: Type.STRING, description: 'Image file name' },
    has_motion_blur: { type: Type.BOOLEAN, description: 'Presence of motion blur' },
    has_closed_eyes: { type: Type.BOOLEAN, description: 'Presence of closed eyes' },
    has_defocus: { type: Type.BOOLEAN, description: 'Presence of defocus/blur' },
    has_bad_exposure: { type: Type.BOOLEAN, description: 'Presence of bad exposure (over/underexposed)' },
    details: { type: Type.STRING, description: 'Details on defects or overall image quality in English' },
    details_ru: { type: Type.STRING, description: 'Details on defects or overall image quality translated into Russian' },
  },
  required: ['filename', 'has_motion_blur', 'has_closed_eyes', 'has_defocus', 'has_bad_exposure', 'details', 'details_ru'],
};

export const GroupDuplicateAnalysisSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    changes_weight: {
      type: Type.STRING,
      enum: ['negligible', 'low', 'medium', 'high'],
      description: 'Degree of changes between frames in burst (negligible, low, medium, high)',
    },
    defects: {
      type: Type.ARRAY,
      items: DefectAnalysisSchema,
      description: 'Defect analysis for each frame in the burst',
    },
    best_image_name: { type: Type.STRING, description: 'Filename of the best frame in the burst' },
    reasoning: { type: Type.STRING, description: 'Reasoning for selecting the best frame in English' },
    reasoning_ru: { type: Type.STRING, description: 'Reasoning for selecting the best frame translated into Russian' },
  },
  required: ['changes_weight', 'defects', 'best_image_name', 'reasoning', 'reasoning_ru'],
};

export function normalizeTags(tags: any): TagItem[] {
  if (!tags) return [];
  if (typeof tags === 'string') {
    return tags
      .split(',')
      .map(t => t.trim())
      .filter(Boolean)
      .map(t => {
        if (t.includes(':')) {
          const [cat, tag] = t.split(':');
          return { tag: tag.trim(), category: cat.trim().toLowerCase(), confidence: 1.0 };
        }
        return { tag: t, category: 'general', confidence: 1.0 };
      });
  }
  if (Array.isArray(tags)) {
    const res: TagItem[] = [];
    for (const item of tags) {
      if (typeof item === 'string') {
        const clean = item.trim();
        if (clean.includes(':')) {
          const [cat, tag] = clean.split(':');
          res.push({ tag: tag.trim(), category: cat.trim().toLowerCase(), confidence: 1.0 });
        } else if (clean) {
          res.push({ tag: clean, category: 'general', confidence: 1.0 });
        }
      } else if (item && typeof item === 'object') {
        const tag = String(item.tag || item.name || '').trim();
        if (tag) {
          const category = String(item.category || 'general').trim().toLowerCase();
          const confidence = typeof item.confidence === 'number' ? item.confidence : 1.0;
          res.push({ tag, category, confidence });
        }
      }
    }
    return res;
  }
  return [];
}
