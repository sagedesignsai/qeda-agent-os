/**
 * lib/studio/render/effects.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Canvas compositing passes for the `StudioEffect` catalog.
 *
 * Techniques, grounded in the Canvas 2D compositing model:
 *   - spotlight / vignette → radial-gradient alpha falloff (`source-over`)
 *   - neon-glow           → additive bloom via `globalCompositeOperation =
 *                           'lighter'` plus a `shadowBlur` stroke, which is the
 *                           standard canvas idiom for glow
 *   - film-grain          → a cached noise tile stamped with a random offset
 *   - scanlines           → a cached 1×4 line tile rolled by time
 *
 * Tiles are built lazily on an offscreen canvas. In a non-DOM environment
 * (jsdom without a canvas backend) tile creation returns null and the pass is
 * skipped rather than throwing.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { isStudioEffectActive } from '../effects/catalog';
import type { StudioEffect } from '../types';
import type { StudioWindowFrame } from './geometry';

const GRAIN_TILE_SIZE = 256;
const SCANLINE_TILE_HEIGHT = 4;

let grainTile: HTMLCanvasElement | null = null;
let scanlineTile: HTMLCanvasElement | null = null;

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

function getGrainTile(): HTMLCanvasElement | null {
  if (grainTile) return grainTile;
  if (typeof document === 'undefined') return null;
  const tile = document.createElement('canvas');
  tile.width = GRAIN_TILE_SIZE;
  tile.height = GRAIN_TILE_SIZE;
  const ctx = tile.getContext('2d');
  if (!ctx) return null;
  const image = ctx.createImageData(GRAIN_TILE_SIZE, GRAIN_TILE_SIZE);
  for (let index = 0; index < image.data.length; index += 4) {
    const value = Math.random() * 255;
    image.data[index] = value;
    image.data[index + 1] = value;
    image.data[index + 2] = value;
    image.data[index + 3] = Math.random() * 120;
  }
  ctx.putImageData(image, 0, 0);
  grainTile = tile;
  return tile;
}

function getScanlineTile(): HTMLCanvasElement | null {
  if (scanlineTile) return scanlineTile;
  if (typeof document === 'undefined') return null;
  const tile = document.createElement('canvas');
  tile.width = 1;
  tile.height = SCANLINE_TILE_HEIGHT;
  const ctx = tile.getContext('2d');
  if (!ctx) return null;
  ctx.clearRect(0, 0, 1, SCANLINE_TILE_HEIGHT);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
  ctx.fillRect(0, 0, 1, 2);
  scanlineTile = tile;
  return tile;
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
    const intensity = Math.max(0, Math.min(1, effect.intensity));
    if (intensity <= 0) continue;
    switch (effect.type) {
      case 'spotlight':
        drawSpotlight(ctx, frame, intensity);
        break;
      case 'vignette':
        drawVignette(ctx, frame, intensity);
        break;
      case 'neon-glow':
        drawNeonGlow(ctx, frame, intensity);
        break;
      case 'film-grain':
        drawFilmGrain(ctx, frame, intensity);
        break;
      case 'scanlines':
        drawScanlines(ctx, frame, timeMs, intensity);
        break;
    }
  }
}

function drawSpotlight(
  ctx: CanvasRenderingContext2D,
  frame: StudioWindowFrame,
  intensity: number,
): void {
  const rect = contentRect(frame);
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const radius = Math.hypot(rect.width, rect.height) / 2;

  const gradient = ctx.createRadialGradient(cx, cy, radius * 0.15, cx, cy, radius);
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
  gradient.addColorStop(0.5, 'rgba(0, 0, 0, 0)');
  gradient.addColorStop(1, `rgba(0, 0, 0, ${0.9 * intensity})`);

  ctx.save();
  ctx.fillStyle = gradient;
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  ctx.restore();
}

function drawVignette(
  ctx: CanvasRenderingContext2D,
  frame: StudioWindowFrame,
  intensity: number,
): void {
  const rect = contentRect(frame);
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const radius = Math.hypot(rect.width, rect.height) / 2;

  const gradient = ctx.createRadialGradient(cx, cy, radius * 0.35, cx, cy, radius);
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
  gradient.addColorStop(1, `rgba(0, 0, 0, ${0.85 * intensity})`);

  ctx.save();
  ctx.fillStyle = gradient;
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  ctx.restore();
}

function drawNeonGlow(
  ctx: CanvasRenderingContext2D,
  frame: StudioWindowFrame,
  intensity: number,
): void {
  const rect = contentRect(frame);
  const lineWidth = Math.max(2, Math.min(rect.width, rect.height) * 0.018);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = `rgba(99, 102, 241, ${0.5 * intensity})`;
  ctx.shadowColor = `rgba(129, 140, 248, ${0.9 * intensity})`;
  ctx.shadowBlur = Math.min(rect.width, rect.height) * 0.14;
  ctx.beginPath();
  ctx.roundRect(
    rect.x + lineWidth,
    rect.y + lineWidth,
    rect.width - lineWidth * 2,
    rect.height - lineWidth * 2,
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
  frame: StudioWindowFrame,
  intensity: number,
): void {
  const tile = getGrainTile();
  if (!tile) return;
  const pattern = ctx.createPattern(tile, 'repeat');
  if (!pattern) return;

  const rect = contentRect(frame);
  const dx = Math.random() * GRAIN_TILE_SIZE;
  const dy = Math.random() * GRAIN_TILE_SIZE;

  ctx.save();
  ctx.globalAlpha = 0.5 * intensity;
  ctx.translate(-dx, -dy);
  ctx.fillStyle = pattern;
  ctx.fillRect(rect.x + dx, rect.y + dy, rect.width, rect.height);
  ctx.restore();
}

function drawScanlines(
  ctx: CanvasRenderingContext2D,
  frame: StudioWindowFrame,
  timeMs: number,
  intensity: number,
): void {
  const tile = getScanlineTile();
  if (!tile) return;
  const pattern = ctx.createPattern(tile, 'repeat');
  if (!pattern) return;

  const rect = contentRect(frame);
  const roll = (timeMs * 0.03) % SCANLINE_TILE_HEIGHT;

  ctx.save();
  ctx.globalAlpha = 0.35 * intensity;
  ctx.translate(0, -roll);
  ctx.fillStyle = pattern;
  ctx.fillRect(rect.x, rect.y + roll, rect.width, rect.height);
  ctx.restore();
}
