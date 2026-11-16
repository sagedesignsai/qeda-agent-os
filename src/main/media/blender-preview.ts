/**
 * main/media/blender-preview.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Serves `qeda-media://blender-preview/<runId>/preview.png` — the preview
 * render of a headless Blender job, so the model-builder chat can show what
 * a generation produced.
 *
 * The allow-list is deliberately narrow: one run dir under
 * `userData/blender-jobs` and one fixed filename. Anything else 404s, and
 * the resolved path is containment-checked against the jobs root before
 * serving.
 */

import path from 'node:path';
import { app } from 'electron';
import { serveFileRequest } from './http.js';

const RUN_ID_PATTERN = /^[A-Za-z0-9-]+$/;

export async function serveBlenderPreview(request: Request): Promise<Response> {
  let segments: string[];
  try {
    segments = new URL(request.url).pathname
      .split('/')
      .filter(Boolean)
      .map((part) => decodeURIComponent(part));
  } catch {
    return new Response(null, { status: 400 });
  }

  const [runId, filename] = segments;
  if (
    segments.length !== 2 ||
    !RUN_ID_PATTERN.test(runId ?? '') ||
    filename !== 'preview.png'
  ) {
    return new Response(null, { status: 404 });
  }

  const jobsRoot = path.join(app.getPath('userData'), 'blender-jobs');
  const filePath = path.join(jobsRoot, runId, filename);
  // Containment: the resolved file must stay inside the jobs root.
  if (!filePath.startsWith(jobsRoot + path.sep)) {
    return new Response(null, { status: 404 });
  }

  return serveFileRequest(request, filePath);
}
