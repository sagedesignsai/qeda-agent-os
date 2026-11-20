/**
 * lib/studio/render/display-list.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Tier 2.5 — the backend-agnostic frame description.
 *
 * A `FrameProgram` is an immutable, pure-data description of one composited
 * frame: window geometry, background, and an ordered list of `DrawOp`s. It holds
 * no `CanvasRenderingContext2D`, no DOM node, and no media element, so it can be
 * built and asserted in a plain Jest environment and later replayed by a WebGL
 * or WebGPU backend without touching timeline, keyframe or geometry code.
 *
 * ORDERING CONTRACT
 * ─────────────────
 * `ops` is painted strictly in array order (index 0 first). The builder never
 * re-sorts; the order it produces is the documented stack:
 *
 *   1. content video / image ops   (bottom track → top track)
 *   2. overlay ops                 (picture-in-picture)
 *   3. effect ops                  (canvas passes; `window` or `content` clip)
 *   4. chrome op                   (window chrome / device frame)
 *   5. unclipped text ops          (captions lane)
 *   6. motion-card ops             (intro / outro, painted last)
 *
 * This deliberately does *not* follow `timeline/layers.ts` row order, which
 * would put effects above captions and chrome. See the architecture doc §2.1.
 *
 * CLIP DOMAINS
 * ────────────
 * `clip: 'window'`  → rounded window rect (video, overlays, effects, chrome)
 * `clip: 'content'` → inner content box (light/film passes that must not bleed
 *                     past the video, e.g. spotlight, vignette, grain)
 * `clip: 'none'`    → full canvas (legacy captions, motion cards)
 *
 * Transforms are 2D affine matrices in the same `[a, b, c, d, e, f]` order the
 * Canvas API uses, so the rasterizer can hand them straight to `ctx.transform`.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type {
  ClipDeviceFrame,
  StudioCaption,
  StudioCaptionStyle,
  StudioDeviceFrame,
  StudioEffectType,
  StudioMotionCard,
  TextAnimatorMode,
} from '../types';

// ── Primitives ────────────────────────────────────────────────────────────────

/** Affine matrix: x' = a·x + c·y + e, y' = b·x + d·y + f. */
export type Matrix2D = readonly [number, number, number, number, number, number];

export const IDENTITY_MATRIX: Matrix2D = [1, 0, 0, 1, 0, 0];

/** Multiply `m1 · m2` (apply `m2` first, then `m1`). */
export function multiplyMatrices(m1: Matrix2D, m2: Matrix2D): Matrix2D {
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

export function translationMatrix(x: number, y: number): Matrix2D {
  return [1, 0, 0, 1, x, y];
}

export function scaleMatrix(x: number, y: number): Matrix2D {
  return [x, 0, 0, y, 0, 0];
}

export function rotationMatrix(radians: number): Matrix2D {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return [cos, sin, -sin, cos, 0, 0];
}

/** Compose matrices left-to-right, i.e. `compose(A, B, C)` === `A · B · C`. */
export function composeMatrices(...matrices: Matrix2D[]): Matrix2D {
  return matrices.reduce<Matrix2D>(
    (accumulator, matrix) => multiplyMatrices(accumulator, matrix),
    IDENTITY_MATRIX,
  );
}

/** Mirror of `CanvasRenderingContext2D` composite operations we support. */
export type BlendMode =
  | 'source-over'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'hard-light'
  | 'soft-light'
  | 'difference'
  | 'exclusion'
  | 'lighter';

export type ClipDomain = 'none' | 'window' | 'content';

/**
 * Structured post-process filters. Stored as numbers rather than a CSS filter
 * string so a GPU backend never has to parse CSS; `filterToCss` is the only
 * place the string form exists.
 */
export interface OpFilter {
  blurPx?: number;
  brightness?: number;
  contrast?: number;
  saturate?: number;
}

export function filterToCss(filter: OpFilter | undefined): string | undefined {
  if (!filter) return undefined;
  const parts: string[] = [];
  if (filter.blurPx && filter.blurPx > 0) parts.push(`blur(${filter.blurPx}px)`);
  if (filter.brightness !== undefined && filter.brightness !== 1) {
    parts.push(`brightness(${filter.brightness})`);
  }
  if (filter.contrast !== undefined && filter.contrast !== 1) {
    parts.push(`contrast(${filter.contrast})`);
  }
  if (filter.saturate !== undefined && filter.saturate !== 1) {
    parts.push(`saturate(${filter.saturate})`);
  }
  return parts.length > 0 ? parts.join(' ') : undefined;
}

// ── Draw operations ───────────────────────────────────────────────────────────

export interface BaseDrawOp {
  /** Stable identity for debugging and golden tests. */
  id: string;
  clipId?: string;
  transform: Matrix2D;
  opacity: number;
  blendMode: BlendMode;
  clip: ClipDomain;
  filter?: OpFilter;
}

/**
 * Where a media op's pixels come from. `recorded` refers to the take's source
 * recording, which is not a media-pool asset and therefore has no asset id.
 */
export type MediaSource =
  | { kind: 'asset'; assetId: string; clipId?: string }
  | { kind: 'recorded' };

export interface MediaDrawOp extends BaseDrawOp {
  kind: 'video' | 'image';
  source: MediaSource;
  sourceRect: { x: number; y: number; width: number; height: number };
  destRect: {
    x: number;
    y: number;
    width: number;
    height: number;
    cornerRadius: number;
  };
  deviceFrame?: ClipDeviceFrame;
}

export type VideoDrawOp = MediaDrawOp & { kind: 'video' };
export type ImageDrawOp = MediaDrawOp & { kind: 'image' };

/**
 * Picture-in-picture overlay. Geometry is resolved into the transform and a
 * centred destination box, mirroring `render/overlays.ts`.
 */
export interface OverlayDrawOp extends BaseDrawOp {
  kind: 'overlay';
  source: { kind: 'asset'; assetId: string; clipId: string };
  width: number;
  height: number;
  cornerRadius: number;
  /** Enter/exit animation offset applied to the image inside the box. */
  imageOffset: { x: number; y: number };
  deviceFrame?: ClipDeviceFrame;
  /** Soft drop shadow behind the overlay (legacy look). */
  shadow: boolean;
  border: boolean;
}

export interface TextDrawStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight: number | string;
  fill: string;
  align: 'left' | 'center' | 'right';
  stroke?: { color: string; width: number };
  shadow?: { color: string; blur: number; offsetX: number; offsetY: number };
  letterSpacing?: number;
  lineHeight?: number;
  maxWidth?: number;
}

/**
 * Caption-preset text keeps the historical measure-and-draw renderer, which is
 * how legacy parity is preserved. Free text is a positioned layer; both share
 * one op so the stack stays flat.
 */
export type TextLayout =
  | {
      mode: 'caption';
      caption: StudioCaption;
      style: StudioCaptionStyle;
      /** Composition time driving the karaoke highlight. */
      timeMs: number;
    }
  | {
      mode: 'free';
      text: string;
      style: TextDrawStyle;
      /** Top-left anchor in frame coordinates. */
      anchor: { x: number; y: number };
      rotationDeg?: number;
    };

export interface TextDrawOp extends BaseDrawOp {
  kind: 'text';
  layout: TextLayout;
  /** Text animator mode (typewriter, fade-words, slide-up) if applied. */
  animator?: {
    mode: TextAnimatorMode;
    /** Progress [0, 1] through the animation. */
    progress: number;
    /** Composition time for word-based animation lookups. */
    timeMs: number;
  };
}

export interface ShapeDrawOp extends BaseDrawOp {
  kind: 'shape';
  /** SVG path data: "M 0 0 L 100 100 Z". */
  pathData: string;
  fill?: string;
  stroke?: { color: string; width: number };
  /**
   * Path trim, expressed as fractions of the path length. A Canvas `Path2D`
   * cannot measure itself, so producers must supply `pathLengthPx` for the
   * rasterizer to convert fractional trim into a dash pattern.
   */
  trim?: { start: number; end: number; offset: number };
  pathLengthPx?: number;
}

export interface EffectDrawOp extends BaseDrawOp {
  kind: 'effect';
  effectType: StudioEffectType;
  intensity: number;
  /** Composition time: drives animated grain / scanline phases. */
  timeMs: number;
}

export interface ChromeDrawOp extends BaseDrawOp {
  kind: 'chrome';
  deviceFrame?: StudioDeviceFrame;
}

export interface MotionCardDrawOp extends BaseDrawOp {
  kind: 'motion-card';
  cardType: 'intro' | 'outro';
  card: StudioMotionCard;
  totalDurationMs: number;
  /** Composition time driving the card's animation. */
  timeMs: number;
}

export type DrawOp =
  | VideoDrawOp
  | ImageDrawOp
  | OverlayDrawOp
  | TextDrawOp
  | ShapeDrawOp
  | EffectDrawOp
  | ChromeDrawOp
  | MotionCardDrawOp;

// ── Programs ──────────────────────────────────────────────────────────────────

export interface ProgramWindowFrame {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
  headerHeight: number;
  contentX: number;
  contentY: number;
  contentWidth: number;
  contentHeight: number;
  /** Draw the soft drop shadow behind the window (showcase mode). */
  shadow: boolean;
}

export interface FrameProgram {
  width: number;
  height: number;
  compTimeMs: number;
  background: {
    /** CSS colour or `linear-gradient(...)` string. */
    paint: string;
    /** Draw the ambient indigo glow over the wallpaper. */
    glow: boolean;
  };
  windowFrame?: ProgramWindowFrame;
  /**
   * Opaque fill behind the content area, painted before any op. Prevents the
   * wallpaper from showing through while media is loading or absent.
   */
  contentBackdrop?: {
    x: number;
    y: number;
    width: number;
    height: number;
    color: string;
  };
  /** Authoritative paint list; index 0 is painted first. */
  ops: readonly DrawOp[];
}
