import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  translations,
  headerTranslationsEn,
  headerTranslationsRu,
  commonTranslationsEn,
  commonTranslationsRu,
  familyTreeTranslationsEn,
  familyTreeTranslationsRu,
  lightboxTranslationsEn,
  lightboxTranslationsRu,
} from '../translations.js';

describe('i18n Translations', () => {
  it('should have both English and Russian translation dictionaries', () => {
    assert.ok(translations.en, 'English dictionary exists');
    assert.ok(translations.ru, 'Russian dictionary exists');
  });

  it('should maintain 100% key parity between English and Russian translations', () => {
    const enKeys = Object.keys(translations.en).sort();
    const ruKeys = Object.keys(translations.ru).sort();

    const missingInRu = enKeys.filter((k) => !(k in translations.ru));
    const missingInEn = ruKeys.filter((k) => !(k in translations.en));

    assert.deepStrictEqual(missingInRu, [], `Keys missing in Russian translation: ${missingInRu.join(', ')}`);
    assert.deepStrictEqual(missingInEn, [], `Keys missing in English translation: ${missingInEn.join(', ')}`);
    assert.strictEqual(enKeys.length, ruKeys.length, 'Key counts should match exactly');
  });

  it('should not contain empty strings in translations', () => {
    for (const [lang, dict] of Object.entries(translations)) {
      for (const [key, value] of Object.entries(dict)) {
        assert.ok(typeof value === 'string', `${lang}.${key} should be a string`);
        assert.ok(value.trim().length > 0, `${lang}.${key} should not be empty`);
      }
    }
  });

  it('should have consistent sub-dictionaries (header, common, family tree, lightbox)', () => {
    const enHeaderKeys = Object.keys(headerTranslationsEn).sort();
    const ruHeaderKeys = Object.keys(headerTranslationsRu).sort();
    assert.deepStrictEqual(enHeaderKeys, ruHeaderKeys);

    const enCommonKeys = Object.keys(commonTranslationsEn).sort();
    const ruCommonKeys = Object.keys(commonTranslationsRu).sort();
    assert.deepStrictEqual(enCommonKeys, ruCommonKeys);

    const enTreeKeys = Object.keys(familyTreeTranslationsEn).sort();
    const ruTreeKeys = Object.keys(familyTreeTranslationsRu).sort();
    assert.deepStrictEqual(enTreeKeys, ruTreeKeys);

    const enLightboxKeys = Object.keys(lightboxTranslationsEn).sort();
    const ruLightboxKeys = Object.keys(lightboxTranslationsRu).sort();
    assert.deepStrictEqual(enLightboxKeys, ruLightboxKeys);
  });

  it('should support viewInFamilyTree placeholder template in both languages', () => {
    assert.ok(translations.en.viewInFamilyTree.includes('{name}'));
    assert.ok(translations.ru.viewInFamilyTree.includes('{name}'));
  });
});
