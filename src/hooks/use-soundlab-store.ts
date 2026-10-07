/**
 * hooks/use-soundlab-store.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Client-side state store for SoundLab. Mirrors the TimelineStore pattern:
 * useSyncExternalStore for React bindings, a separate high-frequency
 * subscribeTime channel that bypasses React re-renders for the 60fps playhead,
 * and a 50-state undo/redo stack.
 *
 * This is the single mutable source of truth for the session during a DAW
 * editing session. IPC persistence is handled by use-soundlab.ts above this
 * layer.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useSyncExternalStore } from 'react';
import type {
  SoundLabSession,
  SoundLabSessionWithTracks,
  SoundLabTrack,
  SoundLabPattern,
  SoundLabClip,
  SoundLabNote,
  SoundLabAutomationLane,
  SoundLabAutomationPoint,
  BrainwaveBand,
} from '@/lib/soundlab-types';

// ── Store state shape ─────────────────────────────────────────────────────────

export type PlayMode = 'song' | 'pattern';

export interface SoundLabStoreState {
  session: SoundLabSession | null;
  tracks: SoundLabTrack[];
  selectedTrackId: string | null;
  selectedPatternId: string | null;
  selectedClipId: string | null;
  playheadBeat: number;
  isPlaying: boolean;
  playMode: PlayMode;
}

type Listener = () => void;
type TimeListener = (beat: number) => void;

// ── Store class ───────────────────────────────────────────────────────────────

class SoundLabStore {
  private state: SoundLabStoreState = {
    session: null,
    tracks: [],
    selectedTrackId: null,
    selectedPatternId: null,
    selectedClipId: null,
    playheadBeat: 0,
    isPlaying: false,
    playMode: 'pattern',
  };

  private listeners = new Set<Listener>();
  private timeListeners = new Set<TimeListener>();

  // Undo / Redo — snapshot tracks only (patterns + clips), max 50 states
  private undoStack: SoundLabTrack[][] = [];
  private redoStack: SoundLabTrack[][] = [];

  // ── Subscriptions ─────────────────────────────────────────────────────────

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** High-frequency subscription for the playhead — no React re-renders. */
  subscribeTime = (listener: TimeListener): (() => void) => {
    this.timeListeners.add(listener);
    return () => this.timeListeners.delete(listener);
  };

  getState = (): SoundLabStoreState => this.state;

  private notify() {
    this.listeners.forEach((l) => l());
  }

  private notifyTime(beat: number) {
    this.timeListeners.forEach((l) => l(beat));
  }

  // ── Undo / Redo ───────────────────────────────────────────────────────────

  private snapshot() {
    this.undoStack.push(JSON.parse(JSON.stringify(this.state.tracks)) as SoundLabTrack[]);
    if (this.undoStack.length > 50) this.undoStack.shift();
    this.redoStack = [];
  }

  canUndo = (): boolean => this.undoStack.length > 0;
  canRedo = (): boolean => this.redoStack.length > 0;

  undo = (): void => {
    if (!this.undoStack.length) return;
    this.redoStack.push(JSON.parse(JSON.stringify(this.state.tracks)) as SoundLabTrack[]);
    this.state = { ...this.state, tracks: this.undoStack.pop()!, selectedClipId: null };
    this.notify();
  };

  redo = (): void => {
    if (!this.redoStack.length) return;
    this.undoStack.push(JSON.parse(JSON.stringify(this.state.tracks)) as SoundLabTrack[]);
    this.state = { ...this.state, tracks: this.redoStack.pop()!, selectedClipId: null };
    this.notify();
  };

  // ── Session ───────────────────────────────────────────────────────────────

  loadSession = (data: SoundLabSessionWithTracks): void => {
    const { tracks, ...session } = data;
    this.state = {
      ...this.state,
      session,
      tracks,
      selectedTrackId: null,
      selectedPatternId: null,
      selectedClipId: null,
      playheadBeat: 0,
      isPlaying: false,
    };
    this.undoStack = [];
    this.redoStack = [];
    this.notify();
  };

  setSession = (patch: Partial<SoundLabSession>): void => {
    if (!this.state.session) return;
    this.state = { ...this.state, session: { ...this.state.session, ...patch } };
    this.notify();
  };

  getSessionWithTracks = (): SoundLabSessionWithTracks | null => {
    if (!this.state.session) return null;
    return { ...this.state.session, tracks: this.state.tracks };
  };

  // ── Playback ──────────────────────────────────────────────────────────────

  /** High-frequency seek — only notifies time subscribers unless forceGeneral. */
  seek = (beat: number, forceGeneral = false): void => {
    const max = this.state.session?.durationBeats ?? 64;
    const clamped = Math.max(0, Math.min(max, beat));
    this.state.playheadBeat = clamped;
    this.notifyTime(clamped);
    if (forceGeneral) this.notify();
  };

  setPlaying = (isPlaying: boolean): void => {
    if (this.state.isPlaying === isPlaying) return;
    this.state = { ...this.state, isPlaying };
    this.notify();
  };

  setPlayMode = (playMode: PlayMode): void => {
    if (this.state.playMode === playMode) return;
    this.state = { ...this.state, playMode };
    this.notify();
  };

  // ── Selection ─────────────────────────────────────────────────────────────

  setSelectedTrack = (id: string | null): void => {
    this.state = { ...this.state, selectedTrackId: id };
    this.notify();
  };

  setSelectedPattern = (id: string | null): void => {
    this.state = { ...this.state, selectedPatternId: id };
    this.notify();
  };

  setSelectedClip = (id: string | null): void => {
    this.state = { ...this.state, selectedClipId: id };
    this.notify();
  };

  // ── Tracks ────────────────────────────────────────────────────────────────

  addTrack = (track: SoundLabTrack): void => {
    this.snapshot();
    this.state = {
      ...this.state,
      tracks: [...this.state.tracks, track],
      selectedTrackId: track.id,
    };
    this.notify();
  };

  updateTrack = (id: string, patch: Partial<SoundLabTrack>): void => {
    this.state = {
      ...this.state,
      tracks: this.state.tracks.map((t) =>
        t.id === id ? { ...t, ...patch } : t,
      ),
    };
    this.notify();
  };

  removeTrack = (id: string): void => {
    this.snapshot();
    this.state = {
      ...this.state,
      tracks: this.state.tracks.filter((t) => t.id !== id),
      selectedTrackId:
        this.state.selectedTrackId === id ? null : this.state.selectedTrackId,
    };
    this.notify();
  };

  reorderTracks = (tracks: SoundLabTrack[]): void => {
    this.snapshot();
    this.state = { ...this.state, tracks };
    this.notify();
  };

  // ── Patterns ──────────────────────────────────────────────────────────────

  addPattern = (trackId: string, pattern: SoundLabPattern): void => {
    this.snapshot();
    this.state = {
      ...this.state,
      tracks: this.state.tracks.map((t) =>
        t.id === trackId ? { ...t, patterns: [...t.patterns, pattern] } : t,
      ),
      selectedPatternId: pattern.id,
    };
    this.notify();
  };

  updatePattern = (
    trackId: string,
    patternId: string,
    patch: Partial<SoundLabPattern>,
  ): void => {
    this.state = {
      ...this.state,
      tracks: this.state.tracks.map((t) =>
        t.id === trackId
          ? {
              ...t,
              patterns: t.patterns.map((p) =>
                p.id === patternId ? { ...p, ...patch } : p,
              ),
            }
          : t,
      ),
    };
    this.notify();
  };

  removePattern = (trackId: string, patternId: string): void => {
    this.snapshot();
    this.state = {
      ...this.state,
      tracks: this.state.tracks.map((t) =>
        t.id === trackId
          ? { ...t, patterns: t.patterns.filter((p) => p.id !== patternId) }
          : t,
      ),
    };
    this.notify();
  };

  // ── Notes (inside patterns) ───────────────────────────────────────────────

  addNote = (trackId: string, patternId: string, note: SoundLabNote): void => {
    this.snapshot();
    this.updatePattern(trackId, patternId, {
      notes: [
        ...(this.state.tracks
          .find((t) => t.id === trackId)
          ?.patterns.find((p) => p.id === patternId)?.notes ?? []),
        note,
      ],
    });
  };

  updateNote = (
    trackId: string,
    patternId: string,
    noteId: string,
    patch: Partial<SoundLabNote>,
  ): void => {
    const track = this.state.tracks.find((t) => t.id === trackId);
    const pattern = track?.patterns.find((p) => p.id === patternId);
    if (!pattern) return;
    this.updatePattern(trackId, patternId, {
      notes: pattern.notes.map((n) => (n.id === noteId ? { ...n, ...patch } : n)),
    });
  };

  removeNote = (trackId: string, patternId: string, noteId: string): void => {
    const track = this.state.tracks.find((t) => t.id === trackId);
    const pattern = track?.patterns.find((p) => p.id === patternId);
    if (!pattern) return;
    this.snapshot();
    this.updatePattern(trackId, patternId, {
      notes: pattern.notes.filter((n) => n.id !== noteId),
    });
  };

  // ── Clips ─────────────────────────────────────────────────────────────────

  addClip = (trackId: string, clip: SoundLabClip): void => {
    this.snapshot();
    this.state = {
      ...this.state,
      tracks: this.state.tracks.map((t) =>
        t.id === trackId
          ? {
              ...t,
              clips: [...t.clips, clip].sort((a, b) => a.startBeat - b.startBeat),
            }
          : t,
      ),
      selectedClipId: clip.id,
    };
    this.notify();
  };

  updateClip = (trackId: string, clipId: string, patch: Partial<SoundLabClip>): void => {
    this.state = {
      ...this.state,
      tracks: this.state.tracks.map((t) =>
        t.id === trackId
          ? {
              ...t,
              clips: t.clips.map((c) => (c.id === clipId ? { ...c, ...patch } : c)),
            }
          : t,
      ),
    };
    this.notify();
  };

  removeClip = (trackId: string, clipId: string): void => {
    this.snapshot();
    this.state = {
      ...this.state,
      tracks: this.state.tracks.map((t) =>
        t.id === trackId
          ? { ...t, clips: t.clips.filter((c) => c.id !== clipId) }
          : t,
      ),
      selectedClipId:
        this.state.selectedClipId === clipId ? null : this.state.selectedClipId,
    };
    this.notify();
  };

  // ── Session-level properties ──────────────────────────────────────────────

  setBpm = (bpm: number): void => {
    const clamped = Math.max(40, Math.min(220, Math.round(bpm)));
    this.setSession({ bpm: clamped });
  };

  setTargetBand = (band: BrainwaveBand): void => {
    this.setSession({ targetBand: band });
  };

  setKeySignature = (key: string): void => {
    this.setSession({ keySignature: key });
  };

  setDurationBeats = (beats: number): void => {
    this.setSession({ durationBeats: Math.max(16, beats) });
  };

  setLoopRegion = (startBeat: number, endBeat: number): void => {
    this.setSession({ loopStartBeat: startBeat, loopEndBeat: endBeat });
  };

  toggleLoop = (): void => {
    if (!this.state.session) return;
    this.setSession({ loopEnabled: !this.state.session.loopEnabled });
  };

  // ── Automation ────────────────────────────────────────────────────────────

  addAutomationLane = (trackId: string, lane: SoundLabAutomationLane): void => {
    this.state = {
      ...this.state,
      tracks: this.state.tracks.map((t) =>
        t.id === trackId
          ? { ...t, automation: [...t.automation, lane] }
          : t,
      ),
    };
    this.notify();
  };

  updateAutomationLane = (
    trackId: string,
    laneId: string,
    patch: Partial<SoundLabAutomationLane>,
  ): void => {
    this.state = {
      ...this.state,
      tracks: this.state.tracks.map((t) =>
        t.id === trackId
          ? {
              ...t,
              automation: t.automation.map((l) =>
                l.id === laneId ? { ...l, ...patch } : l,
              ),
            }
          : t,
      ),
    };
    this.notify();
  };

  addAutomationPoint = (
    trackId: string,
    laneId: string,
    point: SoundLabAutomationPoint,
  ): void => {
    const track = this.state.tracks.find((t) => t.id === trackId);
    const lane = track?.automation.find((l) => l.id === laneId);
    if (!lane) return;
    this.updateAutomationLane(trackId, laneId, {
      points: [...lane.points, point].sort((a, b) => a.beat - b.beat),
    });
  };

  removeAutomationPoint = (
    trackId: string,
    laneId: string,
    pointId: string,
  ): void => {
    const track = this.state.tracks.find((t) => t.id === trackId);
    const lane = track?.automation.find((l) => l.id === laneId);
    if (!lane) return;
    this.updateAutomationLane(trackId, laneId, {
      points: lane.points.filter((p) => p.id !== pointId),
    });
  };

  removeAutomationLane = (trackId: string, laneId: string): void => {
    this.state = {
      ...this.state,
      tracks: this.state.tracks.map((t) =>
        t.id === trackId
          ? { ...t, automation: t.automation.filter((l) => l.id !== laneId) }
          : t,
      ),
    };
    this.notify();
  };
}

// ── Singleton ─────────────────────────────────────────────────────────────────

export const soundLabStore = new SoundLabStore();

// ── React hooks ───────────────────────────────────────────────────────────────

export function useSoundLabState(): SoundLabStoreState {
  return useSyncExternalStore(soundLabStore.subscribe, soundLabStore.getState);
}

export function useSoundLabTracks(): SoundLabTrack[] {
  return useSoundLabState().tracks;
}

export function useSoundLabSession(): SoundLabSession | null {
  return useSoundLabState().session;
}

export function useSelectedTrack(): SoundLabTrack | null {
  const { tracks, selectedTrackId } = useSoundLabState();
  return tracks.find((t) => t.id === selectedTrackId) ?? null;
}

export function useSelectedPattern(): { track: SoundLabTrack; pattern: SoundLabPattern } | null {
  const { tracks, selectedPatternId } = useSoundLabState();
  for (const track of tracks) {
    const pattern = track.patterns.find((p) => p.id === selectedPatternId);
    if (pattern) return { track, pattern };
  }
  return null;
}
