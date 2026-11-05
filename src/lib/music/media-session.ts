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

/**
 * Fetch the artwork at `qeda-media://music-art/<id>` and return a `data:` URL.
 *
 * The Media Session API only accepts http / https / data / blob sources —
 * custom schemes are rejected outright. Converting to data: is the lightest
 * option: no object URL lifecycle to manage and no extra IPC channel needed.
 * Returns null when the track has no embedded art (404) or the fetch fails.
 */
async function artworkDataUrl(trackId: string): Promise<string | null> {
  try {
    const response = await fetch(musicArtUrl(trackId));
    if (!response.ok) return null;
    const blob = await response.blob();
    return new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => resolve('');
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export function publishNowPlaying(track: MusicTrack | null): void {
  const media = session();
  if (!media) return;
  if (!track) {
    media.metadata = null;
    return;
  }
  // Set text metadata immediately so the OS widget updates without waiting for
  // the artwork fetch.
  try {
    media.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist ?? '',
      album: track.album ?? '',
    });
  } catch {
    /* MediaMetadata unavailable */
    return;
  }
  // Then resolve artwork asynchronously and patch it in. The Media Session API
  // only accepts http / https / data / blob sources, so qeda-media:// must be
  // fetched and re-encoded as a data: URL first.
  void artworkDataUrl(track.id).then((src) => {
    // Guard: a later publishNowPlaying() may have replaced metadata already.
    if (!src || !media.metadata || media.metadata.title !== track.title) return;
    try {
      media.metadata.artwork = [
        { src, sizes: '512x512', type: 'image/jpeg' },
      ];
    } catch {
      /* artwork setter unavailable in this runtime */
    }
  });
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
