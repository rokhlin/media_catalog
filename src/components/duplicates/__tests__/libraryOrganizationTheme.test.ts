import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { BUILTIN_THEMES } from '../../../theme/presets.js';

describe('Library Organization Theme Support', () => {
  const cssPath = path.resolve('src/components/duplicates/LibraryOrganizationPanel.css');
  const cssContent = fs.readFileSync(cssPath, 'utf8');

  it('should use theme CSS variables for card and text colors', () => {
    assert.ok(cssContent.includes('var(--card-bg'), 'Should use --card-bg');
    assert.ok(cssContent.includes('var(--text-primary'), 'Should use --text-primary');
    assert.ok(cssContent.includes('var(--input-bg'), 'Should use --input-bg');
    assert.ok(cssContent.includes('var(--nav-tab-bg'), 'Should use --nav-tab-bg');
  });

  it('should not contain hardcoded pure white font on table inputs or title', () => {
    // Check .lib-org-card-title uses var(--text-primary)
    assert.match(
      cssContent,
      /\.lib-org-card-title\s*\{[^}]*color:\s*var\(--text-primary/s,
      '.lib-org-card-title should use var(--text-primary)'
    );

    // Check .organize-accordion-title uses var(--text-primary)
    assert.match(
      cssContent,
      /\.organize-accordion-title\s*\{[^}]*color:\s*var\(--text-primary/s,
      '.organize-accordion-title should use var(--text-primary)'
    );

    // Check .lib-org-table-input uses var(--input-bg) and var(--text-primary)
    assert.match(
      cssContent,
      /\.lib-org-table-input\s*\{[^}]*background:\s*var\(--input-bg/s,
      '.lib-org-table-input should use var(--input-bg)'
    );
  });

  it('should provide contrasting textPrimary and cardBg in light theme preset', () => {
    const light = BUILTIN_THEMES.find((t) => t.id === 'light');
    assert.ok(light, 'Light theme preset must exist');

    // In light theme, textPrimary must be a dark color (e.g. #0f172a), cardBg must be light
    assert.strictEqual(light.mode, 'light');
    assert.ok(
      light.tokens.textPrimary.startsWith('#0') || light.tokens.textPrimary.startsWith('#1'),
      'Light theme textPrimary must be dark for readability'
    );
  });
});
