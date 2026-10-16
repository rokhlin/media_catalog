import { describe, it } from 'node:test';
import assert from 'node:assert';
import { shouldClearAuthOnUnauthorized } from '../authContext.js';

describe('Vault PIN & Session Isolation from App Authentication', () => {
  it('should NOT clear app authentication when vault operations return 401 Unauthorized', () => {
    // /api/vault/unlock returns 401 when the user enters an incorrect PIN
    assert.strictEqual(
      shouldClearAuthOnUnauthorized('/api/vault/unlock'),
      false,
      'Vault unlock failures must not log out the user from the app'
    );
    assert.strictEqual(
      shouldClearAuthOnUnauthorized('/api/vault/status'),
      false,
      'Vault status checks must not log out the user'
    );
    assert.strictEqual(
      shouldClearAuthOnUnauthorized('/api/vault/items?file=test.jpg'),
      false,
      'Vault items modifications must not log out the user'
    );
    assert.strictEqual(
      shouldClearAuthOnUnauthorized('/api/vault/media-items'),
      false,
      'Vault media items queries must not log out the user'
    );
    assert.strictEqual(
      shouldClearAuthOnUnauthorized('/api/vault/change-pin'),
      false,
      'Vault PIN change attempts must not log out the user'
    );
  });

  it('should NOT clear app authentication when credential verification endpoints return 401', () => {
    assert.strictEqual(shouldClearAuthOnUnauthorized('/api/auth/login'), false);
    assert.strictEqual(shouldClearAuthOnUnauthorized('/api/auth/register'), false);
    assert.strictEqual(shouldClearAuthOnUnauthorized('/api/auth/forgot-password'), false);
    assert.strictEqual(shouldClearAuthOnUnauthorized('/api/auth/reset-password'), false);
  });

  it('should clear app authentication when general protected endpoints return 401 (token expired/invalid)', () => {
    assert.strictEqual(shouldClearAuthOnUnauthorized('/api/auth/me'), true);
    assert.strictEqual(shouldClearAuthOnUnauthorized('/api/media/files'), true);
    assert.strictEqual(shouldClearAuthOnUnauthorized('/api/settings'), true);
    assert.strictEqual(shouldClearAuthOnUnauthorized('/api/faces'), true);
    assert.strictEqual(shouldClearAuthOnUnauthorized('/api/duplicates/scan'), true);
  });
});
