import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import type { FeatureFlag, FeatureFlagsContextValue } from '../models/featureFlags';

import defaultFeatureFlagsPresets from '../assets/default-feature-flags.json';

export const STORAGE_KEY = 'media_cataloger_feature_flags';
export const STYLE_ELEMENT_ID = 'feature-flags-dynamic-styles';

// Normalize a class name string (strip leading dot, whitespace)
export function normalizeClassName(cls: string): string {
  return cls.trim().replace(/^\.+/, '');
}

// Normalize a button id string (strip leading hash, whitespace)
export function normalizeButtonId(id: string): string {
  return id.trim().replace(/^#+/, '');
}

// Normalize a flag key (case-insensitive, treats '-' and '_' interchangeably)
export function normalizeFlagKey(key: string): string {
  return key.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

export const DEFAULT_FEATURE_FLAG_PRESETS: Omit<FeatureFlag, 'createdAt' | 'updatedAt'>[] =
  defaultFeatureFlagsPresets as Omit<FeatureFlag, 'createdAt' | 'updatedAt'>[];

/**
 * FlagsManager - Central singleton for querying and managing feature flags anywhere in the application.
 * Usage:
 *   const isEnabled: boolean = FlagsManager.IsActive('first-frame-thumbnail-generation');
 *   const isEnabled: boolean = FlagsManager.IsActive('first_frame_thumbnail_generation');
 */
class FlagsManagerSingleton {
  private flagsMap: Map<string, FeatureFlag> = new Map();
  private listeners: Set<(flags: FeatureFlag[]) => void> = new Set();
  private isInitialized = false;

  constructor() {
    this.init();
  }

  public init(): void {
    if (this.isInitialized) return;
    this.isInitialized = true;
    this.loadFromStorage();
    this.fetchRemote();

    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (e.key === STORAGE_KEY && e.newValue) {
          this.loadFromStorage();
          this.notify();
        }
      });
    }
  }

  public loadFromStorage(): void {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          this.flagsMap.clear();
          for (const item of parsed) {
            if (item && item.key) {
              const normKey = normalizeFlagKey(item.key);
              this.flagsMap.set(normKey, {
                ...item,
                key: item.key,
                classNames: Array.isArray(item.classNames)
                  ? item.classNames.map(normalizeClassName).filter(Boolean)
                  : [],
                buttonIds: Array.isArray(item.buttonIds)
                  ? item.buttonIds.map(normalizeButtonId).filter(Boolean)
                  : [],
                isEnabled: Boolean(item.isEnabled),
              });
            }
          }
          this.applyCssRules();
          return;
        }
      }
    } catch (e) {
      console.warn('[FlagsManager] Failed to load from storage:', e);
    }

    // Default presets fallback
    this.flagsMap.clear();
    for (const p of DEFAULT_FEATURE_FLAG_PRESETS) {
      const normKey = normalizeFlagKey(p.key);
      this.flagsMap.set(normKey, {
        ...p,
        classNames: Array.isArray(p.classNames) ? p.classNames.map(normalizeClassName).filter(Boolean) : [],
        buttonIds: Array.isArray(p.buttonIds) ? p.buttonIds.map(normalizeButtonId).filter(Boolean) : [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
    this.applyCssRules();
  }

  public async fetchRemote(): Promise<void> {
    if (typeof window === 'undefined' || typeof fetch === 'undefined') return;
    try {
      let res = await fetch('/api/feature-flags');
      if (!res.ok) {
        res = await fetch('/data/feature_flags.json');
      }
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          this.flagsMap.clear();
          for (const item of data) {
            if (item && item.key) {
              const normKey = normalizeFlagKey(item.key);
              this.flagsMap.set(normKey, {
                ...item,
                key: item.key,
                classNames: Array.isArray(item.classNames)
                  ? item.classNames.map(normalizeClassName).filter(Boolean)
                  : [],
                buttonIds: Array.isArray(item.buttonIds)
                  ? item.buttonIds.map(normalizeButtonId).filter(Boolean)
                  : [],
                isEnabled: Boolean(item.isEnabled),
              });
            }
          }
          if (window.localStorage) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(this.flagsMap.values())));
          }
          this.applyCssRules();
          this.notify();
        }
      }
    } catch (e) {
      console.warn('[FlagsManager] Failed to fetch remote flags from /data:', e);
    }
  }

  public async persistRemote(): Promise<void> {
    if (typeof window === 'undefined' || typeof fetch === 'undefined') return;
    try {
      const arr = Array.from(this.flagsMap.values());
      const token = localStorage.getItem('media_cataloger_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      await fetch('/api/feature-flags', {
        method: 'POST',
        headers,
        body: JSON.stringify(arr),
      });
    } catch (e) {
      console.warn('[FlagsManager] Failed to persist flags to /data:', e);
    }
  }

  public persist(): void {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      const arr = Array.from(this.flagsMap.values());
      localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
      this.applyCssRules();
      this.notify();
      this.persistRemote();
    } catch (e) {
      console.warn('[FlagsManager] Failed to persist flags:', e);
    }
  }

  /**
   * Main check function: returns boolean whether the flag key is active.
   * Matches keys case-insensitively and treats dashes/underscores interchangeably.
   * Example: FlagsManager.IsActive('first-frame-thumbnail-generation')
   */
  public IsActive(key: string, defaultValue = true): boolean {
    if (!key) return defaultValue;
    const norm = normalizeFlagKey(key);
    const flag = this.flagsMap.get(norm);
    if (flag !== undefined) {
      return Boolean(flag.isEnabled);
    }
    return defaultValue;
  }

  /**
   * Alias for IsActive (camelCase)
   */
  public isActive(key: string, defaultValue = true): boolean {
    return this.IsActive(key, defaultValue);
  }

  /**
   * Check if a CSS class name is currently enabled across all feature flags.
   */
  public isClassEnabled(className: string): boolean {
    const norm = normalizeClassName(className);
    if (!norm) return true;
    for (const flag of this.flagsMap.values()) {
      if (!flag.isEnabled && flag.classNames.some((c) => normalizeClassName(c) === norm)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Check if a button ID is currently enabled across all feature flags.
   */
  public isButtonEnabled(buttonId: string): boolean {
    const norm = normalizeButtonId(buttonId);
    if (!norm) return true;
    for (const flag of this.flagsMap.values()) {
      if (!flag.isEnabled && flag.buttonIds && flag.buttonIds.some((id) => normalizeButtonId(id) === norm)) {
        return false;
      }
    }
    return true;
  }

  public getFlags(): FeatureFlag[] {
    return Array.from(this.flagsMap.values());
  }

  public getFlag(key: string): FeatureFlag | undefined {
    return this.flagsMap.get(normalizeFlagKey(key));
  }

  public setFlag(flag: Omit<FeatureFlag, 'createdAt' | 'updatedAt'>): boolean {
    const cleanKey = flag.key.trim();
    if (!cleanKey) return false;

    const normKey = normalizeFlagKey(cleanKey);
    const normalizedClasses = Array.from(
      new Set((flag.classNames || []).map(normalizeClassName).filter(Boolean))
    );
    const normalizedButtonIds = Array.from(
      new Set((flag.buttonIds || []).map(normalizeButtonId).filter(Boolean))
    );

    const now = Date.now();
    const existing = this.flagsMap.get(normKey);

    const newFlag: FeatureFlag = {
      key: cleanKey,
      classNames: normalizedClasses,
      buttonIds: normalizedButtonIds,
      isEnabled: flag.isEnabled ?? true,
      description: flag.description?.trim() || '',
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    this.flagsMap.set(normKey, newFlag);
    this.persist();
    return true;
  }

  public toggleFlag(key: string): boolean {
    const normKey = normalizeFlagKey(key);
    const flag = this.flagsMap.get(normKey);
    if (!flag) return false;

    flag.isEnabled = !flag.isEnabled;
    flag.updatedAt = Date.now();
    this.persist();
    return true;
  }

  public removeFlag(key: string): boolean {
    const normKey = normalizeFlagKey(key);
    const deleted = this.flagsMap.delete(normKey);
    if (deleted) {
      this.persist();
    }
    return deleted;
  }

  public resetToDefaults(): void {
    this.flagsMap.clear();
    const now = Date.now();
    for (const p of DEFAULT_FEATURE_FLAG_PRESETS) {
      const normKey = normalizeFlagKey(p.key);
      this.flagsMap.set(normKey, {
        ...p,
        classNames: Array.isArray(p.classNames) ? p.classNames.map(normalizeClassName).filter(Boolean) : [],
        buttonIds: Array.isArray(p.buttonIds) ? p.buttonIds.map(normalizeButtonId).filter(Boolean) : [],
        createdAt: now,
        updatedAt: now,
      });
    }
    this.persist();
  }

  public clearAll(): void {
    this.flagsMap.clear();
    this.persist();
  }

  public subscribe(listener: (flags: FeatureFlag[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    const all = this.getFlags();
    this.listeners.forEach((fn) => fn(all));
  }

  public applyCssRules(): void {
    if (typeof document === 'undefined') return;

    const disabledClassesSet = new Set<string>();
    const disabledButtonsSet = new Set<string>();

    for (const flag of this.flagsMap.values()) {
      if (!flag.isEnabled) {
        for (const cls of flag.classNames) {
          const normalized = normalizeClassName(cls);
          if (normalized) {
            disabledClassesSet.add(normalized);
          }
        }
        if (Array.isArray(flag.buttonIds)) {
          for (const bid of flag.buttonIds) {
            const normalized = normalizeButtonId(bid);
            if (normalized) {
              disabledButtonsSet.add(normalized);
            }
          }
        }
      }
    }

    let styleEl = document.getElementById(STYLE_ELEMENT_ID) as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = STYLE_ELEMENT_ID;
      document.head.appendChild(styleEl);
    }

    const classRules = Array.from(disabledClassesSet).map(
      (cls) => `.${CSS.escape ? CSS.escape(cls) : cls} { display: none !important; }`
    );
    const buttonRules = Array.from(disabledButtonsSet).map(
      (bid) => `#${CSS.escape ? CSS.escape(bid) : bid} { display: none !important; }`
    );
    const allRules = [...classRules, ...buttonRules];

    if (allRules.length === 0) {
      styleEl.textContent = '/* Feature flags: all active classes and buttons enabled */';
    } else {
      styleEl.textContent = `/* Feature flags disabled class and button rules */\n${allRules.join('\n')}`;
    }
  }
}

export const FlagsManager = new FlagsManagerSingleton();

const FeatureFlagsContext = createContext<FeatureFlagsContextValue | null>(null);

export const FeatureFlagsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [flags, setFlags] = useState<FeatureFlag[]>(() => FlagsManager.getFlags());

  // Subscribe to FlagsManager changes
  useEffect(() => {
    return FlagsManager.subscribe((updatedFlags) => {
      setFlags(updatedFlags);
    });
  }, []);

  const addFlag = useCallback((flag: Omit<FeatureFlag, 'createdAt' | 'updatedAt'>) => {
    return FlagsManager.setFlag(flag);
  }, []);

  const updateFlag = useCallback(
    (key: string, updates: Partial<Omit<FeatureFlag, 'key'>>) => {
      const existing = FlagsManager.getFlag(key);
      if (!existing) return false;
      return FlagsManager.setFlag({
        ...existing,
        ...updates,
      });
    },
    []
  );

  const toggleFlag = useCallback((key: string) => {
    return FlagsManager.toggleFlag(key);
  }, []);

  const removeFlag = useCallback((key: string) => {
    return FlagsManager.removeFlag(key);
  }, []);

  const resetToDefaults = useCallback(() => {
    FlagsManager.resetToDefaults();
  }, []);

  const clearAllFlags = useCallback(() => {
    FlagsManager.clearAll();
  }, []);

  const isFeatureEnabled = useCallback((key: string) => {
    return FlagsManager.IsActive(key);
  }, []);

  const isClassEnabled = useCallback((className: string) => {
    return FlagsManager.isClassEnabled(className);
  }, []);

  const isButtonEnabled = useCallback((buttonId: string) => {
    return FlagsManager.isButtonEnabled(buttonId);
  }, []);

  const hasFlag = useCallback((key: string) => {
    return FlagsManager.getFlag(key) !== undefined;
  }, []);

  const disabledClassesCount = useMemo(() => {
    const set = new Set<string>();
    for (const flag of flags) {
      if (!flag.isEnabled) {
        for (const cls of flag.classNames) {
          const norm = normalizeClassName(cls);
          if (norm) set.add(norm);
        }
      }
    }
    return set.size;
  }, [flags]);

  const disabledButtonsCount = useMemo(() => {
    const set = new Set<string>();
    for (const flag of flags) {
      if (!flag.isEnabled && flag.buttonIds) {
        for (const bid of flag.buttonIds) {
          const norm = normalizeButtonId(bid);
          if (norm) set.add(norm);
        }
      }
    }
    return set.size;
  }, [flags]);

  const value = useMemo(
    () => ({
      flags,
      addFlag,
      updateFlag,
      toggleFlag,
      removeFlag,
      resetToDefaults,
      clearAllFlags,
      isFeatureEnabled,
      isClassEnabled,
      isButtonEnabled,
      hasFlag,
      disabledClassesCount,
      disabledButtonsCount,
    }),
    [
      flags,
      addFlag,
      updateFlag,
      toggleFlag,
      removeFlag,
      resetToDefaults,
      clearAllFlags,
      isFeatureEnabled,
      isClassEnabled,
      isButtonEnabled,
      hasFlag,
      disabledClassesCount,
      disabledButtonsCount,
    ]
  );

  return <FeatureFlagsContext.Provider value={value}>{children}</FeatureFlagsContext.Provider>;
};

export const useFeatureFlags = (): FeatureFlagsContextValue => {
  const ctx = useContext(FeatureFlagsContext);
  if (!ctx) {
    throw new Error('useFeatureFlags must be used within a FeatureFlagsProvider');
  }
  return ctx;
};
