import { Injectable, Logger, Inject } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';
import { AppConfigService } from '../config/config.service.js';

export interface UserWorkspace {
  userId: string;
  rootDir: string;
  rootPath: string;
  mediaDir: string;
  catalogDir: string;
  catalogDbPath: string;
  familyTreeDbPath: string;
  facesDir: string;
}

@Injectable()
export class UserWorkspaceService {
  private readonly logger = new Logger(UserWorkspaceService.name);

  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  /**
   * Resolves the base root directory for a given user.
   */
  public getUserRootDir(userId: string, customRoot?: string): string {
    if (customRoot && customRoot.trim()) {
      const trimmed = customRoot.trim();
      const normTrimmed = trimmed.replace(/\\/g, '/').toLowerCase();
      const normUserId = userId.toLowerCase();
      if (normTrimmed.endsWith('/' + normUserId) || normTrimmed === normUserId) {
        return path.resolve(trimmed);
      }
      return path.resolve(trimmed, userId);
    }
    return path.resolve(this.config.usersBaseDir, userId);
  }

  /**
   * Initializes and ensures all user workspace directories exist.
   */
  public initializeUserWorkspace(userId: string, customRoot?: string): UserWorkspace {
    const rootDir = this.getUserRootDir(userId, customRoot);
    const mediaDir = path.join(rootDir, 'media');
    const catalogDir = path.join(rootDir, '.catalog');
    const facesDir = path.join(catalogDir, 'facess');
    const catalogDbPath = path.join(catalogDir, 'catalog_history.db');
    const familyTreeDbPath = path.join(catalogDir, 'family_tree.db');

    try {
      if (!fs.existsSync(rootDir)) fs.mkdirSync(rootDir, { recursive: true });
      if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir, { recursive: true });
      if (!fs.existsSync(catalogDir)) fs.mkdirSync(catalogDir, { recursive: true });
      if (!fs.existsSync(facesDir)) fs.mkdirSync(facesDir, { recursive: true });
    } catch (err) {
      this.logger.error(`Failed to create workspace folders for user ${userId}: ${err}`);
    }

    return {
      userId,
      rootDir,
      rootPath: rootDir,
      mediaDir,
      catalogDir,
      catalogDbPath,
      familyTreeDbPath,
      facesDir,
    };
  }

  /**
   * Get workspace info (alias for initializeUserWorkspace)
   */
  public getUserWorkspace(userId: string, customRoot?: string): UserWorkspace {
    return this.initializeUserWorkspace(userId, customRoot);
  }

  /**
   * Validates that a requested target path stays strictly inside the user's workspace root.
   * Protects against ../ traversal, absolute foreign path injection, and escaping symlinks.
   */
  public validatePathInWorkspace(userId: string, targetPath: string, customRoot?: string): boolean {
    if (!targetPath || !targetPath.trim()) return false;
    const rootDir = path.resolve(this.getUserRootDir(userId, customRoot));
    const resolvedTarget = path.resolve(rootDir, targetPath.trim());

    // Normalize paths for comparison (case-insensitive on Windows)
    const normRoot = process.platform === 'win32' ? rootDir.toLowerCase() : rootDir;
    const normTarget = process.platform === 'win32' ? resolvedTarget.toLowerCase() : resolvedTarget;

    if (normTarget === normRoot) {
      return true;
    }

    const relative = path.relative(normRoot, normTarget);
    return !relative.startsWith('..') && !path.isAbsolute(relative);
  }
}
