import React, { useState, useRef, useEffect, useMemo } from 'react';
import type { MediaSortField, MediaSortOrder } from '../../models';
import { useLanguage } from '../../i18n/LanguageContext';
import { useFeatureFlags, FlagsManager } from '../../services/featureFlagsContext';
import './FilterSortSearchBar.css';

export interface SearchBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  placeholder?: string;
  className?: string;
  isCompact?: boolean;
  style?: React.CSSProperties;
  id?: string;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  searchQuery,
  onSearchChange,
  placeholder,
  className = '',
  isCompact = false,
  style,
  id,
}) => {
  const { t } = useLanguage();
  const trimmedSearch = (searchQuery || '').trim();

  return (
    <div
      id={id}
      className={`search-box ${className}`.trim()}
      style={{
        flex: isCompact ? 'none' : 1,
        minWidth: isCompact ? '100%' : '240px',
        margin: 0,
        position: 'relative',
        ...style,
      }}
    >
      <span className="search-icon">🔍</span>
      <input
        type="text"
        className="input-control"
        placeholder={placeholder || t('searchPlaceholder')}
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        style={{ paddingRight: searchQuery ? '5rem' : '1rem', width: '100%' }}
      />
      {searchQuery && (
        <div className="search-status-tag-wrap">
          {trimmedSearch.length > 0 && trimmedSearch.length < 3 ? (
            <span className="search-min-hint" title={t('searchHint')}>
              {trimmedSearch.length}/3
            </span>
          ) : (
            <span className="search-active-hint" title="Active">
              ✓ {t('searchActiveStatus')}
            </span>
          )}
          <button
            type="button"
            className="search-clear-inline-btn"
            onClick={() => onSearchChange('')}
            title="Clear"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
};

export interface FilterSortSearchBarProps {
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  showSearch?: boolean;
  typeFilter: 'all' | 'images' | 'videos';
  onTypeFilterChange: (type: 'all' | 'images' | 'videos') => void;
  statusFilter: 'all' | 'PROCESSED' | 'UNPROCESSED' | 'PENDING';
  onStatusFilterChange: (status: 'all' | 'PROCESSED' | 'UNPROCESSED' | 'PENDING') => void;
  faceFilter: 'all' | 'with_faces' | 'no_faces' | 'unassigned';
  onFaceFilterChange: (filter: 'all' | 'with_faces' | 'no_faces' | 'unassigned') => void;
  selectedPerson: string;
  onPersonChange: (person: string) => void;
  distinctPeople: [string, number][];
  sortBy: MediaSortField;
  onSortByChange: (field: MediaSortField) => void;
  sortOrder: MediaSortOrder;
  onToggleSortOrder: () => void;
  selectedFolder?: string | null;
  onClearFolder?: () => void;
  hasActiveFilters?: boolean;
  onResetFilters?: () => void;
  asDropdown?: boolean;
  className?: string;
  id?: string;
}

export const FilterSortSearchBar: React.FC<FilterSortSearchBarProps> = ({
  searchQuery = '',
  onSearchChange,
  showSearch = false,
  typeFilter,
  onTypeFilterChange,
  statusFilter,
  onStatusFilterChange,
  faceFilter,
  onFaceFilterChange,
  selectedPerson,
  onPersonChange,
  distinctPeople,
  sortBy,
  onSortByChange,
  sortOrder,
  onToggleSortOrder,
  selectedFolder,
  onClearFolder,
  hasActiveFilters = false,
  onResetFilters,
  asDropdown,
  className = '',
  id = 'filter-sort-search-bar',
}) => {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  let isFeatureFlagDropdownActive = false;
  try {
    const { isFeatureEnabled } = useFeatureFlags();
    isFeatureFlagDropdownActive = isFeatureEnabled('filter_bar_dropdown');
  } catch {
    isFeatureFlagDropdownActive = FlagsManager.IsActive('filter_bar_dropdown', false);
  }

  const renderAsDropdown = asDropdown !== undefined ? asDropdown : isFeatureFlagDropdownActive;

  // Click outside to close dropdown
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

  const trimmedSearch = (searchQuery || '').trim();

  // Active filter count calculation
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (typeFilter !== 'all') count++;
    if (statusFilter !== 'all') count++;
    if (faceFilter !== 'all') count++;
    if (selectedPerson !== 'all') count++;
    if (showSearch && trimmedSearch.length > 0) count++;
    if (selectedFolder) count++;
    return count;
  }, [typeFilter, statusFilter, faceFilter, selectedPerson, trimmedSearch, selectedFolder, showSearch]);

  // Common Search Input element
  const renderSearchInput = (isCompact = false) =>
    onSearchChange ? (
      <SearchBar
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
        isCompact={isCompact}
      />
    ) : null;

  // Common Folder Filter Pill
  const renderFolderPill = () =>
    selectedFolder && (
      <span
        className="badge-pill badge-pill-accent"
        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.78rem' }}
      >
        📁 {selectedFolder.split(/[/\\]/).pop()}
        {onClearFolder && (
          <button
            type="button"
            style={{
              background: 'none',
              border: 'none',
              color: 'inherit',
              cursor: 'pointer',
              padding: 0,
            }}
            onClick={onClearFolder}
            title={t('clearFolderFilter')}
          >
            ✕
          </button>
        )}
      </span>
    );

  // --------------------------------------------------------------------------
  // Variant 1: Dropdown Menu Mode (when feature flag is active)
  // --------------------------------------------------------------------------
  if (renderAsDropdown) {
    return (
      <div
        id={id}
        className={`filter-sort-container filter-sort-dropdown-container filter-bar-dropdown ${className}`.trim()}
        ref={dropdownRef}
      >
        <div className="filter-sort-dropdown-wrap">
          <button
            type="button"
            id={`${id}-dropdown-btn`}
            className={`filter-sort-dropdown-btn ${isOpen ? 'open' : ''}`}
            onClick={() => setIsOpen((prev) => !prev)}
            aria-haspopup="dialog"
            aria-expanded={isOpen}
            title={t('filterAllTypes') || 'Filter & Sort'}
          >
            <span>{t('sortBy') || 'Filter & Sort'}</span>
            {activeFiltersCount > 0 && (
              <span className="filter-active-badge">{activeFiltersCount}</span>
            )}
            <span className="filter-sort-dropdown-caret" aria-hidden="true">
              ▼
            </span>
          </button>

          {renderFolderPill()}

          {isOpen && (
            <div
              className="filter-sort-dropdown-menu"
              role="dialog"
              id={`${id}-dropdown-menu`}
              aria-label="Filter and Sort Options"
            >
              {/* Search Box in Dropdown */}
              {showSearch && onSearchChange && (
                <>
                  <div className="filter-dropdown-section">
                    <span className="filter-dropdown-section-title">Search</span>
                    {renderSearchInput(true)}
                  </div>
                  <div className="filter-dropdown-divider" />
                </>
              )}

              {/* Type Filter */}
              <div className="filter-dropdown-section">
                <span className="filter-dropdown-section-title">Media Type</span>
                <div className="filter-button-group">
                  <button
                    className={`filter-btn ${typeFilter === 'all' ? 'active' : ''}`}
                    onClick={() => onTypeFilterChange('all')}
                    type="button"
                  >
                    {t('filterAllTypes')}
                  </button>
                  <button
                    className={`filter-btn ${typeFilter === 'images' ? 'active' : ''}`}
                    onClick={() => onTypeFilterChange('images')}
                    type="button"
                  >
                    {t('filterImages')}
                  </button>
                  <button
                    className={`filter-btn ${typeFilter === 'videos' ? 'active' : ''}`}
                    onClick={() => onTypeFilterChange('videos')}
                    type="button"
                  >
                    {t('filterVideos')}
                  </button>
                </div>
              </div>

              {/* Status Filter */}
              <div className="filter-dropdown-section">
                <span className="filter-dropdown-section-title">Status</span>
                <div className="filter-button-group">
                  <button
                    className={`filter-btn ${statusFilter === 'all' ? 'active' : ''}`}
                    onClick={() => onStatusFilterChange('all')}
                    type="button"
                  >
                    {t('filterAllStatus')}
                  </button>
                  <button
                    className={`filter-btn ${statusFilter === 'PROCESSED' ? 'active' : ''}`}
                    onClick={() => onStatusFilterChange('PROCESSED')}
                    type="button"
                  >
                    {t('filterProcessed')}
                  </button>
                  <button
                    className={`filter-btn ${statusFilter === 'UNPROCESSED' ? 'active' : ''}`}
                    onClick={() => onStatusFilterChange('UNPROCESSED')}
                    type="button"
                  >
                    {t('filterUnprocessed')}
                  </button>
                  <button
                    className={`filter-btn ${statusFilter === 'PENDING' ? 'active' : ''}`}
                    onClick={() => onStatusFilterChange('PENDING')}
                    type="button"
                  >
                    {t('filterPending')}
                  </button>
                </div>
              </div>

              {/* Face Mode & Person Filter */}
              <div className="filter-dropdown-section">
                <span className="filter-dropdown-section-title">Faces & People</span>
                <div className="filter-dropdown-row">
                  <div className="filter-button-group">
                    <button
                      className={`filter-btn ${faceFilter === 'all' ? 'active' : ''}`}
                      onClick={() => onFaceFilterChange('all')}
                      type="button"
                    >
                      {t('filterFaceAll')}
                    </button>
                    <button
                      className={`filter-btn ${faceFilter === 'with_faces' ? 'active' : ''}`}
                      onClick={() => onFaceFilterChange('with_faces')}
                      type="button"
                    >
                      {t('filterFaceWith')}
                    </button>
                    <button
                      className={`filter-btn ${faceFilter === 'no_faces' ? 'active' : ''}`}
                      onClick={() => onFaceFilterChange('no_faces')}
                      type="button"
                    >
                      {t('filterFaceWithout')}
                    </button>
                    <button
                      className={`filter-btn ${faceFilter === 'unassigned' ? 'active' : ''}`}
                      onClick={() => onFaceFilterChange('unassigned')}
                      type="button"
                    >
                      {t('filterFaceUnassigned')}
                    </button>
                  </div>

                  <select
                    className="input-control"
                    value={selectedPerson}
                    onChange={(e) => onPersonChange(e.target.value)}
                    style={{ padding: '0.35rem 0.65rem', fontSize: '0.82rem', minWidth: '120px' }}
                  >
                    <option value="all">{t('filterPersonAll')}</option>
                    {distinctPeople.map(([name, count]) => (
                      <option key={name} value={name}>
                        👤 {name} ({count})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Sort Controls */}
              <div className="filter-dropdown-section">
                <span className="filter-dropdown-section-title">Sort By</span>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                  <select
                    className="input-control"
                    value={sortBy}
                    onChange={(e) => onSortByChange(e.target.value as MediaSortField)}
                    style={{ padding: '0.35rem 0.65rem', fontSize: '0.82rem', flex: 1 }}
                    title={t('sortBy')}
                  >
                    <option value="date">📅 {t('colDate')}</option>
                    <option value="name">🔤 {t('colFilename')}</option>
                    <option value="size">💾 {t('colSize')}</option>
                    <option value="status">📊 {t('colStatus')}</option>
                    <option value="faces">👤 {t('colFaces')}</option>
                  </select>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ padding: '0.35rem 0.6rem', fontSize: '0.82rem' }}
                    onClick={onToggleSortOrder}
                    title={`${t('sortOrder')}: ${sortOrder === 'asc' ? t('sortAsc') : t('sortDesc')}`}
                  >
                    {sortOrder === 'asc' ? '↑' : '↓'}
                  </button>
                </div>
              </div>

              {/* Footer */}
              <div className="filter-dropdown-footer">
                {hasActiveFilters && onResetFilters ? (
                  <button
                    className="btn btn-secondary"
                    onClick={() => {
                      onResetFilters();
                      setIsOpen(false);
                    }}
                    type="button"
                    style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem', color: '#f87171' }}
                  >
                    {t('btnResetFilters')}
                  </button>
                ) : (
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    {activeFiltersCount === 0 ? 'No filters active' : `${activeFiltersCount} filters active`}
                  </span>
                )}
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ padding: '0.35rem 0.8rem', fontSize: '0.8rem' }}
                  onClick={() => setIsOpen(false)}
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // Variant 2: Standard Expanded Toolbar Row (when feature flag is inactive)
  // --------------------------------------------------------------------------
  return (
    <div
      id={id}
      className={`gallery-filters-row gallery-filter-bar ${className}`.trim()}
    >
      {/* Search Box */}
      {showSearch && onSearchChange && renderSearchInput(false)}

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Active Folder Filter Tag */}
        {renderFolderPill()}

        {/* Type Filter */}
        <div className="filter-button-group">
          <button
            className={`filter-btn ${typeFilter === 'all' ? 'active' : ''}`}
            onClick={() => onTypeFilterChange('all')}
            type="button"
          >
            {t('filterAllTypes')}
          </button>
          <button
            className={`filter-btn ${typeFilter === 'images' ? 'active' : ''}`}
            onClick={() => onTypeFilterChange('images')}
            type="button"
          >
            {t('filterImages')}
          </button>
          <button
            className={`filter-btn ${typeFilter === 'videos' ? 'active' : ''}`}
            onClick={() => onTypeFilterChange('videos')}
            type="button"
          >
            {t('filterVideos')}
          </button>
        </div>

        {/* Status Filter */}
        <div className="filter-button-group">
          <button
            className={`filter-btn ${statusFilter === 'all' ? 'active' : ''}`}
            onClick={() => onStatusFilterChange('all')}
            type="button"
          >
            {t('filterAllStatus')}
          </button>
          <button
            className={`filter-btn ${statusFilter === 'PROCESSED' ? 'active' : ''}`}
            onClick={() => onStatusFilterChange('PROCESSED')}
            type="button"
          >
            {t('filterProcessed')}
          </button>
          <button
            className={`filter-btn ${statusFilter === 'UNPROCESSED' ? 'active' : ''}`}
            onClick={() => onStatusFilterChange('UNPROCESSED')}
            type="button"
          >
            {t('filterUnprocessed')}
          </button>
          <button
            className={`filter-btn ${statusFilter === 'PENDING' ? 'active' : ''}`}
            onClick={() => onStatusFilterChange('PENDING')}
            type="button"
          >
            {t('filterPending')}
          </button>
        </div>

        {/* Face Mode Filter */}
        <div className="filter-button-group">
          <button
            className={`filter-btn ${faceFilter === 'all' ? 'active' : ''}`}
            onClick={() => onFaceFilterChange('all')}
            type="button"
          >
            {t('filterFaceAll')}
          </button>
          <button
            className={`filter-btn ${faceFilter === 'with_faces' ? 'active' : ''}`}
            onClick={() => onFaceFilterChange('with_faces')}
            type="button"
          >
            {t('filterFaceWith')}
          </button>
          <button
            className={`filter-btn ${faceFilter === 'no_faces' ? 'active' : ''}`}
            onClick={() => onFaceFilterChange('no_faces')}
            type="button"
          >
            {t('filterFaceWithout')}
          </button>
          <button
            className={`filter-btn ${faceFilter === 'unassigned' ? 'active' : ''}`}
            onClick={() => onFaceFilterChange('unassigned')}
            type="button"
          >
            {t('filterFaceUnassigned')}
          </button>
        </div>

        {/* Person Dropdown */}
        <select
          className="input-control"
          value={selectedPerson}
          onChange={(e) => onPersonChange(e.target.value)}
          style={{ padding: '0.35rem 0.65rem', fontSize: '0.82rem', minWidth: '120px' }}
        >
          <option value="all">{t('filterPersonAll')}</option>
          {distinctPeople.map(([name, count]) => (
            <option key={name} value={name}>
              👤 {name} ({count})
            </option>
          ))}
        </select>

        {/* Sort Field & Order */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
          <select
            className="input-control"
            value={sortBy}
            onChange={(e) => onSortByChange(e.target.value as MediaSortField)}
            style={{ padding: '0.35rem 0.65rem', fontSize: '0.82rem', minWidth: '100px' }}
            title={t('sortBy')}
          >
            <option value="date">📅 {t('colDate')}</option>
            <option value="name">🔤 {t('colFilename')}</option>
            <option value="size">💾 {t('colSize')}</option>
            <option value="status">📊 {t('colStatus')}</option>
            <option value="faces">👤 {t('colFaces')}</option>
          </select>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: '0.35rem 0.6rem', fontSize: '0.82rem' }}
            onClick={onToggleSortOrder}
            title={`${t('sortOrder')}: ${sortOrder === 'asc' ? t('sortAsc') : t('sortDesc')}`}
          >
            {sortOrder === 'asc' ? '↑' : '↓'}
          </button>
        </div>

        {hasActiveFilters && onResetFilters && (
          <button
            className="btn btn-secondary"
            onClick={onResetFilters}
            type="button"
            style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem', color: '#f87171' }}
          >
            {t('btnResetFilters')}
          </button>
        )}
      </div>
    </div>
  );
};

export default FilterSortSearchBar;
