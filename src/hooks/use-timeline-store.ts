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
  TimelineItemType,
  StudioAnimationEasing,
} from '@/lib/studio-types';
import { inferTimelineItemType } from '@/lib/studio/timeline/item-type';
import { generateKeyframeId } from '@/lib/studio/keyframes';
import {
  moveTrackWithinType,
  sortTracksForTimeline,
} from '@/lib/studio/timeline/layers';
import { trackHasDetailLanes } from '@/lib/studio/timeline/rows';

export type TimelineTool = 'select' | 'blade';

function sourceUnitsPerTimelineMs(clip: TimelineClip): number {
  if (clip.itemType === 'image' || clip.payload?.kind === 'image') return 0;
  if (clip.durationMs > 0 && clip.sourceDurationMs > 0) {
    return clip.sourceDurationMs / clip.durationMs;
  }
  const speed = clip.payload?.speed ?? 1;
  return Number.isFinite(speed) && speed > 0 ? speed : 1;
}

function durationForTracks(tracks: readonly TimelineTrack[]): number {
  let durationMs = 1000;
  for (const track of tracks) {
    for (const clip of track.clips) {
      durationMs = Math.max(durationMs, clip.startMs + clip.durationMs);
    }
  }
  return durationMs;
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
  /** Multi-select set — kept in sync with selectedClipId for backward compat. */
  selectedClipIds: Set<string>;
  /** Currently focused track — only this track may show detail lanes. */
  selectedTrackId: string | null;
  snapLineMs: number | null; // Active magnetic guide indicator
  tracks: TimelineTrack[];
  isMultiTrack: boolean; // true when take.tracks is defined (multi-track model)
  /** Tracks whose animation/effect detail lanes are expanded. */
  expandedTrackIds: Set<string>;
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
    selectedClipIds: new Set(),
    selectedTrackId: null,
    snapLineMs: null,
    tracks: [],
    isMultiTrack: false,
    expandedTrackIds: new Set(),
  };

  private listeners = new Set<TimelineListener>();
  private timeListeners = new Set<(timeMs: number) => void>();
  private trackChangeListeners = new Set<(tracks: TimelineTrack[]) => void>();

  // Undo / Redo history stacks (max 50 states)
  private undoStack: Array<{
    tracks: TimelineTrack[];
    durationMs: number;
    isMultiTrack: boolean;
  }> = [];
  private redoStack: Array<{
    tracks: TimelineTrack[];
    durationMs: number;
    isMultiTrack: boolean;
  }> = [];
  private undoTransactionActive = false;
  private transactionSnapshotRecorded = false;
  private pendingTrackCommit = false;

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

  private alignCutTransitions(tracks: TimelineTrack[]): TimelineTrack[] {
    const videoClips = new Map<string, { track: TimelineTrack; clip: TimelineClip }>();
    for (const track of tracks) {
      if (track.type !== 'video') continue;
      for (const clip of track.clips) videoClips.set(clip.id, { track, clip });
    }

    let changed = false;
    const alignedTracks = tracks.map((track) => {
      if (track.type !== 'transitions') return track;
      const clips: TimelineClip[] = [];
      for (const transition of track.clips) {
        const fromId = transition.payload?.fromClipId;
        const toId = transition.payload?.toClipId;
        if (!fromId && !toId) {
          clips.push(transition);
          continue;
        }
        const from = fromId ? videoClips.get(fromId) : undefined;
        const to = toId ? videoClips.get(toId) : undefined;
        if (!from || !to || from.track.id !== to.track.id) {
          changed = true;
          continue;
        }
        const orderedClips = [...from.track.clips].sort((a, b) => a.startMs - b.startMs);
        const fromIndex = orderedClips.findIndex((clip) => clip.id === fromId);
        const cutMs = from.clip.startMs + from.clip.durationMs;
        if (
          fromIndex < 0 ||
          orderedClips[fromIndex + 1]?.id !== toId ||
          Math.abs(to.clip.startMs - cutMs) > 1
        ) {
          changed = true;
          continue;
        }

        const durationMs = Math.floor(Math.min(
          transition.durationMs,
          from.clip.durationMs,
          to.clip.durationMs,
          cutMs * 2,
        ));
        if (durationMs < 100) {
          changed = true;
          continue;
        }
        const startMs = cutMs - durationMs / 2;
        if (transition.startMs !== startMs || transition.durationMs !== durationMs) {
          changed = true;
          clips.push({ ...transition, startMs, durationMs });
        } else {
          clips.push(transition);
        }
      }
      return clips.length === track.clips.length && !changed
        ? track
        : { ...track, clips };
    });
    return changed ? alignedTracks : tracks;
  }

  // ── Undo / Redo Management ────────────────────────────────────────────────

  beginUndoTransaction = () => {
    if (this.undoTransactionActive) return;
    this.undoTransactionActive = true;
    this.transactionSnapshotRecorded = false;
    this.pendingTrackCommit = false;
  };

  endUndoTransaction = () => {
    if (!this.undoTransactionActive) return;
    const shouldCommitTracks = this.pendingTrackCommit;
    this.undoTransactionActive = false;
    this.transactionSnapshotRecorded = false;
    this.pendingTrackCommit = false;
    if (shouldCommitTracks) this.commitTrackChange();
  };

  recordSnapshot = () => {
    if (this.undoTransactionActive && this.transactionSnapshotRecorded) return;
    try {
      const snapshot = JSON.parse(
        JSON.stringify({
          tracks: this.state.tracks,
          durationMs: this.state.durationMs,
          isMultiTrack: this.state.isMultiTrack,
        }),
      ) as { tracks: TimelineTrack[]; durationMs: number; isMultiTrack: boolean };
      this.undoStack.push(snapshot);
      if (this.undoStack.length > 50) {
        this.undoStack.shift();
      }
      this.redoStack = [];
      if (this.undoTransactionActive) {
        this.transactionSnapshotRecorded = true;
      } else {
        this.notify();
      }
    } catch {
      // Ignore
    }
  };

  commitTrackChange = () => {
    const tracks = this.alignCutTransitions(this.state.tracks);
    if (tracks !== this.state.tracks) {
      this.state = { ...this.state, tracks };
      this.notify();
    }
    if (this.undoTransactionActive) {
      this.pendingTrackCommit = true;
      return;
    }
    this.notifyTracks(this.state.tracks);
  };

  canUndo = (): boolean => this.undoStack.length > 0;
  canRedo = (): boolean => this.redoStack.length > 0;

  undo = () => {
    if (this.undoStack.length === 0) return;
    try {
      const currentSnapshot = JSON.parse(
        JSON.stringify({
          tracks: this.state.tracks,
          durationMs: this.state.durationMs,
          isMultiTrack: this.state.isMultiTrack,
        }),
      ) as { tracks: TimelineTrack[]; durationMs: number; isMultiTrack: boolean };
      this.redoStack.push(currentSnapshot);
      const previous = this.undoStack.pop()!;
      const previousTimeMs = this.state.currentTimeMs;
      this.state = {
        ...this.state,
        tracks: previous.tracks,
        durationMs: previous.durationMs,
        isMultiTrack: previous.isMultiTrack,
        currentTimeMs: Math.min(this.state.currentTimeMs, previous.durationMs),
        scrollTimeMs: Math.min(this.state.scrollTimeMs, previous.durationMs),
        selectedClipId: null,
        selectedClipIds: new Set(),
      };
      this.notify();
      if (this.state.currentTimeMs !== previousTimeMs) {
        this.notifyTime(this.state.currentTimeMs);
      }
      this.notifyTracks(previous.tracks);
    } catch {
      // Ignore
    }
  };

  redo = () => {
    if (this.redoStack.length === 0) return;
    try {
      const currentSnapshot = JSON.parse(
        JSON.stringify({
          tracks: this.state.tracks,
          durationMs: this.state.durationMs,
          isMultiTrack: this.state.isMultiTrack,
        }),
      ) as { tracks: TimelineTrack[]; durationMs: number; isMultiTrack: boolean };
      this.undoStack.push(currentSnapshot);
      const next = this.redoStack.pop()!;
      const previousTimeMs = this.state.currentTimeMs;
      this.state = {
        ...this.state,
        tracks: next.tracks,
        durationMs: next.durationMs,
        isMultiTrack: next.isMultiTrack,
        currentTimeMs: Math.min(this.state.currentTimeMs, next.durationMs),
        scrollTimeMs: Math.min(this.state.scrollTimeMs, next.durationMs),
        selectedClipId: null,
        selectedClipIds: new Set(),
      };
      this.notify();
      if (this.state.currentTimeMs !== previousTimeMs) {
        this.notifyTime(this.state.currentTimeMs);
      }
      this.notifyTracks(next.tracks);
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

  // ── Collapsible Rows (selected track only) ────────────────────────────────

  private expandedOnlyFor(trackId: string | null): Set<string> {
    if (!trackId) return this.state.expandedTrackIds;
    const next = new Set<string>();
    if (this.state.expandedTrackIds.has(trackId)) next.add(trackId);
    return next;
  }

  setSelectedTrackId = (selectedTrackId: string | null) => {
    if (this.state.selectedTrackId === selectedTrackId) return;
    this.state = {
      ...this.state,
      selectedTrackId,
      expandedTrackIds: selectedTrackId
        ? this.expandedOnlyFor(selectedTrackId)
        : this.state.expandedTrackIds,
    };
    this.notify();
  };

  toggleTrackExpanded = (trackId: string) => {
    const isExpanded = this.state.expandedTrackIds.has(trackId);
    // Expansion is exclusive: selecting a track collapses every other lane set.
    this.state = {
      ...this.state,
      selectedTrackId: trackId,
      expandedTrackIds: isExpanded ? new Set() : new Set([trackId]),
    };
    this.notify();
  };

  setTrackExpanded = (trackId: string, expanded: boolean) => {
    if (expanded) {
      this.state = {
        ...this.state,
        selectedTrackId: trackId,
        expandedTrackIds: new Set([trackId]),
      };
      this.notify();
      return;
    }
    if (!this.state.expandedTrackIds.has(trackId)) return;
    const next = new Set(this.state.expandedTrackIds);
    next.delete(trackId);
    this.state = { ...this.state, expandedTrackIds: next };
    this.notify();
  };

  toggleSelectedTrackExpanded = () => {
    const trackId = this.state.selectedTrackId;
    if (!trackId) return;
    this.toggleTrackExpanded(trackId);
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

  private trackIdForClip(clipId: string | null): string | null {
    if (!clipId) return null;
    for (const track of this.state.tracks) {
      if (track.clips.some((clip) => clip.id === clipId)) return track.id;
    }
    return null;
  }

  setSelectedClipId = (selectedClipId: string | null) => {
    if (this.state.selectedClipId === selectedClipId) return;
    const ids = new Set<string>();
    if (selectedClipId) ids.add(selectedClipId);
    const selectedTrackId = this.trackIdForClip(selectedClipId) ?? this.state.selectedTrackId;
    this.state = {
      ...this.state,
      selectedClipId,
      selectedClipIds: ids,
      selectedTrackId,
      expandedTrackIds: selectedClipId ? this.expandedOnlyFor(selectedTrackId) : this.state.expandedTrackIds,
    };
    this.notify();
  };

  /** Toggle a clip in the multi-select set (Shift+Click behavior). */
  toggleSelectedClipId = (clipId: string) => {
    const ids = new Set(this.state.selectedClipIds);
    if (ids.has(clipId)) {
      ids.delete(clipId);
    } else {
      ids.add(clipId);
    }
    const selectedClipId = ids.size === 1 ? [...ids][0] : ids.size > 1 ? null : null;
    const firstId = ids.size ? [...ids][0] : null;
    const selectedTrackId = this.trackIdForClip(selectedClipId ?? firstId) ?? this.state.selectedTrackId;
    this.state = {
      ...this.state,
      selectedClipId,
      selectedClipIds: ids,
      selectedTrackId,
      expandedTrackIds: selectedTrackId ? this.expandedOnlyFor(selectedTrackId) : this.state.expandedTrackIds,
    };
    this.notify();
  };

  /** Set the multi-select set directly (drag-select behavior). */
  setSelectedClipIds = (ids: Set<string>) => {
    const selectedClipId = ids.size === 1 ? [...ids][0] : null;
    const firstId = ids.size ? [...ids][0] : null;
    const selectedTrackId = this.trackIdForClip(selectedClipId ?? firstId) ?? this.state.selectedTrackId;
    this.state = {
      ...this.state,
      selectedClipId,
      selectedClipIds: ids,
      selectedTrackId,
      expandedTrackIds: selectedTrackId ? this.expandedOnlyFor(selectedTrackId) : this.state.expandedTrackIds,
    };
    this.notify();
  };

  // ── Load Tracks ───────────────────────────────────────────────────────────

  setTracksAndDuration = (
    tracks: TimelineTrack[],
    durationMs: number,
    resetHistory = true,
    isMultiTrack = false,
  ) => {
    const normalizedTracks = this.alignCutTransitions(tracks);
    const nextDurationMs = Math.max(durationMs, durationForTracks(normalizedTracks));
    const previousTimeMs = this.state.currentTimeMs;
    const currentTimeMs = resetHistory
      ? 0
      : Math.min(previousTimeMs, nextDurationMs);
    this.state = {
      ...this.state,
      tracks: normalizedTracks,
      durationMs: nextDurationMs,
      currentTimeMs,
      scrollTimeMs: resetHistory
        ? 0
        : Math.min(this.state.scrollTimeMs, nextDurationMs),
      selectedClipId: resetHistory ? null : this.state.selectedClipId,
      selectedClipIds: resetHistory ? new Set() : this.state.selectedClipIds,
      selectedTrackId: resetHistory ? null : this.state.selectedTrackId,
      isMultiTrack,
      expandedTrackIds: resetHistory
        ? new Set()
        : this.state.expandedTrackIds,
    };
    if (resetHistory) {
      this.undoStack = [];
      this.redoStack = [];
    }
    this.notify();
    if (currentTimeMs !== previousTimeMs) this.notifyTime(currentTimeMs);
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

  /** Set the volume (0–1) for an audio track. */
  setTrackVolume = (trackId: string, volume: number) => {
    if (!this.state.tracks.some((track) => track.id === trackId)) return;
    this.recordSnapshot();
    const clamped = Math.max(0, Math.min(1, volume));
    this.state = {
      ...this.state,
      tracks: this.state.tracks.map((t) =>
        t.id === trackId ? { ...t, volume: clamped } : t,
      ),
    };
    this.notify();
    this.commitTrackChange();
  };

  /**
   * Move a track up (-1) or down (+1) among tracks of the same type.
   *
   * Row order is the compositing order (see `timeline/layers.ts`), so this is
   * the only way stacking changes. Returns false when the move is a no-op or
   * would cross a lane.
   */
  reorderTrack = (trackId: string, delta: number): boolean => {
    const next = moveTrackWithinType(this.state.tracks, trackId, delta);
    if (!next) return false;
    this.recordSnapshot();
    this.state = { ...this.state, tracks: next };
    this.notify();
    this.commitTrackChange();
    return true;
  };

  addTrack = (type: TrackType) => {
    const matchingTracks = this.state.tracks.filter((track) => track.type === type);
    const suffix = matchingTracks.length + 1;
    const trackLabel: Record<TrackType, string> = {
      video: 'Video',
      audio: 'Audio',
      effects: 'Effects',
      transitions: 'Transitions',
      captions: 'Text',
      overlays: 'Overlays',
    };
    const track: TimelineTrack = {
      id: `layer-${type}-${Math.random().toString(36).slice(2, 9)}`,
      type,
      name: `${trackLabel[type]} ${suffix}`,
      locked: false,
      visible: true,
      ...(type === 'audio' ? { muted: false } : {}),
      clips: [],
    };
    this.recordSnapshot();
    this.state = {
      ...this.state,
      isMultiTrack: true,
      tracks: sortTracksForTimeline([...this.state.tracks, track]),
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
    const sourceRate = sourceUnitsPerTimelineMs(target);
    const firstSourceDuration = firstDuration * sourceRate;
    const secondSourceDuration = secondDuration * sourceRate;
    const secondSourceStart = target.sourceStartMs + firstSourceDuration;

    const firstClip: TimelineClip = {
      ...target,
      durationMs: firstDuration,
      sourceDurationMs: firstSourceDuration,
    };

    const secondClip: TimelineClip = {
      ...target,
      id: `${target.id}-split-${Date.now().toString(36)}`,
      name: `${target.name} (Part 2)`,
      startMs: splitTimeMs,
      durationMs: secondDuration,
      sourceStartMs: secondSourceStart,
      sourceDurationMs: secondSourceDuration,
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
      const sourceRate = sourceUnitsPerTimelineMs(clip);
      updatedClip = {
        ...clip,
        startMs: clampedStart,
        durationMs: clip.durationMs - delta,
        sourceStartMs: clip.sourceStartMs + delta * sourceRate,
        // Preserve the clip's source-to-timeline rate while changing its trim.
        // `extractCutsFromTracks` reads this to know which recording range a
        // clip still covers — a stale value would invent a cut.
        sourceDurationMs: (clip.durationMs - delta) * sourceRate,
      };
    } else {
      const clampedEnd = Math.max(newEdgeMs, clip.startMs + 300);
      const sourceRate = sourceUnitsPerTimelineMs(clip);
      updatedClip = {
        ...clip,
        durationMs: clampedEnd - clip.startMs,
        sourceDurationMs: (clampedEnd - clip.startMs) * sourceRate,
      };
    }

    this.recordSnapshot();
    const tracks = this.state.tracks.map((t) =>
      t.id === trackId
        ? {
            ...t,
            clips: t.clips.map((c) => (c.id === clipId ? updatedClip : c)),
          }
        : t,
    );
    const alignedTracks = this.alignCutTransitions(tracks);
    const durationMs = durationForTracks(alignedTracks);
    const previousTimeMs = this.state.currentTimeMs;
    const currentTimeMs = Math.min(previousTimeMs, durationMs);
    this.state = {
      ...this.state,
      tracks: alignedTracks,
      durationMs,
      currentTimeMs,
      scrollTimeMs: Math.min(this.state.scrollTimeMs, durationMs),
    };
    this.notify();
    if (currentTimeMs !== previousTimeMs) this.notifyTime(currentTimeMs);
    this.commitTrackChange();
  };

  moveClip = (trackId: string, clipId: string, newStartMs: number) => {
    const track = this.state.tracks.find((t) => t.id === trackId);
    if (!track || track.locked) return;

    // The legacy recording lane maps source gaps to cuts. Independent video
    // tracks are free to move without changing the recorded source.
    if (!this.state.isMultiTrack && track.id === 'track-video') return;

    const clampedStart = Math.max(0, newStartMs);

    this.recordSnapshot();
    const tracks = this.state.tracks.map((t) =>
      t.id === trackId
        ? {
            ...t,
            clips: t.clips.map((c) =>
              c.id === clipId ? { ...c, startMs: clampedStart } : c,
            ),
          }
        : t,
    );
    const alignedTracks = this.alignCutTransitions(tracks);
    const durationMs = Math.max(this.state.durationMs, durationForTracks(alignedTracks));
    this.state = {
      ...this.state,
      tracks: alignedTracks,
      durationMs,
    };
    this.notify();
    this.commitTrackChange();
  };

  /**
   * Move a clip from one track to another. Validates track type compatibility.
   * Returns true if the move succeeded, false if rejected.
   */
  moveClipToTrack = (
    clipId: string,
    fromTrackId: string,
    toTrackId: string,
    newStartMs: number,
  ): boolean => {
    if (fromTrackId === toTrackId) {
      this.moveClip(fromTrackId, clipId, newStartMs);
      return true;
    }

    const fromTrack = this.state.tracks.find((t) => t.id === fromTrackId);
    const toTrack = this.state.tracks.find((t) => t.id === toTrackId);
    if (!fromTrack || !toTrack || toTrack.locked) return false;

    const clip = fromTrack.clips.find((c) => c.id === clipId);
    if (!clip) return false;

    // Validate track type compatibility
    const compatible = this.isTrackTypeCompatible(clip.itemType ?? 'video', toTrack.type);
    if (!compatible) return false;

    const clampedStart = Math.max(0, newStartMs);
    const movedClip: TimelineClip = {
      ...clip,
      trackId: toTrackId,
      startMs: clampedStart,
    };

    this.recordSnapshot();
    const tracks = this.state.tracks.map((t) => {
      if (t.id === fromTrackId) {
        return { ...t, clips: t.clips.filter((c) => c.id !== clipId) };
      }
      if (t.id === toTrackId) {
        return {
          ...t,
          clips: [...t.clips, movedClip].sort((a, b) => a.startMs - b.startMs),
        };
      }
      return t;
    });
    const alignedTracks = this.alignCutTransitions(tracks);
    const durationMs = Math.max(this.state.durationMs, durationForTracks(alignedTracks));
    this.state = {
      ...this.state,
      tracks: alignedTracks,
      durationMs,
    };
    this.notify();
    this.commitTrackChange();
    return true;
  };

  /** Check if a clip item type can be placed on a given track type. */
  isTrackTypeCompatible = (itemType: string, trackType: TrackType): boolean => {
    if (trackType === 'video') return itemType === 'video' || itemType === 'image';
    if (trackType === 'audio') return itemType === 'audio';
    if (trackType === 'effects') return itemType === 'effect';
    if (trackType === 'transitions') return itemType === 'transition';
    if (trackType === 'captions') return itemType === 'text';
    if (trackType === 'overlays') return itemType === 'overlay' || itemType === 'image';
    return true;
  };

  deleteSelectedClip = (ripple: boolean = false) => {
    const selectedIds = this.state.selectedClipIds;
    if (selectedIds.size === 0 && this.state.selectedClipId) {
      // Fallback to single selection for backward compat
      const id = this.state.selectedClipId;
      this.recordSnapshot();
      let tracks: TimelineTrack[];
      if (ripple) {
        tracks = this.rippleDeleteClipFromTracks(this.state.tracks, id);
      } else {
        tracks = this.state.tracks.map((t) => ({
          ...t,
          clips: t.clips.filter((c) => c.id !== id),
        }));
      }
      const durationMs = durationForTracks(tracks);
      const previousTimeMs = this.state.currentTimeMs;
      const currentTimeMs = Math.min(previousTimeMs, durationMs);
      this.state = {
        ...this.state,
        selectedClipId: null,
        selectedClipIds: new Set(),
        tracks,
        durationMs,
        currentTimeMs,
        scrollTimeMs: Math.min(this.state.scrollTimeMs, durationMs),
      };
      this.notify();
      if (currentTimeMs !== previousTimeMs) this.notifyTime(currentTimeMs);
      this.commitTrackChange();
      return;
    }
    if (selectedIds.size === 0) return;

    this.recordSnapshot();
    const ids = Array.from(selectedIds);
    let tracks = this.state.tracks;
    for (const id of ids) {
      if (ripple) {
        tracks = this.rippleDeleteClipFromTracks(tracks, id);
      } else {
        tracks = tracks.map((t) => ({
          ...t,
          clips: t.clips.filter((c) => c.id !== id),
        }));
      }
    }
    const durationMs = durationForTracks(tracks);
    const previousTimeMs = this.state.currentTimeMs;
    const currentTimeMs = Math.min(previousTimeMs, durationMs);
    this.state = {
      ...this.state,
      selectedClipId: null,
      selectedClipIds: new Set(),
      tracks,
      durationMs,
      currentTimeMs,
      scrollTimeMs: Math.min(this.state.scrollTimeMs, durationMs),
    };
    this.notify();
    if (currentTimeMs !== previousTimeMs) this.notifyTime(currentTimeMs);
    this.commitTrackChange();
  };

  rippleDeleteClipFromTracks = (tracks: TimelineTrack[], clipId: string): TimelineTrack[] => {
    return tracks.map((track) => {
      const clipIndex = track.clips.findIndex((c) => c.id === clipId);
      if (clipIndex === -1) return track;
      const deletedClip = track.clips[clipIndex];
      const gapMs = deletedClip.durationMs;
      const deletedEnd = deletedClip.startMs + deletedClip.durationMs;

      // Remove the deleted clip and shift all clips that start at or after the deleted clip's end
      const remainingClips = track.clips
        .filter((c) => c.id !== clipId)
        .map((c) => {
          if (c.startMs >= deletedEnd) {
            return { ...c, startMs: c.startMs - gapMs };
          }
          return c;
        });

      return {
        ...track,
        clips: remainingClips.sort((a, b) => a.startMs - b.startMs),
      };
    });
  };

  rippleTrimClip = (
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
    let shiftDelta = 0; // How much the clip end moved (negative = shortened from end)

    if (edge === 'start') {
      const clampedStart = Math.min(
        newEdgeMs,
        clip.startMs + clip.durationMs - 300,
      );
      const delta = clampedStart - clip.startMs;
      const sourceRate = sourceUnitsPerTimelineMs(clip);
      updatedClip = {
        ...clip,
        startMs: clampedStart,
        durationMs: clip.durationMs - delta,
        sourceStartMs: clip.sourceStartMs + delta * sourceRate,
        sourceDurationMs: (clip.durationMs - delta) * sourceRate,
      };
      // Trimming start inward doesn't shift subsequent clips
    } else {
      const clampedEnd = Math.max(newEdgeMs, clip.startMs + 300);
      const sourceRate = sourceUnitsPerTimelineMs(clip);
      const oldEnd = clip.startMs + clip.durationMs;
      shiftDelta = clampedEnd - oldEnd; // negative when shortening from end
      updatedClip = {
        ...clip,
        durationMs: clampedEnd - clip.startMs,
        sourceDurationMs: (clampedEnd - clip.startMs) * sourceRate,
      };
    }

    this.recordSnapshot();
    const tracks = this.state.tracks.map((t) =>
      t.id === trackId
        ? {
            ...t,
            clips: t.clips
              .map((c) => {
                if (c.id === clipId) return updatedClip;
                // Shift subsequent clips on the same track when trimming end edge
                if (edge === 'end' && shiftDelta !== 0 && c.startMs >= clip.startMs + clip.durationMs) {
                  return { ...c, startMs: c.startMs + shiftDelta };
                }
                return c;
              })
              .sort((a, b) => a.startMs - b.startMs),
          }
        : t,
    );
    const alignedTracks = this.alignCutTransitions(tracks);
    const durationMs = durationForTracks(alignedTracks);
    const previousTimeMs = this.state.currentTimeMs;
    const currentTimeMs = Math.min(previousTimeMs, durationMs);
    this.state = {
      ...this.state,
      tracks: alignedTracks,
      durationMs,
      currentTimeMs,
      scrollTimeMs: Math.min(this.state.scrollTimeMs, durationMs),
    };
    this.notify();
    if (currentTimeMs !== previousTimeMs) this.notifyTime(currentTimeMs);
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
    const tracks = this.state.tracks.map((t) =>
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
    );
    const durationMs =
      patch.durationMs !== undefined || patch.startMs !== undefined
        ? durationForTracks(tracks)
        : this.state.durationMs;
    const previousTimeMs = this.state.currentTimeMs;
    const currentTimeMs = Math.min(previousTimeMs, durationMs);
    this.state = {
      ...this.state,
      tracks,
      durationMs,
      currentTimeMs,
      scrollTimeMs: Math.min(this.state.scrollTimeMs, durationMs),
    };
    this.notify();
    if (currentTimeMs !== previousTimeMs) this.notifyTime(currentTimeMs);
    if (commit) this.commitTrackChange();
  };

  // ── Universal clip keyframes ─────────────────────────────────────────────

  /**
   * Add a universal keyframe to a clip. Returns false if the clip is missing;
   * returns true without changing state when a keyframe with the same
   * property+time already exists.
   */
  addClipKeyframe = (
    clipId: string,
    property: string,
    timeMs: number,
    value: number,
    easing: StudioAnimationEasing = 'ease-out',
  ): boolean => {
    const found = this.findClip(clipId);
    if (!found) return false;
    const durationMs = Math.max(0, found.clip.durationMs);
    const t = Math.min(Math.max(0, timeMs), durationMs);
    const payload = found.clip.payload ?? {};
    const keyframes = payload.keyframes ?? [];
    if (keyframes.some((k) => k.property === property && k.timeMs === t)) {
      return true;
    }
    this.updateClip(clipId, {
      payload: {
        ...payload,
        keyframes: [
          ...keyframes,
          { id: generateKeyframeId(), timeMs: t, property, value, easing },
        ],
      },
    });
    return true;
  };

  /** Set the value of an existing universal keyframe on a clip. */
  updateClipKeyframeValue = (clipId: string, keyframeId: string, value: number) => {
    const found = this.findClip(clipId);
    if (!found) return;
    const payload = found.clip.payload ?? {};
    this.updateClip(clipId, {
      payload: {
        ...payload,
        keyframes: (payload.keyframes ?? []).map((k) =>
          k.id === keyframeId ? { ...k, value } : k,
        ),
      },
    });
  };

  /** Set the timeline position (within the clip) of an existing keyframe. */
  updateClipKeyframeTime = (clipId: string, keyframeId: string, timeMs: number) => {
    const found = this.findClip(clipId);
    if (!found) return;
    const payload = found.clip.payload ?? {};
    const t = Math.max(0, timeMs);
    this.updateClip(clipId, {
      payload: {
        ...payload,
        keyframes: (payload.keyframes ?? []).map((k) =>
          k.id === keyframeId ? { ...k, timeMs: t } : k,
        ),
      },
    });
  };

  /** Remove a universal keyframe from a clip. */
  removeClipKeyframe = (clipId: string, keyframeId: string) => {
    const found = this.findClip(clipId);
    if (!found) return;
    const payload = found.clip.payload ?? {};
    const keyframes = (payload.keyframes ?? []).filter((k) => k.id !== keyframeId);
    this.updateClip(clipId, { payload: { ...payload, keyframes } });
  };

  addTransitionClip = (data: {
    transitionType: NonNullable<TimelineClip['payload']>['transitionType'];
    durationMs: number;
    startMs?: number;
    name?: string;
    color?: string;
    preferredClipId?: string;
    targetTrackId?: string;
  }): TimelineClip | null => {
    const anchorMs = data.startMs ?? this.state.currentTimeMs;
    const selected = data.preferredClipId
      ? this.findClip(data.preferredClipId)
      : null;
    const selectedVideoId = selected?.track.type === 'video'
      ? selected.clip.id
      : undefined;
    const candidates: Array<{
      track: TimelineTrack;
      from: TimelineClip;
      to: TimelineClip;
      cutMs: number;
    }> = [];

    for (const track of this.state.tracks) {
      if (track.type !== 'video' || !track.visible) continue;
      const clips = [...track.clips].sort((a, b) => a.startMs - b.startMs);
      for (let index = 0; index < clips.length - 1; index += 1) {
        const from = clips[index];
        const to = clips[index + 1];
        const cutMs = from.startMs + from.durationMs;
        if (Math.abs(to.startMs - cutMs) > 1) continue;
        if (selectedVideoId && from.id !== selectedVideoId && to.id !== selectedVideoId) continue;
        candidates.push({ track, from, to, cutMs });
      }
    }

    candidates.sort((a, b) => Math.abs(a.cutMs - anchorMs) - Math.abs(b.cutMs - anchorMs));
    const candidate = candidates[0];
    if (!candidate) return null;

    const durationMs = Math.floor(Math.min(
      data.durationMs,
      candidate.from.durationMs,
      candidate.to.durationMs,
      candidate.cutMs * 2,
    ));
    if (durationMs < 100) return null;

    const startMs = candidate.cutMs - durationMs / 2;
    const transitionPatch = {
      name: data.name ?? `${data.transitionType ?? 'fade'} transition`,
      durationMs,
      startMs,
      color: data.color ?? '#db2777',
      itemType: 'transition',
      payload: {
        transitionType: data.transitionType ?? 'fade',
        fromClipId: candidate.from.id,
        toClipId: candidate.to.id,
      },
    } as const;
    const existingTransition = this.state.tracks
      .filter((track) => track.type === 'transitions')
      .map((track) => ({
        track,
        clip: track.clips.find(
          (clip) =>
            clip.payload?.fromClipId === candidate.from.id &&
            clip.payload?.toClipId === candidate.to.id,
        ),
      }))
      .find((entry) => entry.clip);

    if (existingTransition?.clip) {
      if (existingTransition.track.locked) return null;
      this.updateClip(
        existingTransition.clip.id,
        transitionPatch,
        existingTransition.track.id,
      );
      return this.findClip(existingTransition.clip.id)?.clip ?? null;
    }

    return this.addClip('transitions', {
      ...transitionPatch,
      targetTrackId: data.targetTrackId,
    });
  };

  addClip = (
    trackType: TrackType,
    clipData: {
      name: string;
      durationMs: number;
      startMs?: number;
      color?: string;
      itemType?: TimelineItemType;
      payload?: TimelineClip['payload'];
      targetTrackId?: string;
    },
  ): TimelineClip => {
    const wantsLayerTrack = this.state.isMultiTrack;
    let track = this.state.tracks.find((t) => t.id === clipData.targetTrackId && t.type === trackType && !t.locked) ?? this.state.tracks.find((t) =>
      t.type === trackType && !t.locked && (!wantsLayerTrack || !t.id.startsWith('track-')),
    );
    let tracksBeforeInsert = this.state.tracks;
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
      tracksBeforeInsert = sortTracksForTimeline([...this.state.tracks, newTrack]);
      track = newTrack;
    }

    const startMs = clipData.startMs !== undefined
      ? clipData.startMs
      : this.state.currentTimeMs;

    const itemType =
      clipData.itemType ?? inferTimelineItemType(trackType, clipData.payload);
    const durationMs = clipData.durationMs;
    const rawSpeed = clipData.payload?.speed ?? 1;
    const speed = Number.isFinite(rawSpeed) && rawSpeed > 0 ? rawSpeed : 1;
    const newClip: TimelineClip = {
      id: `clip-${Math.random().toString(36).slice(2, 9)}`,
      trackId: track.id,
      itemType,
      name: clipData.name,
      startMs: Math.max(0, startMs),
      durationMs,
      sourceStartMs: 0,
      sourceDurationMs: itemType === 'image' ? 0 : durationMs * speed,
      color: clipData.color,
      payload: {
        ...clipData.payload,
      },
    };

    const clipEnd = newClip.startMs + newClip.durationMs;
    const newDuration = Math.max(this.state.durationMs, clipEnd + 1000);

    // Snapshot before materializing an implicit lane so undo removes both the
    // inserted clip and the lane that was created to hold it.
    this.recordSnapshot();
    this.state = {
      ...this.state,
      durationMs: newDuration,
      selectedClipId: newClip.id,
      isMultiTrack: this.state.isMultiTrack || !track.id.startsWith('track-'),
      tracks: tracksBeforeInsert.map((t) =>
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
    selectedClipIds: state.selectedClipIds,
    canUndo: timelineStore.canUndo(),
    canRedo: timelineStore.canRedo(),
    expandedTrackIds: state.expandedTrackIds,
    selectedTrackId: state.selectedTrackId,
    selectedTrackExpanded: Boolean(
      state.selectedTrackId && state.expandedTrackIds.has(state.selectedTrackId),
    ),
    canToggleSelectedTrack: (() => {
      const t = state.tracks.find((t) => t.id === state.selectedTrackId);
      return Boolean(t && trackHasDetailLanes(t));
    })(),
    toggleTrackExpanded: timelineStore.toggleTrackExpanded,
    setTrackExpanded: timelineStore.setTrackExpanded,
    setSelectedTrackId: timelineStore.setSelectedTrackId,
    toggleSelectedTrackExpanded: timelineStore.toggleSelectedTrackExpanded,
    setActiveTool: timelineStore.setActiveTool,
    toggleSnapping: timelineStore.toggleSnapping,
    setZoomPxPerMs: timelineStore.setZoomPxPerMs,
    splitAtPlayhead: timelineStore.splitAtPlayhead,
    deleteSelectedClip: timelineStore.deleteSelectedClip,
    toggleSelectedClipId: timelineStore.toggleSelectedClipId,
    setSelectedClipIds: timelineStore.setSelectedClipIds,
    rippleTrimClip: timelineStore.rippleTrimClip,
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
