import { stageOf, stageOrNull } from '@/lib/trace/document';
/**
 * stores/trace/slices/tracks-slice.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Keyframe authoring. Every action compiles to a `setTrack` / `deleteTrack` op,
 * so history, the copilot and external callers all see the same document edits.
 */

import {
  baseValueForProperty,
  defaultValueForProperty,
} from '@/lib/trace/elements/registry';
import type {
  AnimatableProperty,
  EasingType,
  Keyframe,
  PropertyTrack,
} from '@/lib/trace/types';

import { keyframeId, trackId } from './document-slice';
import type { TraceSliceCreator, TraceTrackActions } from './types';

function sortKeyframes(keyframes: Keyframe[]): Keyframe[] {
  return [...keyframes].sort((a, b) => a.timeMs - b.timeMs);
}

function toOpKeyframes(keyframes: Keyframe[]) {
  return keyframes.map((keyframe) => ({
    id: keyframe.id,
    timeMs: keyframe.timeMs,
    value: keyframe.value,
    easing: keyframe.easing,
  }));
}

export const createTracksSlice: TraceSliceCreator<TraceTrackActions> = (
  set,
  get,
) => ({
  addPropertyTrack: (elementId, property: AnimatableProperty) => {
    const state = get();
    const element = stageOrNull(state.project)?.elements[elementId];
    if (!element) return null;
    if (element.tracks.some((track) => track.property === property))
      return null;

    const id = keyframeId();
    const track: PropertyTrack = {
      id: trackId(property),
      property,
      label: property,
      keyframes: [
        {
          id,
          timeMs: state.playback.currentTimeMs,
          value: defaultValueForProperty(element, property),
          easing: 'power2.out',
        },
      ],
    };

    const result = state.dispatch([
      {
        type: 'setTrack',
        elementId,
        property,
        trackId: track.id,
        label: property,
        keyframes: toOpKeyframes(track.keyframes),
      },
    ]);
    if (!result?.ok) return null;

    const selection = get().selection;
    if (!selection.expandedElementIds.includes(elementId)) {
      set((current) => ({
        selection: {
          ...current.selection,
          expandedElementIds: [
            ...current.selection.expandedElementIds,
            elementId,
          ],
        },
      }));
    }
    return id;
  },

  removePropertyTrack: (elementId, property) => {
    get().dispatch([{ type: 'deleteTrack', elementId, property }]);
  },

  togglePropertyTrack: (elementId, property) => {
    const element = stageOrNull(get().project)?.elements[elementId];
    if (!element) return;
    if (element.tracks.some((track) => track.property === property)) {
      get().removePropertyTrack(elementId, property);
    } else {
      get().addPropertyTrack(elementId, property);
    }
  },

  addKeyframe: (elementId, property, timeMs, value, easing = 'power2.out') => {
    const state = get();
    const element = stageOrNull(state.project)?.elements[elementId];
    if (!element) return null;

    const at = timeMs ?? state.playback.currentTimeMs;
    const track = element.tracks.find((entry) => entry.property === property);
    const resolvedValue =
      value ??
      (track
        ? baseValueForProperty(element, property)
        : baseValueForProperty(element, property));
    const id = keyframeId();

    const keyframes = track
      ? sortKeyframes([
          ...track.keyframes.filter(
            (keyframe) => Math.abs(keyframe.timeMs - at) > 10,
          ),
          { id, timeMs: at, value: resolvedValue, easing },
        ])
      : [{ id, timeMs: at, value: resolvedValue, easing }];

    const result = state.dispatch([
      {
        type: 'setTrack',
        elementId,
        property,
        trackId: track?.id,
        label: track?.label ?? property,
        keyframes: toOpKeyframes(keyframes),
      },
    ]);
    return result?.ok ? id : null;
  },

  updateKeyframe: (elementId, property, keyframeToUpdate, updates) => {
    const element = stageOrNull(get().project)?.elements[elementId];
    const track = element?.tracks.find((entry) => entry.property === property);
    if (!track) return;

    const keyframes = sortKeyframes(
      track.keyframes.map((keyframe) =>
        keyframe.id === keyframeToUpdate
          ? {
              ...keyframe,
              ...(updates.timeMs !== undefined
                ? { timeMs: updates.timeMs }
                : {}),
              ...(updates.value !== undefined ? { value: updates.value } : {}),
              ...(updates.easing !== undefined
                ? { easing: updates.easing }
                : {}),
            }
          : keyframe,
      ),
    );

    get().dispatch([
      {
        type: 'setTrack',
        elementId,
        property,
        trackId: track.id,
        label: track.label,
        keyframes: toOpKeyframes(keyframes),
      },
    ]);
  },

  deleteKeyframe: (elementId, property, keyframeToDelete) => {
    const element = stageOrNull(get().project)?.elements[elementId];
    const track = element?.tracks.find((entry) => entry.property === property);
    if (!track) return;

    const keyframes = track.keyframes.filter(
      (keyframe) => keyframe.id !== keyframeToDelete,
    );
    if (keyframes.length === 0) {
      get().removePropertyTrack(elementId, property);
      return;
    }

    get().dispatch([
      {
        type: 'setTrack',
        elementId,
        property,
        trackId: track.id,
        label: track.label,
        keyframes: toOpKeyframes(keyframes),
      },
    ]);
    set((state) => ({
      selection: {
        ...state.selection,
        selectedKeyframeIds: state.selection.selectedKeyframeIds.filter(
          (key) => !key.endsWith(`:${keyframeToDelete}`),
        ),
      },
    }));
  },
});

export type { AnimatableProperty, EasingType };
