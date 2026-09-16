import { toPng, toJpeg, toSvg } from 'html-to-image';
import { getNodesBounds } from '@xyflow/react';

export type ExportImageFormat = 'png' | 'jpeg' | 'svg';
export type ExportQualityPreset = 'standard' | 'high' | 'ultra';
export type ExportBackgroundStyle = 'theme' | 'dark' | 'light' | 'transparent';

export interface ExportTreeOptions {
  containerEl?: HTMLElement | null;
  nodes?: any[];
  treeId?: string;
  format?: ExportImageFormat;
  quality?: ExportQualityPreset;
  backgroundStyle?: ExportBackgroundStyle;
  customFilename?: string;
}

export interface ExportTimelineOptions {
  timelineEl?: HTMLElement | null;
  personName: string;
  personId?: string;
  format?: ExportImageFormat;
  quality?: ExportQualityPreset;
  backgroundStyle?: ExportBackgroundStyle;
  customFilename?: string;
}

/**
 * Resolves numeric pixelRatio scale from quality preset.
 */
export function getPixelRatioForQuality(quality: ExportQualityPreset = 'high'): number {
  switch (quality) {
    case 'ultra':
      return 3;
    case 'standard':
      return 1;
    case 'high':
    default:
      return 2;
  }
}

/**
 * Resolves CSS background color string based on style selection.
 */
export function getBackgroundColor(style: ExportBackgroundStyle = 'theme', format: ExportImageFormat = 'png'): string | undefined {
  if (style === 'transparent') {
    return format === 'jpeg' ? '#0f172a' : undefined; // JPEG doesn't support transparency
  }
  if (style === 'dark') {
    return '#0f172a';
  }
  if (style === 'light') {
    return '#ffffff';
  }
  // 'theme': detect from active body / root or default dark
  try {
    const computed = window.getComputedStyle(document.body).backgroundColor;
    if (computed && computed !== 'rgba(0, 0, 0, 0)' && computed !== 'transparent') {
      return computed;
    }
  } catch {
    // fallback
  }
  return '#0f172a';
}

/**
 * Filter function to exclude floating UI controls from canvas export.
 */
export function isTreeUIOverlayNode(node: HTMLElement): boolean {
  if (!node || !node.classList) return false;
  const c = node.classList;
  return (
    c.contains('react-flow__minimap') ||
    c.contains('react-flow__controls') ||
    c.contains('canvas-toolbar') ||
    c.contains('tree-search-bar-container') ||
    c.contains('kinship-hud') ||
    c.contains('family-tree-tabs-container')
  );
}

/**
 * Triggers client-side browser file download from data URL or SVG string/blob.
 */
export function triggerFileDownload(dataUrlOrContent: string, filename: string): void {
  // SVG file download
  if (filename.endsWith('.svg')) {
    let svgContent = dataUrlOrContent;
    if (dataUrlOrContent.startsWith('data:image/svg+xml')) {
      if (dataUrlOrContent.includes(';base64,')) {
        const base64 = dataUrlOrContent.split(';base64,')[1];
        svgContent = atob(base64);
      } else {
        const encoded = dataUrlOrContent.split(',')[1];
        svgContent = decodeURIComponent(encoded);
      }
    }
    const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = filename;
    link.href = url;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return;
  }

  // PNG / JPEG data URL -> Blob for reliable download of high-res canvases
  if (dataUrlOrContent.startsWith('data:')) {
    try {
      const parts = dataUrlOrContent.split(',');
      const mimeMatch = parts[0].match(/:(.*?);/);
      const mime = mimeMatch ? mimeMatch[1] : (filename.endsWith('.jpg') ? 'image/jpeg' : 'image/png');
      const bstr = atob(parts[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      const blob = new Blob([u8arr], { type: mime });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = filename;
      link.href = url;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      return;
    } catch {
      // fallback to regular download link if Blob fails
    }
  }

  const link = document.createElement('a');
  link.download = filename;
  link.href = dataUrlOrContent;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Formats a clean date string for file downloads (YYYY-MM-DD).
 */
export function getExportTimestamp(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Exports the active Family Tree diagram to high-resolution PNG, JPG, or SVG.
 */
export async function exportTreeDiagram(options: ExportTreeOptions = {}): Promise<string> {
  const {
    containerEl,
    nodes: passedNodes,
    treeId = 'tree',
    format = 'png',
    quality = 'high',
    backgroundStyle = 'theme',
    customFilename,
  } = options;

  // Find viewport element containing all nodes and edges
  let target = containerEl;
  if (!target || !target.classList.contains('react-flow__viewport')) {
    target = target?.querySelector('.react-flow__viewport') as HTMLElement ||
      document.querySelector('.react-flow__viewport') as HTMLElement ||
      document.querySelector('.react-flow') as HTMLElement;
  }

  if (!target) {
    throw new Error('Family tree canvas element not found for export.');
  }

  const pixelRatio = getPixelRatioForQuality(quality);
  const backgroundColor = getBackgroundColor(backgroundStyle, format);

  // 1. Calculate bounding box of all nodes
  let bounds: { x: number; y: number; width: number; height: number } | null = null;

  if (passedNodes && passedNodes.length > 0) {
    try {
      const nodesWithDims = passedNodes.map((n: any) => ({
        ...n,
        width: n.measured?.width || n.width || (n.type === 'union' ? 40 : 280),
        height: n.measured?.height || n.height || (n.type === 'union' ? 40 : 130),
      }));
      bounds = getNodesBounds(nodesWithDims);
    } catch (e) {
      console.warn('getNodesBounds error:', e);
    }
  }

  // Fallback: inspect .react-flow__node elements in DOM
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
    const nodeEls = Array.from(document.querySelectorAll('.react-flow__node')) as HTMLElement[];
    if (nodeEls.length > 0) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      nodeEls.forEach((el) => {
        const transform = el.style.transform;
        const match = transform.match(/translate\(\s*(-?[\d.]+)px\s*,\s*(-?[\d.]+)px\s*\)/);
        if (match) {
          const x = parseFloat(match[1]);
          const y = parseFloat(match[2]);
          const w = el.offsetWidth || 280;
          const h = el.offsetHeight || 130;
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x + w);
          maxY = Math.max(maxY, y + h);
        }
      });
      if (minX !== Infinity && maxX > minX) {
        bounds = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
      }
    }
  }

  // Fallback to flow container size if empty
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
    const flowEl = document.querySelector('.react-flow') as HTMLElement | null;
    const w = flowEl?.offsetWidth || 1200;
    const h = flowEl?.offsetHeight || 800;
    bounds = { x: 0, y: 0, width: w, height: h };
  }

  const padding = 60;
  const exportWidth = Math.max(800, Math.ceil(bounds.width + padding * 2));
  const exportHeight = Math.max(600, Math.ceil(bounds.height + padding * 2));

  // Transform offset to place all nodes starting from (padding, padding)
  const transformX = -bounds.x + padding;
  const transformY = -bounds.y + padding;

  const exportOpts: any = {
    pixelRatio,
    backgroundColor,
    width: exportWidth,
    height: exportHeight,
    style: {
      width: `${exportWidth}px`,
      height: `${exportHeight}px`,
      transform: `translate(${transformX}px, ${transformY}px) scale(1)`,
      transformOrigin: '0 0',
    },
    filter: (node: any) => {
      if (node instanceof HTMLElement && isTreeUIOverlayNode(node)) {
        return false;
      }
      return true;
    },
    cacheBust: true,
  };

  let dataUrl: string;
  if (format === 'svg') {
    dataUrl = await toSvg(target, exportOpts);
  } else if (format === 'jpeg') {
    dataUrl = await toJpeg(target, { ...exportOpts, quality: 0.95 });
  } else {
    dataUrl = await toPng(target, exportOpts);
  }

  const ext = format === 'jpeg' ? 'jpg' : format;
  const filename = customFilename || `family_tree_${treeId}_${getExportTimestamp()}.${ext}`;
  triggerFileDownload(dataUrl, filename);
  return filename;
}

/**
 * Exports a Person's Chronological Life Timeline to PNG, JPG, or SVG.
 */
export async function exportPersonTimeline(options: ExportTimelineOptions): Promise<string> {
  const {
    timelineEl,
    personName,
    personId = 'person',
    format = 'png',
    quality = 'high',
    backgroundStyle = 'theme',
    customFilename,
  } = options;

  // Find timeline target element
  let target = timelineEl;
  if (!target) {
    target = document.querySelector('.timeline-export-capture-container') as HTMLElement;
    if (!target) {
      target = document.querySelector('.person-timeline-container') as HTMLElement;
    }
  }

  if (!target) {
    throw new Error('Person timeline element not found for export.');
  }

  const pixelRatio = getPixelRatioForQuality(quality);
  const backgroundColor = getBackgroundColor(backgroundStyle, format);

  const exportWidth = Math.max(600, target.offsetWidth || 720);
  const exportHeight = Math.max(300, target.scrollHeight || target.offsetHeight || 600);

  const exportOpts: any = {
    pixelRatio,
    backgroundColor,
    width: exportWidth,
    height: exportHeight,
    style: {
      width: `${exportWidth}px`,
      height: `${exportHeight}px`,
      overflow: 'visible',
    },
    filter: (node: any) => {
      if (node instanceof HTMLElement) {
        if (
          node.classList.contains('timeline-action-buttons-ignore') ||
          node.classList.contains('timeline-btn-add-fact') ||
          node.getAttribute('data-export-ignore') === 'true'
        ) {
          return false;
        }
      }
      return true;
    },
    cacheBust: true,
  };

  let dataUrl: string;
  if (format === 'svg') {
    dataUrl = await toSvg(target, exportOpts);
  } else if (format === 'jpeg') {
    dataUrl = await toJpeg(target, { ...exportOpts, quality: 0.95 });
  } else {
    dataUrl = await toPng(target, exportOpts);
  }

  const ext = format === 'jpeg' ? 'jpg' : format;
  const safeName = (personName || personId).replace(/[^a-zA-Z0-9_\u0400-\u04FF]/g, '_');
  const filename = customFilename || `timeline_${safeName}_${getExportTimestamp()}.${ext}`;
  triggerFileDownload(dataUrl, filename);
  return filename;
}
