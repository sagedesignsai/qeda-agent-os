/**
 * components/motion/scene/camera-pose.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The camera rig: position, aim, roll and handheld shake.
 *
 * This module exists because the camera is no longer "a transform that happens
 * to look at the origin". It is a rig with three aiming modes, and the export
 * renderer must reproduce the viewport's pose down to the sub-pixel. Keeping the
 * math here (and out of the React binding) makes it unit-testable without WebGL.
 *
 * Angles in node data are degrees, like every other rotation in a Motion
 * document. Three.js wants radians, so conversion happens at exactly this edge.
 */

import { Vector3 } from 'three';
import type { PerspectiveCamera } from 'three';
import type { Group } from 'three';

import type { MotionNode } from '@/lib/motion/types';

export type MotionCameraView = 'cinematic' | 'editorial';
export type MotionCameraAim = 'origin' | 'target' | 'free';

/**
 * What the frame binding resolved for the camera this frame. The composer runs
 * at a later `useFrame` priority and reads this rather than re-evaluating the
 * timeline, so a frame is evaluated exactly once.
 */
export type MotionCameraRigSnapshot = {
  node: MotionNode | null;
  aimTarget: Vector3 | null;
  /** World units; already resolved from `focusDistance` or the aim target. */
  focusDistance: number;
};

const DEG = Math.PI / 180;
const ORIGIN = new Vector3(0, 0, 0);

/** Where the camera sits when the document has no camera node. */
export const DEFAULT_CAMERA_POSITION: readonly [number, number, number] = [3.7, 2.7, 5.1];

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function cameraAimOf(node: MotionNode): MotionCameraAim {
  const aim = node.props.aim;
  return aim === 'target' || aim === 'free' ? aim : 'origin';
}

/**
 * The world-space point the camera should aim at, or `null` when the node has no
 * usable target (unset id, deleted node, bad offset). Callers fall back to the
 * origin, which is the legacy behaviour.
 */
export function resolveAimTarget(
  node: MotionNode,
  groups: ReadonlyMap<string, Group> | undefined,
): Vector3 | null {
  const targetId = node.props.targetId;
  if (typeof targetId !== 'string' || targetId.length === 0 || !groups) return null;
  const object = groups.get(targetId);
  if (!object) return null;
  const point = object.getWorldPosition(new Vector3());
  const offset = node.props.targetOffset;
  if (Array.isArray(offset) && offset.length === 3) {
    point.x += finite(offset[0], 0);
    point.y += finite(offset[1], 0);
    point.z += finite(offset[2], 0);
  }
  return point;
}

/**
 * Deterministic handheld motion. A sum of incommensurate sines at two rates
 * reads as breathing rather than a loop, and — unlike noise or a random walk —
 * it depends only on `time`, so frame 42 is identical in preview and export.
 */
export function motionShakeOffset(
  time: number,
  amount: number,
  speed: number,
): { position: Vector3; rotation: Vector3 } {
  const strength = Math.min(1, Math.max(0, finite(amount, 0)));
  if (strength <= 0) {
    return { position: new Vector3(), rotation: new Vector3() };
  }
  // Squared so the slider's low end stays usable: 0.2 is a gentle drift, 1 is
  // a rough handheld take, not a linear blow-up.
  const eased = strength * strength;
  const t = finite(time, 0) * Math.max(0.1, finite(speed, 1));

  const position = new Vector3(
    Math.sin(t * 12.9898) * 0.6 + Math.sin(t * 4.1414) * 0.4,
    Math.cos(t * 9.2331) * 0.6 + Math.cos(t * 3.7331) * 0.4,
    Math.sin(t * 7.1234) * 0.5,
  ).multiplyScalar(0.05 * eased);

  const rotation = new Vector3(
    Math.sin(t * 5.4321) * 0.6 + Math.sin(t * 11.31) * 0.4,
    Math.cos(t * 6.1789) * 0.6 + Math.cos(t * 13.17) * 0.4,
    Math.sin(t * 8.531) * 0.5,
  ).multiplyScalar(0.009 * eased);

  return { position, rotation };
}

export type ApplyCameraPoseOptions = {
  camera: PerspectiveCamera;
  /** The camera node already resolved for this frame, if the scene has one. */
  node?: MotionNode;
  /** Product of `viewMode` and the editor zoom. */
  viewMode: MotionCameraView;
  zoom: number;
  time: number;
  /** World-space aim point, resolved by the caller from the frame's groups. */
  aimTarget?: Vector3 | null;
};

/**
 * Position and orient the camera for one frame.
 *
 * - `front` is the editor's orthographic-ish inspection view and ignores the rig.
 * - `origin` is the legacy pose: look at the world origin, then apply the keyed
 *   rotation as an offset. Documents written before the rig keep rendering
 *   exactly as they did.
 * - `target` aims at another node (plus `targetOffset`), then applies keyed
 *   rotation as a nudge — so an existing tilt animation still reads.
 * - `free` treats the keyed rotation as the absolute orientation.
 *
 * Roll and shake are applied last, around the camera's own view axis, so they
 * compose with whichever aim mode is active.
 */
export function applyCameraPose({
  camera,
  node,
  viewMode,
  zoom,
  time,
  aimTarget = null,
}: ApplyCameraPoseOptions): void {
  const safeZoom = finite(zoom, 1) || 1;

  // In editorial mode, OrbitControls owns the camera. Skip pose updates
  // so the user can freely orbit, zoom, and pan without being overridden.
  if (viewMode === 'editorial') {
    return;
  }

  if (!node) {
    camera.position.set(
      DEFAULT_CAMERA_POSITION[0] / safeZoom,
      DEFAULT_CAMERA_POSITION[1] / safeZoom,
      DEFAULT_CAMERA_POSITION[2] / safeZoom,
    );
    camera.lookAt(0, 0, 0);
    return;
  }

  const [px, py, pz] = node.transform.position;
  camera.position.set(px / safeZoom, py / safeZoom, pz / safeZoom);

  const [rx, ry, rz] = node.transform.rotation;
  const aim = cameraAimOf(node);

  if (aim === 'free') {
    camera.rotation.set(rx, ry, rz, 'XYZ');
  } else {
    if (aim === 'target' && aimTarget) camera.lookAt(aimTarget.x, aimTarget.y, aimTarget.z);
    else camera.lookAt(0, 0, 0);
    // The keyed rotation stays an offset in every mode; in `origin` this is
    // byte-for-byte the pre-rig behaviour.
    camera.rotateX(rx);
    camera.rotateY(ry);
    camera.rotateZ(rz);
  }

  const roll = finite(node.props.roll, 0);
  if (roll !== 0) camera.rotateZ(roll * DEG);

  const shake = motionShakeOffset(time, node.props.shake as number, node.props.shakeSpeed as number);
  if (shake.position.lengthSq() > 0) {
    camera.position.add(shake.position);
    camera.rotateX(shake.rotation.x);
    camera.rotateY(shake.rotation.y);
    camera.rotateZ(shake.rotation.z);
  }
}

/**
 * Focus distance for depth of field, in world units. An explicit
 * `focusDistance` wins; `0` means "focus on the aim target", and without one the
 * camera's resting distance to the origin is used so the effect degrades to a
 * simple depth curve rather than an infinitely sharp frame.
 */
export function resolveFocusDistance(
  node: MotionNode | undefined,
  aimTarget: Vector3 | null,
  camera: PerspectiveCamera,
): number {
  if (!node) return camera.position.length();
  const authored = finite(node.props.focusDistance, 0);
  if (authored > 0) return authored;
  const point = aimTarget ?? ORIGIN;
  return Math.max(0.01, camera.position.distanceTo(point));
}
