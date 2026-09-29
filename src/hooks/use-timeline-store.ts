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
  };

  private listeners = new Set<TimelineListener>();
  private timeListeners = new Set<(timeMs: number) => void>();

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

  private notify() {
    this.listeners.forEach((l) => l());
  }

  private notifyTime(timeMs: number) {
    this.timeListeners.forEach((l) => l(timeMs));
  }

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
    this.state.snapLineMs = snapLineMs;
    this.notify();
  };

  setSelectedClipId = (selectedClipId: string | null) => {
    this.state = { ...this.state, selectedClipId };
    this.notify();
  };

  // ── Load Tracks ───────────────────────────────────────────────────────────

  setTracksAndDuration = (tracks: TimelineTrack[], durationMs: number) => {
    this.state = {
      ...this.state,
      tracks,
      durationMs: Math.max(durationMs, 1000),
    };
    this.notify();
  };

  // ── Track Header Toggles ──────────────────────────────────────────────────

  toggleTrackLock = (trackId: string) => {
    this.state = {
      ...this.state,
      tracks: this.state.tracks.map((t) =>
        t.id === trackId ? { ...t, locked: !t.locked } : t,
      ),
    };
    this.notify();
  };

  toggleTrackVisibility = (trackId: string) => {
    this.state = {
      ...this.state,
      tracks: this.state.tracks.map((t) =>
        t.id === trackId ? { ...t, visible: !t.visible } : t,
      ),
    };
    this.notify();
  };

  toggleTrackMute = (trackId: string) => {
    this.state = {
      ...this.state,
      tracks: this.state.tracks.map((t) =>
        t.id === trackId ? { ...t, muted: !t.muted } : t,
      ),
    };
    this.notify();
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
    };

    const secondClip: TimelineClip = {
      ...target,
      id: `${target.id}-split-${Date.now().toString(36)}`,
      name: `${target.name} (Part 2)`,
      startMs: splitTimeMs,
      durationMs: secondDuration,
      sourceStartMs: secondSourceStart,
    };

    const updatedClips = [...track.clips];
    updatedClips.splice(clipIndex, 1, firstClip, secondClip);

    this.state = {
      ...this.state,
      tracks: this.state.tracks.map((t) =>
        t.id === trackId ? { ...t, clips: updatedClips } : t,
      ),
      selectedClipId: secondClip.id,
    };
    this.notify();
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
      };
    } else {
      const clampedEnd = Math.max(newEdgeMs, clip.startMs + 300);
      updatedClip = {
        ...clip,
        durationMs: clampedEnd - clip.startMs,
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

    this.state = {
      ...this.state,
      selectedClipId: null,
      tracks: this.state.tracks.map((t) => ({
        ...t,
        clips: t.clips.filter((c) => c.id !== selectedId),
      })),
    };
    this.notify();
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
  ) => {
    let targetTrackId = trackId;
    if (!targetTrackId) {
      const found = this.findClip(clipId);
      if (!found) return;
      targetTrackId = found.track.id;
    }

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
  };

  addClip = (
    trackType: TrackType,
    clipData: {
      name: string;
      durationMs: number;
      startMs?: number;
      color?: string;
      payload?: TimelineClip['payload'];
    },
  ): TimelineClip => {
    let track = this.state.tracks.find((t) => t.type === trackType);
    if (!track) {
      const newTrack: TimelineTrack = {
        id: `track-${trackType}`,
        type: trackType,
        name:
          trackType === 'effects'
            ? 'Effects & Zooms'
            : trackType === 'captions'
              ? 'Subtitles & Text'
              : trackType === 'video'
                ? 'Video'
                : 'Audio',
        locked: false,
        visible: true,
        clips: [],
      };
      this.state = {
        ...this.state,
        tracks: [...this.state.tracks, newTrack],
      };
      track = newTrack;
    }

    const startMs =
      clipData.startMs !== undefined
        ? clipData.startMs
        : this.state.currentTimeMs;

    const newClip: TimelineClip = {
      id: `clip-${Math.random().toString(36).slice(2, 9)}`,
      trackId: track.id,
      name: clipData.name,
      startMs: Math.max(0, startMs),
      durationMs: clipData.durationMs,
      sourceStartMs: 0,
      sourceDurationMs: clipData.durationMs,
      color: clipData.color,
      payload: clipData.payload,
    };

    const clipEnd = newClip.startMs + newClip.durationMs;
    const newDuration = Math.max(this.state.durationMs, clipEnd + 1000);

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
    setActiveTool: timelineStore.setActiveTool,
    toggleSnapping: timelineStore.toggleSnapping,
    setZoomPxPerMs: timelineStore.setZoomPxPerMs,
    splitAtPlayhead: timelineStore.splitAtPlayhead,
    deleteSelectedClip: timelineStore.deleteSelectedClip,
    updateClip: timelineStore.updateClip,
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
