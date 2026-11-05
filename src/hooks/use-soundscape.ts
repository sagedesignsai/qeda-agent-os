/**
 * hooks/use-soundscape.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * React binding for the app-wide soundscape store. Replaces the old
 * `use-focus-audio` hook, which owned a page-local engine and disposed its
 * AudioContext on unmount.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useSoundscapeStore, soundscapeAudible } from '@/stores/soundscape-store';
import type { SoundscapeLayerId, SoundscapeState } from '@/lib/music/types';

export function useSoundscape() {
  const state = useSoundscapeStore((s) => s.state);
  const sceneId = useSoundscapeStore((s) => s.sceneId);
  const started = useSoundscapeStore((s) => s.started);
  const setScene = useSoundscapeStore((s) => s.setScene);
  const replaceState = useSoundscapeStore((s) => s.replaceState);
  const patchState = useSoundscapeStore((s) => s.patchState);
  const setLayer = useSoundscapeStore((s) => s.setLayer);
  const start = useSoundscapeStore((s) => s.start);
  const stop = useSoundscapeStore((s) => s.stop);
  const toggle = useSoundscapeStore((s) => s.toggle);

  return {
    state,
    sceneId,
    started,
    playing: started && soundscapeAudible(state),
    setScene,
    replaceState,
    patchState,
    setLayer: (id: SoundscapeLayerId, volume: number | null) =>
      setLayer(id, volume),
    start,
    stop,
    toggle,
  };
}

export type Soundscape = ReturnType<typeof useSoundscape>;

/** Convenience for scene cards that only need the active layer count. */
export function activeLayerCount(state: SoundscapeState): number {
  return Object.keys(state.layers).length;
}
