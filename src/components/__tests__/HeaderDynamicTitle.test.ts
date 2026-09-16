import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('Header Dynamic Page Title, Subtitle, and Gallery Stats Refactor', () => {
  it('should verify Header accepts activeTab, pageTitle, and pageSubtitle', () => {
    const headerPath = fs.existsSync('src/components/header/Header.tsx')
      ? path.resolve('src/components/header/Header.tsx')
      : path.resolve('src/components/Header.tsx');
    assert.ok(fs.existsSync(headerPath), 'Header.tsx should exist');

    const content = fs.readFileSync(headerPath, 'utf8');
    assert.ok(content.includes('activeTab?: string;'), 'HeaderProps must accept activeTab');
    assert.ok(content.includes('pageTitle?: string;'), 'HeaderProps must accept pageTitle');
    assert.ok(content.includes('pageSubtitle?: string;'), 'HeaderProps must accept pageSubtitle');
    assert.ok(
      content.includes('getPageTitleAndSubtitle'),
      'Header must dynamically compute page title and explanation subtitle'
    );
    const brandPath = fs.existsSync('src/components/header/HeaderBrandWrap.tsx')
      ? path.resolve('src/components/header/HeaderBrandWrap.tsx')
      : path.resolve('src/components/HeaderBrandWrap.tsx');
    const brandContent = fs.existsSync(brandPath) ? fs.readFileSync(brandPath, 'utf8') : '';
    const combinedContent = content + '\n' + brandContent;
    assert.ok(
      combinedContent.includes('<h1>{displayTitle}</h1>') ||
      (content.includes('displayTitle={displayTitle}') && (brandContent.includes('<h1>{renderedTitle}</h1>') || brandContent.includes('<h1>{finalTitle}</h1>') || brandContent.includes('<h1>{displayTitle}</h1>'))),
      'Header and HeaderBrandWrap must render dynamic title in h1'
    );
    assert.ok(
      combinedContent.includes('<p>{displaySubtitle}</p>') ||
      (content.includes('displaySubtitle={displaySubtitle}') && (brandContent.includes('<p>{renderedSubtitle}</p>') || brandContent.includes('<p>{finalSubtitle}</p>') || brandContent.includes('<p>{displaySubtitle}</p>'))),
      'Header and HeaderBrandWrap must render dynamic explanation in p'
    );
  });

  it('should verify App passes activeTab to Header', () => {
    const appPath = path.resolve('src/App.tsx');
    const content = fs.readFileSync(appPath, 'utf8');

    assert.ok(
      content.includes('<Header') && content.includes('activeTab={activeTab}'),
      'App.tsx must pass activeTab to Header'
    );
  });

  it('should verify MediaGallery removed galleryTitle and badgeCataloged, and moved stats to showingFilesCount', () => {
    const galleryPath = path.resolve('src/components/gallery/MediaGallery.tsx');
    const content = fs.readFileSync(galleryPath, 'utf8');

    assert.ok(
      !content.includes("t('galleryTitle')"),
      'MediaGallery must not render inline galleryTitle h2'
    );
    assert.ok(
      !content.includes('{processedCount} {t(\'badgeCataloged\')}'),
      'MediaGallery must not render badgeCataloged in stats badges'
    );
    assert.ok(
      content.includes("t('showingFilesCount')"),
      'MediaGallery must display showingFilesCount'
    );
    assert.ok(
      content.includes("t('badgeVideos')"),
      'MediaGallery must display badgeVideos along with showingFilesCount'
    );
  });
});
