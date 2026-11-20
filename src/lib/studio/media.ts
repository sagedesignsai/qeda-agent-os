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

/** Host segment that addresses image assets attached to a composition. */
export const STUDIO_COMPOSITION_ASSET_HOST = 'studio-asset';
/** Host segment that addresses media-pool assets attached to Studio takes. */
export const STUDIO_MEDIA_ASSET_HOST = 'studio-media-asset';

/** URL the renderer loads an overlay's pixels from. */
export function studioOverlayMediaUrl(overlayId: string): string {
  return `qeda-media://${STUDIO_OVERLAY_HOST}/${encodeURIComponent(overlayId)}`;
}

export function studioCompositionAssetMediaUrl(assetId: string): string {
  return `qeda-media://${STUDIO_COMPOSITION_ASSET_HOST}/${encodeURIComponent(assetId)}`;
}

export function studioMediaAssetUrl(assetId: string): string {
  return `qeda-media://${STUDIO_MEDIA_ASSET_HOST}/${encodeURIComponent(assetId)}`;
}

export function studioTakeMediaUrl(takeId: string): string {
  return `qeda-media://${STUDIO_TAKE_HOST}/${encodeURIComponent(takeId)}`;
}
