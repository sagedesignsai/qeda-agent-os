/**
 * lib/trace/runtime/camera.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The 2D composition camera: framing math, pure and DOM-free.
 *
 * The camera is screen-space framing over the element graph. `x`/`y` name the
 * canvas point that sits at the centre of the frame, `zoom` is a multiplier and
 * `rotation` is in degrees. Subtitles, per-scene backgrounds and the entrance
 * veil are screen-space and never move with the camera.
 *
 * One function drives the editor, the video exporter and the static serializer
 * (the same transform string), so a camera move cannot look different in the
 * stage and in the file.
 *
 * Transform order: translate(centre) · rotate · scale · translate(-focus),
 * which is identity when the focus is the canvas centre, zoom is 1 and rotation
 * is 0.
 */

import { getValueAtTime } from '../animation/interpolator';
import type { TraceProject } from '../types';

export const CAMERA_PROPERTIES = ['x', 'y', 'zoom', 'rotation'] as const;
export type CameraProperty = (typeof CAMERA_PROPERTIES)[number];

export const CAMERA_LABELS: Record<CameraProperty, string> = {
  x: 'Focus X',
  y: 'Focus Y',
  zoom: 'Zoom',
  rotation: 'Rotation',
};

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 20;
const IDENTITY_EPSILON = 1e-3;

export interface TraceCameraState {
  x: number;
  y: number;
  zoom: number;
  rotation: number;
}

/** DOM id shared by the renderer and the per-frame runtime writer. */
export function cameraDomId(prefix = 'trace-elem'): string {
  return `${prefix}-camera`;
}

export function isCameraProperty(
  value: string,
): value is CameraProperty {
  return (CAMERA_PROPERTIES as readonly string[]).includes(value);
}

export function clampCameraZoom(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

function round(value: number, precision = 4): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

/** Resolve the camera at a point in time. Defaults to the full artboard. */
export function resolveCameraAtTime(
  project: TraceProject,
  timeMs: number,
): TraceCameraState {
  const camera = project.camera;
  const centerX = project.width / 2;
  const centerY = project.height / 2;

  let x =
    camera && typeof camera.x === 'number' && Number.isFinite(camera.x)
      ? camera.x
      : centerX;
  let y =
    camera && typeof camera.y === 'number' && Number.isFinite(camera.y)
      ? camera.y
      : centerY;
  let zoom = camera && typeof camera.zoom === 'number' ? camera.zoom : 1;
  let rotation =
    camera &&
    typeof camera.rotation === 'number' &&
    Number.isFinite(camera.rotation)
      ? camera.rotation
      : 0;

  for (const track of camera?.tracks ?? []) {
    if (!isCameraProperty(track.property)) continue;
    const value = getValueAtTime(track, timeMs);
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric)) continue;
    switch (track.property) {
      case 'x':
        x = numeric;
        break;
      case 'y':
        y = numeric;
        break;
      case 'zoom':
        zoom = numeric;
        break;
      case 'rotation':
        rotation = numeric;
        break;
    }
  }

  return { x, y, zoom: clampCameraZoom(zoom), rotation };
}

/** True when the framing matches an untouched artboard. */
export function isCameraIdentity(
  state: TraceCameraState,
  project: TraceProject,
): boolean {
  return (
    Math.abs(state.zoom - 1) < IDENTITY_EPSILON &&
    Math.abs(state.rotation) < IDENTITY_EPSILON &&
    Math.abs(state.x - project.width / 2) < 0.5 &&
    Math.abs(state.y - project.height / 2) < 0.5
  );
}

/** True when the project carries any camera framing (base or animated). */
export function hasCamera(project: TraceProject): boolean {
  const camera = project.camera;
  if (!camera) return false;
  if ((camera.tracks?.length ?? 0) > 0) return true;
  return !isCameraIdentity(resolveCameraAtTime(project, 0), project);
}

/**
 * The SVG transform that frames the graph. Shared by the serializer and the
 * DOM renderer so both produce the same pixels.
 */
export function cameraTransformString(
  project: TraceProject,
  state: TraceCameraState,
): string {
  const centerX = project.width / 2;
  const centerY = project.height / 2;
  return (
    `translate(${round(centerX)} ${round(centerY)}) ` +
    `rotate(${round(state.rotation)}) ` +
    `scale(${round(state.zoom, 5)}) ` +
    `translate(${round(-state.x)} ${round(-state.y)})`
  );
}

/** World/artboard point → framed screen point. */
export function cameraForwardPoint(
  project: TraceProject,
  state: TraceCameraState,
  point: { x: number; y: number },
): { x: number; y: number } {
  const centerX = project.width / 2;
  const centerY = project.height / 2;
  const radians = (state.rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = (point.x - state.x) * state.zoom;
  const dy = (point.y - state.y) * state.zoom;
  return {
    x: centerX + dx * cos - dy * sin,
    y: centerY + dx * sin + dy * cos,
  };
}

/** Framed screen point → world/artboard point (used by direct manipulation). */
export function cameraInversePoint(
  project: TraceProject,
  state: TraceCameraState,
  point: { x: number; y: number },
): { x: number; y: number } {
  const centerX = project.width / 2;
  const centerY = project.height / 2;
  const radians = (-state.rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = (point.x - centerX) / state.zoom;
  const dy = (point.y - centerY) / state.zoom;
  return {
    x: state.x + dx * cos - dy * sin,
    y: state.y + dx * sin + dy * cos,
  };
}