import type {
  StudioCaption,
  StudioTextStyle,
  TextAnimator,
  TextAnimatorMode,
  TimelineClip,
} from '../types';

export interface ResolvedStudioTextStyle {
  fontFamily: string;
  fontSize: number;
  color: string;
  align: 'left' | 'center' | 'right';
}

export interface StudioTextRenderStyle extends ResolvedStudioTextStyle {
  fontWeight?: number | string;
  lineHeight?: number;
  letterSpacing?: number;
  maxWidth?: number;
  stroke?: { color: string; width: number };
  shadow?: { color: string; blur: number; offsetX: number; offsetY: number };
}

export const DEFAULT_STUDIO_TEXT_STYLE: ResolvedStudioTextStyle = {
  fontFamily: 'Arial, sans-serif',
  fontSize: 64,
  color: '#ffffff',
  align: 'center',
};

export const STUDIO_TEXT_FONT_OPTIONS = [
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Inter', value: 'Inter, system-ui, sans-serif' },
  { label: 'Courier New', value: '"Courier New", monospace' },
] as const;

export function resolveStudioTextStyle(
  style?: StudioTextStyle,
): ResolvedStudioTextStyle {
  const align = style?.align;
  return {
    fontFamily:
      style?.fontFamily?.trim() || DEFAULT_STUDIO_TEXT_STYLE.fontFamily,
    fontSize:
      typeof style?.fontSize === 'number' && Number.isFinite(style.fontSize)
        ? Math.max(12, Math.min(256, Math.round(style.fontSize)))
        : DEFAULT_STUDIO_TEXT_STYLE.fontSize,
    color: style?.color?.trim() || DEFAULT_STUDIO_TEXT_STYLE.color,
    align:
      align === 'left' || align === 'right'
        ? align
        : DEFAULT_STUDIO_TEXT_STYLE.align,
  };
}

export function usesStudioFreeTextClip(
  clip: Pick<TimelineClip, 'payload'>,
): boolean {
  return Boolean(
    clip.payload?.textStyle ||
    clip.payload?.transform ||
    clip.payload?.x !== undefined ||
    clip.payload?.y !== undefined,
  );
}

export function applyStudioTextAnimator(
  caption: StudioCaption,
  animator: { mode: TextAnimatorMode; progress: number },
): StudioCaption {
  const text = caption.text || '';
  const progress = Math.max(0, Math.min(1, animator.progress));

  if (animator.mode === 'typewriter' || animator.mode === 'slide-up') {
    return {
      ...caption,
      text: text.substring(0, Math.floor(progress * text.length)),
    };
  }

  if (animator.mode === 'fade-words') {
    if (!caption.words || caption.words.length === 0) {
      return {
        ...caption,
        text: text.substring(0, Math.floor(progress * text.length)),
      };
    }

    const wordCount = Math.floor(progress * caption.words.length);
    if (wordCount === 0) return { ...caption, text: '' };
    const lastWord = caption.words[wordCount - 1];
    const wordIndex = text.indexOf(lastWord.word);
    const endChar =
      wordIndex === -1 ? text.length : wordIndex + lastWord.word.length;
    return { ...caption, text: text.substring(0, endChar) };
  }

  return caption;
}

function easeTextProgress(value: number, easing: string | undefined): number {
  const t = Math.max(0, Math.min(1, value));
  if (easing === 'ease-out') return 1 - (1 - t) ** 2;
  if (easing === 'ease-in-out') {
    return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
  }
  if (easing?.startsWith('cubic-bezier')) return 1 - (1 - t) ** 3;
  return t;
}

/** Snapshot of an animator at a point in time, ready to paint. */
export interface StudioTextAnimatorRenderState {
  mode: TextAnimatorMode;
  /** Eased progress [0, 1] through the full reveal. */
  progress: number;
}

export interface StudioTextAnimatorToken {
  text: string;
  /** Left edge of the token, relative to the line's start. */
  x: number;
  width: number;
  /** Global animation unit index, or -1 for inert whitespace. */
  unitIndex: number;
}

export interface StudioTextAnimatorLayout {
  lines: StudioTextAnimatorToken[][];
  lineWidths: number[];
  /** Width of the widest line; the stable layout box. */
  boxWidth: number;
  unitCount: number;
}

/**
 * Split `text` into animatable units (characters, or words for `fade-words`)
 * and measure them with the current `ctx.font`.
 *
 * Callers must set `ctx.font` before measuring. Whitespace between words is
 * inert: it is painted with the neighbouring word but never consumes a slot.
 */
export function layoutStudioTextAnimator(
  ctx: CanvasRenderingContext2D,
  text: string,
  mode: TextAnimatorMode,
): StudioTextAnimatorLayout {
  const rawLines = text.split('\n');
  let unitCount = 0;

  const lines = rawLines.map((line) => {
    const rawTokens =
      mode === 'fade-words'
        ? line.split(/(\s+)/).filter((token) => token.length > 0)
        : Array.from(line);
    let x = 0;
    return rawTokens.map((token) => {
      const width = ctx.measureText(token).width;
      const inert = mode === 'fade-words' && /^\s+$/.test(token);
      const layout: StudioTextAnimatorToken = {
        text: token,
        x,
        width,
        unitIndex: inert ? -1 : unitCount++,
      };
      x += width;
      return layout;
    });
  });

  const lineWidths = lines.map((tokens) => {
    const last = tokens[tokens.length - 1];
    return last ? last.x + last.width : 0;
  });
  const boxWidth = lineWidths.reduce((max, width) => Math.max(max, width), 0);

  return { lines, lineWidths, boxWidth, unitCount };
}

export interface StudioTextAnimatorUnitState {
  /** 0 = hidden, 1 = fully revealed. */
  alpha: number;
  /** 0 = settled, 1 = still fully offset (used by `slide-up`). */
  rise: number;
  revealed: boolean;
}

/**
 * Reveal state for one unit.
 *
 * Each unit owns one slice of the progress bar: unit `i` starts at
 * `i / unitCount` and finishes one slot later. This keeps the last unit from
 * running past 100% regardless of how many units the text has.
 */
export function studioTextAnimatorUnitState(
  mode: TextAnimatorMode,
  progress: number,
  unitIndex: number,
  unitCount: number,
  easing?: string,
): StudioTextAnimatorUnitState {
  if (unitIndex < 0) return { alpha: 1, rise: 0, revealed: true };
  const p = Math.max(0, Math.min(1, progress));
  const total = Math.max(1, unitCount);
  const revealAt = unitIndex / total;

  if (mode === 'typewriter') {
    const revealed = p >= revealAt;
    return { alpha: revealed ? 1 : 0, rise: 0, revealed };
  }

  const local = easeTextProgress((p - revealAt) * total, easing);
  return { alpha: local, rise: 1 - local, revealed: local > 0 };
}

/**
 * Progress (0..1) for a text animator at `relativeTimeMs` into the clip.
 *
 * `charDurationMs` is per character (or per word for `fade-words`), which is
 * what the UI exposes. The animator therefore completes in
 * `unitCount × charDurationMs`, independent of the clip length, and holds the
 * fully revealed text for the remainder of the clip.
 */
export function computeStudioTextAnimatorProgress(
  text: string,
  animator: Pick<TextAnimator, 'mode' | 'charDurationMs' | 'easing'>,
  relativeTimeMs: number,
): number {
  const characters = Array.from((text || '').replace(/\n/g, ''));
  const wordCount = Math.max(
    1,
    (text || '').split(/\s+/).filter(Boolean).length,
  );
  const units =
    animator.mode === 'fade-words'
      ? wordCount
      : Math.max(1, characters.length);
  const charDurationMs = Math.max(16, animator.charDurationMs ?? 120);
  const totalMs = units * charDurationMs;
  return easeTextProgress(relativeTimeMs / totalMs, animator.easing);
}

export function drawStudioFreeText(
  ctx: CanvasRenderingContext2D,
  text: string,
  style: StudioTextRenderStyle,
  animator?: StudioTextAnimatorRenderState,
): void {
  if (!text) return;

  ctx.font = `${style.fontWeight ?? 600} ${style.fontSize}px ${style.fontFamily}`;
  ctx.textBaseline = 'top';
  if (style.letterSpacing !== undefined) {
    (
      ctx as CanvasRenderingContext2D & { letterSpacing?: string }
    ).letterSpacing = `${style.letterSpacing}px`;
  }

  const paintText = (value: string, x: number, y: number) => {
    if (style.shadow) {
      ctx.shadowColor = style.shadow.color;
      ctx.shadowBlur = style.shadow.blur;
      ctx.shadowOffsetX = style.shadow.offsetX;
      ctx.shadowOffsetY = style.shadow.offsetY;
    }
    if (style.stroke) {
      ctx.lineWidth = style.stroke.width;
      ctx.strokeStyle = style.stroke.color;
      if (style.maxWidth !== undefined) {
        ctx.strokeText(value, x, y, style.maxWidth);
      } else {
        ctx.strokeText(value, x, y);
      }
    }
    ctx.fillStyle = style.color;
    if (style.maxWidth !== undefined) {
      ctx.fillText(value, x, y, style.maxWidth);
    } else {
      ctx.fillText(value, x, y);
    }
  };

  const lineHeight = style.lineHeight ?? style.fontSize * 1.2;

  if (animator) {
    const layout = layoutStudioTextAnimator(ctx, text, animator.mode);
    const top = -(layout.lines.length * lineHeight) / 2;
    const boxLeft = -layout.boxWidth / 2;
    ctx.textAlign = 'left';

    layout.lines.forEach((tokens, lineIndex) => {
      const lineWidth = layout.lineWidths[lineIndex];
      const lineStartX =
        style.align === 'left'
          ? boxLeft
          : style.align === 'right'
            ? boxLeft + (layout.boxWidth - lineWidth)
            : -lineWidth / 2;
      const y = top + lineIndex * lineHeight;

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
        paintText(
          token.text,
          lineStartX + token.x,
          y + state.rise * style.fontSize * 0.22,
        );
        ctx.restore();
      });
    });
    return;
  }

  const lines = text.split('\n');
  const width = Math.max(
    ...lines.map((line) => ctx.measureText(line).width),
    0,
  );
  const x =
    style.align === 'left'
      ? -width / 2
      : style.align === 'right'
        ? width / 2
        : 0;
  const top = -(lines.length * lineHeight) / 2;
  ctx.textAlign = style.align;

  lines.forEach((line, index) => {
    paintText(line, x, top + index * lineHeight);
  });
}
