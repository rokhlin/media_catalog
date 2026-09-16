import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('HeaderBrandWrap Component Refactoring', () => {
  it('should verify HeaderBrandWrap component exists and has correct exports', () => {
    const brandPath = fs.existsSync('src/components/header/HeaderBrandWrap.tsx')
      ? path.resolve('src/components/header/HeaderBrandWrap.tsx')
      : path.resolve('src/components/HeaderBrandWrap.tsx');
    assert.ok(fs.existsSync(brandPath), 'HeaderBrandWrap.tsx should exist');

    const content = fs.readFileSync(brandPath, 'utf8');
    assert.ok(content.includes('export default function HeaderBrandWrap'), 'Must export HeaderBrandWrap as default');
    assert.ok(content.includes('export { HeaderBrandWrap as HeaderBrand };'), 'Must export HeaderBrand alias');
    assert.ok(content.includes('export interface HeaderBrandWrapProps'), 'Must export HeaderBrandWrapProps');
  });

  it('should verify HeaderBrandWrap renders header-brand-wrap structure', () => {
    const brandPath = fs.existsSync('src/components/header/HeaderBrandWrap.tsx')
      ? path.resolve('src/components/header/HeaderBrandWrap.tsx')
      : path.resolve('src/components/HeaderBrandWrap.tsx');
    const content = fs.readFileSync(brandPath, 'utf8');

    assert.ok(content.includes('className={`header-brand-wrap'), 'Must render header-brand-wrap container');
    assert.ok(content.includes('id="btn-nav-hamburger"'), 'Must render hamburger button');
    assert.ok(content.includes('className="hamburger-icon-bars"'), 'Must render hamburger bars');
    assert.ok(content.includes('className="logo-section"'), 'Must render logo-section');
    assert.ok(content.includes('<h1>{finalTitle}</h1>') || content.includes('<h1>{renderedTitle}</h1>'), 'Must render title heading');
    assert.ok(content.includes('<p>{finalSubtitle}</p>') || content.includes('<p>{renderedSubtitle}</p>'), 'Must render subtitle paragraph');
  });

  it('should verify Header imports and renders HeaderBrandWrap', () => {
    const headerPath = fs.existsSync('src/components/header/Header.tsx')
      ? path.resolve('src/components/header/Header.tsx')
      : path.resolve('src/components/Header.tsx');
    const content = fs.readFileSync(headerPath, 'utf8');

    assert.ok(
      content.includes("import HeaderBrandWrap from './HeaderBrandWrap';"),
      'Header.tsx must import HeaderBrandWrap'
    );
    assert.ok(
      content.includes('<HeaderBrandWrap'),
      'Header.tsx must render HeaderBrandWrap component'
    );
    assert.ok(
      content.includes('displayTitle={displayTitle}'),
      'Header.tsx must pass displayTitle to HeaderBrandWrap'
    );
    assert.ok(
      content.includes('displaySubtitle={displaySubtitle}'),
      'Header.tsx must pass displaySubtitle to HeaderBrandWrap'
    );
  });
});
