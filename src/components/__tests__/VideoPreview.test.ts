import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('Video Preview & Streaming Support', () => {
  it('should verify media.controller.ts implements HTTP 206 Partial Content and Range headers', () => {
    const controllerPath = path.resolve('server/media/media.controller.ts');
    assert.ok(fs.existsSync(controllerPath), 'server/media/media.controller.ts should exist');

    const content = fs.readFileSync(controllerPath, 'utf8');

    // Range header check
    assert.ok(
      content.includes('rangeHeader') && content.includes('bytes='),
      'media.controller.ts must parse HTTP rangeHeader with bytes='
    );

    // Accept-Ranges header
    assert.ok(
      content.includes("res.setHeader('Accept-Ranges', 'bytes')"),
      'Must set Accept-Ranges: bytes header'
    );

    // 206 Partial Content status and Content-Range
    assert.ok(
      content.includes('res.status(206)') && content.includes('Content-Range'),
      'Must return 206 Partial Content and Content-Range header'
    );

    // Stream chunking
    assert.ok(
      content.includes('fs.createReadStream(filePath, { start, end })'),
      'Must create read stream for byte range slice'
    );

    // MOV MIME type compatibility
    assert.ok(
      /case '\.mov':\s+return 'video\/mp4'/.test(content),
      'Must map .mov to video/mp4 for browser compatibility'
    );

    // Endpoints inject req
    assert.ok(
      content.includes('@Req() req: Request') && content.includes('streamFileSafely(resolved, req, res)'),
      'getMediaFile must inject @Req() and pass to streamFileSafely'
    );
  });

  it('should verify MediaViewerModal.tsx renders video with poster, playsInline, and error fallback', () => {
    const viewerPath = path.resolve('src/components/gallery/MediaViewerModal.tsx');
    assert.ok(fs.existsSync(viewerPath), 'MediaViewerModal.tsx should exist');

    const content = fs.readFileSync(viewerPath, 'utf8');

    // Video tag with poster
    assert.ok(
      content.includes('poster={`/api/media/thumbnail?path='),
      'MediaViewerModal must render video poster from thumbnail service'
    );

    // playsInline and preload
    assert.ok(
      content.includes('playsInline') && content.includes('preload="metadata"'),
      'Video element must include playsInline and preload="metadata"'
    );

    // Video error fallback
    assert.ok(
      content.includes('videoPlaybackError') && content.includes('onError={() => setVideoPlaybackError(true)}'),
      'Must handle video playback error'
    );

    // Video fallback overlay with download link
    assert.ok(
      content.includes('media-lightbox-video-fallback') && content.includes('download='),
      'Must render fallback with download button when codec cannot be decoded in browser'
    );
  });

  it('should verify DuplicatesManagerTab renders video in preview modal and comparator', () => {
    const dupsPath = path.resolve('src/components/duplicates/DuplicatesManagerTab.tsx');
    assert.ok(fs.existsSync(dupsPath), 'DuplicatesManagerTab.tsx should exist');

    const content = fs.readFileSync(dupsPath, 'utf8');

    // In-place preview modal video support
    assert.ok(
      content.includes('previewItem.item.isVideo') &&
        content.includes('dup-preview-modal-video'),
      'Duplicates preview modal must render <video> for video items'
    );

    // Comparator video support
    assert.ok(
      content.includes('comparatorGroup.primary.isVideo') &&
        content.includes('comparatorGroup.duplicate.isVideo'),
      'Comparator must render <video> for primary and duplicate video items'
    );

    // Video tag badges on cards
    assert.ok(
      content.includes('dup-item-video-tag'),
      'Must render video badge tag on cards'
    );
  });

  it('should verify CSS styles for video components exist in stylesheets', () => {
    const viewerCssPath = path.resolve('src/components/gallery/MediaViewerModal.css');
    const viewerCss = fs.readFileSync(viewerCssPath, 'utf8');
    assert.ok(viewerCss.includes('.media-lightbox-video-wrap'), 'Must style .media-lightbox-video-wrap');
    assert.ok(viewerCss.includes('.media-lightbox-video-fallback'), 'Must style .media-lightbox-video-fallback');

    const dupsCssPath = path.resolve('src/components/duplicates/DuplicatesManagerTab.css');
    const dupsCss = fs.readFileSync(dupsCssPath, 'utf8');
    assert.ok(dupsCss.includes('.dup-preview-modal-video'), 'Must style .dup-preview-modal-video');
    assert.ok(dupsCss.includes('.dup-item-video-tag'), 'Must style .dup-item-video-tag');
  });
});
