/**
 * lib/trace/narration-timing.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Voices before pictures.
 *
 * A narrated composition is timed from the MEASURED durations of its generated
 * voice lines, never the other way round: each scene spans its lines, each line
 * gets an absolute `startMs`, and every following scene shifts with it. Scenes
 * without narration keep their existing duration.
 *
 * Pure and DOM-free so the editor, the copilot tool and the ops engine all run
 * the same math. The resulting values are persisted through ordinary ops
 * (`setNarration`, `setSceneDurations`, `setCanvas`) — this module never
 * mutates a document itself.
 */

import type {
  TraceNarration,
  TraceNarrationLine,
  TraceProject,
  TraceScene,
  TraceStoryboard,
} from './types';
import {
  ensureStoryboard,
  getStoryboardDuration,
  layoutScenes,
} from './storyboard';
import type { TraceOp } from './ops/types';

export interface NarrationTimingOptions {
  /** Silence between consecutive lines inside one scene, ms. Default 0. */
  lineGapMs?: number;
  /** Hold after a scene's last line before the cut, ms. Default 300. */
  sceneTailMs?: number;
  /** Floor for a narrated scene, ms. Default 500. */
  minimumSceneMs?: number;
  /**
   * Shift keyframes of scene-assigned elements by their scene's start delta so
   * content stays with its scene when an earlier scene grows. Default true.
   */
  shiftSceneElements?: boolean;
}

export interface NarrationTiming {
  /** Scenes re-laid out contiguously from zero, in storyboard order. */
  scenes: TraceScene[];
  /** Lines in script order, with absolute `startMs` filled in. */
  lines: TraceNarrationLine[];
  /** Total project length implied by the layout. */
  durationMs: number;
  /** Lines with no measured duration yet — generate audio before fitting. */
  untimedLineIds: string[];
}

/** True when every line carries a usable measured duration. */
export function hasMeasuredDurations(narration: TraceNarration): boolean {
  return (
    narration.lines.length > 0 &&
    narration.lines.every((line) => measuredDuration(line) !== null)
  );
}

function measuredDuration(line: TraceNarrationLine): number | null {
  const value = line.durationMs;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value;
}

/**
 * A storyboard for timing purposes. An empty project gets the same deterministic
 * `scene-1` that `ensureStoryboard` creates, so the op that persists the layout
 * targets the identical scene.
 */
function timingStoryboard(storyboard: TraceStoryboard): TraceStoryboard {
  if (storyboard.scenes.length > 0) return storyboard;
  return {
    scenes: [
      {
        id: 'scene-1',
        name: 'Scene 1',
        startMs: 0,
        durationMs: 1,
        transitionIn: 'cut',
      },
    ],
    sourceRefs: [],
  };
}

/**
 * Compute the timeline a narration implies.
 *
 * Lines are grouped by `sceneId` in storyboard order; lines without a scene (or
 * with a scene that no longer exists) belong to the last scene. Scene duration
 * is the sum of its measured lines plus gaps and tail; a scene with no timed
 * lines keeps its authored duration.
 */
export function buildNarrationTiming(
  narration: TraceNarration,
  storyboard: TraceStoryboard,
  options: NarrationTimingOptions = {},
): NarrationTiming {
  const lineGapMs = Math.max(0, options.lineGapMs ?? 0);
  const sceneTailMs = Math.max(0, options.sceneTailMs ?? 300);
  const minimumSceneMs = Math.max(1, options.minimumSceneMs ?? 500);

  const base = timingStoryboard(storyboard);
  const sceneIds = new Set(base.scenes.map((scene) => scene.id));
  const fallbackSceneId = base.scenes[base.scenes.length - 1].id;

  const byScene = new Map<string, TraceNarrationLine[]>();
  for (const scene of base.scenes) byScene.set(scene.id, []);
  for (const line of narration.lines) {
    const sceneId =
      line.sceneId && sceneIds.has(line.sceneId)
        ? line.sceneId
        : fallbackSceneId;
    byScene.get(sceneId)!.push(line);
  }

  // Scene lengths: narration content decides; un-narrated scenes keep theirs.
  const sized = base.scenes.map((scene) => {
    const lines = byScene.get(scene.id) ?? [];
    const timed = lines
      .map(measuredDuration)
      .filter((value): value is number => value !== null);
    if (timed.length === 0) return { ...scene };
    const gaps = lineGapMs * Math.max(0, timed.length - 1);
    const content = timed.reduce((sum, value) => sum + value, 0) + gaps;
    return {
      ...scene,
      durationMs: Math.max(minimumSceneMs, Math.round(content + sceneTailMs)),
    };
  });

  const scenes = layoutScenes(sized);
  const startById = new Map(scenes.map((scene) => [scene.id, scene.startMs]));

  // Absolute start per line, in script order. Untimed lines do not consume
  // time; they are reported so the caller generates audio first.
  const cursors = new Map<string, number>();
  for (const scene of scenes) cursors.set(scene.id, scene.startMs);
  const untimedLineIds: string[] = [];
  const lines = narration.lines.map((line) => {
    const sceneId =
      line.sceneId && sceneIds.has(line.sceneId)
        ? line.sceneId
        : fallbackSceneId;
    const cursor = cursors.get(sceneId) ?? startById.get(sceneId) ?? 0;
    const duration = measuredDuration(line);
    if (duration === null) {
      untimedLineIds.push(line.id);
      return { ...line, sceneId, startMs: Math.round(cursor) };
    }
    cursors.set(sceneId, cursor + duration + lineGapMs);
    return { ...line, sceneId, startMs: Math.round(cursor) };
  });

  return {
    scenes,
    lines,
    durationMs: getStoryboardDuration({ scenes }),
    untimedLineIds,
  };
}

export interface NarrationTimingOps {
  ops: TraceOp[];
  timing: NarrationTiming;
  untimedLineIds: string[];
}

/**
 * The op batch that applies a narration timing: store the lines, resize the
 * scenes, extend the canvas. One batch, so the document never exists in a
 * half-timed state.
 */
export function buildNarrationTimingOps(
  project: TraceProject,
  narration: TraceNarration,
  options: NarrationTimingOptions = {},
): NarrationTimingOps {
  const storyboard = ensureStoryboard(project);
  const timing = buildNarrationTiming(narration, storyboard, options);

  const durations: Record<string, number> = {};
  for (const scene of timing.scenes) durations[scene.id] = scene.durationMs;

  const ops: TraceOp[] = [
    { type: 'setNarration', narration: { ...narration, lines: timing.lines } },
    { type: 'setSceneDurations', durations },
    { type: 'setCanvas', durationMs: timing.durationMs },
  ];

  // Content follows its scene. When scene N grows, every later scene starts
  // later, so tracks authored in absolute time must move by the same delta.
  if (options.shiftSceneElements !== false) {
    const previousStart = new Map(
      storyboard.scenes.map((scene) => [scene.id, scene.startMs]),
    );
    const deltas = new Map<string, number>();
    for (const scene of timing.scenes) {
      const previous = previousStart.get(scene.id);
      if (previous === undefined) continue;
      const delta = scene.startMs - previous;
      if (delta !== 0) deltas.set(scene.id, delta);
    }

    if (deltas.size > 0) {
      for (const element of Object.values(project.elements)) {
        const sceneId = element.sceneId;
        if (!sceneId) continue;
        const delta = deltas.get(sceneId);
        if (!delta) continue;
        for (const track of element.tracks ?? []) {
          ops.push({
            type: 'setTrack',
            elementId: element.id,
            property: track.property,
            trackId: track.id,
            keyframes: track.keyframes.map((keyframe) => ({
              id: keyframe.id,
              timeMs: Math.max(0, Math.round(keyframe.timeMs + delta)),
              value: keyframe.value,
              easing: keyframe.easing,
            })),
            ...(track.discrete !== undefined
              ? { discrete: track.discrete }
              : {}),
          });
        }
      }
    }
  }

  return { ops, timing, untimedLineIds: timing.untimedLineIds };
}