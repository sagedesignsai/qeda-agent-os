/**
 * lib/motion/motion-track.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Bakes sampled camera/object motion into ordinary Motion keyframes.
 *
 * A Blender rig exports absolute-time samples (HyperFrames' catalog uses the
 * same contract). Motion does not need a second animation system: importing the
 * samples as track → clip → channel → keyframe ops means the result is editable,
 * retimeable, undoable and renderable by the existing sampler.
 */

import { EASING_PRESETS } from './easing';
import { createMotionId, type MotionEntityKind } from './ids';
import { hasAnimatableProperty } from './node-registry';
import type { MotionOpRequest } from './ops';
import type { MotionDocument, MotionVector3 } from './types';

export const MOTION_TRACK_CHANNELS = [
  'position',
  'rotation',
  'scale',
  'fov',
  'roll',
  'opacity',
] as const;

export type MotionTrackChannel = (typeof MOTION_TRACK_CHANNELS)[number];

export type MotionTrackKey = {
  time: number;
  value: number | MotionVector3;
};

export type MotionTrackTarget = {
  targetId: string;
  channels: Partial<Record<MotionTrackChannel, MotionTrackKey[]>>;
};

export type MotionTrackExport = {
  fps: number;
  duration?: number;
  /** Blender is Z-up; positions are converted by swapping Y/Z. */
  coordinateSystem?: 'three' | 'blender';
  /** Rotation keys default to degrees because Blender exports degrees. */
  rotationUnit?: 'degrees' | 'radians';
  tracks: MotionTrackTarget[];
};

export class MotionTrackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MotionTrackError';
  }
}

type IdFactory = (kind: MotionEntityKind) => string;

const MAX_KEYS = 20_000;
const LINEAR = EASING_PRESETS.linear.value;

function finite(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new MotionTrackError(`${label} must be a finite number.`);
  }
  return value;
}

function vector(value: unknown, label: string): MotionVector3 {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new MotionTrackError(`${label} must be a three-number array.`);
  }
  return [
    finite(value[0], `${label}[0]`),
    finite(value[1], `${label}[1]`),
    finite(value[2], `${label}[2]`),
  ];
}

function normalizeKey(raw: unknown, label: string): MotionTrackKey {
  if (Array.isArray(raw)) {
    if (raw.length !== 2) throw new MotionTrackError(`${label} must be [time, value].`);
    return {
      time: finite(raw[0], `${label}[0]`),
      value: Array.isArray(raw[1])
        ? vector(raw[1], `${label}[1]`)
        : finite(raw[1], `${label}[1]`),
    };
  }
  if (raw && typeof raw === 'object') {
    const record = raw as Record<string, unknown>;
    return {
      time: finite(record.time, `${label}.time`),
      value: Array.isArray(record.value)
        ? vector(record.value, `${label}.value`)
        : finite(record.value, `${label}.value`),
    };
  }
  throw new MotionTrackError(`${label} must be a key object or [time, value].`);
}

export function parseMotionTrackExport(input: unknown): MotionTrackExport {
  if (!input || typeof input !== 'object') {
    throw new MotionTrackError('Motion data must be an object.');
  }
  const record = input as Record<string, unknown>;
  const fps = finite(record.fps, 'fps');
  if (fps <= 0 || fps > 240) throw new MotionTrackError('fps must be between 0 and 240.');
  const duration =
    record.duration === undefined ? undefined : Math.max(0, finite(record.duration, 'duration'));
  const coordinateSystem =
    record.coordinateSystem === 'blender'
      ? 'blender'
      : record.coordinateSystem === 'three' || record.coordinateSystem === undefined
        ? 'three'
        : (() => {
            throw new MotionTrackError('coordinateSystem must be "three" or "blender".');
          })();
  const rotationUnit =
    record.rotationUnit === 'radians'
      ? 'radians'
      : record.rotationUnit === 'degrees' || record.rotationUnit === undefined
        ? 'degrees'
        : (() => {
            throw new MotionTrackError('rotationUnit must be "degrees" or "radians".');
          })();
  if (!Array.isArray(record.tracks) || record.tracks.length === 0) {
    throw new MotionTrackError('Motion data needs at least one track.');
  }
  const targets: MotionTrackTarget[] = [];
  let totalKeys = 0;
  for (let index = 0; index < record.tracks.length; index += 1) {
    const rawTrack = record.tracks[index];
    if (!rawTrack || typeof rawTrack !== 'object') {
      throw new MotionTrackError(`tracks[${index}] must be an object.`);
    }
    const target = rawTrack as Record<string, unknown>;
    if (typeof target.targetId !== 'string' || target.targetId.length === 0) {
      throw new MotionTrackError(`tracks[${index}].targetId must be a non-empty string.`);
    }
    const rawChannels = target.channels;
    if (!rawChannels || typeof rawChannels !== 'object') {
      throw new MotionTrackError(`tracks[${index}].channels must be an object.`);
    }
    const channels: Partial<Record<MotionTrackChannel, MotionTrackKey[]>> = {};
    for (const [name, rawKeys] of Object.entries(rawChannels as Record<string, unknown>)) {
      if (!(MOTION_TRACK_CHANNELS as readonly string[]).includes(name)) {
        throw new MotionTrackError(`Unknown motion channel "${name}".`);
      }
      if (!Array.isArray(rawKeys) || rawKeys.length === 0) {
        throw new MotionTrackError(`Channel "${name}" needs at least one key.`);
      }
      totalKeys += rawKeys.length;
      if (totalKeys > MAX_KEYS) {
        throw new MotionTrackError(`Motion data exceeds ${MAX_KEYS} keys.`);
      }
      channels[name as MotionTrackChannel] = rawKeys.map((rawKey, keyIndex) =>
        normalizeKey(rawKey, `tracks[${index}].${name}[${keyIndex}]`),
      );
    }
    targets.push({ targetId: target.targetId, channels });
  }
  return {
    fps,
    ...(duration === undefined ? {} : { duration }),
    coordinateSystem,
    rotationUnit,
    tracks: targets,
  };
}

function positionToThree(value: MotionVector3, source: 'three' | 'blender'): MotionVector3 {
  if (source === 'three') return value;
  // Blender is Z-up and right-handed; Three is Y-up. Preserve handedness by
  // sending Blender +Y to Three -Z.
  return [value[0], value[2], value[1] === 0 ? 0 : -value[1]];
}

function propertyFor(channel: MotionTrackChannel, axis: number): string | null {
  if (channel === 'position' || channel === 'rotation') {
    return `${channel}.${['x', 'y', 'z'][axis]}`;
  }
  if (channel === 'scale') return `scale.${['x', 'y', 'z'][axis]}`;
  return channel;
}

function valuesFor(
  channel: MotionTrackChannel,
  key: MotionTrackKey,
  options: { source: 'three' | 'blender'; rotationUnit: 'degrees' | 'radians' },
): MotionVector3 {
  const value = key.value;
  if (channel === 'position') {
    return positionToThree(vector(value, 'position key'), options.source);
  }
  if (channel === 'rotation') {
    const angles = vector(value, 'rotation key');
    const factor = options.rotationUnit === 'degrees' ? Math.PI / 180 : 1;
    return [angles[0] * factor, angles[1] * factor, angles[2] * factor];
  }
  if (channel === 'scale') {
    if (Array.isArray(value)) return vector(value, 'scale key');
    const scalar = finite(value, 'scale key');
    return [scalar, scalar, scalar];
  }
  throw new MotionTrackError(`Channel "${channel}" expects a scalar key.`);
}

/**
 * Plan the op batch. The caller applies it through the normal op registry; this
 * keeps the import deterministic and testable without a live store.
 */
export function planMotionTrackImport(
  document: MotionDocument,
  raw: unknown,
  idFactory: IdFactory = createMotionId,
): MotionOpRequest[] {
  const motion = parseMotionTrackExport(raw);
  const scene = document.scenes.find((candidate) => candidate.id === document.activeSceneId);
  if (!scene) throw new MotionTrackError('There is no active scene to receive the motion.');
  const nodes = new Map(scene.nodes.map((node) => [node.id, node]));
  const ops: MotionOpRequest[] = [];
  const maxKeyTime = motion.tracks.reduce(
    (latest, target) =>
      Object.values(target.channels).reduce(
        (channelLatest, keys) =>
          keys?.reduce((keyLatest, key) => Math.max(keyLatest, key.time), channelLatest) ??
          channelLatest,
        latest,
      ),
    0,
  );
  const requiredDuration = Math.max(scene.timeline.duration, motion.duration ?? 0, maxKeyTime);
  if (requiredDuration > scene.timeline.duration + 1e-9) {
    // Sampled motion is absolute time; truncating it at the old scene end would
    // silently lose the second half of a Blender shot.
    ops.push({ op: 'timeline.setDuration', duration: requiredDuration });
  }

  for (const target of motion.tracks) {
    const node = nodes.get(target.targetId);
    if (!node) {
      throw new MotionTrackError(`Motion target "${target.targetId}" is not in the active scene.`);
    }
    if (node.locked) {
      throw new MotionTrackError(`Motion target "${node.name}" is locked.`);
    }

    const channelSpecs: Array<{
      property: string;
      keys: MotionTrackKey[];
      scalar: boolean;
    }> = [];
    for (const [channel, keys] of Object.entries(target.channels) as Array<
      [MotionTrackChannel, MotionTrackKey[]]
    >) {
      if (!keys?.length) continue;
      const axes =
        channel === 'position' || channel === 'rotation' || channel === 'scale'
          ? [0, 1, 2]
          : [0];
      for (const axis of axes) {
        const property = propertyFor(channel, axis);
        if (!property) continue;
        const scalar = channel === 'fov' || channel === 'roll' || channel === 'opacity';
        if (!hasAnimatableProperty(node.type, property)) {
          throw new MotionTrackError(
            `Node "${node.name}" cannot animate "${property}" with its current type.`,
          );
        }
        channelSpecs.push({ property, keys, scalar });
      }
    }
    if (channelSpecs.length === 0) continue;

    const maxTime = Math.max(
      0,
      ...channelSpecs.flatMap((spec) => spec.keys.map((key) => key.time)),
    );
    const clipDuration = Math.max(requiredDuration, maxTime);

    // A fresh, placement-free track is the only safe target: appending another
    // placement at 0 to an existing track would make the sampler pick between
    // two overlapping clips. An existing empty track is reused.
    const reusable = scene.timeline.tracks.find(
      (track) => track.targetId === node.id && track.placements.length === 0 && !track.locked,
    );
    const trackId = reusable?.id ?? idFactory('track');
    if (!reusable) {
      ops.push({ op: 'track.add', trackId, name: `${node.name} · baked motion`, targetId: node.id });
    }
    const clipId = idFactory('clip');
    const placementId = idFactory('placement');
    ops.push(
      { op: 'clip.create', clipId, name: `${node.name} · baked motion`, duration: clipDuration },
      { op: 'placement.add', trackId, placementId, clipId, start: 0 },
    );

    for (const spec of channelSpecs) {
      const channelId = idFactory('channel');
      ops.push({
        op: 'channel.add',
        clipId,
        channelId,
        targetId: node.id,
        property: spec.property,
      });
      const axis = spec.property.endsWith('.x')
        ? 0
        : spec.property.endsWith('.y')
          ? 1
          : spec.property.endsWith('.z')
            ? 2
            : 0;
      const keysByTime = new Map<number, number>();
      for (const key of spec.keys) {
        const time = Math.min(clipDuration, Math.max(0, key.time));
        const values = spec.scalar
          ? [finite(key.value, spec.property)]
          : valuesFor(
              spec.property.split('.')[0] as MotionTrackChannel,
              key,
              {
                source: motion.coordinateSystem ?? 'three',
                rotationUnit: motion.rotationUnit ?? 'degrees',
              },
            );
        keysByTime.set(time, values[axis] ?? 0);
      }
      const sorted = [...keysByTime.entries()].sort((a, b) => a[0] - b[0]);
      for (const [time, value] of sorted) {
        ops.push({
          op: 'keyframe.add',
          clipId,
          channelId,
          keyframeId: idFactory('keyframe'),
          time,
          value,
          easing: LINEAR,
        });
      }
    }
  }

  return ops;
}