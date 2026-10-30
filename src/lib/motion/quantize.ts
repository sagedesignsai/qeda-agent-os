/**
 * lib/motion/quantize.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Frame quantization for a whole document.
 *
 * Decision: **seconds stay authoritative** in the document; frames are a
 * constraint applied at the edges. That is why this is an explicit, one-shot
 * operation (`timeline.quantizeToFps`) rather than an invariant enforced on
 * every write, and never a side effect of choosing a different output preset.
 * Changing 30fps to 24fps must not silently rewrite someone's authored timing.
 *
 * Two keys that collapse onto the same frame are merged, keeping the later one:
 * two keys at one instant have no interpolated meaning, and the later value is
 * what the timeline was already showing at that point.
 */

import type { MotionClip, MotionDocument, MotionKeyframe } from './types';

const EPSILON = 1e-9;

export function quantizeSeconds(seconds: number, fps: number): number {
  const safeFps = fps > 0 ? fps : 30;
  return Math.round(seconds * safeFps) / safeFps;
}

export function keyframeIsOnFrame(keyframe: MotionKeyframe, fps: number): boolean {
  const safeFps = fps > 0 ? fps : 30;
  const frames = keyframe.time * safeFps;
  return Math.abs(frames - Math.round(frames)) < 1e-6;
}

export function countOffFrameKeyframes(
  doc: MotionDocument,
  fps: number = doc.meta.output.fps,
): number {
  let offFrame = 0;
  for (const clip of doc.timeline.clips) {
    for (const channel of clip.channels) {
      for (const keyframe of channel.keyframes) {
        if (!keyframeIsOnFrame(keyframe, fps)) offFrame += 1;
      }
    }
  }
  return offFrame;
}

export function quantizeClipToFps(clip: MotionClip, fps: number): MotionClip {
  const safeFps = fps > 0 ? fps : 30;
  let changed = false;

  const channels = clip.channels.map((channel) => {
    // Keyed by integer frame, so float drift cannot produce two entries for the
    // same frame.
    const byFrame = new Map<number, MotionKeyframe>();
    for (const keyframe of channel.keyframes) {
      const clamped = Math.min(Math.max(0, keyframe.time), clip.duration);
      const frame = Math.round(clamped * safeFps);
      byFrame.set(frame, keyframe);
    }

    const frames = [...byFrame.keys()].sort((a, b) => a - b);
    const keyframes: MotionKeyframe[] = frames.map((frame) => {
      const original = byFrame.get(frame) as MotionKeyframe;
      const time = frame / safeFps;
      if (Math.abs(time - original.time) < EPSILON) return original;
      changed = true;
      return { ...original, time };
    });

    if (keyframes.length !== channel.keyframes.length) changed = true;
    if (keyframes.some((keyframe, index) => keyframe.id !== channel.keyframes[index]?.id)) {
      changed = true;
    }

    return { ...channel, keyframes };
  });

  return changed ? { ...clip, channels } : clip;
}

/** Snap every key in the document to the frame grid. Returns the same ref when already aligned. */
export function quantizeDocumentToFps(
  doc: MotionDocument,
  fps: number = doc.meta.output.fps,
): MotionDocument {
  const clips = doc.timeline.clips.map((clip) => quantizeClipToFps(clip, fps));
  const changed = clips.some((clip, index) => clip !== doc.timeline.clips[index]);
  return changed ? { ...doc, timeline: { ...doc.timeline, clips } } : doc;
}
