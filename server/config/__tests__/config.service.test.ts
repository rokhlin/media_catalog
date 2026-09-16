import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { AppConfigService, joinConfigPaths } from '../config.service.js';

describe('AppConfigService', () => {
  let tmpDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  before(() => {
    originalEnv = { ...process.env };
    tmpDir = path.join(process.cwd(), 'media_output', `test_config_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`);
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
  });

  after(() => {
    process.env = originalEnv;
    try {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch {
      // ignore
    }
  });

  it('should initialize and return project defaults', () => {
    delete process.env.CONFIG_PATH;
    delete process.env.SETTINGS_PATH;
    const config = new AppConfigService();
    assert.ok(config.projectRoot, 'projectRoot should be defined');
    assert.strictEqual(config.settingsFilePath, path.resolve(config.projectRoot, 'data', 'config', 'settings.json'));
    assert.ok(typeof config.port === 'number', 'port should be a number');
    assert.ok(config.catalogerApiUrl, 'catalogerApiUrl should be defined');
    assert.ok(Array.isArray(config.inputFolders), 'inputFolders should be an array');
    assert.ok(config.outputFolder, 'outputFolder should be defined');
    assert.ok(config.dbPath, 'dbPath should be defined');
    assert.ok(config.facesFolder, 'facesFolder should be defined');
    assert.ok(config.supportedPhotoExts.has('.jpg'), 'should support .jpg');
    assert.ok(config.supportedPhotoExts.has('.heic'), 'should support .heic');
    assert.ok(config.supportedPhotoExts.has('.heif'), 'should support .heif');
    assert.ok(config.supportedVideoExts.has('.mp4'), 'should support .mp4');
  });

  it('should allow saving and retrieving custom settings', () => {
    const customSettingsFile = path.join(tmpDir, 'custom_settings.json');
    process.env.SETTINGS_PATH = customSettingsFile;

    const config = new AppConfigService();
    assert.strictEqual(config.settingsFilePath, customSettingsFile);

    const testInputFolders = [path.join(tmpDir, 'test_input')];
    const testOutputFolder = path.join(tmpDir, 'test_output');
    const additional = { MODEL_PROVIDER: 'local', GEMINI_MAX_WORKERS: 5 };

    config.saveSettings(testInputFolders, testOutputFolder, additional);

    const saved = config.getSavedSettings();
    assert.deepStrictEqual(saved.INPUT_FOLDERS, testInputFolders);
    assert.strictEqual(saved.OUTPUT_FOLDER, testOutputFolder);
    assert.strictEqual(saved.MODEL_PROVIDER, 'local');
    assert.strictEqual(saved.GEMINI_MAX_WORKERS, 5);
    assert.ok(saved.updated_at, 'updated_at timestamp should exist');
  });

  it('should preserve Windows UNC and drive paths in dev build without corrupting with relative root', () => {
    process.env.NODE_ENV = 'development';
    process.env.BUILD_TYPE = 'dev';
    const customSettingsFile = path.join(tmpDir, 'unc_settings.json');
    process.env.SETTINGS_PATH = customSettingsFile;

    const config = new AppConfigService();
    assert.strictEqual(config.isDev, true);

    const uncInputs = ['\\\\ZIMABOARD\\shares\\Photo', 'C:\\Media\\Pictures'];
    const uncOutput = '\\\\ZIMABOARD\\sda1\\media_cataloger';

    config.saveSettings(uncInputs, uncOutput);

    assert.deepStrictEqual(config.inputFolders, uncInputs);
    assert.strictEqual(config.outputFolder, uncOutput);
    assert.ok(
      config.dbPath === '\\\\ZIMABOARD\\sda1\\media_cataloger\\config\\catalog_history.db' ||
      config.dbPath === '\\\\ZIMABOARD\\sda1\\media_cataloger\\catalog_history.db',
      'dbPath should resolve under UNC output folder'
    );
  });

  it('should map UNC share mounts to /app/media_input and /app/media_output in non-dev/production builds', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.BUILD_TYPE;
    const customSettingsFile = path.join(tmpDir, 'prod_unc_settings.json');
    process.env.SETTINGS_PATH = customSettingsFile;

    const config = new AppConfigService();
    assert.strictEqual(config.isDev, false);

    const uncInputs = ['\\\\ZIMABOARD\\shares\\Photo', '\\ZIMABOARD\\shares\\Photo'];
    const uncOutput = '\\\\ZIMABOARD\\sda1\\media_cataloger';

    config.saveSettings(uncInputs, uncOutput);

    assert.deepStrictEqual(config.inputFolders, ['/app/media_input', '/app/media_input']);
    assert.strictEqual(config.outputFolder, '/app/media_output');
    assert.strictEqual(config.dbPath, '/app/media_output/config/catalog_history.db');
    assert.strictEqual(config.familyTreeDbPath, '/app/media_output/family_tree.db');
  });

  it('should join config paths correctly for Windows drive letters and UNC paths', () => {
    assert.strictEqual(
      joinConfigPaths('C:\\Media\\Output', 'config', 'catalog_history.db'),
      'C:\\Media\\Output\\config\\catalog_history.db'
    );
    assert.strictEqual(
      joinConfigPaths('D:/Media/Output', 'config', 'catalog_history.db'),
      'D:/Media/Output\\config\\catalog_history.db'
    );
    assert.strictEqual(
      joinConfigPaths('\\\\SERVER\\Share', 'config', 'catalog_history.db'),
      '\\\\SERVER\\Share\\config\\catalog_history.db'
    );
  });
});
