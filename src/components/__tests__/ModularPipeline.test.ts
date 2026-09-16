import { describe, it } from 'node:test';
import assert from 'node:assert';
import { translations } from '../../i18n/translations.js';

describe('Modular Pipeline & Central Hub Integration', () => {
  it('should define all modular pipeline execution keys in English and Russian', () => {
    const requiredKeys = [
      'moduleAudio',
      'moduleAudioDesc',
      'moduleFaces',
      'moduleFacesDesc',
      'moduleDuplicates',
      'moduleDuplicatesDesc',
      'moduleVision',
      'moduleVisionDesc',
      'btnRunSelected',
      'btnSelectAll',
      'btnDeselectAll',
      'modularExecutionTitle',
      'modularExecutionDesc',
      'toggleDetails',
      'hideDetails',
      'subTabExecution',
      'subTabFaces',
      'subTabMetadata',
      'subTabModels',
    ];

    for (const key of requiredKeys) {
      assert.ok(
        (translations.en as unknown as Record<string, string>)[key],
        `Missing English translation for: ${key}`
      );
      assert.ok(
        (translations.ru as unknown as Record<string, string>)[key],
        `Missing Russian translation for: ${key}`
      );
    }
  });

  it('should have distinct descriptions for each modular pipeline capability', () => {
    const en = translations.en as unknown as Record<string, string>;
    assert.match(en.moduleAudioDesc, /Speech|transcription/i);
    assert.match(en.moduleFacesDesc, /facial recognition|detection/i);
    assert.match(en.moduleDuplicatesDesc, /phash|clustering|duplicate/i);
    assert.match(en.moduleVisionDesc, /Vision|LLM|summaries/i);
  });

  it('should have Russian translations for all 4 sub-tabs of the Central AI Hub', () => {
    const ru = translations.ru as unknown as Record<string, string>;
    assert.ok(ru.subTabExecution.includes('Запуск'));
    assert.ok(ru.subTabFaces.includes('Реестр лиц'));
    assert.ok(ru.subTabMetadata.includes('Метаданные файлов'));
    assert.ok(ru.subTabModels.includes('Модели ИИ'));
  });

  it('should have duplicate detection rules translations available in English and Russian', () => {
    const en = translations.en as unknown as Record<string, string>;
    const ru = translations.ru as unknown as Record<string, string>;
    assert.ok(en.duplicateDetectionRules, 'EN duplicateDetectionRules exists');
    assert.ok(ru.duplicateDetectionRules, 'RU duplicateDetectionRules exists');
    assert.ok(en.duplicateEngine, 'EN duplicateEngine exists');
    assert.ok(ru.duplicateEngine, 'RU duplicateEngine exists');
  });
});
