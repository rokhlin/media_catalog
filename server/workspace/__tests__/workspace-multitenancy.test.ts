import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { UserWorkspaceService } from '../user-workspace.service.js';
import { PathValidationGuard } from '../../auth/guards/path-validation.guard.js';
import { DatabaseService } from '../../database/database.service.js';
import { FamilyTreeDatabaseService } from '../../family-tree/family-tree-db.service.js';
import { AuthService } from '../../auth/auth.service.js';
import { AppConfigService } from '../../config/config.service.js';
import { ForbiddenException } from '@nestjs/common';

describe('Multi-Tenant Workspace & Security Isolation', () => {
  let tmpDir: string;
  let workspaceService: UserWorkspaceService;
  let guard: PathValidationGuard;
  let dbService: DatabaseService;
  let familyTreeDbService: FamilyTreeDatabaseService;
  let authService: AuthService;

  const userA = '11111111-1111-1111-1111-111111111111';
  const userB = '22222222-2222-2222-2222-222222222222';

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tenant_test_'));

    const configMock: any = {
      projectRoot: tmpDir,
      dbPath: path.join(tmpDir, 'main.db'),
      usersBaseDir: path.join(tmpDir, 'users'),
      inputFolders: [tmpDir],
      outputFolder: path.join(tmpDir, 'output'),
      supportedPhotoExts: new Set(['.jpg', '.png']),
      supportedVideoExts: new Set(['.mp4']),
    };

    workspaceService = new UserWorkspaceService(configMock as AppConfigService);
    guard = new PathValidationGuard(workspaceService);

    dbService = new DatabaseService(configMock as AppConfigService, workspaceService);
    dbService.initDb();

    familyTreeDbService = new FamilyTreeDatabaseService(configMock as AppConfigService, workspaceService);
    familyTreeDbService.initDb();

    authService = new AuthService(dbService, workspaceService);
  });

  after(() => {
    dbService.close();
    familyTreeDbService.close();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it('should initialize dynamic workspace directories for each tenant', () => {
    const wsA = workspaceService.initializeUserWorkspace(userA);
    assert.equal(wsA.userId, userA);
    assert.ok(fs.existsSync(wsA.rootDir), 'Root dir must exist');
    assert.ok(fs.existsSync(wsA.mediaDir), 'Media dir must exist');
    assert.ok(fs.existsSync(wsA.catalogDir), 'Catalog dir must exist');
    assert.ok(wsA.catalogDbPath.endsWith(path.join('.catalog', 'catalog_history.db')));
    assert.ok(wsA.familyTreeDbPath.endsWith(path.join('.catalog', 'family_tree.db')));

    const wsB = workspaceService.initializeUserWorkspace(userB);
    assert.notEqual(wsA.rootDir, wsB.rootDir, 'Workspaces must be distinct');
  });

  it('should validate paths inside workspace and reject paths outside workspace', () => {
    const wsA = workspaceService.getUserWorkspace(userA);
    const validPhoto = path.join(wsA.mediaDir, 'vacation.jpg');
    assert.equal(workspaceService.validatePathInWorkspace(userA, validPhoto), true);

    // Subfolder inside media
    const subfolderPhoto = path.join(wsA.mediaDir, '2026', 'summer', 'lake.jpg');
    assert.equal(workspaceService.validatePathInWorkspace(userA, subfolderPhoto), true);

    // Path inside another user's workspace
    const wsB = workspaceService.getUserWorkspace(userB);
    const userBPhoto = path.join(wsB.mediaDir, 'private.jpg');
    assert.equal(workspaceService.validatePathInWorkspace(userA, userBPhoto), false);

    // Directory traversal attempt
    const traversal = path.join(wsA.mediaDir, '..', '..', 'etc', 'passwd');
    assert.equal(workspaceService.validatePathInWorkspace(userA, traversal), false);
  });

  it('PathValidationGuard should allow requests strictly within authorized user workspace', () => {
    const wsA = workspaceService.getUserWorkspace(userA);
    const mockContext: any = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: { sub: userA, root_folder_path: wsA.rootDir },
          query: { path: path.join(wsA.mediaDir, 'pic.png') },
          body: {},
          params: {},
        }),
      }),
    };

    assert.equal(guard.canActivate(mockContext), true);
  });

  it('PathValidationGuard should throw 403 Forbidden on directory traversal attempts', () => {
    const wsA = workspaceService.getUserWorkspace(userA);
    const mockContext: any = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: { sub: userA, root_folder_path: wsA.rootDir },
          query: { path: '../../etc/shadow' },
          body: {},
          params: {},
        }),
      }),
    };

    assert.throws(
      () => guard.canActivate(mockContext),
      (err: any) => err instanceof ForbiddenException && err.message.includes('traversal')
    );
  });

  it('PathValidationGuard should throw 403 Forbidden when accessing another tenant workspace', () => {
    const wsA = workspaceService.getUserWorkspace(userA);
    const wsB = workspaceService.getUserWorkspace(userB);
    const mockContext: any = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: { sub: userA, root_folder_path: wsA.rootDir },
          query: { path: path.join(wsB.mediaDir, 'secret.jpg') },
          body: {},
          params: {},
        }),
      }),
    };

    assert.throws(
      () => guard.canActivate(mockContext),
      (err: any) => err instanceof ForbiddenException && err.message.includes('outside the authorized user workspace')
    );
  });

  it('AuthService should bind root_folder_path in JWT token payload', async () => {
    const user = await authService.validateUser('admin', 'admin');
    assert.ok(user);
    const loginResult = await authService.login(user);
    assert.ok(loginResult.token);
    assert.ok(loginResult.user.root_folder_path);

    const payload = authService.verifyToken(loginResult.token);
    assert.ok(payload.root_folder_path);
    assert.equal(payload.root_folder_path, loginResult.user.root_folder_path);
  });

  it('DatabaseService should isolate databases per tenant', () => {
    const dbA = dbService.getUserDb(userA);
    const dbB = dbService.getUserDb(userB);

    assert.notEqual(dbA, dbB, 'Database instances must be separate');

    // Insert sync record into Tenant A
    dbA.prepare(`
      INSERT INTO sync_history (file_path, file_size, mtime, status)
      VALUES (?, ?, ?, ?)
    `).run('/app/storage/users/userA/media/img1.jpg', 1024, 1789500000, 'success');

    const rowsA = dbA.prepare('SELECT count(*) as count FROM sync_history').get() as { count: number };
    const rowsB = dbB.prepare('SELECT count(*) as count FROM sync_history').get() as { count: number };

    assert.equal(rowsA.count, 1);
    assert.equal(rowsB.count, 0, 'Tenant B DB must not see Tenant A records');
  });

  it('FamilyTreeDbService should isolate genealogical trees per tenant', () => {
    const ftDbA = familyTreeDbService.getUserDb(userA);
    const ftDbB = familyTreeDbService.getUserDb(userB);

    assert.notEqual(ftDbA, ftDbB, 'Family tree databases must be separate');

    // Insert person into Tenant A
    ftDbA.prepare(`
      INSERT INTO ft_persons (id, tree_id, first_name, last_name, gender)
      VALUES (?, ?, ?, ?, ?)
    `).run('person_1', 'default_tree', 'Alice', 'Smith', 'F');

    const personsA = ftDbA.prepare('SELECT count(*) as count FROM ft_persons').get() as { count: number };
    const personsB = ftDbB.prepare('SELECT count(*) as count FROM ft_persons').get() as { count: number };

    assert.equal(personsA.count, 1);
    assert.equal(personsB.count, 0, 'Tenant B family tree must not see Tenant A persons');
  });
});
