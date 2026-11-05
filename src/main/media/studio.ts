/**
 * main/media/studio.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Studio takes and picture-in-picture overlays.
 *
 * Both resolve an id through `db/studio-store`, so the protocol never accepts a
 * path from the URL. Range/HEAD handling lives in `media/http.ts`; this module
 * only chooses the file (including the derivative→source fallback).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { promises as fs } from 'node:fs';
import {
  getStudioOverlaySource,
  getStudioVideoPath,
} from '../db/studio-store.js';
import { serveFileRequest } from './http.js';

type Variant = 'source' | 'optimized' | 'filmstrip';

function idFromUrl(request: Request): string | null {
  try {
    return decodeURIComponent(new URL(request.url).pathname.slice(1)) || null;
  } catch {
    return null;
  }
}

function variantFromUrl(request: Request): Variant {
  const value = new URL(request.url).searchParams.get('variant');
  if (value === 'optimized') return 'optimized';
  if (value === 'filmstrip') return 'filmstrip';
  return 'source';
}

export async function serveStudioTake(request: Request): Promise<Response> {
  const id = idFromUrl(request);
  if (!id) return new Response(null, { status: 404 });

  const variant = variantFromUrl(request);
  let filePath = getStudioVideoPath(id, variant);
  if (!filePath) return new Response(null, { status: 404 });

  // A requested derivative can be missing while the source still exists; serve
  // the source rather than a 404.
  if (variant !== 'source') {
    try {
      await fs.stat(filePath);
    } catch {
      filePath = getStudioVideoPath(id, 'source');
    }
  }
  if (!filePath) return new Response(null, { status: 404 });
  return serveFileRequest(request, filePath);
}

export async function serveOverlay(request: Request): Promise<Response> {
  const id = idFromUrl(request);
  if (!id) return new Response(null, { status: 404 });
  const filePath = getStudioOverlaySource(id);
  if (!filePath) return new Response(null, { status: 404 });
  return serveFileRequest(request, filePath);
}
