/**
 * lib/trace/parser/svg-importer.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Parses an SVG string into a TraceAssetFragment that can be inserted into
 * the current NovaTrace project via the `insertFragment` op.
 *
 * The importer bakes the full transform chain (translate / scale / rotate /
 * skew / matrix) into each element's geometry, resolves `<use>` references and
 * reports everything it had to drop. The report is the compatibility gate for
 * generated artwork: producers can see exactly what will not survive import
 * instead of discovering it after insertion.
 *
 * Adapted from sagedesigns-os lib/motion/parser/svg-importer.ts.
 * Returns a TraceAssetFragment instead of a MotionProject, keeping the parser
 * composable with the ops engine.
 */

import type { TraceElement } from '../types';
import type { TraceAssetFragment } from '../assets/types';
import { parseInlineStyle } from './style-parser';
import {
  IDENTITY_MATRIX,
  applyMatrixToPoint,
  matrixIsAxisAlignedScale,
  matrixIsIdentity,
  matrixIsSimilarity,
  matrixIsTranslationOnly,
  matrixRotation,
  matrixScale,
  multiplyMatrices,
  parseSvgTransform,
  transformPathData,
  translationMatrix,
  type AffineMatrix,
} from './path-transformer';
import { parsePathData } from '../path/model';
import { scrubDangerousSvgMarkup } from './svg-scrub';

let elementCounter = 0;
function generateId(prefix: string = 'elem'): string {
  elementCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${elementCounter}`;
}

/** Everything the importer had to drop or approximate. */
export interface SvgImportReport {
  width: number;
  height: number;
  elementCount: number;
  /** Unsupported elements, keyed by lowercase tag name. */
  droppedTags: Record<string, number>;
  /** Presentation attributes that have no Trace equivalent. */
  droppedAttributes: Record<string, number>;
  /** Number of `<use>` references expanded into real layers. */
  expandedUses: number;
  warnings: string[];
}

export interface SvgImportResult {
  fragment: TraceAssetFragment;
  report: SvgImportReport;
}

const SKIP_ROOT_TAGS = new Set(['defs', 'style', 'metadata', 'title', 'desc']);
const DROP_ENTIRELY_TAGS = new Set([
  'defs',
  'style',
  'metadata',
  'title',
  'desc',
  'clippath',
  'mask',
  'pattern',
  'marker',
  'filter',
  'lineargradient',
  'radialgradient',
  'stop',
  'symbol',
  'foreignobject',
  'image',
  'script',
  'animate',
  'animatetransform',
  'animatemotion',
  'animatecolor',
  'set',
  'mpath',
]);
const DROPPED_ATTRIBUTES = new Set([
  'clip-path',
  'mask',
  'marker-start',
  'marker-mid',
  'marker-end',
  'vector-effect',
  'paint-order',
  'mix-blend-mode',
  'isolation',
  'shape-rendering',
  'class',
]);

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function note(map: Record<string, number>, key: string): void {
  map[key] = (map[key] ?? 0) + 1;
}

function matrixScaleForStroke(matrix: AffineMatrix): number {
  const scale = matrixScale(matrix);
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

function scaleDashArray(value: string, scale: number): string {
  if (!value || scale === 1) return value;
  return value
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((part) => {
      const numeric = Number(part);
      return Number.isFinite(numeric) ? String(round2(numeric * scale)) : part;
    })
    .join(' ');
}

interface PathMeasurement {
  length: number | null;
  bbox: { x: number; y: number; width: number; height: number } | null;
}

/** Measure path length and bounds in a detached SVG, with a pure fallback. */
function measurePath(d: string): PathMeasurement {
  try {
    const tempSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    tempSvg.setAttribute('width', '0');
    tempSvg.setAttribute('height', '0');
    tempSvg.style.position = 'absolute';
    tempSvg.style.visibility = 'hidden';
    tempSvg.style.pointerEvents = 'none';

    const tempPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    tempPath.setAttribute('d', d);
    tempSvg.appendChild(tempPath);
    document.body.appendChild(tempSvg);

    const length = Math.round(tempPath.getTotalLength());
    const bbox = tempPath.getBBox();
    document.body.removeChild(tempSvg);

    if (bbox && Number.isFinite(bbox.width) && (bbox.width > 0 || bbox.height > 0)) {
      return {
        length: Number.isFinite(length) && length > 0 ? length : null,
        bbox: { x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height },
      };
    }
    return { length: Number.isFinite(length) && length > 0 ? length : null, bbox: null };
  } catch {
    const bbox = bboxFromPathData(d);
    return { length: null, bbox };
  }
}

/** Conservative bounds from anchor and control points (no DOM required). */
function bboxFromPathData(d: string): PathMeasurement['bbox'] {
  try {
    const model = parsePathData(d);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const subpath of model.subpaths) {
      for (const node of subpath.nodes) {
        for (const point of [node.point, node.handleIn, node.handleOut]) {
          if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
          minX = Math.min(minX, point.x);
          minY = Math.min(minY, point.y);
          maxX = Math.max(maxX, point.x);
          maxY = Math.max(maxY, point.y);
        }
      }
    }
    if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  } catch {
    return null;
  }
}

function rectToPathD(
  x: number,
  y: number,
  width: number,
  height: number,
  rx: number,
  ry: number,
): string {
  if (rx <= 0 && ry <= 0) {
    return `M ${x} ${y} H ${x + width} V ${y + height} H ${x} Z`;
  }
  const radiusX = Math.min(Math.abs(rx), width / 2);
  const radiusY = Math.min(Math.abs(ry), height / 2);
  return [
    `M ${x + radiusX} ${y}`,
    `H ${x + width - radiusX}`,
    `A ${radiusX} ${radiusY} 0 0 1 ${x + width} ${y + radiusY}`,
    `V ${y + height - radiusY}`,
    `A ${radiusX} ${radiusY} 0 0 1 ${x + width - radiusX} ${y + height}`,
    `H ${x + radiusX}`,
    `A ${radiusX} ${radiusY} 0 0 1 ${x} ${y + height - radiusY}`,
    `V ${y + radiusY}`,
    `A ${radiusX} ${radiusY} 0 0 1 ${x + radiusX} ${y}`,
    'Z',
  ].join(' ');
}

function ellipseToPathD(cx: number, cy: number, rx: number, ry: number): string {
  return [
    `M ${cx - rx} ${cy}`,
    `A ${rx} ${ry} 0 1 0 ${cx + rx} ${cy}`,
    `A ${rx} ${ry} 0 1 0 ${cx - rx} ${cy}`,
    'Z',
  ].join(' ');
}

/**
 * Parse an SVG string into a fragment plus a report of unsupported features.
 */
export function parseSvgToFragmentDetailed(svgString: string): SvgImportResult {
  const report: SvgImportReport = {
    width: 600,
    height: 600,
    elementCount: 0,
    droppedTags: {},
    droppedAttributes: {},
    expandedUses: 0,
    warnings: [],
  };

  if (typeof window === 'undefined') {
    return {
      fragment: { width: 600, height: 600, elements: {}, rootElementIds: [] },
      report,
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

  // Extract <defs> and top-level <style> content if present.
  let defsHtml = '';
  const defsElements = svg.querySelectorAll('defs');
  defsElements.forEach((defs) => {
    defsHtml += defs.innerHTML.trim() + '\n';
  });

  // Retain any top-level <style> elements inside defsHtml so CSS custom
  // properties and animations apply cleanly.
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
    // CSS class/id selectors cannot be resolved against Trace attributes.
    if (/^[^{}]*[.#][a-zA-Z_-][^{}]*\{/m.test(text)) {
      report.warnings.push(
        'CSS class or id selectors are not applied on import; use presentation attributes or inline styles so styling survives.',
      );
    }
    if (/@keyframes|animation\s*:|transition\s*:/i.test(text)) {
      report.warnings.push(
        'CSS animation is not imported; animate the resulting layers with Trace tracks instead.',
      );
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

  // Determine viewport dimensions.
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

  report.width = width;
  report.height = height;

  const elements: Record<string, TraceElement> = {};
  let rootElementIds: string[] = [];

  function noteDroppedTag(tag: string): void {
    note(report.droppedTags, tag);
  }

  function uniqueElementId(rawId: string | null, fallbackPrefix: string): string {
    let elemId = rawId?.trim() || generateId(fallbackPrefix);
    if (elements[elemId]) {
      let counter = 1;
      while (elements[`${elemId}_${counter}`]) counter += 1;
      elemId = `${elemId}_${counter}`;
    }
    return elemId;
  }

  function createGroup(
    name: string,
    parentId: string | null,
    childrenIds: string[],
  ): string {
    const groupId = uniqueElementId(null, 'group');
    elements[groupId] = {
      id: groupId,
      name,
      type: 'group',
      visible: true,
      locked: false,
      attributes: {},
      origin: { x: Math.round(width / 2), y: Math.round(height / 2) },
      tracks: [],
      parentId,
      childrenIds,
    };
    for (const childId of childrenIds) {
      if (elements[childId]) elements[childId].parentId = groupId;
    }
    return groupId;
  }

  function collectDroppedAttributes(node: Element): void {
    for (const name of Array.from(node.getAttributeNames())) {
      const normalized = name.toLowerCase();
      if (DROPPED_ATTRIBUTES.has(normalized)) note(report.droppedAttributes, normalized);
    }
  }

  function processChildren(
    container: Element,
    parentId: string | null,
    parentMatrix: AffineMatrix,
    inheritedFill: string | undefined,
    inheritedStroke: string | undefined,
    useStack: ReadonlySet<string>,
    depth: number,
  ): string[] {
    const ids: string[] = [];
    for (const child of Array.from(container.children)) {
      const id = processNode(
        child,
        parentId,
        parentMatrix,
        inheritedFill,
        inheritedStroke,
        useStack,
        depth,
      );
      if (id) ids.push(id);
    }
    return ids;
  }

  function processNode(
    node: Element,
    parentId: string | null = null,
    parentMatrix: AffineMatrix = IDENTITY_MATRIX,
    inheritedFill?: string,
    inheritedStroke?: string,
    useStack: ReadonlySet<string> = new Set(),
    depth = 0,
  ): string | null {
    const tagName = node.tagName.toLowerCase();

    if (depth > 24) {
      report.warnings.push('A deeply nested SVG group was truncated at 24 levels.');
      return null;
    }

    collectDroppedAttributes(node);

    // Report SMIL animation on any node, including supported shapes whose
    // children are otherwise not traversed.
    for (const child of Array.from(node.children)) {
      const childTag = child.tagName.toLowerCase();
      if (
        childTag === 'animate' ||
        childTag === 'animatetransform' ||
        childTag === 'animatemotion' ||
        childTag === 'animatecolor' ||
        childTag === 'set'
      ) {
        noteDroppedTag(childTag);
      }
    }

    if (tagName === 'use') {
      const href =
        node.getAttribute('href') ||
        node.getAttribute('xlink:href') ||
        '';
      if (!href.startsWith('#')) {
        noteDroppedTag('use');
        report.warnings.push('A <use> element without a local fragment reference was skipped.');
        return null;
      }
      const targetId = href.slice(1);
      if (useStack.has(targetId)) {
        report.warnings.push(`A circular <use> reference to "${targetId}" was skipped.`);
        return null;
      }
      const target = doc.getElementById(targetId);
      if (!target) {
        report.warnings.push(`A <use> reference to missing id "${targetId}" was skipped.`);
        return null;
      }

      const useX = parseFloat(node.getAttribute('x') || '0') || 0;
      const useY = parseFloat(node.getAttribute('y') || '0') || 0;
      const localMatrix = multiplyMatrices(
        parseSvgTransform(node.getAttribute('transform')),
        translationMatrix(useX, useY),
      );
      const currentMatrix = multiplyMatrices(parentMatrix, localMatrix);
      const nextStack = new Set(useStack);
      nextStack.add(targetId);
      report.expandedUses += 1;

      const targetTag = target.tagName.toLowerCase();
      if (targetTag === 'symbol') {
        if (target.hasAttribute('viewBox')) {
          report.warnings.push(
            `A <symbol> referenced by <use> had a viewBox, which is not remapped; its geometry was imported in place.`,
          );
        }
        const childIds = processChildren(
          target,
          parentId,
          currentMatrix,
          inheritedFill,
          inheritedStroke,
          nextStack,
          depth + 1,
        );
        if (childIds.length === 0) return null;
        if (childIds.length === 1) return childIds[0];
        return createGroup(
          node.getAttribute('id') || `use_${targetId}`,
          parentId,
          childIds,
        );
      }

      return processNode(
        target,
        parentId,
        currentMatrix,
        inheritedFill,
        inheritedStroke,
        nextStack,
        depth + 1,
      );
    }

    if (!['path', 'rect', 'circle', 'ellipse', 'g', 'polygon', 'polyline', 'text', 'line'].includes(tagName)) {
      if (DROP_ENTIRELY_TAGS.has(tagName)) {
        noteDroppedTag(tagName);
        return null;
      }
      // Unknown containers such as <a> or <switch>: keep their graphics.
      const childIds = processChildren(
        node,
        parentId,
        parentMatrix,
        inheritedFill,
        inheritedStroke,
        useStack,
        depth + 1,
      );
      if (childIds.length === 0) return null;
      if (childIds.length === 1) return childIds[0];
      return createGroup(
        node.getAttribute('id') || `${tagName}_${Object.keys(elements).length + 1}`,
        parentId,
        childIds,
      );
    }

    const elemId = uniqueElementId(node.id || null, tagName);
    const name =
      node.getAttribute('name') ||
      node.id ||
      `${tagName}_${Object.keys(elements).length + 1}`;

    // Parse inline CSS style and XML presentation attributes.
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
    const strokeLinecap =
      inlineStyle.strokeLinecap || node.getAttribute('stroke-linecap') || undefined;
    const strokeLinejoin =
      inlineStyle.strokeLinejoin || node.getAttribute('stroke-linejoin') || undefined;

    const localMatrix = parseSvgTransform(node.getAttribute('transform'));
    const currentMatrix = multiplyMatrices(parentMatrix, localMatrix);
    const scale = matrixScaleForStroke(currentMatrix);

    const attributes: Record<string, any> = {
      fill,
      fillOpacity,
      stroke,
      strokeWidth: round2(strokeWidth * scale),
      opacity,
      ...(strokeLinecap ? { strokeLinecap } : {}),
      ...(strokeLinejoin ? { strokeLinejoin } : {}),
      ...(strokeDasharray
        ? {
            strokeDasharray: scaleDashArray(strokeDasharray, scale),
            strokeDashoffset: round2(strokeDashoffset * scale),
          }
        : {}),
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

    const applyDashAndOrigin = (d: string): void => {
      const hadDasharray =
        typeof attributes.strokeDasharray === 'string' &&
        attributes.strokeDasharray.trim() !== '';
      const measurement = measurePath(d);
      if (stroke !== 'none' && Number(attributes.strokeWidth) > 0 && !hadDasharray) {
        const length = measurement.length ?? 500;
        attributes.strokeDasharray = `${length} ${length}`;
        attributes.strokeDashoffset = 0;
      }
      if (measurement.bbox) {
        traceElem.origin = {
          x: Math.round(measurement.bbox.x + measurement.bbox.width / 2),
          y: Math.round(measurement.bbox.y + measurement.bbox.height / 2),
        };
      }
    };

    if (tagName === 'path') {
      const rawD = node.getAttribute('d') || '';
      if (!rawD.trim()) {
        report.warnings.push(`Path "${name}" has no data and was skipped.`);
        return null;
      }
      attributes.d = transformPathData(rawD, currentMatrix);
      applyDashAndOrigin(attributes.d);
    } else if (tagName === 'polygon' || tagName === 'polyline') {
      // Polygon/polyline are converted to paths so transforms bake cleanly.
      traceElem.type = 'path';
      const rawPoints = node.getAttribute('points') || '';
      const numbers =
        rawPoints
          .match(/-?[0-9]*\.?[0-9]+(?:e[-+]?[0-9]+)?/gi)
          ?.map(Number) || [];
      let d = '';
      for (let i = 0; i < numbers.length; i += 2) {
        const px = numbers[i];
        const py = numbers[i + 1] ?? 0;
        d += i === 0 ? `M ${px} ${py}` : ` L ${px} ${py}`;
      }
      if (tagName === 'polygon' && d) d += ' Z';
      if (!d) {
        report.warnings.push(`Shape "${name}" has no points and was skipped.`);
        return null;
      }
      attributes.d = transformPathData(d, currentMatrix);
      applyDashAndOrigin(attributes.d);
    } else if (tagName === 'line') {
      // Line is converted to a path for NovaTrace.
      traceElem.type = 'path';
      const x1 = parseFloat(node.getAttribute('x1') || '0');
      const y1 = parseFloat(node.getAttribute('y1') || '0');
      const x2 = parseFloat(node.getAttribute('x2') || '0');
      const y2 = parseFloat(node.getAttribute('y2') || '0');
      attributes.d = transformPathData(`M ${x1} ${y1} L ${x2} ${y2}`, currentMatrix);
      traceElem.origin = {
        x: Math.round((x1 + x2) / 2),
        y: Math.round((y1 + y2) / 2),
      };
      if (!matrixIsTranslationOnly(currentMatrix)) {
        const measurement = measurePath(attributes.d);
        if (measurement.bbox) {
          traceElem.origin = {
            x: Math.round(measurement.bbox.x + measurement.bbox.width / 2),
            y: Math.round(measurement.bbox.y + measurement.bbox.height / 2),
          };
        }
      }
    } else if (tagName === 'rect') {
      const x = parseFloat(node.getAttribute('x') || '0');
      const y = parseFloat(node.getAttribute('y') || '0');
      const w = parseFloat(node.getAttribute('width') || '100');
      const h = parseFloat(node.getAttribute('height') || '100');
      const rx = parseFloat(node.getAttribute('rx') || '0') || 0;
      const ry = parseFloat(node.getAttribute('ry') || '') || rx;

      if (matrixIsTranslationOnly(currentMatrix)) {
        // Keep the native editable rect. The body is drawn at local (0,0) with
        // baseX/baseY carrying placement, so the origin stays local too.
        const tx = round2(x + currentMatrix.e);
        const ty = round2(y + currentMatrix.f);
        attributes.baseX = tx;
        attributes.baseY = ty;
        attributes.width = w;
        attributes.height = h;
        attributes.x = 0;
        attributes.y = 0;
        if (rx) attributes.rx = rx;
        if (ry) attributes.ry = ry;
        traceElem.origin = { x: Math.round(w / 2), y: Math.round(h / 2) };
      } else {
        // Rotation, scale or skew: bake the transform into a path so the
        // imported shape is pixel-identical and still fully editable.
        traceElem.type = 'path';
        const d = rectToPathD(x, y, w, h, rx, ry);
        attributes.d = transformPathData(d, currentMatrix);
        applyDashAndOrigin(attributes.d);
      }
    } else if (tagName === 'circle') {
      const cx = parseFloat(node.getAttribute('cx') || '50');
      const cy = parseFloat(node.getAttribute('cy') || '50');
      const r = parseFloat(node.getAttribute('r') || '25');
      const center = applyMatrixToPoint(currentMatrix, { x: cx, y: cy });

      if (matrixIsSimilarity(currentMatrix) || matrixIsAxisAlignedScale(currentMatrix)) {
        if (matrixIsAxisAlignedScale(currentMatrix) && !matrixIsSimilarity(currentMatrix)) {
          // Non-uniform axis-aligned scale turns a circle into an ellipse.
          traceElem.type = 'ellipse';
          const radiusX = Math.abs(r * currentMatrix.a);
          const radiusY = Math.abs(r * currentMatrix.d);
          attributes.x = round2(center.x - radiusX);
          attributes.y = round2(center.y - radiusY);
          attributes.width = round2(radiusX * 2);
          attributes.height = round2(radiusY * 2);
          attributes.rx = round2(radiusX);
          attributes.ry = round2(radiusY);
          traceElem.origin = { x: Math.round(radiusX), y: Math.round(radiusY) };
        } else {
          // Similarity: a circle stays a circle. Rotation does not change it.
          const radius = Math.abs(r * matrixScale(currentMatrix));
          attributes.x = round2(center.x - radius);
          attributes.y = round2(center.y - radius);
          attributes.width = round2(radius * 2);
          attributes.height = round2(radius * 2);
          traceElem.origin = { x: Math.round(radius), y: Math.round(radius) };
        }
      } else {
        traceElem.type = 'path';
        attributes.d = transformPathData(ellipseToPathD(cx, cy, r, r), currentMatrix);
        applyDashAndOrigin(attributes.d);
      }
    } else if (tagName === 'ellipse') {
      const cx = parseFloat(node.getAttribute('cx') || '50');
      const cy = parseFloat(node.getAttribute('cy') || '50');
      const rx = parseFloat(node.getAttribute('rx') || '25');
      const ry = parseFloat(node.getAttribute('ry') || '25');
      const center = applyMatrixToPoint(currentMatrix, { x: cx, y: cy });
      const rotation = matrixRotation(currentMatrix);

      if (
        matrixIsAxisAlignedScale(currentMatrix) &&
        Math.abs(rotation) < 0.01
      ) {
        const radiusX = Math.abs(rx * currentMatrix.a);
        const radiusY = Math.abs(ry * currentMatrix.d);
        attributes.x = round2(center.x - radiusX);
        attributes.y = round2(center.y - radiusY);
        attributes.width = round2(radiusX * 2);
        attributes.height = round2(radiusY * 2);
        attributes.rx = round2(radiusX);
        attributes.ry = round2(radiusY);
        traceElem.origin = { x: Math.round(radiusX), y: Math.round(radiusY) };
      } else {
        // Rotated or skewed ellipses bake to a path so the angle is exact.
        traceElem.type = 'path';
        attributes.d = transformPathData(ellipseToPathD(cx, cy, rx, ry), currentMatrix);
        applyDashAndOrigin(attributes.d);
      }
    } else if (tagName === 'text') {
      const x = parseFloat(node.getAttribute('x') || '0');
      const y = parseFloat(node.getAttribute('y') || '0');
      const position = applyMatrixToPoint(currentMatrix, { x, y });
      const rotation = matrixRotation(currentMatrix);
      const scaleX = Math.hypot(currentMatrix.a, currentMatrix.b);
      const scaleY = Math.hypot(currentMatrix.c, currentMatrix.d);
      const similarity = matrixIsSimilarity(currentMatrix);
      const sheared =
        Math.abs(currentMatrix.a * currentMatrix.c + currentMatrix.b * currentMatrix.d) > 1e-4;

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

      attributes.baseX = round2(position.x);
      attributes.baseY = round2(position.y);
      attributes.x = 0;
      attributes.y = 0;
      attributes.text = textContent;
      attributes.fontSize = round2(
        similarity ? fontSize * scaleX : fontSize,
      );
      attributes.fontFamily = fontFamily;
      attributes.fontWeight = fontWeight;
      attributes.textAnchor = textAnchor;
      if (Math.abs(rotation) > 0.01) attributes.rotation = round2(rotation);
      if (!similarity) {
        attributes.scaleX = round2(scaleX);
        attributes.scaleY = round2(scaleY);
      }
      if (sheared) {
        note(report.droppedAttributes, 'text-skew');
        report.warnings.push(
          `Text "${name}" used a skew transform, which text elements cannot represent; rotation and scale were kept.`,
        );
      }
      traceElem.origin = { x: 0, y: 0 };
    }

    // Process children if group.
    if (tagName === 'g') {
      const children = processChildren(
        node,
        elemId,
        currentMatrix,
        fill !== '#000000' ? fill : inheritedFill,
        stroke !== 'none' ? stroke : inheritedStroke,
        useStack,
        depth + 1,
      );
      traceElem.childrenIds = children;
    }

    elements[elemId] = traceElem;
    return elemId;
  }

  const rootMatrix = translationMatrix(-minX, -minY);
  Array.from(svg.children).forEach((child) => {
    const tag = child.tagName.toLowerCase();
    if (SKIP_ROOT_TAGS.has(tag)) return;

    const id = processNode(child, null, rootMatrix);
    if (id) rootElementIds.push(id);
  });

  // Unwrap single redundant root container groups if they only wrap child
  // elements without graphics.
  while (
    rootElementIds.length === 1 &&
    elements[rootElementIds[0]]?.type === 'group' &&
    (elements[rootElementIds[0]]?.childrenIds?.length ?? 0) > 0
  ) {
    const parentId = rootElementIds[0];
    const parentElem = elements[parentId];
    const childrenIds = parentElem?.childrenIds || [];
    // If it only wraps a single child group, unwrap the redundant nesting.
    if (
      childrenIds.length === 1 &&
      elements[childrenIds[0]]?.type === 'group'
    ) {
      rootElementIds = [...childrenIds];
      elements[childrenIds[0]].parentId = null;
      delete elements[parentId];
    } else {
      break;
    }
  }

  // If no elements parsed, return empty fragment.
  if (rootElementIds.length === 0) {
    throw new Error('No valid SVG elements found in the file');
  }

  report.elementCount = Object.keys(elements).length;

  const droppedTags = Object.keys(report.droppedTags);
  if (droppedTags.length > 0) {
    report.warnings.push(
      `Unsupported SVG elements were dropped: ${droppedTags
        .map((tag) => `${tag} ×${report.droppedTags[tag]}`)
        .join(', ')}.`,
    );
  }
  const droppedAttributes = Object.keys(report.droppedAttributes);
  if (droppedAttributes.length > 0) {
    report.warnings.push(
      `Unsupported SVG attributes were dropped: ${droppedAttributes.join(', ')}.`,
    );
  }

  const fragment: TraceAssetFragment = {
    width,
    height,
    elements,
    rootElementIds,
    defs: defsHtml.trim() || undefined,
  };

  return { fragment, report };
}

/**
 * Parse an SVG string into a structured TraceAssetFragment.
 */
export function parseSvgToFragment(svgString: string): TraceAssetFragment {
  return parseSvgToFragmentDetailed(svgString).fragment;
}