import type {
  StudioCaption,
  StudioTextStyle,
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

export function drawStudioFreeText(
  ctx: CanvasRenderingContext2D,
  text: string,
  style: StudioTextRenderStyle,
): void {
  if (!text) return;

  ctx.font = `${style.fontWeight ?? 600} ${style.fontSize}px ${style.fontFamily}`;
  ctx.textBaseline = 'top';
  if (style.letterSpacing !== undefined) {
    (
      ctx as CanvasRenderingContext2D & { letterSpacing?: string }
    ).letterSpacing = `${style.letterSpacing}px`;
  }

  const lines = text.split('\n');
  const lineHeight = style.lineHeight ?? style.fontSize * 1.2;
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
    const y = top + index * lineHeight;
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
        ctx.strokeText(line, x, y, style.maxWidth);
      } else {
        ctx.strokeText(line, x, y);
      }
    }
    ctx.fillStyle = style.color;
    if (style.maxWidth !== undefined) {
      ctx.fillText(line, x, y, style.maxWidth);
    } else {
      ctx.fillText(line, x, y);
    }
  });
}
