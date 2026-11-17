/**
 * lib/motion/moves.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Camera moves as op batches.
 *
 * A move is not a new animation primitive: it compiles to a track, a clip, a
 * placement and position keyframes — exactly what the timeline already edits. So
 * a move can be scrubbed, retimed, eased, muted or hand-authored afterwards.
 *
 * Moves start from the camera's *evaluated* pose at the playhead and pivot on
 * the camera's aim target, which is what makes them feel like camera operation
 * instead of presets: applying "orbit" to a hero shot and to a wide shot yields
 * two different moves, and both arc around the subject rather than the origin.
 */

import { EASING_PRESETS } from './easing';
import type { MotionEntityKind } from './ids';
import type { MotionOpRequest } from './ops';
import type { MotionVector3 } from './types';

export type MotionCameraMoveId =
  | 'push-in'
  | 'pull-out'
  | 'orbit-left'
  | 'orbit-right'
  | 'crane-up'
  | 'handheld';

export type MotionCameraMoveOptions = {
  cameraId: string;
  /** The camera's evaluated pose at the playhead; the move is relative to it. */
  from: { position: MotionVector3; rotation: MotionVector3 };
  /** When set, the move also locks the camera's aim onto this node. */
  targetId?: string | null;
  /**
   * World-space point the move is planned around — normally the aim target
   * resolved at the playhead. Without one the move pivots on the world origin,
   * which is the legacy framing.
   */
  pivot?: MotionVector3 | null;
  /** Clip length in seconds. */
  duration?: number;
  /** Timeline start in seconds. */
  start?: number;
  /** Travel multiplier, 0.25–2. */
  intensity?: number;
};

const DELTA_EPSILON = 1e-4;

export function listCameraMoves(): Array<{
  id: MotionCameraMoveId;
  label: string;
  description: string;
}> {
  return [
    { id: 'push-in', label: 'Push in', description: 'Dolly toward the subject — the classic emphasis move.' },
    { id: 'pull-out', label: 'Pull out', description: 'Reveal the wider scene by backing away.' },
    { id: 'orbit-left', label: 'Orbit left', description: 'Arc around the subject counter-clockwise.' },
    { id: 'orbit-right', label: 'Orbit right', description: 'Arc around the subject clockwise.' },
    { id: 'crane-up', label: 'Crane up', description: 'Rise while keeping the subject framed.' },
    { id: 'handheld', label: 'Handheld', description: 'Adds a deterministic hand-held drift, no keyframes.' },
  ];
}

function clampIntensity(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 1;
  return Math.min(2, Math.max(0.25, value));
}

function isPoint(value: MotionVector3 | null | undefined): value is MotionVector3 {
  return Array.isArray(value) && value.length === 3 && value.every((axis) => Number.isFinite(axis));
}

/** Moves without a pivot keep the pre-aim framing: they work around the origin. */
function pivotOf(pivot: MotionVector3 | null | undefined): MotionVector3 {
  return isPoint(pivot) ? pivot : [0, 0, 0];
}

function endPosition(
  id: MotionCameraMoveId,
  from: MotionVector3,
  pivot: MotionVector3,
  intensity: number,
): MotionVector3 {
  const [x, y, z] = from;
  const [px, py, pz] = pivot;
  const dx = x - px;
  const dy = y - py;
  const dz = z - pz;
  switch (id) {
    case 'push-in': {
      // Travel along the pivot ray, so an off-centre subject is approached from
      // the side the camera is actually on instead of drifting toward [0,0,0].
      const factor = Math.max(0.25, 1 - 0.3 * intensity);
      return [px + dx * factor, py + dy * factor, pz + dz * factor];
    }
    case 'pull-out': {
      const factor = 1 + 0.4 * intensity;
      return [px + dx * factor, py + dy * factor, pz + dz * factor];
    }
    case 'orbit-left':
    case 'orbit-right': {
      // Orbit on the XZ plane around the pivot, keeping height and radius.
      const radius = Math.hypot(dx, dz);
      if (radius < 1e-3) return [x, y, z];
      const base = Math.atan2(dx, dz);
      const direction = id === 'orbit-left' ? -1 : 1;
      const angle = base + direction * (Math.PI / 6) * intensity;
      return [px + Math.sin(angle) * radius, y, pz + Math.cos(angle) * radius];
    }
    case 'crane-up':
      return [x, y + 0.9 * intensity, z + dz * 0.15 * intensity];
    case 'handheld':
      return [x, y, z];
  }
}

export function expandCameraMove(
  moveId: MotionCameraMoveId | string,
  options: MotionCameraMoveOptions,
  idFactory: (kind: MotionEntityKind) => string,
): MotionOpRequest[] {
  const move = listCameraMoves().find((candidate) => candidate.id === moveId);
  if (!move) throw new Error(`Unknown camera move: "${moveId}"`);
  const intensity = clampIntensity(options.intensity);
  const duration = Math.max(0.1, options.duration ?? 2.5);
  const start = Math.max(0, options.start ?? 0);
  const ops: MotionOpRequest[] = [];

  // Aim first: a push-in that arrives before the camera knows what it is
  // looking at would frame the origin for the first rendered frame. A move
  // without a target leaves the existing aim mode (including `free`) alone.
  const aimProps: Record<string, unknown> = {};
  if (typeof options.targetId === 'string' && options.targetId.length > 0) {
    aimProps.aim = 'target';
    aimProps.targetId = options.targetId;
  }

  if (move.id === 'handheld') {
    ops.push({
      op: 'scene.node.update',
      nodeId: options.cameraId,
      props: {
        ...aimProps,
        shake: 0.4 * intensity,
        shakeSpeed: 1.1,
      },
    });
    return ops;
  }

  if (Object.keys(aimProps).length > 0) {
    ops.push({ op: 'scene.node.update', nodeId: options.cameraId, props: aimProps });
  }

  const end = endPosition(move.id, options.from.position, pivotOf(options.pivot), intensity);
  const trackId = idFactory('track');
  const clipId = idFactory('clip');
  const placementId = idFactory('placement');

  ops.push(
    { op: 'track.add', trackId, name: move.label, targetId: options.cameraId },
    { op: 'clip.create', clipId, name: move.label, duration },
    { op: 'placement.add', trackId, placementId, clipId, start },
  );

  const easing = EASING_PRESETS.easeOut.value;
  const axes = ['x', 'y', 'z'] as const;
  axes.forEach((axis, index) => {
    const from = options.from.position[index];
    const to = end[index];
    if (Math.abs(to - from) < DELTA_EPSILON) return;
    const channelId = idFactory('channel');
    ops.push(
      { op: 'channel.add', clipId, channelId, targetId: options.cameraId, property: `position.${axis}` },
      {
        op: 'keyframe.add',
        clipId,
        channelId,
        keyframeId: idFactory('keyframe'),
        time: 0,
        value: from,
        easing,
      },
      {
        op: 'keyframe.add',
        clipId,
        channelId,
        keyframeId: idFactory('keyframe'),
        time: duration,
        value: to,
        easing: EASING_PRESETS.linear.value,
      },
    );
  });

  return ops;
}
