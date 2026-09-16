import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { translations, type Language, type TranslationDictionary } from './translations';

interface LanguageContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  t: (key: keyof TranslationDictionary, params?: Record<string, string | number>) => string;
  getLocalizedText: (enText?: string | null, ruText?: string | null) => string;
}

const STORAGE_KEY = 'media_cataloger_lang';

const LanguageContext = createContext<LanguageContextValue | null>(null);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'en' || saved === 'ru') {
        return saved;
      }
      if (typeof navigator !== 'undefined' && navigator.language && navigator.language.toLowerCase().startsWith('ru')) {
        return 'ru';
      }
    } catch {
      // localStorage might not be available
    }
    return 'en';
  });

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    try {
      localStorage.setItem(STORAGE_KEY, lang);
      document.documentElement.lang = lang;
    } catch (e) {
      console.warn('Failed to save language preference:', e);
    }
  }, []);

  const toggleLanguage = useCallback(() => {
    setLanguage(language === 'en' ? 'ru' : 'en');
  }, [language, setLanguage]);

  useEffect(() => {
    try {
      document.documentElement.lang = language;
    } catch {
      // ignore
    }
  }, [language]);

  const t = useCallback(
    (key: keyof TranslationDictionary, params?: Record<string, string | number>): string => {
      const dict = translations[language] || translations.en;
      let text = dict[key] || translations.en[key] || String(key);
      if (params) {
        for (const [paramKey, val] of Object.entries(params)) {
          text = text.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(val));
        }
      }
      return text;
    },
    [language]
  );

  const getLocalizedText = useCallback(
    (enText?: string | null, ruText?: string | null): string => {
      const cleanEn = (enText || '').trim();
      const cleanRu = (ruText || '').trim();

      if (language === 'ru') {
        return cleanRu || cleanEn;
      }
      return cleanEn || cleanRu;
    },
    [language]
  );

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      toggleLanguage,
      t,
      getLocalizedText,
    }),
    [language, setLanguage, toggleLanguage, t, getLocalizedText]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}

export type { Language, TranslationDictionary };
