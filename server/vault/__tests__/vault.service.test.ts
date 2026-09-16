import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { DatabaseService } from '../../database/database.service.js';
import { VaultService } from '../vault.service.js';
import { AppConfigService } from '../../config/config.service.js';

describe('VaultService & Secret Folder Isolation', () => {
  let tmpDir: string;
  let dbService: DatabaseService;
  let vaultService: VaultService;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vault_test_'));
    const configMock: any = {
      dbPath: path.join(tmpDir, 'test_vault.db'),
      projectRoot: tmpDir,
      inputFolders: [tmpDir],
      outputFolder: path.join(tmpDir, 'output'),
      supportedPhotoExts: new Set(['.jpg', '.png']),
      supportedVideoExts: new Set(['.mp4']),
    };

    dbService = new DatabaseService(configMock as AppConfigService);
    dbService.initDb();
    vaultService = new VaultService(dbService);
  });

  after(() => {
    dbService.close();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('should initially report unconfigured vault status', () => {
    const status = vaultService.getVaultStatus();
    assert.equal(status.isConfigured, false);
    assert.equal(status.isUnlocked, false);
    assert.equal(status.itemsCount, 0);
  });

  it('should configure vault with PIN and designated vault folder', () => {
    const configured = vaultService.setupVault({
      pin: '9876',
      vaultFolder: 'secret_vault',
      autoLockMinutes: 10,
    });

    assert.equal(configured.isConfigured, true);
    assert.equal(configured.vaultFolder, 'secret_vault');
    assert.equal(configured.autoLockMinutes, 10);
  });

  it('should reject unlocking with incorrect PIN', () => {
    assert.throws(() => {
      vaultService.unlockVault({ pin: '0000' });
    }, /Incorrect Vault PIN/);
  });

  it('should unlock with valid PIN and return active session token', () => {
    const unlockRes = vaultService.unlockVault({ pin: '9876' });
    assert.equal(unlockRes.unlocked, true);
    assert.ok(unlockRes.sessionToken);
    assert.ok(unlockRes.expiresAt > Date.now());

    assert.equal(vaultService.isVaultUnlocked(unlockRes.sessionToken), true);
    assert.equal(vaultService.isVaultUnlocked('invalid_token'), false);
  });

  it('should add files to secret vault and detect vault file membership', () => {
    const privatePath = path.join(tmpDir, 'private_docs.jpg');
    vaultService.addVaultItem(privatePath, 'Personal Documents');

    assert.equal(vaultService.isVaultFile(privatePath), true);
    assert.equal(vaultService.isVaultFile(path.join(tmpDir, 'public.jpg')), false);
  });

  it('should recognize files inside designated vault folder or .vault path', () => {
    assert.equal(vaultService.isVaultFile('/photos/secret_vault/photo1.jpg'), true);
    assert.equal(vaultService.isVaultFile('c:\\photos\\.vault\\hidden.png'), true);
    assert.equal(vaultService.isVaultFile('c:\\photos\\vacation\\normal.jpg'), false);
  });

  it('should list vault files only when session is unlocked', () => {
    const unlockRes = vaultService.unlockVault({ pin: '9876' });
    const files = vaultService.listVaultFiles(unlockRes.sessionToken);
    assert.ok(files.length > 0);

    assert.throws(() => {
      vaultService.listVaultFiles('expired_or_missing_token');
    }, /Vault is locked/);
  });

  it('should relock vault and terminate active session', () => {
    const unlockRes = vaultService.unlockVault({ pin: '9876' });
    assert.equal(vaultService.isVaultUnlocked(unlockRes.sessionToken), true);

    vaultService.lockVault(unlockRes.sessionToken);
    assert.equal(vaultService.isVaultUnlocked(unlockRes.sessionToken), false);
  });
});
