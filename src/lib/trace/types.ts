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
  | 'zoom'
  | 'rotation'
  | 'opacity'
  | 'fillOpacity'
  | 'strokeDashoffset'
  | 'strokeDasharray'
  | 'd'
  | 'strokeWidth'
  | 'fill'
  | 'stroke'
  | 'fontSize'
  | 'letterSpacing'
  | 'text'
  | 'width'
  | 'height'
  | 'rx'
  | 'ry'
  | 'x1'
  | 'y1'
  | 'x2'
  | 'y2'
  | 'points'
  | 'pathProgress'
  | 'trimStart'
  | 'trimEnd'
  | 'trimOffset'
  | 'filter';

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
  /**
   * Hold each keyframe until the next one instead of interpolating. Used by
   * recipes that must show exact values (a counter's text), where blending two
   * strings would erase and retype characters.
   */
  discrete?: boolean;
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
  | 'path'
  | 'rect'
  | 'circle'
  | 'ellipse'
  | 'line'
  | 'polyline'
  | 'polygon'
  | 'image'
  | 'use'
  | 'group'
  | 'text';

export type SceneTransition = 'cut' | 'fade' | 'slide';

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

/**
 * One spoken line in a narrated composition.
 *
 * `durationMs` is the MEASURED length of the generated voice asset — never an
 * estimate — and `startMs` is derived by `buildNarrationTiming`. Scenes and
 * keyframes are timed to these numbers; audio is never retimed to fit picture
 * ("voices before pictures").
 */
export interface TraceNarrationLine {
  id: string;
  text: string;
  /** Generated TTS asset id. `qeda-media://tts/<id>` resolves playback. */
  ttsAssetId?: string;
  /** Measured spoken duration, filled once the asset exists. */
  durationMs?: number;
  /** Absolute start on the project timeline, derived from measured audio. */
  startMs?: number;
  /** Storyboard scene this line belongs to. */
  sceneId?: string | null;
  /** Optional on-screen speaker label. */
  speaker?: string;
}

/** Narrated voiceover for a composition. Optional: most projects have none. */
export interface TraceNarration {
  /** TTS provider voice used for every line. Changing it invalidates the cache. */
  voiceId?: string;
  provider?: string;
  lines: TraceNarrationLine[];
}

/**
 * A 2D composition camera. It is screen-space framing over the element graph:
 * `x`/`y` name the canvas point that sits at the centre of the frame, `zoom`
 * is a multiplier (1 = 100%) and `rotation` is in degrees.
 *
 * Framing is animatable through the same property tracks as elements, limited
 * to x, y, zoom and rotation. Subtitles, scene backgrounds and the entrance
 * veil are screen-space and are never moved by the camera.
 */
export interface TraceCamera {
  x?: number;
  y?: number;
  zoom?: number;
  rotation?: number;
  tracks?: PropertyTrack[];
}

/**
 * A timestamped review note. Notes are the human review layer over the
 * composition: they point at a moment (and optionally a scene/layer), and the
 * copilot reads them before making changes. Resolution is a flag, never a
 * delete, so the history of what was asked stays intact.
 */
export interface TraceReviewNote {
  id: string;
  text: string;
  /** Project time the note refers to, in ms. */
  timeMs: number;
  sceneId?: string | null;
  elementId?: string | null;
  createdAt: string;
  resolved?: boolean;
}

/**
 * Project-level look tokens. They are authoring defaults, not a stylesheet:
 * blocks and the copilot use them when a value is not specified, and lint checks
 * motion taste against them. Existing layers are only restyled when the caller
 * explicitly applies the look.
 */
export interface TraceStylePalette {
  background?: string;
  surface?: string;
  text?: string;
  muted?: string;
  accent?: string;
  accentAlt?: string;
}

export interface TraceStyleFonts {
  heading?: string;
  body?: string;
}

export interface TraceStyleMotion {
  easing?: EasingType;
  durationMs?: number;
  staggerMs?: number;
}

export interface TraceStyle {
  /** Preset id this style came from, when it did. */
  lookId?: string;
  palette?: TraceStylePalette;
  fonts?: TraceStyleFonts;
  motion?: TraceStyleMotion;
}

import type { TraceFilter } from './filters/types';

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
  /** Editor-authored SVG filters, keyed by id. Serialized into `defs` on every mutation. */
  filters?: Record<string, TraceFilter>;
  audioTracks?: AudioTrack[];
  /** Optional storyboard metadata. Legacy projects are migrated on load. */
  storyboard?: TraceStoryboard;
  /** Optional spoken narration; scenes are timed to its measured durations. */
  narration?: TraceNarration;
  /** Optional 2D camera framing; absent means the full artboard is the frame. */
  camera?: TraceCamera;
  /** Optional project look: palette, fonts and motion defaults for new work. */
  style?: TraceStyle;
  /** Timestamped review notes; the copilot reads these before editing. */
  reviewNotes?: TraceReviewNote[];
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
