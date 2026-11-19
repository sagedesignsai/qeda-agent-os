/**
 * main/tts/media.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * `qeda-media://tts/<assetId>` playback.
 *
 * The URL names a database row, never a path. A soft-deleted row is served as
 * 404 even though its file still exists, so a removed clip stops playing
 * immediately without waiting for a purge pass. Range/HEAD handling and MIME
 * detection live in `media/http.ts`.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { serveFileRequest } from '../media/http.js';
import { getTtsAsset } from './store.js';

function idFromUrl(request: Request): string | null {
  try {
    return decodeURIComponent(new URL(request.url).pathname.slice(1)) || null;
  } catch {
    return null;
  }
}

export async function serveTtsAsset(request: Request): Promise<Response> {
  const id = idFromUrl(request);
  if (!id) return new Response(null, { status: 404 });
  const asset = getTtsAsset(id);
  if (!asset) return new Response(null, { status: 404 });
  return serveFileRequest(request, asset.path, {
    contentType: asset.mimeType,
  });
}
