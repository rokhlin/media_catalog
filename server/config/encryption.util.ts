import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const PREFIX = 'enc:v1:';

/**
 * Derive a 32-byte key from app secrets using scrypt.
 */
function getDerivedKey(customSecret?: string): Buffer {
  const secret =
    customSecret ||
    process.env.APP_SECRET_KEY ||
    process.env.JWT_SECRET ||
    'media_cataloger_secure_vault_secret_2026';
  const salt = process.env.ENCRYPTION_SALT || 'media_cataloger_salt_v1';
  return crypto.scryptSync(secret, salt, 32);
}

/**
 * Encrypt a plaintext secret using AES-256-GCM.
 * Returns formatted string: "enc:v1:<iv_hex>:<authTag_hex>:<ciphertext_hex>"
 */
export function encryptSecret(plaintext: string, customSecret?: string): string {
  if (!plaintext || typeof plaintext !== 'string') {
    return '';
  }
  const trimmed = plaintext.trim();
  if (!trimmed) {
    return '';
  }
  // If already encrypted, do not double-encrypt
  if (trimmed.startsWith(PREFIX)) {
    return trimmed;
  }

  const key = getDerivedKey(customSecret);
  const iv = crypto.randomBytes(12); // 96-bit IV recommended for GCM
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(trimmed, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return `${PREFIX}${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypt an AES-256-GCM encrypted string.
 * Gracefully returns original string if not in "enc:v1:" format (backward compatibility).
 */
export function decryptSecret(ciphertext: string, customSecret?: string): string {
  if (!ciphertext || typeof ciphertext !== 'string') {
    return '';
  }
  const trimmed = ciphertext.trim();
  if (!trimmed.startsWith(PREFIX)) {
    // Unencrypted legacy key
    return trimmed;
  }

  try {
    const parts = trimmed.slice(PREFIX.length).split(':');
    if (parts.length !== 3) {
      return '';
    }
    const [ivHex, authTagHex, encryptedHex] = parts;
    const key = getDerivedKey(customSecret);
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err: any) {
    console.error('[EncryptionUtil] Failed to decrypt secret:', err.message);
    return '';
  }
}

/**
 * Mask a secret string for safe display in UI or logs.
 * Example: "AIzaSyD...1234" -> "AIza••••••••1234"
 */
export function maskSecret(secret: string): string {
  if (!secret || typeof secret !== 'string') {
    return '';
  }
  const raw = decryptSecret(secret);
  if (!raw) return '';
  if (raw.length <= 8) {
    return '••••••••';
  }
  const start = raw.slice(0, 4);
  const end = raw.slice(-4);
  return `${start}••••••••••••••••${end}`;
}

/**
 * Scrub sensitive API keys and tokens from error messages or URLs.
 */
export function sanitizeErrorString(errMsg: string): string {
  if (!errMsg || typeof errMsg !== 'string') return '';
  return errMsg
    .replace(/AIza[0-9A-Za-z-_]+/g, 'AIza[REDACTED]')
    .replace(/(key=)[a-zA-Z0-9_-]+/gi, '$1[REDACTED]')
    .replace(/(token=)[a-zA-Z0-9_-]+/gi, '$1[REDACTED]');
}
