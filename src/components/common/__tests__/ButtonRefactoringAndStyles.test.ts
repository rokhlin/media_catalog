import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { componentStyles } from '../componentStyles.js';

describe('Button Refactoring & Component Styles Hook', () => {
  it('should export componentStyles from the component tree with button, toggle, modal, and imageView definitions', () => {
    assert.ok(componentStyles, 'componentStyles must be defined');
    assert.ok(componentStyles.button, 'componentStyles.button must be defined');
    assert.ok(componentStyles.toggle, 'componentStyles.toggle must be defined');
    assert.ok(componentStyles.modal, 'componentStyles.modal must be defined');
    assert.ok(componentStyles.imageView, 'componentStyles.imageView must be defined');
  });

  it('should resolve button variants and sizes correctly via componentStyles.button.resolve', () => {
    const primary = componentStyles.button.resolve({ variant: 'primary', size: 'md' });
    assert.ok(primary.className.includes('common-btn'));
    assert.ok(primary.className.includes('common-btn-primary'));

    const dangerSm = componentStyles.button.resolve({ variant: 'danger', size: 'sm', active: true });
    assert.ok(dangerSm.className.includes('common-btn-danger'));
    assert.ok(dangerSm.className.includes('size-sm'));
    assert.ok(dangerSm.className.includes('active'));

    const ghostLg = componentStyles.button.resolve({ variant: 'ghost', size: 'lg', disabled: true });
    assert.ok(ghostLg.className.includes('common-btn-ghost'));
    assert.ok(ghostLg.className.includes('size-lg'));
    assert.ok(ghostLg.className.includes('disabled'));
  });

  it('should resolve toggle, modal, and imageView styles correctly', () => {
    const toggleActive = componentStyles.toggle.resolve({ checked: true });
    assert.ok(toggleActive.className.includes('common-toggle-container'));
    assert.ok(toggleActive.className.includes('active'));

    const modalLg = componentStyles.modal.resolve({ size: 'lg' });
    assert.ok(modalLg.className.includes('common-modal-container'));
    assert.ok(modalLg.className.includes('common-modal-lg'));

    const imgFit = componentStyles.imageView.resolve({ fit: 'contain', rounded: true });
    assert.ok(imgFit.className.includes('common-image-view-container'));
    assert.ok(imgFit.className.includes('fit-contain'));
    assert.ok(imgFit.className.includes('rounded'));
  });

  it('should verify Button.tsx guarantees id attribute on rendered button', () => {
    const btnPath = path.resolve('src/components/common/Button.tsx');
    assert.ok(fs.existsSync(btnPath), 'Button.tsx must exist');

    const content = fs.readFileSync(btnPath, 'utf-8');
    assert.ok(content.includes('effectiveId'), 'Button.tsx must compute effectiveId');
    assert.ok(content.includes('fallbackId'), 'Button.tsx must generate fallbackId if id is missing');
    assert.ok(content.includes('id={effectiveId}'), 'Button.tsx must render id={effectiveId}');
  });

  it('should verify Button.tsx integrates with feature flags by button ID', () => {
    const btnPath = path.resolve('src/components/common/Button.tsx');
    const content = fs.readFileSync(btnPath, 'utf-8');
    assert.ok(content.includes('FlagsManager.isButtonEnabled'), 'Button.tsx must check FlagsManager.isButtonEnabled');
  });

  it('should verify common/index.ts exports style hooks and types', () => {
    const indexPath = path.resolve('src/components/common/index.ts');
    const content = fs.readFileSync(indexPath, 'utf-8');
    assert.ok(content.includes('useComponentStyle'), 'Must export useComponentStyle');
    assert.ok(content.includes('useButtonStyle'), 'Must export useButtonStyle');
    assert.ok(content.includes('getComponentStyle'), 'Must export getComponentStyle');
    assert.ok(content.includes('componentStyles'), 'Must export componentStyles');
  });
});
