import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  DEFAULT_FEATURE_FLAG_PRESETS,
  FlagsManager,
  normalizeClassName,
  normalizeFlagKey,
} from '../featureFlagsContext.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('FeatureFlagsContext and Presets from assets/default-feature-flags.json', () => {
  it('should verify DEFAULT_FEATURE_FLAG_PRESETS matches assets/default-feature-flags.json', () => {
    const defaultJsonPath = path.resolve(process.cwd(), 'assets', 'default-feature-flags.json');
    assert.ok(fs.existsSync(defaultJsonPath), 'assets/default-feature-flags.json must exist');

    const fileContent = JSON.parse(fs.readFileSync(defaultJsonPath, 'utf-8'));
    assert.strictEqual(DEFAULT_FEATURE_FLAG_PRESETS.length, fileContent.length);

    for (let i = 0; i < fileContent.length; i++) {
      assert.strictEqual(DEFAULT_FEATURE_FLAG_PRESETS[i].key, fileContent[i].key);
      assert.deepStrictEqual(DEFAULT_FEATURE_FLAG_PRESETS[i].classNames, fileContent[i].classNames);
      assert.deepStrictEqual(DEFAULT_FEATURE_FLAG_PRESETS[i].buttonIds, fileContent[i].buttonIds);
      assert.strictEqual(DEFAULT_FEATURE_FLAG_PRESETS[i].isEnabled, fileContent[i].isEnabled);
      assert.strictEqual(DEFAULT_FEATURE_FLAG_PRESETS[i].description, fileContent[i].description);
    }
  });

  it('should normalize class names and flag keys correctly', () => {
    assert.strictEqual(normalizeClassName(' .btn-logs-toggle '), 'btn-logs-toggle');
    assert.strictEqual(normalizeClassName('...gallery-filter-bar'), 'gallery-filter-bar');

    assert.strictEqual(normalizeFlagKey('FIRST-FRAME-THUMBNAIL-GENERATION'), 'first_frame_thumbnail_generation');
    assert.strictEqual(normalizeFlagKey('theme quick switcher'), 'theme_quick_switcher');
  });

  it('should initialize FlagsManager and query default flags', () => {
    assert.ok(FlagsManager.IsActive('first_frame_thumbnail_generation'));
    assert.ok(FlagsManager.IsActive('first-frame-thumbnail-generation'));
    assert.ok(FlagsManager.IsActive('header_logs_button'));
    assert.ok(FlagsManager.IsActive('theme_quick_switcher'));
    assert.ok(FlagsManager.IsActive('language_switcher'));
  });

  it('should toggle and update flags in FlagsManager', () => {
    FlagsManager.setFlag({
      key: 'test_toggle_feature',
      classNames: ['toggle-test-class'],
      isEnabled: true,
      description: 'Unit test flag',
    });

    assert.strictEqual(FlagsManager.IsActive('test_toggle_feature'), true);
    assert.strictEqual(FlagsManager.isClassEnabled('toggle-test-class'), true);

    FlagsManager.toggleFlag('test_toggle_feature');
    assert.strictEqual(FlagsManager.IsActive('test_toggle_feature'), false);
    assert.strictEqual(FlagsManager.isClassEnabled('toggle-test-class'), false);

    FlagsManager.removeFlag('test_toggle_feature');
    assert.strictEqual(FlagsManager.getFlag('test_toggle_feature'), undefined);
  });

  it('should reset to default presets from /data/feature_flags.json', () => {
    FlagsManager.clearAll();
    assert.strictEqual(FlagsManager.getFlags().length, 0);

    FlagsManager.resetToDefaults();
    const flags = FlagsManager.getFlags();
    assert.strictEqual(flags.length, DEFAULT_FEATURE_FLAG_PRESETS.length);
    assert.ok(FlagsManager.IsActive('first_frame_thumbnail_generation'));
  });
});
