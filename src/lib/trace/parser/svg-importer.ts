/**
 * lib/trace/parser/svg-importer.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Parses an SVG string into a TraceAssetFragment that can be inserted into
 * the current NovaTrace project via the `insertFragment` op.
 *
 * Adapted from sagedesigns-os lib/motion/parser/svg-importer.ts.
 * Returns a TraceAssetFragment instead of a MotionProject, keeping the parser
 * composable with the ops engine.
 */

import type { TraceElement } from '../types';
import type { TraceAssetFragment } from '../assets/types';
import { parseInlineStyle } from './style-parser';
import { translateSvgPath, parseTransformTranslation } from './path-transformer';
import { scrubDangerousSvgMarkup } from './svg-scrub';

let elementCounter = 0;
function generateId(prefix: string = 'elem'): string {
  elementCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${elementCounter}`;
}

/**
 * Parses an SVG string into a structured TraceAssetFragment with native
 * support for defs, inline styles, CSS custom properties, and group transforms.
 */
export function parseSvgToFragment(svgString: string): TraceAssetFragment {
  if (typeof window === 'undefined') {
    return {
      width: 600,
      height: 600,
      elements: {},
      rootElementIds: [],
    };
  }

  // Scrub active content before parsing. The `<defs>` and `<style>` innerHTML
  // captured below bypasses the element tag allowlist and is later persisted
  // into `fragment.defs`, which the stage injects via dangerouslySetInnerHTML —
  // so unsanitized input would carry hostile markup straight through import.
  const safeSvgString = scrubDangerousSvgMarkup(svgString);

  const parser = new DOMParser();
  const doc = parser.parseFromString(safeSvgString, 'image/svg+xml');
  const svg = doc.querySelector('svg');

  if (!svg) {
    throw new Error('No valid <svg> element found in string');
  }

  // Extract <defs> and top-level <style> content if present
  let defsHtml = '';
  const defsElements = svg.querySelectorAll('defs');
  defsElements.forEach((defs) => {
    defsHtml += defs.innerHTML.trim() + '\n';
  });

  // Also retain any top-level <style> elements inside defsHtml so CSS vars
  // and animations apply cleanly
  const styleElements = svg.querySelectorAll('style');
  styleElements.forEach((style) => {
    if (style.parentElement?.tagName.toLowerCase() !== 'defs') {
      defsHtml += `<style>${style.textContent || ''}</style>\n`;
    }
  });

  // Parse CSS custom properties from all <style> blocks (:root { --token: #val })
  const cssVars: Record<string, string> = {};
  styleElements.forEach((style) => {
    const text = style.textContent || '';
    const varMatches = text.matchAll(/(--[a-zA-Z0-9-_]+)\s*:\s*([^;\}]+)/g);
    for (const match of varMatches) {
      if (match[1] && match[2]) {
        cssVars[match[1].trim()] = match[2].trim();
      }
    }
  });

  function resolveCssVar(val: string | null | undefined): string | undefined {
    if (!val) return undefined;
    const trimmed = val.trim();
    if (trimmed.startsWith('var(')) {
      const match = trimmed.match(/var\((--[a-zA-Z0-9-_]+)(?:,\s*([^)]+))?\)/);
      if (match) {
        const varName = match[1];
        const fallback = match[2]?.trim();
        if (cssVars[varName]) return cssVars[varName];
        if (fallback) return fallback;
      }
    }
    return trimmed;
  }

  // Determine viewport dimensions
  let width = 600;
  let height = 600;
  let minX = 0;
  let minY = 0;

  const viewBox = svg.getAttribute('viewBox');
  if (viewBox) {
    const parts = viewBox.split(/[\s,]+/).map(parseFloat);
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
      minX = parts[0] || 0;
      minY = parts[1] || 0;
      width = Math.round(parts[2]);
      height = Math.round(parts[3]);
    }
  } else {
    const wAttr = svg.getAttribute('width');
    const hAttr = svg.getAttribute('height');
    if (wAttr) width = Math.round(parseFloat(wAttr)) || 600;
    if (hAttr) height = Math.round(parseFloat(hAttr)) || 600;
  }

  const elements: Record<string, TraceElement> = {};
  let rootElementIds: string[] = [];

  function processNode(
    node: Element,
    parentId: string | null = null,
    cumulativeDx: number = 0,
    cumulativeDy: number = 0,
    inheritedFill?: string,
    inheritedStroke?: string,
  ): string | null {
    const tagName = node.tagName.toLowerCase();

    if (
      ![
        'path',
        'rect',
        'circle',
        'ellipse',
        'g',
        'polygon',
        'polyline',
        'text',
        'line',
      ].includes(tagName)
    ) {
      // Process children of unsupported tags (e.g., <g> wrapped in <svg>)
      if (tagName !== 'g') {
        for (const child of Array.from(node.children)) {
          processNode(child, parentId, cumulativeDx, cumulativeDy, inheritedFill, inheritedStroke);
        }
      }
      return null;
    }

    let elemId = node.id || generateId(tagName);
    if (elements[elemId]) {
      let counter = 1;
      while (elements[`${elemId}_${counter}`]) {
        counter++;
      }
      elemId = `${elemId}_${counter}`;
    }

    const name =
      node.getAttribute('name') ||
      node.id ||
      `${tagName}_${Object.keys(elements).length + 1}`;

    // Parse inline CSS style and XML presentation attributes
    const inlineStyle = parseInlineStyle(node.getAttribute('style') || '');

    const rawFill =
      inlineStyle.fill || node.getAttribute('fill') || inheritedFill || '#000000';
    const fill = resolveCssVar(rawFill) || rawFill;

    const fillOpacity =
      inlineStyle.fillOpacity !== undefined
        ? parseFloat(inlineStyle.fillOpacity)
        : node.getAttribute('fill-opacity')
          ? parseFloat(node.getAttribute('fill-opacity')!)
          : 1;

    const rawStroke =
      inlineStyle.stroke || node.getAttribute('stroke') || inheritedStroke || 'none';
    const stroke = resolveCssVar(rawStroke) || rawStroke;

    const strokeWidth =
      inlineStyle.strokeWidth !== undefined
        ? parseFloat(inlineStyle.strokeWidth)
        : parseFloat(node.getAttribute('stroke-width') || '1') || 1;
    const opacity =
      inlineStyle.opacity !== undefined
        ? parseFloat(inlineStyle.opacity)
        : parseFloat(node.getAttribute('opacity') || '1') || 1;
    const strokeDasharray =
      inlineStyle.strokeDasharray || node.getAttribute('stroke-dasharray') || undefined;
    const strokeDashoffset =
      inlineStyle.strokeDashoffset !== undefined
        ? parseFloat(inlineStyle.strokeDashoffset)
        : node.getAttribute('stroke-dashoffset')
          ? parseFloat(node.getAttribute('stroke-dashoffset')!)
          : 0;

    // Check for transform offsets on this node
    const nodeTransform = parseTransformTranslation(
      node.getAttribute('transform') || '',
    );
    const currentDx = cumulativeDx + nodeTransform.x;
    const currentDy = cumulativeDy + nodeTransform.y;

    const attributes: Record<string, any> = {
      fill,
      fillOpacity,
      stroke,
      strokeWidth,
      opacity,
      strokeDasharray,
      strokeDashoffset,
    };

    const traceElem: TraceElement = {
      id: elemId,
      name,
      type: tagName === 'g' ? 'group' : (tagName as TraceElement['type']),
      visible: true,
      locked: false,
      attributes,
      origin: { x: Math.round(width / 2), y: Math.round(height / 2) },
      tracks: [],
      parentId,
      childrenIds: [],
    };

    if (tagName === 'path') {
      const rawD = node.getAttribute('d') || '';
      const translatedD = translateSvgPath(rawD, currentDx, currentDy);
      attributes.d = translatedD;

      // Measure path length and bounding box accurately in detached SVG
      try {
        const tempSvg = document.createElementNS(
          'http://www.w3.org/2000/svg',
          'svg',
        );
        tempSvg.setAttribute('width', '0');
        tempSvg.setAttribute('height', '0');
        tempSvg.style.position = 'absolute';
        tempSvg.style.visibility = 'hidden';
        tempSvg.style.pointerEvents = 'none';

        const tempPath = document.createElementNS(
          'http://www.w3.org/2000/svg',
          'path',
        );
        tempPath.setAttribute('d', translatedD);
        tempSvg.appendChild(tempPath);
        document.body.appendChild(tempSvg);

        const length = Math.round(tempPath.getTotalLength());
        const bbox = tempPath.getBBox();
        document.body.removeChild(tempSvg);

        attributes.strokeDasharray = `${length} ${length}`;
        attributes.strokeDashoffset = 0;
        if (bbox && (bbox.width > 0 || bbox.height > 0)) {
          traceElem.origin = {
            x: Math.round(bbox.x + bbox.width / 2),
            y: Math.round(bbox.y + bbox.height / 2),
          };
        }
      } catch {
        attributes.strokeDasharray = '500 500';
        attributes.strokeDashoffset = 0;
      }
    } else if (tagName === 'polygon' || tagName === 'polyline') {
      // Convert polygon/polyline to path for NovaTrace
      traceElem.type = 'path';
      const rawPoints = node.getAttribute('points') || '';
      const numbers =
        rawPoints
          .match(/-?[0-9]*\.?[0-9]+(?:e[-+]?[0-9]+)?/gi)
          ?.map(Number) || [];
      let d = '';
      for (let i = 0; i < numbers.length; i += 2) {
        const px = Number((numbers[i] + currentDx).toFixed(2));
        const py = Number((numbers[i + 1] + currentDy).toFixed(2));
        d += i === 0 ? `M ${px} ${py}` : ` L ${px} ${py}`;
      }
      if (tagName === 'polygon' && d) {
        d += ' Z';
      }
      attributes.d = d;

      try {
        const tempSvg = document.createElementNS(
          'http://www.w3.org/2000/svg',
          'svg',
        );
        tempSvg.setAttribute('width', '0');
        tempSvg.setAttribute('height', '0');
        tempSvg.style.position = 'absolute';
        tempSvg.style.visibility = 'hidden';
        tempSvg.style.pointerEvents = 'none';

        const tempPath = document.createElementNS(
          'http://www.w3.org/2000/svg',
          'path',
        );
        tempPath.setAttribute('d', d);
        tempSvg.appendChild(tempPath);
        document.body.appendChild(tempSvg);

        const length = Math.round(tempPath.getTotalLength());
        const bbox = tempPath.getBBox();
        document.body.removeChild(tempSvg);

        attributes.strokeDasharray = `${length} ${length}`;
        attributes.strokeDashoffset = 0;
        if (bbox && (bbox.width > 0 || bbox.height > 0)) {
          traceElem.origin = {
            x: Math.round(bbox.x + bbox.width / 2),
            y: Math.round(bbox.y + bbox.height / 2),
          };
        }
      } catch {
        attributes.strokeDasharray = '500 500';
        attributes.strokeDashoffset = 0;
      }
    } else if (tagName === 'line') {
      // Convert line to path for NovaTrace
      traceElem.type = 'path';
      const x1 = parseFloat(node.getAttribute('x1') || '0') + currentDx;
      const y1 = parseFloat(node.getAttribute('y1') || '0') + currentDy;
      const x2 = parseFloat(node.getAttribute('x2') || '0') + currentDx;
      const y2 = parseFloat(node.getAttribute('y2') || '0') + currentDy;
      attributes.d = `M ${x1} ${y1} L ${x2} ${y2}`;
      traceElem.origin = {
        x: Math.round((x1 + x2) / 2),
        y: Math.round((y1 + y2) / 2),
      };
    } else if (tagName === 'rect') {
      const x = parseFloat(node.getAttribute('x') || '0') + currentDx;
      const y = parseFloat(node.getAttribute('y') || '0') + currentDy;
      const w = parseFloat(node.getAttribute('width') || '100');
      const h = parseFloat(node.getAttribute('height') || '100');
      const rx = parseFloat(node.getAttribute('rx') || '0') || 0;
      const ry = parseFloat(node.getAttribute('ry') || '0') || 0;
      attributes.baseX = x;
      attributes.baseY = y;
      attributes.width = w;
      attributes.height = h;
      attributes.x = 0;
      attributes.y = 0;
      if (rx) attributes.rx = rx;
      if (ry) attributes.ry = ry;
      traceElem.origin = { x: Math.round(x + w / 2), y: Math.round(y + h / 2) };
    } else if (tagName === 'circle') {
      const cx = parseFloat(node.getAttribute('cx') || '50') + currentDx;
      const cy = parseFloat(node.getAttribute('cy') || '50') + currentDy;
      const r = parseFloat(node.getAttribute('r') || '25');
      attributes.cx = cx;
      attributes.cy = cy;
      attributes.r = r;
      traceElem.origin = { x: Math.round(cx), y: Math.round(cy) };
    } else if (tagName === 'ellipse') {
      const cx = parseFloat(node.getAttribute('cx') || '50') + currentDx;
      const cy = parseFloat(node.getAttribute('cy') || '50') + currentDy;
      const rx = parseFloat(node.getAttribute('rx') || '25');
      const ry = parseFloat(node.getAttribute('ry') || '25');
      attributes.cx = cx;
      attributes.cy = cy;
      attributes.rx = rx;
      attributes.ry = ry;
      traceElem.origin = { x: Math.round(cx), y: Math.round(cy) };
    } else if (tagName === 'text') {
      const x = parseFloat(node.getAttribute('x') || '0') + currentDx;
      const y = parseFloat(node.getAttribute('y') || '0') + currentDy;
      const fontSize =
        parseFloat(
          node.getAttribute('font-size') || inlineStyle.fontSize || '24',
        ) || 24;
      const fontFamily =
        node.getAttribute('font-family') ||
        inlineStyle.fontFamily ||
        'Inter, sans-serif';
      const fontWeight =
        node.getAttribute('font-weight') || inlineStyle.fontWeight || '600';
      const textAnchor =
        node.getAttribute('text-anchor') ||
        inlineStyle.textAnchor ||
        'start';
      const textContent = node.textContent?.trim() || 'Text';

      attributes.baseX = x;
      attributes.baseY = y;
      attributes.x = 0;
      attributes.y = 0;
      attributes.text = textContent;
      attributes.fontSize = fontSize;
      attributes.fontFamily = fontFamily;
      attributes.fontWeight = fontWeight;
      attributes.textAnchor = textAnchor;
      traceElem.origin = { x: Math.round(x), y: Math.round(y) };
    }

    // Process children if group
    if (tagName === 'g') {
      const children: string[] = [];
      Array.from(node.children).forEach((child) => {
        const childId = processNode(
          child,
          elemId,
          currentDx,
          currentDy,
          fill !== '#000000' ? fill : inheritedFill,
          stroke !== 'none' ? stroke : inheritedStroke,
        );
        if (childId) children.push(childId);
      });
      traceElem.childrenIds = children;
    }

    elements[elemId] = traceElem;
    return elemId;
  }

  Array.from(svg.children).forEach((child) => {
    // Skip defs, style, metadata from element list
    const tag = child.tagName.toLowerCase();
    if (
      ['defs', 'style', 'metadata', 'title', 'desc'].includes(tag)
    ) {
      return;
    }

    const id = processNode(child, null, -minX, -minY);
    if (id) rootElementIds.push(id);
  });

  // Unwrap single redundant root container groups if they only wrap child
  // elements without graphics
  while (
    rootElementIds.length === 1 &&
    elements[rootElementIds[0]]?.type === 'group' &&
    (elements[rootElementIds[0]]?.childrenIds?.length ?? 0) > 0
  ) {
    const parentId = rootElementIds[0];
    const parentElem = elements[parentId];
    const childrenIds = parentElem?.childrenIds || [];
    // If it only wraps a single child group, unwrap the redundant nesting
    if (
      childrenIds.length === 1 &&
      elements[childrenIds[0]]?.type === 'group'
    ) {
      rootElementIds = [...childrenIds];
      delete elements[parentId];
    } else {
      break;
    }
  }

  // If no elements parsed, return empty fragment
  if (rootElementIds.length === 0) {
    throw new Error('No valid SVG elements found in the file');
  }

  return {
    width,
    height,
    elements,
    rootElementIds,
    defs: defsHtml.trim() || undefined,
  };
}
