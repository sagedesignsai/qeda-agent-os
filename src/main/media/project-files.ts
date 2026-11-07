/**
 * main/media/project-files.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The `qeda-media://project-file/<fileId>` host.
 *
 * The URL carries an opaque catalog id, never a filesystem path. Resolution goes
 * through `project_files`, so only files the scanner actually catalogued for a
 * project are reachable — the same allow-list discipline Studio and Music use.
 * Range/HEAD handling is shared with the other hosts via `media/http.ts`, which
 * is what makes video seeking work without a second implementation.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { getProjectFileRecord } from '../db/project-files.js';
import { serveFileRequest } from './http.js';

function idFromUrl(request: Request): string | null {
  try {
    const path = new URL(request.url).pathname;
    return decodeURIComponent(path.replace(/^\/+/, '')) || null;
  } catch {
    return null;
  }
}

export async function serveProjectFile(request: Request): Promise<Response> {
  const id = idFromUrl(request);
  if (!id) return new Response(null, { status: 404 });

  const record = getProjectFileRecord(id);
  if (!record || record.missing_at !== null) {
    return new Response(null, { status: 404 });
  }

  return serveFileRequest(request, record.path, {
    etag: `"${record.id}-${record.mtime_ms ?? 0}"`,
  });
}
