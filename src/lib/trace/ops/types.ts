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
      intent?: string;
      durationMs?: number;
      transitionIn?: SceneTransition;
      background?: string;
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
