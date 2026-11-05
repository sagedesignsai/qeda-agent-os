/**
 * main/media/http.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * One implementation of HTTP range serving for `qeda-media://`.
 *
 * Both Studio and Music stream local files through the same custom scheme, and
 * both need byte ranges so Chromium can seek. Duplicating the parser is how the
 * two hosts drift until one of them fails on a suffix range. This module owns
 * the response shape; callers own path resolution and therefore the allow-list.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createReadStream, promises as fs } from 'node:fs';
import { Readable } from 'node:stream';
import path from 'node:path';

export function mediaContentType(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case '.mp4':
    case '.m4v':
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
    case '.m4b':
      return 'audio/mp4';
    case '.aac':
      return 'audio/aac';
    case '.flac':
      return 'audio/flac';
    case '.ogg':
    case '.oga':
      return 'audio/ogg';
    case '.opus':
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
    case '.bmp':
      return 'image/bmp';
    default:
      return 'application/octet-stream';
  }
}

export function rangeNotSatisfiable(size: number): Response {
  return new Response(null, {
    status: 416,
    headers: { 'content-range': `bytes */${size}` },
  });
}

export const PREFLIGHT_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, HEAD, OPTIONS',
  'access-control-allow-headers': 'Range',
} as const;

export interface ServeFileOptions {
  contentType?: string;
  cacheControl?: string;
  etag?: string;
}

/**
 * Stream a local file in response to a `qeda-media://` request.
 *
 * The caller has already resolved `filePath` through its own allow-list; this
 * function never accepts a path from the URL.
 */
export async function serveFileRequest(
  request: Request,
  filePath: string,
  options: ServeFileOptions = {},
): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: PREFLIGHT_HEADERS });
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response(null, { status: 405 });
  }

  let size: number;
  try {
    const stats = await fs.stat(filePath);
    if (!stats.isFile()) return new Response(null, { status: 404 });
    size = stats.size;
  } catch {
    return new Response(null, { status: 404 });
  }

  const etag = options.etag;
  const headers = new Headers({
    'accept-ranges': 'bytes',
    'access-control-allow-origin': '*',
    'access-control-expose-headers':
      'Accept-Ranges, Content-Length, Content-Range, ETag',
    'content-type': options.contentType ?? mediaContentType(filePath),
    'x-content-type-options': 'nosniff',
  });
  if (options.cacheControl) headers.set('cache-control', options.cacheControl);
  if (etag) {
    headers.set('etag', etag);
    if (request.headers.get('if-none-match') === etag) {
      return new Response(null, { status: 304, headers });
    }
  }
  if (size === 0) {
    headers.set('content-length', '0');
    return new Response(null, { headers });
  }
  if (request.method === 'HEAD') {
    headers.set('content-length', String(size));
    return new Response(null, { headers });
  }

  let start = 0;
  let end = size - 1;
  let status = 200;
  const range = request.headers.get('range');
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2])) return rangeNotSatisfiable(size);
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
}
