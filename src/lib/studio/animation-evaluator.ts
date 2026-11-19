/**
 * lib/studio/animation-evaluator.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * GSAP-based clip animation evaluator.
 *
 * Uses GSAP as a deterministic clock/evaluator rather than animating DOM
 * elements directly.  The Studio preview canvas reads animation state from
 * GSAP's timeline progress, not from GSAP-written CSS properties.  This keeps
 * one evaluation path for preview, export, and scrubbing.
 *
 * Follows the same pattern as Trace's `gsap-compiler.ts`: GSAP is the clock,
 * not the property writer.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { gsap } from 'gsap';

import type {
  ClipAnimation,
  ClipKeyframe,
  StudioAnimationEasing,
} from './types';
import {
  ANIMATION_PRESETS,
  generateKeyframesFromType,
  type AnimationPreset,
} from './animation-presets';

// ── Easing Mapping ───────────────────────────────────────────────────────────

/**
 * Maps a Studio easing identifier to a GSAP easing string.
 * Reuses the same mapping as Trace's `mapEasingToGsap`.
 */
export function mapEasingToGsap(
  easing: StudioAnimationEasing,
): string {
  if (!easing) return 'power2.out';

  switch (easing) {
    case 'linear':
      return 'none';
    case 'ease':
    case 'ease-in-out':
    case 'power2.inOut':
      return 'power2.inOut';
    case 'ease-in':
    case 'power2.in':
      return 'power2.in';
    case 'ease-out':
    case 'power2.out':
      return 'power2.out';
    case 'power3.out':
      return 'power3.out';
    case 'power3.in':
      return 'power3.in';
    case 'power3.inOut':
      return 'power3.inOut';
    case 'power4.out':
    case 'expo.out':
      return 'expo.out';
    case 'circ.out':
      return 'circ.out';
    case 'sine.out':
      return 'sine.out';
    case 'sine.inOut':
      return 'sine.inOut';
    case 'back.out':
      return 'back.out(1.7)';
    case 'back.inOut':
      return 'back.inOut(1.7)';
    case 'elastic.out':
      return 'elastic.out(1, 0.3)';
    case 'bounce.out':
      return 'bounce.out';
    default:
      if (typeof easing === 'string' && easing.startsWith('cubic-bezier(')) {
        // GSAP supports cubic-bezier natively
        return easing;
      }
      return easing || 'power2.out';
  }
}

// ── Animation State ──────────────────────────────────────────────────────────

/** The evaluated animation state for a clip at a given time. */
export interface ClipAnimationState {
  /** Horizontal offset in px. */
  x: number;
  /** Vertical offset in px. */
  y: number;
  /** Scale multiplier (uniform). */
  scale: number;
  /** Rotation in degrees. */
  rotation: number;
  /** Opacity 0-1. */
  opacity: number;
}

/** Default animation state (no animation applied). */
const DEFAULT_STATE: ClipAnimationState = {
  x: 0,
  y: 0,
  scale: 1,
  rotation: 0,
  opacity: 1,
};

// ── GSAP Timeline Builder ────────────────────────────────────────────────────

interface TimelineCacheEntry {
  timeline: gsap.core.Timeline;
  target: Record<string, number>;
}

/**
 * Cache of compiled animation timelines keyed by a hash of the keyframes.
 * Avoids rebuilding GSAP timelines on every frame.
 */
const timelineCache = new Map<string, TimelineCacheEntry>();

/** Simple hash for cache key generation. */
function hashKeyframes(keyframes: ClipKeyframe[]): string {
  let hash = 0;
  for (const kf of keyframes) {
    const s = `${kf.property}:${kf.timeMs}:${kf.value}:${kf.easing}`;
    for (let i = 0; i < s.length; i++) {
      hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
    }
  }
  return String(hash);
}

/**
 * Build a paused GSAP timeline from keyframes.
 *
 * Each keyframe becomes a `to()` tween that animates the corresponding
 * property from its previous value to the keyframe's value over the
 * time delta between keyframes.
 */
function createAnimationTimeline(
  keyframes: ClipKeyframe[],
  durationMs: number,
): TimelineCacheEntry {
  const cacheKey = hashKeyframes(keyframes);
  const cached = timelineCache.get(cacheKey);
  if (cached) return cached;

  // Group keyframes by property
  const byProperty = new Map<string, ClipKeyframe[]>();
  for (const kf of keyframes) {
    const list = byProperty.get(kf.property) ?? [];
    list.push(kf);
    byProperty.set(kf.property, list);
  }

  // Sort each property's keyframes by time
  for (const [, list] of byProperty) {
    list.sort((a, b) => a.timeMs - b.timeMs);
  }

  const target: Record<string, number> = {
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    opacity: 1,
  };

  const master = gsap.timeline({ paused: true });

  // Build tweens for each property
  for (const [property, kfs] of byProperty) {
    if (kfs.length < 2) continue;

    // Set initial value
    target[property] = kfs[0].value;

    for (let i = 1; i < kfs.length; i++) {
      const prev = kfs[i - 1];
      const curr = kfs[i];
      const durationSec = Math.max(0.01, (curr.timeMs - prev.timeMs) / 1000);
      const ease = mapEasingToGsap(curr.easing);

      master.to(
        target,
        {
          [property]: curr.value,
          duration: durationSec,
          ease,
        },
        prev.timeMs / 1000,
      );
    }
  }

  const entry: TimelineCacheEntry = { timeline: master, target };
  timelineCache.set(cacheKey, entry);
  return entry;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Evaluate a clip's animation at a given local time.
 *
 * @param animation The clip animation config (enter or exit).
 * @param phase Whether this is an enter or exit animation.
 * @param localTimeMs Time within the animation phase (0 to durationMs).
 * @returns The animation state (x, y, scale, rotation, opacity).
 */
export function evaluateClipAnimation(
  animation: ClipAnimation | null | undefined,
  phase: 'enter' | 'exit',
  localTimeMs: number,
): ClipAnimationState {
  if (!animation) return { ...DEFAULT_STATE };

  // Resolve keyframes: use stored keyframes, or generate from preset, or from legacy type
  let keyframes: ClipKeyframe[] | null = null;

  if (animation.keyframes && animation.keyframes.length > 0) {
    keyframes = animation.keyframes;
  } else if (animation.presetId) {
    const preset = ANIMATION_PRESETS[animation.presetId];
    if (preset) {
      keyframes = preset.generateKeyframes(phase, animation.durationMs);
    }
  } else if (animation.type && animation.type !== 'none') {
    keyframes = generateKeyframesFromType(
      animation.type,
      phase,
      animation.durationMs,
    );
  }

  if (!keyframes || keyframes.length === 0) {
    return { ...DEFAULT_STATE };
  }

  const durationMs = animation.durationMs;
  if (localTimeMs <= 0) {
    // Before animation starts — return initial state
    return initialStateFromKeyframes(keyframes);
  }
  if (localTimeMs >= durationMs) {
    // Animation complete — return final state
    return finalStateFromKeyframes(keyframes);
  }

  // Build or retrieve GSAP timeline
  const { timeline, target } = createAnimationTimeline(keyframes, durationMs);

  // Reset to initial state before seeking
  resetToInitial(target, keyframes);

  // Seek to the current time
  timeline.time(localTimeMs / 1000);

  return {
    x: target.x ?? 0,
    y: target.y ?? 0,
    scale: target.scale ?? 1,
    rotation: target.rotation ?? 0,
    opacity: target.opacity ?? 1,
  };
}

/**
 * Evaluate a clip's full animation state at a given composition time.
 *
 * Handles the three-phase model: enter → visible (hold) → exit.
 * The visible phase is the time between enter completing and exit starting.
 *
 * @param clipDurationMs Total clip duration on the timeline.
 * @param enterAnimation Enter animation config (or null for none).
 * @param exitAnimation Exit animation config (or null for none).
 * @param localTimeMs Time within the clip (0 to clipDurationMs).
 * @returns The combined animation state.
 */
export function evaluateClipAtTime(
  clipDurationMs: number,
  enterAnimation: ClipAnimation | null | undefined,
  exitAnimation: ClipAnimation | null | undefined,
  localTimeMs: number,
): ClipAnimationState {
  // Determine which phase we're in
  const enterDuration = enterAnimation?.durationMs ?? 0;
  const exitDuration = exitAnimation?.durationMs ?? 0;
  const exitStart = clipDurationMs - exitDuration;

  if (localTimeMs < enterDuration && enterAnimation) {
    // Enter phase
    return evaluateClipAnimation(enterAnimation, 'enter', localTimeMs);
  }

  if (localTimeMs >= exitStart && exitAnimation && exitDuration > 0) {
    // Exit phase
    const exitLocal = localTimeMs - exitStart;
    return evaluateClipAnimation(exitAnimation, 'exit', exitLocal);
  }

  // Visible (hold) phase — fully visible
  return { ...DEFAULT_STATE };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Extract the initial state from keyframes (values at time 0). */
function initialStateFromKeyframes(
  keyframes: ClipKeyframe[],
): ClipAnimationState {
  const state: Record<string, number> = {
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    opacity: 1,
  };

  for (const kf of keyframes) {
    if (kf.timeMs === 0) {
      state[kf.property] = kf.value;
    }
  }

  return {
    x: state.x,
    y: state.y,
    scale: state.scale,
    rotation: state.rotation,
    opacity: state.opacity,
  };
}

/** Extract the final state from keyframes (values at the last time). */
function finalStateFromKeyframes(
  keyframes: ClipKeyframe[],
): ClipAnimationState {
  const state: Record<string, number> = {
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    opacity: 1,
  };

  // Group by property and find the last keyframe for each
  const byProperty = new Map<string, ClipKeyframe[]>();
  for (const kf of keyframes) {
    const list = byProperty.get(kf.property) ?? [];
    list.push(kf);
    byProperty.set(kf.property, list);
  }

  for (const [, list] of byProperty) {
    const last = list[list.length - 1];
    state[last.property] = last.value;
  }

  return {
    x: state.x,
    y: state.y,
    scale: state.scale,
    rotation: state.rotation,
    opacity: state.opacity,
  };
}

/** Reset target to initial keyframe values. */
function resetToInitial(
  target: Record<string, number>,
  keyframes: ClipKeyframe[],
): void {
  // Reset to defaults
  target.x = 0;
  target.y = 0;
  target.scale = 1;
  target.rotation = 0;
  target.opacity = 1;

  // Apply time-0 keyframes
  for (const kf of keyframes) {
    if (kf.timeMs === 0) {
      target[kf.property] = kf.value;
    }
  }
}

/**
 * Clear the timeline cache (call when presets change or on unload).
 */
export function clearAnimationCache(): void {
  for (const [, entry] of timelineCache) {
    entry.timeline.kill();
  }
  timelineCache.clear();
}

/**
 * Check if a clip has any animation keyframes for the given phase.
 * Used by the timeline viewport to show keyframe indicators.
 */
export function hasAnimationKeyframes(
  animation: ClipAnimation | null | undefined,
): boolean {
  if (!animation) return false;
  if (animation.keyframes && animation.keyframes.length > 0) return true;
  if (animation.presetId && ANIMATION_PRESETS[animation.presetId]) return true;
  if (animation.type && animation.type !== 'none') return true;
  return false;
}
