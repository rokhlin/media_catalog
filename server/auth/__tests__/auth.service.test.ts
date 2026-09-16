import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { DatabaseService } from '../../database/database.service.js';
import { AuthService, DEFAULT_ROLE_PERMISSIONS } from '../auth.service.js';
import { AppConfigService } from '../../config/config.service.js';

describe('AuthService & RBAC', () => {
  let tmpDir: string;
  let dbService: DatabaseService;
  let authService: AuthService;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auth_test_'));
    const configMock: any = {
      dbPath: path.join(tmpDir, 'test_auth.db'),
      projectRoot: tmpDir,
      inputFolders: [tmpDir],
      outputFolder: path.join(tmpDir, 'output'),
      supportedPhotoExts: new Set(['.jpg', '.png']),
      supportedVideoExts: new Set(['.mp4']),
    };

    dbService = new DatabaseService(configMock as AppConfigService);
    dbService.initDb();
    authService = new AuthService(dbService);
  });

  after(() => {
    dbService.close();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('should auto-seed default admin account on initialization', () => {
    const admin = dbService.getUserByUsername('admin');
    assert.ok(admin, 'Admin account should exist');
    assert.equal(admin.role, 'admin');
    assert.ok(Array.isArray(admin.permissions));
    assert.ok(admin.permissions.includes('admin_panel'));
  });

  it('should validate default admin credentials and issue JWT token', async () => {
    const user = await authService.validateUser('admin', 'admin');
    assert.ok(user, 'Admin credentials should validate');
    assert.equal(user.username, 'admin');

    const result = await authService.login(user);
    assert.ok(result.token, 'Token should be returned');
    assert.equal(result.user.username, 'admin');
    assert.equal(result.user.role, 'admin');

    // Verify token
    const payload = authService.verifyToken(result.token);
    assert.equal(payload.username, 'admin');
    assert.equal(payload.role, 'admin');
  });

  it('should reject invalid password', async () => {
    const user = await authService.validateUser('admin', 'wrong_password');
    assert.equal(user, null);
  });

  it('should create new users with custom roles and permissions', () => {
    const newUser = authService.createUser({
      username: 'editor_bob',
      displayName: 'Bob The Editor',
      password: 'password123',
      role: 'editor',
      permissions: ['view_media', 'edit_metadata'],
    });

    assert.ok(newUser);
    assert.equal(newUser.username, 'editor_bob');
    assert.equal(newUser.role, 'editor');
    assert.deepEqual(newUser.permissions, ['view_media', 'edit_metadata']);

    const userList = authService.listUsers();
    assert.ok(userList.some((u) => u.username === 'editor_bob'));
  });

  it('should assign default permissions when permissions are omitted', () => {
    const viewerUser = authService.createUser({
      username: 'viewer_alice',
      displayName: 'Alice Viewer',
      password: 'alicepassword',
      role: 'viewer',
    });

    assert.ok(viewerUser);
    assert.deepEqual(viewerUser.permissions, DEFAULT_ROLE_PERMISSIONS.viewer);
  });

  it('should update user roles and display name', () => {
    const user = dbService.getUserByUsername('editor_bob');
    const updated = authService.updateUser(user.id, {
      displayName: 'Bob The Senior Editor',
      role: 'editor',
      permissions: ['view_media', 'edit_metadata', 'manage_faces'],
    });

    assert.equal(updated.displayName, 'Bob The Senior Editor');
    assert.ok(updated.permissions.includes('manage_faces'));
  });

  it('should change user password after verifying current password', () => {
    const user = dbService.getUserByUsername('editor_bob');
    const changed = authService.changePassword(user.id, {
      currentPassword: 'password123',
      newPassword: 'newSecretPassword456',
    });
    assert.equal(changed, true);

    // Verify old password fails and new password works
    const oldCheck = authService.verifyPassword('password123', dbService.getUserById(user.id).password_hash, dbService.getUserById(user.id).password_salt);
    assert.equal(oldCheck, false);

    const newCheck = authService.verifyPassword('newSecretPassword456', dbService.getUserById(user.id).password_hash, dbService.getUserById(user.id).password_salt);
    assert.equal(newCheck, true);
  });

  it('should prevent deleting the last administrator account', () => {
    const admin = dbService.getUserByUsername('admin');
    assert.throws(() => {
      authService.deleteUser(admin.id, 'other_id');
    }, /Cannot delete the last remaining administrator account/);
  });

  it('should allow deleting non-admin users', () => {
    const bob = dbService.getUserByUsername('editor_bob');
    const deleted = authService.deleteUser(bob.id, 'some_admin_id');
    assert.equal(deleted, true);
    assert.equal(dbService.getUserByUsername('editor_bob'), null);
  });
});
