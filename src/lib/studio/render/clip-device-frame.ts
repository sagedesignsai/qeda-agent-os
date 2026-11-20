import type { ClipDeviceFrame } from '../types';

/** Draws a device bezel around one transformed video or image layer. */
export function drawClipDeviceFrame(
  ctx: CanvasRenderingContext2D,
  frame: ClipDeviceFrame | undefined,
  width: number,
  height: number,
  cornerRadius: number,
): void {
  if (!frame || frame.type === 'none') return;
  const pad = Math.max(2, frame.padding ?? (frame.type === 'iphone' ? 10 : 6));
  const frameRadius = frame.type === 'iphone'
    ? Math.min(width, height) * 0.1
    : Math.min(cornerRadius + pad, 18);

  ctx.beginPath();
  ctx.roundRect(-width / 2 - pad, -height / 2 - pad, width + pad * 2, height + pad * 2, frameRadius);
  ctx.strokeStyle = frame.color ?? (frame.type === 'glass' ? 'rgba(220,240,255,.7)' : '#303541');
  ctx.lineWidth = pad;
  ctx.stroke();

  if (frame.type === 'browser' || frame.type === 'macbook') {
    ctx.fillStyle = frame.color ?? '#252a34';
    ctx.fillRect(-width / 2, -height / 2 - pad, width, pad * 1.5);
  } else if (frame.type === 'iphone') {
    ctx.fillStyle = frame.color ?? '#111318';
    ctx.beginPath();
    ctx.roundRect(-width * 0.12, -height / 2 - pad * 0.45, width * 0.24, pad * 0.75, pad * 0.35);
    ctx.fill();
  }
}
