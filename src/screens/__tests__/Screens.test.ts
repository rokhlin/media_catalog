import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('Dedicated Application Screens', () => {
  const screens = [
    'GalleryScreen.tsx',
    'DuplicatesScreen.tsx',
    'VaultScreen.tsx',
    'MediaLibraryScreen.tsx',
    'FamilyTreeScreen.tsx',
    'SettingsScreen.tsx',
    'AdminScreen.tsx',
  ];

  screens.forEach((screen) => {
    it(`should verify ${screen} exists and has default and named exports`, () => {
      const screenPath = path.resolve(`src/screens/${screen}`);
      assert.ok(fs.existsSync(screenPath), `${screen} should exist in src/screens/`);

      const content = fs.readFileSync(screenPath, 'utf8');
      const baseName = screen.replace('.tsx', '');
      assert.ok(
        content.includes(`export default function ${baseName}`) || content.includes(`export default function`),
        `${screen} must export default function`
      );
      assert.ok(
        content.includes(`export { ${baseName} }`),
        `${screen} must export named ${baseName}`
      );
    });
  });

  it('should verify screens/index.ts exports all 7 screens', () => {
    const indexPath = path.resolve('src/screens/index.ts');
    assert.ok(fs.existsSync(indexPath), 'screens/index.ts should exist');

    const content = fs.readFileSync(indexPath, 'utf8');
    assert.ok(content.includes('GalleryScreen'), 'index.ts must export GalleryScreen');
    assert.ok(content.includes('DuplicatesScreen'), 'index.ts must export DuplicatesScreen');
    assert.ok(content.includes('VaultScreen'), 'index.ts must export VaultScreen');
    assert.ok(content.includes('MediaLibraryScreen'), 'index.ts must export MediaLibraryScreen');
    assert.ok(content.includes('FamilyTreeScreen'), 'index.ts must export FamilyTreeScreen');
    assert.ok(content.includes('SettingsScreen'), 'index.ts must export SettingsScreen');
    assert.ok(content.includes('AdminScreen'), 'index.ts must export AdminScreen');
  });

  it('should verify App.tsx imports screens and delegates tab rendering', () => {
    const appPath = path.resolve('src/App.tsx');
    assert.ok(fs.existsSync(appPath), 'App.tsx should exist');

    const content = fs.readFileSync(appPath, 'utf8');
    assert.ok(content.includes("from './screens'"), 'App.tsx must import from screens');
    assert.ok(content.includes('<GalleryScreen'), 'App.tsx must render GalleryScreen');
    assert.ok(content.includes('<DuplicatesScreen'), 'App.tsx must render DuplicatesScreen');
    assert.ok(content.includes('<VaultScreen'), 'App.tsx must render VaultScreen');
    assert.ok(content.includes('<MediaLibraryScreen'), 'App.tsx must render MediaLibraryScreen');
    assert.ok(content.includes('<FamilyTreeScreen'), 'App.tsx must render FamilyTreeScreen');
    assert.ok(content.includes('<SettingsScreen'), 'App.tsx must render SettingsScreen');
    assert.ok(content.includes('<AdminScreen'), 'App.tsx must render AdminScreen');
  });
});
