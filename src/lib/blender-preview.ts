/**
 * lib/blender-preview.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Address a Blender job's preview render through the `qeda-media://` scheme
 * so the renderer can display it (e.g. in the Blender tool cards) without
 * reading arbitrary files off disk.
 *
 * Jobs live under `userData/blender-jobs/<runId>/preview.png`. Only that
 * exact file is servable — the main-process host allow-lists the run dir and
 * filename, so a URL can never escape into other files.
 */

export const BLENDER_PREVIEW_HOST = 'blender-preview';

const RUN_ID_PATTERN = /^[A-Za-z0-9-]+$/;

/** Renderer URL for a job's preview render. */
export function blenderPreviewUrl(runId: string, filename = 'preview.png'): string {
  return `qeda-media://${BLENDER_PREVIEW_HOST}/${encodeURIComponent(runId)}/${encodeURIComponent(filename)}`;
}

/**
 * Extract the run id from an absolute job preview path
 * (`…/blender-jobs/<runId>/preview.png`), or null when the path does not
 * match that layout.
 */
export function blenderPreviewRunId(previewPath: string): string | null {
  const parts = previewPath.split(/[\\/]+/);
  const jobsIndex = parts.lastIndexOf('blender-jobs');
  if (jobsIndex < 0 || jobsIndex + 2 >= parts.length) return null;
  const runId = parts[jobsIndex + 1];
  return RUN_ID_PATTERN.test(runId ?? '') ? runId : null;
}

/** Renderer URL for a job preview path, or undefined when it cannot be addressed. */
export function blenderPreviewUrlForPath(previewPath?: string): string | undefined {
  if (!previewPath) return undefined;
  const runId = blenderPreviewRunId(previewPath);
  return runId ? blenderPreviewUrl(runId) : undefined;
}
