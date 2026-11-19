/**
 * lib/studio/animation-presets.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pre-built animation presets for clip enter/exit effects.
 *
 * Each preset generates `ClipKeyframe[]` data so the same keyframe model
 * supports both presets and custom animations.  The preset system is a
 * convenience layer — the evaluator only sees keyframes.
 *
 * Presets are organized by category: enter, exit, or both.  The generated
 * keyframes use clip-relative timing (offset from clip start for enter,
 * offset from clip end for exit).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type {
  ClipAnimatableProperty,
  ClipKeyframe,
  StudioAnimationEasing,
} from './types';

// ── Helpers ──────────────────────────────────────────────────────────────────

let idCounter = 0;
function uid(): string {
  return `kf-${++idCounter}`;
}

function makeKeyframe(
  property: ClipAnimatableProperty,
  timeMs: number,
  value: number,
  easing: StudioAnimationEasing,
): ClipKeyframe {
  return { id: uid(), timeMs, property, value, easing };
}

/**
 * Generate keyframes for a simple two-point animation (from → to).
 * The "from" keyframe is at time 0, the "to" keyframe is at `durationMs`.
 */
function simpleTransition(
  property: ClipAnimatableProperty,
  from: number,
  to: number,
  durationMs: number,
  easing: StudioAnimationEasing,
): ClipKeyframe[] {
  return [
    makeKeyframe(property, 0, from, easing),
    makeKeyframe(property, durationMs, to, easing),
  ];
}

// ── Preset Interface ─────────────────────────────────────────────────────────

export interface AnimationPreset {
  id: string;
  name: string;
  /** Whether this preset is for enter, exit, or both. */
  category: 'enter' | 'exit' | 'both';
  /** Default duration in ms. */
  defaultDurationMs: number;
  /** Default easing for the generated keyframes. */
  defaultEasing: StudioAnimationEasing;
  /**
   * Generate keyframes for this preset.
   * @param direction 'enter' or 'exit' to determine start/end values
   * @param durationMs animation duration override
   */
  generateKeyframes(
    direction: 'enter' | 'exit',
    durationMs?: number,
  ): ClipKeyframe[];
}

// ── Preset Definitions ───────────────────────────────────────────────────────

/** Fly in from the left: x from -200 to 0, opacity from 0 to 1 */
export const presetFlyInLeft: AnimationPreset = {
  id: 'fly-in-left',
  name: 'Fly In Left',
  category: 'both',
  defaultDurationMs: 400,
  defaultEasing: 'power2.out',
  generateKeyframes(direction, durationMs = 400) {
    const sign = direction === 'enter' ? 1 : -1;
    return [
      makeKeyframe('x', 0, -200 * sign, this.defaultEasing),
      makeKeyframe('x', durationMs, 0, this.defaultEasing),
      makeKeyframe('opacity', 0, 0, this.defaultEasing),
      makeKeyframe('opacity', durationMs, 1, this.defaultEasing),
    ];
  },
};

/** Fly in from the right: x from 200 to 0, opacity from 0 to 1 */
export const presetFlyInRight: AnimationPreset = {
  id: 'fly-in-right',
  name: 'Fly In Right',
  category: 'both',
  defaultDurationMs: 400,
  defaultEasing: 'power2.out',
  generateKeyframes(direction, durationMs = 400) {
    const sign = direction === 'enter' ? 1 : -1;
    return [
      makeKeyframe('x', 0, 200 * sign, this.defaultEasing),
      makeKeyframe('x', durationMs, 0, this.defaultEasing),
      makeKeyframe('opacity', 0, 0, this.defaultEasing),
      makeKeyframe('opacity', durationMs, 1, this.defaultEasing),
    ];
  },
};

/** Fly in from the top: y from -100 to 0, opacity from 0 to 1 */
export const presetFlyInUp: AnimationPreset = {
  id: 'fly-in-up',
  name: 'Fly In Up',
  category: 'both',
  defaultDurationMs: 400,
  defaultEasing: 'power2.out',
  generateKeyframes(direction, durationMs = 400) {
    const sign = direction === 'enter' ? 1 : -1;
    return [
      makeKeyframe('y', 0, -100 * sign, this.defaultEasing),
      makeKeyframe('y', durationMs, 0, this.defaultEasing),
      makeKeyframe('opacity', 0, 0, this.defaultEasing),
      makeKeyframe('opacity', durationMs, 1, this.defaultEasing),
    ];
  },
};

/** Fly in from the bottom: y from 100 to 0, opacity from 0 to 1 */
export const presetFlyInDown: AnimationPreset = {
  id: 'fly-in-down',
  name: 'Fly In Down',
  category: 'both',
  defaultDurationMs: 400,
  defaultEasing: 'power2.out',
  generateKeyframes(direction, durationMs = 400) {
    const sign = direction === 'enter' ? 1 : -1;
    return [
      makeKeyframe('y', 0, 100 * sign, this.defaultEasing),
      makeKeyframe('y', durationMs, 0, this.defaultEasing),
      makeKeyframe('opacity', 0, 0, this.defaultEasing),
      makeKeyframe('opacity', durationMs, 1, this.defaultEasing),
    ];
  },
};

/** Zoom in: scale from 0.5 to 1, opacity from 0 to 1 */
export const presetZoomIn: AnimationPreset = {
  id: 'zoom-in',
  name: 'Zoom In',
  category: 'both',
  defaultDurationMs: 400,
  defaultEasing: 'power2.out',
  generateKeyframes(direction, durationMs = 400) {
    const from = direction === 'enter' ? 0.5 : 1;
    const to = direction === 'enter' ? 1 : 0.5;
    return [
      makeKeyframe('scale', 0, from, this.defaultEasing),
      makeKeyframe('scale', durationMs, to, this.defaultEasing),
      makeKeyframe('opacity', 0, direction === 'enter' ? 0 : 1, this.defaultEasing),
      makeKeyframe('opacity', durationMs, direction === 'enter' ? 1 : 0, this.defaultEasing),
    ];
  },
};

/** Fade: opacity only */
export const presetFade: AnimationPreset = {
  id: 'fade',
  name: 'Fade',
  category: 'both',
  defaultDurationMs: 300,
  defaultEasing: 'ease-out',
  generateKeyframes(direction, durationMs = 300) {
    return [
      makeKeyframe(
        'opacity',
        0,
        direction === 'enter' ? 0 : 1,
        this.defaultEasing,
      ),
      makeKeyframe(
        'opacity',
        durationMs,
        direction === 'enter' ? 1 : 0,
        this.defaultEasing,
      ),
    ];
  },
};

/** Bounce in: scale from 0 to 1.2 to 1 with bounce easing */
export const presetBounceIn: AnimationPreset = {
  id: 'bounce-in',
  name: 'Bounce In',
  category: 'both',
  defaultDurationMs: 500,
  defaultEasing: 'bounce.out',
  generateKeyframes(direction, durationMs = 500) {
    const from = direction === 'enter' ? 0 : 1;
    const to = direction === 'enter' ? 1 : 0;
    return [
      makeKeyframe('scale', 0, from, this.defaultEasing),
      makeKeyframe('scale', durationMs, to, this.defaultEasing),
      makeKeyframe('opacity', 0, direction === 'enter' ? 0 : 1, this.defaultEasing),
      makeKeyframe('opacity', durationMs, direction === 'enter' ? 1 : 0, this.defaultEasing),
    ];
  },
};

/** Elastic pop: scale from 0 to 1 with elastic easing */
export const presetElasticPop: AnimationPreset = {
  id: 'elastic-pop',
  name: 'Elastic Pop',
  category: 'both',
  defaultDurationMs: 600,
  defaultEasing: 'elastic.out',
  generateKeyframes(direction, durationMs = 600) {
    const from = direction === 'enter' ? 0 : 1;
    const to = direction === 'enter' ? 1 : 0;
    return [
      makeKeyframe('scale', 0, from, this.defaultEasing),
      makeKeyframe('scale', durationMs, to, this.defaultEasing),
      makeKeyframe('opacity', 0, direction === 'enter' ? 0 : 1, this.defaultEasing),
      makeKeyframe('opacity', durationMs, direction === 'enter' ? 1 : 0, this.defaultEasing),
    ];
  },
};

/** Spin in: rotation from -180 to 0, scale from 0 to 1 */
export const presetSpinIn: AnimationPreset = {
  id: 'spin-in',
  name: 'Spin In',
  category: 'both',
  defaultDurationMs: 500,
  defaultEasing: 'back.out',
  generateKeyframes(direction, durationMs = 500) {
    const fromRot = direction === 'enter' ? -180 : 0;
    const toRot = direction === 'enter' ? 0 : 180;
    return [
      makeKeyframe('rotation', 0, fromRot, this.defaultEasing),
      makeKeyframe('rotation', durationMs, toRot, this.defaultEasing),
      makeKeyframe('scale', 0, direction === 'enter' ? 0 : 1, this.defaultEasing),
      makeKeyframe('scale', durationMs, direction === 'enter' ? 1 : 0, this.defaultEasing),
      makeKeyframe('opacity', 0, direction === 'enter' ? 0 : 1, this.defaultEasing),
      makeKeyframe('opacity', durationMs, direction === 'enter' ? 1 : 0, this.defaultEasing),
    ];
  },
};

/** Drop in: y from -100 to 0 with bounce easing */
export const presetDropIn: AnimationPreset = {
  id: 'drop-in',
  name: 'Drop In',
  category: 'both',
  defaultDurationMs: 500,
  defaultEasing: 'bounce.out',
  generateKeyframes(direction, durationMs = 500) {
    const from = direction === 'enter' ? -100 : 0;
    const to = direction === 'enter' ? 0 : 100;
    return [
      makeKeyframe('y', 0, from, this.defaultEasing),
      makeKeyframe('y', durationMs, to, this.defaultEasing),
      makeKeyframe('opacity', 0, direction === 'enter' ? 0 : 1, this.defaultEasing),
      makeKeyframe('opacity', durationMs, direction === 'enter' ? 1 : 0, this.defaultEasing),
    ];
  },
};

/** Blur reveal: opacity from 0 to 1 (blur handled by CSS filter in renderer) */
export const presetBlurReveal: AnimationPreset = {
  id: 'blur-reveal',
  name: 'Blur Reveal',
  category: 'both',
  defaultDurationMs: 400,
  defaultEasing: 'power2.out',
  generateKeyframes(direction, durationMs = 400) {
    return [
      makeKeyframe(
        'opacity',
        0,
        direction === 'enter' ? 0 : 1,
        this.defaultEasing,
      ),
      makeKeyframe(
        'opacity',
        durationMs,
        direction === 'enter' ? 1 : 0,
        this.defaultEasing,
      ),
    ];
  },
};

/** Slide & Scale: x from -50 to 0, scale from 0.8 to 1 */
export const presetSlideScale: AnimationPreset = {
  id: 'slide-scale',
  name: 'Slide & Scale',
  category: 'both',
  defaultDurationMs: 400,
  defaultEasing: 'power2.out',
  generateKeyframes(direction, durationMs = 400) {
    const sign = direction === 'enter' ? 1 : -1;
    const xFrom = -50 * sign;
    const xTo = 0;
    const sFrom = direction === 'enter' ? 0.8 : 1;
    const sTo = direction === 'enter' ? 1 : 0.8;
    return [
      makeKeyframe('x', 0, xFrom, this.defaultEasing),
      makeKeyframe('x', durationMs, xTo, this.defaultEasing),
      makeKeyframe('scale', 0, sFrom, this.defaultEasing),
      makeKeyframe('scale', durationMs, sTo, this.defaultEasing),
      makeKeyframe('opacity', 0, direction === 'enter' ? 0 : 1, this.defaultEasing),
      makeKeyframe('opacity', durationMs, direction === 'enter' ? 1 : 0, this.defaultEasing),
    ];
  },
};

/** Wipe left: x from 100 to 0, opacity from 0 to 1 */
export const presetWipeLeft: AnimationPreset = {
  id: 'wipe-left',
  name: 'Wipe Left',
  category: 'both',
  defaultDurationMs: 350,
  defaultEasing: 'power3.out',
  generateKeyframes(direction, durationMs = 350) {
    const sign = direction === 'enter' ? 1 : -1;
    return [
      makeKeyframe('x', 0, 100 * sign, this.defaultEasing),
      makeKeyframe('x', durationMs, 0, this.defaultEasing),
      makeKeyframe('opacity', 0, direction === 'enter' ? 0 : 1, this.defaultEasing),
      makeKeyframe('opacity', durationMs, direction === 'enter' ? 1 : 0, this.defaultEasing),
    ];
  },
};

// ── Preset Registry ──────────────────────────────────────────────────────────

/** All available animation presets, indexed by id for fast lookup. */
export const ANIMATION_PRESETS: Record<string, AnimationPreset> = {
  'fly-in-left': presetFlyInLeft,
  'fly-in-right': presetFlyInRight,
  'fly-in-up': presetFlyInUp,
  'fly-in-down': presetFlyInDown,
  'zoom-in': presetZoomIn,
  'fade': presetFade,
  'bounce-in': presetBounceIn,
  'elastic-pop': presetElasticPop,
  'spin-in': presetSpinIn,
  'drop-in': presetDropIn,
  'blur-reveal': presetBlurReveal,
  'slide-scale': presetSlideScale,
  'wipe-left': presetWipeLeft,
};

/**
 * Map legacy `StudioCompositionTransitionType` to a preset id.
 * This allows existing clips with the old animation type to use the new
 * preset system transparently.
 */
export function transitionTypeToPresetId(
  type: string,
): string | null {
  switch (type) {
    case 'fade':
      return 'fade';
    case 'slide-left':
      return 'fly-in-left';
    case 'slide-right':
      return 'fly-in-right';
    case 'slide-up':
      return 'fly-in-up';
    case 'slide-down':
      return 'fly-in-down';
    case 'scale':
      return 'zoom-in';
    case 'blur':
      return 'blur-reveal';
    case 'none':
    default:
      return null;
  }
}

/**
 * Generate keyframes from a legacy `StudioCompositionTransitionType`.
 * Falls back to the preset system for a smooth migration path.
 */
export function generateKeyframesFromType(
  type: string,
  direction: 'enter' | 'exit',
  durationMs: number,
): ClipKeyframe[] | null {
  const presetId = transitionTypeToPresetId(type);
  if (!presetId) return null;
  const preset = ANIMATION_PRESETS[presetId];
  if (!preset) return null;
  return preset.generateKeyframes(direction, durationMs);
}
