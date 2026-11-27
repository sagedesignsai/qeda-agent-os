/**
 * lib/trace/addons/surfaces/generation.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The generative Surfaces contract.
 *
 * A surface specialist does not draw with a canvas painter: it emits SVG plus
 * an editable animation plan. This module parses that SVG with the real
 * importer, bakes transforms, attaches tracks through the ops engine, validates
 * the resulting fragment and produces a ready-to-insert proposal. Every failure
 * is a precise, model-readable diagnostic so the specialist can repair and
 * retry instead of guessing.
 */

import type { TraceAssetFragment } from '../../assets/types';
import type { SvgAnimationProperty } from '../../animation-plan';
import type { TraceProject, TraceStyle, TraceElement } from '../../types';
import type { TraceOp } from '../../ops/types';
import { applyOps } from '../../ops';
import { validateTraceFragment } from '../../assets/validate';
import { lintTraceProject } from '../../lint';
import { staticSvgMarkup } from '../../serialize/svg-markup';
import {
  parseSvgToFragmentDetailed,
  type SvgImportOptions,
  type SvgImportReport,
} from '../../parser/svg-importer';

export const SURFACE_GENERATION_LIMITS = {
  maxElements: 500,
  maxTracks: 24,
  maxKeyframesPerTrack: 12,
  maxSvgBytes: 300_000,
} as const;

export interface SurfacePalette {
  base?: string;
  deep?: string;
  accent?: string;
  secondary?: string;
}

export interface SurfaceGenerationRequest {
  width: number;
  height: number;
  durationMs: number;
  fps: number;
  /** The user's brief, in their words. */
  prompt: string;
  /** Owning project, used for durable chat sessions. */
  projectId?: string;
  /** 0–100; how energetic the motion may be. */
  intensity?: number;
  /** Keep the first and last keyframe values identical. Defaults to true. */
  loop?: boolean;
  /** Project look tokens, used as authoring defaults. */
  style?: TraceStyle;
  /** Optional palette override from the UI or the brief. */
  palette?: SurfacePalette;
  projectName?: string;
}

export interface SurfaceTrackCandidate {
  elementId: string;
  property: SvgAnimationProperty;
  keyframes: Array<{
    timeMs: number;
    value: number | string;
    easing?: string;
  }>;
}

export interface SurfaceProposalCandidate {
  summary: string;
  svg: string;
  tracks?: SurfaceTrackCandidate[];
  warnings?: string[];
}

export interface SurfaceGenerationProposal {
  summary: string;
  width: number;
  height: number;
  durationMs: number;
  /** Whether continuous tracks were authored to loop seamlessly. */
  loop: boolean;
  fragment: TraceAssetFragment;
  tracks: SurfaceTrackCandidate[];
  report: SvgImportReport;
  warnings: string[];
  previewSvg: string;
  previewTimeMs: number;
  visualReview?: { performed: boolean; notes: string };
}

const ANIMATABLE_PROPERTIES: ReadonlySet<SvgAnimationProperty> = new Set([
  'x',
  'y',
  'scaleX',
  'scaleY',
  'rotation',
  'opacity',
  'fillOpacity',
  'fill',
  'stroke',
  'strokeWidth',
  'strokeDashoffset',
  'strokeDasharray',
  'd',
  'width',
  'height',
  'rx',
]);

const STRING_PROPERTIES: ReadonlySet<SvgAnimationProperty> = new Set([
  'fill',
  'stroke',
  'd',
  'strokeDasharray',
]);

const LOOPING_PROPERTIES: ReadonlySet<SvgAnimationProperty> = new Set([
  'x',
  'y',
  'scaleX',
  'scaleY',
  'rotation',
  'opacity',
  'fillOpacity',
  'stroke',
  'fill',
  'strokeWidth',
]);

const FATAL_DROPPED_TAGS = new Set([
  'animate',
  'animatetransform',
  'animatemotion',
  'animatecolor',
  'set',
  'image',
  'foreignobject',
]);

/** Presentation attributes whose loss would silently change the artwork. */
const FATAL_DROPPED_ATTRIBUTES = new Set([
  'clip-path',
  'mask',
  'marker-start',
  'marker-mid',
  'marker-end',
  'vector-effect',
  'paint-order',
  'mix-blend-mode',
  'isolation',
]);

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Models often wrap SVG in a markdown fence or leave a bare `&` in copy. Both
 * are fatal to an XML parser but cheap to repair before validation.
 */
function normalizeGeneratedSvg(raw: string): string {
  let svg = raw.trim();
  const fenced = /```(?:svg|xml|html)?\s*([\s\S]*?)```/i.exec(svg);
  if (fenced?.[1]) svg = fenced[1].trim();
  const start = svg.indexOf('<svg');
  const end = svg.lastIndexOf('</svg>');
  if (start >= 0 && end > start) {
    svg = svg.slice(start, end + '</svg>'.length);
  }
  // Escape bare ampersands while leaving entities and numeric references.
  svg = svg.replace(
    /&(?!(?:[a-zA-Z][a-zA-Z0-9]*|#\d+|#x[0-9a-fA-F]+);)/g,
    '&amp;',
  );
  return svg.trim();
}

/**
 * A loop is visually seamless when the value returns to its start. Rotation is
 * modulo 360, so a full turn (0 → 360) is also seamless.
 */
function trackLoopsSeamlessly(
  property: SvgAnimationProperty,
  first: number | string,
  last: number | string,
): boolean {
  if (
    property === 'rotation' &&
    typeof first === 'number' &&
    typeof last === 'number'
  ) {
    const delta = Math.abs(last - first) % 360;
    return delta < 1e-6 || Math.abs(delta - 360) < 1e-6;
  }
  return first === last;
}

function normalizeTracks(
  tracks: SurfaceTrackCandidate[] | undefined,
  fragment: TraceAssetFragment,
  durationMs: number,
  loop: boolean,
): { tracks: SurfaceTrackCandidate[]; warnings: string[] } {
  if (!tracks?.length) return { tracks: [], warnings: [] };
  if (tracks.length > SURFACE_GENERATION_LIMITS.maxTracks) {
    throw new Error(
      `A generated surface may stage at most ${SURFACE_GENERATION_LIMITS.maxTracks} tracks; received ${tracks.length}.`,
    );
  }

  const elementIds = Object.keys(fragment.elements);
  const available = elementIds.slice(0, 40).join(', ');
  const seen = new Set<string>();
  const warnings: string[] = [];
  const normalized: SurfaceTrackCandidate[] = [];

  const noteRepair = (message: string) => {
    if (!warnings.includes(message)) warnings.push(message);
  };

  for (const track of tracks) {
    if (!ANIMATABLE_PROPERTIES.has(track.property)) {
      throw new Error(
        `Track property "${track.property}" is not animatable. Use one of: ${[...ANIMATABLE_PROPERTIES].join(', ')}.`,
      );
    }
    const element = fragment.elements[track.elementId];
    if (!element) {
      throw new Error(
        `Track "${track.property}" targets unknown SVG element id "${track.elementId}". Layer ids available after import: ${available}. Give the animated layer that exact id in the SVG.`,
      );
    }
    const key = `${track.elementId}:${track.property}`;
    if (seen.has(key)) {
      throw new Error(
        `Duplicate track for "${track.elementId}" / "${track.property}". Each property may have one track.`,
      );
    }
    seen.add(key);

    if (!Array.isArray(track.keyframes) || track.keyframes.length === 0) {
      throw new Error(
        `Track "${track.property}" on "${track.elementId}" needs at least one keyframe.`,
      );
    }
    if (track.keyframes.length > SURFACE_GENERATION_LIMITS.maxKeyframesPerTrack) {
      throw new Error(
        `Track "${track.property}" on "${track.elementId}" exceeds ${SURFACE_GENERATION_LIMITS.maxKeyframesPerTrack} keyframes.`,
      );
    }

    const stringProperty = STRING_PROPERTIES.has(track.property);
    type NormalizedKeyframe = {
      timeMs: number;
      value: number | string;
      easing: string;
    };
    const repaired: NormalizedKeyframe[] = [];

    const sorted = [...track.keyframes].sort((a, b) => a.timeMs - b.timeMs);
    for (const keyframe of sorted) {
      if (!Number.isFinite(keyframe.timeMs)) {
        throw new Error(
          `Track "${track.property}" on "${track.elementId}" has a non-finite keyframe time.`,
        );
      }
      let timeMs = Math.round(
        clamp(keyframe.timeMs, 0, durationMs),
      );
      if (timeMs !== Math.round(keyframe.timeMs)) {
        noteRepair(
          `Clamped a "${track.property}" keyframe on "${track.elementId}" into 0–${durationMs} ms.`,
        );
      }

      let value: number | string;
      if (stringProperty) {
        if (
          typeof keyframe.value !== 'string' &&
          typeof keyframe.value !== 'number' &&
          typeof keyframe.value !== 'boolean'
        ) {
          throw new Error(
            `Track "${track.property}" on "${track.elementId}" requires string keyframe values.`,
          );
        }
        value = String(keyframe.value);
      } else {
        const numeric =
          typeof keyframe.value === 'number'
            ? keyframe.value
            : typeof keyframe.value === 'string' && keyframe.value.trim() !== ''
              ? Number(keyframe.value)
              : Number.NaN;
        if (!Number.isFinite(numeric)) {
          throw new Error(
            `Track "${track.property}" on "${track.elementId}" requires finite numeric keyframe values.`,
          );
        }
        value = numeric;
      }

      if (
        (track.property === 'opacity' || track.property === 'fillOpacity') &&
        typeof value === 'number' &&
        (value < 0 || value > 1)
      ) {
        value = clamp(value, 0, 1);
        noteRepair(
          `Clamped "${track.property}" on "${track.elementId}" into 0–1.`,
        );
      }
      if (
        (track.property === 'scaleX' || track.property === 'scaleY') &&
        typeof value === 'number' &&
        (value < 0.05 || value > 6)
      ) {
        value = clamp(value, 0.05, 6);
        noteRepair(
          `Clamped scale on "${track.elementId}" into 0.05–6.`,
        );
      }
      if (
        track.property === 'rotation' &&
        typeof value === 'number' &&
        Math.abs(value) > 720
      ) {
        value = clamp(value, -720, 720);
        noteRepair(`Clamped rotation on "${track.elementId}" into ±720°.`);
      }

      // Keep the later of two keyframes that land on the same millisecond.
      const previous = repaired[repaired.length - 1];
      if (previous && Math.abs(previous.timeMs - timeMs) < 1) {
        previous.value = value;
        previous.easing = keyframe.easing || previous.easing;
        noteRepair(
          `Merged duplicate "${track.property}" keyframes on "${track.elementId}".`,
        );
        continue;
      }
      repaired.push({
        timeMs,
        value,
        easing: keyframe.easing || 'ease-in-out',
      });
    }

    if (repaired.length === 0) {
      throw new Error(
        `Track "${track.property}" on "${track.elementId}" has no usable keyframes.`,
      );
    }
    if (repaired.length === 1) {
      const only = repaired[0];
      if (only.timeMs > 0) {
        repaired.unshift({ ...only, timeMs: 0 });
      } else if (only.timeMs < durationMs) {
        repaired.push({ ...only, timeMs: durationMs });
      }
      noteRepair(
        `Expanded a single-keyframe "${track.property}" track on "${track.elementId}" into a hold.`,
      );
    }

    if (track.property === 'd' && element.type !== 'path') {
      throw new Error(
        `The d property can only animate path elements; "${track.elementId}" is a ${element.type}.`,
      );
    }
    if (
      (track.property === 'strokeDasharray' ||
        track.property === 'strokeDashoffset') &&
      (typeof element.attributes.stroke !== 'string' ||
        element.attributes.stroke.trim() === '' ||
        element.attributes.stroke === 'none')
    ) {
      throw new Error(
        `"${track.elementId}" has no stroke, so ${track.property} cannot be animated. Add a stroke or animate fill/opacity instead.`,
      );
    }

    const first = repaired[0];
    const last = repaired[repaired.length - 1];
    if (
      loop &&
      LOOPING_PROPERTIES.has(track.property) &&
      !trackLoopsSeamlessly(track.property, first.value, last.value)
    ) {
      // Repair rather than fail: the specialist's intent is ambient motion, and
      // a generated one-way drift is almost always a forgotten loop endpoint.
      if (last.timeMs >= durationMs - 1) {
        last.value = first.value;
      } else if (
        repaired.length < SURFACE_GENERATION_LIMITS.maxKeyframesPerTrack
      ) {
        repaired.push({
          timeMs: durationMs,
          value: first.value,
          easing: 'ease-in-out',
        });
      } else {
        last.timeMs = durationMs;
        last.value = first.value;
      }
      noteRepair(
        `Closed looping track "${track.property}" on "${track.elementId}" back to its start value.`,
      );
    }

    normalized.push({
      elementId: track.elementId,
      property: track.property,
      keyframes: repaired,
    });
  }

  return { tracks: normalized, warnings };
}

/**
 * Fit a wrongly sized generated SVG to the target canvas. Models frequently
 * emit a 1920×1080 viewBox for a 1280×720 project; rejecting the proposal for
 * that wastes a whole turn. A wrapper group scales and centres the artwork,
 * and the repair is surfaced as a warning.
 */
function fitFragmentToCanvas(
  fragment: TraceAssetFragment,
  width: number,
  height: number,
  report: SvgImportReport,
): TraceAssetFragment {
  const sourceWidth = Math.max(1, fragment.width);
  const sourceHeight = Math.max(1, fragment.height);
  if (
    Math.abs(sourceWidth - width) <= 1 &&
    Math.abs(sourceHeight - height) <= 1
  ) {
    return fragment;
  }

  // Cover the target canvas. The wrapper is a normal Trace group, so the
  // artwork remains editable and exports through the same transform path.
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const offsetX = (width - sourceWidth * scale) / 2;
  const offsetY = (height - sourceHeight * scale) / 2;
  let wrapperId = 'surface-fit-root';
  let attempt = 1;
  while (fragment.elements[wrapperId]) {
    attempt += 1;
    wrapperId = `surface-fit-root-${attempt}`;
  }
  const roots = [...fragment.rootElementIds];
  const wrapper: TraceElement = {
    id: wrapperId,
    name: 'Scaled artwork',
    type: 'group',
    visible: true,
    locked: false,
    attributes: {
      x: Number(offsetX.toFixed(2)),
      y: Number(offsetY.toFixed(2)),
      width: Number((sourceWidth * scale).toFixed(2)),
      height: Number((sourceHeight * scale).toFixed(2)),
      scaleX: Number(scale.toFixed(4)),
      scaleY: Number(scale.toFixed(4)),
    },
    origin: { x: 0, y: 0 },
    tracks: [],
    parentId: null,
    childrenIds: roots,
  };
  for (const rootId of roots) {
    const root = fragment.elements[rootId];
    if (root) root.parentId = wrapperId;
  }
  fragment.elements[wrapperId] = wrapper;
  fragment.rootElementIds = [wrapperId];
  fragment.width = width;
  fragment.height = height;
  report.width = width;
  report.height = height;
  report.warnings.push(
    `Scaled the ${sourceWidth}×${sourceHeight} SVG to cover the ${width}×${height} canvas.`,
  );
  return fragment;
}

/**
 * Validate and compile a specialist proposal into an insertable fragment.
 * Throws with an actionable message on the first violation.
 */
export function compileSurfaceProposal(
  request: SurfaceGenerationRequest,
  candidate: SurfaceProposalCandidate,
  options: SvgImportOptions = {},
): SurfaceGenerationProposal {
  if (!candidate.svg || candidate.svg.length < 40) {
    throw new Error('The proposal did not include usable SVG artwork.');
  }
  const svg = normalizeGeneratedSvg(candidate.svg);
  if (svg.length > SURFACE_GENERATION_LIMITS.maxSvgBytes) {
    throw new Error(
      `The SVG is ${svg.length} bytes; the limit is ${SURFACE_GENERATION_LIMITS.maxSvgBytes}. Reduce detail or reuse gradients.`,
    );
  }

  const width = Math.max(16, Math.round(request.width));
  const height = Math.max(16, Math.round(request.height));
  const durationMs = Math.max(1, Math.round(request.durationMs));
  const loop = request.loop !== false;

  const { fragment, report } = parseSvgToFragmentDetailed(svg, options);
  fitFragmentToCanvas(fragment, width, height, report);

  const fatalTags = Object.keys(report.droppedTags).filter((tag) =>
    FATAL_DROPPED_TAGS.has(tag),
  );
  if (fatalTags.length > 0) {
    throw new Error(
      `Unsupported SVG elements would be lost: ${fatalTags.join(', ')}. Emit static vector artwork and put all motion in the tracks array; do not use SMIL, raster images or foreignObject.`,
    );
  }
  const fatalAttributes = Object.keys(report.droppedAttributes).filter((attribute) =>
    FATAL_DROPPED_ATTRIBUTES.has(attribute),
  );
  if (fatalAttributes.length > 0) {
    throw new Error(
      `Presentation attributes would be lost: ${fatalAttributes.join(', ')}. Do not use clip-path, mask or markers; build the visible shape directly.`,
    );
  }
  if (
    report.warnings.some((warning) =>
      warning.includes('CSS class or id selectors are not applied'),
    )
  ) {
    throw new Error(
      'The SVG relies on CSS class/id selectors, which do not survive import. Use presentation attributes or inline style on each element.',
    );
  }
  if (
    report.warnings.some((warning) =>
      warning.includes('CSS animation is not imported'),
    )
  ) {
    throw new Error(
      'The SVG relies on CSS animation, which is not imported. Emit static artwork and describe motion in the tracks array.',
    );
  }

  const { tracks, warnings: trackWarnings } = normalizeTracks(
    candidate.tracks,
    fragment,
    durationMs,
    loop,
  );

  // Attach tracks through the real ops engine so the compiled proposal uses
  // exactly the same keyframe normalisation the editor does.
  const streamProject: TraceProject = {
    id: 'surface-proposal',
    name: request.projectName ? `${request.projectName} surface` : 'Surface proposal',
    width,
    height,
    durationMs,
    fps: Math.max(1, Math.round(request.fps || 60)),
    elements: fragment.elements,
    rootElementIds: fragment.rootElementIds,
    ...(fragment.defs ? { defs: fragment.defs } : {}),
    ...(fragment.gradients ? { gradients: fragment.gradients } : {}),
    ...(fragment.filters ? { filters: fragment.filters } : {}),
  };

  const ops: TraceOp[] = tracks.map((track) => ({
    type: 'setTrack',
    elementId: track.elementId,
    property: track.property,
    label: `${track.property} · Surface`,
    keyframes: track.keyframes.map((keyframe) => ({
      timeMs: keyframe.timeMs,
      value: keyframe.value,
      easing: keyframe.easing || 'ease-in-out',
    })),
  }));
  const applied = applyOps(streamProject, ops);
  if (!applied.ok) {
    throw new Error(
      applied.diagnostics
        .filter((entry) => entry.severity === 'error')
        .map((entry) => entry.message)
        .join('; ') || 'The proposed tracks could not be applied.',
    );
  }

  const compiledFragment: TraceAssetFragment = {
    width,
    height,
    elements: applied.project.elements,
    rootElementIds: applied.project.rootElementIds,
    ...(applied.project.defs ? { defs: applied.project.defs } : {}),
    ...(applied.project.gradients ? { gradients: applied.project.gradients } : {}),
    ...(applied.project.filters ? { filters: applied.project.filters } : {}),
  };

  const validation = validateTraceFragment(compiledFragment, {
    durationMs,
    maxElements: SURFACE_GENERATION_LIMITS.maxElements,
    maxTracks: SURFACE_GENERATION_LIMITS.maxTracks,
    maxKeyframesPerTrack: SURFACE_GENERATION_LIMITS.maxKeyframesPerTrack,
    maxDefsLength: 200_000,
  });
  if (!validation.ok) {
    throw new Error(
      `The surface failed compatibility validation: ${validation.errors
        .slice(0, 6)
        .map((entry) => entry.message)
        .join('; ')}`,
    );
  }

  const lint = lintTraceProject(applied.project);
  if (!lint.ok) {
    throw new Error(
      `The surface failed lint: ${lint.diagnostics
        .filter((entry) => entry.severity === 'error')
        .slice(0, 6)
        .map((entry) => entry.message)
        .join('; ')}`,
    );
  }

  const warnings = [
    ...(candidate.warnings ?? []),
    ...trackWarnings,
    ...report.warnings,
    ...validation.warnings.map((entry) => entry.message),
  ];
  const uniqueWarnings = [...new Set(warnings)].slice(0, 12);

  const previewTimeMs = Math.round(durationMs * 0.55);
  const previewSvg = staticSvgMarkup(applied.project, previewTimeMs, {
    size: true,
    scenePresentation: false,
    camera: false,
  });

  return {
    summary: candidate.summary.trim().slice(0, 180) || 'Generated surface',
    width,
    height,
    durationMs,
    loop,
    fragment: compiledFragment,
    tracks,
    report,
    warnings: uniqueWarnings,
    previewSvg,
    previewTimeMs,
  };
}

/** Build a throwaway project for previewing a proposal. */
export function surfaceProposalProject(
  proposal: SurfaceGenerationProposal,
): TraceProject {
  return {
    id: 'surface-proposal-preview',
    name: proposal.summary,
    width: proposal.width,
    height: proposal.height,
    durationMs: proposal.durationMs,
    fps: 60,
    elements: proposal.fragment.elements,
    rootElementIds: proposal.fragment.rootElementIds,
    ...(proposal.fragment.defs ? { defs: proposal.fragment.defs } : {}),
    ...(proposal.fragment.gradients
      ? { gradients: proposal.fragment.gradients }
      : {}),
    ...(proposal.fragment.filters ? { filters: proposal.fragment.filters } : {}),
  };
}