/**
 * stores/trace/slices/types.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The Nova Trace editor store, split into slices.
 *
 * Document fields are top-level; transport and selection are nested so a panel
 * can subscribe to just the slice it cares about without re-rendering on every
 * playhead commit.
 */

import type { TraceApplyOpsResult, TraceOp } from '@/lib/trace/ops/types';
import type {
  AnimatableProperty,
  EasingType,
  SceneTransition,
  TraceProject,
} from '@/lib/trace/types';

export type TraceSaveState = 'idle' | 'saving' | 'saved' | 'error';

export type TracePlayback = {
  currentTimeMs: number;
  isPlaying: boolean;
  isLooping: boolean;
  /** Timeline scale, pixels per second. */
  zoomRatio: number;
  playbackSpeed: number;
  playbackDirection: 'forward' | 'reverse';
  autoKeyframe: boolean;
  isTimelineCollapsed: boolean;
};

export type TraceSelection = {
  selectedElementId: string | null;
  /** `elementId:trackId:keyframeId` */
  selectedKeyframeIds: string[];
  expandedElementIds: string[];
  collapsedElementIds: string[];
  activeSceneId: string | null;
  /** Element whose path anchors are being edited (double-click path). */
  editingPathElementId: string | null;
};

export type TraceDocumentState = {
  project: TraceProject | null;
  projectPath: string | null;
  revision: number;
  dirty: boolean;
  saveState: TraceSaveState;
  saveError: string | null;
};

export type TracePlaybackState = { playback: TracePlayback };
export type TraceSelectionState = { selection: TraceSelection };

export type TraceHistoryState = {
  past: TraceProject[];
  future: TraceProject[];
  canUndo: boolean;
  canRedo: boolean;
};

export type TraceDocumentActions = {
  loadProject: (
    project: TraceProject,
    options?: { path?: string | null; revision?: number },
  ) => void;
  closeProject: () => void;
  dispatch: (ops: TraceOp[]) => TraceApplyOpsResult | null;
  updateAttributes: (elementId: string, patch: Record<string, unknown>) => void;
  updateTransform: (
    elementId: string,
    transform: {
      x: number;
      y: number;
      rotation: number;
      scaleX: number;
      scaleY: number;
    },
    origin?: { x: number; y: number },
  ) => void;
  setCanvas: (patch: {
    width?: number;
    height?: number;
    durationMs?: number;
    fps?: number;
  }) => void;
  markSaving: () => void;
  markSaved: (revision: number) => void;
  markSaveFailed: (message: string) => void;
  markDirty: () => void;
};

export type TracePlaybackActions = {
  setPlayhead: (timeMs: number, options?: { commit?: boolean }) => void;
  setPlaying: (playing: boolean) => void;
  togglePlay: () => void;
  setLooping: (looping: boolean) => void;
  setZoomRatio: (zoomRatio: number) => void;
  setPlaybackSpeed: (speed: number) => void;
  setPlaybackDirection: (direction: 'forward' | 'reverse') => void;
  setAutoKeyframe: (enabled: boolean) => void;
  setTimelineCollapsed: (collapsed: boolean) => void;
};

export type TraceSelectionActions = {
  selectElement: (elementId: string | null) => void;
  selectKeyframe: (keyframeKey: string | null, additive?: boolean) => void;
  toggleExpandElement: (elementId: string) => void;
  toggleCollapseElement: (elementId: string) => void;
  collapseAllElements: () => void;
  expandAllElements: () => void;
  setActiveScene: (sceneId: string) => void;
  startPathEdit: (elementId: string) => void;
  endPathEdit: () => void;
};

export type TraceTrackActions = {
  addPropertyTrack: (
    elementId: string,
    property: AnimatableProperty,
  ) => string | null;
  removePropertyTrack: (
    elementId: string,
    property: AnimatableProperty,
  ) => void;
  togglePropertyTrack: (
    elementId: string,
    property: AnimatableProperty,
  ) => void;
  addKeyframe: (
    elementId: string,
    property: AnimatableProperty,
    timeMs?: number,
    value?: number | string,
    easing?: EasingType,
  ) => string | null;
  updateKeyframe: (
    elementId: string,
    property: AnimatableProperty,
    keyframeId: string,
    updates: { timeMs?: number; value?: number | string; easing?: EasingType },
  ) => void;
  deleteKeyframe: (
    elementId: string,
    property: AnimatableProperty,
    keyframeId: string,
  ) => void;
};

export type TraceStoryboardActions = {
  addScene: (options?: {
    name?: string;
    durationMs?: number;
    intent?: string;
  }) => void;
  updateScene: (
    sceneId: string,
    patch: {
      name?: string;
      durationMs?: number;
      intent?: string;
      transitionIn?: SceneTransition;
    },
  ) => void;
  removeScene: (sceneId: string) => void;
  focusScene: (sceneId: string) => void;
};

export type TraceHistoryActions = {
  undo: () => void;
  redo: () => void;
  clearHistory: () => void;
};

export type TraceStoreState = TraceDocumentState &
  TracePlaybackState &
  TraceSelectionState &
  TraceHistoryState &
  TraceDocumentActions &
  TracePlaybackActions &
  TraceSelectionActions &
  TraceTrackActions &
  TraceStoryboardActions &
  TraceHistoryActions;

export type TraceStoreSet = {
  (
    partial:
      | Partial<TraceStoreState>
      | ((
          state: TraceStoreState,
        ) => Partial<TraceStoreState> | TraceStoreState),
    replace?: false,
  ): void;
  (state: TraceStoreState, replace: true): void;
};

export type TraceStoreApi = {
  setState: TraceStoreSet;
  getState: () => TraceStoreState;
  subscribe: (
    listener: (state: TraceStoreState, previous: TraceStoreState) => void,
  ) => () => void;
};

export type TraceSliceCreator<T> = (
  set: TraceStoreSet,
  get: () => TraceStoreState,
  api: TraceStoreApi,
) => T;
