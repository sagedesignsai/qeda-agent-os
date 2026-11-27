/**
 * lib/trace/ops/types.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Semantic document operations for Nova Trace.
 *
 * Ops are the single mutation contract shared by the in-app copilot, the HTTP
 * API and the IPC layer. They are pure data: no DOM, no database, no random
 * ids unless the caller omits one.
 *
 * Adapted from sagedesigns-os lib/motion/ops/types.ts.
 */

import type {
  AnimatableProperty,
  AudioTrack,
  EasingType,
  TraceElement,
  TraceNarration,
  TraceProject,
  TraceScene,
  TraceStoryboard,
  Point,
  PropertyTrack,
  SceneTransition,
} from '../types';
import type { TraceAssetFragment } from '../assets/types';
import type { Diagnostic, LintOptions } from '../lint/types';
import type { TraceElementSpec } from './elements';

export * from './elements';

/** One keyframe in an op. Ids are generated when omitted. */
export interface OpKeyframe {
  id?: string;
  timeMs: number;
  value: number | string;
  easing?: EasingType;
}

export interface TraceProjectSnapshot {
  width: number;
  height: number;
  durationMs: number;
  fps: number;
  elements: Record<string, TraceElement>;
  rootElementIds: string[];
  storyboard?: TraceStoryboard;
  defs?: string;
  gradients?: TraceProject['gradients'];
  filters?: TraceProject['filters'];
  audioTracks?: AudioTrack[];
  narration?: TraceNarration;
  camera?: TraceProject['camera'];
  style?: TraceProject['style'];
  reviewNotes?: TraceProject['reviewNotes'];
}

/**
 * Semantic document operations.
 *
 * Ops are pure data: no DOM, no database, no random ids unless the caller omits one.
 */
export type TraceOp =
  | {
      type: 'setCanvas';
      width?: number;
      height?: number;
      durationMs?: number;
      fps?: number;
    }
  | { type: 'addElement'; element: TraceElementSpec }
  | {
      type: 'updateElement';
      id: string;
      name?: string;
      visible?: boolean;
      locked?: boolean;
      /** `null` clears the scene assignment. */
      sceneId?: string | null;
      /** Shallow merge. `null` deletes an attribute. */
      attributes?: Record<string, unknown>;
      origin?: Point;
    }
  | { type: 'deleteElement'; id: string }
  | {
      type: 'duplicateElement';
      id: string;
      newId?: string;
      name?: string;
      offset?: Point;
    }
  | {
      type: 'reorderElement';
      id: string;
      /** Named move. Ignored when `index` is provided. */
      to?: 'front' | 'back' | 'forward' | 'backward';
      /**
       * Absolute slot in the destination sibling list, in paint order
       * (bottom = 0). Index is measured after the element is removed.
       */
      index?: number;
    }
  | {
      type: 'reparentElement';
      id: string;
      /** `null` moves the element to the artboard root. */
      parentId: string | null;
      /** Paint-order slot in the new parent. Defaults to the top. */
      index?: number;
    }
  | {
      type: 'groupElements';
      elementIds: string[];
      groupId?: string;
      name?: string;
      /** Rotation/scale pivot in the group's local space. */
      origin?: Point;
    }
  | { type: 'ungroupElement'; id: string }
  | { type: 'setElementScene'; id: string; sceneId: string | null }
  | {
      type: 'setTrack';
      elementId: string;
      property: AnimatableProperty;
      keyframes: OpKeyframe[];
      label?: string;
      /** Reuse an existing track id instead of generating one. */
      trackId?: string;
      /**
       * Hold each keyframe until the next instead of interpolating. Omit to
       * keep the existing track's setting.
       */
      discrete?: boolean;
    }
  | { type: 'deleteTrack'; elementId: string; property: AnimatableProperty }
  | {
      type: 'applyPose';
      rootId: string;
      /** Bone role -> rotation in degrees. */
      rotations: Partial<Record<string, number>>;
      timeMs?: number;
    }
  | {
      type: 'setBoneRotation';
      boneId: string;
      rotation: number;
      timeMs: number;
      easing?: EasingType;
    }
  | {
      type: 'addScene';
      name?: string;
      durationMs?: number;
      intent?: string;
      transitionIn?: SceneTransition;
      background?: string;
      afterSceneId?: string;
    }
  | {
      type: 'updateScene';
      id: string;
      name?: string;
      /** `null` clears the director note. */
      intent?: string | null;
      durationMs?: number;
      transitionIn?: SceneTransition;
      /** `null` restores the project's default background. */
      background?: string | null;
    }
  | { type: 'removeScene'; id: string }
  | { type: 'reorderScene'; id: string; index: number }
  | { type: 'setActiveScene'; id: string }
  | {
      type: 'insertFragment';
      fragment: TraceAssetFragment;
      name?: string;
      /** Defaults to the active scene. `null` leaves the fragment scene-less. */
      sceneId?: string | null;
      groupId?: string;
      suffix?: string;
      /** Paint order for the inserted roots. Backgrounds insert at the back. */
      position?: 'front' | 'back';
    }
  | {
      type: 'applyRecipe';
      recipeId: string;
      name?: string;
      x?: number;
      y?: number;
      sceneId?: string | null;
      options?: Record<string, any>;
    }
  | { type: 'setDefs'; defs: string }
  | { type: 'setFilters'; filters: TraceProject['filters'] }
  | { type: 'setAudio'; tracks: AudioTrack[] }
  /** Replace the spoken narration (lines, measured durations, scene assignment). */
  | { type: 'setNarration'; narration: TraceNarration }
  /**
   * Set scene durations and re-lay the storyboard out contiguously from 0.
   * Used by the narration timing builder: voices decide scene length, and the
   * storyboard invariant (contiguous, array order) is preserved atomically.
   */
  | { type: 'setSceneDurations'; durations: Record<string, number> }
  /**
   * Set or clear the composition camera. `null` restores the full-artboard
   * framing. Camera tracks animate x, y, zoom and rotation only.
   */
  | { type: 'setCamera'; camera: TraceProject['camera'] | null }
  /**
   * Set or clear the project look tokens. `null` removes the style; existing
   * layers are not restyled by this op (see `applyLookToElements`).
   */
  | { type: 'setStyle'; style: TraceProject['style'] | null }
  /**
   * Replace the review-note list. `null` clears it. Notes are timestamped and
   * resolved by flag, never deleted implicitly.
   */
  | { type: 'setReviewNotes'; notes: TraceProject['reviewNotes'] | null }
  /**
   * Replaces document state from a snapshot. Used to express the inverse of a
   * batch; agents should not need to call this directly.
   */
  | { type: 'restore'; snapshot: TraceProjectSnapshot };

export interface TraceOpDiff {
  added: string[];
  updated: string[];
  removed: string[];
  scenes: {
    added: string[];
    updated: string[];
    removed: string[];
  };
  /** Canvas fields (size/duration/fps) changed. */
  canvasChanged?: boolean;
  /** The narration block changed. Optional so older diff producers stay valid. */
  narrationChanged?: boolean;
  /** The camera block changed. Optional so older diff producers stay valid. */
  cameraChanged?: boolean;
  /** The style/look tokens changed. Optional so older diff producers stay valid. */
  styleChanged?: boolean;
  /** Review notes changed. Optional so older diff producers stay valid. */
  notesChanged?: boolean;
}

export interface TraceApplyOpsOptions {
  /** Include a single `restore` op that undoes the whole batch. */
  includeInverse?: boolean;
  /** Passed through to the linter that runs after the batch. */
  lintOptions?: LintOptions;
}

export interface TraceApplyOpsResult {
  /** False when an op failed or the resulting project has lint errors. */
  ok: boolean;
  project: TraceProject;
  /** Number of ops that ran. A failed batch runs zero. */
  applied: number;
  diff: TraceOpDiff;
  /** Root ids created by applyRecipe ops, in op order. */
  recipeRootIds: string[];
  diagnostics: Diagnostic[];
  inverse: TraceOp[];
}

export class TraceOpError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'TraceOpError';
    this.code = code;
  }
}

export type { PropertyTrack, TraceScene };
