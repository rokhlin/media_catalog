import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import type { ThemeMode, ThemeTokens, ThemePreset, CustomThemePreset } from '../models/theme';
import { BUILTIN_THEMES, applyTokensToElement, buildCustomTokens } from './presets';

interface ThemeContextValue {
  themeId: string;
  themeMode: ThemeMode;
  activeTheme: ThemePreset | CustomThemePreset;
  presets: ThemePreset[];
  customThemes: CustomThemePreset[];
  setThemeId: (id: string) => void;
  toggleThemeMode: () => void;
  saveCustomTheme: (themeData: {
    id?: string;
    name: string;
    mode: ThemeMode;
    bgColor: string;
    cardBgSolid: string;
    primaryColor: string;
    accentColor: string;
    textColor?: string;
  }) => string;
  deleteCustomTheme: (id: string) => void;
  getThemeDisplayName: (theme: ThemePreset | CustomThemePreset) => string;
}

const THEME_STORAGE_KEY = 'media_cataloger_theme';
const CUSTOM_THEMES_STORAGE_KEY = 'media_cataloger_custom_themes';

const ThemeContext = createContext<ThemeContextValue | null>(null);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Load saved custom themes
  const [customThemes, setCustomThemes] = useState<CustomThemePreset[]>(() => {
    try {
      const saved = localStorage.getItem(CUSTOM_THEMES_STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved) as CustomThemePreset[];
      }
    } catch (e) {
      console.warn('Failed to load custom themes from localStorage:', e);
    }
    return [];
  });

  // Load saved active theme id
  const [themeId, setThemeIdState] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved) {
        return saved;
      }
      if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
        return 'light';
      }
    } catch {
      // localStorage might not be available
    }
    return 'dark';
  });

  // Find active theme preset or fallback to dark
  const activeTheme = useMemo<ThemePreset | CustomThemePreset>(() => {
    const builtin = BUILTIN_THEMES.find((t) => t.id === themeId);
    if (builtin) return builtin;
    const custom = customThemes.find((t) => t.id === themeId);
    if (custom) return custom;
    return BUILTIN_THEMES[0]; // default 'dark'
  }, [themeId, customThemes]);

  const themeMode: ThemeMode = activeTheme.mode;

  // Apply theme tokens to DOM root on change
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', themeId);
    root.setAttribute('data-theme-mode', themeMode);
    root.style.colorScheme = themeMode;

    if (activeTheme?.tokens) {
      applyTokensToElement(activeTheme.tokens, root);
    }
  }, [themeId, themeMode, activeTheme]);

  const setThemeId = useCallback((newId: string) => {
    setThemeIdState(newId);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, newId);
    } catch (e) {
      console.warn('Failed to persist theme preference:', e);
    }
  }, []);

  const toggleThemeMode = useCallback(() => {
    // Quick toggle between Dark and Light presets or corresponding custom mode
    if (themeMode === 'dark') {
      // If currently on a dark preset, switch to light preset
      const targetPreset = BUILTIN_THEMES.find((t) => t.mode === 'light');
      if (targetPreset) {
        setThemeId(targetPreset.id);
      }
    } else {
      // If currently on light, switch to dark preset
      const targetPreset = BUILTIN_THEMES.find((t) => t.mode === 'dark');
      if (targetPreset) {
        setThemeId(targetPreset.id);
      }
    }
  }, [themeMode, setThemeId]);

  const saveCustomTheme = useCallback(
    (themeData: {
      id?: string;
      name: string;
      mode: ThemeMode;
      bgColor: string;
      cardBgSolid: string;
      primaryColor: string;
      accentColor: string;
      textColor?: string;
    }): string => {
      const tokens: ThemeTokens = buildCustomTokens({
        mode: themeData.mode,
        bgColor: themeData.bgColor,
        cardBgSolid: themeData.cardBgSolid,
        primaryColor: themeData.primaryColor,
        accentColor: themeData.accentColor,
        textColor: themeData.textColor,
      });

      const newId = themeData.id || `custom-${Date.now()}`;
      const previewColors: [string, string, string, string] = [
        themeData.bgColor,
        themeData.cardBgSolid,
        themeData.primaryColor,
        themeData.accentColor,
      ];

      const newCustomPreset: CustomThemePreset = {
        id: newId,
        name: themeData.name.trim() || 'My Custom Theme',
        mode: themeData.mode,
        icon: '🎨',
        tokens,
        previewColors,
        createdAt: Date.now(),
      };

      setCustomThemes((prev) => {
        const filtered = prev.filter((t) => t.id !== newId);
        const updated = [...filtered, newCustomPreset];
        try {
          localStorage.setItem(CUSTOM_THEMES_STORAGE_KEY, JSON.stringify(updated));
        } catch (e) {
          console.warn('Failed to save custom themes to localStorage:', e);
        }
        return updated;
      });

      setThemeId(newId);
      return newId;
    },
    [setThemeId]
  );

  const deleteCustomTheme = useCallback(
    (idToDelete: string) => {
      setCustomThemes((prev) => {
        const updated = prev.filter((t) => t.id !== idToDelete);
        try {
          localStorage.setItem(CUSTOM_THEMES_STORAGE_KEY, JSON.stringify(updated));
        } catch (e) {
          console.warn('Failed to update custom themes after delete:', e);
        }
        return updated;
      });

      if (themeId === idToDelete) {
        setThemeId('dark');
      }
    },
    [themeId, setThemeId]
  );

  const getThemeDisplayName = useCallback(
    (theme: ThemePreset | CustomThemePreset): string => {
      if ('defaultName' in theme) {
        return theme.defaultName;
      }
      return theme.name;
    },
    []
  );

  const value = useMemo(
    () => ({
      themeId,
      themeMode,
      activeTheme,
      presets: BUILTIN_THEMES,
      customThemes,
      setThemeId,
      toggleThemeMode,
      saveCustomTheme,
      deleteCustomTheme,
      getThemeDisplayName,
    }),
    [
      themeId,
      themeMode,
      activeTheme,
      customThemes,
      setThemeId,
      toggleThemeMode,
      saveCustomTheme,
      deleteCustomTheme,
      getThemeDisplayName,
    ]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = (): ThemeContextValue => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
