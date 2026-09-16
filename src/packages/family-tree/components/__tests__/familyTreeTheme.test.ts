import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Family Tree Theme Adaptability', () => {
  const componentsDir = path.resolve(__dirname, '..');

  it('should verify family-tree.css exists and applies CSS design variables to XYFlow controls and minimap', () => {
    const cssPath = path.join(componentsDir, 'family-tree.css');
    assert.ok(fs.existsSync(cssPath), 'family-tree.css should exist');

    const cssContent = fs.readFileSync(cssPath, 'utf8');
    assert.ok(cssContent.includes('var(--card-bg-solid)'), 'Should use var(--card-bg-solid)');
    assert.ok(cssContent.includes('var(--border-color)'), 'Should use var(--border-color)');
    assert.ok(cssContent.includes('var(--text-primary)'), 'Should use var(--text-primary)');
    assert.ok(cssContent.includes('.react-flow__controls'), 'Should style .react-flow__controls');
    assert.ok(cssContent.includes('.react-flow__minimap'), 'Should style .react-flow__minimap');
  });

  it('should verify PersonCardNode uses theme design tokens for card background, borders, and text', () => {
    const cardPath = path.join(componentsDir, 'canvas', 'nodes', 'PersonCardNode.tsx');
    const content = fs.readFileSync(cardPath, 'utf8');

    assert.ok(content.includes('var(--card-bg-solid)'), 'PersonCardNode should use var(--card-bg-solid)');
    assert.ok(content.includes('var(--text-primary)'), 'PersonCardNode should use var(--text-primary)');
    assert.ok(!content.includes('rgba(17, 24, 39, 0.85)'), 'PersonCardNode should not hardcode dark slate background');
  });

  it('should verify TreeCanvas imports useTheme and adapts background grid dots dynamically', () => {
    const canvasPath = path.join(componentsDir, 'canvas', 'TreeCanvas.tsx');
    const content = fs.readFileSync(canvasPath, 'utf8');

    assert.ok(content.includes('useTheme'), 'TreeCanvas should import and call useTheme');
    assert.ok(content.includes('isDark'), 'TreeCanvas should check isDark for canvas grid dots');
    assert.ok(content.includes('var(--card-bg-solid)'), 'TreeCanvas should use var(--card-bg-solid)');
  });

  it('should verify CanvasToolbar uses theme tokens rather than hardcoded slate backgrounds', () => {
    const toolbarPath = path.join(componentsDir, 'canvas', 'controls', 'CanvasToolbar.tsx');
    const content = fs.readFileSync(toolbarPath, 'utf8');

    assert.ok(content.includes('var(--card-bg)'), 'CanvasToolbar should use var(--card-bg)');
    assert.ok(content.includes('var(--card-bg-solid)'), 'CanvasToolbar should use var(--card-bg-solid)');
    assert.ok(!content.includes('rgba(15, 23, 42, 0.85)'), 'CanvasToolbar should not hardcode dark slate background');
  });

  it('should verify KinshipHUD and TreeSearchBar use theme tokens', () => {
    const hudPath = path.join(componentsDir, 'canvas', 'controls', 'KinshipHUD.tsx');
    const hudContent = fs.readFileSync(hudPath, 'utf8');
    assert.ok(hudContent.includes('var(--card-bg-solid)'), 'KinshipHUD should use var(--card-bg-solid)');
    assert.ok(!hudContent.includes('rgba(15, 23, 42, 0.9)'), 'KinshipHUD should not hardcode dark background');

    const searchPath = path.join(componentsDir, 'canvas', 'controls', 'TreeSearchBar.tsx');
    const searchContent = fs.readFileSync(searchPath, 'utf8');
    assert.ok(searchContent.includes('var(--card-bg-solid)'), 'TreeSearchBar should use var(--card-bg-solid)');
    assert.ok(!searchContent.includes('rgba(15, 23, 42, 0.85)'), 'TreeSearchBar should not hardcode dark background');
  });

  it('should verify PersonDetailDrawer uses theme design tokens', () => {
    const drawerPath = path.join(componentsDir, 'modals', 'PersonDetailDrawer.tsx');
    const content = fs.readFileSync(drawerPath, 'utf8');

    assert.ok(content.includes('var(--modal-bg)'), 'PersonDetailDrawer should use var(--modal-bg)');
    assert.ok(content.includes('var(--input-bg)'), 'PersonDetailDrawer should use var(--input-bg)');
    assert.ok(content.includes('var(--text-primary)'), 'PersonDetailDrawer should use var(--text-primary)');
    assert.ok(!content.includes('rgba(15, 23, 42, 0.95)'), 'PersonDetailDrawer should not hardcode dark slate background');
  });

  it('should verify Family Tree tabs container has rounded corner and header shadow', () => {
    const cssPath = path.join(componentsDir, 'family-tree.css');
    const cssContent = fs.readFileSync(cssPath, 'utf8');

    assert.ok(cssContent.includes('.family-tree-tabs-container'), 'family-tree.css should contain .family-tree-tabs-container');
    assert.ok(cssContent.includes('border-radius: 16px'), 'tabs container should have 16px border-radius like in header');
    assert.ok(cssContent.includes('box-shadow: 0 4px 30px rgba(0, 0, 0, 0.25)'), 'tabs container should have shadow like in header');

    const tabPath = path.join(componentsDir, 'FamilyTreeTab.tsx');
    const tabContent = fs.readFileSync(tabPath, 'utf8');
    assert.ok(tabContent.includes('family-tree-tabs-container'), 'FamilyTreeTab.tsx should apply family-tree-tabs-container class');
  });
});
