/**
 * lib/trace/gizmo/geometry.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure, DOM-free math for the Trace transform gizmo.
 *
 * Coordinate model (mirrors TraceRenderer / dom-renderer):
 *   artboard = origin + translate(x, y) + R(rotation) * S(scaleX, scaleY)
 *              * (local - origin)
 * where `local` is the element's bounding-box space (getBBox with the
 * element's own CSS transform neutralised) and transformBox is view-box.
 *
 * Everything here is deterministic and unit-testable in jsdom: no React,
 * no DOM measurement, no GSAP.
 */

export interface GizmoPoint {
  x: number;
  y: number;
}

export interface GizmoTransform {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
}

export interface GizmoBBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type GizmoHandle =
  | 'move'
  | 'rotate'
  | 'nw'
  | 'n'
  | 'ne'
  | 'e'
  | 'se'
  | 's'
  | 'sw'
  | 'w'
  | 'origin';

export const GIZMO_SCALE_HANDLES: GizmoHandle[] = [
  'nw',
  'n',
  'ne',
  'e',
  'se',
  's',
  'sw',
  'w',
];

export const MIN_GIZMO_SCALE = 0.05;
export const MAX_GIZMO_SCALE = 32;
export const ROTATE_SNAP_DEG = 15;

/** Screen-space size of a handle; converted to artboard units by /zoom. */
export const GIZMO_HANDLE_SIZE_PX = 9;
/** Screen-space stem length for the rotate handle. */
export const GIZMO_ROTATE_STEM_PX = 28;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clampGizmoScale(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return clamp(value, MIN_GIZMO_SCALE, MAX_GIZMO_SCALE);
}

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/** Smallest signed delta between two headings, in (-180, 180]. */
export function angleDeltaDeg(fromDeg: number, toDeg: number): number {
  let delta = (toDeg - fromDeg) % 360;
  if (delta > 180) delta -= 360;
  if (delta <= -180) delta += 360;
  return delta;
}

export function normalizeRotationDeg(rotation: number): number {
  return angleDeltaDeg(0, rotation);
}

export function add(a: GizmoPoint, b: GizmoPoint): GizmoPoint {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function sub(a: GizmoPoint, b: GizmoPoint): GizmoPoint {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function dot(a: GizmoPoint, b: GizmoPoint): number {
  return a.x * b.x + a.y * b.y;
}

/** Rotate a vector by `deg` degrees (SVG y-down, positive = clockwise). */
export function rotateVector(vector: GizmoPoint, deg: number): GizmoPoint {
  const rad = degToRad(deg);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: vector.x * cos - vector.y * sin,
    y: vector.x * sin + vector.y * cos,
  };
}

/** Element-local point → artboard point. */
export function localToArtboard(
  local: GizmoPoint,
  transform: GizmoTransform,
  origin: GizmoPoint,
): GizmoPoint {
  const scaled = {
    x: (local.x - origin.x) * transform.scaleX,
    y: (local.y - origin.y) * transform.scaleY,
  };
  const rotated = rotateVector(scaled, transform.rotation);
  return {
    x: origin.x + transform.x + rotated.x,
    y: origin.y + transform.y + rotated.y,
  };
}

/** Artboard point → element-local point (inverse of localToArtboard). */
export function artboardToLocal(
  artboard: GizmoPoint,
  transform: GizmoTransform,
  origin: GizmoPoint,
): GizmoPoint {
  const unrotated = rotateVector(
    {
      x: artboard.x - origin.x - transform.x,
      y: artboard.y - origin.y - transform.y,
    },
    -transform.rotation,
  );
  const safeScaleX = transform.scaleX === 0 ? 1 : transform.scaleX;
  const safeScaleY = transform.scaleY === 0 ? 1 : transform.scaleY;
  return {
    x: origin.x + unrotated.x / safeScaleX,
    y: origin.y + unrotated.y / safeScaleY,
  };
}

/** Artboard position of the rotation/scale pivot (local `origin`). */
export function getPivot(
  transform: GizmoTransform,
  origin: GizmoPoint,
): GizmoPoint {
  return { x: origin.x + transform.x, y: origin.y + transform.y };
}

export interface ObbCorners {
  nw: GizmoPoint;
  ne: GizmoPoint;
  se: GizmoPoint;
  sw: GizmoPoint;
  center: GizmoPoint;
  pivot: GizmoPoint;
  topCenter: GizmoPoint;
  bottomCenter: GizmoPoint;
  leftCenter: GizmoPoint;
  rightCenter: GizmoPoint;
}

/** Oriented bounding box of `bbox` under `transform` about `origin`. */
export function getObbCorners(
  bbox: GizmoBBox,
  transform: GizmoTransform,
  origin: GizmoPoint,
): ObbCorners {
  const { x, y, width, height } = bbox;
  const nw = localToArtboard({ x, y }, transform, origin);
  const ne = localToArtboard({ x: x + width, y }, transform, origin);
  const se = localToArtboard({ x: x + width, y: y + height }, transform, origin);
  const sw = localToArtboard({ x, y: y + height }, transform, origin);
  return {
    nw,
    ne,
    se,
    sw,
    center: { x: (nw.x + se.x) / 2, y: (nw.y + se.y) / 2 },
    pivot: getPivot(transform, origin),
    topCenter: { x: (nw.x + ne.x) / 2, y: (nw.y + ne.y) / 2 },
    bottomCenter: { x: (sw.x + se.x) / 2, y: (sw.y + se.y) / 2 },
    leftCenter: { x: (nw.x + sw.x) / 2, y: (nw.y + sw.y) / 2 },
    rightCenter: { x: (ne.x + se.x) / 2, y: (ne.y + se.y) / 2 },
  };
}

export interface HandlePositions extends ObbCorners {
  /** Edge-midpoint aliases matching scale-handle names. */
  n: GizmoPoint;
  e: GizmoPoint;
  s: GizmoPoint;
  w: GizmoPoint;
  rotate: GizmoPoint;
  originPoint: GizmoPoint;
}

/**
 * Handle positions in artboard units. `zoom` is the viewport scale
 * (screen px per artboard unit) so handles stay constant screen size.
 */
export function getHandlePositions(
  bbox: GizmoBBox,
  transform: GizmoTransform,
  origin: GizmoPoint,
  zoom: number,
): HandlePositions {
  const corners = getObbCorners(bbox, transform, origin);
  const safeZoom = zoom > 0 && Number.isFinite(zoom) ? zoom : 1;
  const stem = GIZMO_ROTATE_STEM_PX / safeZoom;
  // Outward from the top edge: opposite the local +Y axis.
  const outward = rotateVector({ x: 0, y: -1 }, transform.rotation);
  return {
    ...corners,
    n: corners.topCenter,
    e: corners.rightCenter,
    s: corners.bottomCenter,
    w: corners.leftCenter,
    rotate: {
      x: corners.topCenter.x + outward.x * stem,
      y: corners.topCenter.y + outward.y * stem,
    },
    originPoint: corners.pivot,
  };
}

/** Translate: artboard delta, optionally axis-locked to the dominant axis. */
export function translateTransform(
  start: GizmoTransform,
  delta: GizmoPoint,
  options: { axisLock?: boolean } = {},
): GizmoTransform {
  let { x: dx, y: dy } = delta;
  if (options.axisLock) {
    if (Math.abs(dx) >= Math.abs(dy)) dy = 0;
    else dx = 0;
  }
  return { ...start, x: start.x + dx, y: start.y + dy };
}

/** Rotate about the pivot; Shift snaps the result to ROTATE_SNAP_DEG. */
export function rotateTransform(
  start: GizmoTransform,
  center: GizmoPoint,
  startPointer: GizmoPoint,
  currentPointer: GizmoPoint,
  options: { snap?: boolean } = {},
): GizmoTransform {
  const startAngle = radToDeg(
    Math.atan2(
      startPointer.y - center.y,
      startPointer.x - center.x,
    ),
  );
  const currentAngle = radToDeg(
    Math.atan2(
      currentPointer.y - center.y,
      currentPointer.x - center.x,
    ),
  );
  const delta = angleDeltaDeg(startAngle, currentAngle);
  let rotation = start.rotation + delta;
  if (options.snap) {
    rotation =
      Math.round(rotation / ROTATE_SNAP_DEG) * ROTATE_SNAP_DEG;
  }
  return { ...start, rotation };
}

function handleLocalPoint(handle: GizmoHandle, bbox: GizmoBBox): GizmoPoint {
  const { x, y, width, height } = bbox;
  switch (handle) {
    case 'nw':
      return { x, y };
    case 'n':
      return { x: x + width / 2, y };
    case 'ne':
      return { x: x + width, y };
    case 'e':
      return { x: x + width, y: y + height / 2 };
    case 'se':
      return { x: x + width, y: y + height };
    case 's':
      return { x: x + width / 2, y: y + height };
    case 'sw':
      return { x, y: y + height };
    case 'w':
      return { x, y: y + height / 2 };
    default:
      return { x: x + width / 2, y: y + height / 2 };
  }
}

function oppositePinLocal(
  handle: GizmoHandle,
  bbox: GizmoBBox,
  fromCenter: boolean,
): GizmoPoint {
  const { x, y, width, height } = bbox;
  if (fromCenter) return { x: x + width / 2, y: y + height / 2 };
  switch (handle) {
    case 'se':
      return { x, y };
    case 'e':
      return { x, y: y + height / 2 };
    case 's':
      return { x: x + width / 2, y };
    case 'sw':
      return { x: x + width, y };
    case 'w':
      return { x: x + width, y: y + height / 2 };
    case 'n':
      return { x: x + width / 2, y: y + height };
    case 'nw':
      return { x: x + width, y: y + height };
    case 'ne':
      return { x, y: y + height };
    default:
      return { x: x + width / 2, y: y + height / 2 };
  }
}

/**
 * Scale factors via a handle (translate untouched). Pointer delta is
 * projected onto the element's rotated local axes.
 */
export function scaleTransform(
  start: GizmoTransform,
  bbox: GizmoBBox,
  handle: GizmoHandle,
  delta: GizmoPoint,
  options: { uniform?: boolean; fromCenter?: boolean } = {},
): GizmoTransform {
  if (
    handle !== 'nw' &&
    handle !== 'n' &&
    handle !== 'ne' &&
    handle !== 'e' &&
    handle !== 'se' &&
    handle !== 's' &&
    handle !== 'sw' &&
    handle !== 'w'
  ) {
    return start;
  }
  const u = rotateVector({ x: 1, y: 0 }, start.rotation);
  const v = rotateVector({ x: 0, y: 1 }, start.rotation);
  const projX = dot(delta, u);
  const projY = dot(delta, v);

  // Vector from the pinned point to the grabbed handle, in local space.
  // Scale is derived so the handle follows the pointer exactly:
  //   S' * d = S * d + R^-1 * delta  =>  sx' = sx + projX / d.x, etc.
  // With fromCenter the pin is the bbox centre, so d is half the size
  // and the same pointer delta yields twice the scale change.
  const handleLocal = handleLocalPoint(handle, bbox);
  const pin = oppositePinLocal(handle, bbox, options.fromCenter ?? false);
  const dLocal = { x: handleLocal.x - pin.x, y: handleLocal.y - pin.y };

  let nextScaleX = start.scaleX;
  let nextScaleY = start.scaleY;
  if (Math.abs(dLocal.x) >= 1) {
    nextScaleX = start.scaleX + projX / dLocal.x;
  }
  if (Math.abs(dLocal.y) >= 1) {
    nextScaleY = start.scaleY + projY / dLocal.y;
  }
  // Edge handles move only one axis: freeze the other scale component.
  if (handle === 'e' || handle === 'w') nextScaleY = start.scaleY;
  if (handle === 'n' || handle === 's') nextScaleX = start.scaleX;

  if (options.uniform) {
    const factorX = start.scaleX === 0 ? 1 : nextScaleX / start.scaleX;
    const factorY = start.scaleY === 0 ? 1 : nextScaleY / start.scaleY;
    const factor = (factorX + factorY) / 2;
    nextScaleX = start.scaleX * factor;
    nextScaleY = start.scaleY * factor;
  }

  nextScaleX = clampGizmoScale(nextScaleX);
  nextScaleY = clampGizmoScale(nextScaleY);

  return {
    ...start,
    scaleX: nextScaleX,
    scaleY: nextScaleY,
  };
}

/**
 * Scale via a handle with correct translate compensation about `origin`.
 * Prefer this entry point; `scaleTransform` is kept for axis-only checks.
 */
export function scaleTransformAboutOrigin(
  start: GizmoTransform,
  origin: GizmoPoint,
  bbox: GizmoBBox,
  handle: GizmoHandle,
  delta: GizmoPoint,
  options: { uniform?: boolean; fromCenter?: boolean } = {},
): GizmoTransform {
  const scaled = scaleTransform(start, bbox, handle, delta, options);
  if (scaled === start) return start;
  const pin = oppositePinLocal(handle, bbox, options.fromCenter ?? false);
  const diff = {
    x: (start.scaleX - scaled.scaleX) * (pin.x - origin.x),
    y: (start.scaleY - scaled.scaleY) * (pin.y - origin.y),
  };
  const compensation = rotateVector(diff, start.rotation);
  return {
    ...scaled,
    x: start.x + compensation.x,
    y: start.y + compensation.y,
  };
}

export interface OriginDragResult {
  transform: GizmoTransform;
  origin: GizmoPoint;
}

/**
 * Drag the anchor/origin marker. The bbox center stays fixed in artboard
 * space: T' = T + (I - R*S) * (O - O'), O' = O + R^-1 * S^-1 * delta.
 */
export function originTransform(
  start: GizmoTransform,
  startOrigin: GizmoPoint,
  delta: GizmoPoint,
): OriginDragResult {
  const unrotated = rotateVector(delta, -start.rotation);
  const safeScaleX = start.scaleX === 0 ? 1 : start.scaleX;
  const safeScaleY = start.scaleY === 0 ? 1 : start.scaleY;
  const localDelta = {
    x: unrotated.x / safeScaleX,
    y: unrotated.y / safeScaleY,
  };
  const nextOrigin = {
    x: startOrigin.x + localDelta.x,
    y: startOrigin.y + localDelta.y,
  };
  const oMinusNext = {
    x: startOrigin.x - nextOrigin.x,
    y: startOrigin.y - nextOrigin.y,
  };
  const rsTimesDiff = rotateVector(
    {
      x: oMinusNext.x * start.scaleX,
      y: oMinusNext.y * start.scaleY,
    },
    start.rotation,
  );
  const transform = {
    ...start,
    x: start.x + (oMinusNext.x - rsTimesDiff.x),
    y: start.y + (oMinusNext.y - rsTimesDiff.y),
  };
  return { transform, origin: nextOrigin };
}

/** Round a committed transform for storage (keeps undo diffs stable). */
export function roundGizmoTransform(
  transform: GizmoTransform,
): GizmoTransform {
  const round2 = (value: number) => Math.round(value * 100) / 100;
  const round4 = (value: number) => Math.round(value * 10000) / 10000;
  return {
    x: round2(transform.x),
    y: round2(transform.y),
    rotation: round2(transform.rotation),
    scaleX: round4(transform.scaleX),
    scaleY: round4(transform.scaleY),
  };
}

export function formatGizmoReadout(
  handle: GizmoHandle,
  transform: GizmoTransform,
): string {
  switch (handle) {
    case 'rotate':
      return `${Math.round(transform.rotation)}°`;
    case 'move':
    case 'origin':
      return `x ${Math.round(transform.x)}  y ${Math.round(transform.y)}`;
    default:
      return `${Math.round(transform.scaleX * 100)}% × ${Math.round(
        transform.scaleY * 100,
      )}%`;
  }
}
