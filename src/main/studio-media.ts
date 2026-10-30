/**
 * main/studio-media.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Streams saved Studio media to the renderer without copying bytes over IPC.
 * Range responses let Chromium seek and decode only the media it needs.
 *
 * Two addressable hosts under one scheme:
 *   - `qeda-media://studio/<takeId>`     → the take's primary recording
 *   - `qeda-media://overlay/<overlayId>` → a picture-in-picture overlay asset
 *
 * The overlay host resolves its path *through the database* (only paths that a
 * persisted overlay references are reachable), so this is not an arbitrary
 * filesystem read surface.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createReadStream, promises as fs } from 'node:fs';
import { Readable } from 'node:stream';
import path from 'node:path';
import { protocol } from 'electron';
import {
  getStudioVideoPath,
  getStudioOverlaySource,
} from './db/studio-store.js';
import { STUDIO_OVERLAY_HOST, STUDIO_TAKE_HOST } from '../lib/studio/media.js';
import { getMotionAssetStore } from './motion/service.js';

export const STUDIO_MEDIA_SCHEME = 'qeda-media';

/** Must run before app.ready so Chromium recognizes the custom media scheme. */
export function registerStudioMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: STUDIO_MEDIA_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        stream: true,
        corsEnabled: true,
      },
    },
  ]);
}

function mediaType(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case '.mp4':
      return 'video/mp4';
    case '.mov':
      return 'video/quicktime';
    case '.webm':
      return 'video/webm';
    case '.mkv':
      return 'video/x-matroska';
    case '.mp3':
      return 'audio/mpeg';
    case '.wav':
      return 'audio/wav';
    case '.m4a':
      return 'audio/mp4';
    case '.ogg':
      return 'audio/ogg';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.svg':
      return 'image/svg+xml';
    case '.avif':
      return 'image/avif';
    default:
      return 'application/octet-stream';
  }
}

/** Resolve a request host+id to an allow-listed on-disk path. */
function resolveMediaPath(
  hostname: string,
  id: string,
  variant: 'source' | 'optimized' | 'filmstrip' = 'source',
): string | null {
  if (hostname === STUDIO_TAKE_HOST) return getStudioVideoPath(id, variant);
  if (hostname === STUDIO_OVERLAY_HOST) return getStudioOverlaySource(id);
  return null;
}

function rangeNotSatisfiable(size: number): Response {
  return new Response(null, {
    status: 416,
    headers: { 'content-range': `bytes */${size}` },
  });
}

export function registerStudioMediaHandler(): void {
  protocol.handle(STUDIO_MEDIA_SCHEME, async (request) => {
    const url = new URL(request.url);
    if (url.hostname === 'motion' || url.hostname === 'motion-staging') {
      return serveMotionMediaRequest(request);
    }
    const id = decodeURIComponent(url.pathname.slice(1));
    if (!id) {
      return new Response(null, { status: 404 });
    }
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET, HEAD, OPTIONS',
          'access-control-allow-headers': 'Range',
        },
      });
    }
    if (!['GET', 'HEAD'].includes(request.method)) {
      return new Response(null, { status: 405 });
    }

    const variantParam = url.searchParams.get('variant');
    const variant =
      variantParam === 'optimized'
        ? 'optimized'
        : variantParam === 'filmstrip'
          ? 'filmstrip'
          : 'source';

    let filePath = resolveMediaPath(url.hostname, id, variant);
    if (!filePath && variant !== 'source') {
      filePath = resolveMediaPath(url.hostname, id, 'source');
    }
    if (!filePath) return new Response(null, { status: 404 });

    try {
      let size = 0;
      try {
        const stats = await fs.stat(filePath);
        size = stats.size;
      } catch {
        // If variant was requested but missing on disk, fallback to source file
        if (variant !== 'source') {
          const sourcePath = resolveMediaPath(url.hostname, id, 'source');
          if (sourcePath) {
            const stats = await fs.stat(sourcePath);
            filePath = sourcePath;
            size = stats.size;
          }
        }
      }
      if (size === 0 && filePath) {
        const stats = await fs.stat(filePath);
        size = stats.size;
      }
      const headers = new Headers({
        'accept-ranges': 'bytes',
        'access-control-allow-origin': '*',
        'access-control-expose-headers':
          'Accept-Ranges, Content-Length, Content-Range',
        'content-type': mediaType(filePath),
      });
      if (size === 0) {
        headers.set('content-length', '0');
        return new Response(null, { headers });
      }
      const range = request.headers.get('range');

      if (request.method === 'HEAD') {
        headers.set('content-length', String(size));
        return new Response(null, { headers });
      }

      let start = 0;
      let end = size - 1;
      let status = 200;
      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range);
        if (!match || (!match[1] && !match[2])) {
          return rangeNotSatisfiable(size);
        }
        if (!match[1]) {
          const suffixLength = Number(match[2]);
          if (suffixLength <= 0) return rangeNotSatisfiable(size);
          start = Math.max(0, size - suffixLength);
        } else {
          start = Number(match[1]);
          if (match[2]) end = Math.min(Number(match[2]), end);
        }
        if (start >= size || start > end) return rangeNotSatisfiable(size);
        status = 206;
        headers.set('content-range', `bytes ${start}-${end}/${size}`);
      }

      headers.set('content-length', String(end - start + 1));
      const stream = createReadStream(filePath, { start, end });
      return new Response(Readable.toWeb(stream) as ReadableStream, {
        status,
        headers,
      });
    } catch {
      return new Response(null, { status: 404 });
    }
  });
}

/** Serves only index-backed committed assets or short-lived staged imports. */
export async function serveMotionMediaRequest(
  request: Request,
  assetStore: Pick<ReturnType<typeof getMotionAssetStore>, 'resolveAsset' | 'resolveAssetFrame' | 'resolveStaged'> = getMotionAssetStore(),
): Promise<Response> {
  const url = new URL(request.url);
  const staging = url.hostname === 'motion-staging';
  if (!staging && url.hostname !== 'motion') return new Response(null, { status: 404 });
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, HEAD, OPTIONS',
        'access-control-allow-headers': 'Range',
      },
    });
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405 });

  let segments: string[];
  try {
    segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  } catch {
    return new Response(null, { status: 400 });
  }
  let media: { path: string; mimeType: string; hash?: string } | null = null;
  if (staging && segments.length === 1) {
    media = await assetStore.resolveStaged(segments[0]);
  } else if (!staging && segments.length === 2) {
    media = await assetStore.resolveAsset(segments[0], segments[1]);
  } else if (!staging && segments.length === 3 && /^\d+$/.test(segments[2])) {
    media = await assetStore.resolveAssetFrame(segments[0], segments[1], Number(segments[2]));
  }
  if (!media) return new Response(null, { status: 404 });

  try {
    const stat = await fs.stat(media.path);
    if (!stat.isFile()) return new Response(null, { status: 404 });
    const etag = media.hash ? `"${media.hash}"` : undefined;
    const headers = new Headers({
      'accept-ranges': 'bytes',
      'access-control-allow-origin': '*',
      'access-control-expose-headers': 'Accept-Ranges, Content-Length, Content-Range, ETag',
      'cache-control': 'no-cache',
      'content-type': media.mimeType,
      'x-content-type-options': 'nosniff',
    });
    if (etag) {
      headers.set('etag', etag);
      if (request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers });
    }
    if (request.method === 'HEAD') {
      headers.set('content-length', String(stat.size));
      return new Response(null, { headers });
    }
    let start = 0;
    let end = stat.size - 1;
    let status = 200;
    const range = request.headers.get('range');
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match || (!match[1] && !match[2])) return rangeNotSatisfiable(stat.size);
      if (!match[1]) {
        const suffixLength = Number(match[2]);
        if (!suffixLength) return rangeNotSatisfiable(stat.size);
        start = Math.max(0, stat.size - suffixLength);
      } else {
        start = Number(match[1]);
        if (match[2]) end = Math.min(Number(match[2]), end);
      }
      if (start >= stat.size || start > end) return rangeNotSatisfiable(stat.size);
      status = 206;
      headers.set('content-range', `bytes ${start}-${end}/${stat.size}`);
    }
    headers.set('content-length', String(Math.max(0, end - start + 1)));
    if (stat.size === 0) return new Response(null, { headers });
    const stream = createReadStream(media.path, { start, end });
    return new Response(Readable.toWeb(stream) as ReadableStream, { status, headers });
  } catch {
    return new Response(null, { status: 404 });
  }
}
