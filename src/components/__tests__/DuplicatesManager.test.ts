import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('Duplicates Manager Click Handling & In-Place Lightbox', () => {
  it('should verify DuplicatesManagerTab stops click bubbling on checkboxes and toggles selection', () => {
    const componentPath = path.resolve('src/components/duplicates/DuplicatesManagerTab.tsx');
    assert.ok(fs.existsSync(componentPath), 'DuplicatesManagerTab.tsx should exist');

    const content = fs.readFileSync(componentPath, 'utf8');

    // Ensure checkbox has e.stopPropagation() on onClick
    assert.ok(
      content.includes('onClick={(e) => e.stopPropagation()}'),
      'Checkbox must stop click propagation to prevent triggering parent handlers'
    );

    // Ensure item card or preview wrap toggles file selection
    assert.ok(
      content.includes('handleToggleSelectFile(group.primaryFile.filePath)'),
      'Primary card click should toggle selection'
    );
    assert.ok(
      content.includes('handleToggleSelectFile(dup.filePath)'),
      'Duplicate card click should toggle selection'
    );
  });

  it('should verify DuplicatesManagerTab renders dedicated zoom button and in-place preview modal', () => {
    const componentPath = path.resolve('src/components/duplicates/DuplicatesManagerTab.tsx');
    const content = fs.readFileSync(componentPath, 'utf8');

    // Zoom button
    assert.ok(
      content.includes('className="dup-item-zoom-btn"'),
      'Item cards must render zoom button for previewing images'
    );

    // In-place preview modal state and JSX
    assert.ok(
      content.includes('const [previewItem, setPreviewItem] = useState'),
      'Must manage in-place previewItem state'
    );
    assert.ok(
      content.includes('className="dup-preview-modal-body"'),
      'Must render in-place preview modal markup'
    );
    assert.ok(
      content.includes('Mark for Deletion'),
      'Preview modal must provide mark/unmark for deletion control'
    );
  });

  it('should verify DuplicatesManagerTab.css has styling for zoom button and preview lightbox', () => {
    const cssPath = path.resolve('src/components/duplicates/DuplicatesManagerTab.css');
    assert.ok(fs.existsSync(cssPath), 'DuplicatesManagerTab.css should exist');

    const cssContent = fs.readFileSync(cssPath, 'utf8');
    assert.ok(cssContent.includes('.dup-item-zoom-btn'), 'Must define styles for .dup-item-zoom-btn');
    assert.ok(cssContent.includes('.dup-preview-modal-body'), 'Must define styles for .dup-preview-modal-body');
    assert.ok(cssContent.includes('.dup-preview-img-wrap'), 'Must define styles for .dup-preview-img-wrap');
  });

  it('should verify App.tsx does not redirect to main gallery on duplicates screen', () => {
    const appPath = path.resolve('src/App.tsx');
    const content = fs.readFileSync(appPath, 'utf8');

    // App.tsx must render <DuplicatesScreen without passing a disruptive onOpenViewer that switches activeTab
    assert.ok(
      !content.includes("onOpenViewer={(filePath) => {\n                const match = mediaFiles.find((m) => m.file_path === filePath || m.filename === filePath);\n                if (match) {\n                  // Switch to main gallery tab with viewer open or handle directly\n                  setActiveTab('main');"),
      'App.tsx must not switch activeTab to main when viewing duplicates'
    );
  });

  it('should verify DuplicatesScreen declares onOpenViewer as optional', () => {
    const screenPath = path.resolve('src/screens/DuplicatesScreen.tsx');
    const content = fs.readFileSync(screenPath, 'utf8');

    assert.ok(
      content.includes('onOpenViewer?: (filePath: string) => void;'),
      'DuplicatesScreenProps must mark onOpenViewer as optional'
    );
  });
});
