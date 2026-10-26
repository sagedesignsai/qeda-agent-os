/**
 * lib/studio/render/compose.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The single composition pass for a Studio preview frame.
 *
 * Order (bottom → top):
 *   1. wallpaper + ambient glow
 *   2. window shadow
 *   3. camera-transformed video (clipped to the rounded window)
 *   4. media overlays
 *   5. canvas effect passes
 *   6. window chrome (header, dots, border)
 *   7. captions
 *
 * Keeping the order in one place means the Canvas preview, and any future
 * export renderer, paint identical frames.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { resolveActiveStudioCaption } from '../captions/presets';
import type {
  StudioCaption,
  StudioEffect,
  StudioOverlay,
  StudioStyling,
  StudioVideoCrop,
} from '../types';
import { drawStudioBackground } from './background';
import { cameraSourceRect, type StudioCameraState } from './camera';
import { drawStudioCaption } from './captions';
import { drawStudioEffects } from './effects';
import { drawStudioWindowChrome, drawStudioWindowShadow } from './frame';
import { computeStudioWindowFrame } from './geometry';
import { drawStudioOverlays, type StudioOverlayAsset } from './overlays';

export interface StudioComposeInput {
  width: number;
  height: number;
  styling: StudioStyling;
  timeMs: number;
  video: HTMLVideoElement | null;
  videoReady: boolean;
  camera: StudioCameraState;
  effects: readonly StudioEffect[];
  captions: readonly StudioCaption[];
  overlays: readonly StudioOverlay[];
  overlayAssets: ReadonlyMap<string, StudioOverlayAsset>;
  videoCrop?: StudioVideoCrop;
  /** Cached radial glow, rebuilt only when the canvas size changes. */
  glowGradient?: CanvasGradient | null;
  /** Optional custom window chrome / device frame renderer */
  drawWindowChrome?: (
    ctx: CanvasRenderingContext2D,
    frame: import('./geometry').StudioWindowFrame,
  ) => void;
}

export function drawStudioFrame(
  ctx: CanvasRenderingContext2D,
  input: StudioComposeInput,
): void {
  const { width, height, styling, timeMs } = input;

  drawStudioBackground(ctx, {
    width,
    height,
    background: styling.background,
    glowGradient: input.glowGradient,
  });

  const crop = input.videoCrop;
  const videoAspect =
    crop && crop.width > 0 && crop.height > 0
      ? crop.width / crop.height
      : input.video && input.video.videoWidth > 0 && input.video.videoHeight > 0
        ? input.video.videoWidth / input.video.videoHeight
        : 16 / 9;

  const frame = computeStudioWindowFrame({
    canvasWidth: width,
    canvasHeight: height,
    padding: styling.padding,
    borderRadius: styling.borderRadius,
    contentAspect: videoAspect,
  });

  drawStudioWindowShadow(ctx, frame);

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(frame.x, frame.y, frame.width, frame.height, frame.radius);
  ctx.clip();

  if (input.videoReady && input.video) {
    const vw = input.video.videoWidth || 1920;
    const vh = input.video.videoHeight || 1080;
    const source = crop
      ? {
          x: Math.max(0, Math.min(vw, crop.x * vw)),
          y: Math.max(0, Math.min(vh, crop.y * vh)),
          width: Math.max(1, crop.width * vw),
          height: Math.max(1, crop.height * vh),
        }
      : cameraSourceRect(input.camera, vw, vh);
    ctx.drawImage(
      input.video,
      source.x,
      source.y,
      source.width,
      source.height,
      frame.contentX,
      frame.contentY,
      frame.contentWidth,
      frame.contentHeight,
    );
  } else {
    ctx.fillStyle = '#0b0d12';
    ctx.fillRect(
      frame.contentX,
      frame.contentY,
      frame.contentWidth,
      frame.contentHeight,
    );
  }

  drawStudioOverlays(ctx, input.overlays, input.overlayAssets, frame, timeMs);
  drawStudioEffects(ctx, input.effects, frame, timeMs);
  (input.drawWindowChrome ?? drawStudioWindowChrome)(ctx, frame);

  ctx.restore();

  const caption = styling.showCaptions
    ? resolveActiveStudioCaption(input.captions, timeMs)
    : null;
  if (caption) {
    drawStudioCaption(ctx, {
      caption,
      style: styling.captionStyle,
      frame,
      timeMs,
    });
  }
}
