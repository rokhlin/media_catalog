import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('Common Generic UI Components', () => {
  it('should verify Button component exists and exports correctly', () => {
    const filePath = path.resolve('src/components/common/Button.tsx');
    assert.ok(fs.existsSync(filePath), 'Button.tsx should exist');

    const content = fs.readFileSync(filePath, 'utf8');
    assert.ok(content.includes('export default function Button'), 'Button must be exported default');
    assert.ok(content.includes('export { Button }'), 'Button must be exported by name');
    assert.ok(content.includes('export interface ButtonProps'), 'ButtonProps must be exported');
    assert.ok(content.includes('variant?: \'primary\' | \'secondary\' | \'danger\' | \'ghost\' | \'icon-only\''), 'Button must support variants');
    assert.ok(content.includes('common-btn'), 'Button must use common-btn class');
  });

  it('should verify Toggle component exists and exports correctly', () => {
    const filePath = path.resolve('src/components/common/Toggle.tsx');
    assert.ok(fs.existsSync(filePath), 'Toggle.tsx should exist');

    const content = fs.readFileSync(filePath, 'utf8');
    assert.ok(content.includes('export default function Toggle'), 'Toggle must be exported default');
    assert.ok(content.includes('export { Toggle }'), 'Toggle must be exported by name');
    assert.ok(content.includes('export interface ToggleProps'), 'ToggleProps must be exported');
    assert.ok(content.includes('common-toggle-track'), 'Toggle must have track');
    assert.ok(content.includes('common-toggle-thumb'), 'Toggle must have thumb');
  });

  it('should verify ImageView component exists and exports correctly', () => {
    const filePath = path.resolve('src/components/common/ImageView.tsx');
    assert.ok(fs.existsSync(filePath), 'ImageView.tsx should exist');

    const content = fs.readFileSync(filePath, 'utf8');
    assert.ok(content.includes('export default function ImageView'), 'ImageView must be exported default');
    assert.ok(content.includes('export { ImageView }'), 'ImageView must be exported by name');
    assert.ok(content.includes('export interface ImageViewProps'), 'ImageViewProps must be exported');
    assert.ok(content.includes('common-image-view'), 'ImageView must use common-image-view class');
    assert.ok(content.includes('common-image-error'), 'ImageView must have error fallback state');
  });

  it('should verify ModalContainer component exists and exports correctly', () => {
    const filePath = path.resolve('src/components/common/ModalContainer.tsx');
    assert.ok(fs.existsSync(filePath), 'ModalContainer.tsx should exist');

    const content = fs.readFileSync(filePath, 'utf8');
    assert.ok(content.includes('export default function ModalContainer'), 'ModalContainer must be exported default');
    assert.ok(content.includes('export { ModalContainer }'), 'ModalContainer must be exported by name');
    assert.ok(content.includes('export interface ModalContainerProps'), 'ModalContainerProps must be exported');
    assert.ok(content.includes('common-modal-backdrop'), 'ModalContainer must have backdrop');
    assert.ok(content.includes('common-modal-dialog'), 'ModalContainer must have dialog container');
    assert.ok(content.includes('Escape'), 'ModalContainer must support Escape key closing');
  });

  it('should verify common/index.ts exports all generic components', () => {
    const indexPath = path.resolve('src/components/common/index.ts');
    assert.ok(fs.existsSync(indexPath), 'common/index.ts should exist');

    const content = fs.readFileSync(indexPath, 'utf8');
    assert.ok(content.includes('Button'), 'Must export Button');
    assert.ok(content.includes('Toggle'), 'Must export Toggle');
    assert.ok(content.includes('ImageView'), 'Must export ImageView');
    assert.ok(content.includes('ModalContainer'), 'Must export ModalContainer');
  });

  it('should verify common.css exists with required styling rules', () => {
    const cssPath = path.resolve('src/components/common/common.css');
    assert.ok(fs.existsSync(cssPath), 'common.css should exist');

    const content = fs.readFileSync(cssPath, 'utf8');
    assert.ok(content.includes('.common-btn'), 'Must have button styles');
    assert.ok(content.includes('.common-toggle-container'), 'Must have toggle styles');
    assert.ok(content.includes('.common-image-view'), 'Must have image view styles');
    assert.ok(content.includes('.common-modal-backdrop'), 'Must have modal backdrop styles');
  });
});
