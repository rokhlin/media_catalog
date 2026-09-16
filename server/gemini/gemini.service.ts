import { Injectable, Logger, Inject, Optional } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';
import crypto from 'crypto';
import sharp from 'sharp';
import { AppConfigService, DEFAULT_VISION_PROMPT_TEMPLATE } from '../config/config.service.js';
import { DatabaseService } from '../database/database.service.js';
import { LogBufferService } from '../logging/log-buffer.service.js';
import { GeminiRateLimiter } from './gemini.rate-limiter.js';
import {
  PhotoAnalysis,
  PhotoAnalysisSchema,
  VideoAnalysis,
  VideoAnalysisSchema,
  GroupDuplicateAnalysis,
  GroupDuplicateAnalysisSchema,
  normalizeTags,
} from './gemini.types.js';
import { sanitizeErrorString } from '../config/encryption.util.js';

export function formatPeoplePromptSection(
  facesData: any,
  isVideo: boolean = false
): string {
  if (!facesData) return '';
  if (!isVideo) {
    if (!Array.isArray(facesData)) return '';
    const namedFaces: Array<{ name: string; bbox?: any }> = [];
    for (const f of facesData) {
      if (!f || typeof f !== 'object') continue;
      const name = (f.name || '').trim();
      const faceId = (f.face_id || '').trim();
      if (
        name &&
        !['unknown', 'unnamed'].includes(name.toLowerCase()) &&
        !name.toLowerCase().startsWith('face_') &&
        !name.toLowerCase().startsWith('face-') &&
        !name.toLowerCase().startsWith('person_')
      ) {
        namedFaces.push({ name, bbox: f.bbox });
      } else if (name && name !== faceId && !faceId.startsWith('manual_') && !faceId.startsWith('face_manual_')) {
        namedFaces.push({ name, bbox: f.bbox });
      }
    }
    if (namedFaces.length === 0) return '';
    const peopleLines = namedFaces.map(
      (item, idx) => `- Person ${idx + 1}: "${item.name}"${item.bbox ? ` (bounding box: ${JSON.stringify(item.bbox)})` : ''}`
    );
    return (
      `Recognized individuals present in this photo:\n${peopleLines.join('\n')}\n\n` +
      'MANDATORY INSTRUCTIONS FOR RECOGNIZED PEOPLE:\n' +
      "1. You MUST explicitly mention each identified person by name in your scene summary ('summary', 'summary_ru') and detailed description ('description', 'description_ru').\n" +
      '2. Use the bounding boxes provided above only to visually match which individual in the photo is which named person. Do NOT mention raw coordinates or bounding boxes in text.\n' +
      '3. Describe people naturally by their appearance and activities.\n' +
      "4. Include each recognized person as a tag with category 'people' and confidence 1.0."
    );
  } else {
    // Video
    const namedIntervals: Array<{ name: string; intervals?: any[] }> = [];
    if (typeof facesData === 'object' && !Array.isArray(facesData)) {
      for (const info of Object.values(facesData as Record<string, any>)) {
        if (!info || typeof info !== 'object') continue;
        const name = (info.name || '').trim();
        if (
          name &&
          !['unknown', 'unnamed'].includes(name.toLowerCase()) &&
          !name.toLowerCase().startsWith('face_') &&
          !name.toLowerCase().startsWith('person_')
        ) {
          namedIntervals.push({ name, intervals: info.intervals || [] });
        }
      }
    } else if (Array.isArray(facesData)) {
      for (const item of facesData) {
        if (!item || typeof item !== 'object') continue;
        const name = (item.name || '').trim();
        if (
          name &&
          !['unknown', 'unnamed'].includes(name.toLowerCase()) &&
          !name.toLowerCase().startsWith('face_') &&
          !name.toLowerCase().startsWith('person_')
        ) {
          namedIntervals.push({ name, intervals: item.intervals || item.time_intervals || [] });
        }
      }
    }
    if (namedIntervals.length === 0) return '';
    const peopleLines = namedIntervals.map(
      (item, idx) => `- Person ${idx + 1}: "${item.name}"${item.intervals && item.intervals.length > 0 ? ` (visible during timecodes: ${item.intervals.join(', ')})` : ''}`
    );
    return (
      `Recognized individuals appearing in this video:\n${peopleLines.join('\n')}\n\n` +
      'MANDATORY INSTRUCTIONS FOR RECOGNIZED PEOPLE:\n' +
      "1. You MUST explicitly mention each identified person by name in your summary ('summary', 'summary_ru'), description ('description', 'description_ru'), and in timeline_events activity descriptions.\n" +
      '2. Do NOT output raw tracking IDs or numbers. Describe what each individual is doing naturally.\n' +
      "3. Include each recognized person as a tag with category 'people' and confidence 1.0."
    );
  }
}

export function buildVisionPrompt(
  mediaType: 'photo' | 'video',
  contextStr: string = '',
  peopleStr: string = '',
  tagInstructions: string = '',
  customTemplate?: string | null
): string {
  const template =
    (customTemplate && customTemplate.trim()) || DEFAULT_VISION_PROMPT_TEMPLATE;

  const hasMediaType = template.includes('{media_type}');
  const hasContext = template.includes('{context}');
  const hasPeople = template.includes('{people}');
  const hasTags = template.includes('{tag_instructions}');

  const mediaTypeDesc = mediaType === 'photo' ? 'photo' : 'video file plot';

  let prompt = template;
  if (hasMediaType) {
    prompt = prompt.replace(/{media_type}/g, mediaTypeDesc);
  }
  if (hasContext) {
    prompt = prompt.replace(/{context}/g, contextStr.trim());
  }
  if (hasPeople) {
    prompt = prompt.replace(/{people}/g, peopleStr.trim());
  }
  if (hasTags) {
    prompt = prompt.replace(/{tag_instructions}/g, tagInstructions.trim());
  }

  const extraParts: string[] = [];
  if (!hasContext && contextStr.trim()) {
    extraParts.push(contextStr.trim());
  }
  if (!hasPeople && peopleStr.trim()) {
    extraParts.push(peopleStr.trim());
  }
  if (!hasTags && tagInstructions.trim()) {
    extraParts.push(tagInstructions.trim());
  }

  if (extraParts.length > 0) {
    prompt = prompt.trim() + '\n\n' + extraParts.join('\n\n');
  }

  return prompt.replace(/\n{3,}/g, '\n\n').trim();
}

export interface GeminiValidationResult {
  ok: boolean;
  message: string;
  model: string;
  latencyMs?: number;
  timestamp: string;
  errorDetails?: string;
}

@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private client: GoogleGenAI | null = null;
  private currentApiKey: string | null = null;
  private readonly rateLimiter: GeminiRateLimiter;

  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService,
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Optional() @Inject(LogBufferService) private readonly logBuffer?: LogBufferService,
  ) {
    this.rateLimiter = new GeminiRateLimiter(this.config.geminiRpmLimit);
  }

  /**
   * Get or initialize the GoogleGenAI client singleton, re-initializing if API key changed.
   */
  public getClient(): GoogleGenAI {
    const apiKey = this.config.geminiApiKey;
    if (!apiKey) {
      throw new Error(
        'Critical error: GEMINI_API_KEY is not configured on the backend. Please set it in Settings or .env.'
      );
    }

    if (!this.client || this.currentApiKey !== apiKey) {
      this.client = new GoogleGenAI({ apiKey });
      this.currentApiKey = apiKey;
      this.rateLimiter.setLimit(this.config.geminiRpmLimit);
    }

    return this.client;
  }

  /**
   * Resize image to IMAGE_MAX_SIZE along larger dimension and convert to JPEG buffer.
   */
  public async prepareImageBytes(imagePath: string): Promise<Buffer> {
    try {
      const maxDim = this.config.imageMaxSize || 1500;
      const pipeline = sharp(imagePath, { failOn: 'none' })
        .rotate() // auto-orient based on EXIF
        .resize({
          width: maxDim,
          height: maxDim,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: 85 });

      return await pipeline.toBuffer();
    } catch (err: any) {
      throw new Error(`Failed to prepare image '${path.basename(imagePath)}': ${err.message}`);
    }
  }

  /**
   * Analyze photo with Gemini, incorporating EXIF metadata and optional target tags/formatting.
   */
  public async analyzePhoto(
    imagePath: string,
    exifData?: Record<string, any> | null,
    targetTags?: string[] | null,
    tagFormat: 'categorized' | 'flat' | 'prefixed' = 'categorized',
    customPrompt?: string | null,
    facesData?: any[] | null,
  ): Promise<PhotoAnalysis> {
    const client = this.getClient();
    const imageBytes = await this.prepareImageBytes(imagePath);

    let exifPromptPart = '';
    if (exifData && Object.keys(exifData).length > 0) {
      exifPromptPart = `EXIF metadata for this shot:\n${JSON.stringify(exifData, null, 2)}`;
    }

    let tagInstructions = '';
    if (targetTags && targetTags.length > 0) {
      const targetTagsStr = targetTags.map((t) => `'${t}'`).join(', ');
      tagInstructions += `Target tags criteria to evaluate against: [${targetTagsStr}]. If the photo matches any of these target tags/categories, assign them with appropriate confidence scores (0.0 - 1.0). `;
    }

    if (tagFormat === 'flat') {
      tagInstructions += "\nTag format: output concise keywords in 'tag' field, category 'general'.";
    } else if (tagFormat === 'prefixed') {
      tagInstructions += "\nTag format: populate tag using 'category:tag' naming convention.";
    } else {
      tagInstructions +=
        "\nTag format: populate 'tag', explicit 'category' (e.g. content_type, event, objects, scene, people, mood), and 'confidence' (0.0 to 1.0). " +
        "Also classify high-level 'content_type' (documents, social, nature, animals, screenshots, family, other).";
    }

    const peopleStr = formatPeoplePromptSection(facesData, false);
    const templateToUse = customPrompt || this.config.visionPromptTemplate;
    const prompt = buildVisionPrompt(
      'photo',
      exifPromptPart,
      peopleStr,
      tagInstructions,
      templateToUse
    );

    await this.rateLimiter.acquire();

    const modelName = this.config.geminiModel || 'gemini-3.6-flash';
    this.logger.log(`Calling Gemini API (${modelName}) for photo: ${path.basename(imagePath)}`);
    this.logBuffer?.info('Gemini', `Analyzing photo '${path.basename(imagePath)}' with model ${modelName}`);

    const response = await client.models.generateContent({
      model: modelName,
      contents: [
        {
          inlineData: {
            mimeType: 'image/jpeg',
            data: imageBytes.toString('base64'),
          },
        },
        prompt,
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: PhotoAnalysisSchema,
        temperature: 0.1,
      },
    });

    const responseText = response.text || '{}';
    const parsed: PhotoAnalysis = JSON.parse(responseText);
    parsed.tags = normalizeTags(parsed.tags);
    return parsed;
  }

  /**
   * Perform semantic analysis on video file via Gemini File API.
   */
  public async analyzeVideo(
    videoPath: string,
    transcription?: string | null,
    transcriptionRu?: string | null,
    targetTags?: string[] | null,
    tagFormat: 'categorized' | 'flat' | 'prefixed' = 'categorized',
    customPrompt?: string | null,
    facesData?: any | null,
  ): Promise<VideoAnalysis> {
    const client = this.getClient();
    const filename = path.basename(videoPath);

    this.logger.log(`Uploading video '${filename}' to Google GenAI File API...`);
    this.logBuffer?.info('Gemini', `Uploading video '${filename}' to Gemini File API...`);

    await this.rateLimiter.acquire();
    const uploadResult = await client.files.upload({
      file: videoPath,
      config: {
        mimeType: this.getMimeTypeForVideo(videoPath),
      },
    });

    const uploadedName = uploadResult.name as string;

    try {
      this.logger.log(`Waiting for video '${filename}' processing on Google API side...`);
      let fileInfo = uploadResult;
      while (true) {
        fileInfo = await client.files.get({ name: uploadedName });
        const state = (fileInfo as any).state || 'PROCESSING';
        if (state === 'ACTIVE') {
          this.logger.log(`Video '${filename}' is ready for analysis.`);
          break;
        } else if (state === 'FAILED' || state === 'ERROR') {
          const errorMsg = (fileInfo as any).error?.message || 'Unknown error';
          throw new Error(`Video processing on Gemini API side failed: ${errorMsg}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }

      let transcriptionPrompt = '';
      if (transcription) {
        transcriptionPrompt = `We have already transcribed the speech/audio of this video for you. Transcription (English): ${transcription}\n`;
        if (transcriptionRu) {
          transcriptionPrompt += `Transcription (Russian): ${transcriptionRu}\n`;
        }
        transcriptionPrompt +=
          'Please use this transcription to help understand the context, dialogue, and plot descriptions. ' +
          'You should output this transcription or a refined version of it in the transcription/transcription_ru fields.';
      }

      let videoTagInstructions = '';
      if (targetTags && targetTags.length > 0) {
        const targetTagsStr = targetTags.map((t) => `'${t}'`).join(', ');
        videoTagInstructions += `Target tags criteria to evaluate against: [${targetTagsStr}]. If the video matches any of these target tags/categories, assign them with appropriate confidence scores (0.0 - 1.0). `;
      }
      if (tagFormat === 'flat') {
        videoTagInstructions += "\nTag format: output concise keywords in 'tag' field, category 'general'.";
      } else if (tagFormat === 'prefixed') {
        videoTagInstructions += "\nTag format: populate tag using 'category:tag' naming convention.";
      } else {
        videoTagInstructions +=
          "\nTag format: populate 'tag', explicit 'category' (e.g. content_type, event, objects, scene, people, mood), and 'confidence' (0.0 to 1.0). " +
          "Also classify high-level 'content_type' (documents, social, nature, animals, screenshots, family, other).";
      }

      const peopleStr = formatPeoplePromptSection(facesData, true);
      const templateToUse = customPrompt || this.config.visionPromptTemplate;
      const prompt = buildVisionPrompt(
        'video',
        transcriptionPrompt,
        peopleStr,
        videoTagInstructions,
        templateToUse
      );

      await this.rateLimiter.acquire();
      const modelName = this.config.geminiModel || 'gemini-3.6-flash';
      this.logger.log(`Calling Gemini API (${modelName}) for video: ${filename}`);

      const response = await client.models.generateContent({
        model: modelName,
        contents: [fileInfo, prompt],
        config: {
          responseMimeType: 'application/json',
          responseSchema: VideoAnalysisSchema,
          temperature: 0.1,
        },
      });

      const responseText = response.text || '{}';
      const parsed: VideoAnalysis = JSON.parse(responseText);
      parsed.tags = normalizeTags(parsed.tags);
      return parsed;
    } finally {
      if (uploadedName) {
        try {
          this.logger.log(`Deleting temporary video '${uploadedName}' from Google GenAI File API...`);
          await client.files.delete({ name: uploadedName });
        } catch (err: any) {
          this.logger.warn(`Failed to delete temporary video file '${uploadedName}': ${err.message}`);
        }
      }
    }
  }

  /**
   * Batch analysis of burst shot duplicates via Gemini API.
   */
  public async analyzeDuplicates(imagePaths: string[]): Promise<GroupDuplicateAnalysis> {
    const client = this.getClient();
    const contents: any[] = [];

    for (const imgPath of imagePaths) {
      const bytes = await this.prepareImageBytes(imgPath);
      contents.push(`Filename: ${path.basename(imgPath)}`);
      contents.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: bytes.toString('base64'),
        },
      });
    }

    const prompt =
      'Before you is a series of similar photos taken sequentially (burst shooting). ' +
      'Compare them against each other and determine the degree/weight of changes (changes_weight). ' +
      'Perform a technical defect audit of each frame for: ' +
      '- motion blur (has_motion_blur)\n' +
      '- closed eyes (has_closed_eyes)\n' +
      '- defocus (has_defocus)\n' +
      '- bad exposure (has_bad_exposure)\n' +
      'Determine the filename of the best frame (best_image_name) and provide detailed reasoning for the selection. ' +
      'Fill all main text fields in English, and provide full Russian translations in the corresponding *_ru fields ' +
      'so that the output JSON supports searching in both English and Russian.';
    contents.push(prompt);

    await this.rateLimiter.acquire();
    const modelName = this.config.geminiModel || 'gemini-3.6-flash';
    this.logger.log(`Evaluating burst duplicates (${imagePaths.length} items) via Gemini API...`);

    const response = await client.models.generateContent({
      model: modelName,
      contents,
      config: {
        responseMimeType: 'application/json',
        responseSchema: GroupDuplicateAnalysisSchema,
        temperature: 0.1,
      },
    });

    const responseText = response.text || '{}';
    return JSON.parse(responseText);
  }

  /**
   * High-level single file media analysis with sidecar creation and DB updates.
   */
  public async analyzeMediaFile(
    resolvedFilePath: string,
    options?: {
      target_tags?: string[];
      tag_format?: 'categorized' | 'flat' | 'prefixed';
      custom_prompt?: string | null;
      vision_prompt_template?: string | null;
      faces_data?: any;
    }
  ): Promise<any> {
    const filename = path.basename(resolvedFilePath);
    const ext = path.extname(resolvedFilePath).toLowerCase();
    const isPhoto = this.config.supportedPhotoExts.has(ext);
    const isVideo = this.config.supportedVideoExts.has(ext);

    if (!isPhoto && !isVideo) {
      throw new Error(`Unsupported media format for file '${filename}'`);
    }

    const stat = fs.statSync(resolvedFilePath);
    const fileSize = stat.size;
    const mtime = stat.mtimeMs / 1000;

    let analysisResult: PhotoAnalysis | VideoAnalysis;
    let exifData: Record<string, any> = {};

    if (isPhoto) {
      try {
        const metadata = await sharp(resolvedFilePath, { failOn: 'none' }).metadata();
        exifData = {
          width: metadata.width,
          height: metadata.height,
          format: metadata.format,
          space: metadata.space,
          density: metadata.density,
          orientation: metadata.orientation,
        };
      } catch {
        // EXIF extract error fallback
      }

      analysisResult = await this.analyzePhoto(
        resolvedFilePath,
        exifData,
        options?.target_tags,
        options?.tag_format || 'categorized',
        options?.custom_prompt || options?.vision_prompt_template,
        options?.faces_data
      );
    } else {
      analysisResult = await this.analyzeVideo(
        resolvedFilePath,
        null,
        null,
        options?.target_tags,
        options?.tag_format || 'categorized',
        options?.custom_prompt || options?.vision_prompt_template,
        options?.faces_data
      );
    }

    // Assemble metadata matching AI Engine sidecar schema
    const metadataPayload: Record<string, any> = {
      file_path: resolvedFilePath,
      file_name: filename,
      file_size: fileSize,
      mtime: mtime,
      media_type: isPhoto ? 'photo' : 'video',
      content_type: (analysisResult as any).content_type || 'other',
      tags: analysisResult.tags || [],
      exif: exifData,
      faces: [],
      gemini_analysis: analysisResult,
      duplicate_analysis: null,
    };

    // Save sidecar JSON file
    const outputFolder = this.config.outputFolder;
    if (!fs.existsSync(outputFolder)) {
      fs.mkdirSync(outputFolder, { recursive: true });
    }
    const sidecarPath = path.join(outputFolder, `${filename}.json`);
    fs.writeFileSync(sidecarPath, JSON.stringify(metadataPayload, null, 2), 'utf-8');

    // Update SQLite database
    try {
      this.db.saveSyncRecord({
        filePath: resolvedFilePath,
        fileSize,
        mtime,
        status: 'completed',
        sidecarPath,
      });

      const mediaId = this.generateMediaId(resolvedFilePath);
      const pa = analysisResult as PhotoAnalysis;
      const va = analysisResult as VideoAnalysis;

      this.db.saveMediaMetadata(
        resolvedFilePath,
        {
          media_type: isPhoto ? 'image' : 'video',
          file_size: fileSize,
          mtime,
          summary: pa.summary || va.summary || null,
          summary_ru: pa.summary_ru || va.summary_ru || null,
          description: pa.description || null,
          description_ru: pa.description_ru || null,
          environment: pa.environment || null,
          lighting: pa.lighting || null,
          lighting_ru: pa.lighting_ru || null,
          weather: pa.weather || null,
          weather_ru: pa.weather_ru || null,
          time_of_day: pa.time_of_day || null,
          time_of_day_ru: pa.time_of_day_ru || null,
          ocr_text: pa.ocr_text || null,
          exif_analysis: pa.exif_analysis || null,
          exif_analysis_ru: pa.exif_analysis_ru || null,
          transcription: va.transcription || null,
          transcription_ru: va.transcription_ru || null,
          timeline_events: va.timeline_events ? va.timeline_events : null,
          location_name: pa.location_name || null,
        },
        mediaId
      );

      if (Array.isArray(analysisResult.tags) && analysisResult.tags.length > 0) {
        this.db.saveMediaTags(
          resolvedFilePath,
          analysisResult.tags.map((t) => t.tag)
        );
      }
    } catch (err: any) {
      this.logger.warn(`Failed to update SQLite database for '${filename}': ${err.message}`);
    }

    this.logBuffer?.info('Gemini', `Analysis completed successfully for '${filename}'`);
    return metadataPayload;
  }

  private lastValidation: GeminiValidationResult | null = null;

  public async validateConnection(apiKey?: string, model?: string): Promise<GeminiValidationResult> {
    const rawKey = (apiKey && apiKey.trim()) || this.config.geminiApiKey;
    const effectiveModel = (model && model.trim()) || this.config.geminiModel || 'gemini-3.6-flash';
    const timestamp = new Date().toISOString();

    if (!rawKey) {
      this.lastValidation = {
        ok: false,
        message: 'No Google Gemini API Key configured or provided.',
        model: effectiveModel,
        timestamp,
      };
      return this.lastValidation;
    }

    const startTime = Date.now();
    try {
      const testClient = (apiKey && apiKey.trim())
        ? new GoogleGenAI({ apiKey: rawKey })
        : this.getClient();

      await testClient.models.generateContent({
        model: effectiveModel,
        contents: 'Ping',
        config: {
          maxOutputTokens: 5,
        },
      });

      const latencyMs = Date.now() - startTime;
      this.lastValidation = {
        ok: true,
        message: 'Connection successful. Google Gemini API is fully reachable and operational.',
        model: effectiveModel,
        latencyMs,
        timestamp,
      };
      return this.lastValidation;
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      const rawMsg = err.message || 'Unknown error during Gemini connection validation';
      let userFriendlyMessage = sanitizeErrorString(rawMsg);

      if (rawMsg.includes('API_KEY_INVALID') || rawMsg.includes('API key not valid') || rawMsg.includes('400')) {
        userFriendlyMessage = 'Invalid Gemini API key. Please verify your credentials from Google AI Studio.';
      } else if (rawMsg.includes('429') || rawMsg.includes('RESOURCE_EXHAUSTED')) {
        userFriendlyMessage = 'Gemini API rate limit or quota exceeded. Please check your Google AI Studio plan/billing.';
      } else if (rawMsg.includes('404') || rawMsg.includes('NOT_FOUND')) {
        userFriendlyMessage = `Model '${effectiveModel}' was not found or is unavailable for this API key tier.`;
      } else if (rawMsg.includes('ENOTFOUND') || rawMsg.includes('ETIMEDOUT') || rawMsg.includes('fetch failed')) {
        userFriendlyMessage = 'Network connection failed: unable to reach Google Gemini API endpoints.';
      }

      this.lastValidation = {
        ok: false,
        message: userFriendlyMessage,
        model: effectiveModel,
        latencyMs,
        timestamp,
        errorDetails: sanitizeErrorString(err.stack || rawMsg),
      };
      return this.lastValidation;
    }
  }

  public getStatus() {
    const hasKey = Boolean(this.config.geminiApiKey);
    return {
      configured: hasKey,
      is_gemini_api_key_set: hasKey,
      gemini_api_key_masked: this.config.geminiApiKeyMasked,
      model: this.config.geminiModel || 'gemini-3.6-flash',
      rpm_limit: this.config.geminiRpmLimit,
      active_slots: this.rateLimiter.getActiveSlots(),
      provider: 'gemini',
      lastValidation: this.lastValidation,
    };
  }

  private generateMediaId(filePath: string): string {
    return `media_${crypto.createHash('sha256').update(filePath).digest('hex').substring(0, 16)}`;
  }

  private getMimeTypeForVideo(videoPath: string): string {
    const ext = path.extname(videoPath).toLowerCase();
    switch (ext) {
      case '.mp4':
      case '.m4v':
        return 'video/mp4';
      case '.mov':
        return 'video/quicktime';
      case '.webm':
        return 'video/webm';
      case '.avi':
        return 'video/x-msvideo';
      case '.mkv':
        return 'video/x-matroska';
      default:
        return 'video/mp4';
    }
  }
}
