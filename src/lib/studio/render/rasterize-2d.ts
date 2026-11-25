/**
 * lib/studio/render/rasterize-2d.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Tier 3 — the Canvas 2D backend.
 *
 * `rasterize2D` is a pure interpreter: it walks `program.ops` in order and
 * paints each one. It makes no timeline, keyframe, or layer decisions — every
 * number was resolved by `buildFrameProgram`. A future WebGL backend implements
 * the same contract against the same `FrameProgram`.
 *
 * Media elements come from an asset registry, injected by the caller. This is
 * the only place a `CanvasRenderingContext2D` (or a DOM element) is touched.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  filterToCss,
  type BlendMode,
  type ChromeDrawOp,
  type ChromaKeyParams,
  type ClipDomain,
  type DrawOp,
  type EffectDrawOp,
  type FrameProgram,
  type MediaDrawOp,
  type MediaSource,
  type MotionCardDrawOp,
  type OverlayDrawOp,
  type ShapeDrawOp,
  type TextDrawOp,
  type TextLayout,
} from './display-list';
import type { StudioCaption } from '@/lib/studio/types';
import { drawStudioBackground } from './background';
import { drawStudioCaption } from './captions';
import {
  applyStudioTextAnimator,
  drawStudioFreeText,
} from './text-style';
import { drawClipDeviceFrame } from './clip-device-frame';
import { drawStudioEffectPass } from './effects';
import { drawKeyedSource } from './gl-effect-pass';
import { drawStudioWindowChrome, drawStudioWindowShadow } from './frame';
import { drawMotionCard } from '@/components/studio/renderers/motion-cards';
import {
  drawDeviceFrameFooter,
  drawDeviceFrameHeader,
} from '@/components/studio/renderers/device-frames';

// ── Asset registry ────────────────────────────────────────────────────────────

/**
 * Elements the rasterizer may draw. The builder only needs dimensions; the
 * rasterizer needs the actual media, so the two are deliberately separate.
 */
export interface RasterAssetRegistry {
  /** Shared media-pool elements keyed by asset id. */
  assets?: ReadonlyMap<string, CanvasImageSource>;
  /** Per-clip decoders keyed by timeline clip id. */
  clipInstances?: ReadonlyMap<string, CanvasImageSource>;
  /** Overlay media keyed by overlay id. */
  overlays?: ReadonlyMap<string, CanvasImageSource>;
  /** The take's source recording. */
  recordedVideo?: CanvasImageSource | null;
}

export interface Rasterize2DOptions {
  /** Cached ambient glow gradient, rebuilt when the canvas size changes. */
  glowGradient?: CanvasGradient | null;
}

const BLEND_MODE_COMPOSITE: Record<BlendMode, GlobalCompositeOperation> = {
  'source-over': 'source-over',
  multiply: 'multiply',
  screen: 'screen',
  overlay: 'overlay',
  darken: 'darken',
  lighten: 'lighten',
  'color-dodge': 'color-dodge',
  'color-burn': 'color-burn',
  'hard-light': 'hard-light',
  'soft-light': 'soft-light',
  difference: 'difference',
  exclusion: 'exclusion',
  lighter: 'lighter',
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function resolveMediaSource(
  source: MediaSource,
  registry: RasterAssetRegistry,
): CanvasImageSource | null {
  if (source.kind === 'recorded') return registry.recordedVideo ?? null;
  if (source.clipId) {
    const instance = registry.clipInstances?.get(source.clipId);
    if (instance) return instance;
  }
  return (
    registry.assets?.get(source.assetId) ??
    registry.overlays?.get(source.assetId) ??
    null
  );
}

// ── Entry point ───────────────────────────────────────────────────────────────

export function rasterize2D(
  ctx: CanvasRenderingContext2D,
  program: FrameProgram,
  registry: RasterAssetRegistry,
  options?: Rasterize2DOptions,
): void {
  drawStudioBackground(ctx, {
    width: program.width,
    height: program.height,
    background: program.background.paint,
    glowGradient: options?.glowGradient,
    timeMs: program.compTimeMs,
  });

  const frame = program.windowFrame;
  if (frame?.shadow) drawStudioWindowShadow(ctx, frame);

  // Opaque content bed. Painted inside the window clip so a loading or absent
  // video never lets the wallpaper bleed through the frame.
  if (program.contentBackdrop) {
    ctx.save();
    if (frame) {
      ctx.beginPath();
      ctx.roundRect(frame.x, frame.y, frame.width, frame.height, frame.radius);
      ctx.clip();
    }
    const backdrop = program.contentBackdrop;
    ctx.fillStyle = backdrop.color;
    ctx.fillRect(backdrop.x, backdrop.y, backdrop.width, backdrop.height);
    ctx.restore();
  }

  for (const op of program.ops) {
    ctx.save();
    applyClipDomain(ctx, op.clip, program);
    applyCompositing(ctx, op);

    switch (op.kind) {
      case 'video':
      case 'image':
        renderMediaOp(ctx, op, registry);
        break;
      case 'overlay':
        renderOverlayOp(ctx, op, registry);
        break;
      case 'text':
        renderTextOp(ctx, op, program);
        break;
      case 'shape':
        renderShapeOp(ctx, op);
        break;
      case 'effect':
        renderEffectOp(ctx, op, program);
        break;
      case 'chrome':
        renderChromeOp(ctx, op, program);
        break;
      case 'motion-card':
        renderMotionCardOp(ctx, op, program);
        break;
    }

    ctx.restore();
  }
}

// ── Shared setup ──────────────────────────────────────────────────────────────

function applyClipDomain(
  ctx: CanvasRenderingContext2D,
  domain: ClipDomain,
  program: FrameProgram,
): void {
  const frame = program.windowFrame;
  if (!frame || domain === 'none') return;
  ctx.beginPath();
  if (domain === 'window') {
    ctx.roundRect(frame.x, frame.y, frame.width, frame.height, frame.radius);
  } else {
    ctx.rect(
      frame.contentX,
      frame.contentY,
      frame.contentWidth,
      frame.contentHeight,
    );
  }
  ctx.clip();
}

function applyCompositing(ctx: CanvasRenderingContext2D, op: DrawOp): void {
  ctx.transform(...op.transform);
  ctx.globalAlpha = clamp01(op.opacity);
  ctx.globalCompositeOperation = BLEND_MODE_COMPOSITE[op.blendMode];
  const filter = filterToCss(op.filter);
  if (filter) ctx.filter = filter;
}

// ── Op renderers ──────────────────────────────────────────────────────────────

function drawMediaElement(
  ctx: CanvasRenderingContext2D,
  op: MediaDrawOp,
  element: CanvasImageSource,
): void {
  const { x, y, width, height, cornerRadius } = op.destRect;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, cornerRadius);
  ctx.save();
  ctx.clip();
  ctx.drawImage(
    element,
    op.sourceRect.x,
    op.sourceRect.y,
    op.sourceRect.width,
    op.sourceRect.height,
    x,
    y,
    width,
    height,
  );
  ctx.restore();
}

/**
 * Chroma key is a *source* filter, so it cannot be a destination readback: by
 * the time the clip is composited, the background it should reveal has already
 * been overwritten. `drawKeyedSource` draws the clip into a scratch layer at
 * device resolution, keys it on the GPU, and composites the keyed layer in its
 * place.
 *
 * Returns false when the key could not run (no WebGL, no scratch canvas), which
 * leaves the normal draw to paint the clip unkeyed.
 */
function renderKeyedMedia(
  ctx: CanvasRenderingContext2D,
  op: MediaDrawOp,
  element: CanvasImageSource,
  chromaKey: ChromaKeyParams,
): boolean {
  return drawKeyedSource(ctx, op.destRect, chromaKey, (layerCtx) => {
    drawMediaElement(layerCtx, op, element);
  });
}

function renderMediaOp(
  ctx: CanvasRenderingContext2D,
  op: MediaDrawOp,
  registry: RasterAssetRegistry,
): void {
  const element = resolveMediaSource(op.source, registry);
  if (!element) return;
  const { width, height, cornerRadius } = op.destRect;
  if (width <= 0 || height <= 0) return;

  const keyed = op.chromaKey
    ? renderKeyedMedia(ctx, op, element, op.chromaKey)
    : false;
  if (!keyed) drawMediaElement(ctx, op, element);

  if (op.deviceFrame) {
    drawClipDeviceFrame(ctx, op.deviceFrame, width, height, cornerRadius);
  }
}

function renderOverlayOp(
  ctx: CanvasRenderingContext2D,
  op: OverlayDrawOp,
  registry: RasterAssetRegistry,
): void {
  const element =
    registry.overlays?.get(op.source.assetId) ??
    registry.clipInstances?.get(op.source.clipId) ??
    registry.assets?.get(op.source.assetId) ??
    null;
  if (!element) return;

  const left = -op.width / 2;
  const top = -op.height / 2;
  ctx.beginPath();
  ctx.roundRect(left, top, op.width, op.height, op.cornerRadius);

  if (op.shadow) {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 10;
  }

  ctx.save();
  ctx.clip();
  // The shadow belongs to the frame, not to the image itself.
  ctx.shadowColor = 'transparent';
  ctx.drawImage(
    element,
    left + op.imageOffset.x,
    top + op.imageOffset.y,
    op.width,
    op.height,
  );
  ctx.restore();

  if (op.deviceFrame) {
    drawClipDeviceFrame(ctx, op.deviceFrame, op.width, op.height, op.cornerRadius);
  }

  if (op.border) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

function renderTextOp(
  ctx: CanvasRenderingContext2D,
  op: TextDrawOp,
  program: FrameProgram,
): void {
  if (op.layout.mode === 'caption') {
    if (!program.windowFrame) return;

    // Handle text animator for captions
    let caption = op.layout.caption;
    if (op.animator) {
      caption = applyStudioTextAnimator(caption, op.animator);
    }

    drawStudioCaption(ctx, {
      caption,
      style: op.layout.style,
      frame: program.windowFrame,
      timeMs: op.layout.timeMs,
    });
    return;
  }
  const caption: StudioCaption = {
    id: op.clipId ?? op.id,
    startMs: 0,
    endMs: 0,
    text: op.layout.text,
    ...(op.layout.words ? { words: op.layout.words } : {}),
  };
  const text = op.animator
    ? applyStudioTextAnimator(caption, op.animator).text
    : op.layout.text;
  renderFreeText(ctx, { ...op.layout, text });
}

function renderFreeText(
  ctx: CanvasRenderingContext2D,
  layout: Extract<TextLayout, { mode: 'free' }>,
): void {
  const { text, style, anchor } = layout;
  if (!text) return;

  ctx.save();
  ctx.translate(anchor.x, anchor.y);
  if (layout.rotationDeg) {
    ctx.rotate((layout.rotationDeg * Math.PI) / 180);
  }
  drawStudioFreeText(ctx, text, {
    fontFamily: style.fontFamily,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    color: style.fill,
    align: style.align,
    letterSpacing: style.letterSpacing,
    lineHeight: style.lineHeight,
    maxWidth: style.maxWidth,
    stroke: style.stroke,
    shadow: style.shadow,
  });

  ctx.restore();
}

function renderShapeOp(ctx: CanvasRenderingContext2D, op: ShapeDrawOp): void {
  if (typeof Path2D === 'undefined') return;
  let path: Path2D;
  try {
    path = new Path2D(op.pathData);
  } catch {
    return;
  }

  if (op.fill) {
    ctx.fillStyle = op.fill;
    ctx.fill(path);
  }

  if (op.stroke) {
    if (op.trim && op.pathLengthPx && op.pathLengthPx > 0) {
      const total = op.pathLengthPx;
      const start = clamp01(op.trim.start) * total;
      const end = clamp01(op.trim.end) * total;
      const visible = Math.max(1, end - start);
      ctx.setLineDash([visible, Math.max(total, visible + 1)]);
      ctx.lineDashOffset = -start - op.trim.offset * total;
    }
    ctx.strokeStyle = op.stroke.color;
    ctx.lineWidth = op.stroke.width;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke(path);
  }
}

function renderEffectOp(
  ctx: CanvasRenderingContext2D,
  op: EffectDrawOp,
  program: FrameProgram,
): void {
  if (!program.windowFrame) return;
  drawStudioEffectPass(ctx, {
    type: op.effectType,
    intensity: op.intensity,
    frame: program.windowFrame,
    timeMs: op.timeMs,
    params: op.params,
    rect: op.rect,
  });
}

function renderChromeOp(
  ctx: CanvasRenderingContext2D,
  op: ChromeDrawOp,
  program: FrameProgram,
): void {
  const frame = program.windowFrame;
  if (!frame) return;

  if (op.deviceFrame) {
    const chromeFrame = {
      frame: op.deviceFrame,
      winX: frame.x,
      winY: frame.y,
      winW: frame.width,
      winH: frame.height,
      headerH: frame.headerHeight,
      radius: frame.radius,
    };
    drawDeviceFrameHeader(ctx, chromeFrame);
    drawDeviceFrameFooter(ctx, chromeFrame);
    return;
  }
  drawStudioWindowChrome(ctx, frame);
}

function renderMotionCardOp(
  ctx: CanvasRenderingContext2D,
  op: MotionCardDrawOp,
  program: FrameProgram,
): void {
  drawMotionCard(ctx, {
    card: op.card,
    cardType: op.cardType,
    currentTimeMs: op.timeMs,
    totalDurationMs: op.totalDurationMs,
    cw: program.width,
    ch: program.height,
  });
}
