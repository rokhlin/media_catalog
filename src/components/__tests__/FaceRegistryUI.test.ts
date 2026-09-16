import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('FaceRegistryUI Component & Feature Flag', () => {
  it('should have dedicated FaceRegistryUI component exported', () => {
    const componentPath = path.resolve('src/components/faces/FaceRegistryUI.tsx');
    assert.ok(fs.existsSync(componentPath), 'FaceRegistryUI.tsx should exist in faces folder');

    const content = fs.readFileSync(componentPath, 'utf8');
    assert.ok(
      content.includes('export const FaceRegistryUI') ||
        content.includes('export default FaceRegistryUI'),
      'Must export FaceRegistryUI component'
    );
    assert.ok(
      content.includes('interface FaceRegistryUIProps'),
      'Must define FaceRegistryUIProps interface'
    );
    assert.ok(content.includes('useLanguage'), 'Must utilize i18n Language context');
    assert.ok(
      content.includes('face_registry_dropdown'),
      'Must check face_registry_dropdown feature flag'
    );
  });

  it('should support clusters, known persons, and unrecognized faces tabs', () => {
    const componentPath = path.resolve('src/components/faces/FaceRegistryUI.tsx');
    const content = fs.readFileSync(componentPath, 'utf8');

    assert.ok(content.includes("'groups'"), 'Should support groups tab');
    assert.ok(content.includes("'persons'"), 'Should support persons tab');
    assert.ok(content.includes("'all-unrecognized'"), 'Should support all-unrecognized tab');
  });

  it('should have dedicated FaceRegistryUI.css with theme variables and dropdown styles', () => {
    const cssPath = path.resolve('src/components/faces/FaceRegistryUI.css');
    assert.ok(fs.existsSync(cssPath), 'FaceRegistryUI.css should exist in faces folder');

    const cssContent = fs.readFileSync(cssPath, 'utf8');
    assert.ok(
      cssContent.includes('.face-registry-dropdown-wrap') ||
        cssContent.includes('.face-registry-dropdown-menu'),
      'Must define dropdown menu styles'
    );
    assert.ok(cssContent.includes('var('), 'Must utilize CSS theme variables');
  });

  it('should verify FaceRegistry and MediaGallery utilize FaceRegistryUI component', () => {
    const registryPath = path.resolve('src/components/faces/FaceRegistry.tsx');
    const registryContent = fs.readFileSync(registryPath, 'utf8');

    assert.ok(
      registryContent.includes("import FaceRegistryUI from './FaceRegistryUI'"),
      'FaceRegistry must import FaceRegistryUI'
    );
    assert.ok(
      registryContent.includes('<FaceRegistryUI'),
      'FaceRegistry must render FaceRegistryUI component'
    );

    const galleryPath = path.resolve('src/components/gallery/MediaGallery.tsx');
    const galleryContent = fs.readFileSync(galleryPath, 'utf8');

    assert.ok(
      galleryContent.includes("import FaceRegistryUI from '../faces/FaceRegistryUI'"),
      'MediaGallery must import FaceRegistryUI'
    );
    assert.ok(
      galleryContent.includes('<FaceRegistryUI'),
      'MediaGallery must render FaceRegistryUI component'
    );
  });

  it('should verify data/feature_flags.json includes face_registry_dropdown preset', () => {
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
    const flag = flags.find((f: any) => f.key === 'face_registry_dropdown');

    assert.ok(flag, 'face_registry_dropdown flag must be in feature_flags.json');
    assert.strictEqual(
      typeof flag.isEnabled,
      'boolean',
      'face_registry_dropdown isEnabled should be a boolean'
    );
    assert.ok(
      flag.classNames.includes('face-registry-dropdown'),
      'classNames should include face-registry-dropdown'
    );
  });
});
