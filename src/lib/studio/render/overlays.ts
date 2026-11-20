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
 * through the database (see `main/media/studio.ts`).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { StudioOverlay } from '../types';
import type { TimelineTrack } from '../types';
import { evaluateClipAtTime } from '../animation-evaluator';
import { drawClipDeviceFrame } from './clip-device-frame';
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
  tracks?: readonly TimelineTrack[],
  compTimeMs = timeMs,
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
    const timelineClip = tracks?.flatMap((track) => track.clips).find((clip) => clip.id === overlay.id);
    const transform = timelineClip?.payload?.transform;
    const anim = timelineClip
      ? evaluateClipAtTime(timelineClip.durationMs, timelineClip.payload?.enterAnimation, timelineClip.payload?.exitAnimation, compTimeMs - timelineClip.startMs)
      : null;
    const scaleX = transform?.scale?.x ?? 1;
    const scaleY = transform?.scale?.y ?? 1;

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, overlay.opacity));
    ctx.translate(centerX, centerY);
    ctx.translate(transform?.position?.x ?? 0, transform?.position?.y ?? 0);
    ctx.rotate(((overlay.rotation + (transform?.rotation ?? 0) + (anim?.rotation ?? 0)) * Math.PI) / 180);
    if (anim) ctx.scale(anim.scale * scaleX, anim.scale * scaleY);
    else ctx.scale(scaleX, scaleY);
    if (anim) ctx.globalAlpha *= anim.opacity;

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
    ctx.drawImage(asset.element, -width / 2 + (anim?.x ?? 0), -height / 2 + (anim?.y ?? 0), width, height);
    ctx.restore();

    if (timelineClip) drawClipDeviceFrame(ctx, timelineClip.payload?.deviceFrame, width, height, radius);

    // Hairline border.
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }
}
