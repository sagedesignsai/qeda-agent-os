/**
 * lib/trace/runtime/gsap-compiler.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Compiles a Trace document into a hardware-accelerated GSAP master timeline.
 *
 * GSAP is used as the *clock*, not as the property writer: the timeline spans the
 * project duration with a linear virtual tween, and its `onUpdate` drives the
 * direct DOM renderer. That keeps a single evaluation path (the same one used by
 * scrubbing, exports and tests) instead of two subtly different animation
 * engines.
 *
 * Adapted from sagedesigns-os lib/motion/runtime/gsap-compiler.ts.
 */

import { gsap } from 'gsap';

import { evaluateEasing } from '../animation/easing';
import type { AnimatableProperty, EasingType, TraceProject } from '../types';

export interface GsapCompileOptions {
  onUpdate?: (progress: number, timeMs: number) => void;
  onComplete?: () => void;
  onReverseComplete?: () => void;
  autoPlay?: boolean;
  loop?: boolean;
}

export interface CompiledTraceTimeline {
  timeline: gsap.core.Timeline;
  destroy: () => void;
}

/** Maps a Trace easing identifier to a GSAP easing string (or evaluator). */
export function mapEasingToGsap(
  easing: EasingType,
): string | ((t: number) => number) {
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
    case 'expo.inOut':
      return 'expo.inOut';
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
        return (t: number) => evaluateEasing(easing, t);
      }
      return easing || 'power2.out';
  }
}

/** Maps an animatable property to a GSAP target key. */
export function mapPropertyToGsap(property: AnimatableProperty): string {
  switch (property) {
    case 'fill':
    case 'stroke':
    case 'opacity':
    case 'fillOpacity':
    case 'strokeWidth':
    case 'strokeDashoffset':
    case 'strokeDasharray':
    case 'fontSize':
    case 'letterSpacing':
    case 'width':
    case 'height':
    case 'rx':
      return property;
    default:
      return property;
  }
}

/** Properties that must be written as SVG attributes rather than CSS. */
export const ATTRIBUTE_PROPERTIES: ReadonlySet<string> = new Set([
  'width',
  'height',
  'rx',
  'strokeDashoffset',
  'strokeDasharray',
  'strokeWidth',
  'stroke',
  'fill',
  'fillOpacity',
  'fontSize',
  'letterSpacing',
]);

/**
 * Compiles a declarative Trace project into a paused GSAP timeline clock.
 * Property playback itself is executed by `dom-renderer.ts`.
 */
export function compileProjectToGsap(
  project: TraceProject,
  options: GsapCompileOptions,
): CompiledTraceTimeline {
  const {
    onUpdate,
    onComplete,
    onReverseComplete,
    autoPlay = false,
    loop = false,
  } = options;
  const durationSec = Math.max(0.1, project.durationMs / 1000);

  const master = gsap.timeline({
    paused: !autoPlay,
    repeat: loop ? -1 : 0,
    onUpdate: () => {
      onUpdate?.(master.progress(), master.time() * 1000);
    },
    onComplete: () => {
      onComplete?.();
    },
    onReverseComplete: () => {
      onReverseComplete?.();
    },
  });

  // Virtual driver spanning the full duration with linear time progression.
  master.to({}, { duration: durationSec, ease: 'none' });

  return {
    timeline: master,
    destroy: () => {
      master.kill();
    },
  };
}
