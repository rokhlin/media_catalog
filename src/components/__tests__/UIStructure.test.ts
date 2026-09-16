import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('UI Refactoring Architecture & Feature Grouping', () => {
  it('should verify screens folder exists and contains dedicated tab screens', () => {
    const screensDir = path.resolve('src/screens');
    assert.ok(fs.existsSync(screensDir), 'screens/ folder must exist');

    const expectedScreens = [
      'GalleryScreen.tsx',
      'DuplicatesScreen.tsx',
      'VaultScreen.tsx',
      'MediaLibraryScreen.tsx',
      'FamilyTreeScreen.tsx',
      'SettingsScreen.tsx',
      'AdminScreen.tsx',
      'index.ts',
    ];
    for (const file of expectedScreens) {
      assert.ok(
        fs.existsSync(path.join(screensDir, file)),
        `screens/${file} must exist`
      );
    }
  });

  it('should verify components/common folder contains generic UI components', () => {
    const commonDir = path.resolve('src/components/common');
    assert.ok(fs.existsSync(commonDir), 'components/common/ folder must exist');

    const expectedCommon = [
      'Button.tsx',
      'Toggle.tsx',
      'ImageView.tsx',
      'ModalContainer.tsx',
      'common.css',
      'index.ts',
    ];
    for (const file of expectedCommon) {
      assert.ok(
        fs.existsSync(path.join(commonDir, file)),
        `components/common/${file} must exist`
      );
    }
  });

  it('should verify components/header folder contains Header and all subcomponents', () => {
    const headerDir = path.resolve('src/components/header');
    assert.ok(fs.existsSync(headerDir), 'components/header/ folder must exist');

    const expectedHeaderFiles = [
      'Header.tsx',
      'HeaderBrandWrap.tsx',
      'HeaderNavTabs.tsx',
      'HeaderTheme.tsx',
      'HeaderProfile.tsx',
      'HeaderLanguage.tsx',
      'HeaderVaultToggle.tsx',
      'HeaderLogsToggle.tsx',
      'HeaderSettings.tsx',
      'HeaderStatusBadge.tsx',
      'index.ts',
    ];
    for (const file of expectedHeaderFiles) {
      assert.ok(
        fs.existsSync(path.join(headerDir, file)),
        `components/header/${file} must exist`
      );
    }
  });

  it('should verify components feature folders exist with index barrel exports', () => {
    const featureFolders = [
      'gallery',
      'faces',
      'duplicates',
      'settings',
      'admin',
      'modals',
      'logs',
    ];
    for (const folder of featureFolders) {
      const folderPath = path.resolve('src/components', folder);
      assert.ok(fs.existsSync(folderPath), `components/${folder}/ folder must exist`);
      assert.ok(
        fs.existsSync(path.join(folderPath, 'index.ts')),
        `components/${folder}/index.ts must exist`
      );
    }
  });

  it('should verify components/index.ts exports all features and common components', () => {
    const indexPath = path.resolve('src/components/index.ts');
    assert.ok(fs.existsSync(indexPath), 'components/index.ts must exist');

    const content = fs.readFileSync(indexPath, 'utf8');
    assert.ok(
      content.includes("export * from './header';") || content.includes("export * from './header/index';"),
      'Must export header'
    );
    assert.ok(content.includes("export * from './gallery';"), 'Must export gallery');
    assert.ok(content.includes("export * from './faces';"), 'Must export faces');
    assert.ok(content.includes("export * from './duplicates';"), 'Must export duplicates');
    assert.ok(content.includes("export * from './settings';"), 'Must export settings');
    assert.ok(content.includes("export * from './admin';"), 'Must export admin');
    assert.ok(content.includes("export * from './modals';"), 'Must export modals');
    assert.ok(content.includes("export * from './logs';"), 'Must export logs');
    assert.ok(content.includes("export * from './common';"), 'Must export common');
  });

  it('should verify no loose component files or proxies remain in src/components/', () => {
    const rootComponentsDir = path.resolve('src/components');
    const files = fs
      .readdirSync(rootComponentsDir)
      .filter((f) => !fs.statSync(path.join(rootComponentsDir, f)).isDirectory());
    const looseComponents = files.filter(
      (f) => f.endsWith('.tsx') || f.endsWith('.css')
    );
    assert.deepStrictEqual(
      looseComponents,
      [],
      'No .tsx or .css files should remain loose in src/components/'
    );
  });
});
