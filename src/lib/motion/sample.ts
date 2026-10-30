/**
 * lib/motion/sample.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Keyframe and timeline evaluation — the "what are the values at time t" layer.
 *
 * Contract: a channel's `keyframes` array is **sorted ascending by time**. The
 * ops maintain that invariant on write. Sampling therefore does a binary search
 * and never sorts, because this function is called once per animated channel per
 * rendered frame and a sort there would dominate the render budget.
 *
 * Sampling is a pure function of `(document, time)`. No clock is read here; the
 * caller supplies `time`. That is what makes the offline renderer deterministic:
 * it steps time itself rather than sampling the wall clock.
 */

import { applyEasing } from './easing';
import {
  channelKey,
  type MotionChannel,
  type MotionClip,
  type MotionClipPlacement,
  type MotionDocument,
  type MotionKeyframe,
  type MotionScene,
  type MotionTrack,
} from './types';

/** Insert a keyframe keeping the channel sorted. Returns a new array. */
export function insertKeyframeSorted(
  keyframes: readonly MotionKeyframe[],
  keyframe: MotionKeyframe,
): MotionKeyframe[] {
  const next = keyframes.filter((existing) => existing.id !== keyframe.id);
  let index = next.length;
  for (let i = 0; i < next.length; i += 1) {
    if (next[i].time > keyframe.time) {
      index = i;
      break;
    }
  }
  next.splice(index, 0, keyframe);
  return next;
}

export function isKeyframesSorted(keyframes: readonly MotionKeyframe[]): boolean {
  for (let i = 1; i < keyframes.length; i += 1) {
    if (keyframes[i].time < keyframes[i - 1].time) return false;
  }
  return true;
}

/**
 * Value of a keyframed property at `time`.
 *
 * Outside the keyframe range the value is held flat (no extrapolation), which
 * is the behaviour every motion tool converged on and the only one that cannot
 * produce a surprise at the boundary of a clip.
 */
export function sampleKeyframes(
  keyframes: readonly MotionKeyframe[],
  time: number,
): number | undefined {
  const count = keyframes.length;
  if (count === 0) return undefined;
  if (count === 1) return keyframes[0].value;

  const first = keyframes[0];
  if (time <= first.time) return first.value;

  const last = keyframes[count - 1];
  if (time >= last.time) return last.value;

  // Binary search for the last keyframe at or before `time`.
  let lo = 0;
  let hi = count - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (keyframes[mid].time <= time) lo = mid;
    else hi = mid - 1;
  }

  const from = keyframes[lo];
  const to = keyframes[lo + 1];
  const span = to.time - from.time;
  if (span <= 0) return to.value;

  const progress = (time - from.time) / span;
  const eased = applyEasing(from.easing, progress);
  return from.value + (to.value - from.value) * eased;
}

export function sampleChannel(channel: MotionChannel, localTime: number): number | undefined {
  return sampleKeyframes(channel.keyframes, localTime);
}

/** All channel values of one clip at a local time, keyed by `channelKey`. */
export function sampleClip(clip: MotionClip, localTime: number): Map<string, number> {
  const values = new Map<string, number>();
  for (const channel of clip.channels) {
    const value = sampleChannel(channel, localTime);
    if (value !== undefined) values.set(channelKey(channel.targetId, channel.property), value);
  }
  return values;
}

export type ActivePlacement = {
  placement: MotionClipPlacement;
  clip: MotionClip;
  /** Time inside the clip, in seconds. */
  localTime: number;
};

/**
 * The placement driving a track at `time`, if any.
 *
 * When placements overlap, the later one on the track wins — stated here because
 * it is observable behaviour, not an implementation detail. Overlaps are allowed
 * on purpose (a transition can be authored by stacking two clips); the resolver
 * is the single place that decides who wins.
 */
export function activePlacement(
  track: MotionTrack,
  clipsById: ReadonlyMap<string, MotionClip>,
  time: number,
): ActivePlacement | undefined {
  for (let i = track.placements.length - 1; i >= 0; i -= 1) {
    const placement = track.placements[i];
    const clip = clipsById.get(placement.clipId);
    if (!clip) continue;
    const localTime = time - placement.start;
    if (localTime >= 0 && localTime < clip.duration) {
      return { placement, clip, localTime };
    }
  }
  return undefined;
}

export function clipsByIdOf(doc: MotionDocument): Map<string, MotionClip> {
  return new Map(doc.timeline.clips.map((clip) => [clip.id, clip]));
}

/**
 * Full timeline evaluation at `time`: one map of `channelKey → value`.
 *
 * Tracks are resolved in document order and written in order, so a later track
 * (or a later placement within a track) overrides an earlier one for the same
 * channel key. Muted tracks contribute nothing.
 */
export function sampleTimeline(doc: MotionDocument, time: number): Map<string, number> {
  const clipsById = clipsByIdOf(doc);
  const values = new Map<string, number>();
  for (const track of doc.timeline.tracks) {
    if (track.muted) continue;
    const active = activePlacement(track, clipsById, time);
    if (!active) continue;
    for (const channel of active.clip.channels) {
      const value = sampleChannel(channel, active.localTime);
      if (value !== undefined) values.set(channelKey(channel.targetId, channel.property), value);
    }
  }
  return values;
}

/** Scene-scoped entry point used by the v4 evaluator; no project-level lookup. */
export function sampleSceneTimeline(scene: MotionScene, time: number): Map<string, number> {
  const clipsById = new Map(scene.timeline.clips.map((clip) => [clip.id, clip]));
  const values = new Map<string, number>();
  for (const track of scene.timeline.tracks) {
    if (track.muted) continue;
    const active = activePlacement(track, clipsById, time);
    if (!active) continue;
    for (const channel of active.clip.channels) {
      const value = sampleChannel(channel, active.localTime);
      if (value !== undefined) values.set(channelKey(channel.targetId, channel.property), value);
    }
  }
  return values;
}

/** Every node/property pair the document animates — used to seed the evaluator. */
export function animatedChannels(doc: MotionDocument): Map<string, { targetId: string; property: string }> {
  const channels = new Map<string, { targetId: string; property: string }>();
  for (const clip of doc.timeline.clips) {
    for (const channel of clip.channels) {
      channels.set(channelKey(channel.targetId, channel.property), {
        targetId: channel.targetId,
        property: channel.property,
      });
    }
  }
  return channels;
}
