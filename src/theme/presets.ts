import type { ThemePreset, ThemeTokens, ThemeMode } from '../models/theme';

export const BUILTIN_THEMES: ThemePreset[] = [
  {
    id: 'dark',
    nameKey: 'themeMidnight',
    defaultName: 'Midnight Dark',
    mode: 'dark',
    icon: '🌌',
    previewColors: ['#0b0f19', '#111827', '#6366f1', '#a855f7'],
    tokens: {
      bgColor: '#0b0f19',
      bgRadial1: 'rgba(99, 102, 241, 0.12)',
      bgRadial2: 'rgba(168, 85, 247, 0.12)',
      cardBg: 'rgba(17, 24, 39, 0.65)',
      cardBgSolid: '#111827',
      modalBg: 'rgba(17, 24, 39, 0.94)',
      borderColor: 'rgba(255, 255, 255, 0.08)',
      borderColorHover: 'rgba(255, 255, 255, 0.18)',
      primaryColor: '#6366f1',
      primaryGradient: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
      primaryHover: 'linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)',
      accentColor: '#a855f7',
      accentGradient: 'linear-gradient(135deg, #a855f7 0%, #7e22ce 100%)',
      accentHover: 'linear-gradient(135deg, #9333ea 0%, #6b21a8 100%)',
      textPrimary: '#f3f4f6',
      textSecondary: '#9ca3af',
      textMuted: '#6b7280',
      inputBg: '#111827',
      inputFocusBg: '#1f2937',
      consoleBg: '#05070c',
      consoleText: '#38bdf8',
      shadowCard: '0 8px 32px 0 rgba(0, 0, 0, 0.3)',
      shadowModal: '0 20px 60px rgba(0, 0, 0, 0.6)',
      navTabBg: 'rgba(0, 0, 0, 0.35)',
      navTabActiveBg: 'rgba(99, 102, 241, 0.25)',
    },
  },
  {
    id: 'light',
    nameKey: 'themeDaybreak',
    defaultName: 'Daybreak Light',
    mode: 'light',
    icon: '☀️',
    previewColors: ['#f4f6f9', '#ffffff', '#4f46e5', '#9333ea'],
    tokens: {
      bgColor: '#f4f6f9',
      bgRadial1: 'rgba(99, 102, 241, 0.08)',
      bgRadial2: 'rgba(168, 85, 247, 0.08)',
      cardBg: 'rgba(255, 255, 255, 0.85)',
      cardBgSolid: '#ffffff',
      modalBg: 'rgba(255, 255, 255, 0.96)',
      borderColor: 'rgba(0, 0, 0, 0.08)',
      borderColorHover: 'rgba(99, 102, 241, 0.35)',
      primaryColor: '#4f46e5',
      primaryGradient: 'linear-gradient(135deg, #4f46e5 0%, #3730a3 100%)',
      primaryHover: 'linear-gradient(135deg, #4338ca 0%, #312e81 100%)',
      accentColor: '#9333ea',
      accentGradient: 'linear-gradient(135deg, #9333ea 0%, #7e22ce 100%)',
      accentHover: 'linear-gradient(135deg, #7e22ce 0%, #6b21a8 100%)',
      textPrimary: '#0f172a',
      textSecondary: '#475569',
      textMuted: '#94a3b8',
      inputBg: '#ffffff',
      inputFocusBg: '#f8fafc',
      consoleBg: '#0f172a',
      consoleText: '#38bdf8',
      shadowCard: '0 8px 28px rgba(15, 23, 42, 0.07)',
      shadowModal: '0 24px 60px rgba(15, 23, 42, 0.16)',
      navTabBg: 'rgba(0, 0, 0, 0.06)',
      navTabActiveBg: 'rgba(79, 70, 229, 0.12)',
    },
  },
  {
    id: 'nordic',
    nameKey: 'themeNordic',
    defaultName: 'Nordic Frost',
    mode: 'dark',
    icon: '❄️',
    previewColors: ['#0c121e', '#0f172a', '#0ea5e9', '#14b8a6'],
    tokens: {
      bgColor: '#0c121e',
      bgRadial1: 'rgba(14, 165, 233, 0.12)',
      bgRadial2: 'rgba(20, 184, 166, 0.12)',
      cardBg: 'rgba(15, 23, 42, 0.72)',
      cardBgSolid: '#0f172a',
      modalBg: 'rgba(15, 23, 42, 0.95)',
      borderColor: 'rgba(56, 189, 248, 0.12)',
      borderColorHover: 'rgba(56, 189, 248, 0.28)',
      primaryColor: '#0ea5e9',
      primaryGradient: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
      primaryHover: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
      accentColor: '#14b8a6',
      accentGradient: 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)',
      accentHover: 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)',
      textPrimary: '#f1f5f9',
      textSecondary: '#94a3b8',
      textMuted: '#64748b',
      inputBg: '#0b1120',
      inputFocusBg: '#131d31',
      consoleBg: '#070b13',
      consoleText: '#38bdf8',
      shadowCard: '0 8px 32px 0 rgba(2, 6, 23, 0.4)',
      shadowModal: '0 20px 60px rgba(2, 6, 23, 0.7)',
      navTabBg: 'rgba(0, 0, 0, 0.35)',
      navTabActiveBg: 'rgba(14, 165, 233, 0.22)',
    },
  },
  {
    id: 'sunset',
    nameKey: 'themeSunset',
    defaultName: 'Sunset Glow',
    mode: 'dark',
    icon: '🌅',
    previewColors: ['#150d1e', '#20112d', '#f43f5e', '#f59e0b'],
    tokens: {
      bgColor: '#150d1e',
      bgRadial1: 'rgba(244, 63, 94, 0.12)',
      bgRadial2: 'rgba(245, 158, 11, 0.12)',
      cardBg: 'rgba(32, 17, 45, 0.68)',
      cardBgSolid: '#20112d',
      modalBg: 'rgba(32, 17, 45, 0.95)',
      borderColor: 'rgba(244, 63, 94, 0.15)',
      borderColorHover: 'rgba(244, 63, 94, 0.32)',
      primaryColor: '#f43f5e',
      primaryGradient: 'linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)',
      primaryHover: 'linear-gradient(135deg, #e11d48 0%, #be123c 100%)',
      accentColor: '#f59e0b',
      accentGradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
      accentHover: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
      textPrimary: '#fff1f2',
      textSecondary: '#fda4af',
      textMuted: '#9f1239',
      inputBg: '#1a0e26',
      inputFocusBg: '#28143a',
      consoleBg: '#0d0613',
      consoleText: '#fb7185',
      shadowCard: '0 8px 32px 0 rgba(21, 13, 30, 0.45)',
      shadowModal: '0 20px 60px rgba(21, 13, 30, 0.75)',
      navTabBg: 'rgba(0, 0, 0, 0.35)',
      navTabActiveBg: 'rgba(244, 63, 94, 0.22)',
    },
  },
  {
    id: 'emerald',
    nameKey: 'themeEmerald',
    defaultName: 'Emerald Pine',
    mode: 'dark',
    icon: '🌲',
    previewColors: ['#081410', '#0b1c16', '#10b981', '#06b6d4'],
    tokens: {
      bgColor: '#081410',
      bgRadial1: 'rgba(16, 185, 129, 0.12)',
      bgRadial2: 'rgba(6, 182, 212, 0.12)',
      cardBg: 'rgba(11, 28, 22, 0.72)',
      cardBgSolid: '#0b1c16',
      modalBg: 'rgba(11, 28, 22, 0.95)',
      borderColor: 'rgba(16, 185, 129, 0.14)',
      borderColorHover: 'rgba(16, 185, 129, 0.3)',
      primaryColor: '#10b981',
      primaryGradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
      primaryHover: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
      accentColor: '#06b6d4',
      accentGradient: 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)',
      accentHover: 'linear-gradient(135deg, #0891b2 0%, #0e7490 100%)',
      textPrimary: '#ecfdf5',
      textSecondary: '#a7f3d0',
      textMuted: '#6ee7b7',
      inputBg: '#06120e',
      inputFocusBg: '#0f261e',
      consoleBg: '#040a08',
      consoleText: '#34d399',
      shadowCard: '0 8px 32px 0 rgba(4, 10, 8, 0.45)',
      shadowModal: '0 20px 60px rgba(4, 10, 8, 0.75)',
      navTabBg: 'rgba(0, 0, 0, 0.35)',
      navTabActiveBg: 'rgba(16, 185, 129, 0.22)',
    },
  },
  {
    id: 'solar',
    nameKey: 'themeSolar',
    defaultName: 'Solar Warm',
    mode: 'light',
    icon: '🌾',
    previewColors: ['#faf7f2', '#ffffff', '#d97706', '#ea580c'],
    tokens: {
      bgColor: '#faf7f2',
      bgRadial1: 'rgba(217, 119, 6, 0.08)',
      bgRadial2: 'rgba(234, 88, 12, 0.08)',
      cardBg: 'rgba(255, 255, 255, 0.88)',
      cardBgSolid: '#ffffff',
      modalBg: 'rgba(255, 255, 255, 0.97)',
      borderColor: 'rgba(217, 119, 6, 0.15)',
      borderColorHover: 'rgba(217, 119, 6, 0.35)',
      primaryColor: '#d97706',
      primaryGradient: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
      primaryHover: 'linear-gradient(135deg, #b45309 0%, #92400e 100%)',
      accentColor: '#ea580c',
      accentGradient: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)',
      accentHover: 'linear-gradient(135deg, #c2410c 0%, #9a3412 100%)',
      textPrimary: '#292524',
      textSecondary: '#57534e',
      textMuted: '#a8a29e',
      inputBg: '#ffffff',
      inputFocusBg: '#fefcf9',
      consoleBg: '#1c1917',
      consoleText: '#f59e0b',
      shadowCard: '0 8px 28px rgba(41, 37, 36, 0.08)',
      shadowModal: '0 24px 60px rgba(41, 37, 36, 0.18)',
      navTabBg: 'rgba(0, 0, 0, 0.06)',
      navTabActiveBg: 'rgba(217, 119, 6, 0.12)',
    },
  },
];

/**
 * Generates dynamic tokens for a custom user-defined theme given custom colors.
 */
export function buildCustomTokens(params: {
  mode: ThemeMode;
  bgColor: string;
  cardBgSolid: string;
  primaryColor: string;
  accentColor: string;
  textColor?: string;
}): ThemeTokens {
  const isDark = params.mode === 'dark';
  const textColor = params.textColor || (isDark ? '#f3f4f6' : '#0f172a');
  const textSecondary = isDark ? '#9ca3af' : '#475569';
  const textMuted = isDark ? '#6b7280' : '#94a3b8';
  const borderColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.09)';
  const borderColorHover = isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.18)';
  const inputBg = isDark ? '#111827' : '#ffffff';
  const inputFocusBg = isDark ? '#1f2937' : '#f8fafc';

  return {
    bgColor: params.bgColor,
    bgRadial1: `${params.primaryColor}1a`,
    bgRadial2: `${params.accentColor}1a`,
    cardBg: isDark ? `${params.cardBgSolid}b3` : `${params.cardBgSolid}d9`,
    cardBgSolid: params.cardBgSolid,
    modalBg: isDark ? `${params.cardBgSolid}f2` : `${params.cardBgSolid}fa`,
    borderColor,
    borderColorHover,
    primaryColor: params.primaryColor,
    primaryGradient: `linear-gradient(135deg, ${params.primaryColor} 0%, ${params.accentColor} 100%)`,
    primaryHover: `linear-gradient(135deg, ${params.primaryColor} 0%, ${params.accentColor} 100%)`,
    accentColor: params.accentColor,
    accentGradient: `linear-gradient(135deg, ${params.accentColor} 0%, ${params.primaryColor} 100%)`,
    accentHover: `linear-gradient(135deg, ${params.accentColor} 0%, ${params.primaryColor} 100%)`,
    textPrimary: textColor,
    textSecondary,
    textMuted,
    inputBg,
    inputFocusBg,
    consoleBg: isDark ? '#05070c' : '#0f172a',
    consoleText: '#38bdf8',
    shadowCard: isDark ? '0 8px 32px 0 rgba(0, 0, 0, 0.35)' : '0 8px 28px rgba(15, 23, 42, 0.08)',
    shadowModal: isDark ? '0 20px 60px rgba(0, 0, 0, 0.65)' : '0 24px 60px rgba(15, 23, 42, 0.18)',
    navTabBg: isDark ? 'rgba(0, 0, 0, 0.35)' : 'rgba(0, 0, 0, 0.06)',
    navTabActiveBg: `${params.primaryColor}33`,
  };
}

/**
 * Injects token variables into a CSS style object or document root
 */
export function applyTokensToElement(tokens: ThemeTokens, element: HTMLElement = document.documentElement) {
  element.style.setProperty('--bg-color', tokens.bgColor);
  element.style.setProperty('--card-bg', tokens.cardBg);
  element.style.setProperty('--card-bg-solid', tokens.cardBgSolid);
  element.style.setProperty('--modal-bg', tokens.modalBg);
  element.style.setProperty('--border-color', tokens.borderColor);
  element.style.setProperty('--border-color-hover', tokens.borderColorHover);
  element.style.setProperty('--primary-color', tokens.primaryColor);
  element.style.setProperty('--primary-gradient', tokens.primaryGradient);
  element.style.setProperty('--primary-hover', tokens.primaryHover);
  element.style.setProperty('--accent-color', tokens.accentColor);
  element.style.setProperty('--accent-gradient', tokens.accentGradient);
  element.style.setProperty('--accent-hover', tokens.accentHover);
  element.style.setProperty('--text-primary', tokens.textPrimary);
  element.style.setProperty('--text-secondary', tokens.textSecondary);
  element.style.setProperty('--text-muted', tokens.textMuted);
  element.style.setProperty('--text-color', tokens.textPrimary);
  element.style.setProperty('--input-bg', tokens.inputBg);
  element.style.setProperty('--input-focus-bg', tokens.inputFocusBg);
  element.style.setProperty('--console-bg', tokens.consoleBg);
  element.style.setProperty('--console-text', tokens.consoleText);
  element.style.setProperty('--shadow-card', tokens.shadowCard);
  element.style.setProperty('--shadow-modal', tokens.shadowModal);

  if (tokens.bgRadial1) {
    element.style.setProperty('--bg-radial-1', tokens.bgRadial1);
  }
  if (tokens.bgRadial2) {
    element.style.setProperty('--bg-radial-2', tokens.bgRadial2);
  }
  if (tokens.navTabBg) {
    element.style.setProperty('--nav-tab-bg', tokens.navTabBg);
  }
  if (tokens.navTabActiveBg) {
    element.style.setProperty('--nav-tab-active-bg', tokens.navTabActiveBg);
  }
}
