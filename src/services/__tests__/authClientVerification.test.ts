import { describe, it } from 'node:test';
import assert from 'node:assert';
import { authAndVaultTranslationsEn, authAndVaultTranslationsRu } from '../../i18n/translations.js';

describe('Authentication Client & Verification States', () => {
  it('should have required auth verification status translations in English', () => {
    assert.ok(authAndVaultTranslationsEn.authVerifyingPassword);
    assert.strictEqual(authAndVaultTranslationsEn.authVerifyingPassword, 'Verifying credentials...');
    assert.ok(authAndVaultTranslationsEn.authServerUnreachable);
    assert.ok(authAndVaultTranslationsEn.authTimeoutError);
  });

  it('should have required auth verification status translations in Russian', () => {
    assert.ok(authAndVaultTranslationsRu.authVerifyingPassword);
    assert.strictEqual(authAndVaultTranslationsRu.authVerifyingPassword, 'Проверка учетных данных...');
    assert.ok(authAndVaultTranslationsRu.authServerUnreachable);
    assert.ok(authAndVaultTranslationsRu.authTimeoutError);
  });

  it('should verify all auth translation keys are mirrored between EN and RU', () => {
    const enKeys = Object.keys(authAndVaultTranslationsEn).sort();
    const ruKeys = Object.keys(authAndVaultTranslationsRu).sort();
    assert.deepStrictEqual(enKeys, ruKeys);
  });
});
