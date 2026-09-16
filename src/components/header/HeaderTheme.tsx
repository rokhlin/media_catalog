import { useState, useRef, useEffect } from 'react';
import { useLanguage } from '../../i18n/LanguageContext';
import { useTheme } from '../../theme/ThemeContext';

export interface HeaderThemeProps {
  onOpenAppearanceSettings?: () => void;
}

export default function HeaderTheme({ onOpenAppearanceSettings }: HeaderThemeProps) {
  const { t } = useLanguage();
  const { themeId, themeMode, activeTheme, presets, customThemes, setThemeId, toggleThemeMode } = useTheme();
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);
  const themeMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (themeMenuRef.current && !themeMenuRef.current.contains(e.target as Node)) {
        setIsThemeMenuOpen(false);
      }
    }
    if (isThemeMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isThemeMenuOpen]);

  const allPresets = [...presets, ...customThemes];

  return (
    <div className="theme-switcher-container" ref={themeMenuRef}>
      <div className="theme-switcher-group">
        <button
          type="button"
          className="btn-theme-quick-toggle"
          onClick={toggleThemeMode}
          title={t('themeToggleDarkLight')}
          id="btn-theme-quick-toggle"
          aria-label={t('themeToggleDarkLight')}
        >
          {themeMode === 'dark' ? '🌙' : '☀️'}
        </button>

        <button
          type="button"
          className={`btn-theme-menu-trigger ${isThemeMenuOpen ? 'active' : ''}`}
          onClick={() => setIsThemeMenuOpen((prev) => !prev)}
          title={t('themeQuickSwitchTooltip')}
          id="btn-theme-menu-trigger"
          aria-expanded={isThemeMenuOpen}
        >
          <span className="theme-trigger-icon">{activeTheme.icon || '🎨'}</span>
          <span className="theme-trigger-swatch" style={{ background: activeTheme.tokens.primaryGradient }} />
          <span className="theme-trigger-arrow">{isThemeMenuOpen ? '▲' : '▼'}</span>
        </button>
      </div>

      {isThemeMenuOpen && (
        <div className="theme-dropdown-menu" role="menu">
          <div className="theme-dropdown-header">
            <span>{t('themePresetsLabel')}</span>
          </div>
          <div className="theme-dropdown-list">
            {allPresets.map((preset) => {
              const isSelected = preset.id === themeId;
              const name = 'nameKey' in preset ? t(preset.nameKey as any) : preset.name;
              return (
                <button
                  key={preset.id}
                  type="button"
                  className={`theme-dropdown-item ${isSelected ? 'active' : ''}`}
                  onClick={() => {
                    setThemeId(preset.id);
                    setIsThemeMenuOpen(false);
                  }}
                >
                  <span className="theme-item-icon">{preset.icon || '🎨'}</span>
                  <span className="theme-item-name">{name}</span>
                  <div className="theme-item-preview-dots">
                    {preset.previewColors.map((color, idx) => (
                      <span
                        key={idx}
                        className="theme-preview-dot"
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                  {isSelected && <span className="theme-item-check">✓</span>}
                </button>
              );
            })}
          </div>
          {onOpenAppearanceSettings && (
            <div className="theme-dropdown-footer">
              <button
                type="button"
                className="btn-dropdown-customize"
                onClick={() => {
                  setIsThemeMenuOpen(false);
                  onOpenAppearanceSettings();
                }}
              >
                🎨 {t('customThemeBuilder')}...
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export { HeaderTheme };
