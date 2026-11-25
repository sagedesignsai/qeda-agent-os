/**
 * lib/studio/render/background-generator.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Public facade & unified frame dispatcher for Showcase Studio generative
 * backgrounds. Types, presets, serialization codec, and Canvas 2D painters live
 * in `./backgrounds/*` for clear separation of concerns.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  modulatePlasmaWithAudio,
  type AudioReactiveBands,
} from './audio-reactive';
import {
  drawAuroraBackground,
  drawBauhausBackground,
  drawWavesBackground,
} from './backgrounds/painters-geometric';
import {
  drawOrbitsBackground,
  drawTerrainBackground,
  drawTrailsBackground,
} from './backgrounds/painters-kinetic';
import type { GenerativeBackgroundConfig } from './backgrounds/types';
import { drawPlasmaShaderBackground } from './shader-background';

export * from './backgrounds/types';
export * from './backgrounds/presets';
export {
  getBackgroundPreviewCss,
  isGenerativeBackground,
  parseGenerativeBackground,
  randomizeGenerativeConfig,
  serializeGenerativeBackground,
} from './backgrounds/codec';

export function drawGenerativeBackground(
  ctx: CanvasRenderingContext2D,
  {
    width,
    height,
    config,
    timeMs = 0,
    audioBands,
  }: {
    width: number;
    height: number;
    config: GenerativeBackgroundConfig;
    timeMs?: number;
    audioBands?: AudioReactiveBands;
  },
): void {
  if (config.style === 'waves') {
    drawWavesBackground(ctx, width, height, config, timeMs);
    return;
  }
  if (config.style === 'aurora') {
    drawAuroraBackground(ctx, width, height, config, timeMs);
    return;
  }
  if (config.style === 'terrain') {
    drawTerrainBackground(ctx, width, height, config, timeMs);
    return;
  }
  if (config.style === 'orbits') {
    drawOrbitsBackground(ctx, width, height, config, timeMs);
    return;
  }
  if (config.style === 'trails') {
    drawTrailsBackground(ctx, width, height, config, timeMs);
    return;
  }
  if (config.style === 'plasma') {
    const timeSec = config.animated
      ? (timeMs / 1000) * config.speed
      : config.seed * 0.37;
    const baseParams = {
      width,
      height,
      timeSec,
      bgColor1: config.baseColor,
      bgColor2: config.colors[0] ?? '#4d1a80',
      lineColor: config.colors[1] ?? config.colors[0] ?? '#6633cc',
      accentColor: config.colors[2] ?? config.colors[1] ?? '#a855f7',
      lineCount: config.density,
      warp: 0.35 + (config.intensity / 100) * 1.3,
      seed: config.seed,
    };
    drawPlasmaShaderBackground(
      ctx,
      config.audioReactive && audioBands
        ? modulatePlasmaWithAudio(baseParams, audioBands)
        : baseParams,
    );
    return;
  }

  drawBauhausBackground(ctx, width, height, config, timeMs);
}
