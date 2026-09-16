import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
  Logger,
  Inject,
} from '@nestjs/common';
import * as crypto from 'crypto';
import * as path from 'path';
import { DatabaseService } from '../database/database.service.js';
import { SetupVaultDto, UnlockVaultDto, UpdateVaultConfigDto } from './dto/vault.dto.js';

export interface VaultStatus {
  isConfigured: boolean;
  isUnlocked: boolean;
  isEnabled: boolean;
  vaultFolder: string | null;
  autoLockMinutes: number;
  unlockedUntil: number | null;
  itemsCount: number;
}

interface VaultSession {
  token: string;
  expiresAt: number;
  userId?: string;
}

@Injectable()
export class VaultService {
  private readonly logger = new Logger(VaultService.name);
  private activeSessions: Map<string, VaultSession> = new Map();

  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  private hashPin(pin: string, existingSalt?: string): { hash: string; salt: string } {
    const salt = existingSalt || crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(pin, salt, 10000, 64, 'sha512').toString('hex');
    return { hash, salt };
  }

  private verifyPin(pin: string, hash: string, salt: string): boolean {
    const computed = crypto.pbkdf2Sync(pin, salt, 10000, 64, 'sha512').toString('hex');
    return crypto.timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(hash, 'hex'));
  }

  private cleanExpiredSessions(): void {
    const now = Date.now();
    for (const [token, session] of this.activeSessions.entries()) {
      if (session.expiresAt <= now) {
        this.activeSessions.delete(token);
      }
    }
  }

  isVaultUnlocked(sessionToken?: string): boolean {
    if (!sessionToken) return false;
    this.cleanExpiredSessions();
    const session = this.activeSessions.get(sessionToken);
    if (!session) return false;
    if (session.expiresAt <= Date.now()) {
      this.activeSessions.delete(sessionToken);
      return false;
    }
    return true;
  }

  getVaultStatus(sessionToken?: string): VaultStatus {
    this.cleanExpiredSessions();
    const config = this.db.getVaultConfig();
    const isConfigured = Boolean(config && config.pin_hash);
    const isUnlocked = this.isVaultUnlocked(sessionToken);
    const session = sessionToken ? this.activeSessions.get(sessionToken) : undefined;
    const items = this.db.listVaultItems();

    return {
      isConfigured,
      isUnlocked,
      isEnabled: config ? Boolean(config.is_enabled) : true,
      vaultFolder: config?.vault_folder || null,
      autoLockMinutes: config?.auto_lock_minutes || 15,
      unlockedUntil: isUnlocked && session ? session.expiresAt : null,
      itemsCount: items.length,
    };
  }

  setupVault(dto: SetupVaultDto): VaultStatus {
    const current = this.db.getVaultConfig();
    if (current && current.pin_hash) {
      throw new BadRequestException('Vault is already configured. Use update configuration or unlock first.');
    }

    const { hash, salt } = this.hashPin(dto.pin);
    this.db.saveVaultConfig({
      pinHash: hash,
      pinSalt: salt,
      vaultFolder: dto.vaultFolder?.trim() || undefined,
      isEnabled: true,
      autoLockMinutes: dto.autoLockMinutes || 15,
    });

    this.logger.log('Secret Vault initialized with PIN/Master Passphrase');
    return this.getVaultStatus();
  }

  unlockVault(dto: UnlockVaultDto, userId?: string): { unlocked: boolean; sessionToken: string; expiresAt: number } {
    const config = this.db.getVaultConfig();
    if (!config || !config.pin_hash || !config.pin_salt) {
      throw new BadRequestException('Vault is not yet configured. Please set up a PIN first.');
    }

    const isMatch = this.verifyPin(dto.pin, config.pin_hash, config.pin_salt);
    if (!isMatch) {
      throw new UnauthorizedException('Incorrect Vault PIN or Master Passphrase');
    }

    const sessionToken = `vault_session_${Date.now()}_${crypto.randomBytes(16).toString('hex')}`;
    const autoLockMinutes = config.auto_lock_minutes || 15;
    const expiresAt = Date.now() + autoLockMinutes * 60 * 1000;

    this.activeSessions.set(sessionToken, {
      token: sessionToken,
      expiresAt,
      userId,
    });

    this.logger.log(`Vault unlocked successfully (session active for ${autoLockMinutes}m)`);
    return {
      unlocked: true,
      sessionToken,
      expiresAt,
    };
  }

  lockVault(sessionToken?: string): boolean {
    if (sessionToken) {
      this.activeSessions.delete(sessionToken);
    } else {
      this.activeSessions.clear();
    }
    this.logger.log('Vault locked');
    return true;
  }

  updateConfig(dto: UpdateVaultConfigDto): VaultStatus {
    const current = this.db.getVaultConfig();
    if (current && current.pin_hash) {
      if (!dto.currentPin) {
        throw new BadRequestException('Current PIN is required to modify vault settings');
      }
      const isMatch = this.verifyPin(dto.currentPin, current.pin_hash, current.pin_salt);
      if (!isMatch) {
        throw new UnauthorizedException('Current PIN is incorrect');
      }
    }

    let newHash: string | undefined;
    let newSalt: string | undefined;

    if (dto.newPin && dto.newPin.trim().length >= 4) {
      const hashed = this.hashPin(dto.newPin.trim());
      newHash = hashed.hash;
      newSalt = hashed.salt;
    }

    this.db.saveVaultConfig({
      pinHash: newHash,
      pinSalt: newSalt,
      vaultFolder: dto.vaultFolder !== undefined ? dto.vaultFolder.trim() : undefined,
      isEnabled: dto.isEnabled,
      autoLockMinutes: dto.autoLockMinutes,
    });

    return this.getVaultStatus();
  }

  // --- Vault File & Folder Membership ---
  isVaultFile(filePath: string): boolean {
    if (!filePath) return false;
    const norm = filePath.replace(/\\/g, '/');

    // 1. Direct item match in SQLite vault_items / media_items.is_vault
    if (this.db.isItemInVault(filePath) || this.db.isItemInVault(norm)) {
      return true;
    }

    // 2. Vault folder match
    const config = this.db.getVaultConfig();
    const vaultFolder = config?.vault_folder;
    if (vaultFolder && vaultFolder.trim()) {
      const normFolder = vaultFolder.replace(/\\/g, '/').toLowerCase();
      const normPathLower = norm.toLowerCase();
      if (
        normPathLower.includes(`/${normFolder}/`) ||
        normPathLower.startsWith(`${normFolder}/`) ||
        normPathLower.endsWith(`/${normFolder}`) ||
        path.basename(path.dirname(norm)).toLowerCase() === normFolder
      ) {
        return true;
      }
    }

    // 3. Built-in special names (e.g. .vault, /vault/)
    const pathParts = norm.toLowerCase().split('/');
    if (pathParts.some((p) => p === '.vault' || p === 'vault' || p === '_vault')) {
      return true;
    }

    return false;
  }

  addVaultItem(filePath: string, notes?: string): boolean {
    return this.db.addVaultItem(filePath, notes);
  }

  removeVaultItem(filePath: string): boolean {
    return this.db.removeVaultItem(filePath);
  }

  listVaultFiles(sessionToken?: string): string[] {
    if (!this.isVaultUnlocked(sessionToken)) {
      throw new ForbiddenException('Vault is locked. PIN verification required to view secret items.');
    }
    return this.db.listVaultItems();
  }
}
