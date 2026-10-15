import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { DatabaseService } from '../../database/database.service.js';
import { AuthService } from '../auth.service.js';
import { AppConfigService } from '../../config/config.service.js';
import { SettingsService } from '../../settings/settings.service.js';

describe('User Profile, Video Avatar & Storage Telemetry', () => {
  let tmpDir: string;
  let dbService: DatabaseService;
  let authService: AuthService;
  let configService: AppConfigService;
  let settingsService: SettingsService;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'profile_test_'));
    const configMock: any = {
      dbPath: path.join(tmpDir, 'test_profile.db'),
      projectRoot: tmpDir,
      inputFolders: [tmpDir],
      outputFolder: path.join(tmpDir, 'output'),
      supportedPhotoExts: new Set(['.jpg', '.png']),
      supportedVideoExts: new Set(['.mp4']),
      getSavedSettings: () => ({}),
      isDev: true,
      geminiApiKeyMasked: '',
      geminiApiKey: '',
      geminiRpmLimit: 15,
      visionPromptTemplate: 'test prompt',
      usersBaseDir: path.join(tmpDir, 'storage', 'users'),
      localApiBase: 'http://localhost:1234/v1',
    };

    configService = configMock as AppConfigService;
    dbService = new DatabaseService(configService);
    dbService.initDb();
    authService = new AuthService(dbService);
    settingsService = new SettingsService(configService, dbService);
  });

  after(() => {
    dbService.close();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it('should support updating user profile with email, avatarUrl, avatarType, and video URL', () => {
    const admin = dbService.getUserByUsername('admin');
    assert.ok(admin);

    const updated = authService.updateProfile(admin.id, {
      displayName: 'Anton SuperAdmin',
      email: 'admin@mydomain.org',
      avatarUrl: 'https://example.com/photo.png',
      avatarType: 'video',
      avatarVideoUrl: '/api/auth/avatar-video/avatar_123.mp4',
    });

    assert.equal(updated.displayName, 'Anton SuperAdmin');
    assert.equal(updated.email, 'admin@mydomain.org');
    assert.equal(updated.avatarUrl, 'https://example.com/photo.png');
    assert.equal(updated.avatarType, 'video');
    assert.equal(updated.avatarVideoUrl, '/api/auth/avatar-video/avatar_123.mp4');

    // Verify persisted in DB
    const persisted = dbService.getUserById(admin.id);
    assert.equal(persisted.email, 'admin@mydomain.org');
    assert.equal(persisted.avatar_url, 'https://example.com/photo.png');
    assert.equal(persisted.avatar_type, 'video');
    assert.equal(persisted.avatar_video_url, '/api/auth/avatar-video/avatar_123.mp4');
  });

  it('should save and stream avatar video file', () => {
    const fakeBuffer = Buffer.from('FAKE_MP4_VIDEO_BYTES_2026');
    const filename = authService.saveAvatarVideo('admin_user', fakeBuffer, 'clip.mp4');
    assert.ok(filename.startsWith('avatar_admin_user_'));
    assert.ok(filename.endsWith('.mp4'));

    const savedFile = path.resolve(process.cwd(), 'storage', 'avatars', filename);
    assert.ok(fs.existsSync(savedFile));
    assert.equal(fs.readFileSync(savedFile).toString(), 'FAKE_MP4_VIDEO_BYTES_2026');

    // Clean up
    try {
      fs.unlinkSync(savedFile);
    } catch {}
  });

  it('should return storage telemetry including disk, quota, and breakdown', () => {
    // Insert dummy media items to verify breakdown
    const db = dbService.getDb();
    db.prepare(`
      INSERT INTO media_items (id, file_path, file_name, media_type, file_size, status)
      VALUES 
        ('m1', 'photo1.jpg', 'photo1.jpg', 'photo', 1048576, 'PROCESSED'),
        ('m2', 'photo2.png', 'photo2.png', 'image', 2097152, 'PROCESSED'),
        ('m3', 'video1.mp4', 'video1.mp4', 'video', 10485760, 'PROCESSED')
    `).run();

    const telemetry = settingsService.getStorageTelemetry();
    assert.ok(telemetry.disk);
    assert.ok(telemetry.disk.total > 0);
    assert.ok(telemetry.disk.free > 0);
    assert.ok(telemetry.breakdown);
    assert.equal(telemetry.breakdown.photos.count, 2);
    assert.equal(telemetry.breakdown.photos.bytes, 1048576 + 2097152);
    assert.equal(telemetry.breakdown.videos.count, 1);
    assert.equal(telemetry.breakdown.videos.bytes, 10485760);
    assert.ok(telemetry.breakdown.totalMediaBytes > 0);
  });
});
