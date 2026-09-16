import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('ViewSwitcherButtonGroup Component & Dropdown Feature Flag', () => {
  it('should have dedicated ViewSwitcherButtonGroup component exported', () => {
    const componentPath = path.resolve('src/components/gallery/ViewSwitcherButtonGroup.tsx');
    assert.ok(fs.existsSync(componentPath), 'ViewSwitcherButtonGroup.tsx should exist in gallery folder');

    const content = fs.readFileSync(componentPath, 'utf8');
    assert.ok(
      content.includes('export const ViewSwitcherButtonGroup') ||
        content.includes('export default ViewSwitcherButtonGroup'),
      'Must export ViewSwitcherButtonGroup component'
    );
    assert.ok(
      content.includes('interface ViewSwitcherButtonGroupProps'),
      'Must define ViewSwitcherButtonGroupProps interface'
    );
    assert.ok(content.includes('useLanguage'), 'Must utilize i18n Language context');
    assert.ok(
      content.includes('view_switcher_dropdown'),
      'Must check view_switcher_dropdown feature flag'
    );
  });

  it('should define VIEW_OPTIONS covering all gallery view modes', () => {
    const componentPath = path.resolve('src/components/gallery/ViewSwitcherButtonGroup.tsx');
    const content = fs.readFileSync(componentPath, 'utf8');

    assert.ok(content.includes("'gallery'"), 'Should support gallery view mode');
    assert.ok(content.includes("'list'"), 'Should support list view mode');
    assert.ok(content.includes("'folder_tree'"), 'Should support folder_tree view mode');
    assert.ok(content.includes("'date_grouped'"), 'Should support date_grouped view mode');
    assert.ok(content.includes("'person_grouped'"), 'Should support person_grouped view mode');
  });

  it('should have dedicated ViewSwitcherButtonGroup.css with theme variables and dropdown styles', () => {
    const cssPath = path.resolve('src/components/gallery/ViewSwitcherButtonGroup.css');
    assert.ok(fs.existsSync(cssPath), 'ViewSwitcherButtonGroup.css should exist in gallery folder');

    const cssContent = fs.readFileSync(cssPath, 'utf8');
    assert.ok(
      cssContent.includes('.view-switcher-dropdown-wrap') ||
        cssContent.includes('.view-switcher-dropdown-menu'),
      'Must define dropdown menu styles'
    );
    assert.ok(
      cssContent.includes('.view-switcher-group'),
      'Must define button group styles'
    );
    assert.ok(cssContent.includes('var('), 'Must utilize CSS theme variables');
  });

  it('should verify MediaGallery utilizes ViewSwitcherButtonGroup and does not inline buttons', () => {
    const galleryPath = path.resolve('src/components/gallery/MediaGallery.tsx');
    const galleryContent = fs.readFileSync(galleryPath, 'utf8');

    assert.ok(
      galleryContent.includes("import ViewSwitcherButtonGroup from './ViewSwitcherButtonGroup'"),
      'MediaGallery must import ViewSwitcherButtonGroup'
    );
    assert.ok(
      galleryContent.includes('<ViewSwitcherButtonGroup'),
      'MediaGallery must render ViewSwitcherButtonGroup component'
    );
    assert.ok(
      !galleryContent.includes("onClick={() => setViewMode('gallery')}"),
      'MediaGallery must not contain inline view switcher buttons'
    );
  });

  it('should verify data/feature_flags.json includes view_switcher_dropdown preset', () => {
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
    const flag = flags.find((f: any) => f.key === 'view_switcher_dropdown');

    assert.ok(flag, 'view_switcher_dropdown flag must be in feature_flags.json');
    assert.strictEqual(
      typeof flag.isEnabled,
      'boolean',
      'view_switcher_dropdown isEnabled should be a boolean'
    );
    assert.ok(
      flag.classNames.includes('view-switcher-dropdown'),
      'classNames should include view-switcher-dropdown'
    );
  });
});
