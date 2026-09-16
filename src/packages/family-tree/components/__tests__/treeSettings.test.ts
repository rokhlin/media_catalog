import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Family Tree Settings & UI Features', () => {
  const componentsDir = path.resolve(__dirname, '..');

  it('should verify TreeSettingsTab.tsx exists and contains all 5 configuration sections', () => {
    const settingsPath = path.join(componentsDir, 'settings', 'TreeSettingsTab.tsx');
    assert.ok(fs.existsSync(settingsPath), 'TreeSettingsTab.tsx should exist');

    const content = fs.readFileSync(settingsPath, 'utf8');

    // 1. Tree Node View Style
    assert.ok(content.includes('Tree Node View Style'), 'Should contain Tree Node View Style section');
    assert.ok(content.includes('setNodeViewStyle(\'default\')'), 'Should allow default style');
    assert.ok(content.includes('setNodeViewStyle(\'circle\')'), 'Should allow circle style');
    assert.ok(content.includes('setNodeViewStyle(\'square\')'), 'Should allow square style');

    // 2. Celebration Badges
    assert.ok(content.includes('Celebration & Milestone Badges'), 'Should contain Celebration Badges section');
    assert.ok(content.includes('celebrationConfig'), 'Should use celebrationConfig');
    assert.ok(content.includes('daysThreshold'), 'Should configure daysThreshold');
    assert.ok(content.includes('showBirthday'), 'Should configure showBirthday');
    assert.ok(content.includes('showAnniversary'), 'Should configure showAnniversary');
    assert.ok(content.includes('showMemorial'), 'Should configure showMemorial');

    // 3. Date Formats & Display
    assert.ok(content.includes('Date Formats & Date Picker Configuration'), 'Should contain Date Formats section');
    assert.ok(content.includes('setDateFormatStyle'), 'Should configure dateFormatStyle');
    assert.ok(content.includes('YYYY-MM-DD'), 'Should support YYYY-MM-DD');
    assert.ok(content.includes('DD Month YYYY'), 'Should support DD Month YYYY');
    assert.ok(content.includes('DD.MM.YYYY'), 'Should support DD.MM.YYYY');
    assert.ok(content.includes('MM/DD/YYYY'), 'Should support MM/DD/YYYY');

    // 4. Life Facts & Relatives Filtering
    assert.ok(content.includes('Person Life Facts & Relatives Filtering'), 'Should contain Life Facts configuration section');
    assert.ok(content.includes('showOwnFacts'), 'Should configure showOwnFacts');
    assert.ok(content.includes('showParentsFacts'), 'Should configure showParentsFacts');
    assert.ok(content.includes('showSiblingsFacts'), 'Should configure showSiblingsFacts');
    assert.ok(content.includes('showChildrenFacts'), 'Should configure showChildrenFacts');
    assert.ok(content.includes('showGrandparentsFacts'), 'Should configure showGrandparentsFacts');
    assert.ok(content.includes('showSpousesFacts'), 'Should configure showSpousesFacts');
    assert.ok(content.includes('includedFactTypes'), 'Should configure includedFactTypes');

    // 5. CSV Export & Import
    assert.ok(content.includes('Export & Import Family Tree (.csv)'), 'Should contain CSV section');
    assert.ok(content.includes('exportTreeToCSV'), 'Should call exportTreeToCSV');
    assert.ok(content.includes('parseTreeFromCSV'), 'Should call parseTreeFromCSV');
    assert.ok(content.includes('getSampleTreeCSV'), 'Should provide sample CSV');
  });

  it('should verify FamilyTreeTab.tsx renders subtab switcher for Tree and Settings', () => {
    const tabPath = path.join(componentsDir, 'FamilyTreeTab.tsx');
    const content = fs.readFileSync(tabPath, 'utf8');

    assert.ok(content.includes('TreeSettingsTab'), 'FamilyTreeTab should import TreeSettingsTab');
    assert.ok(content.includes('subtab-family-tree-canvas'), 'FamilyTreeTab should have Interactive Tree subtab');
    assert.ok(content.includes('subtab-family-tree-settings'), 'FamilyTreeTab should have Tree Settings subtab');
    assert.ok(content.includes('activeSubTab === \'settings\''), 'FamilyTreeTab should toggle TreeSettingsTab');
  });

  it('should verify CanvasToolbar.tsx does not duplicate Settings button since navigation has it', () => {
    const toolbarPath = path.join(componentsDir, 'canvas', 'controls', 'CanvasToolbar.tsx');
    const toolbarContent = fs.readFileSync(toolbarPath, 'utf8');

    assert.ok(!toolbarContent.includes('toolbar-tree-settings-btn'), 'CanvasToolbar should not have duplicate Settings button');
  });

  it('should verify PersonCardNode.tsx renders spouse details and click action', () => {
    const nodePath = path.join(componentsDir, 'canvas', 'nodes', 'PersonCardNode.tsx');
    const content = fs.readFileSync(nodePath, 'utf8');

    assert.ok(content.includes('renderSpouseBadge'), 'PersonCardNode should have renderSpouseBadge');
    assert.ok(content.includes('openDrawer(\'family\', person.id)'), 'Clicking spouse badge should open drawer family tab');
    assert.ok(content.includes('DIVORCED'), 'Should support DIVORCED spouse distinction');
  });

  it('should verify PersonTimelineView.tsx aggregates relatives life facts when enabled', () => {
    const timelinePath = path.join(componentsDir, 'timeline', 'PersonTimelineView.tsx');
    const content = fs.readFileSync(timelinePath, 'utf8');

    assert.ok(content.includes('relativeEvents'), 'PersonTimelineView should track relativeEvents');
    assert.ok(content.includes('showParentsFacts'), 'PersonTimelineView should check showParentsFacts');
    assert.ok(content.includes('showChildrenFacts'), 'PersonTimelineView should check showChildrenFacts');
    assert.ok(content.includes('filterRelativeEvents'), 'PersonTimelineView should filter relative events');
    assert.ok(content.includes('deduplicateTimelineEvents'), 'PersonTimelineView should deduplicate timeline events');
  });

  it('should verify TreeSettingsTab.tsx has expandable sections and correct subtext margins (Issue 12)', () => {
    const settingsPath = path.join(componentsDir, 'settings', 'TreeSettingsTab.tsx');
    const content = fs.readFileSync(settingsPath, 'utf8');

    // Expandable sections check
    assert.ok(content.includes('expandedSections'), 'TreeSettingsTab should maintain expandedSections state');
    assert.ok(content.includes('toggleSection'), 'TreeSettingsTab should provide toggleSection handler');
    assert.ok(content.includes('toggle-all-sections-btn'), 'TreeSettingsTab should have Collapse/Expand All button');

    // Section headers clickable
    assert.ok(content.includes('section-header-view-styles'), 'View styles section should have clickable header');
    assert.ok(content.includes('section-header-celebrations'), 'Celebrations section should have clickable header');
    assert.ok(content.includes('section-header-date-formats'), 'Date formats section should have clickable header');
    assert.ok(content.includes('section-header-life-facts'), 'Life facts section should have clickable header');
    assert.ok(content.includes('section-header-csv-backup'), 'CSV backup section should have clickable header');

    // Issue 12: Subtext margins should NOT overlap title (no negative marginTop)
    assert.ok(!content.includes('marginTop: -8'), 'sectionSubtextStyle should NOT have negative marginTop causing overlap');
    assert.ok(content.includes('marginTop: 6'), 'sectionSubtextStyle should have positive marginTop for clean spacing');
  });

  it('should verify Celebration & Milestone Badges support icon-only mode with hover details', () => {
    const settingsPath = path.join(componentsDir, 'settings', 'TreeSettingsTab.tsx');
    const content = fs.readFileSync(settingsPath, 'utf8');

    assert.ok(content.includes('celebration-mode-icon-and-text'), 'Settings should have Icon & Text selector');
    assert.ok(content.includes('celebration-mode-icon-only'), 'Settings should have Icon only selector');
    assert.ok(content.includes('contentDisplay: \'icon_only\''), 'Settings should allow setting contentDisplay to icon_only');

    const nodePath = path.join(componentsDir, 'canvas', 'nodes', 'PersonCardNode.tsx');
    const nodeContent = fs.readFileSync(nodePath, 'utf8');
    assert.ok(nodeContent.includes('isIconOnly = celebrationConfig.contentDisplay === \'icon_only\''), 'PersonCardNode should check icon_only');
    assert.ok(nodeContent.includes('title={detailedTooltip}'), 'PersonCardNode should set detailed hover tooltip');
  });

  it('should verify ELK layout worker engine and service filter out empty/orphaned unions (Issue 13)', () => {
    const workerPath = path.join(componentsDir, '..', 'workers', 'elk-layout.worker.ts');
    const workerContent = fs.readFileSync(workerPath, 'utf8');

    // ELK worker should ensure only valid unions with partners or multiple children are rendered
    assert.ok(workerContent.includes('validPartners.length >= 2'), 'Should allow valid partner unions');
    assert.ok(workerContent.includes('validPartners.length >= 1 && validChildren.length >= 1'), 'Should allow single parent unions');
    assert.ok(workerContent.includes('validPartners.length === 0 && validChildren.length >= 2'), 'Should allow sibling unions');

    const servicePath = path.resolve(componentsDir, '..', '..', '..', '..', 'server', 'family-tree', 'family-tree.service.ts');
    const serviceContent = fs.readFileSync(servicePath, 'utf8');
    assert.ok(serviceContent.includes('cleanUpOrphanedUnions'), 'FamilyTreeService should have cleanUpOrphanedUnions');
  });

  it('should verify TreeSettingsTab and FamilyTreeTab use theme tokens instead of hardcoded dark backgrounds', () => {
    const tabPath = path.join(componentsDir, 'FamilyTreeTab.tsx');
    const tabContent = fs.readFileSync(tabPath, 'utf8');
    assert.ok(!tabContent.includes('--bg-main, #0f172a'), 'FamilyTreeTab should not hardcode dark --bg-main');
    assert.ok(tabContent.includes('var(--bg-color)'), 'FamilyTreeTab settings container should adapt to theme --bg-color');

    const settingsPath = path.join(componentsDir, 'settings', 'TreeSettingsTab.tsx');
    const settingsContent = fs.readFileSync(settingsPath, 'utf8');
    assert.ok(settingsContent.includes('var(--primary-gradient'), 'TreeSettingsTab should use --primary-gradient');
    assert.ok(settingsContent.includes('var(--nav-tab-active-bg)'), 'TreeSettingsTab should use --nav-tab-active-bg');
  });

  it('should verify SystemSettings.tsx tab navigation contains a link to Tree settings and hooks up navigation', () => {
    const srcDir = path.resolve(componentsDir, '../../..');
    const systemSettingsPath = path.resolve(srcDir, 'components/settings/SystemSettings.tsx');
    assert.ok(fs.existsSync(systemSettingsPath), 'SystemSettings.tsx should exist');

    const systemSettingsContent = fs.readFileSync(systemSettingsPath, 'utf8');
    assert.ok(systemSettingsContent.includes('id="tab-settings-tree"'), 'SystemSettings should have Tree Settings nav link');
    assert.ok(systemSettingsContent.includes('handleGoToTreeSettings'), 'SystemSettings should handle click on Tree Settings link');
    assert.ok(systemSettingsContent.includes('setTreeStore({ activeSubTab: \'settings\' })'), 'Should set activeSubTab to settings in treeStore');
    assert.ok(systemSettingsContent.includes('onNavigateToTreeSettings'), 'SystemSettings should accept onNavigateToTreeSettings prop');

    const settingsScreenPath = path.resolve(srcDir, 'screens/SettingsScreen.tsx');
    const settingsScreenContent = fs.readFileSync(settingsScreenPath, 'utf8');
    assert.ok(settingsScreenContent.includes('onNavigateToTreeSettings'), 'SettingsScreen should accept and forward onNavigateToTreeSettings');

    const appPath = path.resolve(srcDir, 'App.tsx');
    const appContent = fs.readFileSync(appPath, 'utf8');
    assert.ok(appContent.includes('onNavigateToTreeSettings={() => {'), 'App.tsx should wire onNavigateToTreeSettings to SettingsScreen');
    assert.ok(appContent.includes('setActiveTab(\'family_tree\')'), 'Should switch activeTab to family_tree');
  });

  it('should verify TreeSettingsTab includes Kinship in media gallery configuration section (Section 5)', () => {
    const settingsPath = path.join(componentsDir, 'settings', 'TreeSettingsTab.tsx');
    const content = fs.readFileSync(settingsPath, 'utf8');

    assert.ok(content.includes('id="section-gallery-kinship"'), 'Should have section-gallery-kinship element');
    assert.ok(content.includes('galleryKinshipFactsConfig'), 'Should use galleryKinshipFactsConfig state');
    assert.ok(content.includes('setGalleryKinshipFactsConfig'), 'Should use setGalleryKinshipFactsConfig updater');
    assert.ok(content.includes('section-header-gallery-kinship'), 'Should have clickable header for gallery kinship');
    assert.ok(content.includes("scope: 'OWN'"), 'Should have OWN scope selector');
    assert.ok(content.includes("scope: 'CLOSEST_FAMILY'"), 'Should have CLOSEST_FAMILY scope selector');
    assert.ok(content.includes("scope: 'ALL'"), 'Should have ALL scope selector');
    assert.ok(content.includes('period_before_days') || content.includes('periodBeforeDays'), 'Should configure period before days');
    assert.ok(content.includes('only_close_events') || content.includes('onlyCloseEvents'), 'Should configure only close events');
    assert.ok(content.includes('BIRTH'), 'Should support BIRTH event type');
    assert.ok(content.includes('MARRIAGE'), 'Should support MARRIAGE event type');
    assert.ok(content.includes('ANNIVERSARY'), 'Should support ANNIVERSARY event type');
    assert.ok(content.includes('DEATH'), 'Should support DEATH event type');
  });

  it('should verify Refactoring: Export to PNG/JPG/SVG is placed under CSV section in Tree Settings', () => {
    const settingsPath = path.join(componentsDir, 'settings', 'TreeSettingsTab.tsx');
    const content = fs.readFileSync(settingsPath, 'utf8');

    const csvIndex = content.indexOf('id="section-csv-backup"');
    const exportIndex = content.indexOf('id="section-export-tree-timeline"');

    assert.ok(csvIndex > -1, 'CSV section must exist');
    assert.ok(exportIndex > -1, 'Export section must exist');
    assert.ok(exportIndex > csvIndex, 'Export section must be placed after CSV section');
  });
});

