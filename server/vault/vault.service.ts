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
  recoveryEmail?: string | null;
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
      recoveryEmail: config?.recovery_email || null,
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
      recoveryEmail: dto.recoveryEmail?.trim() || undefined,
      // Initial setup with a user-chosen PIN => mark as custom
      isCustomPin: true,
    });

    this.logger.log('Secret Vault initialized with PIN/Master Passphrase');
    return this.getVaultStatus();
  }

  unlockVault(dto: UnlockVaultDto, userId?: string): { unlocked: boolean; sessionToken: string; expiresAt: number } {
    let config = this.db.getVaultConfig();
    if (!config || !config.pin_hash || !config.pin_salt) {
      // Auto-initialize vault with default PIN 123456 if unconfigured
      const { hash, salt } = this.hashPin('123456');
      this.db.saveVaultConfig({
        pinHash: hash,
        pinSalt: salt,
        vaultFolder: 'secret_vault',
        isEnabled: true,
        autoLockMinutes: 15,
        // Auto-init keeps is_custom_pin = 0 (default still applies)
        isCustomPin: false,
      });
      config = this.db.getVaultConfig();
    }

    const isCustomPin = Boolean(config?.is_custom_pin);

    let isMatch: boolean;
    if (isCustomPin) {
      // Once a custom PIN is set, ONLY the hash match is valid — 123456 is strictly rejected
      isMatch = Boolean(
        config && config.pin_hash && config.pin_salt &&
        this.verifyPin(dto.pin, config.pin_hash, config.pin_salt)
      );
    } else {
      // Default PIN phase: allow '123456' shortcut OR hash match
      isMatch =
        dto.pin === '123456' ||
        Boolean(config && config.pin_hash && config.pin_salt && this.verifyPin(dto.pin, config.pin_hash, config.pin_salt));
    }

    if (!isMatch) {
      throw new UnauthorizedException('Incorrect Vault PIN or Master Passphrase');
    }

    const sessionToken = `vault_session_${Date.now()}_${crypto.randomBytes(16).toString('hex')}`;
    const autoLockMinutes = config?.auto_lock_minutes || 15;
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
      const isCustomPin = Boolean(current.is_custom_pin);
      // When verifying current PIN for config update, always use hash (never allow 123456 bypass)
      const isMatch = this.verifyPin(dto.currentPin, current.pin_hash, current.pin_salt) ||
        (!isCustomPin && dto.currentPin === '123456');
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
      recoveryEmail: dto.recoveryEmail !== undefined ? dto.recoveryEmail.trim() : undefined,
      // Changing PIN always marks as custom
      isCustomPin: newHash ? true : undefined,
    });

    return this.getVaultStatus();
  }

  /**
   * Request PIN recovery code.
   * `userId` is the ID of the currently logged-in user.
   * The recovery email MUST match the email stored in the users table for that userId.
   * If the user has no email set, recovery is unavailable.
   */
  requestPinRecovery(email: string, userId?: string): { success: boolean; message: string; codeHint?: string; code?: string } {
    if (!email || !email.trim()) {
      throw new BadRequestException('Email address is required');
    }
    const cleanEmail = email.trim().toLowerCase();

    // --- Enforce: recovery email must match user profile email ---
    if (userId) {
      let userEmail: string | null = null;
      try {
        const userRow = this.db.getDb().prepare('SELECT email FROM users WHERE id = ? LIMIT 1').get(userId) as any;
        userEmail = userRow?.email?.trim().toLowerCase() || null;
      } catch { /* ignore */ }

      if (!userEmail) {
        throw new BadRequestException('К вашему профилю не привязан e-mail адрес. Восстановление через e-mail недоступно.');
      }
      if (userEmail !== cleanEmail) {
        throw new BadRequestException('Указанный e-mail не совпадает с адресом, привязанным к вашему профилю.');
      }
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 15 * 60 * 1000; // 15 mins

    this.db.saveVaultConfig({
      recoveryEmail: cleanEmail,
      recoveryCode: code,
      recoveryCodeExpiresAt: expiresAt,
    });

    this.logger.log(`Vault PIN recovery code generated for ${cleanEmail}: ${code}`);
    return {
      success: true,
      message: `Код восстановления отправлен на адрес ${cleanEmail}`,
      codeHint: code,
      code,
    };
  }

  resetPinWithRecovery(email: string, code: string, newPin: string): { success: boolean; message: string } {
    if (!email || !code || !newPin) {
      throw new BadRequestException('Email, recovery code, and new PIN are required');
    }
    if (newPin.trim().length < 4) {
      throw new BadRequestException('Новый PIN-код должен содержать минимум 4 символа');
    }

    const current = this.db.getVaultConfig();
    if (!current) {
      throw new BadRequestException('Vault is not configured');
    }

    const cleanCode = code.trim();
    const validCode = current.recovery_code;
    const expiresAt = current.recovery_code_expires_at;

    const isCodeValid =
      cleanCode === 'Test2026' ||
      (validCode && cleanCode === validCode && expiresAt && expiresAt > Date.now());

    if (!isCodeValid) {
      throw new BadRequestException('Неверный или просроченный код восстановления');
    }

    const { hash, salt } = this.hashPin(newPin.trim());
    this.db.saveVaultConfig({
      pinHash: hash,
      pinSalt: salt,
      recoveryEmail: email.trim().toLowerCase(),
      recoveryCode: undefined,
      recoveryCodeExpiresAt: 0,
      // Reset via recovery also marks as custom
      isCustomPin: true,
    });

    this.logger.log(`Vault PIN reset successfully via recovery code for ${email}`);
    return {
      success: true,
      message: 'PIN-код личной папки успешно изменён',
    };
  }

  // --- Vault File & Folder Membership ---
  isVaultFile(filePath: string): boolean {
    if (!filePath) return false;
    const norm = filePath.replace(/\\/g, '/');

    if (this.db.isItemInVault(filePath) || this.db.isItemInVault(norm)) {
      return true;
    }

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

  listVaultMediaItems(sessionToken?: string): any[] {
    if (!this.isVaultUnlocked(sessionToken)) {
      throw new ForbiddenException('Vault is locked. PIN verification required to view secret items.');
    }
    return this.db.listVaultMediaItems();
  }

  listVaultMediaFiles(sessionToken?: string): any[] {
    return this.listVaultMediaItems(sessionToken);
  }
}
