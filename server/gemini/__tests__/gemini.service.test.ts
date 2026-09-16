import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import sharp from 'sharp';
import { GeminiRateLimiter } from '../gemini.rate-limiter.js';
import { normalizeTags } from '../gemini.types.js';
import { GeminiService, buildVisionPrompt } from '../gemini.service.js';
import { AppConfigService } from '../../config/config.service.js';
import { DatabaseService } from '../../database/database.service.js';

describe('Gemini Integration on Web Backend', () => {
  let tempDir: string;
  let testImagePath: string;
  let configService: AppConfigService;
  let dbService: DatabaseService;

  before(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini_test_'));
    const testConfigDir = path.join(tempDir, 'config');
    fs.mkdirSync(testConfigDir, { recursive: true });

    // Create a real test JPEG image using sharp
    testImagePath = path.join(tempDir, 'test_shot.jpg');
    await sharp({
      create: {
        width: 1800,
        height: 1200,
        channels: 3,
        background: { r: 100, g: 150, b: 200 },
      },
    })
      .jpeg()
      .toFile(testImagePath);

    // Setup mock Config and Database services
    configService = new AppConfigService();
    Object.defineProperty(configService, 'projectRoot', { value: tempDir });
    Object.defineProperty(configService, 'outputFolder', { value: path.join(tempDir, 'output') });
    Object.defineProperty(configService, 'geminiApiKey', { value: 'test-api-key-12345' });
    Object.defineProperty(configService, 'geminiModel', { value: 'gemini-3.6-flash' });
    Object.defineProperty(configService, 'geminiRpmLimit', { value: 15 });
    Object.defineProperty(configService, 'imageMaxSize', { value: 1000 });

    dbService = new DatabaseService(configService);
    dbService.initDb();
  });

  after(() => {
    try {
      dbService.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe('GeminiRateLimiter', () => {
    it('should acquire slots and respect rate limit window', async () => {
      const limiter = new GeminiRateLimiter(3);
      assert.strictEqual(limiter.getLimit(), 3);
      assert.strictEqual(limiter.getActiveSlots(), 0);

      await limiter.acquire();
      assert.strictEqual(limiter.getActiveSlots(), 1);

      await limiter.acquire();
      assert.strictEqual(limiter.getActiveSlots(), 2);

      await limiter.acquire();
      assert.strictEqual(limiter.getActiveSlots(), 3);

      limiter.reset();
      assert.strictEqual(limiter.getActiveSlots(), 0);
    });
  });

  describe('normalizeTags', () => {
    it('should normalize comma-separated strings', () => {
      const tags = normalizeTags('nature, sunset, people: Anton');
      assert.strictEqual(tags.length, 3);
      assert.strictEqual(tags[0].tag, 'nature');
      assert.strictEqual(tags[0].category, 'general');
      assert.strictEqual(tags[2].tag, 'Anton');
      assert.strictEqual(tags[2].category, 'people');
    });

    it('should normalize array of objects', () => {
      const input = [
        { tag: 'mountains', category: 'scene', confidence: 0.95 },
        'forest',
      ];
      const res = normalizeTags(input);
      assert.strictEqual(res.length, 2);
      assert.strictEqual(res[0].tag, 'mountains');
      assert.strictEqual(res[0].category, 'scene');
      assert.strictEqual(res[0].confidence, 0.95);
      assert.strictEqual(res[1].tag, 'forest');
    });

    it('should handle empty or null values', () => {
      assert.deepStrictEqual(normalizeTags(null), []);
      assert.deepStrictEqual(normalizeTags(''), []);
    });
  });

  describe('GeminiService Image Preparation', () => {
    it('should resize large images to imageMaxSize and return valid JPEG buffer', async () => {
      const service = new GeminiService(configService, dbService);
      const buffer = await service.prepareImageBytes(testImagePath);

      assert.ok(buffer instanceof Buffer);
      assert.ok(buffer.length > 0);

      const meta = await sharp(buffer).metadata();
      assert.strictEqual(meta.format, 'jpeg');
      assert.ok((meta.width || 0) <= 1000);
      assert.ok((meta.height || 0) <= 1000);
    });
  });

  describe('GeminiService Status & Configuration', () => {
    it('should report configured status, model name, and rate limiter settings', () => {
      const service = new GeminiService(configService, dbService);
      const status = service.getStatus();

      assert.strictEqual(status.configured, true);
      assert.strictEqual(status.model, 'gemini-3.6-flash');
      assert.strictEqual(status.rpm_limit, 15);
      assert.strictEqual(status.provider, 'gemini');
    });

    it('should throw error when getClient() is invoked without GEMINI_API_KEY', () => {
      const unconfiguredConfig = new AppConfigService();
      Object.defineProperty(unconfiguredConfig, 'geminiApiKey', { value: '' });

      const service = new GeminiService(unconfiguredConfig, dbService);
      assert.throws(() => {
        service.getClient();
      }, /GEMINI_API_KEY is not configured/);
    });

    it('should validate connection failure when key is empty', async () => {
      const unconfiguredConfig = new AppConfigService();
      Object.defineProperty(unconfiguredConfig, 'geminiApiKey', { value: '' });

      const service = new GeminiService(unconfiguredConfig, dbService);
      const res = await service.validateConnection('');
      assert.strictEqual(res.ok, false);
      assert.ok(res.message.includes('No Google Gemini API Key'));
    });

    it('should validate connection success with working mock client', async () => {
      const service = new GeminiService(configService, dbService);
      (service as any).client = {
        models: {
          generateContent: async () => ({ text: 'Pong' }),
        },
      };
      (service as any).currentApiKey = 'test-api-key-12345';

      const res = await service.validateConnection();
      assert.strictEqual(res.ok, true);
      assert.ok(res.message.includes('Connection successful'));
      assert.strictEqual(typeof res.latencyMs, 'number');
      assert.strictEqual(res.model, 'gemini-3.6-flash');
    });

    it('should catch and sanitize connection failure with friendly message', async () => {
      const service = new GeminiService(configService, dbService);
      (service as any).client = {
        models: {
          generateContent: async () => {
            throw new Error('API_KEY_INVALID: Key AIzaSyDemoInvalidKey999 is not authorized.');
          },
        },
      };
      (service as any).currentApiKey = 'test-api-key-12345';

      const res = await service.validateConnection();
      assert.strictEqual(res.ok, false);
      assert.ok(res.message.includes('Invalid Gemini API key'));
      assert.ok(res.errorDetails?.includes('AIza[REDACTED]'));
    });
  });

  describe('Gemini Mock Analysis Execution & Sidecar Persistence', () => {
    it('should save sidecar file and update SQLite metadata table on single file analysis', async () => {
      const service = new GeminiService(configService, dbService);

      // Mock client generateContent
      const mockPhotoAnalysis = {
        summary: 'A sunny beach scene',
        summary_ru: 'Солнечный пляж',
        description: 'Warm sandy beach with blue ocean water.',
        description_ru: 'Теплый песчаный пляж с синей океанской водой.',
        environment: 'outdoor' as const,
        lighting: 'natural sunlight',
        lighting_ru: 'естественный солнечный свет',
        weather: 'sunny',
        weather_ru: 'солнечно',
        time_of_day: 'day',
        time_of_day_ru: 'день',
        content_type: 'nature',
        tags: [
          { tag: 'beach', category: 'scene', confidence: 0.98 },
          { tag: 'ocean', category: 'nature', confidence: 0.95 },
        ],
        ocr_text: null,
        exif_analysis: 'Shot taken on clear daylight.',
        exif_analysis_ru: 'Снимок сделан при ясном дневном свете.',
      };

      const mockClient = {
        models: {
          generateContent: async () => ({
            text: JSON.stringify(mockPhotoAnalysis),
          }),
        },
      };
      (service as any).client = mockClient;
      (service as any).currentApiKey = 'test-api-key-12345';

      const res = await service.analyzeMediaFile(testImagePath);

      assert.ok(res);
      assert.strictEqual(res.file_name, 'test_shot.jpg');
      assert.strictEqual(res.gemini_analysis.summary, 'A sunny beach scene');
      assert.strictEqual(res.gemini_analysis.summary_ru, 'Солнечный пляж');

      // Verify sidecar JSON was created in output directory
      const sidecarFile = path.join(configService.outputFolder, 'test_shot.jpg.json');
      assert.ok(fs.existsSync(sidecarFile), 'Sidecar JSON must exist');
      const sidecarContent = JSON.parse(fs.readFileSync(sidecarFile, 'utf-8'));
      assert.strictEqual(sidecarContent.gemini_analysis.summary_ru, 'Солнечный пляж');

      // Verify SQLite record was stored
      const metaRow = dbService.getMediaMetadata(testImagePath);
      assert.ok(metaRow, 'Metadata row must be stored in SQLite');
      assert.strictEqual(metaRow.summary, 'A sunny beach scene');
      assert.strictEqual(metaRow.summary_ru, 'Солнечный пляж');
    });

    it('should correctly interpolate placeholders in buildVisionPrompt', () => {
      const template = 'Examine {media_type}.\n\nContext:\n{context}\n\nPeople:\n{people}\n\nTags:\n{tag_instructions}';
      const compiled = buildVisionPrompt(
        'photo',
        'ISO 100, F2.8',
        'Alice and Bob',
        'Assign confidence 0.0-1.0',
        template
      );

      assert.ok(compiled.includes('Examine photo.'));
      assert.ok(compiled.includes('Context:\nISO 100, F2.8'));
      assert.ok(compiled.includes('People:\nAlice and Bob'));
      assert.ok(compiled.includes('Tags:\nAssign confidence 0.0-1.0'));

      // Test graceful fallback when placeholders are omitted
      const fallbackTemplate = 'Custom user prompt without placeholders.';
      const fallbackCompiled = buildVisionPrompt(
        'photo',
        'ISO 100, F2.8',
        'Alice',
        'Tag format: flat',
        fallbackTemplate
      );
      assert.ok(fallbackCompiled.startsWith('Custom user prompt without placeholders.'));
      assert.ok(fallbackCompiled.includes('ISO 100, F2.8'));
      assert.ok(fallbackCompiled.includes('Alice'));
      assert.ok(fallbackCompiled.includes('Tag format: flat'));
    });

    it('should use configured visionPromptTemplate during analyzePhoto', async () => {
      const customTemplate = 'Custom template analyzing {media_type}: {context}\n{people}\n{tag_instructions}';
      Object.defineProperty(configService, 'visionPromptTemplate', {
        value: customTemplate,
        configurable: true,
      });

      let capturedPrompt = '';
      const mockClient = {
        models: {
          generateContent: async (req: any) => {
            capturedPrompt = req.contents.find((c: any) => typeof c === 'string');
            return {
              text: JSON.stringify({
                summary: 'Custom analyzed',
                summary_ru: 'Кастомный анализ',
                description: 'Desc',
                description_ru: 'Описание',
                environment: 'indoor',
                lighting: 'natural',
                weather: 'unknown',
                time_of_day: 'day',
                content_type: 'other',
                tags: [],
              }),
            };
          },
        },
      };

      const customService = new GeminiService(configService, dbService);
      (customService as any).client = mockClient;
      (customService as any).currentApiKey = 'test-api-key-12345';

      await customService.analyzePhoto(testImagePath, { camera: 'Nikon' });

      assert.ok(capturedPrompt.includes('Custom template analyzing photo: EXIF metadata for this shot:'));
      assert.ok(capturedPrompt.includes('Nikon'));

      // Verify getPipelineExecutionConfig includes vision_prompt_template
      const execConfig = configService.getPipelineExecutionConfig();
      assert.strictEqual(execConfig.vision_prompt_template, customTemplate);
    });
  });
});
