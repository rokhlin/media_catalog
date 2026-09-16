import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { VaultStatus } from '../models/auth';
import { useAuth } from './authContext';

interface VaultContextValue {
  vaultStatus: VaultStatus | null;
  vaultToken: string | null;
  isUnlocked: boolean;
  isConfigured: boolean;
  isLoading: boolean;
  unlockedUntil: number | null;
  remainingSeconds: number;
  fetchVaultStatus: () => Promise<VaultStatus | null>;
  setupVault: (pin: string, vaultFolder?: string, autoLockMinutes?: number) => Promise<{ success: boolean; error?: string }>;
  unlockVault: (pin: string) => Promise<{ success: boolean; error?: string }>;
  lockVault: () => Promise<void>;
  addVaultItem: (filePath: string, notes?: string) => Promise<boolean>;
  removeVaultItem: (filePath: string) => Promise<boolean>;
  vaultFetch: (url: string, init?: RequestInit) => Promise<Response>;
}

const VAULT_SESSION_KEY = 'media_cataloger_vault_session';

const VaultContext = createContext<VaultContextValue | null>(null);

export const VaultProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { authFetch } = useAuth();
  const [vaultToken, setVaultToken] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(VAULT_SESSION_KEY);
    } catch {
      return null;
    }
  });

  const [vaultStatus, setVaultStatus] = useState<VaultStatus | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
  const timerRef = useRef<any>(null);

  // Vault authenticated fetch
  const vaultFetch = useCallback(
    async (url: string, init: RequestInit = {}): Promise<Response> => {
      const headers = new Headers(init.headers || {});
      if (vaultToken) {
        headers.set('x-vault-token', vaultToken);
      }
      return authFetch(url, {
        ...init,
        headers,
      });
    },
    [authFetch, vaultToken]
  );

  const fetchVaultStatus = useCallback(async (): Promise<VaultStatus | null> => {
    try {
      const headers: Record<string, string> = {};
      if (vaultToken) {
        headers['x-vault-token'] = vaultToken;
      }
      const res = await authFetch('/api/vault/status', { headers });
      if (res.ok) {
        const status: VaultStatus = await res.json();
        setVaultStatus(status);
        if (!status.isUnlocked && vaultToken) {
          // Token expired on server
          setVaultToken(null);
          try {
            sessionStorage.removeItem(VAULT_SESSION_KEY);
          } catch {}
        }
        return status;
      }
    } catch (err) {
      console.warn('Failed to fetch vault status:', err);
    } finally {
      setIsLoading(false);
    }
    return null;
  }, [authFetch, vaultToken]);

  useEffect(() => {
    fetchVaultStatus();
  }, [fetchVaultStatus]);

  // Handle countdown timer for auto-lock
  useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (vaultStatus?.isUnlocked && vaultStatus.unlockedUntil) {
      const updateCountdown = () => {
        const now = Date.now();
        const diffMs = (vaultStatus.unlockedUntil || 0) - now;
        if (diffMs <= 0) {
          setRemainingSeconds(0);
          setVaultToken(null);
          try {
            sessionStorage.removeItem(VAULT_SESSION_KEY);
          } catch {}
          setVaultStatus((prev) => (prev ? { ...prev, isUnlocked: false, unlockedUntil: null } : null));
          if (timerRef.current) clearInterval(timerRef.current);
        } else {
          setRemainingSeconds(Math.ceil(diffMs / 1000));
        }
      };

      updateCountdown();
      timerRef.current = setInterval(updateCountdown, 1000);
    } else {
      setRemainingSeconds(0);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [vaultStatus?.isUnlocked, vaultStatus?.unlockedUntil]);

  const setupVault = useCallback(
    async (pin: string, vaultFolder?: string, autoLockMinutes = 15): Promise<{ success: boolean; error?: string }> => {
      try {
        const res = await authFetch('/api/vault/setup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin, vaultFolder, autoLockMinutes }),
        });
        const data = await res.json();
        if (!res.ok) {
          return { success: false, error: data.message || 'Failed to initialize vault' };
        }
        setVaultStatus(data);
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message || 'Network error during vault setup' };
      }
    },
    [authFetch]
  );

  const unlockVault = useCallback(
    async (pin: string): Promise<{ success: boolean; error?: string }> => {
      try {
        const res = await authFetch('/api/vault/unlock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin }),
        });
        const data = await res.json();
        if (!res.ok) {
          return { success: false, error: data.message || 'Incorrect PIN or Passphrase' };
        }

        const token = data.sessionToken;
        setVaultToken(token);
        try {
          sessionStorage.setItem(VAULT_SESSION_KEY, token);
        } catch {}

        await fetchVaultStatus();
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message || 'Network error unlocking vault' };
      }
    },
    [authFetch, fetchVaultStatus]
  );

  const lockVault = useCallback(async () => {
    try {
      if (vaultToken) {
        await authFetch('/api/vault/lock', {
          method: 'POST',
          headers: { 'x-vault-token': vaultToken },
        }).catch(() => {});
      }
    } finally {
      setVaultToken(null);
      try {
        sessionStorage.removeItem(VAULT_SESSION_KEY);
      } catch {}
      setVaultStatus((prev) => (prev ? { ...prev, isUnlocked: false, unlockedUntil: null } : null));
    }
  }, [authFetch, vaultToken]);

  const addVaultItem = useCallback(
    async (filePath: string, notes?: string): Promise<boolean> => {
      try {
        const res = await vaultFetch('/api/vault/items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filePath, notes }),
        });
        if (res.ok) {
          fetchVaultStatus();
          return true;
        }
        return false;
      } catch {
        return false;
      }
    },
    [vaultFetch, fetchVaultStatus]
  );

  const removeVaultItem = useCallback(
    async (filePath: string): Promise<boolean> => {
      try {
        const res = await vaultFetch(`/api/vault/items?file=${encodeURIComponent(filePath)}`, {
          method: 'DELETE',
        });
        if (res.ok) {
          fetchVaultStatus();
          return true;
        }
        return false;
      } catch {
        return false;
      }
    },
    [vaultFetch, fetchVaultStatus]
  );

  const isUnlocked = Boolean(vaultStatus?.isUnlocked);
  const isConfigured = Boolean(vaultStatus?.isConfigured);

  const value = useMemo<VaultContextValue>(
    () => ({
      vaultStatus,
      vaultToken,
      isUnlocked,
      isConfigured,
      isLoading,
      unlockedUntil: vaultStatus?.unlockedUntil || null,
      remainingSeconds,
      fetchVaultStatus,
      setupVault,
      unlockVault,
      lockVault,
      addVaultItem,
      removeVaultItem,
      vaultFetch,
    }),
    [
      vaultStatus,
      vaultToken,
      isUnlocked,
      isConfigured,
      isLoading,
      remainingSeconds,
      fetchVaultStatus,
      setupVault,
      unlockVault,
      lockVault,
      addVaultItem,
      removeVaultItem,
      vaultFetch,
    ]
  );

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
};

export function useVault(): VaultContextValue {
  const context = useContext(VaultContext);
  if (!context) {
    throw new Error('useVault must be used within a VaultProvider');
  }
  return context;
}
