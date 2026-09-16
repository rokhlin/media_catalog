import { describe, it } from 'node:test';
import assert from 'node:assert';
import { translations } from '../../../i18n/translations.js';
import AdminGeminiTab from '../AdminGeminiTab.js';

describe('AdminGeminiTab & Translations', () => {
  it('should export AdminGeminiTab component function', () => {
    assert.strictEqual(typeof AdminGeminiTab, 'function');
  });

  it('should have all Gemini translation keys defined in English dictionary', () => {
    const en = translations.en;
    assert.strictEqual(en.adminTabGemini, 'Gemini AI Configuration');
    assert.ok(en.geminiConfigTitle);
    assert.ok(en.geminiConfigSubtitle);
    assert.ok(en.geminiStatusConnected);
    assert.ok(en.geminiStatusNotConfigured);
    assert.ok(en.geminiStatusError);
    assert.ok(en.geminiValidateBtn);
    assert.ok(en.geminiSaveBtn);
    assert.ok(en.geminiApiKeyLabel);
    assert.ok(en.geminiApiKeyPlaceholder);
    assert.ok(en.geminiApiKeyConfiguredBadge);
    assert.ok(en.geminiApiKeyClearBtn);
    assert.ok(en.geminiModelLabel);
    assert.ok(en.geminiProviderLabel);
    assert.ok(en.geminiRpmLimitLabel);
    assert.ok(en.geminiMaxWorkersLabel);
    assert.ok(en.geminiSuccessToast);
  });

  it('should have all Gemini translation keys defined in Russian dictionary', () => {
    const ru = translations.ru;
    assert.strictEqual(ru.adminTabGemini, 'Конфигурация Gemini AI');
    assert.ok(ru.geminiConfigTitle);
    assert.ok(ru.geminiConfigSubtitle);
    assert.ok(ru.geminiStatusConnected);
    assert.ok(ru.geminiStatusNotConfigured);
    assert.ok(ru.geminiStatusError);
    assert.ok(ru.geminiValidateBtn);
    assert.ok(ru.geminiSaveBtn);
    assert.ok(ru.geminiApiKeyLabel);
    assert.ok(ru.geminiApiKeyPlaceholder);
    assert.ok(ru.geminiApiKeyConfiguredBadge);
    assert.ok(ru.geminiApiKeyClearBtn);
    assert.ok(ru.geminiModelLabel);
    assert.ok(ru.geminiProviderLabel);
    assert.ok(ru.geminiRpmLimitLabel);
    assert.ok(ru.geminiMaxWorkersLabel);
    assert.ok(ru.geminiSuccessToast);
  });
});
