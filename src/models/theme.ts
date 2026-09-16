export type ThemeMode = 'dark' | 'light';

export interface ThemeTokens {
  bgColor: string;
  bgRadial1?: string;
  bgRadial2?: string;
  cardBg: string;
  cardBgSolid: string;
  modalBg: string;
  borderColor: string;
  borderColorHover: string;
  primaryGradient: string;
  primaryHover: string;
  primaryColor: string;
  accentGradient: string;
  accentHover: string;
  accentColor: string;
  dangerGradient?: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  inputBg: string;
  inputFocusBg: string;
  consoleBg: string;
  consoleText: string;
  shadowCard: string;
  shadowModal: string;
  navTabBg?: string;
  navTabActiveBg?: string;
}

export interface ThemePreset {
  id: string;
  nameKey: string;
  defaultName: string;
  mode: ThemeMode;
  icon: string;
  previewColors: [string, string, string, string]; // [bg, card, primary, accent]
  tokens: ThemeTokens;
}

export interface CustomThemePreset {
  id: string;
  name: string;
  mode: ThemeMode;
  icon?: string;
  tokens: ThemeTokens;
  previewColors: [string, string, string, string];
  createdAt: number;
}
