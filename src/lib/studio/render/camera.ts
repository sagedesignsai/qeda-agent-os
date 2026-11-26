/**
 * lib/studio/render/camera.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Kinetic camera: resolves the active zoom keyframe into a scale/pan target and
 * eases the live camera toward it.
 *
 * The camera is intentionally a *render-loop* concern, not React state: the
 * caller owns the mutable `StudioCameraState` and steps it once per frame.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { StudioCameraEasing, StudioZoom } from '../types';
import { evaluateKeyframesAt } from '../keyframes';

export interface StudioCameraState {
  scale: number;
  panX: number;
  panY: number;
}

export const IDLE_CAMERA: StudioCameraState = { scale: 1, panX: 0.5, panY: 0.5 };

/** Seconds the camera takes to fully commit to a zoom edge. */
const TRANSITION_MS = 450;
/** Zoom keyframes look ahead/behind by this much so easing can start early. */
const LOOKAHEAD_MS = 400;

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Resolve the zoomed camera target for `timeMs`. Returns the resting camera
 * when no zoom covers the playhead (including the +/- look-ahead window).
 */
export function computeCameraTarget({
  zooms,
  timeMs,
  zoomIntensity,
}: {
  zooms: readonly StudioZoom[];
  timeMs: number;
  zoomIntensity: number;
}): StudioCameraState {
  const active = zooms.find(
    (zoom) =>
      timeMs >= zoom.startMs - LOOKAHEAD_MS &&
      timeMs <= zoom.endMs + LOOKAHEAD_MS,
  );
  if (!active) return { ...IDLE_CAMERA };

  let progress = 1;
  if (timeMs < active.startMs) {
    progress = easeInOutCubic(
      clamp01((timeMs - (active.startMs - TRANSITION_MS)) / TRANSITION_MS),
    );
  } else if (timeMs > active.endMs) {
    progress = easeInOutCubic(
      clamp01(1 - (timeMs - active.endMs) / TRANSITION_MS),
    );
  }

  const values = resolveZoomValues(active, timeMs);
  const scaleBoost = (values.scale - 1) * (zoomIntensity / 1.5);
  return {
    scale: 1 + scaleBoost * progress,
    panX: 0.5 + (values.targetX - 0.5) * progress,
    panY: 0.5 + (values.targetY - 0.5) * progress,
  };
}

/**
 * Static zoom values, or the keyframed ones at `timeMs` when the zoom clip
 * carries `zoomScale` / `zoomTargetX` / `zoomTargetY` keyframes.
 *
 * Keyframe times are clip-local, so the composition-time sample is offset by
 * the zoom's start.
 */
function resolveZoomValues(
  zoom: StudioZoom,
  timeMs: number,
): Pick<StudioZoom, 'scale' | 'targetX' | 'targetY'> {
  const keyframes = zoom.keyframes;
  if (!keyframes || keyframes.length === 0) {
    return {
      scale: zoom.scale,
      targetX: zoom.targetX,
      targetY: zoom.targetY,
    };
  }
  const localTimeMs = Math.max(
    0,
    Math.min(zoom.endMs - zoom.startMs, timeMs - zoom.startMs),
  );
  return {
    scale:
      evaluateKeyframesAt(keyframes, localTimeMs, 'zoomScale', undefined) ??
      zoom.scale,
    targetX:
      evaluateKeyframesAt(keyframes, localTimeMs, 'zoomTargetX', undefined) ??
      zoom.targetX,
    targetY:
      evaluateKeyframesAt(keyframes, localTimeMs, 'zoomTargetY', undefined) ??
      zoom.targetY,
  };
}

/**
 * Per-easing smoothing factors calibrated for 60 Hz (16.667 ms per frame).
 * Exported so the export renderer can adapt these to its own frame rate.
 */
export const CAMERA_SMOOTHING_60FPS: Record<StudioCameraEasing, number> = {
  snappy: 0.22,
  smooth: 0.12,
  cinematic: 0.07,
};

/**
 * Step camera with frame-rate-independent smoothing.
 *
 * Converts the 60 Hz smoothing factor to the actual frame delta so camera
 * motion is identical on 60 Hz, 120 Hz, and export (fixed fps).
 * Formula: `alpha = 1 - (1 - smoothing)^(dtMs / 16.667)`
 */
export function stepCameraWithDelta(
  current: StudioCameraState,
  target: StudioCameraState,
  easing: StudioCameraEasing,
  dtMs: number,
): StudioCameraState {
  const smoothing60 = CAMERA_SMOOTHING_60FPS[easing] ?? CAMERA_SMOOTHING_60FPS.smooth;
  // Frame-rate independent alpha: at dtMs=16.667 this equals smoothing60
  const alpha = 1 - Math.pow(1 - smoothing60, dtMs / 16.667);
  return {
    scale: current.scale + (target.scale - current.scale) * alpha,
    panX: current.panX + (target.panX - current.panX) * alpha,
    panY: current.panY + (target.panY - current.panY) * alpha,
  };
}

/** Ease `current` toward `target`; returns a new state (never mutates). */
export function stepCamera(
  current: StudioCameraState,
  target: StudioCameraState,
  easing: StudioCameraEasing,
): StudioCameraState {
  return stepCameraWithDelta(current, target, easing, 16.667);
}

/**
 * Source crop for a camera state, clamped so the crop never leaves the frame.
 */
export function cameraSourceRect(
  camera: StudioCameraState,
  videoWidth: number,
  videoHeight: number,
): { x: number; y: number; width: number; height: number } {
  const cropWidth = videoWidth / Math.max(camera.scale, 0.01);
  const cropHeight = videoHeight / Math.max(camera.scale, 0.01);
  return {
    x: Math.max(0, Math.min(videoWidth - cropWidth, camera.panX * videoWidth - cropWidth / 2)),
    y: Math.max(0, Math.min(videoHeight - cropHeight, camera.panY * videoHeight - cropHeight / 2)),
    width: cropWidth,
    height: cropHeight,
  };
}
