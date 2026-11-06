/**
 * lib/trace/types.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The Trace vector motion document, as data.
 *
 * Deliberately free of React, Electron, DOM and WebGL: everything in
 * `lib/trace` must be runnable in jest/jsdom, which has no WebGL context. That
 * is why the schema lives here rather than next to any renderer.
 *
 * Adapted from the sagedesigns-os Motion system for Nova Trace — a 2D vector
 * motion graphics workspace.
 */

export type EasingType =
  | 'linear'
  | 'ease'
  | 'ease-in'
  | 'ease-out'
  | 'ease-in-out'
  | 'back.out'
  | 'back.inOut'
  | 'elastic.out'
  | 'bounce.out'
  | string; // custom cubic-bezier: cubic-bezier(x1, y1, x2, y2)

export type AnimatableProperty =
  | 'x'
  | 'y'
  | 'scaleX'
  | 'scaleY'
  | 'rotation'
  | 'opacity'
  | 'fillOpacity'
  | 'strokeDashoffset'
  | 'strokeDasharray'
  | 'strokeWidth'
  | 'fill'
  | 'stroke'
  | 'fontSize'
  | 'letterSpacing'
  | 'text'
  | 'width'
  | 'height'
  | 'rx'
  | 'counterValue'
  | 'progress'
  | 'revealProgress'
  | 'pathProgress'
  | 'trimStart'
  | 'trimEnd'
  | 'trimOffset'
  | 'morphProgress'
  | 'boxShadow'
  | 'backgroundColor'
  | 'borderColor'
  | 'color'
  | 'borderRadius';

export interface Keyframe<T = number | string> {
  id: string;
  timeMs: number;
  value: T;
  easing: EasingType;
}

export interface PropertyTrack {
  id: string;
  property: AnimatableProperty;
  label: string;
  keyframes: Keyframe[];
}

export interface Point {
  x: number;
  y: number;
}

export interface BarChartItem {
  id: string;
  label: string;
  value: number;
  color?: string;
}

export type FillPaintType = 'none' | 'solid' | 'linear' | 'radial';

export interface GradientStop {
  id: string;
  offset: number; // 0..1
  color: string; // CSS color (hex, rgb(), named)
  opacity: number; // 0..1
}

export interface TraceGradient {
  id: string;
  type: 'linear' | 'radial';
  stops: GradientStop[];
  // Linear
  angle: number; // degrees, 0 = left-to-right
  // Radial
  cx: number; // 0..1
  cy: number; // 0..1
  r: number; // 0..1
}
export type TraceElementType =
  | 'shape'
  | 'path'
  | 'rect'
  | 'circle'
  | 'group'
  | 'text'
  | 'polygon'
  | 'counter'
  | 'progress-ring'
  | 'bar-chart'
  | 'kinetic-text'
  | 'lower-third'
  | 'spline-tracer';

export type SceneTransition = 'cut' | 'fade' | 'slide';
export type KineticTextEffect =
  | 'typewriter'
  | 'blur-fade'
  | 'slide-up'
  | 'pop'
  | 'elastic-bounce'
  | 'flip-pop'
  | 'scramble'
  | 'glitch-jump';

/**
 * A storyboard scene is a contiguous time range inside a single
 * {@link TraceProject}. Scenes organise the timeline and give the director /
 * copilot a planning unit; they do not introduce a second element graph.
 */
export interface TraceScene {
  id: string;
  name: string;
  startMs: number;
  durationMs: number;
  /** Director note describing what should happen in this scene. */
  intent?: string;
  transitionIn?: SceneTransition;
  background?: string;
}

/** Attached source material used to plan a storyboard (image, copy, URL). */
export interface TraceSourceRef {
  id: string;
  kind: 'image' | 'text' | 'url' | 'asset';
  label?: string;
  url?: string;
  assetId?: string;
  text?: string;
  note?: string;
}

export interface TraceStoryboard {
  logline?: string;
  scenes: TraceScene[];
  activeSceneId?: string;
  sourceRefs?: TraceSourceRef[];
}

export interface TraceElement {
  id: string;
  name: string;
  type: TraceElementType;
  visible: boolean;
  locked: boolean;
  /** Storyboard scene this element belongs to (or null for global). */
  sceneId?: string | null;
  /** Base position/transform before animation tracks are applied. */
  attributes: Record<string, any>;
  /** Anchor/origin for rotation & scaling (normalized percentage or absolute canvas px) */
  origin: Point;
  // Property tracks for animation
  tracks: PropertyTrack[];
  // Hierarchy
  parentId?: string | null;
  childrenIds?: string[];
}

export interface AudioTrack {
  id: string;
  name: string;
  url: string; // Data URI (base64) or media URL
  durationMs: number;
  startTimeMs: number;
  volume: number; // 0 to 1
  muted?: boolean;
  waveform?: number[]; // Array of peak values normalized 0..1 for rendering
  type?: 'music' | 'sfx' | 'voiceover';
}

export interface TraceProject {
  id: string;
  name: string;
  width: number;
  height: number;
  durationMs: number;
  fps: number;
  elements: Record<string, TraceElement>;
  rootElementIds: string[];
  defs?: string;
  /** Editor-authored gradients, keyed by id. Serialized into `defs` on every mutation. */
  gradients?: Record<string, TraceGradient>;
  audioTracks?: AudioTrack[];
  /** Optional storyboard metadata. Legacy projects are migrated on load. */
  storyboard?: TraceStoryboard;
}

export type TraceEmbedPlacement = 'inline' | 'hero' | 'sidebar';

export interface TraceEmbedOption {
  id: string;
  name: string;
  slug: string;
  publishedVersion: number | null;
  posterUrl: string | null;
  durationMs: number;
  width: number;
  height: number;
}

export interface TraceEmbedSummary {
  id: string;
  traceProjectId: string;
  name: string;
  slug: string;
  placement: TraceEmbedPlacement;
  caption: string | null;
  version: number;
  posterUrl: string | null;
  status: string;
}

/** Serialisable shape passed from the public blog page to the player. */
export interface PublishedTraceEmbed {
  id: string;
  traceProjectId: string;
  name: string;
  slug: string;
  placement: TraceEmbedPlacement;
  caption: string | null;
  version: number;
  posterUrl: string | null;
  project: TraceProject;
}

export interface TimelinePlaybackState {
  currentTimeMs: number;
  isPlaying: boolean;
  isLooping: boolean;
  zoomRatio: number; // pixels per second (e.g. 100px = 1s)
  autoKeyframe: boolean;
  selectedElementId: string | null;
  selectedKeyframeIds: string[]; // 'elementId:trackId:keyframeId'
  expandedElementIds: string[];
  playbackSpeed: number;
  playbackDirection?: 'forward' | 'reverse';
}

// Re-exported element sub-types for consumers
export type { TextElement, TextAttributes } from './elements/text/types';
export type {
  ShapeElement,
  ShapeAttributes,
  ShapeKind,
} from './elements/shape/types';
export type { PathElement, PathAttributes } from './elements/path/types';
export type { GroupElement, GroupAttributes } from './elements/group/types';
export type {
  SplineTracerElement,
  SplineTracerAttributes,
} from './elements/spline-tracer/types';
