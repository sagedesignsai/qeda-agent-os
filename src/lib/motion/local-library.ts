/**
 * lib/motion/local-library.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * URL shape for the pre-installed model library, shared by main and renderer.
 *
 * The catalog is an allow-list of ids, so main resolves the id back through the
 * catalog before serving bytes — a URL can only ever name a bundled GLB. The
 * renderer never sees a filesystem path.
 */

/** The `qeda-media://` host that streams a bundled catalog model by id. */
export const MOTION_LIBRARY_HOST = 'motion-library';

export function localModelMediaUrl(modelId: string): string {
  return `qeda-media://${MOTION_LIBRARY_HOST}/${encodeURIComponent(modelId)}`;
}
