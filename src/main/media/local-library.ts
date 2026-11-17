/**
 * main/media/local-library.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Serves pre-installed catalog models to the renderer so the asset dialog can
 * preview a GLB before it is imported.
 *
 * The URL names a catalog id, never a path: `resolveLocalModelPath` only answers
 * for ids the bundled catalog contains, which keeps this host as tightly
 * allow-listed as the project-backed motion hosts.
 */

import { MOTION_LIBRARY_HOST } from '../../lib/motion/local-library.js';
import { resolveLocalModelPath } from '../motion/local-models.js';
import { serveFileRequest } from './http.js';

export async function serveLocalModel(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (url.hostname !== MOTION_LIBRARY_HOST) return new Response(null, { status: 404 });

  let segments: string[];
  try {
    segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  } catch {
    return new Response(null, { status: 400 });
  }
  if (segments.length !== 1) return new Response(null, { status: 404 });

  const modelPath = resolveLocalModelPath(segments[0]);
  if (!modelPath) return new Response(null, { status: 404 });

  return serveFileRequest(request, modelPath, {
    contentType: 'model/gltf-binary',
    cacheControl: 'no-cache',
  });
}
