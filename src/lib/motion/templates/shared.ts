import { EASING_PRESETS } from '../easing';
import type { MotionClip, MotionEasing, MotionTimeline } from '../types';

export const LINEAR = EASING_PRESETS.linear.value;
export const EASE_OUT = EASING_PRESETS.easeOut.value;
export const EASE_IN_OUT = EASING_PRESETS.easeInOut.value;
const SMOOTH = EASING_PRESETS.smooth.value;

export function showcaseClip(
  id: string,
  name: string,
  duration: number,
  targetId: string,
  channels: Array<{ property: string; keys: Array<{ time: number; value: number; easing?: MotionEasing }> }>,
): MotionClip {
  return {
    id,
    name,
    duration,
    channels: channels.map((channel, channelIndex) => ({
      id: `chn_${id}_${channelIndex}`,
      targetId,
      property: channel.property,
      keyframes: channel.keys.map((key, index) => ({
        id: `kf_${id}_${channelIndex}_${index}`,
        time: key.time,
        value: key.value,
        easing: key.easing ?? EASE_IN_OUT,
      })),
    })),
  };
}

export function showcaseTimeline(duration: number, clips: MotionClip[]): MotionTimeline {
  return {
    duration,
    loop: { enabled: true, start: 0, end: duration },
    workArea: { enabled: false, start: 0, end: duration },
    playMode: 'loop',
    tracks: clips.map((clip) => ({
      id: `trk_${clip.id.slice(5)}`,
      name: clip.name,
      targetId: clip.channels[0]?.targetId ?? null,
      muted: false,
      locked: false,
      placements: [{ id: `plc_${clip.id.slice(5)}`, clipId: clip.id, start: 0, trimIn: 0, duration: clip.duration }],
    })),
    clips,
    audio: [],
  };
}

/* ── Template clip builders ────────────────────────────────────────────────────
 * Every template animation is expressed with these builders so the catalog
 * shares one motion vocabulary. Two invariants keep them sample-safe:
 *
 *   1. Each clip spans the FULL scene duration. The sampler drops a clip the
 *      moment its placement window ends (nothing holds state afterwards), so a
 *      short clip would snap the node back to its static props mid-scene.
 *
 *   2. Transform channels end at the node's static value (`y`, `fov`, camera
 *      `z`), so the held final frame matches the rest pose instead of leaving
 *      the node parked somewhere its inspector does not show.
 *
 * Keyframes clamp-hold outside their range, so a channel whose first key sits
 * at `delay` reads as its first key value from clipped time 0 — hidden or
 * retracted, as designed. Times are clamped below the scene duration to keep
 * KEYFRAME_OUT_OF_BOUNDS happy and last keys strictly after the first.
 */

/** Largest keyframe time a scene-scoped clip may use. */
function clipTime(time: number, duration: number): number {
  return Math.min(time, duration - 0.01);
}

export type RiseInOptions = {
  /** Seconds before the fade starts. */
  delay?: number;
  /** Fade length in seconds. */
  fade?: number;
  /** Node's static position.y — the lift animates from `y + lift` down to `y`. */
  y?: number;
  /** Starting offset above the rest position. 0 disables the lift channel. */
  lift?: number;
  /** Target opacity (pass the node's static opacity to reveal to its rest look). */
  to?: number;
};

/** Fade in, optionally settling from a small upward offset. */
export function riseInClip(
  id: string,
  targetId: string,
  sceneDuration: number,
  opts: RiseInOptions = {},
): MotionClip {
  const delay = opts.delay ?? 0.25;
  const fade = opts.fade ?? 0.9;
  const y = opts.y ?? 0;
  const lift = opts.lift ?? 0.3;
  const settle = clipTime(delay + fade, sceneDuration);
  const channels: Array<{ property: string; keys: Array<{ time: number; value: number; easing?: MotionEasing }> }> = [
    {
      property: 'opacity',
      keys: [
        { time: delay, value: 0, easing: EASE_OUT },
        { time: settle, value: opts.to ?? 1, easing: LINEAR },
      ],
    },
  ];
  if (lift !== 0) {
    channels.push({
      property: 'position.y',
      keys: [
        { time: delay, value: y + lift, easing: EASE_OUT },
        { time: settle, value: y, easing: LINEAR },
      ],
    });
  }
  return showcaseClip(id, 'Rise in', sceneDuration, targetId, channels);
}

/** Opacity-only reveal — for copy that should not move (credits, subtitles). */
export function fadeInClip(
  id: string,
  targetId: string,
  sceneDuration: number,
  opts: { delay?: number; fade?: number; to?: number } = {},
): MotionClip {
  const delay = opts.delay ?? 0.35;
  const fade = opts.fade ?? 0.9;
  return showcaseClip(id, 'Fade in', sceneDuration, targetId, [
    {
      property: 'opacity',
      keys: [
        { time: delay, value: 0, easing: EASE_OUT },
        { time: clipTime(delay + fade, sceneDuration), value: opts.to ?? 1, easing: LINEAR },
      ],
    },
  ]);
}

/** Slow camera push along +z (or −z with `to > from` inverted) toward the subject. */
export function pushInClip(
  id: string,
  cameraId: string,
  sceneDuration: number,
  opts: { from?: number; to?: number; fovFrom?: number; fovTo?: number } = {},
): MotionClip {
  const to = opts.to ?? 7;
  const channels: Array<{ property: string; keys: Array<{ time: number; value: number; easing?: MotionEasing }> }> = [
    {
      property: 'position.z',
      keys: [
        { time: 0, value: opts.from ?? Math.max(4.4, to + 1.1), easing: EASE_IN_OUT },
        { time: sceneDuration - 0.01, value: to, easing: LINEAR },
      ],
    },
  ];
  if (opts.fovFrom !== undefined || opts.fovTo !== undefined) {
    channels.push({
      property: 'fov',
      keys: [
        { time: 0, value: opts.fovFrom ?? 32, easing: SMOOTH },
        { time: sceneDuration - 0.01, value: opts.fovTo ?? 32, easing: LINEAR },
      ],
    });
  }
  return showcaseClip(id, 'Camera push', sceneDuration, cameraId, channels);
}

/** Full-turn product/geometry spin: `turns` revolutions over the scene. */
export function spinClip(
  id: string,
  targetId: string,
  sceneDuration: number,
  opts: { turns?: number; axis?: 'x' | 'y' | 'z'; from?: number } = {},
): MotionClip {
  const axis = opts.axis ?? 'y';
  const from = opts.from ?? 0;
  const distance = (opts.turns ?? 1) * Math.PI * 2;
  return showcaseClip(id, 'Spin', sceneDuration, targetId, [
    {
      property: `rotation.${axis}`,
      keys: [
        { time: 0, value: from, easing: LINEAR },
        { time: sceneDuration - 0.01, value: from + distance, easing: LINEAR },
      ],
    },
  ]);
}

/** Linear count-up / reveal of a numeric prop (`value`, `progress`, `intensity`). */
export function countUpClip(
  id: string,
  targetId: string,
  property: string,
  sceneDuration: number,
  opts: { from?: number; to?: number; delay?: number; ramp?: number } = {},
): MotionClip {
  const delay = opts.delay ?? 0.3;
  const ramp = opts.ramp ?? Math.max(1.2, sceneDuration * 0.55);
  return showcaseClip(id, 'Count up', sceneDuration, targetId, [
    {
      property,
      keys: [
        { time: delay, value: opts.from ?? 0, easing: EASE_OUT },
        { time: clipTime(delay + ramp, sceneDuration), value: opts.to ?? 1, easing: LINEAR },
      ],
    },
  ]);
}

/** Scale pop with a quick fade — badges, chips, CTAs. */
export function popInClip(
  id: string,
  targetId: string,
  sceneDuration: number,
  opts: { delay?: number; base?: number; from?: number } = {},
): MotionClip {
  const delay = opts.delay ?? 0.3;
  const base = opts.base ?? 1;
  const from = opts.from ?? 0.72;
  return showcaseClip(
    id,
    'Pop in',
    sceneDuration,
    targetId,
    [
      {
        property: 'scale.x',
        keys: [
          { time: clipTime(delay + 0.45, sceneDuration), value: from, easing: EASE_OUT },
          { time: sceneDuration - 0.01, value: base, easing: SMOOTH },
        ],
      },
      {
        property: 'scale.y',
        keys: [
          { time: clipTime(delay + 0.45, sceneDuration), value: from, easing: EASE_OUT },
          { time: sceneDuration - 0.01, value: base, easing: SMOOTH },
        ],
      },
      {
        property: 'scale.z',
        keys: [
          { time: clipTime(delay + 0.45, sceneDuration), value: from, easing: EASE_OUT },
          { time: sceneDuration - 0.01, value: base, easing: SMOOTH },
        ],
      },
      {
        property: 'opacity',
        keys: [
          { time: delay, value: 0, easing: LINEAR },
          { time: clipTime(delay + 0.25, sceneDuration), value: 1, easing: LINEAR },
        ],
      },
    ],
  );
}

/** Gentle drift of one transform axis — camera sway, parallax, prop yaw. */
export function driftClip(
  id: string,
  targetId: string,
  sceneDuration: number,
  opts: { axis?: 'position.x' | 'position.y' | 'rotation.y' | 'rotation.z'; from?: number; to?: number } = {},
): MotionClip {
  const axis = opts.axis ?? 'position.x';
  return showcaseClip(id, 'Drift', sceneDuration, targetId, [
    {
      property: axis,
      keys: [
        { time: 0, value: opts.from ?? -0.25, easing: SMOOTH },
        { time: sceneDuration - 0.01, value: opts.to ?? 0, easing: LINEAR },
      ],
    },
  ]);
}

/** Light intensity builds to a highlight. */
export function glowClip(
  id: string,
  targetId: string,
  sceneDuration: number,
  opts: { from?: number; to?: number } = {},
): MotionClip {
  return countUpClip(id, targetId, 'intensity', sceneDuration, { from: opts.from ?? 2.6, to: opts.to ?? 5 });
}
