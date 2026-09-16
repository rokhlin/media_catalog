import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  encryptSecret,
  decryptSecret,
  maskSecret,
  sanitizeErrorString,
} from '../encryption.util.js';

describe('Encryption Utility (AES-256-GCM)', () => {
  const sampleKey = 'AIzaSyDemoSampleKey1234567890abcdefgh';

  it('should encrypt plaintext into enc:v1 format and decrypt back', () => {
    const encrypted = encryptSecret(sampleKey);
    assert.ok(encrypted.startsWith('enc:v1:'), 'Encrypted string must have enc:v1: prefix');
    assert.notStrictEqual(encrypted, sampleKey, 'Encrypted string must not match plaintext');

    const decrypted = decryptSecret(encrypted);
    assert.strictEqual(decrypted, sampleKey, 'Decrypted key must match original');
  });

  it('should not double-encrypt if already encrypted', () => {
    const encryptedOnce = encryptSecret(sampleKey);
    const encryptedTwice = encryptSecret(encryptedOnce);
    assert.strictEqual(encryptedOnce, encryptedTwice, 'Should not double-encrypt');
  });

  it('should return legacy plaintext key unchanged when decrypting', () => {
    const legacyKey = 'plain_legacy_key_123';
    const result = decryptSecret(legacyKey);
    assert.strictEqual(result, legacyKey, 'Legacy plaintext must be returned unchanged');
  });

  it('should mask secrets securely', () => {
    const masked = maskSecret(sampleKey);
    assert.ok(masked.startsWith('AIza'), 'Should start with first 4 characters');
    assert.ok(masked.endsWith('efgh'), 'Should end with last 4 characters');
    assert.ok(masked.includes('••••'), 'Should contain mask dots');
    assert.strictEqual(masked.includes('DemoSampleKey'), false, 'Should not reveal middle text');
  });

  it('should mask encrypted secret as well', () => {
    const encrypted = encryptSecret(sampleKey);
    const masked = maskSecret(encrypted);
    assert.ok(masked.startsWith('AIza'), 'Should decrypt and mask properly');
    assert.ok(masked.endsWith('efgh'), 'Should end with last 4 chars');
  });

  it('should sanitize error strings containing API keys', () => {
    const rawError = 'Request failed: https://generativelanguage.googleapis.com/v1beta/models?key=AIzaSyDemoSampleKey1234567890abcdefgh';
    const sanitized = sanitizeErrorString(rawError);
    assert.strictEqual(sanitized.includes('AIzaSyDemoSampleKey'), false, 'Key must be scrubbed');
    assert.ok(sanitized.includes('key=[REDACTED]') || sanitized.includes('AIza[REDACTED]'));
  });
});
