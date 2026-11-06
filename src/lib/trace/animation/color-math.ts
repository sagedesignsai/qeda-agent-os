/**
 * lib/trace/animation/color-math.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Linear interpolation for numbers and colors.
 *
 * The color parser is deliberately strict and total: it understands the forms
 * Trace actually writes (hex3/4/6/8, rgb()/rgba(), a small named set) and
 * returns null for anything else. Callers must fall back to the dominant value
 * rather than blending against a guess — the old "jump at 50 %" behaviour made
 * `rgba()` animations visibly pop.
 *
 * Adapted from sagedesigns-os lib/motion/animation/color-math.ts.
 */

export function lerpNumber(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export type TraceRgba = {
  r: number;
  g: number;
  b: number;
  a: number;
};

const NAMED_COLORS: Record<string, [number, number, number]> = {
  black: [0, 0, 0],
  white: [255, 255, 255],
  red: [255, 0, 0],
  green: [0, 128, 0],
  blue: [0, 0, 255],
  yellow: [255, 255, 0],
  cyan: [0, 255, 255],
  magenta: [255, 0, 255],
  orange: [255, 165, 0],
  purple: [128, 0, 128],
  pink: [255, 192, 203],
  gray: [128, 128, 128],
  grey: [128, 128, 128],
  silver: [192, 192, 192],
  navy: [0, 0, 128],
  teal: [0, 128, 128],
  lime: [0, 255, 0],
  indigo: [75, 0, 130],
  slate: [112, 128, 144],
  transparent: [0, 0, 0],
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function channelValue(raw: string): number | null {
  const text = raw.trim();
  if (!text) return null;
  if (text.endsWith('%')) {
    const percent = Number(text.slice(0, -1));
    return Number.isFinite(percent) ? clamp((percent / 100) * 255, 0, 255) : null;
  }
  const value = Number(text);
  return Number.isFinite(value) ? clamp(value, 0, 255) : null;
}

function alphaValue(raw: string): number | null {
  const text = raw.trim();
  if (!text) return null;
  if (text.endsWith('%')) {
    const percent = Number(text.slice(0, -1));
    return Number.isFinite(percent) ? clamp(percent / 100, 0, 1) : null;
  }
  const value = Number(text);
  return Number.isFinite(value) ? clamp(value, 0, 1) : null;
}

/**
 * Parse a CSS color Trace can animate. Returns null for `none`, undefined,
 * CSS variables, gradients and anything else that cannot be blended.
 */
export function parseTraceColor(value: unknown): TraceRgba | null {
  if (typeof value !== 'string') return null;
  const input = value.trim().toLowerCase();
  if (!input || input === 'none') return null;

  if (input === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };

  if (input.startsWith('#')) {
    const hex = input.slice(1);
    if (!/^[0-9a-f]+$/.test(hex)) return null;
    const expand = (part: string): number =>
      part.length === 1
        ? parseInt(part + part, 16)
        : parseInt(part, 16);

    if (hex.length === 3 || hex.length === 4) {
      return {
        r: expand(hex[0]),
        g: expand(hex[1]),
        b: expand(hex[2]),
        a: hex.length === 4 ? expand(hex[3]) / 255 : 1,
      };
    }
    if (hex.length === 6 || hex.length === 8) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1,
      };
    }
    return null;
  }

  const functional = input.match(/^(rgba?)\((.*)\)$/);
  if (functional) {
    const parts = functional[2]
      .split(/[,/\s]+/)
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length < 3) return null;

    const channels = parts.slice(0, 3).map(channelValue);
    if (channels.some((channel) => channel === null)) return null;

    const alpha =
      parts.length >= 4 ? alphaValue(parts[3].replace('/', '')) : 1;
    if (alpha === null) return null;

    return {
      r: channels[0] as number,
      g: channels[1] as number,
      b: channels[2] as number,
      a: alpha,
    };
  }

  const named = NAMED_COLORS[input];
  return named ? { r: named[0], g: named[1], b: named[2], a: 1 } : null;
}

/** Serialise a parsed color back to the closest CSS form. */
export function formatTraceColor(color: TraceRgba): string {
  const r = Math.round(clamp(color.r, 0, 255));
  const g = Math.round(clamp(color.g, 0, 255));
  const b = Math.round(clamp(color.b, 0, 255));
  const a = clamp(color.a, 0, 1);

  if (a >= 1) return `rgb(${r}, ${g}, ${b})`;
  return `rgba(${r}, ${g}, ${b}, ${Math.round(a * 1000) / 1000})`;
}

/**
 * Blend two colors in sRGB. Unparseable inputs fall back to the discrete rule,
 * so a gradient or `var(--x)` fill never flickers through an invented midpoint.
 */
export function lerpColor(a: string, b: string, t: number): string {
  const from = parseTraceColor(a);
  const to = parseTraceColor(b);
  if (!from || !to) return t >= 0.5 ? b : a;

  const progress = clamp(t, 0, 1);
  return formatTraceColor({
    r: lerpNumber(from.r, to.r, progress),
    g: lerpNumber(from.g, to.g, progress),
    b: lerpNumber(from.b, to.b, progress),
    a: lerpNumber(from.a, to.a, progress),
  });
}
