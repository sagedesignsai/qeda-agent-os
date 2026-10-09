/**
 * lib/studio/render/overlays.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Composites picture-in-picture image / video overlays inside the window frame.
 *
 * Geometry is normalized to the content box (`x`/`y` are the element centre,
 * `widthPct` its width fraction) so a lower-third image lands in the same
 * relative spot at 16:9 and 9:16.
 *
 * The media bytes are never read here: the renderer points `<img>`/`<video>` at
 * the `qeda-media://overlay/<id>` scheme, whose handler resolves the source
 * through the database (see `main/studio-media.ts`).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { StudioOverlay } from '../types';
import type { StudioWindowFrame } from './geometry';

export { studioOverlayMediaUrl } from '../media';

export interface StudioOverlayAsset {
  element: CanvasImageSource;
  width: number;
  height: number;
}

export function drawStudioOverlays(
  ctx: CanvasRenderingContext2D,
  overlays: readonly StudioOverlay[] | undefined,
  assets: ReadonlyMap<string, StudioOverlayAsset>,
  frame: StudioWindowFrame,
  timeMs: number,
): void {
  if (!overlays || overlays.length === 0) return;

  for (const overlay of overlays) {
    if (timeMs < overlay.startMs || timeMs > overlay.endMs) continue;
    const asset = assets.get(overlay.id);
    if (!asset || asset.width <= 0 || asset.height <= 0) continue;

    const aspect = asset.width / asset.height;
    const width = Math.max(24, overlay.widthPct * frame.contentWidth);
    const height = width / aspect;
    const centerX = frame.contentX + overlay.x * frame.contentWidth;
    const centerY = frame.contentY + overlay.y * frame.contentHeight;

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, overlay.opacity));
    ctx.translate(centerX, centerY);
    ctx.rotate((overlay.rotation * Math.PI) / 180);

    const radius = Math.max(0, overlay.cornerRadius);
    ctx.beginPath();
    ctx.roundRect(-width / 2, -height / 2, width, height, radius);

    // Soft drop shadow so the overlay reads as a separate layer.
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 10;
    ctx.save();
    ctx.clip();
    ctx.shadowColor = 'transparent';
    ctx.drawImage(asset.element, -width / 2, -height / 2, width, height);
    ctx.restore();

    // Hairline border.
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }
}
