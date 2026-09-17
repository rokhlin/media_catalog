import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('Header Profile Dropdown Stacking Context & Z-Index', () => {
  it('should verify App.css provides stacking context and z-index higher than side navigation', () => {
    const cssPath = path.resolve('src/App.css');
    assert.ok(fs.existsSync(cssPath), 'App.css should exist');
    const content = fs.readFileSync(cssPath, 'utf8');

    // Verify .app-header has position: relative and z-index > side-nav (20)
    assert.ok(content.includes('.app-header {'), 'App.css must have .app-header');
    assert.ok(content.includes('position: relative;'), 'App.css must have position relative');
    assert.ok(content.includes('z-index: 500;'), '.app-header must have z-index: 500 to stack above side-nav');

    // Verify .app-side-nav has z-index 20
    assert.ok(content.includes('.app-side-nav {'), 'App.css must have .app-side-nav');
    assert.ok(content.includes('z-index: 20;'), '.app-side-nav must have z-index: 20');

    // Verify .theme-dropdown-menu has z-index >= 1200
    assert.ok(content.includes('.theme-dropdown-menu {'), 'App.css must have .theme-dropdown-menu');
    assert.ok(content.includes('z-index: 1200;'), '.theme-dropdown-menu must have elevated z-index');

    // Verify .user-profile-dropdown-menu exists
    assert.ok(content.includes('.user-profile-dropdown-menu {'), 'App.css must define .user-profile-dropdown-menu');
  });

  it('should verify HeaderProfile provides proper classes and accessibility attributes', () => {
    const profilePath = path.resolve('src/components/header/HeaderProfile.tsx');
    assert.ok(fs.existsSync(profilePath), 'HeaderProfile.tsx should exist');
    const content = fs.readFileSync(profilePath, 'utf8');

    assert.ok(content.includes('user-profile-container'), 'HeaderProfile must include user-profile-container class');
    assert.ok(content.includes('user-profile-dropdown-menu'), 'HeaderProfile must include user-profile-dropdown-menu class');
    assert.ok(content.includes('aria-haspopup="true"'), 'HeaderProfile button must have aria-haspopup');
    assert.ok(content.includes('aria-expanded={isUserMenuOpen}'), 'HeaderProfile button must have aria-expanded');
  });
});
