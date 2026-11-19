import {
  drawDeviceFrameFooter,
  drawDeviceFrameHeader,
} from '@/components/studio/renderers/device-frames';
import { drawMotionCard } from '@/components/studio/renderers/motion-cards';
import {
  computeCameraTarget,
  stepCamera,
  type StudioCameraState,
} from './camera';
import { drawStudioFrame } from './compose';
import { drawStudioWindowChrome } from './frame';
import { sourceFromComp } from '../timeline/ripple';
import type { StudioCompositionLayer, StudioTakePresentation } from '../types';

export interface StudioTakeFrameInput {
  width: number;
  height: number;
  timeMs: number;
  compositionTimeMs: number;
  durationMs: number;
  video: HTMLVideoElement | null;
  videoReady: boolean;
  camera: StudioCameraState;
  presentation: StudioTakePresentation;
  overlayAssets: ReadonlyMap<
    string,
    {
      element: CanvasImageSource;
      width: number;
      height: number;
    }
  >;
  glowGradient?: CanvasGradient | null;
}

export function advanceStudioTakeCamera(
  current: StudioCameraState,
  presentation: StudioTakePresentation,
  timeMs: number,
  fps = 60,
): StudioCameraState {
  const target = computeCameraTarget({
    zooms: presentation.zooms,
    timeMs,
    zoomIntensity: presentation.styling.zoomIntensity,
  });
  const easing = presentation.styling.cameraEasing;
  if (fps >= 59.5) return stepCamera(current, target, easing);
  const smoothing =
    easing === 'snappy' ? 0.22 : easing === 'cinematic' ? 0.07 : 0.12;
  const alpha = 1 - Math.pow(1 - smoothing, 60 / Math.max(1, fps));
  return {
    scale: current.scale + (target.scale - current.scale) * alpha,
    panX: current.panX + (target.panX - current.panX) * alpha,
    panY: current.panY + (target.panY - current.panY) * alpha,
  };
}

export function sourceTimeForTakeLayer(
  layer: Extract<StudioCompositionLayer, { kind: 'video' }>,
  compositionTimeMs: number,
): number {
  const presentation = layer.takePresentation;
  const relativeMs = Math.max(0, compositionTimeMs - layer.startMs);
  const sourceMs = presentation
    ? layer.sourceInMs + sourceFromComp(relativeMs, presentation.cuts)
    : layer.sourceInMs + relativeMs;
  return Math.max(0, Math.min(layer.sourceDurationMs - 20, sourceMs));
}

function drawTakeWindowChrome(
  ctx: CanvasRenderingContext2D,
  frame: Parameters<typeof drawStudioWindowChrome>[1],
  presentation: StudioTakePresentation,
): void {
  const deviceFrame = presentation.styling.deviceFrame;
  if (deviceFrame && deviceFrame.type !== 'none') {
    drawDeviceFrameHeader(ctx, {
      frame: deviceFrame,
      winX: frame.x,
      winY: frame.y,
      winW: frame.width,
      winH: frame.height,
      headerH: frame.headerHeight,
      radius: frame.radius,
    });
    drawDeviceFrameFooter(ctx, {
      frame: deviceFrame,
      winX: frame.x,
      winY: frame.y,
      winW: frame.width,
      winH: frame.height,
      headerH: frame.headerHeight,
      radius: frame.radius,
    });
    return;
  }
  drawStudioWindowChrome(ctx, frame);
}

export function drawStudioTakeFrame(
  ctx: CanvasRenderingContext2D,
  input: StudioTakeFrameInput,
): void {
  const { presentation, width, height, compositionTimeMs, durationMs } = input;
  const styling = presentation.styling;

  drawStudioFrame(ctx, {
    width,
    height,
    styling,
    timeMs: input.timeMs,
    video: input.video,
    videoReady: input.videoReady,
    camera: input.camera,
    effects: presentation.effects,
    captions: presentation.captions,
    overlays: presentation.overlays,
    overlayAssets: input.overlayAssets,
    videoCrop: presentation.videoCrop,
    glowGradient: input.glowGradient,
    drawWindowChrome: (chromeCtx, frame) =>
      drawTakeWindowChrome(chromeCtx, frame, presentation),
  });

  if (styling.introCard?.enabled) {
    drawMotionCard(ctx, {
      card: styling.introCard,
      cardType: 'intro',
      currentTimeMs: compositionTimeMs,
      totalDurationMs: durationMs,
      cw: width,
      ch: height,
    });
  }
  if (styling.outroCard?.enabled) {
    drawMotionCard(ctx, {
      card: styling.outroCard,
      cardType: 'outro',
      currentTimeMs: compositionTimeMs,
      totalDurationMs: durationMs,
      cw: width,
      ch: height,
    });
  }
}
