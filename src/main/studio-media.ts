/**
 * main/studio-media.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Streams saved Studio videos to the renderer without copying their bytes over
 * IPC. Range responses let Chromium seek and decode only the media it needs.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createReadStream, promises as fs } from 'node:fs';
import { Readable } from 'node:stream';
import path from 'node:path';
import { protocol } from 'electron';
import { getStudioVideoPath } from './db/studio-store.js';

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
    case '.mp3':
      return 'audio/mpeg';
    case '.wav':
      return 'audio/wav';
    default:
      return 'application/octet-stream';
  }
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
    const takeId = decodeURIComponent(url.pathname.slice(1));
    if (url.hostname !== 'studio' || !takeId) {
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

    const filePath = getStudioVideoPath(takeId);
    if (!filePath) return new Response(null, { status: 404 });

    try {
      const { size } = await fs.stat(filePath);
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
