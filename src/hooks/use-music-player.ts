/**
 * hooks/use-music-player.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * React binding for the app-wide player. The store is created once; this hook
 * only hydrates it from SQLite on first mount and exposes the current track.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect } from 'react';
import { useMusicStore } from '@/stores/music-store';

export function useMusicPlayer() {
  const queue = useMusicStore((s) => s.queue);
  const index = useMusicStore((s) => s.index);
  const playing = useMusicStore((s) => s.playing);
  const positionMs = useMusicStore((s) => s.positionMs);
  const durationMs = useMusicStore((s) => s.durationMs);
  const volume = useMusicStore((s) => s.volume);
  const muted = useMusicStore((s) => s.muted);
  const repeat = useMusicStore((s) => s.repeat);
  const shuffle = useMusicStore((s) => s.shuffle);
  const crossfadeSec = useMusicStore((s) => s.crossfadeSec);
  const duckDb = useMusicStore((s) => s.duckDb);
  const fading = useMusicStore((s) => s.fading);
  const hydrated = useMusicStore((s) => s.hydrated);
  const error = useMusicStore((s) => s.error);

  const hydrate = useMusicStore((s) => s.hydrate);
  const playTracks = useMusicStore((s) => s.playTracks);
  const playTrack = useMusicStore((s) => s.playTrack);
  const enqueue = useMusicStore((s) => s.enqueue);
  const removeAt = useMusicStore((s) => s.removeAt);
  const move = useMusicStore((s) => s.move);
  const clearQueue = useMusicStore((s) => s.clearQueue);
  const next = useMusicStore((s) => s.next);
  const previous = useMusicStore((s) => s.previous);
  const toggle = useMusicStore((s) => s.toggle);
  const play = useMusicStore((s) => s.play);
  const pause = useMusicStore((s) => s.pause);
  const seek = useMusicStore((s) => s.seek);
  const setVolume = useMusicStore((s) => s.setVolume);
  const toggleMute = useMusicStore((s) => s.toggleMute);
  const setRepeat = useMusicStore((s) => s.setRepeat);
  const setShuffle = useMusicStore((s) => s.setShuffle);
  const toggleShuffle = useMusicStore((s) => s.toggleShuffle);
  const setCrossfadeSec = useMusicStore((s) => s.setCrossfadeSec);
  const setDuckDb = useMusicStore((s) => s.setDuckDb);
  const clearError = useMusicStore((s) => s.clearError);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  return {
    queue,
    index,
    current: queue[index] ?? null,
    playing,
    positionMs,
    durationMs,
    volume,
    muted,
    repeat,
    shuffle,
    crossfadeSec,
    duckDb,
    fading,
    hydrated,
    error,
    playTracks,
    playTrack,
    enqueue,
    removeAt,
    move,
    clearQueue,
    next,
    previous,
    toggle,
    play,
    pause,
    seek,
    setVolume,
    toggleMute,
    setRepeat,
    setShuffle,
    toggleShuffle,
    setCrossfadeSec,
    setDuckDb,
    clearError,
  };
}

export type MusicPlayer = ReturnType<typeof useMusicPlayer>;
