/**
 * lib/studio/media.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared contract for the `qeda-media://` scheme, used by both the main-process
 * protocol handler and the renderer that points media elements at it.
 *
 * Keeping the host constant here (not in the render folder) lets the main
 * handler import it without pulling in canvas code.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Host segment that addresses a take's media overlays. */
export const STUDIO_OVERLAY_HOST = 'overlay';

/** Host segment that addresses a primary take recording. */
export const STUDIO_TAKE_HOST = 'studio';

/** URL the renderer loads an overlay's pixels from. */
export function studioOverlayMediaUrl(overlayId: string): string {
  return `qeda-media://${STUDIO_OVERLAY_HOST}/${encodeURIComponent(overlayId)}`;
}
