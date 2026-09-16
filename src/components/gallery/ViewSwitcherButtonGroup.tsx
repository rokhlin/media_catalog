import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { GalleryViewMode } from '../../models/media';
import type { GalleryTranslations } from '../../models/i18n';
import { useLanguage } from '../../i18n/LanguageContext';
import { useFeatureFlags, FlagsManager } from '../../services/featureFlagsContext';
import './ViewSwitcherButtonGroup.css';

export interface ViewSwitcherOption {
  key: GalleryViewMode;
  labelKey: keyof GalleryTranslations;
  icon: string;
}

export const VIEW_OPTIONS: ViewSwitcherOption[] = [
  { key: 'gallery', labelKey: 'viewModeGallery', icon: '🔲' },
  { key: 'list', labelKey: 'viewModeList', icon: '📋' },
  { key: 'folder_tree', labelKey: 'viewModeTree', icon: '📁' },
  { key: 'date_grouped', labelKey: 'viewModeDate', icon: '📅' },
  { key: 'person_grouped', labelKey: 'viewModePerson', icon: '👥' },
];

export interface ViewSwitcherButtonGroupProps {
  viewMode: GalleryViewMode;
  onViewModeChange: (mode: GalleryViewMode) => void;
  isSimilarityGrouped?: boolean;
  onToggleSimilarityGrouped?: () => void;
  /**
   * Explicitly override whether to render as dropdown list or buttons.
   * If not specified, the 'view_switcher_dropdown' feature flag is used.
   */
  asDropdown?: boolean;
  className?: string;
  id?: string;
}

export const ViewSwitcherButtonGroup: React.FC<ViewSwitcherButtonGroupProps> = ({
  viewMode,
  onViewModeChange,
  isSimilarityGrouped = false,
  onToggleSimilarityGrouped,
  asDropdown,
  className = '',
  id = 'view-switcher-button-group',
}) => {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Feature Flag: show list (dropdown) if flag is active, and buttons if inactive
  let isFeatureFlagDropdownActive = false;
  try {
    const { isFeatureEnabled } = useFeatureFlags();
    isFeatureFlagDropdownActive = isFeatureEnabled('view_switcher_dropdown');
  } catch {
    isFeatureFlagDropdownActive = FlagsManager.IsActive('view_switcher_dropdown', false);
  }

  const renderAsDropdown = asDropdown !== undefined ? asDropdown : isFeatureFlagDropdownActive;

  // Close dropdown on click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleSelectView = useCallback(
    (mode: GalleryViewMode) => {
      onViewModeChange(mode);
      setIsOpen(false);
    },
    [onViewModeChange]
  );

  const currentOption = VIEW_OPTIONS.find((opt) => opt.key === viewMode) || VIEW_OPTIONS[0];

  const similarityTitle =
    (t as any)('toggleSimilarityGrouping') || 'Group Similar & Burst Photos';
  const similarityLabel = (t as any)('groupSimilar') || 'Group Similar';

  // --------------------------------------------------------------------------
  // Variant 1: Dropdown List Menu View (when feature flag is active)
  // --------------------------------------------------------------------------
  if (renderAsDropdown) {
    return (
      <div
        id={id}
        className={`view-switcher-container view-switcher-dropdown-container view-mode-selector view-switcher-dropdown ${className}`.trim()}
        ref={dropdownRef}
      >
        <div className="view-switcher-dropdown-wrap">
          <button
            type="button"
            id={`${id}-dropdown-btn`}
            className={`view-switcher-dropdown-btn ${isOpen ? 'open' : ''}`}
            onClick={() => setIsOpen((prev) => !prev)}
            aria-haspopup="listbox"
            aria-expanded={isOpen}
            title={t(currentOption.labelKey) as string}
          >
            <span className="view-switcher-current-icon">{currentOption.icon}</span>
            <span className="view-switcher-current-label">
              {t(currentOption.labelKey) as string}
            </span>
            <span className="view-switcher-dropdown-caret" aria-hidden="true">
              ▼
            </span>
          </button>

          {isOpen && (
            <div
              className="view-switcher-dropdown-menu"
              role="listbox"
              id={`${id}-dropdown-menu`}
              aria-label="Gallery View Options"
            >
              {VIEW_OPTIONS.map((opt) => {
                const isActive = viewMode === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    className={`view-switcher-menu-item ${isActive ? 'active' : ''}`}
                    onClick={() => handleSelectView(opt.key)}
                  >
                    <span className="view-switcher-menu-item-label">
                      <span>{opt.icon}</span>
                      <span>{t(opt.labelKey) as string}</span>
                    </span>
                    {isActive && <span className="view-switcher-menu-check">✓</span>}
                  </button>
                );
              })}

              {onToggleSimilarityGrouped && (
                <>
                  <div className="view-switcher-menu-divider" />
                  <button
                    type="button"
                    className={`view-switcher-menu-item view-switcher-menu-toggle ${isSimilarityGrouped ? 'active' : ''
                      }`}
                    onClick={() => {
                      onToggleSimilarityGrouped();
                      setIsOpen(false);
                    }}
                    title={similarityTitle}
                  >
                    <span className="view-switcher-menu-item-label">
                      <span>✨</span>
                      <span>{similarityLabel}</span>
                    </span>
                    {isSimilarityGrouped && <span className="view-switcher-menu-check">✓</span>}
                  </button>
                </>
              )}
            </div>
          )}
        </div>


      </div>
    );
  }

  // --------------------------------------------------------------------------
  // Variant 2: Standard Button Group View (when feature flag is inactive)
  // --------------------------------------------------------------------------
  return (
    <div
      id={id}
      className={`filter-button-group view-switcher-group view-mode-selector ${className}`.trim()}
    >
      {VIEW_OPTIONS.map((opt) => {
        const isActive = viewMode === opt.key;
        return (
          <button
            key={opt.key}
            type="button"
            className={`filter-btn ${isActive ? 'active' : ''}`}
            onClick={() => onViewModeChange(opt.key)}
            title={t(opt.labelKey) as string}
          >
            {opt.icon} {t(opt.labelKey) as string}
          </button>
        );
      })}

      {onToggleSimilarityGrouped && (
        <button
          type="button"
          className={`filter-btn view-switcher-similar-btn ${isSimilarityGrouped ? 'active' : ''}`}
          onClick={onToggleSimilarityGrouped}
          title={similarityTitle}
          style={{
            background: isSimilarityGrouped
              ? 'var(--nav-tab-active-bg, rgba(99, 102, 241, 0.25))'
              : undefined,
            borderColor: isSimilarityGrouped ? 'var(--primary-color, #6366f1)' : undefined,
          }}
        >
          ✨ {similarityLabel}
        </button>
      )}
    </div>
  );
};

export default ViewSwitcherButtonGroup;
