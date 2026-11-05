/**
 * lib/music/media-session.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * OS integration: media keys, the desktop "now playing" widget and headset
 * buttons. This is a thin wrapper so the store does not need to know whether
 * the Media Session API exists (it does not in jsdom).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { musicArtUrl } from './media';
import type { MusicTrack } from './types';

export interface MediaSessionHandlers {
  play: () => void;
  pause: () => void;
  next: () => void;
  previous: () => void;
  seek: (positionMs: number) => void;
}

function session(): MediaSession | null {
  if (typeof navigator === 'undefined') return null;
  return navigator.mediaSession ?? null;
}

export function publishNowPlaying(track: MusicTrack | null): void {
  const media = session();
  if (!media) return;
  if (!track) {
    media.metadata = null;
    return;
  }
  try {
    media.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist ?? '',
      album: track.album ?? '',
      artwork: [
        { src: musicArtUrl(track.id), sizes: '512x512', type: 'image/jpeg' },
      ],
    });
  } catch {
    /* MediaMetadata unavailable */
  }
}

export function bindMediaSession(handlers: MediaSessionHandlers): () => void {
  const media = session();
  if (!media) return () => {};
  const bind = (action: MediaSessionAction, fn: MediaSessionActionHandler) => {
    try {
      media.setActionHandler(action, fn);
    } catch {
      /* action unsupported */
    }
  };
  bind('play', () => handlers.play());
  bind('pause', () => handlers.pause());
  bind('nexttrack', () => handlers.next());
  bind('previoustrack', () => handlers.previous());
  bind('seekto', (details) => {
    if (typeof details.seekTime === 'number') {
      handlers.seek(details.seekTime * 1000);
    }
  });
  return () => {
    for (const action of [
      'play',
      'pause',
      'nexttrack',
      'previoustrack',
      'seekto',
    ] as MediaSessionAction[]) {
      try {
        media.setActionHandler(action, null);
      } catch {
        /* ignore */
      }
    }
  };
}

export function setPlaybackState(playing: boolean): void {
  const media = session();
  if (!media) return;
  media.playbackState = playing ? 'playing' : 'paused';
}
