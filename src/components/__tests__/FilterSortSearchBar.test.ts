import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('FilterSortSearchBar Component & Feature Flag', () => {
  it('should have dedicated FilterSortSearchBar component exported', () => {
    const componentPath = path.resolve('src/components/gallery/FilterSortSearchBar.tsx');
    assert.ok(fs.existsSync(componentPath), 'FilterSortSearchBar.tsx should exist in gallery folder');

    const content = fs.readFileSync(componentPath, 'utf8');
    assert.ok(
      content.includes('export const FilterSortSearchBar') ||
        content.includes('export default FilterSortSearchBar'),
      'Must export FilterSortSearchBar component'
    );
    assert.ok(
      content.includes('interface FilterSortSearchBarProps'),
      'Must define FilterSortSearchBarProps interface'
    );
    assert.ok(content.includes('useLanguage'), 'Must utilize i18n Language context');
    assert.ok(
      content.includes('filter_bar_dropdown'),
      'Must check filter_bar_dropdown feature flag'
    );
  });

  it('should support search, type filters, status filters, and sorting', () => {
    const componentPath = path.resolve('src/components/gallery/FilterSortSearchBar.tsx');
    const content = fs.readFileSync(componentPath, 'utf8');

    assert.ok(content.includes('searchQuery'), 'Should support searchQuery');
    assert.ok(content.includes('typeFilter'), 'Should support typeFilter');
    assert.ok(content.includes('statusFilter'), 'Should support statusFilter');
    assert.ok(content.includes('faceFilter'), 'Should support faceFilter');
    assert.ok(content.includes('selectedPerson'), 'Should support selectedPerson');
    assert.ok(content.includes('sortBy'), 'Should support sortBy');
    assert.ok(content.includes('sortOrder'), 'Should support sortOrder');
  });

  it('should have dedicated FilterSortSearchBar.css with theme variables and dropdown styles', () => {
    const cssPath = path.resolve('src/components/gallery/FilterSortSearchBar.css');
    assert.ok(fs.existsSync(cssPath), 'FilterSortSearchBar.css should exist in gallery folder');

    const cssContent = fs.readFileSync(cssPath, 'utf8');
    assert.ok(
      cssContent.includes('.filter-sort-dropdown-wrap') ||
        cssContent.includes('.filter-sort-dropdown-menu'),
      'Must define dropdown menu styles'
    );
    assert.ok(cssContent.includes('var('), 'Must utilize CSS theme variables');
  });

  it('should verify MediaGallery utilizes FilterSortSearchBar component', () => {
    const galleryPath = path.resolve('src/components/gallery/MediaGallery.tsx');
    const galleryContent = fs.readFileSync(galleryPath, 'utf8');

    assert.ok(
      galleryContent.includes("import FilterSortSearchBar from './FilterSortSearchBar'"),
      'MediaGallery must import FilterSortSearchBar'
    );
    assert.ok(
      galleryContent.includes('<FilterSortSearchBar'),
      'MediaGallery must render FilterSortSearchBar component'
    );
  });

  it('should verify data/feature_flags.json includes filter_bar_dropdown preset', () => {
    const jsonPath = path.resolve('data/feature_flags.json');
    if (!fs.existsSync(jsonPath)) {
      const defaultPath = path.resolve('assets/default-feature-flags.json');
      if (fs.existsSync(defaultPath)) {
        fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
        fs.copyFileSync(defaultPath, jsonPath);
      }
    }
    assert.ok(fs.existsSync(jsonPath), 'data/feature_flags.json must exist');

    const flags = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const flag = flags.find((f: any) => f.key === 'filter_bar_dropdown');

    assert.ok(flag, 'filter_bar_dropdown flag must be in feature_flags.json');
    assert.strictEqual(
      typeof flag.isEnabled,
      'boolean',
      'filter_bar_dropdown isEnabled should be a boolean'
    );
    assert.ok(
      flag.classNames.includes('filter-bar-dropdown'),
      'classNames should include filter-bar-dropdown'
    );
  });

  it('should verify SearchBar is exported and rendered in MediaGallery gallery-title-wrap', () => {
    const componentPath = path.resolve('src/components/gallery/FilterSortSearchBar.tsx');
    const content = fs.readFileSync(componentPath, 'utf8');

    assert.ok(
      content.includes('export const SearchBar') && content.includes('interface SearchBarProps'),
      'FilterSortSearchBar must export SearchBar component and SearchBarProps interface'
    );

    const galleryPath = path.resolve('src/components/gallery/MediaGallery.tsx');
    const galleryContent = fs.readFileSync(galleryPath, 'utf8');

    assert.ok(
      galleryContent.includes('gallery-title-wrap') && galleryContent.includes('<SearchBar'),
      'MediaGallery must render SearchBar inside gallery-title-wrap'
    );
  });

  it('should verify min chars to start search is 3 letters', () => {
    const componentPath = path.resolve('src/components/gallery/FilterSortSearchBar.tsx');
    const content = fs.readFileSync(componentPath, 'utf8');

    assert.ok(
      content.includes('trimmedSearch.length < 3') && content.includes('{trimmedSearch.length}/3'),
      'SearchBar must show hint for less than 3 characters'
    );

    const workerPath = path.resolve('src/services/mediaOrganization.worker.ts');
    const workerContent = fs.readFileSync(workerPath, 'utf8');

    assert.ok(
      workerContent.includes('trimmedSearch.length >= 3'),
      'Worker must activate search at 3 characters'
    );
  });
});
