/**
 * lib/trace/assets/validate.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Deterministic validation for insertable Trace asset fragments.
 *
 * Every generative add-on proposal passes through this gate before it can be
 * inserted: blocks, generated SVG imports, and AI-authored fragments. It is the
 * "compatible without fail" contract — a fragment either validates and inserts
 * atomically, or it is rejected with actionable diagnostics before it can touch
 * a project.
 *
 * The element-graph and track checks reuse the project linter, so a fragment can
 * never be valid here and invalid after insertion. Fragment-specific rules add
 * the things a project does not have: key/id identity, per-type required
 * attributes, structured gradient/filter integrity, defs safety and budgets.
 */

import type { TraceAssetFragment } from './types';
import { toTraceProject } from './types';
import { lintTraceProject } from '../lint';
import type { TraceElement, TraceElementType, TraceGradient } from '../types';
import type { FilterPrimitiveKind, TraceFilter } from '../filters/types';

export type FragmentDiagnosticCode =
  | 'FRAGMENT_ELEMENT_ID_MISMATCH'
  | 'FRAGMENT_UNKNOWN_ELEMENT_TYPE'
  | 'FRAGMENT_MISSING_ATTRIBUTE'
  | 'FRAGMENT_INVALID_ATTRIBUTE'
  | 'FRAGMENT_ORPHAN_ELEMENT'
  | 'FRAGMENT_GRADIENT_INVALID'
  | 'FRAGMENT_FILTER_INVALID'
  | 'FRAGMENT_DEFS_UNSAFE'
  | 'FRAGMENT_DEFS_TOO_LARGE'
  | 'FRAGMENT_BUDGET_EXCEEDED'
  | 'FRAGMENT_TRACK_INVALID'
  | 'FRAGMENT_PAINT_UNRESOLVED';

export interface FragmentDiagnostic {
  code: FragmentDiagnosticCode;
  severity: 'error' | 'warning';
  message: string;
  elementId?: string;
  trackId?: string;
}

export interface FragmentValidationStats {
  elements: number;
  tracks: number;
  keyframes: number;
  gradients: number;
  filters: number;
  defsLength: number;
}

export interface FragmentValidationResult {
  ok: boolean;
  diagnostics: FragmentDiagnostic[];
  errors: FragmentDiagnostic[];
  warnings: FragmentDiagnostic[];
  stats: FragmentValidationStats;
}

export interface FragmentValidationOptions {
  /** Timeline length used for keyframe checks. Defaults to the fragment's own. */
  durationMs?: number;
  /** Hard element ceiling. Surfaces are capped well below project limits. */
  maxElements?: number;
  maxTracks?: number;
  maxKeyframesPerTrack?: number;
  maxDefsLength?: number;
}

export const DEFAULT_FRAGMENT_LIMITS = {
  maxElements: 600,
  maxTracks: 240,
  maxKeyframesPerTrack: 24,
  maxDefsLength: 200_000,
} as const;

const ELEMENT_TYPES: ReadonlySet<TraceElementType> = new Set([
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'image',
  'use',
  'group',
  'text',
]);

const FILTER_PRIMITIVES: ReadonlySet<FilterPrimitiveKind> = new Set([
  'feGaussianBlur',
  'feOffset',
  'feFlood',
  'feComposite',
  'feMerge',
  'feMergeNode',
  'feBlend',
  'feColorMatrix',
  'feComponentTransfer',
  'feFuncR',
  'feFuncG',
  'feFuncB',
  'feFuncA',
  'feDisplacementMap',
  'feTurbulence',
  'feMorphology',
  'feConvolveMatrix',
  'feDiffuseLighting',
  'feSpecularLighting',
  'feDistantLight',
  'fePointLight',
  'feSpotLight',
  'feImage',
  'feTile',
  'feDropShadow',
  'feMergeNodeSource',
]);

const NUMERIC_ATTRIBUTES = new Set([
  'x',
  'y',
  'baseX',
  'baseY',
  'width',
  'height',
  'rx',
  'ry',
  'rotation',
  'scaleX',
  'scaleY',
  'opacity',
  'fillOpacity',
  'strokeWidth',
  'fontSize',
  'letterSpacing',
  'x1',
  'y1',
  'x2',
  'y2',
]);

const STRING_TRACK_PROPERTIES = new Set([
  'fill',
  'stroke',
  'd',
  'text',
  'strokeDasharray',
  'points',
  'filter',
]);

function collectDefinedIds(fragment: TraceAssetFragment): Set<string> {
  const ids = new Set<string>();
  for (const id of Object.keys(fragment.gradients ?? {})) ids.add(id);
  for (const id of Object.keys(fragment.filters ?? {})) ids.add(id);
  if (fragment.defs) {
    const re = /\bid=(["'])([^"']+)\1/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(fragment.defs)) !== null) {
      if (match[2]) ids.add(match[2]);
    }
  }
  return ids;
}

function collectPaintRefs(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  const refs: string[] = [];
  const re = /url\(\s*#([^)\s]+)\s*\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(value)) !== null) {
    if (match[1]) refs.push(match[1]);
  }
  return refs;
}

function requiredString(
  element: TraceElement,
  attribute: string,
): string | null {
  const value = element.attributes?.[attribute];
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function pushRequiredAttribute(
  diagnostics: FragmentDiagnostic[],
  element: TraceElement,
  attribute: string,
  label: string,
): void {
  if (requiredString(element, attribute)) return;
  diagnostics.push({
    code: 'FRAGMENT_MISSING_ATTRIBUTE',
    severity: 'error',
    message: `${label} element "${element.name}" needs a non-empty ${attribute}.`,
    elementId: element.id,
  });
}

function reachableIds(fragment: TraceAssetFragment): Set<string> {
  const reachable = new Set<string>();
  const visit = (id: string) => {
    if (reachable.has(id)) return;
    const element = fragment.elements[id];
    if (!element) return;
    reachable.add(id);
    for (const childId of element.childrenIds ?? []) visit(childId);
  };
  for (const rootId of fragment.rootElementIds) visit(rootId);
  return reachable;
}

function validateGradient(
  id: string,
  gradient: TraceGradient,
  diagnostics: FragmentDiagnostic[],
): void {
  if (gradient.id !== id) {
    diagnostics.push({
      code: 'FRAGMENT_GRADIENT_INVALID',
      severity: 'error',
      message: `Gradient key "${id}" does not match its id "${gradient.id}".`,
    });
  }
  if (gradient.type !== 'linear' && gradient.type !== 'radial') {
    diagnostics.push({
      code: 'FRAGMENT_GRADIENT_INVALID',
      severity: 'error',
      message: `Gradient "${id}" has unknown type "${gradient.type}".`,
    });
  }
  if (!Array.isArray(gradient.stops) || gradient.stops.length < 2) {
    diagnostics.push({
      code: 'FRAGMENT_GRADIENT_INVALID',
      severity: 'error',
      message: `Gradient "${id}" needs at least two stops.`,
    });
    return;
  }
  for (const stop of gradient.stops) {
    if (
      !Number.isFinite(stop.offset) ||
      stop.offset < 0 ||
      stop.offset > 1
    ) {
      diagnostics.push({
        code: 'FRAGMENT_GRADIENT_INVALID',
        severity: 'error',
        message: `Gradient "${id}" has a stop offset outside 0–1.`,
      });
    }
    if (typeof stop.color !== 'string' || !stop.color.trim()) {
      diagnostics.push({
        code: 'FRAGMENT_GRADIENT_INVALID',
        severity: 'error',
        message: `Gradient "${id}" has a stop without a colour.`,
      });
    }
    if (
      !Number.isFinite(stop.opacity) ||
      stop.opacity < 0 ||
      stop.opacity > 1
    ) {
      diagnostics.push({
        code: 'FRAGMENT_GRADIENT_INVALID',
        severity: 'error',
        message: `Gradient "${id}" has a stop opacity outside 0–1.`,
      });
    }
  }
}

function validateFilter(
  id: string,
  filter: TraceFilter,
  diagnostics: FragmentDiagnostic[],
): void {
  if (filter.id !== id) {
    diagnostics.push({
      code: 'FRAGMENT_FILTER_INVALID',
      severity: 'error',
      message: `Filter key "${id}" does not match its id "${filter.id}".`,
    });
  }
  if (!Array.isArray(filter.primitives) || filter.primitives.length === 0) {
    diagnostics.push({
      code: 'FRAGMENT_FILTER_INVALID',
      severity: 'error',
      message: `Filter "${id}" needs at least one primitive.`,
    });
    return;
  }
  const results = new Set<string>();
  for (const primitive of filter.primitives) {
    if (!FILTER_PRIMITIVES.has(primitive.kind)) {
      diagnostics.push({
        code: 'FRAGMENT_FILTER_INVALID',
        severity: 'error',
        message: `Filter "${id}" uses unknown primitive "${primitive.kind}".`,
      });
    }
    for (const reference of [primitive.in, primitive.in2]) {
      if (
        reference &&
        reference !== 'SourceGraphic' &&
        reference !== 'SourceAlpha' &&
        reference !== 'BackgroundImage' &&
        reference !== 'BackgroundAlpha' &&
        reference !== 'FillPaint' &&
        reference !== 'StrokePaint' &&
        !results.has(reference)
      ) {
        diagnostics.push({
          code: 'FRAGMENT_FILTER_INVALID',
          severity: 'warning',
          message: `Filter "${id}" references "${reference}" before it is produced.`,
        });
      }
    }
    if (primitive.result) results.add(primitive.result);
  }
}

/**
 * Validate a fragment before insertion.
 *
 * `ok` is true only when there are zero errors; warnings describe taste or
 * losses that do not prevent insertion.
 */
export function validateTraceFragment(
  fragment: TraceAssetFragment,
  options: FragmentValidationOptions = {},
): FragmentValidationResult {
  const limits = {
    maxElements:
      options.maxElements ?? DEFAULT_FRAGMENT_LIMITS.maxElements,
    maxTracks: options.maxTracks ?? DEFAULT_FRAGMENT_LIMITS.maxTracks,
    maxKeyframesPerTrack:
      options.maxKeyframesPerTrack ??
      DEFAULT_FRAGMENT_LIMITS.maxKeyframesPerTrack,
    maxDefsLength:
      options.maxDefsLength ?? DEFAULT_FRAGMENT_LIMITS.maxDefsLength,
  };

  const diagnostics: FragmentDiagnostic[] = [];
  const elements = fragment.elements ?? {};
  const elementIds = new Set(Object.keys(elements));

  let trackCount = 0;
  let keyframeCount = 0;

  // ── Identity, types and per-type attributes ───────────────────────────────
  for (const [key, element] of Object.entries(elements)) {
    if (!element || typeof element !== 'object') {
      diagnostics.push({
        code: 'FRAGMENT_INVALID_ATTRIBUTE',
        severity: 'error',
        message: `Element "${key}" is not an object.`,
      });
      continue;
    }
    if (element.id !== key) {
      diagnostics.push({
        code: 'FRAGMENT_ELEMENT_ID_MISMATCH',
        severity: 'error',
        message: `Element map key "${key}" does not match element id "${element.id}".`,
        elementId: key,
      });
    }
    if (!ELEMENT_TYPES.has(element.type)) {
      diagnostics.push({
        code: 'FRAGMENT_UNKNOWN_ELEMENT_TYPE',
        severity: 'error',
        message: `Element "${element.name}" has unsupported type "${element.type}".`,
        elementId: key,
      });
      continue;
    }
    if (!element.attributes || typeof element.attributes !== 'object') {
      diagnostics.push({
        code: 'FRAGMENT_INVALID_ATTRIBUTE',
        severity: 'error',
        message: `Element "${element.name}" has no attribute map.`,
        elementId: key,
      });
      continue;
    }

    for (const [attribute, value] of Object.entries(element.attributes)) {
      if (!NUMERIC_ATTRIBUTES.has(attribute) || value === undefined || value === null) {
        continue;
      }
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        diagnostics.push({
          code: 'FRAGMENT_INVALID_ATTRIBUTE',
          severity: 'error',
          message: `Element "${element.name}" has a non-finite ${attribute}.`,
          elementId: key,
        });
      }
    }

    const opacity = Number(element.attributes.opacity ?? 1);
    if (Number.isFinite(opacity) && (opacity < 0 || opacity > 1)) {
      diagnostics.push({
        code: 'FRAGMENT_INVALID_ATTRIBUTE',
        severity: 'error',
        message: `Element "${element.name}" has opacity outside 0–1.`,
        elementId: key,
      });
    }
    const fillOpacity = Number(element.attributes.fillOpacity ?? 1);
    if (Number.isFinite(fillOpacity) && (fillOpacity < 0 || fillOpacity > 1)) {
      diagnostics.push({
        code: 'FRAGMENT_INVALID_ATTRIBUTE',
        severity: 'error',
        message: `Element "${element.name}" has fillOpacity outside 0–1.`,
        elementId: key,
      });
    }

    switch (element.type) {
      case 'path':
        pushRequiredAttribute(diagnostics, element, 'd', 'Path');
        break;
      case 'rect':
        if (Number(element.attributes.width ?? 0) < 0) {
          diagnostics.push({
            code: 'FRAGMENT_INVALID_ATTRIBUTE',
            severity: 'error',
            message: `Rect "${element.name}" has a negative width.`,
            elementId: key,
          });
        }
        if (Number(element.attributes.height ?? 0) < 0) {
          diagnostics.push({
            code: 'FRAGMENT_INVALID_ATTRIBUTE',
            severity: 'error',
            message: `Rect "${element.name}" has a negative height.`,
            elementId: key,
          });
        }
        break;
      case 'circle':
      case 'ellipse':
        if (Number(element.attributes.width ?? 0) <= 0) {
          diagnostics.push({
            code: 'FRAGMENT_MISSING_ATTRIBUTE',
            severity: 'error',
            message: `${element.type} "${element.name}" needs a positive width (diameter).`,
            elementId: key,
          });
        }
        if (Number(element.attributes.height ?? 0) <= 0) {
          diagnostics.push({
            code: 'FRAGMENT_MISSING_ATTRIBUTE',
            severity: 'error',
            message: `${element.type} "${element.name}" needs a positive height (diameter).`,
            elementId: key,
          });
        }
        break;
      case 'line':
        for (const attribute of ['x1', 'y1', 'x2', 'y2']) {
          if (
            element.attributes[attribute] !== undefined &&
            !Number.isFinite(Number(element.attributes[attribute]))
          ) {
            diagnostics.push({
              code: 'FRAGMENT_INVALID_ATTRIBUTE',
              severity: 'error',
              message: `Line "${element.name}" has an invalid ${attribute}.`,
              elementId: key,
            });
          }
        }
        break;
      case 'text':
        pushRequiredAttribute(diagnostics, element, 'text', 'Text');
        if (Number(element.attributes.fontSize ?? 24) <= 0) {
          diagnostics.push({
            code: 'FRAGMENT_INVALID_ATTRIBUTE',
            severity: 'error',
            message: `Text "${element.name}" needs a positive fontSize.`,
            elementId: key,
          });
        }
        break;
      case 'image':
        if (!requiredString(element, 'href') && !requiredString(element, 'src')) {
          diagnostics.push({
            code: 'FRAGMENT_MISSING_ATTRIBUTE',
            severity: 'error',
            message: `Image "${element.name}" needs an href.`,
            elementId: key,
          });
        }
        break;
      case 'use':
        pushRequiredAttribute(diagnostics, element, 'href', 'Use');
        break;
      case 'group':
        if ((element.childrenIds ?? []).length === 0) {
          diagnostics.push({
            code: 'FRAGMENT_MISSING_ATTRIBUTE',
            severity: 'warning',
            message: `Group "${element.name}" has no children.`,
            elementId: key,
          });
        }
        break;
      default:
        break;
    }

    for (const track of element.tracks ?? []) {
      trackCount += 1;
      keyframeCount += track.keyframes?.length ?? 0;
      if ((track.keyframes?.length ?? 0) > limits.maxKeyframesPerTrack) {
        diagnostics.push({
          code: 'FRAGMENT_BUDGET_EXCEEDED',
          severity: 'error',
          message: `Track "${track.label || track.property}" on "${element.name}" has more than ${limits.maxKeyframesPerTrack} keyframes.`,
          elementId: key,
          trackId: track.id,
        });
      }
      for (const keyframe of track.keyframes ?? []) {
        if (
          STRING_TRACK_PROPERTIES.has(track.property) &&
          typeof keyframe.value !== 'string'
        ) {
          diagnostics.push({
            code: 'FRAGMENT_TRACK_INVALID',
            severity: 'error',
            message: `Track "${track.label || track.property}" on "${element.name}" expects string keyframes.`,
            elementId: key,
            trackId: track.id,
          });
        }
        if (
          !STRING_TRACK_PROPERTIES.has(track.property) &&
          (typeof keyframe.value !== 'number' ||
            !Number.isFinite(keyframe.value))
        ) {
          diagnostics.push({
            code: 'FRAGMENT_TRACK_INVALID',
            severity: 'error',
            message: `Track "${track.label || track.property}" on "${element.name}" expects finite numeric keyframes.`,
            elementId: key,
            trackId: track.id,
          });
        }
      }
    }
  }

  // ── Reachability ──────────────────────────────────────────────────────────
  const reachable = reachableIds(fragment);
  for (const elementId of elementIds) {
    if (reachable.has(elementId)) continue;
    diagnostics.push({
      code: 'FRAGMENT_ORPHAN_ELEMENT',
      severity: 'warning',
      message: `Element "${elements[elementId]?.name ?? elementId}" is not reachable from any root and will not render.`,
      elementId,
    });
  }

  // ── Structured resources ──────────────────────────────────────────────────
  for (const [id, gradient] of Object.entries(fragment.gradients ?? {})) {
    validateGradient(id, gradient, diagnostics);
  }
  for (const [id, filter] of Object.entries(fragment.filters ?? {})) {
    validateFilter(id, filter, diagnostics);
  }

  const resolvedIds = collectDefinedIds(fragment);
  for (const [elementId, element] of Object.entries(elements)) {
    for (const attribute of ['fill', 'stroke', 'filter', 'clip-path', 'mask']) {
      for (const reference of collectPaintRefs(element.attributes?.[attribute])) {
        if (!resolvedIds.has(reference)) {
          diagnostics.push({
            code: 'FRAGMENT_PAINT_UNRESOLVED',
            severity: 'error',
            message: `Element "${element.name}" references missing paint "${reference}".`,
            elementId,
          });
        }
      }
    }
  }

  // ── Defs safety and size ──────────────────────────────────────────────────
  const defsLength = fragment.defs?.length ?? 0;
  if (defsLength > limits.maxDefsLength) {
    diagnostics.push({
      code: 'FRAGMENT_DEFS_TOO_LARGE',
      severity: 'error',
      message: `Defs markup is ${defsLength} bytes, above the ${limits.maxDefsLength}-byte limit.`,
    });
  }
  if (
    fragment.defs &&
    /\<script\b|\son[a-z]+\s*=|javascript\s*:/i.test(fragment.defs)
  ) {
    diagnostics.push({
      code: 'FRAGMENT_DEFS_UNSAFE',
      severity: 'error',
      message: 'Defs markup contains active content (script, event handler or javascript: URL).',
    });
  }

  // ── Budgets ───────────────────────────────────────────────────────────────
  if (elementIds.size > limits.maxElements) {
    diagnostics.push({
      code: 'FRAGMENT_BUDGET_EXCEEDED',
      severity: 'error',
      message: `Fragment has ${elementIds.size} elements, above the ${limits.maxElements} limit.`,
    });
  }
  if (trackCount > limits.maxTracks) {
    diagnostics.push({
      code: 'FRAGMENT_BUDGET_EXCEEDED',
      severity: 'error',
      message: `Fragment has ${trackCount} tracks, above the ${limits.maxTracks} limit.`,
    });
  }

  // ── Reuse the project linter for graph and track invariants ───────────────
  const durationMs = Math.max(1, Math.round(options.durationMs ?? 4000));
  const project = toTraceProject(fragment, 'Fragment Validation', durationMs);
  const lint = lintTraceProject(project, { loop: true });
  for (const entry of lint.diagnostics) {
    // Paint references are checked above with fragment-specific diagnostics.
    if (entry.code === 'DEF_REF_MISSING') continue;
    if (entry.severity === 'error') {
      diagnostics.push({
        code:
          entry.code.startsWith('TRACK') || entry.code.startsWith('KEYFRAME')
            ? 'FRAGMENT_TRACK_INVALID'
            : 'FRAGMENT_INVALID_ATTRIBUTE',
        severity: 'error',
        message: entry.message,
        elementId: entry.elementId,
      });
    } else if (
      entry.code === 'ORPHAN_ELEMENT' ||
      entry.code === 'ELEMENT_ROOT_MISSING' ||
      entry.code === 'ELEMENT_CHILD_MISSING' ||
      entry.code === 'CYCLE_DETECTED'
    ) {
      // Graph integrity is never merely stylistic.
      diagnostics.push({
        code: 'FRAGMENT_INVALID_ATTRIBUTE',
        severity: 'error',
        message: entry.message,
        elementId: entry.elementId,
      });
    }
  }

  const errors = diagnostics.filter((entry) => entry.severity === 'error');
  const warnings = diagnostics.filter((entry) => entry.severity === 'warning');
  return {
    ok: errors.length === 0,
    diagnostics,
    errors,
    warnings,
    stats: {
      elements: elementIds.size,
      tracks: trackCount,
      keyframes: keyframeCount,
      gradients: Object.keys(fragment.gradients ?? {}).length,
      filters: Object.keys(fragment.filters ?? {}).length,
      defsLength,
    },
  };
}

/** Validate and throw a compact, actionable error when the fragment is invalid. */
export function assertValidTraceFragment(
  fragment: TraceAssetFragment,
  options: FragmentValidationOptions = {},
): FragmentValidationResult {
  const result = validateTraceFragment(fragment, options);
  if (!result.ok) {
    const summary = result.errors
      .slice(0, 8)
      .map((entry) => entry.message)
      .join('; ');
    throw new Error(
      `Trace fragment failed validation: ${summary}${result.errors.length > 8 ? ` (+${result.errors.length - 8} more)` : ''}`,
    );
  }
  return result;
}