/**
 * main/media/music.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The two `qeda-media://` hosts the music feature owns.
 *
 *   `qeda-media://music/<trackId>`      → the indexed audio file
 *   `qeda-media://music-art/<trackId>`  → the lazily extracted cover
 *
 * Both resolve the id through `music_tracks` before touching the filesystem.
 * That indirection is the security boundary: the renderer never learns a path,
 * so it cannot ask the protocol for an arbitrary file.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { getMusicTrack } from '../db/music-store.js';
import { getTrackArtwork } from '../music/art.js';
import { serveFileRequest } from './http.js';

function idFromUrl(request: Request): string {
  const url = new URL(request.url);
  try {
    return decodeURIComponent(url.pathname.slice(1));
  } catch {
    return '';
  }
}

export async function serveMusicMedia(request: Request): Promise<Response> {
  const id = idFromUrl(request);
  const track = id ? getMusicTrack(id) : null;
  if (!track) return new Response(null, { status: 404 });
  return serveFileRequest(request, track.path);
}

export async function serveMusicArt(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, HEAD, OPTIONS',
      },
    });
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response(null, { status: 405 });
  }

  const id = idFromUrl(request);
  const artwork = id ? await getTrackArtwork(id) : null;
  if (!artwork) return new Response(null, { status: 404 });

  const headers = new Headers({
    'access-control-allow-origin': '*',
    'content-type': artwork.mime,
    // The URL is keyed by mtime through the cache name, but the renderer only
    // knows the track id, so keep this short-lived rather than immutable.
    'cache-control': 'public, max-age=3600',
    'x-content-type-options': 'nosniff',
  });
  if (request.method === 'HEAD') {
    headers.set('content-length', String(artwork.bytes.length));
    return new Response(null, { headers });
  }
  headers.set('content-length', String(artwork.bytes.length));
  return new Response(artwork.bytes as unknown as BodyInit, { headers });
}
