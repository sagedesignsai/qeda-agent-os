/**
 * hooks/use-timeline-store.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * High-performance decoupled timeline state store.
 *
 * Implements:
 *   - Isolated playhead subscription (zero React re-renders for tracks/clips during 60fps playback)
 *   - Non-destructive clip splitting & in/out trimming with source offsets
 *   - Magnetic snapping calculation
 *   - Track muting, locking, and visibility toggles
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useSyncExternalStore } from 'react';
import type {
  TimelineTrack,
  TimelineClip,
  TrackType,
} from '@/lib/studio-types';

export type TimelineTool = 'select' | 'blade';

function sortTracksForTimeline(tracks: TimelineTrack[]): TimelineTrack[] {
  const rank: Record<TrackType, number> = {
    effects: 0,
    captions: 1,
    transitions: 2,
    overlays: 3,
    video: 4,
    audio: 5,
  };
  return [...tracks].sort((a, b) => {
    const typeOrder = rank[a.type] - rank[b.type];
    if (typeOrder !== 0) return typeOrder;
    if (a.type === 'video') {
      // Project video lanes sit above the legacy recording lane in the UI;
      // the compositor paints the row order bottom-to-top.
      return Number(a.id === 'track-video') - Number(b.id === 'track-video');
    }
    return 0;
  });
}

export interface TimelineState {
  currentTimeMs: number;
  durationMs: number;
  isPlaying: boolean;
  playbackRate: number;
  zoomPxPerMs: number; // Pixels per millisecond (e.g. 0.08 = 80px/s)
  scrollTimeMs: number; // Viewport horizontal start in ms
  activeTool: TimelineTool;
  snappingEnabled: boolean;
  selectedClipId: string | null;
  snapLineMs: number | null; // Active magnetic guide indicator
  tracks: TimelineTrack[];
  isMultiTrack: boolean; // true when take.tracks is defined (multi-track model)
}

export type TimelineListener = () => void;

class TimelineStore {
  private state: TimelineState = {
    currentTimeMs: 0,
    durationMs: 10000,
    isPlaying: false,
    playbackRate: 1.0,
    zoomPxPerMs: 0.075, // Default ~75px per second
    scrollTimeMs: 0,
    activeTool: 'select',
    snappingEnabled: true,
    selectedClipId: null,
    snapLineMs: null,
    tracks: [],
    isMultiTrack: false,
  };

  private listeners = new Set<TimelineListener>();
  private timeListeners = new Set<(timeMs: number) => void>();
  private trackChangeListeners = new Set<(tracks: TimelineTrack[]) => void>();

  // Undo / Redo history stacks (max 50 states)
  private undoStack: TimelineTrack[][] = [];
  private redoStack: TimelineTrack[][] = [];

  getState = (): TimelineState => {
    return this.state;
  };

  subscribe = (listener: TimelineListener) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  // High-frequency subscription strictly for the playhead / timecode
  subscribeTime = (listener: (timeMs: number) => void) => {
    this.timeListeners.add(listener);
    return () => {
      this.timeListeners.delete(listener);
    };
  };

  // Track change subscription strictly for domain take sync (persisting zooms, captions, cuts)
  subscribeTracks = (listener: (tracks: TimelineTrack[]) => void) => {
    this.trackChangeListeners.add(listener);
    return () => {
      this.trackChangeListeners.delete(listener);
    };
  };

  private notify() {
    this.listeners.forEach((l) => l());
  }

  private notifyTime(timeMs: number) {
    this.timeListeners.forEach((l) => l(timeMs));
  }

  private notifyTracks(tracks: TimelineTrack[]) {
    this.trackChangeListeners.forEach((l) => l(tracks));
  }

  // ── Undo / Redo Management ────────────────────────────────────────────────

  recordSnapshot = () => {
    try {
      const snapshot: TimelineTrack[] = JSON.parse(
        JSON.stringify(this.state.tracks),
      );
      this.undoStack.push(snapshot);
      if (this.undoStack.length > 50) {
        this.undoStack.shift();
      }
      this.redoStack = [];
      this.notify();
    } catch {
      // Ignore
    }
  };

  commitTrackChange = () => {
    this.notifyTracks(this.state.tracks);
  };

  canUndo = (): boolean => this.undoStack.length > 0;
  canRedo = (): boolean => this.redoStack.length > 0;

  undo = () => {
    if (this.undoStack.length === 0) return;
    try {
      const currentSnapshot: TimelineTrack[] = JSON.parse(
        JSON.stringify(this.state.tracks),
      );
      this.redoStack.push(currentSnapshot);
      const previousTracks = this.undoStack.pop()!;
      this.state = {
        ...this.state,
        tracks: previousTracks,
        selectedClipId: null,
      };
      this.notify();
      this.notifyTracks(previousTracks);
    } catch {
      // Ignore
    }
  };

  redo = () => {
    if (this.redoStack.length === 0) return;
    try {
      const currentSnapshot: TimelineTrack[] = JSON.parse(
        JSON.stringify(this.state.tracks),
      );
      this.undoStack.push(currentSnapshot);
      const nextTracks = this.redoStack.pop()!;
      this.state = {
        ...this.state,
        tracks: nextTracks,
        selectedClipId: null,
      };
      this.notify();
      this.notifyTracks(nextTracks);
    } catch {
      // Ignore
    }
  };

  // ── High Frequency Time Updates (Bypasses general React re-renders) ───────

  seek = (timeMs: number, triggerGeneralNotify = false) => {
    const clamped = Math.max(0, Math.min(this.state.durationMs, timeMs));
    this.state.currentTimeMs = clamped;
    this.notifyTime(clamped);
    if (triggerGeneralNotify) {
      this.notify();
    }
  };

  setPlaying = (isPlaying: boolean) => {
    if (this.state.isPlaying === isPlaying) return;
    this.state = { ...this.state, isPlaying };
    this.notify();
  };

  setPlaybackRate = (rate: number) => {
    this.state = { ...this.state, playbackRate: rate };
    this.notify();
  };

  // ── Zoom & Viewport ───────────────────────────────────────────────────────

  setZoomPxPerMs = (pxPerMs: number) => {
    const clamped = Math.max(0.015, Math.min(0.6, pxPerMs)); // 15px/s to 600px/s
    this.state = { ...this.state, zoomPxPerMs: clamped };
    this.notify();
  };

  setScrollTimeMs = (scrollTimeMs: number) => {
    const clamped = Math.max(0, Math.min(this.state.durationMs, scrollTimeMs));
    // Scrolling emits far more events than frames; an unchanged value must not
    // notify subscribers, or every event re-renders the timeline tree.
    if (this.state.scrollTimeMs === clamped) return;
    this.state = { ...this.state, scrollTimeMs: clamped };
    this.notify();
  };

  // ── Tools & Snapping ──────────────────────────────────────────────────────

  setActiveTool = (activeTool: TimelineTool) => {
    this.state = { ...this.state, activeTool };
    this.notify();
  };

  toggleSnapping = () => {
    this.state = {
      ...this.state,
      snappingEnabled: !this.state.snappingEnabled,
    };
    this.notify();
  };

  setSnapLine = (snapLineMs: number | null) => {
    // Pointer moves report the same guide repeatedly; notifying on an
    // unchanged value re-renders every subscriber for no visual change.
    if (this.state.snapLineMs === snapLineMs) return;
    this.state.snapLineMs = snapLineMs;
    this.notify();
  };

  setSelectedClipId = (selectedClipId: string | null) => {
    if (this.state.selectedClipId === selectedClipId) return;
    this.state = { ...this.state, selectedClipId };
    this.notify();
  };

  // ── Load Tracks ───────────────────────────────────────────────────────────

  setTracksAndDuration = (
    tracks: TimelineTrack[],
    durationMs: number,
    resetHistory = true,
    isMultiTrack = false,
  ) => {
    this.state = {
      ...this.state,
      tracks,
      durationMs: Math.max(durationMs, 1000),
      isMultiTrack,
    };
    if (resetHistory) {
      this.undoStack = [];
      this.redoStack = [];
    }
    this.notify();
  };

  // ── Track Header Toggles ──────────────────────────────────────────────────

  toggleTrackLock = (trackId: string) => {
    if (!this.state.tracks.some((track) => track.id === trackId)) return;
    this.recordSnapshot();
    this.state = {
      ...this.state,
      tracks: this.state.tracks.map((t) =>
        t.id === trackId ? { ...t, locked: !t.locked } : t,
      ),
    };
    this.notify();
    this.commitTrackChange();
  };

  toggleTrackVisibility = (trackId: string) => {
    if (!this.state.tracks.some((track) => track.id === trackId)) return;
    this.recordSnapshot();
    this.state = {
      ...this.state,
      tracks: this.state.tracks.map((t) =>
        t.id === trackId ? { ...t, visible: !t.visible } : t,
      ),
    };
    this.notify();
    this.commitTrackChange();
  };

  toggleTrackMute = (trackId: string) => {
    if (!this.state.tracks.some((track) => track.id === trackId)) return;
    this.recordSnapshot();
    this.state = {
      ...this.state,
      tracks: this.state.tracks.map((t) =>
        t.id === trackId ? { ...t, muted: !t.muted } : t,
      ),
    };
    this.notify();
    this.commitTrackChange();
  };

  addTrack = (type: 'video' | 'audio') => {
    const matchingTracks = this.state.tracks.filter((track) => track.type === type);
    const suffix = matchingTracks.length + 1;
    const track: TimelineTrack = {
      id: `layer-${type}-${Math.random().toString(36).slice(2, 9)}`,
      type,
      name: `${type === 'video' ? 'Video' : 'Audio'} ${suffix}`,
      locked: false,
      visible: true,
      muted: false,
      clips: [],
    };
    this.recordSnapshot();
    const tracks = [...this.state.tracks];
    if (type === 'video') {
      const firstVideoIndex = tracks.findIndex((candidate) => candidate.type === 'video');
      if (firstVideoIndex >= 0) tracks.splice(firstVideoIndex, 0, track);
      else tracks.push(track);
    } else {
      tracks.push(track);
    }
    this.state = {
      ...this.state,
      isMultiTrack: true,
      tracks: sortTracksForTimeline(tracks),
    };
    this.notify();
    this.commitTrackChange();
    return track;
  };

  // ── Clip Operations (Slicing, Trimming, Moving) ────────────────────────────

  splitClipAt = (trackId: string, clipId: string, splitTimeMs: number) => {
    const track = this.state.tracks.find((t) => t.id === trackId);
    if (!track || track.locked) return false;

    const clipIndex = track.clips.findIndex((c) => c.id === clipId);
    if (clipIndex === -1) return false;

    const target = track.clips[clipIndex];
    if (
      splitTimeMs <= target.startMs + 200 ||
      splitTimeMs >= target.startMs + target.durationMs - 200
    ) {
      return false; // Minimum slice threshold 200ms
    }

    const firstDuration = splitTimeMs - target.startMs;
    const secondDuration = target.durationMs - firstDuration;
    const secondSourceStart = target.sourceStartMs + firstDuration;

    const firstClip: TimelineClip = {
      ...target,
      durationMs: firstDuration,
      sourceDurationMs: firstDuration,
    };

    const secondClip: TimelineClip = {
      ...target,
      id: `${target.id}-split-${Date.now().toString(36)}`,
      name: `${target.name} (Part 2)`,
      startMs: splitTimeMs,
      durationMs: secondDuration,
      sourceStartMs: secondSourceStart,
      sourceDurationMs: secondDuration,
    };

    const updatedClips = [...track.clips];
    updatedClips.splice(clipIndex, 1, firstClip, secondClip);

    this.recordSnapshot();
    this.state = {
      ...this.state,
      tracks: this.state.tracks.map((t) =>
        t.id === trackId ? { ...t, clips: updatedClips } : t,
      ),
      selectedClipId: secondClip.id,
    };
    this.notify();
    this.commitTrackChange();
    return true;
  };

  splitAtPlayhead = () => {
    const playheadMs = this.state.currentTimeMs;
    let didSplit = false;

    // Find unlocked clips intersecting the playhead
    for (const track of this.state.tracks) {
      if (track.locked || !track.visible) continue;
      const intersectingClip = track.clips.find(
        (c) =>
          playheadMs > c.startMs + 200 &&
          playheadMs < c.startMs + c.durationMs - 200,
      );
      if (intersectingClip) {
        this.splitClipAt(track.id, intersectingClip.id, playheadMs);
        didSplit = true;
      }
    }
    return didSplit;
  };

  trimClip = (
    trackId: string,
    clipId: string,
    edge: 'start' | 'end',
    newEdgeMs: number,
  ) => {
    const track = this.state.tracks.find((t) => t.id === trackId);
    if (!track || track.locked) return;

    const clip = track.clips.find((c) => c.id === clipId);
    if (!clip) return;

    let updatedClip: TimelineClip;

    if (edge === 'start') {
      const clampedStart = Math.min(
        newEdgeMs,
        clip.startMs + clip.durationMs - 300,
      );
      const delta = clampedStart - clip.startMs;
      updatedClip = {
        ...clip,
        startMs: clampedStart,
        durationMs: clip.durationMs - delta,
        sourceStartMs: clip.sourceStartMs + delta,
        // Rate is 1:1, so the source span always mirrors the timeline span.
        // `extractCutsFromTracks` reads this to know which recording range a
        // clip still covers — a stale value would invent a cut.
        sourceDurationMs: clip.durationMs - delta,
      };
    } else {
      const clampedEnd = Math.max(newEdgeMs, clip.startMs + 300);
      updatedClip = {
        ...clip,
        durationMs: clampedEnd - clip.startMs,
        sourceDurationMs: clampedEnd - clip.startMs,
      };
    }

    this.state = {
      ...this.state,
      tracks: this.state.tracks.map((t) =>
        t.id === trackId
          ? {
              ...t,
              clips: t.clips.map((c) => (c.id === clipId ? updatedClip : c)),
            }
          : t,
      ),
    };
    this.notify();
  };

  moveClip = (trackId: string, clipId: string, newStartMs: number) => {
    const track = this.state.tracks.find((t) => t.id === trackId);
    if (!track || track.locked) return;

    // The legacy recording lane maps source gaps to cuts. Independent video
    // tracks are free to move without changing the recorded source.
    if (!this.state.isMultiTrack && track.id === 'track-video') return;

    const clampedStart = Math.max(0, newStartMs);

    this.state = {
      ...this.state,
      tracks: this.state.tracks.map((t) =>
        t.id === trackId
          ? {
              ...t,
              clips: t.clips.map((c) =>
                c.id === clipId ? { ...c, startMs: clampedStart } : c,
              ),
            }
          : t,
      ),
    };
    this.notify();
  };

  deleteSelectedClip = () => {
    const selectedId = this.state.selectedClipId;
    if (!selectedId) return;

    this.recordSnapshot();
    this.state = {
      ...this.state,
      selectedClipId: null,
      tracks: this.state.tracks.map((t) => ({
        ...t,
        clips: t.clips.filter((c) => c.id !== selectedId),
      })),
    };
    this.notify();
    this.commitTrackChange();
  };

  duplicateSelectedClip = () => {
    const selectedId = this.state.selectedClipId;
    if (!selectedId) return null;

    const found = this.findClip(selectedId);
    if (!found || found.track.locked) return null;

    const duplicate: TimelineClip = {
      ...found.clip,
      id: `clip-${Math.random().toString(36).slice(2, 9)}`,
      trackId: found.track.id,
      name: `${found.clip.name} copy`,
      startMs: found.clip.startMs + found.clip.durationMs,
      payload: found.clip.payload ? { ...found.clip.payload } : undefined,
    };
    const duplicateEnd = duplicate.startMs + duplicate.durationMs;

    this.recordSnapshot();
    this.state = {
      ...this.state,
      durationMs: Math.max(this.state.durationMs, duplicateEnd + 1000),
      selectedClipId: duplicate.id,
      tracks: this.state.tracks.map((track) =>
        track.id === found.track.id
          ? {
              ...track,
              clips: [...track.clips, duplicate].sort(
                (a, b) => a.startMs - b.startMs,
              ),
            }
          : track,
      ),
    };
    this.notify();
    this.commitTrackChange();
    return duplicate;
  };

  findClip = (
    clipId: string,
  ): { track: TimelineTrack; clip: TimelineClip } | null => {
    for (const track of this.state.tracks) {
      const clip = track.clips.find((c) => c.id === clipId);
      if (clip) {
        return { track, clip };
      }
    }
    return null;
  };

  updateClip = (
    clipId: string,
    patch: Partial<TimelineClip>,
    trackId?: string,
    options: { snapshot?: boolean; commit?: boolean } = {},
  ) => {
    const { snapshot = true, commit = true } = options;
    let targetTrackId = trackId;
    if (!targetTrackId) {
      const found = this.findClip(clipId);
      if (!found) return;
      targetTrackId = found.track.id;
    }

    if (snapshot) this.recordSnapshot();
    this.state = {
      ...this.state,
      tracks: this.state.tracks.map((t) =>
        t.id === targetTrackId
          ? {
              ...t,
              clips: t.clips.map((c) =>
                c.id === clipId
                  ? {
                      ...c,
                      ...patch,
                      payload:
                        c.payload || patch.payload
                          ? {
                              ...(c.payload || {}),
                              ...(patch.payload || {}),
                            }
                          : undefined,
                    }
                  : c,
              ),
            }
          : t,
      ),
    };
    this.notify();
    if (commit) this.commitTrackChange();
  };

  addClip = (
    trackType: TrackType,
    clipData: {
      name: string;
      durationMs: number;
      startMs?: number;
      color?: string;
      payload?: TimelineClip['payload'];
      targetTrackId?: string;
    },
  ): TimelineClip => {
    const wantsLayerTrack = this.state.isMultiTrack;
    let track = this.state.tracks.find((t) => t.id === clipData.targetTrackId && t.type === trackType && !t.locked) ?? this.state.tracks.find((t) =>
      t.type === trackType && !t.locked && (!wantsLayerTrack || !t.id.startsWith('track-')),
    );
    if (!track) {
      const newTrack: TimelineTrack = {
        id: this.state.isMultiTrack
          ? `layer-${trackType}-${Math.random().toString(36).slice(2, 9)}`
          : `track-${trackType}`,
        type: trackType,
        name:
          trackType === 'effects'
            ? 'Effects'
            : trackType === 'captions'
              ? 'Text & Captions'
              : trackType === 'video'
                ? `Video ${this.state.tracks.filter((candidate) => candidate.type === 'video').length + 1}`
                : trackType === 'audio'
                  ? `Audio ${this.state.tracks.filter((candidate) => candidate.type === 'audio').length + 1}`
                  : trackType === 'transitions'
                    ? 'Transitions'
                    : 'Overlays',
        locked: false,
        visible: true,
        clips: [],
      };
      this.state = {
        ...this.state,
        tracks: sortTracksForTimeline([...this.state.tracks, newTrack]),
      };
      track = newTrack;
    }

    const selected = this.state.selectedClipId
      ? this.findClip(this.state.selectedClipId)
      : null;
    const transitionTarget = trackType === 'transitions'
      ? selected?.track.type === 'video'
        ? selected.clip
        : this.state.tracks
            .filter((candidate) => candidate.type === 'video')
            .flatMap((candidate) => candidate.clips)
            .sort((a, b) =>
              Math.abs(a.startMs - this.state.currentTimeMs) -
              Math.abs(b.startMs - this.state.currentTimeMs),
            )[0]
      : undefined;
    const transitionSide = clipData.payload?.transitionSide ?? 'in';
    const transitionDuration = transitionTarget
      ? Math.min(clipData.durationMs, transitionTarget.durationMs)
      : clipData.durationMs;
    const startMs = transitionTarget
      ? transitionSide === 'in'
        ? transitionTarget.startMs
        : transitionTarget.startMs + transitionTarget.durationMs - transitionDuration
      : clipData.startMs !== undefined
        ? clipData.startMs
        : this.state.currentTimeMs;

    const newClip: TimelineClip = {
      id: `clip-${Math.random().toString(36).slice(2, 9)}`,
      trackId: track.id,
      name: clipData.name,
      startMs: Math.max(0, startMs),
      durationMs: transitionTarget ? transitionDuration : clipData.durationMs,
      sourceStartMs: 0,
      sourceDurationMs: transitionTarget ? transitionDuration : clipData.durationMs,
      color: clipData.color,
      payload: {
        ...clipData.payload,
        ...(transitionTarget ? { targetClipId: transitionTarget.id } : {}),
      },
    };

    const clipEnd = newClip.startMs + newClip.durationMs;
    const newDuration = Math.max(this.state.durationMs, clipEnd + 1000);

    this.recordSnapshot();
    this.state = {
      ...this.state,
      durationMs: newDuration,
      selectedClipId: newClip.id,
      tracks: this.state.tracks.map((t) =>
        t.id === track.id
          ? {
              ...t,
              clips: [...t.clips, newClip].sort(
                (a, b) => a.startMs - b.startMs,
              ),
            }
          : t,
      ),
    };

    this.notify();
    this.commitTrackChange();
    return newClip;
  };
}

export const timelineStore = new TimelineStore();

// ── React Hooks ─────────────────────────────────────────────────────────────

export function useTimelineState(): TimelineState {
  return useSyncExternalStore(timelineStore.subscribe, timelineStore.getState);
}

export function useTimelineTracks(): TimelineTrack[] {
  const state = useTimelineState();
  return state.tracks;
}

export function useTimelineTools() {
  const state = useTimelineState();

  return {
    activeTool: state.activeTool,
    snappingEnabled: state.snappingEnabled,
    zoomPxPerMs: state.zoomPxPerMs,
    selectedClipId: state.selectedClipId,
    canUndo: timelineStore.canUndo(),
    canRedo: timelineStore.canRedo(),
    setActiveTool: timelineStore.setActiveTool,
    toggleSnapping: timelineStore.toggleSnapping,
    setZoomPxPerMs: timelineStore.setZoomPxPerMs,
    splitAtPlayhead: timelineStore.splitAtPlayhead,
    deleteSelectedClip: timelineStore.deleteSelectedClip,
    duplicateSelectedClip: timelineStore.duplicateSelectedClip,
    updateClip: timelineStore.updateClip,
    undo: timelineStore.undo,
    redo: timelineStore.redo,
  };
}

export function useSelectedClip(): {
  track: TimelineTrack;
  clip: TimelineClip;
} | null {
  const state = useTimelineState();
  if (!state.selectedClipId) return null;
  for (const track of state.tracks) {
    const clip = track.clips.find((c) => c.id === state.selectedClipId);
    if (clip) return { track, clip };
  }
  return null;
}
