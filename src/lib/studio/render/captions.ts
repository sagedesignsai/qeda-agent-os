/**
 * lib/studio/render/captions.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Renders the active caption in one of three styles:
 *
 *   badge    – enclosed capsule pill (the historical look)
 *   minimal  – clean lower-third text with a soft drop shadow
 *   karaoke  – word-by-word highlight driven by `resolveCaptionWordTimings`
 *
 * All measurements use `ctx.measureText`, so the layout adapts to the active
 * font without hardcoded widths.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  resolveActiveWordIndex,
  resolveCaptionWordTimings,
} from '../captions/presets';
import type { StudioCaption, StudioCaptionStyle } from '../types';
import type { StudioWindowFrame } from './geometry';

const FONT_STACK = 'Inter, system-ui, sans-serif';

export function drawStudioCaption(
  ctx: CanvasRenderingContext2D,
  {
    caption,
    style,
    frame,
    timeMs,
  }: {
    caption: StudioCaption;
    style: StudioCaptionStyle;
    frame: StudioWindowFrame;
    timeMs: number;
  },
): void {
  const fontSize = Math.max(
    18,
    Math.round(Math.min(frame.width, frame.height) * 0.05),
  );
  const bottomOffset = Math.round(
    Math.min(frame.width, frame.height) * 0.045,
  );
  const centerX = frame.x + frame.width / 2;
  const baselineY = frame.y + frame.height - bottomOffset - fontSize / 2;

  switch (style) {
    case 'minimal':
      drawMinimal(ctx, caption.text, fontSize, centerX, baselineY);
      break;
    case 'karaoke':
      if (
        drawKaraoke(ctx, caption, fontSize, centerX, baselineY, timeMs, frame)
      ) {
        return;
      }
      drawBadge(ctx, caption.text, fontSize, centerX, baselineY);
      break;
    case 'badge':
    default:
      drawBadge(ctx, caption.text, fontSize, centerX, baselineY);
      break;
  }
}

function setCaptionFont(
  ctx: CanvasRenderingContext2D,
  fontSize: number,
  weight = 600,
): void {
  ctx.font = `${weight} ${fontSize}px ${FONT_STACK}`;
}

function drawBadge(
  ctx: CanvasRenderingContext2D,
  text: string,
  fontSize: number,
  centerX: number,
  centerY: number,
): void {
  if (!text) return;
  setCaptionFont(ctx, fontSize);

  const horizontalPad = Math.round(fontSize * 1.1);
  const verticalPad = Math.round(fontSize * 0.45);
  const textWidth = ctx.measureText(text).width;
  const badgeWidth = textWidth + horizontalPad * 2;
  const badgeHeight = fontSize + verticalPad * 2;

  ctx.save();
  ctx.fillStyle = 'rgba(10, 10, 15, 0.88)';
  ctx.beginPath();
  ctx.roundRect(
    centerX - badgeWidth / 2,
    centerY - badgeHeight / 2,
    badgeWidth,
    badgeHeight,
    badgeHeight / 2,
  );
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, centerX, centerY);
  ctx.restore();
}

function drawMinimal(
  ctx: CanvasRenderingContext2D,
  text: string,
  fontSize: number,
  centerX: number,
  centerY: number,
): void {
  if (!text) return;
  setCaptionFont(ctx, fontSize, 600);

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Dark backing band improves contrast over busy video.
  const width = ctx.measureText(text).width;
  const pad = fontSize * 0.6;
  const bandHeight = fontSize * 1.5;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.beginPath();
  ctx.roundRect(
    centerX - width / 2 - pad,
    centerY - bandHeight / 2,
    width + pad * 2,
    bandHeight,
    bandHeight / 2,
  );
  ctx.fill();

  ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
  ctx.shadowBlur = 12;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, centerX, centerY);
  ctx.restore();
}

function drawKaraoke(
  ctx: CanvasRenderingContext2D,
  caption: StudioCaption,
  fontSize: number,
  centerX: number,
  centerY: number,
  timeMs: number,
  frame: StudioWindowFrame,
): boolean {
  const words = resolveCaptionWordTimings(caption);
  if (words.length === 0) return false;

  setCaptionFont(ctx, fontSize);
  const gap = Math.round(fontSize * 0.34);
  const widths = words.map((word) => ctx.measureText(word.word).width);
  const lineWidth =
    widths.reduce((sum, width) => sum + width, 0) + gap * (words.length - 1);

  const activeIndex = resolveActiveWordIndex(words, timeMs);
  const startX = centerX - lineWidth / 2;
  const wordPadX = Math.round(fontSize * 0.22);
  const wordPadY = Math.round(fontSize * 0.28);

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Legibility band behind the whole line.
  const bandPad = fontSize * 0.55;
  const bandHeight = fontSize * 1.6;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.beginPath();
  ctx.roundRect(
    Math.max(frame.x + 6, startX - bandPad),
    centerY - bandHeight / 2,
    Math.min(frame.width - 12, lineWidth + bandPad * 2),
    bandHeight,
    bandHeight / 2,
  );
  ctx.fill();

  let cursor = startX;
  words.forEach((word, index) => {
    const width = widths[index];
    const wordCenter = cursor + width / 2;

    if (index === activeIndex) {
      ctx.save();
      ctx.fillStyle = 'rgba(251, 191, 36, 0.95)';
      ctx.beginPath();
      ctx.roundRect(
        cursor - wordPadX,
        centerY - fontSize / 2 - wordPadY,
        width + wordPadX * 2,
        fontSize + wordPadY * 2,
        (fontSize + wordPadY * 2) / 2,
      );
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#111827';
    } else {
      ctx.fillStyle = index < activeIndex ? '#ffffff' : 'rgba(255,255,255,0.72)';
    }

    ctx.fillText(word.word, wordCenter, centerY);
    cursor += width + gap;
  });

  ctx.restore();
  return true;
}
