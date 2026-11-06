/**
 * lib/trace/lint.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Lints a Nova Trace project.
 *
 * The linter is intentionally conservative: warnings are style/taste hints,
 * errors are things that make the artifact wrong or unrenderable. `ok` is true
 * only when there are zero errors.
 *
 * Pure: no React, Electron, DOM or database. Safe to run in Jest.
 *
 * Adapted from sagedesigns-os lib/motion/lint/index.ts.
 */

import type {
  AnimatableProperty,
  TraceElement,
  TraceProject,
  PropertyTrack,
} from './types';
import type {
  Diagnostic,
  DiagnosticCode,
  DiagnosticSeverity,
  LintOptions,
  LintResult,
} from './lint/types';

export * from './lint/types';

const ANIMATABLE_PROPERTIES = new Set<AnimatableProperty>([
  'x',
  'y',
  'scaleX',
  'scaleY',
  'rotation',
  'opacity',
  'fillOpacity',
  'strokeDashoffset',
  'strokeDasharray',
  'strokeWidth',
  'fill',
  'stroke',
  'fontSize',
  'letterSpacing',
  'text',
  'width',
  'height',
  'rx',
  'counterValue',
  'progress',
  'revealProgress',
  'pathProgress',
  'trimStart',
  'trimEnd',
  'trimOffset',
  'morphProgress',
  'boxShadow',
  'backgroundColor',
  'borderColor',
  'color',
  'borderRadius',
]);

const STRING_PROPERTIES = new Set<AnimatableProperty>([
  'fill',
  'stroke',
  'text',
  'strokeDasharray',
  'boxShadow',
  'backgroundColor',
  'borderColor',
  'color',
]);

const TEXT_TYPES = new Set(['text', 'kinetic-text']);

/** Duplicate keyframes closer than this are treated as accidental. */
const DUPLICATE_KEYFRAME_TOLERANCE_MS = 10;

/** Slack allowed before an element counts as "off canvas". */
const BOUNDS_MARGIN_PX = 32;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function elementPosition(
  element: TraceElement,
): { x: number; y: number } | null {
  const attrs = element.attributes ?? {};
  const x = attrs.baseX ?? attrs.x ?? attrs.cx;
  const y = attrs.baseY ?? attrs.y ?? attrs.cy;
  if (!isFiniteNumber(x) || !isFiniteNumber(y)) return null;
  return { x, y };
}

function collectDefIds(defs: string | undefined): Set<string> {
  const ids = new Set<string>();
  if (!defs) return ids;
  const re = /\bid=(["'])([^"']+)\1/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(defs)) !== null) {
    if (match[2]) ids.add(match[2]);
  }
  return ids;
}

function collectUrlRefs(value: string): string[] {
  const refs: string[] = [];
  const re = /url\(\s*#([^)\s]+)\s*\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(value)) !== null) {
    if (match[1]) refs.push(match[1]);
  }
  return refs;
}

function trackLabel(track: PropertyTrack): string {
  return track.label || track.property;
}

function hasParentCycle(project: TraceProject, elementId: string): boolean {
  const visiting = new Set<string>();
  let cursor: string | null | undefined = project.elements[elementId]?.parentId;
  while (cursor) {
    if (cursor === elementId || visiting.has(cursor)) return true;
    visiting.add(cursor);
    cursor = project.elements[cursor]?.parentId;
  }
  return false;
}

export function lintTraceProject(
  project: TraceProject,
  options: LintOptions = {},
): LintResult {
  const diagnostics: Diagnostic[] = [];

  const add = (
    code: DiagnosticCode,
    severity: DiagnosticSeverity,
    message: string,
    extra: Omit<Diagnostic, 'code' | 'severity' | 'message'> = {},
  ) => {
    diagnostics.push({ code, severity, message, ...extra });
  };

  const elements = project.elements ?? {};
  const elementIds = new Set(Object.keys(elements));
  const durationMs = Math.max(1, project.durationMs || 1);
  const canvasWidth = Math.max(1, project.width || 1);
  const canvasHeight = Math.max(1, project.height || 1);
  const scenes = project.storyboard?.scenes ?? [];
  const sceneIds = new Set(scenes.map((scene) => scene.id));

  // ── Element graph ──────────────────────────────────────────────────────────
  for (const [elementId, element] of Object.entries(elements)) {
    if (element.parentId && !elementIds.has(element.parentId)) {
      add(
        'ORPHAN_ELEMENT',
        'error',
        `Element "${element.name}" references missing parent "${element.parentId}".`,
        { elementId, fix: 'Reparent the element or clear parentId.' },
      );
    }

    if (
      element.sceneId &&
      sceneIds.size > 0 &&
      !sceneIds.has(element.sceneId)
    ) {
      add(
        'ELEMENT_SCENE_MISSING',
        'warning',
        `Element "${element.name}" belongs to unknown scene "${element.sceneId}".`,
        {
          elementId,
          fix: 'Reassign the element to an existing scene or null.',
        },
      );
    }

    for (const childId of element.childrenIds ?? []) {
      if (!elementIds.has(childId)) {
        add(
          'ELEMENT_CHILD_MISSING',
          'error',
          `Element "${element.name}" lists missing child "${childId}".`,
          { elementId, fix: 'Remove the stale child id or restore the child.' },
        );
      }
    }

    if (hasParentCycle(project, elementId)) {
      add(
        'CYCLE_DETECTED',
        'error',
        `Element "${element.name}" is part of a parent cycle.`,
        { elementId, fix: 'Break the cycle by clearing one element parentId.' },
      );
    }
  }

  for (const rootId of project.rootElementIds ?? []) {
    if (!elementIds.has(rootId)) {
      add(
        'ELEMENT_ROOT_MISSING',
        'error',
        `rootElementIds references missing element "${rootId}".`,
        { fix: 'Remove the stale root id.' },
      );
    }
  }

  // ── Tracks ─────────────────────────────────────────────────────────────────
  for (const [elementId, element] of Object.entries(elements)) {
    for (const track of element.tracks ?? []) {
      if (!ANIMATABLE_PROPERTIES.has(track.property)) {
        add(
          'TRACK_UNKNOWN_PROPERTY',
          'warning',
          `Track "${trackLabel(track)}" on "${element.name}" animates an unknown property.`,
          {
            elementId,
            fix: 'Use one of the documented animatable properties.',
          },
        );
      }

      const keyframes = [...(track.keyframes ?? [])].sort(
        (a, b) => a.timeMs - b.timeMs,
      );
      if (keyframes.length === 0) {
        add(
          'TRACK_TOO_FEW_KEYFRAMES',
          'warning',
          `Track "${trackLabel(track)}" on "${element.name}" has no keyframes.`,
          { elementId, fix: 'Add at least one keyframe or delete the track.' },
        );
      }

      for (let index = 0; index < keyframes.length; index += 1) {
        const keyframe = keyframes[index];
        if (!isFiniteNumber(keyframe.timeMs)) {
          add(
            'KEYFRAME_INVALID_TIME',
            'error',
            `Track "${trackLabel(track)}" on "${element.name}" has a non-finite keyframe time.`,
            { elementId, fix: 'Set a finite time in milliseconds.' },
          );
          continue;
        }

        if (keyframe.timeMs < 0 || keyframe.timeMs > durationMs) {
          add(
            'KEYFRAME_OUT_OF_BOUNDS',
            'warning',
            `Keyframe at ${Math.round(keyframe.timeMs)}ms on "${element.name}" is outside 0–${durationMs}ms.`,
            {
              elementId,
              timeMs: keyframe.timeMs,
              fix: 'Move the keyframe inside the project duration or extend it.',
            },
          );
        }

        if (
          STRING_PROPERTIES.has(track.property) === false &&
          typeof keyframe.value !== 'number'
        ) {
          add(
            'TRACK_INVALID_VALUE',
            'error',
            `Track "${trackLabel(track)}" on "${element.name}" expects numeric keyframe values.`,
            {
              elementId,
              timeMs: keyframe.timeMs,
              fix: 'Use numbers for this property.',
            },
          );
        }

        const previous = keyframes[index - 1];
        if (
          previous &&
          isFiniteNumber(previous.timeMs) &&
          Math.abs(previous.timeMs - keyframe.timeMs) <
            DUPLICATE_KEYFRAME_TOLERANCE_MS
        ) {
          add(
            'DUPLICATE_KEYFRAME_TIME',
            'warning',
            `Two keyframes on "${element.name}" sit within ${DUPLICATE_KEYFRAME_TOLERANCE_MS}ms of each other.`,
            {
              elementId,
              timeMs: keyframe.timeMs,
              fix: 'Remove or retime the duplicate keyframe.',
            },
          );
        }
      }

      if (options.loop && keyframes.length > 1) {
        const first = keyframes[0];
        const last = keyframes[keyframes.length - 1];
        if (first.value !== last.value) {
          add(
            'TRACK_INVALID_VALUE',
            'warning',
            `Looping track "${trackLabel(track)}" on "${element.name}" does not end where it starts.`,
            {
              elementId,
              fix: 'Match the first and last keyframe values for a seamless loop.',
            },
          );
        }
      }
    }
  }

  // ── Bounds & content ───────────────────────────────────────────────────────
  for (const [elementId, element] of Object.entries(elements)) {
    const position = elementPosition(element);
    if (position) {
      const offCanvas =
        position.x < -BOUNDS_MARGIN_PX ||
        position.y < -BOUNDS_MARGIN_PX ||
        position.x > canvasWidth + BOUNDS_MARGIN_PX ||
        position.y > canvasHeight + BOUNDS_MARGIN_PX;
      if (offCanvas) {
        add(
          'ELEMENT_OUT_OF_BOUNDS',
          'warning',
          `Element "${element.name}" sits outside the ${canvasWidth}×${canvasHeight} canvas.`,
          { elementId, fix: 'Move the element onto the canvas or widen it.' },
        );
      }
    }

    if (TEXT_TYPES.has(element.type)) {
      const text =
        typeof element.attributes.text === 'string'
          ? element.attributes.text
          : '';
      const fontSize = Number(element.attributes.fontSize ?? 24);
      if (text.length > 0 && Number.isFinite(fontSize)) {
        const estimatedWidth = text.length * fontSize * 0.6;
        if (estimatedWidth > canvasWidth * 1.1) {
          add(
            'TEXT_OVERFLOW',
            'warning',
            `Text "${text.slice(0, 24)}${text.length > 24 ? '…' : ''}" is wider than the canvas.`,
            {
              elementId,
              fix: 'Reduce fontSize, wrap the copy, or widen the canvas.',
            },
          );
        }
      }
    }
  }

  // ── Paint references ───────────────────────────────────────────────────────
  const defIds = collectDefIds(project.defs);
  for (const gradientId of Object.keys(project.gradients ?? {})) {
    if (!defIds.has(gradientId)) {
      add(
        'DEF_REF_MISSING',
        'info',
        `Gradient "${gradientId}" is not serialized into defs yet.`,
        { fix: 'Serialize gradients into project.defs before export.' },
      );
    }
  }

  for (const [elementId, element] of Object.entries(elements)) {
    for (const value of Object.values(element.attributes ?? {})) {
      if (typeof value !== 'string') continue;
      for (const ref of collectUrlRefs(value)) {
        if (!defIds.has(ref) && !project.gradients?.[ref]) {
          add(
            'DEF_REF_MISSING',
            'error',
            `Element "${element.name}" references missing def "#${ref}".`,
            {
              elementId,
              fix: 'Restore the gradient/pattern or clear the reference.',
            },
          );
        }
      }
    }
  }

  // ── Scenes ─────────────────────────────────────────────────────────────────
  if (project.storyboard && scenes.length === 0) {
    add('SCENE_EMPTY', 'warning', 'Storyboard has no scenes.', {
      fix: 'Add a scene or remove the empty storyboard.',
    });
  }

  for (const scene of scenes) {
    if (scene.startMs + scene.durationMs > durationMs) {
      add(
        'SCENE_NOT_FOUND',
        'info',
        `Scene "${scene.name}" ends after the project duration.`,
        {
          sceneId: scene.id,
          fix: 'Extend project.durationMs to cover the storyboard.',
        },
      );
    }
  }

  // ── Audio ──────────────────────────────────────────────────────────────────
  for (const track of project.audioTracks ?? []) {
    if (!track.url || !track.url.trim()) {
      add(
        'AUDIO_UNRESOLVED',
        'error',
        `Audio track "${track.name}" has no source URL.`,
        {
          fix: 'Set a data URI or media URL on the track.',
        },
      );
    }
    if (track.startTimeMs > durationMs) {
      add(
        'AUDIO_UNRESOLVED',
        'warning',
        `Audio track "${track.name}" starts after the project ends.`,
        {
          timeMs: track.startTimeMs,
          fix: 'Move the track earlier or extend the duration.',
        },
      );
    }
  }

  const errorCount = diagnostics.filter(
    (entry) => entry.severity === 'error',
  ).length;
  const warningCount = diagnostics.filter(
    (entry) => entry.severity === 'warning',
  ).length;

  return {
    ok: errorCount === 0,
    diagnostics,
    errorCount,
    warningCount,
  };
}
