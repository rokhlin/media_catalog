import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { SettingsService } from '../settings.service.js';
import { DatabaseService } from '../../database/database.service.js';
import { AppConfigService } from '../../config/config.service.js';

describe('FeatureFlags Persistence in SettingsService', () => {
  let settingsService: SettingsService;
  let configService: AppConfigService;
  let dbService: DatabaseService;
  let tmpDir: string;
  let customFlagsPath: string;

  before(() => {
    tmpDir = path.join(
      process.cwd(),
      'media_output',
      `test_flags_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
    );
    fs.mkdirSync(tmpDir, { recursive: true });
    customFlagsPath = path.join(tmpDir, 'feature_flags.json');

    process.env.FEATURE_FLAGS_PATH = customFlagsPath;
    configService = new AppConfigService();
    dbService = new DatabaseService(configService);
    settingsService = new SettingsService(configService, dbService);
  });

  after(() => {
    delete process.env.FEATURE_FLAGS_PATH;
    try {
      dbService.close();
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch {
      // ignore
    }
  });

  it('should return empty array if custom feature flags file does not exist yet', () => {
    const flags = settingsService.getFeatureFlags();
    assert.deepStrictEqual(flags, []);
  });

  it('should save feature flags array to disk as formatted JSON', () => {
    const sampleFlags = [
      {
        key: 'test_flag',
        classNames: ['test-class-a', 'test-class-b'],
        isEnabled: true,
        description: 'Test feature flag',
      },
      {
        key: 'second_flag',
        classNames: ['test-class-c'],
        isEnabled: false,
        description: 'Second test feature flag',
      },
    ];

    const result = settingsService.saveFeatureFlags(sampleFlags);
    assert.strictEqual(result.status, 'success');
    assert.strictEqual(result.count, 2);
    assert.strictEqual(result.file_path, customFlagsPath);

    // Verify file exists on disk
    assert.ok(fs.existsSync(customFlagsPath), 'Feature flags file should exist on disk');
    const content = JSON.parse(fs.readFileSync(customFlagsPath, 'utf-8'));
    assert.strictEqual(content.length, 2);
    assert.strictEqual(content[0].key, 'test_flag');
    assert.strictEqual(content[1].isEnabled, false);
  });

  it('should retrieve feature flags from saved disk file', () => {
    const flags = settingsService.getFeatureFlags();
    assert.strictEqual(flags.length, 2);
    assert.strictEqual(flags[0].key, 'test_flag');
    assert.strictEqual(flags[0].classNames[0], 'test-class-a');
  });

  it('should throw error when trying to save non-array data', () => {
    assert.throws(() => {
      settingsService.saveFeatureFlags('invalid' as any);
    }, /Feature flags must be an array/);
  });

  it('should verify assets/default-feature-flags.json exists and ensureFeatureFlagsFile populates data/feature_flags.json', () => {
    const assetsPath = path.resolve(process.cwd(), 'assets', 'default-feature-flags.json');
    assert.ok(fs.existsSync(assetsPath), 'assets/default-feature-flags.json must exist');

    configService.ensureFeatureFlagsFile();
    const repoFlagsPath = path.resolve(process.cwd(), 'data', 'feature_flags.json');
    assert.ok(fs.existsSync(repoFlagsPath), 'data/feature_flags.json must be ensured');

    const content = JSON.parse(fs.readFileSync(repoFlagsPath, 'utf-8'));
    assert.ok(Array.isArray(content), 'File should contain a JSON array');
    assert.ok(content.length >= 7, 'Should contain at least 7 default presets');

    const keys = content.map((f: any) => f.key);
    assert.ok(keys.includes('first_frame_thumbnail_generation'));
    assert.ok(keys.includes('header_logs_button'));
    assert.ok(keys.includes('theme_quick_switcher'));
    assert.ok(keys.includes('language_switcher'));
    assert.ok(keys.includes('status_badge_header'));
    assert.ok(keys.includes('gallery_view_mode_selector'));
    assert.ok(keys.includes('media_filter_bar'));
  });
});
