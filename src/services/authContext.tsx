import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import type { User, UserRole, Permission } from '../models/auth';

interface AuthContextValue {
  currentUser: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isAdmin: boolean;
  canEdit: boolean;
  canManageFaces: boolean;
  canAccessAdmin: boolean;
  canAccessVault: boolean;
  hasRole: (role: UserRole | UserRole[]) => boolean;
  hasPermission: (permission: Permission | Permission[]) => boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  authFetch: (url: string, init?: RequestInit) => Promise<Response>;
}

const AUTH_TOKEN_KEY = 'media_cataloger_jwt_token';
const AUTH_USER_KEY = 'media_cataloger_user_data';

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem(AUTH_TOKEN_KEY);
    } catch {
      return null;
    }
  });

  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
      const saved = localStorage.getItem(AUTH_USER_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Authenticated fetch wrapper injecting Bearer token
  const authFetch = useCallback(
    async (url: string, init: RequestInit = {}): Promise<Response> => {
      const headers = new Headers(init.headers || {});
      const activeToken = token || (typeof window !== 'undefined' ? localStorage.getItem(AUTH_TOKEN_KEY) : null);
      if (activeToken) {
        headers.set('Authorization', `Bearer ${activeToken}`);
      }
      const response = await fetch(url, {
        ...init,
        headers,
      });
      if (response.status === 401) {
        setToken(null);
        setCurrentUser(null);
        try {
          localStorage.removeItem(AUTH_TOKEN_KEY);
          localStorage.removeItem(AUTH_USER_KEY);
        } catch {}
      }
      return response;
    },
    [token]
  );

  // Refresh current user profile from backend
  const refreshProfile = useCallback(async () => {
    const activeToken = token || (typeof window !== 'undefined' ? localStorage.getItem(AUTH_TOKEN_KEY) : null);
    if (!activeToken) {
      setIsLoading(false);
      return;
    }
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      const res = await fetch('/api/auth/me', {
        headers: {
          Authorization: `Bearer ${activeToken}`,
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        const contentType = res.headers.get('content-type') || '';
        const data = contentType.includes('application/json') ? await res.json() : null;
        if (data?.authenticated && data?.user) {
          setCurrentUser(data.user);
          try {
            localStorage.setItem(AUTH_USER_KEY, JSON.stringify(data.user));
          } catch (e) {
            console.warn('Failed to persist user profile:', e);
          }
        } else {
          setToken(null);
          setCurrentUser(null);
          try {
            localStorage.removeItem(AUTH_TOKEN_KEY);
            localStorage.removeItem(AUTH_USER_KEY);
          } catch {}
        }
      } else {
        // Token is invalid/expired
        setToken(null);
        setCurrentUser(null);
        try {
          localStorage.removeItem(AUTH_TOKEN_KEY);
          localStorage.removeItem(AUTH_USER_KEY);
        } catch {}
      }
    } catch (err: any) {
      console.warn('Failed to verify authentication status:', err?.name === 'AbortError' ? 'Verification timed out' : err);
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  const login = useCallback(
    async (username: string, password: string): Promise<{ success: boolean; error?: string }> => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

      try {
        let res: Response;
        try {
          res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username, password }),
            signal: controller.signal,
          });
        } catch (fetchErr: any) {
          clearTimeout(timeoutId);
          if (fetchErr?.name === 'AbortError') {
            return {
              success: false,
              error: 'Authentication request timed out. Please verify that the backend server is running.',
            };
          }
          return {
            success: false,
            error: 'Authentication server is unreachable. Please verify that the backend server is running.',
          };
        }
        clearTimeout(timeoutId);

        let data: any = {};
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          try {
            data = await res.json();
          } catch {
            data = {};
          }
        } else {
          const text = await res.text().catch(() => '');
          data = { message: text.slice(0, 150) };
        }

        if (!res.ok) {
          return {
            success: false,
            error: data?.message || (res.status === 401 ? 'Invalid username or password' : `Server error (${res.status}): ${res.statusText || 'Unavailable'}`),
          };
        }

        const newToken = data.token;
        const newUser: User = data.user;

        setToken(newToken);
        setCurrentUser(newUser);

        try {
          localStorage.setItem(AUTH_TOKEN_KEY, newToken);
          localStorage.setItem(AUTH_USER_KEY, JSON.stringify(newUser));
        } catch (e) {
          console.warn('Failed to save auth state to localStorage:', e);
        }

        return { success: true };
      } catch (err: any) {
        clearTimeout(timeoutId);
        return {
          success: false,
          error: err?.message || 'Connection error while logging in',
        };
      }
    },
    []
  );

  const logout = useCallback(async () => {
    try {
      if (token) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }).catch(() => {});
      }
    } finally {
      setToken(null);
      setCurrentUser(null);
      try {
        localStorage.removeItem(AUTH_TOKEN_KEY);
        localStorage.removeItem(AUTH_USER_KEY);
      } catch {}
    }
  }, [token]);

  const hasRole = useCallback(
    (role: UserRole | UserRole[]): boolean => {
      if (!currentUser) return false;
      if (currentUser.role === 'admin') return true;
      const roles = Array.isArray(role) ? role : [role];
      return roles.includes(currentUser.role);
    },
    [currentUser]
  );

  const hasPermission = useCallback(
    (permission: Permission | Permission[]): boolean => {
      if (!currentUser) return false;
      if (currentUser.role === 'admin') return true;
      const perms = Array.isArray(permission) ? permission : [permission];
      const userPerms = currentUser.permissions || [];
      return perms.every((p) => userPerms.includes(p));
    },
    [currentUser]
  );

  const isAdmin = useMemo(() => currentUser?.role === 'admin', [currentUser]);

  const canEdit = useMemo(() => {
    if (!currentUser) return false;
    return currentUser.role === 'admin' || hasPermission('edit_metadata');
  }, [currentUser, hasPermission]);

  const canManageFaces = useMemo(() => {
    if (!currentUser) return false;
    return currentUser.role === 'admin' || hasPermission('manage_faces');
  }, [currentUser, hasPermission]);

  const canAccessAdmin = useMemo(() => {
    if (!currentUser) return false;
    return currentUser.role === 'admin' || hasPermission('admin_panel');
  }, [currentUser, hasPermission]);

  const canAccessVault = useMemo(() => {
    if (!currentUser) return false;
    return currentUser.role === 'admin' || hasPermission('vault_access');
  }, [currentUser, hasPermission]);

  const value = useMemo<AuthContextValue>(
    () => ({
      currentUser,
      token,
      isAuthenticated: Boolean(token && currentUser),
      isLoading,
      isAdmin,
      canEdit,
      canManageFaces,
      canAccessAdmin,
      canAccessVault,
      hasRole,
      hasPermission,
      login,
      logout,
      refreshProfile,
      authFetch,
    }),
    [
      currentUser,
      token,
      isLoading,
      isAdmin,
      canEdit,
      canManageFaces,
      canAccessAdmin,
      canAccessVault,
      hasRole,
      hasPermission,
      login,
      logout,
      refreshProfile,
      authFetch,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
