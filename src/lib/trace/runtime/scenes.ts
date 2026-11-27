/**
 * lib/trace/runtime/scenes.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Scene presentation: which storyboard scene is on screen, what background it
 * paints, and how a scene enters.
 *
 * Scenes are a timeline layer over ONE element graph, so a transition must not
 * rewrite element values — the signature template already choreographs its own
 * entrances, and multiplying opacity at a scene boundary would blink content
 * that was authored to stay visible. Entrances are therefore a frame-level veil
 * painted over the composition: a `fade` dips from the background colour and
 * lifts, a `slide` wipes the veil off to the right.
 *
 * The same pure functions drive the editor, the static serializer and the video
 * exporter, so a frame cannot look different in the stage and in the file.
 *
 * Pure and DOM-free (jsdom-safe); the DOM ids are shared with the renderer the
 * same way subtitle ids are.
 */

import { lerpColor } from '../animation/color-math';
import type {
  SceneTransition,
  TraceProject,
  TraceScene,
} from '../types';

/** How long a non-cut scene entrance runs. */
export const TRACE_SCENE_TRANSITION_MS = 450;

/** Opaque base used when neither the scene nor the project sets a colour. */
export const DEFAULT_SCENE_BACKGROUND = '#0f172a';

/**
 * DOM ids shared by the renderer (which mounts the scene layer) and the runtime
 * (which writes into it). `prefix` matches the element id prefix so embedded
 * previews of the same composition never collide.
 */
export function sceneBackgroundDomId(prefix = 'trace-elem'): string {
  return `${prefix}-scene-background`;
}

export function sceneVeilDomId(prefix = 'trace-elem'): string {
  return `${prefix}-scene-veil`;
}

export interface SceneTransitionState {
  scene: TraceScene;
  kind: Exclude<SceneTransition, 'cut'>;
  /** Linear progress through the entrance window, 0..1. */
  progress: number;
  /** Eased progress used for paint values. */
  eased: number;
}

/**
 * The veil painted over the composition during an entrance. `opacity` fades a
 * full-canvas dip; `translateX` slides a full-cover panel off the right edge.
 */
export interface SceneVeil {
  fill: string;
  opacity: number;
  translateX: number;
  width: number;
  height: number;
}

export interface SceneBackground {
  fill: string;
  /** True while blending from the previous scene's background. */
  blending: boolean;
}

function easeOutCubic(progress: number): number {
  const clamped = Math.max(0, Math.min(1, progress));
  return 1 - Math.pow(1 - clamped, 3);
}

function normalizeColor(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * The scene containing `timeMs`.
 *
 * Considers the authored ranges first (so overlapping legacy data resolves to
 * the scene that actually covers the playhead), then falls back to the latest
 * scene that has started, then the first scene.
 */
export function sceneAtTime(
  project: TraceProject,
  timeMs: number,
): TraceScene | null {
  const scenes = project.storyboard?.scenes ?? [];
  if (scenes.length === 0) return null;

  let latest: TraceScene | null = null;
  for (const scene of scenes) {
    const startMs = Number.isFinite(scene.startMs) ? scene.startMs : 0;
    const durationMs = Number.isFinite(scene.durationMs) ? scene.durationMs : 0;
    if (timeMs >= startMs && timeMs < startMs + durationMs) return scene;
    if (startMs <= timeMs) latest = scene;
  }
  return latest ?? scenes[0];
}

/** The entrance transition for a scene at `timeMs`, or null when settled. */
export function sceneTransitionAtScene(
  scene: TraceScene | null | undefined,
  timeMs: number,
): SceneTransitionState | null {
  if (!scene) return null;
  const kind = scene.transitionIn;
  if (kind !== 'fade' && kind !== 'slide') return null;

  const durationMs = Number.isFinite(scene.durationMs)
    ? scene.durationMs
    : TRACE_SCENE_TRANSITION_MS;
  const windowMs = Math.max(1, Math.min(TRACE_SCENE_TRANSITION_MS, durationMs));
  const startMs = Number.isFinite(scene.startMs) ? scene.startMs : 0;
  const elapsed = timeMs - startMs;
  if (elapsed < 0 || elapsed >= windowMs) return null;

  const progress = Math.max(0, Math.min(1, elapsed / windowMs));
  return { scene, kind, progress, eased: easeOutCubic(progress) };
}

export function sceneTransitionAtTime(
  project: TraceProject,
  timeMs: number,
): SceneTransitionState | null {
  return sceneTransitionAtScene(sceneAtTime(project, timeMs), timeMs);
}

/**
 * The background to paint at `timeMs`, blending from the previous scene's
 * background during an entrance. Returns null when no scene defines one, which
 * leaves the artboard transparent (the editor and exporter each supply their
 * own fallback).
 */
export function sceneBackgroundAtTime(
  project: TraceProject,
  timeMs: number,
): SceneBackground | null {
  const scenes = project.storyboard?.scenes ?? [];
  if (scenes.length === 0) return null;

  const scene = sceneAtTime(project, timeMs);
  if (!scene) return null;

  const current = normalizeColor(scene.background);
  const index = scenes.findIndex((entry) => entry.id === scene.id);
  const previous = index > 0 ? scenes[index - 1] : null;
  const previousFill = normalizeColor(previous?.background);
  const transition = sceneTransitionAtScene(scene, timeMs);

  if (
    transition &&
    current &&
    previousFill &&
    previousFill.toLowerCase() !== current.toLowerCase()
  ) {
    return {
      fill: lerpColor(previousFill, current, transition.eased),
      blending: true,
    };
  }

  return current ? { fill: current, blending: false } : null;
}

/**
 * The entrance veil at `timeMs`, or null when the scene is settled.
 *
 * `fade` covers the frame in the background colour and lifts; `slide` carries
 * the same cover off the right edge, revealing the composition behind it. Both
 * are additive paint, so authored tracks are untouched and no undo step is
 * required.
 */
export function sceneVeilAtTime(
  project: TraceProject,
  timeMs: number,
  fallbackFill = DEFAULT_SCENE_BACKGROUND,
): SceneVeil | null {
  const transition = sceneTransitionAtTime(project, timeMs);
  if (!transition) return null;

  const fill =
    sceneBackgroundAtTime(project, timeMs)?.fill ?? fallbackFill;

  if (transition.kind === 'fade') {
    return {
      fill,
      opacity: 1 - transition.eased,
      translateX: 0,
      width: project.width,
      height: project.height,
    };
  }

  return {
    fill,
    opacity: 1,
    translateX: transition.eased * project.width,
    width: project.width,
    height: project.height,
  };
}

/** True when any scene carries its own background. */
export function hasSceneBackground(project: TraceProject): boolean {
  return (project.storyboard?.scenes ?? []).some((scene) =>
    Boolean(normalizeColor(scene.background)),
  );
}