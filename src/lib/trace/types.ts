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
  | 'ry'
  | 'x1'
  | 'y1'
  | 'x2'
  | 'y2'
  | 'points'
  | 'pathProgress'
  /** Position along `motionPathData` (percent). Split from `pathProgress` in v2. */
  | 'motionPathProgress'
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
  /**
   * Animation that owns these keyframes. Absent on v1 documents;
   * `migrateTraceDocument` fills it with the default animation id.
   */
  animationId?: string;
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
 * A mutable editing view of one artboard.
 *
 * Ops, lint, storyboard and the templates edit a stage, never the document: the
 * document owns artboards and animations, and `withStage` writes an edited
 * stage back. The fields deliberately match the v1 root shape so every helper
 * written against it kept working when the element graph moved into artboards.
 */
export interface TraceStage {
  /** Stable id for a not-yet-persisted document built from this stage. */
  id?: string;
  /** Artboard this stage projects. */
  artboardId: string;
  /** Animation whose tracks are being authored. */
  animationId: string;
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
  project: TraceDocument;
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

/* ── Document v2 ─────────────────────────────────────────────────────────────
 *
 * A v2 document nests element graphs inside artboards and named clips inside
 * those artboards, so one project can hold several animations and share a
 * storyboard across them.
 *
 * `TraceProject` above is the v1 single-timeline document and stays in place
 * while the editor is still v1. `migrateTraceDocument` converts v1 to v2 and
 * returns `TraceDocument`; the editor switches its stored type to
 * `TraceDocument` in a later step, at which point `TraceProject` is deleted.
 * The two shapes share every field name, so that switch is mechanical.
 */

export type TraceAnimationLoop = 'none' | 'loop' | 'pingpong';

/** A named clip: the unit a timeline plays and a state machine will reference. */
export interface TraceAnimation {
  id: string;
  name: string;
  durationMs: number;
  loop: TraceAnimationLoop;
  /** Playback multiplier used by the runtime; 1 = authored speed. */
  speed?: number;
  /** Reserved: names a state machine can listen for while this animation plays. */
  events?: string[];
}

/** One element graph with its own size, paint defs and animations. */
export interface TraceArtboard {
  id: string;
  name: string;
  width: number;
  height: number;
  background?: string;
  elements: Record<string, TraceElement>;
  rootElementIds: string[];
  defs?: string;
  gradients?: Record<string, TraceGradient>;
  animations: TraceAnimation[];
  animationOrder: string[];
  defaultAnimationId: string;
  /** Reserved: set when this artboard is a reusable component definition. */
  componentId?: string;
}

export interface TraceDocument {
  id: string;
  schemaVersion: 2;
  name: string;
  /** Program/publish size; normally the first artboard's size. */
  width: number;
  height: number;
  /** Program duration; see `programDurationOf`. */
  durationMs: number;
  fps: number;
  artboards: Record<string, TraceArtboard>;
  artboardOrder: string[];
  activeArtboardId: string;
  storyboard?: TraceStoryboard;
  audioTracks?: AudioTrack[];
  /** Document-level defs, merged after each artboard's own defs. */
  defs?: string;

  // Reserved for later phases. Persisted and round-tripped from v2.0 onward;
  // never evaluated until the phase that owns them lands.
  inputs?: TraceInput[];
  stateMachines?: TraceStateMachine[];
  viewModels?: TraceViewModel[];
  bindings?: TraceBinding[];
  components?: Record<string, TraceComponent>;
}

/** The contract between design and engineering. Phase 1 owns the behaviour. */
export interface TraceInput {
  id: string;
  name: string;
  type: 'bool' | 'number' | 'trigger';
  defaultValue: boolean | number;
}

/** Reserved for Phase 1 state machines; only the identity is committed here. */
export interface TraceStateMachine {
  id: string;
  name: string;
}

/** Reserved for Phase 2 data binding; only the identity is committed here. */
export interface TraceViewModel {
  id: string;
  name: string;
}

/** Reserved for Phase 2 data binding; only the identity is committed here. */
export interface TraceBinding {
  id: string;
}

/** Reserved for Phase 3 nested artboards. */
export interface TraceComponent {
  id: string;
  artboardId: string;
}

/** Anything that carries an element graph: a document or one artboard view. */
export type TraceSource = TraceDocument | TraceStage;

/** Stage data as authored before ids are assigned (templates, v1 fixtures). */
export type TraceStageInput = Omit<TraceStage, 'artboardId' | 'animationId'> &
  Partial<Pick<TraceStage, 'artboardId' | 'animationId'>>;
