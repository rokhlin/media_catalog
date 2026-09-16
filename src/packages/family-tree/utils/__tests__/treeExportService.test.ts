import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import {
  getPixelRatioForQuality,
  getBackgroundColor,
  isTreeUIOverlayNode,
  getExportTimestamp,
} from '../treeExportService.js';

describe('treeExportService & Tree/Timeline Export Features', () => {
  it('should map quality presets to correct pixelRatio numbers', () => {
    assert.strictEqual(getPixelRatioForQuality('standard'), 1);
    assert.strictEqual(getPixelRatioForQuality('high'), 2);
    assert.strictEqual(getPixelRatioForQuality('ultra'), 3);
  });

  it('should resolve background colors for different styles and formats', () => {
    assert.strictEqual(getBackgroundColor('transparent', 'png'), undefined);
    assert.strictEqual(getBackgroundColor('transparent', 'svg'), undefined);
    assert.strictEqual(getBackgroundColor('transparent', 'jpeg'), '#0f172a', 'JPEG must fallback to solid color');
    assert.strictEqual(getBackgroundColor('dark'), '#0f172a');
    assert.strictEqual(getBackgroundColor('light'), '#ffffff');
  });

  it('should filter out interactive overlay controls from exported tree canvas', () => {
    const makeFakeEl = (className: string) => ({
      classList: {
        contains: (c: string) => className.split(' ').includes(c),
      },
    }) as any;

    assert.strictEqual(isTreeUIOverlayNode(makeFakeEl('react-flow__minimap')), true);
    assert.strictEqual(isTreeUIOverlayNode(makeFakeEl('react-flow__controls')), true);
    assert.strictEqual(isTreeUIOverlayNode(makeFakeEl('canvas-toolbar')), true);
    assert.strictEqual(isTreeUIOverlayNode(makeFakeEl('tree-search-bar-container')), true);
    assert.strictEqual(isTreeUIOverlayNode(makeFakeEl('kinship-hud')), true);
    assert.strictEqual(isTreeUIOverlayNode(makeFakeEl('person-card-node')), false);
    assert.strictEqual(isTreeUIOverlayNode(makeFakeEl('union-node')), false);
  });

  it('should return a valid ISO date timestamp for file naming', () => {
    const ts = getExportTimestamp();
    assert.match(ts, /^\d{4}-\d{2}-\d{2}$/);
  });

  it('should verify TreeSettingsTab includes Section 6 for Tree and Timeline Export', () => {
    const tabPath = path.resolve('src/packages/family-tree/components/settings/TreeSettingsTab.tsx');
    const content = fs.readFileSync(tabPath, 'utf8');

    assert.ok(content.includes('exportTreeDiagram'), 'Must import exportTreeDiagram');
    assert.ok(content.includes('exportPersonTimeline'), 'Must import exportPersonTimeline');
    assert.ok(content.includes('exportMedia'), 'Must track exportMedia expandable section');
    assert.ok(content.includes('exportTab'), 'Must have exportTab state for tree vs timeline');
    assert.ok(content.includes('exportFormat'), 'Must have exportFormat state');
    assert.ok(content.includes('exportQuality'), 'Must have exportQuality state');
  });

  it('should verify PersonTimelineView includes inline quick export button', () => {
    const timelinePath = path.resolve('src/packages/family-tree/components/timeline/PersonTimelineView.tsx');
    const content = fs.readFileSync(timelinePath, 'utf8');

    assert.ok(content.includes('exportPersonTimeline'), 'Must import exportPersonTimeline');
    assert.ok(content.includes('handleQuickExport'), 'Must define handleQuickExport');
    assert.ok(content.includes('isExportMenuOpen'), 'Must track isExportMenuOpen');
    assert.ok(content.includes('person-timeline-container'), 'Must set class on root element');
  });
});
