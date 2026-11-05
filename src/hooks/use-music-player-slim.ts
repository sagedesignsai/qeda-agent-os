/**
 * hooks/use-music-player-slim.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Minimal player hook for the Music page layout. Subscribes only to the
 * current track, playing state, and action methods — deliberately NOT to
 * positionMs, durationMs, volume, etc., which update ~4x/sec during playback.
 *
 * Components that need position data (NowPlaying, PlayerTransport) should use
 * the full `useMusicPlayer` hook instead.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect } from 'react';
import { useMusicStore } from '@/stores/music-store';

export function useMusicPlayerSlim() {
  const queue = useMusicStore((s) => s.queue);
  const index = useMusicStore((s) => s.index);
  const playing = useMusicStore((s) => s.playing);

  const hydrate = useMusicStore((s) => s.hydrate);
  const playTracks = useMusicStore((s) => s.playTracks);
  const playTrack = useMusicStore((s) => s.playTrack);
  const enqueue = useMusicStore((s) => s.enqueue);
  const next = useMusicStore((s) => s.next);
  const previous = useMusicStore((s) => s.previous);
  const toggle = useMusicStore((s) => s.toggle);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  return {
    current: queue[index] ?? null,
    playing,
    playTracks,
    playTrack,
    enqueue,
    next,
    previous,
    toggle,
  };
}

export type MusicPlayerSlim = ReturnType<typeof useMusicPlayerSlim>;
