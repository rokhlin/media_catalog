import React, { useState, useRef, useEffect } from 'react';
import { useLanguage } from '../../i18n/LanguageContext';
import { useFeatureFlags, FlagsManager } from '../../services/featureFlagsContext';
import './FaceRegistryUI.css';

export type FaceRegistryTabKey = 'groups' | 'persons' | 'all-unrecognized';

export interface FaceRegistryUIProps {
  activeTab?: FaceRegistryTabKey;
  onTabChange?: (tab: FaceRegistryTabKey) => void;
  clustersCount?: number;
  personsCount?: number;
  unrecognizedCount?: number;
  onOpenFaceRegistry?: () => void;
  onResetByFile?: () => void;
  asDropdown?: boolean;
  className?: string;
  id?: string;
}

export const FaceRegistryUI: React.FC<FaceRegistryUIProps> = ({
  activeTab = 'groups',
  onTabChange,
  clustersCount = 0,
  personsCount = 0,
  unrecognizedCount = 0,
  onOpenFaceRegistry,
  onResetByFile,
  asDropdown,
  className = '',
  id = 'face-registry-ui',
}) => {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  let isFeatureFlagDropdownActive = false;
  try {
    const { isFeatureEnabled } = useFeatureFlags();
    isFeatureFlagDropdownActive = isFeatureEnabled('face_registry_dropdown');
  } catch {
    isFeatureFlagDropdownActive = FlagsManager.IsActive('face_registry_dropdown', false);
  }

  const renderAsDropdown = asDropdown !== undefined ? asDropdown : isFeatureFlagDropdownActive;

  // Click outside and escape handling
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

  const totalFacesCount = clustersCount + personsCount + unrecognizedCount;

  const tabOptions: { key: FaceRegistryTabKey; label: string; icon: string; count: number }[] = [
    {
      key: 'groups',
      label: (t as any)('tabClusters') || 'Clusters',
      icon: '👥',
      count: clustersCount,
    },
    {
      key: 'persons',
      label: (t as any)('tabKnownPersons') || 'Known Persons',
      icon: '👤',
      count: personsCount,
    },
    {
      key: 'all-unrecognized',
      label: (t as any)('tabUnrecognizedFaces') || 'Unrecognized Faces',
      icon: '❓',
      count: unrecognizedCount,
    },
  ];

  // --------------------------------------------------------------------------
  // Variant 1: Dropdown Menu Mode (when feature flag is active)
  // --------------------------------------------------------------------------
  if (renderAsDropdown) {
    return (
      <div
        id={id}
        className={`face-registry-ui-container face-registry-dropdown-container face-registry-dropdown ${className}`.trim()}
        ref={dropdownRef}
      >
        <div className="face-registry-dropdown-wrap">
          <button
            type="button"
            id={`${id}-dropdown-btn`}
            className={`face-registry-dropdown-btn ${isOpen ? 'open' : ''}`}
            onClick={() => setIsOpen((prev) => !prev)}
            aria-haspopup="listbox"
            aria-expanded={isOpen}
            title={(t as any)('faceRegistryTitle') || 'Face Registry'}
          >
            <span>👤 {(t as any)('faceRegistryTitle') || 'Face Registry'}</span>
            {totalFacesCount > 0 && (
              <span className="face-registry-badge">{totalFacesCount}</span>
            )}
            <span className="face-registry-dropdown-caret" aria-hidden="true">
              ▼
            </span>
          </button>

          {isOpen && (
            <div
              className="face-registry-dropdown-menu"
              role="listbox"
              id={`${id}-dropdown-menu`}
              aria-label="Face Registry Options"
            >
              {tabOptions.map((opt) => {
                const isActive = activeTab === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    className={`face-registry-menu-item ${isActive ? 'active' : ''}`}
                    onClick={() => {
                      if (onTabChange) onTabChange(opt.key);
                      if (onOpenFaceRegistry) onOpenFaceRegistry();
                      setIsOpen(false);
                    }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span>{opt.icon}</span>
                      <span>{opt.label}</span>
                    </span>
                    <span className="badge-pill" style={{ fontSize: '0.72rem' }}>
                      {opt.count}
                    </span>
                  </button>
                );
              })}

              {(onOpenFaceRegistry || onResetByFile) && (
                <>
                  <div className="face-registry-menu-divider" />
                  {onOpenFaceRegistry && (
                    <button
                      type="button"
                      className="face-registry-menu-item"
                      onClick={() => {
                        onOpenFaceRegistry();
                        setIsOpen(false);
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span>📚</span>
                        <span>{(t as any)('navMediaLibrary') || 'Open Face Registry'}</span>
                      </span>
                      <span>➔</span>
                    </button>
                  )}
                  {onResetByFile && (
                    <button
                      type="button"
                      className="face-registry-menu-item"
                      onClick={() => {
                        onResetByFile();
                        setIsOpen(false);
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span>🔄</span>
                        <span>{(t as any)('btnResetByFile') || 'Reset Faces by File'}</span>
                      </span>
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // Variant 2: Standard Tab Buttons Mode (when feature flag is inactive)
  // --------------------------------------------------------------------------
  return (
    <div id={id} className={`face-tabs face-registry-tabs-wrap ${className}`.trim()}>
      {tabOptions.map((opt) => {
        const isActive = activeTab === opt.key;
        return (
          <button
            key={opt.key}
            type="button"
            className={`face-tab-btn ${isActive ? 'active' : ''}`}
            onClick={() => onTabChange && onTabChange(opt.key)}
          >
            <span>
              {opt.icon} {opt.label}
            </span>
            {opt.count > 0 ? (
              <span className="face-tab-badge">{opt.count}</span>
            ) : (
              <span className="badge-pill">0</span>
            )}
          </button>
        );
      })}

      {onOpenFaceRegistry && (
        <button
          type="button"
          className="btn btn-secondary"
          style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem' }}
          onClick={onOpenFaceRegistry}
          title={(t as any)('faceRegistryTitle') || 'Face Registry'}
        >
          👤 {(t as any)('faceRegistryTitle') || 'Face Registry'}
        </button>
      )}
    </div>
  );
};

export default FaceRegistryUI;
