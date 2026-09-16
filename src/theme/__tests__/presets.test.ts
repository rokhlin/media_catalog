import { describe, it } from 'node:test';
import assert from 'node:assert';
import { BUILTIN_THEMES, buildCustomTokens, applyTokensToElement } from '../presets.js';

describe('Theme Presets & Tokens', () => {
  it('should have properly structured BUILTIN_THEMES', () => {
    assert.ok(Array.isArray(BUILTIN_THEMES));
    assert.ok(BUILTIN_THEMES.length >= 4, 'Should provide at least 4 default themes');

    const darkTheme = BUILTIN_THEMES.find((t) => t.id === 'dark');
    assert.ok(darkTheme, 'Default dark theme should exist');
    assert.strictEqual(darkTheme.mode, 'dark');

    const lightTheme = BUILTIN_THEMES.find((t) => t.id === 'light');
    assert.ok(lightTheme, 'Default light theme should exist');
    assert.strictEqual(lightTheme.mode, 'light');

    for (const theme of BUILTIN_THEMES) {
      assert.ok(theme.id, 'Theme should have id');
      assert.ok(theme.nameKey, 'Theme should have nameKey for i18n');
      assert.ok(theme.defaultName, 'Theme should have defaultName');
      assert.ok(theme.mode === 'dark' || theme.mode === 'light', 'Mode should be dark or light');
      assert.ok(theme.previewColors.length >= 2, 'Should provide preview colors');

      // Verify all critical tokens exist
      const tokens = theme.tokens;
      assert.ok(tokens.bgColor, `Theme ${theme.id} missing bgColor`);
      assert.ok(tokens.cardBg, `Theme ${theme.id} missing cardBg`);
      assert.ok(tokens.primaryColor, `Theme ${theme.id} missing primaryColor`);
      assert.ok(tokens.accentColor, `Theme ${theme.id} missing accentColor`);
      assert.ok(tokens.textPrimary, `Theme ${theme.id} missing textPrimary`);
      assert.ok(tokens.consoleBg, `Theme ${theme.id} missing consoleBg`);
    }
  });

  it('should dynamically build custom tokens from color inputs', () => {
    const customTokens = buildCustomTokens({
      mode: 'dark',
      bgColor: '#101010',
      cardBgSolid: '#1e1e1e',
      primaryColor: '#ff5500',
      accentColor: '#00aaff',
    });

    assert.strictEqual(customTokens.bgColor, '#101010');
    assert.strictEqual(customTokens.cardBgSolid, '#1e1e1e');
    assert.strictEqual(customTokens.primaryColor, '#ff5500');
    assert.strictEqual(customTokens.accentColor, '#00aaff');
    assert.ok(customTokens.primaryGradient.includes('#ff5500'));
    assert.ok(customTokens.accentGradient.includes('#00aaff'));
  });

  it('should apply tokens to DOM-like style element', () => {
    const props: Record<string, string> = {};
    const mockElement = {
      style: {
        setProperty: (key: string, val: string) => {
          props[key] = val;
        },
      },
    } as any;

    const sampleTokens = BUILTIN_THEMES[0].tokens;
    applyTokensToElement(sampleTokens, mockElement);

    assert.strictEqual(props['--bg-color'], sampleTokens.bgColor);
    assert.strictEqual(props['--primary-color'], sampleTokens.primaryColor);
    assert.strictEqual(props['--text-primary'], sampleTokens.textPrimary);
    assert.strictEqual(props['--text-color'], sampleTokens.textPrimary);
    assert.strictEqual(props['--card-bg'], sampleTokens.cardBg);
  });
});
