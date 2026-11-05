/**
 * stores/music-store.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The player's single source of truth: queue, transport state and preferences.
 *
 * The engine owns sound; this store owns decisions. That split is what lets the
 * queue logic be tested without a DOM, and lets the engine be replaced without
 * rewriting the UI.
 *
 * Playback is app-wide, so this store is created once and mounted nowhere. The
 * dock in `AppLayout` calls `hydrate()`; every other surface just reads it.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { create } from 'zustand';
import { duckSoundscape } from '@/lib/audio/mixer';
import { fadeSeconds } from '@/lib/music/crossfade';
import { getMusicEngine, type MusicEngine } from '@/lib/music/engine/music-engine';
import {
  bindMediaSession,
  publishNowPlaying,
  setPlaybackState,
} from '@/lib/music/media-session';
import {
  nextIndex as computeNextIndex,
  previousIndex as computePreviousIndex,
} from '@/lib/music/queue';
import type {
  MusicPlaybackSnapshot,
  MusicStateRecord,
  MusicTrack,
  RepeatMode,
} from '@/lib/music/types';
import { useSoundscapeStore } from './soundscape-store';

const RESTART_THRESHOLD_MS = 3000;

interface MusicStoreState {
  queue: MusicTrack[];
  index: number;
  playing: boolean;
  positionMs: number;
  durationMs: number;
  volume: number;
  muted: boolean;
  repeat: RepeatMode;
  shuffle: boolean;
  crossfadeSec: number;
  duckDb: number;
  fading: boolean;
  hydrated: boolean;
  hydrating: boolean;
  error: string | null;

  hydrate: () => Promise<void>;
  playTracks: (tracks: MusicTrack[], startIndex?: number) => Promise<void>;
  playTrack: (track: MusicTrack) => Promise<void>;
  enqueue: (track: MusicTrack, mode?: 'next' | 'end') => void;
  removeAt: (index: number) => Promise<void>;
  move: (from: number, to: number) => void;
  clearQueue: () => void;
  next: (auto?: boolean) => Promise<void>;
  previous: () => Promise<void>;
  toggle: () => Promise<void>;
  play: () => Promise<void>;
  pause: () => void;
  seek: (positionMs: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  setRepeat: (mode: RepeatMode) => void;
  setShuffle: (shuffle: boolean) => void;
  toggleShuffle: () => void;
  setCrossfadeSec: (seconds: number) => void;
  setDuckDb: (db: number) => void;
  handleSnapshot: (snapshot: MusicPlaybackSnapshot) => void;
  handleEnded: () => Promise<void>;
  handleError: (trackId: string, message: string) => void;
  currentTrack: () => MusicTrack | null;
  clearError: () => void;
}

let engine: MusicEngine | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let mediaBound = false;

function getEngine(): MusicEngine {
  if (engine) return engine;
  engine = getMusicEngine();
  engine.setHandlers({
    onSnapshot: (snapshot) => useMusicStore.getState().handleSnapshot(snapshot),
    onEnded: () => void useMusicStore.getState().handleEnded(),
    onError: (trackId, message) =>
      useMusicStore.getState().handleError(trackId, message),
  });
  return engine;
}

function bindMediaOnce(): void {
  if (mediaBound) return;
  mediaBound = true;
  bindMediaSession({
    play: () => void useMusicStore.getState().play(),
    pause: () => useMusicStore.getState().pause(),
    next: () => void useMusicStore.getState().next(false),
    previous: () => void useMusicStore.getState().previous(),
    seek: (positionMs) => useMusicStore.getState().seek(positionMs),
  });
}

function persistRecord(): MusicStateRecord {
  const state = useMusicStore.getState();
  const soundscape = useSoundscapeStore.getState();
  return {
    queue: state.queue.map((track) => track.id),
    currentTrackId: state.queue[state.index]?.id ?? null,
    positionMs: Math.round(state.positionMs),
    volume: state.volume,
    muted: state.muted,
    repeat: state.repeat,
    shuffle: state.shuffle,
    crossfadeSec: state.crossfadeSec,
    duckDb: state.duckDb,
    sceneId: soundscape.sceneId,
    soundscape: soundscape.state,
  };
}

function schedulePersist(): void {
  if (typeof window === 'undefined') return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void window.electron.ipc
      .invoke('music:state-save', persistRecord())
      .catch(() => {
        /* resuming is best-effort */
      });
  }, 700);
}

function applyDuck(playing: boolean): void {
  duckSoundscape(playing ? useMusicStore.getState().duckDb : 0);
  setPlaybackState(playing);
}

function preloadNext(): void {
  const state = useMusicStore.getState();
  if (state.queue.length < 2) return;
  const nextIndex = computeNextIndex(
    state,
    state.queue.length,
    'auto',
  );
  if (nextIndex === null) return;
  const next = state.queue[nextIndex];
  if (next) getEngine().preload(next);
}

export const useMusicStore = create<MusicStoreState>((set, get) => ({
  queue: [],
  index: -1,
  playing: false,
  positionMs: 0,
  durationMs: 0,
  volume: 0.8,
  muted: false,
  repeat: 'off',
  shuffle: false,
  crossfadeSec: 4,
  duckDb: -9,
  fading: false,
  hydrated: false,
  hydrating: false,
  error: null,

  hydrate: async () => {
    if (get().hydrated || get().hydrating) return;
    set({ hydrating: true });
    bindMediaOnce();
    try {
      const record = await window.electron.ipc.invoke<MusicStateRecord | null>(
        'music:state-get',
      );
      if (!record) return;
      const queue = record.queue.length
        ? await window.electron.ipc.invoke<MusicTrack[]>('music:tracks-by-ids', {
            ids: record.queue,
          })
        : [];
      const index = record.currentTrackId
        ? queue.findIndex((track) => track.id === record.currentTrackId)
        : queue.length > 0
          ? 0
          : -1;
      const resolvedIndex = index >= 0 ? index : queue.length > 0 ? 0 : -1;
      const soundscape = useSoundscapeStore.getState();
      if (record.soundscape) soundscape.setScene(record.sceneId, record.soundscape);
      set({
        queue,
        index: resolvedIndex,
        volume: record.volume,
        muted: record.muted,
        repeat: record.repeat,
        shuffle: record.shuffle,
        crossfadeSec: record.crossfadeSec,
        duckDb: record.duckDb,
        positionMs: record.positionMs,
      });
      const current = queue[resolvedIndex];
      const music = getEngine();
      music.setVolume(record.volume);
      music.setMuted(record.muted);
      if (current) {
        await music.load(current, false);
        music.seek(record.positionMs);
        publishNowPlaying(current);
        preloadNext();
      }
    } catch {
      /* first run, or a DB that predates the music tables */
    } finally {
      set({ hydrated: true, hydrating: false });
    }
  },

  playTracks: async (tracks, startIndex = 0) => {
    if (tracks.length === 0) return;
    const index = Math.min(tracks.length - 1, Math.max(0, startIndex));
    set({ queue: tracks, index, playing: true, positionMs: 0, durationMs: tracks[index].duration_ms, error: null });
    const music = getEngine();
    await music.load(tracks[index], true);
    publishNowPlaying(tracks[index]);
    applyDuck(true);
    preloadNext();
    schedulePersist();
  },

  playTrack: async (track) => {
    const state = get();
    const existing = state.queue.findIndex((entry) => entry.id === track.id);
    if (existing >= 0) {
      set({ index: existing, playing: true, positionMs: 0, error: null });
      await getEngine().load(track, true);
      publishNowPlaying(track);
      applyDuck(true);
      preloadNext();
      schedulePersist();
      return;
    }
    await get().playTracks([track], 0);
  },

  enqueue: (track, mode = 'end') => {
    const state = get();
    if (state.queue.some((entry) => entry.id === track.id)) return;
    const queue = state.queue.slice();
    if (mode === 'next' && state.index >= 0) queue.splice(state.index + 1, 0, track);
    else queue.push(track);
    set({ queue });
    preloadNext();
    schedulePersist();
  },

  removeAt: async (index) => {
    const state = get();
    if (index < 0 || index >= state.queue.length) return;
    const queue = state.queue.slice();
    const [removed] = queue.splice(index, 1);
    if (queue.length === 0) {
      getEngine().stop();
      set({ queue, index: -1, playing: false, positionMs: 0, durationMs: 0 });
      applyDuck(false);
      schedulePersist();
      return;
    }
    let nextIndex = state.index;
    if (index < state.index) nextIndex -= 1;
    else if (index === state.index) nextIndex = Math.min(index, queue.length - 1);
    const current = queue[nextIndex];
    const wasCurrent = removed?.id === state.queue[state.index]?.id;
    set({ queue, index: nextIndex });
    if (wasCurrent) {
      await getEngine().load(current, state.playing);
      publishNowPlaying(current);
      if (!state.playing) applyDuck(false);
    }
    schedulePersist();
  },

  move: (from, to) => {
    const state = get();
    if (from === to || from < 0 || from >= state.queue.length) return;
    const currentId = state.queue[state.index]?.id ?? null;
    const queue = state.queue.slice();
    const [item] = queue.splice(from, 1);
    queue.splice(Math.min(queue.length, Math.max(0, to)), 0, item);
    const index = currentId ? queue.findIndex((track) => track.id === currentId) : -1;
    set({ queue, index: index >= 0 ? index : state.index });
    schedulePersist();
  },

  clearQueue: () => {
    getEngine().stop();
    set({ queue: [], index: -1, playing: false, positionMs: 0, durationMs: 0 });
    applyDuck(false);
    schedulePersist();
  },

  next: async (auto = false) => {
    const state = get();
    if (state.fading) return;
    if (state.queue.length === 0) return;
    const next = computeNextIndex(state, state.queue.length, auto ? 'auto' : 'manual');
    if (next === null) {
      getEngine().pause();
      set({ playing: false, positionMs: 0 });
      applyDuck(false);
      return;
    }
    const track = state.queue[next];
    if (!track) return;
    const fade = fadeSeconds(state.crossfadeSec, state.durationMs, true);
    if (state.playing && fade > 0) {
      set({ fading: true });
      const ok = await getEngine().crossfadeTo(track, fade);
      set({ fading: false });
      if (!ok) {
        get().handleError(track.id, 'Could not start the next track');
        return;
      }
      set({ index: next, positionMs: 0, durationMs: track.duration_ms, error: null });
    } else {
      set({ index: next, positionMs: 0, durationMs: track.duration_ms, error: null });
      await getEngine().load(track, state.playing);
    }
    publishNowPlaying(track);
    preloadNext();
    schedulePersist();
  },

  previous: async () => {
    const state = get();
    if (state.queue.length === 0) return;
    if (state.positionMs > RESTART_THRESHOLD_MS) {
      getEngine().seek(0);
      set({ positionMs: 0 });
      return;
    }
    const index = computePreviousIndex(state, state.queue.length);
    if (index === null) {
      getEngine().seek(0);
      set({ positionMs: 0 });
      return;
    }
    const track = state.queue[index];
    if (!track) return;
    set({ index, positionMs: 0, durationMs: track.duration_ms, error: null });
    await getEngine().load(track, state.playing);
    publishNowPlaying(track);
    preloadNext();
    schedulePersist();
  },

  toggle: async () => {
    if (get().playing) get().pause();
    else await get().play();
  },

  play: async () => {
    const state = get();
    if (!state.queue[state.index]) return;
    set({ playing: true });
    await getEngine().play();
    applyDuck(true);
  },

  pause: () => {
    set({ playing: false });
    getEngine().pause();
    applyDuck(false);
    schedulePersist();
  },

  seek: (positionMs) => {
    const duration = get().durationMs;
    const clamped = Math.max(0, duration > 0 ? Math.min(duration, positionMs) : positionMs);
    getEngine().seek(clamped);
    set({ positionMs: clamped });
    schedulePersist();
  },

  setVolume: (volume) => {
    const safe = Math.min(1, Math.max(0, volume));
    getEngine().setVolume(safe);
    set({ volume: safe });
    schedulePersist();
  },

  toggleMute: () => {
    const muted = !get().muted;
    getEngine().setMuted(muted);
    set({ muted });
    schedulePersist();
  },

  setRepeat: (repeat) => {
    set({ repeat });
    schedulePersist();
  },

  setShuffle: (shuffle) => {
    set({ shuffle });
    preloadNext();
    schedulePersist();
  },

  toggleShuffle: () => {
    get().setShuffle(!get().shuffle);
  },

  setCrossfadeSec: (seconds) => {
    set({ crossfadeSec: Math.max(0, Math.min(12, seconds)) });
    schedulePersist();
  },

  setDuckDb: (db) => {
    set({ duckDb: Math.max(-30, Math.min(0, db)) });
    applyDuck(get().playing);
    schedulePersist();
  },

  handleSnapshot: (snapshot) => {
    const state = get();
    if (
      snapshot.playing === state.playing &&
      Math.abs(snapshot.positionMs - state.positionMs) < 200 &&
      Math.abs(snapshot.durationMs - state.durationMs) < 200
    ) {
      return;
    }
    set({
      playing: snapshot.playing,
      positionMs: snapshot.positionMs,
      durationMs: snapshot.durationMs || state.durationMs,
    });
    if (snapshot.playing !== state.playing) applyDuck(snapshot.playing);
    if (state.playing && !state.fading) {
      const fade = fadeSeconds(state.crossfadeSec, snapshot.durationMs, state.queue.length > 1);
      if (
        fade > 0 &&
        snapshot.durationMs > 0 &&
        snapshot.positionMs >= snapshot.durationMs - fade * 1000
      ) {
        void get().next(true);
      }
    }
  },

  handleEnded: async () => {
    if (get().fading) return;
    await get().next(true);
  },

  handleError: (trackId, message) => {
    set({ error: message });
    console.warn('[music] playback failed for', trackId, message);
  },

  currentTrack: () => {
    const state = get();
    return state.queue[state.index] ?? null;
  },

  clearError: () => set({ error: null }),
}));
