import type { AnimatableProperty, EasingType } from './types';
import type { TraceProject } from './types';

export type SvgAnimationMotion = 'custom' | 'flicker' | 'sway' | 'pulse' | 'reveal';
export type SvgAnimationPlayback = 'auto' | 'once' | 'loop';
export type SvgAnimationProperty =
  | 'x' | 'y' | 'scaleX' | 'scaleY' | 'rotation' | 'opacity'
  | 'fillOpacity' | 'fill' | 'stroke' | 'strokeWidth'
  | 'strokeDashoffset' | 'strokeDasharray' | 'd' | 'width' | 'height' | 'rx';

export interface SvgAnimationRequest {
  project: TraceProject;
  targetElementId: string;
  durationMs: number;
  intensity: number;
  motion: SvgAnimationMotion;
  playback: SvgAnimationPlayback;
  prompt?: string;
}

export interface TraceAnimationPlan {
  summary: string;
  playback: Exclude<SvgAnimationPlayback, 'auto'>;
  durationMs: number;
  warnings?: string[];
  visualReview?: { performed: boolean; notes: string };
  tracks: Array<{
    elementId: string;
    property: SvgAnimationProperty & AnimatableProperty;
    keyframes: Array<{ timeMs: number; value: number | string; easing: EasingType }>;
  }>;
}
