/**
 * stores/soundscape-store.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * App-wide soundscape state. The engine is a module singleton and the store is
 * its only caller; components read this store, never the engine directly.
 *
 * The store outlives the page that started playback on purpose — walking from
 * Tasks to Music must not silence the rain.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { create } from 'zustand';
import { DEFAULT_SOUNDSCAPE_STATE } from '@/lib/music/scenes';
import type {
  SoundscapeLayerId,
  SoundscapeState,
} from '@/lib/music/types';
import { getSoundscapeEngine } from '@/lib/soundscape/engine';

interface SoundscapeStoreState {
  state: SoundscapeState;
  sceneId: string;
  started: boolean;
  setScene: (sceneId: string, state: SoundscapeState) => void;
  replaceState: (state: SoundscapeState) => void;
  patchState: (patch: Partial<SoundscapeState>) => void;
  setLayer: (id: SoundscapeLayerId, volume: number | null) => void;
  start: (state?: SoundscapeState) => Promise<void>;
  stop: () => void;
  toggle: () => Promise<void>;
}

export const useSoundscapeStore = create<SoundscapeStoreState>((set, get) => ({
  state: DEFAULT_SOUNDSCAPE_STATE,
  sceneId: 'deep-work',
  started: false,

  setScene: (sceneId, state) => {
    set({ sceneId, state });
    if (get().started) getSoundscapeEngine().update(state);
  },

  replaceState: (state) => {
    set({ state });
    if (get().started) getSoundscapeEngine().update(state);
  },

  patchState: (patch) => {
    const state = { ...get().state, ...patch };
    set({ state });
    if (get().started) getSoundscapeEngine().update(state);
  },

  setLayer: (id, volume) => {
    const layers = { ...get().state.layers };
    if (volume === null || volume <= 0) delete layers[id];
    else layers[id] = { volume };
    const state = { ...get().state, layers };
    set({ state });
    if (get().started) getSoundscapeEngine().update(state);
  },

  start: async (state) => {
    const next = state ?? get().state;
    set({ state: next, started: true });
    await getSoundscapeEngine().start(next);
  },

  stop: () => {
    getSoundscapeEngine().stop();
    set({ started: false });
  },

  toggle: async () => {
    if (get().started) {
      get().stop();
      return;
    }
    await get().start();
  },
}));

/** True when the engine should be producing sound. */
export function soundscapeAudible(state: SoundscapeState): boolean {
  return (
    Object.keys(state.layers).length > 0 ||
    state.noise !== null ||
    state.toneMode !== 'off'
  );
}
