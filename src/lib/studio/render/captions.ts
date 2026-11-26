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
import {
  layoutStudioTextAnimator,
  studioTextAnimatorUnitState,
  type StudioTextAnimatorRenderState,
} from './text-style';

export const CAPTION_FONT_STACK = 'Inter, system-ui, sans-serif';
const FONT_STACK = CAPTION_FONT_STACK;

const DEFAULT_CAPTION_WEIGHT = 600;

/**
 * Font size the caption renderer uses for a given framed content box.
 *
 * The canvas gizmo measures text with the same formula so its bounding box
 * matches what is painted instead of guessing at a font.
 */
export function captionFontSizeForFrame(width: number, height: number): number {
  return Math.max(18, Math.round(Math.min(width, height) * 0.05));
}

/** `ctx.font` value shared by the renderer and the gizmo text measurement. */
export function captionFont(
  fontSize: number,
  weight: number = DEFAULT_CAPTION_WEIGHT,
): string {
  return `${weight} ${fontSize}px ${CAPTION_FONT_STACK}`;
}

export function drawStudioCaption(
  ctx: CanvasRenderingContext2D,
  {
    caption,
    style,
    frame,
    timeMs,
    animator,
  }: {
    caption: StudioCaption;
    style: StudioCaptionStyle;
    frame: StudioWindowFrame;
    timeMs: number;
    animator?: StudioTextAnimatorRenderState;
  },
): void {
  const fontSize = captionFontSizeForFrame(frame.width, frame.height);
  const bottomOffset = Math.round(
    Math.min(frame.width, frame.height) * 0.045,
  );
  const centerX = frame.x + frame.width / 2;
  const baselineY = frame.y + frame.height - bottomOffset - fontSize / 2;

  switch (style) {
    case 'minimal':
      drawMinimal(ctx, caption.text, fontSize, centerX, baselineY, animator);
      break;
    case 'karaoke':
      if (
        drawKaraoke(
          ctx,
          caption,
          fontSize,
          centerX,
          baselineY,
          timeMs,
          frame,
          animator,
        )
      ) {
        return;
      }
      drawBadge(ctx, caption.text, fontSize, centerX, baselineY, animator);
      break;
    case 'badge':
    default:
      drawBadge(ctx, caption.text, fontSize, centerX, baselineY, animator);
      break;
  }
}

/**
 * Paint a caption's tokens with the current animator state.
 *
 * The surrounding pill/band is measured from the full text so its size stays
 * stable while characters/words reveal inside it, which avoids the jitter of
 * re-measuring partially revealed text on every frame.
 */
function drawAnimatedCaptionTokens(
  ctx: CanvasRenderingContext2D,
  text: string,
  fontSize: number,
  centerX: number,
  centerY: number,
  animator: StudioTextAnimatorRenderState,
): void {
  const layout = layoutStudioTextAnimator(ctx, text, animator.mode);
  if (layout.unitCount === 0) return;
  const startX = centerX - layout.boxWidth / 2;
  const lineHeight = fontSize * 1.2;

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  layout.lines.forEach((tokens, lineIndex) => {
    const y =
      centerY +
      (lineIndex - (layout.lines.length - 1) / 2) * lineHeight;
    tokens.forEach((token) => {
      const state = studioTextAnimatorUnitState(
        animator.mode,
        animator.progress,
        token.unitIndex,
        layout.unitCount,
      );
      if (!token.text || state.alpha <= 0) return;
      ctx.save();
      ctx.globalAlpha *= state.alpha;
      ctx.fillText(
        token.text,
        startX + token.x,
        y + state.rise * fontSize * 0.35,
      );
      ctx.restore();
    });
  });
}

function setCaptionFont(
  ctx: CanvasRenderingContext2D,
  fontSize: number,
  weight = 600,
): void {
  ctx.font = captionFont(fontSize, weight);
}

function drawBadge(
  ctx: CanvasRenderingContext2D,
  text: string,
  fontSize: number,
  centerX: number,
  centerY: number,
  animator?: StudioTextAnimatorRenderState,
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

  ctx.fillStyle = '#ffffff';
  if (animator) {
    drawAnimatedCaptionTokens(ctx, text, fontSize, centerX, centerY, animator);
  } else {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, centerX, centerY);
  }
  ctx.restore();
}

function drawMinimal(
  ctx: CanvasRenderingContext2D,
  text: string,
  fontSize: number,
  centerX: number,
  centerY: number,
  animator?: StudioTextAnimatorRenderState,
): void {
  if (!text) return;
  setCaptionFont(ctx, fontSize, 600);

  ctx.save();

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

  if (animator) {
    drawAnimatedCaptionTokens(ctx, text, fontSize, centerX, centerY, animator);
  } else {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, centerX, centerY);
  }
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
  animator?: StudioTextAnimatorRenderState,
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
    const animatorState = animator
      ? studioTextAnimatorUnitState(
          animator.mode,
          animator.progress,
          index,
          words.length,
        )
      : undefined;
    if (animatorState && animatorState.alpha <= 0) {
      cursor += width + gap;
      return;
    }

    ctx.save();
    if (animatorState && animatorState.alpha < 1) {
      ctx.globalAlpha *= animatorState.alpha;
    }
    const offsetY = animatorState?.rise ? animatorState.rise * fontSize * 0.35 : 0;
    const drawY = centerY + offsetY;

    if (index === activeIndex) {
      ctx.save();
      ctx.fillStyle = 'rgba(251, 191, 36, 0.95)';
      ctx.beginPath();
      ctx.roundRect(
        cursor - wordPadX,
        drawY - fontSize / 2 - wordPadY,
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

    ctx.fillText(word.word, wordCenter, drawY);
    ctx.restore();
    cursor += width + gap;
  });

  ctx.restore();
  return true;
}
