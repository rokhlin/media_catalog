import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  FlagsManager,
  normalizeButtonId,
} from '../featureFlagsContext.js';

describe('Feature Flags for Buttons & Button IDs Toggling', () => {
  it('should normalize button IDs correctly by stripping leading # and whitespace', () => {
    assert.strictEqual(normalizeButtonId('  #btn-logs-toggle  '), 'btn-logs-toggle');
    assert.strictEqual(normalizeButtonId('###btn-export-tree'), 'btn-export-tree');
    assert.strictEqual(normalizeButtonId('btn-simple'), 'btn-simple');
    assert.strictEqual(normalizeButtonId(''), '');
  });

  it('should support creating and toggling flags with buttonIds', () => {
    const testFlagKey = 'test_button_flag_toggle';

    FlagsManager.setFlag({
      key: testFlagKey,
      classNames: ['test-class-name'],
      buttonIds: ['#btn-special-action'],
      isEnabled: true,
      description: 'Test flag for button IDs',
    });

    const storedFlag = FlagsManager.getFlag(testFlagKey);
    assert.ok(storedFlag, 'Flag must be created');
    assert.deepStrictEqual(storedFlag.buttonIds, ['btn-special-action']);
    assert.strictEqual(FlagsManager.isButtonEnabled('btn-special-action'), true);
    assert.strictEqual(FlagsManager.isButtonEnabled('#btn-special-action'), true);
    assert.strictEqual(FlagsManager.isClassEnabled('test-class-name'), true);

    // Toggle off (disable)
    FlagsManager.toggleFlag(testFlagKey);
    assert.strictEqual(FlagsManager.IsActive(testFlagKey), false);
    assert.strictEqual(FlagsManager.isButtonEnabled('btn-special-action'), false);
    assert.strictEqual(FlagsManager.isButtonEnabled('#btn-special-action'), false);
    assert.strictEqual(FlagsManager.isClassEnabled('test-class-name'), false);

    // Other buttons remain enabled
    assert.strictEqual(FlagsManager.isButtonEnabled('btn-other-unrelated'), true);

    // Toggle back on
    FlagsManager.toggleFlag(testFlagKey);
    assert.strictEqual(FlagsManager.IsActive(testFlagKey), true);
    assert.strictEqual(FlagsManager.isButtonEnabled('btn-special-action'), true);

    // Clean up
    FlagsManager.removeFlag(testFlagKey);
    assert.strictEqual(FlagsManager.getFlag(testFlagKey), undefined);
  });

  it('should verify feature flag presets contain buttonIds array', () => {
    const assetsPath = path.resolve(process.cwd(), 'assets', 'default-feature-flags.json');
    const dataPath = path.resolve(process.cwd(), 'data', 'feature_flags.json');
    const jsonPath = fs.existsSync(assetsPath) ? assetsPath : dataPath;
    assert.ok(fs.existsSync(jsonPath), 'feature flag presets file must exist');

    const content = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    assert.ok(Array.isArray(content), 'Presets must be an array');

    for (const flag of content) {
      assert.ok(Array.isArray(flag.buttonIds), `Flag "${flag.key}" must have buttonIds array`);
    }

    const logsFlag = content.find((f: any) => f.key === 'header_logs_button');
    assert.ok(logsFlag, 'header_logs_button preset must exist');
    assert.ok(logsFlag.buttonIds.includes('btn-logs-toggle'), 'header_logs_button must include btn-logs-toggle buttonId');
  });

  it('should verify AdminPanel.tsx has Button IDs input under CSS Class Names', () => {
    const adminPanelPath = path.resolve('src/components/admin/AdminPanel.tsx');
    const content = fs.readFileSync(adminPanelPath, 'utf-8');

    assert.ok(content.includes('formButtonIds'), 'AdminPanel must have formButtonIds state');
    assert.ok(content.includes('flagButtonIdsLabel'), 'AdminPanel must use flagButtonIdsLabel translation');
    assert.ok(content.includes('COMMON_APP_BUTTON_IDS'), 'AdminPanel must define COMMON_APP_BUTTON_IDS suggestions');
    assert.ok(content.includes('input-tag-button-id'), 'AdminPanel must have input-tag-button-id element');
  });

  it('should verify DEVELOPMENT_AND_VALIDATION.md documents Common Components and Button ID rules', () => {
    const docPath = path.resolve('.agents/rules/DEVELOPMENT_AND_VALIDATION.md');
    const content = fs.readFileSync(docPath, 'utf-8');

    assert.ok(content.includes('UI Component Standards & Common Components Rules'), 'Must include Section 5');
    assert.ok(content.includes('Mandatory Button `id` Attribute'), 'Must mandate Button id attribute');
    assert.ok(content.includes('Exported Component Styles & Style Hooks'), 'Must document style hooks');
    assert.ok(content.includes('Feature Flags for Buttons and Elements'), 'Must document button feature flags');
  });
});
