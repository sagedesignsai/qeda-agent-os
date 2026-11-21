/**
 * lib/studio/render/effects.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Canvas compositing passes for the `StudioEffectType` catalog.
 *
 * Techniques, grounded in the Canvas 2D compositing model:
 *   - spotlight / vignette → radial-gradient alpha falloff (`source-over`)
 *   - neon-glow           → additive bloom via `globalCompositeOperation =
 *                           'lighter'` plus a `shadowBlur` stroke, which is the
 *                           standard canvas idiom for glow
 *   - film-grain          → a cached noise tile stamped at a time-seeded offset
 *   - scanlines           → deterministic horizontal lines rolled by time
 *
 * PARAMETERS
 * ──────────
 * Every pass accepts the effect's static `params` bag (see `effects/params.ts`)
 * and honours it where the parameter is meaningful for the Canvas backend.
 * Unknown or absent parameters fall back to the historical defaults, so a
 * migrated legacy effect (which carries no params) renders exactly as before.
 *
 * TARGET RECT
 * ───────────
 * `rect` lets a clip-attached effect paint over the clip's own draw box instead
 * of the whole window content. The caller supplies coordinates in the current
 * canvas space, which for a clip effect is the clip's local transform space.
 *
 * DETERMINISM
 * ───────────
 * Noise comes from `./prng`, never `Math.random()`. The tile texture is seeded
 * with a constant and the stamp offset is a pure function of composition time,
 * so preview and export render identical pixels for the same timestamp.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { isStudioEffectActive } from '../effects/catalog';
import type { StudioEffect, StudioEffectType } from '../types';
import type { StudioWindowFrame } from './geometry';
import { filmGrainOffset, GRAIN_TILE_SEED, mulberry32 } from './prng';

const GRAIN_TILE_SIZE = 256;

let grainTile: HTMLCanvasElement | null = null;

export interface EffectRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type StudioEffectParams = Record<string, number | string | boolean>;

interface ContentRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function contentRect(frame: StudioWindowFrame): ContentRect {
  return {
    x: frame.contentX,
    y: frame.contentY,
    width: frame.contentWidth,
    height: frame.contentHeight,
  };
}

function numberParam(
  params: StudioEffectParams | undefined,
  key: string,
  fallback: number,
): number {
  const value = params?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function colorParam(
  params: StudioEffectParams | undefined,
  key: string,
  fallback: string,
): string {
  const value = params?.[key];
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getGrainTile(): HTMLCanvasElement | null {
  if (grainTile) return grainTile;
  if (typeof document === 'undefined') return null;
  const tile = document.createElement('canvas');
  tile.width = GRAIN_TILE_SIZE;
  tile.height = GRAIN_TILE_SIZE;
  const ctx = tile.getContext('2d');
  if (!ctx) return null;
  const image = ctx.createImageData(GRAIN_TILE_SIZE, GRAIN_TILE_SIZE);
  // Constant seed: the tile is a fixed texture, not per-frame noise. Only the
  // stamp offset animates (see `drawFilmGrain`).
  const random = mulberry32(GRAIN_TILE_SEED);
  for (let index = 0; index < image.data.length; index += 4) {
    const value = random() * 255;
    image.data[index] = value;
    image.data[index + 1] = value;
    image.data[index + 2] = value;
    image.data[index + 3] = random() * 120;
  }
  ctx.putImageData(image, 0, 0);
  grainTile = tile;
  return tile;
}

/**
 * Paint one effect pass. Shared by the legacy composition path and the
 * display-list rasterizer so both backends stay pixel-identical.
 */
export function drawStudioEffectPass(
  ctx: CanvasRenderingContext2D,
  {
    type,
    intensity: rawIntensity,
    frame,
    timeMs,
    params,
    rect,
  }: {
    type: StudioEffectType;
    intensity: number;
    frame: StudioWindowFrame;
    timeMs: number;
    params?: StudioEffectParams;
    rect?: EffectRect;
  },
): void {
  const intensity = clamp(rawIntensity, 0, 1);
  if (intensity <= 0) return;
  const box = rect ?? contentRect(frame);
  if (box.width <= 0 || box.height <= 0) return;

  switch (type) {
    case 'spotlight':
      drawSpotlight(ctx, box, intensity, params);
      break;
    case 'vignette':
      drawVignette(ctx, box, intensity, params);
      break;
    case 'neon-glow':
      drawNeonGlow(ctx, box, intensity, params);
      break;
    case 'film-grain':
      drawFilmGrain(ctx, box, timeMs, intensity, params);
      break;
    case 'scanlines':
      drawScanlines(ctx, box, timeMs, intensity, params);
      break;
  }
}

export function drawStudioEffects(
  ctx: CanvasRenderingContext2D,
  effects: readonly StudioEffect[] | undefined,
  frame: StudioWindowFrame,
  timeMs: number,
): void {
  if (!effects || effects.length === 0) return;
  for (const effect of effects) {
    if (!isStudioEffectActive(effect, timeMs)) continue;
    drawStudioEffectPass(ctx, {
      type: effect.type,
      intensity: effect.intensity,
      frame,
      timeMs,
    });
  }
}

function drawSpotlight(
  ctx: CanvasRenderingContext2D,
  box: EffectRect,
  intensity: number,
  params?: StudioEffectParams,
): void {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const radius = Math.hypot(box.width, box.height) * 0.5;
  const size = clamp(numberParam(params, 'radius', 0.5), 0.1, 1);
  const feather = clamp(numberParam(params, 'feather', 40), 0, 100);
  const hue = numberParam(params, 'colorHue', 0);
  const edgeStop = clamp(0.5 + (feather / 100) * 0.45, 0.1, 0.98);
  const shade =
    hue === 0
      ? `rgba(0, 0, 0, ${0.9 * intensity})`
      : `hsla(${hue}, 60%, 8%, ${0.9 * intensity})`;

  const gradient = ctx.createRadialGradient(
    cx,
    cy,
    radius * size * 0.3,
    cx,
    cy,
    radius,
  );
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
  gradient.addColorStop(edgeStop, 'rgba(0, 0, 0, 0)');
  gradient.addColorStop(1, shade);

  ctx.save();
  ctx.fillStyle = gradient;
  ctx.fillRect(box.x, box.y, box.width, box.height);
  ctx.restore();
}

function drawVignette(
  ctx: CanvasRenderingContext2D,
  box: EffectRect,
  intensity: number,
  params?: StudioEffectParams,
): void {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const radius = Math.hypot(box.width, box.height) * 0.5;
  const darkness = clamp(numberParam(params, 'darknessFactor', 0.5), 0, 1);
  const falloff = clamp(numberParam(params, 'falloff', 0.6), 0, 1);
  const innerStop = clamp(0.35 * (1 - falloff), 0, 0.9);

  const gradient = ctx.createRadialGradient(
    cx,
    cy,
    radius * innerStop,
    cx,
    cy,
    radius,
  );
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
  gradient.addColorStop(
    1,
    `rgba(0, 0, 0, ${clamp(0.85 * intensity * (darkness + 0.5), 0, 1)})`,
  );

  ctx.save();
  ctx.fillStyle = gradient;
  ctx.fillRect(box.x, box.y, box.width, box.height);
  ctx.restore();
}

function drawNeonGlow(
  ctx: CanvasRenderingContext2D,
  box: EffectRect,
  intensity: number,
  params?: StudioEffectParams,
): void {
  const glowColor = colorParam(params, 'glowColor', '#4f46e5');
  const blurParam = clamp(numberParam(params, 'blurRadius', 40), 5, 100);
  const scale = clamp(Math.min(box.width, box.height) / 500, 0.25, 3);
  const lineWidth = Math.max(2, Math.min(box.width, box.height) * 0.018);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = glowColor;
  ctx.globalAlpha = clamp(0.5 * intensity, 0, 1);
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = blurParam * scale;
  ctx.beginPath();
  ctx.roundRect(
    box.x + lineWidth,
    box.y + lineWidth,
    Math.max(1, box.width - lineWidth * 2),
    Math.max(1, box.height - lineWidth * 2),
    Math.min(24, lineWidth * 3),
  );
  ctx.stroke();

  // A second, tighter pass deepens the bloom without washing out the video.
  ctx.lineWidth = lineWidth * 0.5;
  ctx.shadowBlur *= 0.5;
  ctx.stroke();
  ctx.restore();
}

function drawFilmGrain(
  ctx: CanvasRenderingContext2D,
  box: EffectRect,
  timeMs: number,
  intensity: number,
  params?: StudioEffectParams,
): void {
  const tile = getGrainTile();
  if (!tile) return;
  const pattern = ctx.createPattern(tile, 'repeat');
  if (!pattern) return;

  const amount = clamp(numberParam(params, 'grainAmount', 0.4), 0, 1);
  const grainSize = clamp(numberParam(params, 'grainSize', 1.5), 1, 5);
  const { x: dx, y: dy } = filmGrainOffset(timeMs, GRAIN_TILE_SIZE);

  // Scale the tile so `grainSize` actually changes the grain. `setTransform`
  // is not available in every test canvas, so a failure keeps 1:1.
  try {
    const matrix = new DOMMatrix();
    matrix.scaleSelf(grainSize, grainSize);
    pattern.setTransform(matrix);
  } catch {
    // Canvas/pattern implementation without transform support.
  }

  ctx.save();
  ctx.globalAlpha = clamp(0.5 * intensity * (amount / 0.4), 0, 1);
  ctx.translate(-dx, -dy);
  ctx.fillStyle = pattern;
  ctx.fillRect(box.x + dx, box.y + dy, box.width, box.height);
  ctx.restore();
}

function drawScanlines(
  ctx: CanvasRenderingContext2D,
  box: EffectRect,
  timeMs: number,
  intensity: number,
  params?: StudioEffectParams,
): void {
  const spacing = Math.max(1, Math.round(numberParam(params, 'lineSpacing', 2)));
  const lineOpacity = clamp(numberParam(params, 'lineOpacity', 0.3), 0, 1);
  const color = colorParam(params, 'lineColor', '#000000');
  const roll = (timeMs * 0.03) % spacing;

  ctx.save();
  ctx.globalAlpha = clamp(intensity * lineOpacity * 1.2, 0, 1);
  ctx.fillStyle = color;
  for (let y = box.y - spacing + roll; y < box.y + box.height; y += spacing) {
    if (y < box.y) continue;
    ctx.fillRect(box.x, y, box.width, Math.max(1, spacing / 2));
  }
  ctx.restore();
}
