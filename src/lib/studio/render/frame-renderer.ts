/**
 * lib/studio/render/frame-renderer.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Single entry point for painting a Studio frame.
 *
 * Callers do not choose a backend. This module selects the Tier 2.5 display-list
 * pipeline when the feature flag is on and the caller supplied timeline tracks,
 * and otherwise falls back to the legacy fused `drawStudioFrame`. Preview and
 * export both go through here, which is what keeps them consistent.
 *
 * Motion cards stay caller-owned on both paths, so the switch is pixel-neutral
 * for the intro/outro overlays.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { StudioOverlayAsset } from './overlays';
import { drawStudioFrame, type StudioComposeInput } from './compose';
import { isDisplayListRendererEnabled } from './display-list-flag';
import {
  buildFrameProgram,
  type ProgramAssetDimensions,
  type ProgramAssetRegistry,
} from './program';
import { rasterize2D, type RasterAssetRegistry } from './rasterize-2d';
import { evaluateEditorTimeline } from '../timeline/evaluate';

function dimensionMap(
  source: ReadonlyMap<string, StudioOverlayAsset> | undefined,
): Map<string, ProgramAssetDimensions> {
  const result = new Map<string, ProgramAssetDimensions>();
  if (!source) return result;
  for (const [key, asset] of source) {
    result.set(key, { width: asset.width, height: asset.height });
  }
  return result;
}

function elementMap(
  source: ReadonlyMap<string, StudioOverlayAsset> | undefined,
): Map<string, CanvasImageSource> {
  const result = new Map<string, CanvasImageSource>();
  if (!source) return result;
  for (const [key, asset] of source) {
    result.set(key, asset.element);
  }
  return result;
}

function buildDimensionRegistry(
  input: StudioComposeInput,
): ProgramAssetRegistry {
  return {
    byAssetId: dimensionMap(input.clipAssets),
    byClipId: dimensionMap(input.clipInstances),
    recordedVideo: input.video
      ? { width: input.video.videoWidth, height: input.video.videoHeight }
      : null,
  };
}

function buildElementRegistry(input: StudioComposeInput): RasterAssetRegistry {
  return {
    assets: elementMap(input.clipAssets),
    clipInstances: elementMap(input.clipInstances),
    overlays: elementMap(input.overlayAssets),
    recordedVideo: input.videoReady ? input.video : null,
  };
}

/**
 * Paint one Studio frame.
 *
 * The display-list path requires tracks — a legacy single-recording take has no
 * evaluated frame to describe, so it keeps using the fused renderer.
 */
export function renderStudioFrame(
  ctx: CanvasRenderingContext2D,
  input: StudioComposeInput,
): void {
  const canvasCamera = input.canvasCamera;
  const scale = canvasCamera?.scale ?? 1;
  const hasCanvasCamera = Number.isFinite(scale) && scale > 1.001;

  if (hasCanvasCamera) {
    const width = input.width;
    const height = input.height;
    // Clamp the pan so a scaled-up composition never exposes an empty edge.
    const halfSpan = 0.5 / scale;
    const panX = Math.max(
      halfSpan,
      Math.min(1 - halfSpan, canvasCamera?.panX ?? 0.5),
    );
    const panY = Math.max(
      halfSpan,
      Math.min(1 - halfSpan, canvasCamera?.panY ?? 0.5),
    );

    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.scale(scale, scale);
    ctx.translate(-panX * width, -panY * height);
    renderStudioFrameBody(ctx, input);
    ctx.restore();
    return;
  }

  renderStudioFrameBody(ctx, input);
}

function renderStudioFrameBody(
  ctx: CanvasRenderingContext2D,
  input: StudioComposeInput,
): void {
  if (!isDisplayListRendererEnabled() || !input.tracks) {
    drawStudioFrame(ctx, input);
    return;
  }

  const compTimeMs = input.compTimeMs ?? input.timeMs;
  const evaluatedFrame = input.evaluatedTimeline ??
    evaluateEditorTimeline(input.tracks, compTimeMs);

  const program = buildFrameProgram({
    width: input.width,
    height: input.height,
    compTimeMs,
    styling: input.styling,
    evaluatedFrame,
    camera: input.camera,
    videoCrop: input.videoCrop,
    assets: buildDimensionRegistry(input),
    overlays: input.overlays,
    overlayAssets: dimensionMap(input.overlayAssets),
    clipTransformPreview: input.clipTransformPreview,
    // Cards are painted by the caller after the frame on both paths.
    includeMotionCards: false,
  });

  rasterize2D(ctx, program, buildElementRegistry(input), {
    glowGradient: input.glowGradient,
  });
}
