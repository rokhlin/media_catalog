export interface FeatureFlag {
  key: string;
  classNames: string[];
  buttonIds?: string[];
  isEnabled: boolean;
  description?: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface FeatureFlagsContextValue {
  flags: FeatureFlag[];
  addFlag: (flag: Omit<FeatureFlag, 'createdAt' | 'updatedAt'>) => boolean;
  updateFlag: (key: string, updates: Partial<Omit<FeatureFlag, 'key'>>) => boolean;
  toggleFlag: (key: string) => boolean;
  removeFlag: (key: string) => boolean;
  resetToDefaults: () => void;
  clearAllFlags: () => void;
  isFeatureEnabled: (key: string) => boolean;
  isClassEnabled: (className: string) => boolean;
  isButtonEnabled: (buttonId: string) => boolean;
  hasFlag: (key: string) => boolean;
  disabledClassesCount: number;
  disabledButtonsCount: number;
}
