export type UserRole = 'admin' | 'editor' | 'viewer';

export type Permission =
  | 'view_media'
  | 'edit_metadata'
  | 'manage_faces'
  | 'admin_panel'
  | 'vault_access'
  | 'manage_users';

export interface User {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  permissions: Permission[];
  createdAt?: string;
  updatedAt?: string;
}

export interface AuthSession {
  token: string;
  user: User;
}

export interface VaultStatus {
  isConfigured: boolean;
  isUnlocked: boolean;
  isEnabled: boolean;
  vaultFolder: string | null;
  autoLockMinutes: number;
  unlockedUntil: number | null;
  itemsCount: number;
}
