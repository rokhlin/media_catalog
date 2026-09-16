import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { SettingsService } from '../settings.service.js';
import { DatabaseService } from '../../database/database.service.js';
import { AppConfigService } from '../../config/config.service.js';

describe('SettingsService', () => {
  let settingsService: SettingsService;
  let configService: AppConfigService;
  let dbService: DatabaseService;
  let tmpDir: string;
  let settingsPath: string;

  before(() => {
    tmpDir = path.join(process.cwd(), 'media_output', `test_settings_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    settingsPath = path.join(tmpDir, 'settings.json');

    process.env.SETTINGS_PATH = settingsPath;
    configService = new AppConfigService();
    dbService = new DatabaseService(configService);
    settingsService = new SettingsService(configService, dbService);
  });

  after(() => {
    try {
      dbService.close();
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch {
      // ignore
    }
  });

  it('should retrieve current configuration settings', () => {
    const settings = settingsService.getSettings();
    assert.ok(Array.isArray(settings.input_folders), 'input_folders should be an array');
    assert.ok(settings.output_folder, 'output_folder should be defined');
    assert.ok(typeof settings.gemini_max_workers === 'number');
    assert.ok(typeof settings.preserve_structure === 'boolean');
    assert.strictEqual(typeof settings.is_dev, 'boolean');
  });

  it('should update and persist settings including comma-separated input lists and provider parameters', () => {
    const testOutput = path.join(tmpDir, 'output');
    const updateResult = settingsService.updateSettings({
      input_folders: ['/test/folder1, /test/folder2', '/test/folder3'],
      output_folder: testOutput,
      model_provider: 'local',
      local_model_name: 'llama-3.2-vision',
      local_max_workers: 4,
      preserve_structure: false,
    });

    assert.strictEqual(updateResult.status, 'success');
    assert.strictEqual(updateResult.model_provider, 'local');
    assert.strictEqual(updateResult.local_max_workers, 4);
    assert.strictEqual(updateResult.preserve_structure, false);

    // Verify settings were persisted on disk
    const savedDisk = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    assert.deepStrictEqual(savedDisk.INPUT_FOLDERS, ['/test/folder1', '/test/folder2', '/test/folder3']);
    assert.strictEqual(savedDisk.OUTPUT_FOLDER, testOutput);
    assert.strictEqual(savedDisk.MODEL_PROVIDER, 'local');
    assert.strictEqual(savedDisk.LOCAL_MAX_WORKERS, 4);
  });

  it('should browse filesystem directories and return shortcuts and contents', () => {
    const testSubdir = path.join(tmpDir, 'browse_sub');
    fs.mkdirSync(testSubdir, { recursive: true });
    fs.writeFileSync(path.join(testSubdir, 'sample.jpg'), 'fake');

    const result = settingsService.browseDirectory(tmpDir, 'file');
    assert.strictEqual(result.current_path, tmpDir);
    assert.ok(Array.isArray(result.shortcuts));
    assert.ok(result.directories.includes('browse_sub'));

    const subResult = settingsService.browseDirectory(testSubdir, 'file');
    assert.strictEqual(subResult.current_path, testSubdir);
    assert.ok(subResult.files.includes('sample.jpg'));
  });
});
