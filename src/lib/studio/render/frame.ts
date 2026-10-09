/**
 * lib/studio/render/frame.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Draws the "screen-recording window" chrome: the drop shadow behind the frame,
 * the frosted header bar with macOS-style traffic dots, and the border stroke.
 *
 * Callers clip to the rounded frame before drawing content, then call
 * `drawStudioWindowChrome` while still clipped so the header corners stay round.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { StudioWindowFrame } from './geometry';

export function drawStudioWindowShadow(
  ctx: CanvasRenderingContext2D,
  frame: StudioWindowFrame,
): void {
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
  ctx.shadowBlur = 24;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 14;
  ctx.beginPath();
  ctx.roundRect(frame.x, frame.y, frame.width, frame.height, frame.radius);
  ctx.fillStyle = '#0f1117';
  ctx.fill();
  ctx.restore();
}

export function drawStudioWindowChrome(
  ctx: CanvasRenderingContext2D,
  frame: StudioWindowFrame,
): void {
  const { x, y, width, headerHeight } = frame;

  // Frosted header bar.
  ctx.fillStyle = 'rgba(15, 17, 23, 0.75)';
  ctx.fillRect(x, y, width, headerHeight);

  // Header separator.
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.beginPath();
  ctx.moveTo(x, y + headerHeight);
  ctx.lineTo(x + width, y + headerHeight);
  ctx.stroke();

  // Traffic dots.
  const dotY = y + headerHeight / 2;
  const dotRadius = 4.5;
  const dots = ['#ef4444', '#f59e0b', '#10b981'];
  dots.forEach((color, index) => {
    ctx.beginPath();
    ctx.arc(x + 16 + index * 14, dotY, dotRadius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  });

  // Frame border.
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x, y, width, frame.height, frame.radius);
  ctx.stroke();
}
