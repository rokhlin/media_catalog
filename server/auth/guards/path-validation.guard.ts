import { Injectable, CanActivate, ExecutionContext, ForbiddenException, Inject, Optional } from '@nestjs/common';
import { UserWorkspaceService } from '../../workspace/user-workspace.service.js';
import { AuthService } from '../auth.service.js';

@Injectable()
export class PathValidationGuard implements CanActivate {
  constructor(
    @Inject(UserWorkspaceService) private readonly workspaceService: UserWorkspaceService,
    @Optional() @Inject(AuthService) private readonly authService?: AuthService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    let user = request.user;

    // If user not yet resolved on request, attempt token resolution if AuthService available
    if (!user && this.authService) {
      const authHeader = request.headers?.authorization;
      let token: string | null = null;
      if (authHeader && typeof authHeader === 'string') {
        const [type, t] = authHeader.split(' ');
        if (type === 'Bearer' && t) token = t;
      }
      if (!token && request.query?.token && typeof request.query.token === 'string') {
        token = request.query.token;
      }
      if (token) {
        try {
          user = this.authService.verifyToken(token);
          request.user = user;
        } catch {
          // invalid token will be handled by auth guard if required
        }
      }
    }

    // Extract all potential path properties from body, params, and query
    const candidates: string[] = [];

    const checkObject = (obj: any) => {
      if (!obj || typeof obj !== 'object') return;
      const keysToCheck = [
        'path', 'filePath', 'file_path', 'targetPath', 'target_path',
        'folder', 'inputFolder', 'outputFolder', 'file', 'filename',
        'sourcePath', 'destinationPath', 'mediaPath'
      ];
      for (const key of keysToCheck) {
        if (obj[key] && typeof obj[key] === 'string') {
          candidates.push(obj[key]);
        }
      }
      // If folders or files array passed
      const arrayKeys = ['files', 'folders', 'input_folders', 'target_folders'];
      for (const arrKey of arrayKeys) {
        if (Array.isArray(obj[arrKey])) {
          for (const item of obj[arrKey]) {
            if (typeof item === 'string') candidates.push(item);
            else if (item && typeof item === 'object') {
              if (item.file_path) candidates.push(item.file_path);
              if (item.filePath) candidates.push(item.filePath);
              if (item.path) candidates.push(item.path);
            }
          }
        }
      }
    };

    checkObject(request.params);
    checkObject(request.query);
    checkObject(request.body);

    for (const candidate of candidates) {
      // Basic traversal check: directory traversal with .. is always forbidden
      if (candidate.includes('..')) {
        throw new ForbiddenException(
          `Access denied: Path traversal ('..') detected in path '${candidate}'.`
        );
      }

      // If request has authenticated user context
      if (user && user.sub) {
        // Skip relative non-traversal simple filenames e.g. "photo.jpg"
        if (!candidate.includes('/') && !candidate.includes('\\')) {
          continue;
        }
        const userId = user.sub;
        const customRoot = user.root_folder_path || user.rootPath;
        const isValid = this.workspaceService.validatePathInWorkspace(userId, candidate, customRoot);
        if (!isValid) {
          throw new ForbiddenException(
            `Access denied: Path '${candidate}' is outside the authorized user workspace.`
          );
        }
      }
    }

    return true;
  }
}
