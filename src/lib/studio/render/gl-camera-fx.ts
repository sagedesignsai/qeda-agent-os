/**
 * lib/studio/render/gl-camera-fx.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure camera-velocity helpers for driving GPU `motion-blur` from consecutive
 * `StudioCameraState` samples during fast pan/zoom animations.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { StudioCameraState } from './camera';

export interface CameraMotionBlurParams {
  intensity: number;
  distance: number;
  angle: number;
  samples: number;
}

/**
 * Derive directional `motion-blur` parameters from two consecutive camera
 * states. Returns `null` when the camera is effectively stationary.
 */
export function computeCameraMotionBlur(
  prev: StudioCameraState,
  curr: StudioCameraState,
  viewportWidth: number,
  viewportHeight: number,
  sensitivity = 1,
): CameraMotionBlurParams | null {
  const dx = (curr.panX - prev.panX) * viewportWidth;
  const dy = (curr.panY - prev.panY) * viewportHeight;
  const dZoom = Math.abs(curr.scale - prev.scale) * Math.min(viewportWidth, viewportHeight) * 0.25;

  const speed = Math.hypot(dx, dy) + dZoom;
  const scaled = speed * Math.max(0, sensitivity);
  if (scaled < 1.5) return null;

  const distance = Math.min(48, scaled);
  const intensity = Math.min(1, distance / 32);
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);

  return {
    intensity,
    distance,
    angle: Number.isFinite(angle) ? angle : 0,
    samples: distance > 20 ? 12 : 8,
  };
}
