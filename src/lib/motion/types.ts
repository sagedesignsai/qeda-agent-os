/**
 * lib/motion/types.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The Motion document, as data.
 *
 * Deliberately free of React, Electron, DOM and WebGL: everything in
 * `lib/motion` must be runnable in jest/jsdom, which has no WebGL context. That
 * is why the schema lives here rather than next to any renderer.
 *
 * Time is stored in **seconds** everywhere, never frames. `fps` is a project
 * setting applied only at render/UI boundaries — animation math that depends on
 * frame rate cannot be re-rendered at a different frame rate, and this product
 * exists to render frame-exact video.
 *
 * Clips are a reusable library (`document.timeline.clips`) referenced by
 * placements on tracks, not inlined. The original spec requires clips to stay
 * independently editable; inlining would duplicate keyframes per interaction.
 */

export const MOTION_SCHEMA_VERSION = 3;

// ── Easing ───────────────────────────────────────────────────────────────────

/**
 * Easing belongs to the **outgoing** keyframe: it governs the segment from this
 * keyframe to the next one. That matches timeline editors' mental model (drag a
 * keyframe's handle forward) and keeps sampling a single pass.
 */
export type MotionEasing =
  | { type: 'linear' }
  | { type: 'step' }
  | { type: 'cubic'; x1: number; y1: number; x2: number; y2: number };

// ── Keyframes & channels ─────────────────────────────────────────────────────

export type MotionKeyframe = {
  id: string;
  /** Seconds on the clip's own local timeline. */
  time: number;
  value: number;
  easing: MotionEasing;
};

/**
 * Dotted path into a node's animatable state (`position.x`, `opacity`,
 * `material.emissiveIntensity`). A plain string on purpose: the node registry
 * declares which paths a node type supports, so adding animatable state is a
 * registration rather than a schema change.
 */
export type MotionPropertyPath = string;

/** One property of one node, keyframed. */
export type MotionChannel = {
  id: string;
  /** Node id in the document scene graph. */
  targetId: string;
  property: MotionPropertyPath;
  /** Sorted ascending by `time`; maintained by the ops, asserted in tests. */
  keyframes: MotionKeyframe[];
};

// ── Clips & placement ────────────────────────────────────────────────────────

export type MotionClip = {
  id: string;
  name: string;
  /** Local length in seconds. Independent of where it is placed. */
  duration: number;
  channels: MotionChannel[];
};

export type MotionClipPlacement = {
  id: string;
  clipId: string;
  /** Seconds on the document timeline. */
  start: number;
};

export type MotionTrack = {
  id: string;
  name: string;
  /** Node the track is scoped to, when it is scoped to one. */
  targetId: string | null;
  muted: boolean;
  locked: boolean;
  placements: MotionClipPlacement[];
};

export type MotionLoop = {
  enabled: boolean;
  start: number;
  end: number;
};

export type MotionTimeline = {
  duration: number;
  loop: MotionLoop;
  tracks: MotionTrack[];
  clips: MotionClip[];
};

// ── Document ─────────────────────────────────────────────────────────────────

export type MotionOutputSettings = {
  fps: number;
  width: number;
  height: number;
};

export type MotionVector3 = [number, number, number];

export type MotionNodeTransform = {
  position: MotionVector3;
  rotation: MotionVector3;
  scale: MotionVector3;
};

/** Persistent, renderer-independent scene object. */
export type MotionNode = {
  id: string;
  type: string;
  name: string;
  parentId: string | null;
  visible: boolean;
  locked: boolean;
  transform: MotionNodeTransform;
  props: Record<string, unknown>;
};

export type MotionAsset = {
  id: string;
  name: string;
  kind: 'image' | 'image-sequence';
  mimeType: string;
  frameCount: number;
  fps: number;
  uri?: string;
};

export type MotionMeta = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  output: MotionOutputSettings;
};

export type MotionDocument = {
  schemaVersion: number;
  meta: MotionMeta;
  assets: MotionAsset[];
  scene: {
    nodes: MotionNode[];
  };
  timeline: MotionTimeline;
};

// ── Editor state (never persisted) ───────────────────────────────────────────

/**
 * Selection in Motion's own terms. The timeline kit has its own flat selection
 * bag; `lib/motion/timeline-adapter.ts` translates between them so neither side
 * has to know the other's shape.
 */
export type MotionSelection =
  | { kind: 'track'; trackId: string }
  | { kind: 'placement'; trackId: string; placementId: string }
  | {
      kind: 'keyframe';
      trackId: string;
      placementId: string;
      clipId: string;
      channelId: string;
      keyframeId: string;
    }
  | null;

/** Stable key for sampled values: one property of one node. */
export function channelKey(targetId: string, property: MotionPropertyPath): string {
  return `${targetId}\u0000${property}`;
}

export function findClip(doc: MotionDocument, clipId: string): MotionClip | undefined {
  return doc.timeline.clips.find((clip) => clip.id === clipId);
}

export function findTrack(doc: MotionDocument, trackId: string): MotionTrack | undefined {
  return doc.timeline.tracks.find((track) => track.id === trackId);
}
