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

  const scaleBoost = (active.scale - 1) * (zoomIntensity / 1.5);
  return {
    scale: 1 + scaleBoost * progress,
    panX: 0.5 + (active.targetX - 0.5) * progress,
    panY: 0.5 + (active.targetY - 0.5) * progress,
  };
}

/** Ease `current` toward `target`; returns a new state (never mutates). */
export function stepCamera(
  current: StudioCameraState,
  target: StudioCameraState,
  easing: StudioCameraEasing,
): StudioCameraState {
  const smoothing =
    easing === 'snappy' ? 0.22 : easing === 'cinematic' ? 0.07 : 0.12;
  return {
    scale: current.scale + (target.scale - current.scale) * smoothing,
    panX: current.panX + (target.panX - current.panX) * smoothing,
    panY: current.panY + (target.panY - current.panY) * smoothing,
  };
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
