import { createEmptyMotionDocument, createStarterMotionDocument } from '@/lib/motion/defaults';
import {
  countOffFrameKeyframes,
  keyframeIsOnFrame,
  quantizeClipToFps,
  quantizeDocumentToFps,
  quantizeSeconds,
} from '@/lib/motion/quantize';
import type { MotionDocument, MotionKeyframe } from '@/lib/motion/types';

const NOW = '2026-01-01T00:00:00.000Z';

function keyframe(id: string, time: number, value: number): MotionKeyframe {
  return { id, time, value, easing: { type: 'linear' } };
}

function docWithKeys(keyframes: MotionKeyframe[], clipDuration = 2): MotionDocument {
  const doc = createEmptyMotionDocument({ now: NOW, duration: 3 });
  return {
    ...doc,
    timeline: {
      ...doc.timeline,
      clips: [
        {
          id: 'clip',
          name: 'Clip',
          duration: clipDuration,
          channels: [{ id: 'channel', targetId: 'node', property: 'opacity', keyframes }],
        },
      ],
    },
  };
}

describe('frame quantization', () => {
  it('rounds seconds onto the frame grid', () => {
    expect(quantizeSeconds(0.02, 30)).toBeCloseTo(1 / 30, 9);
    expect(quantizeSeconds(1 / 3, 30)).toBeCloseTo(10 / 30, 9);
  });

  it('detects off-frame keys without float false positives', () => {
    expect(keyframeIsOnFrame(keyframe('a', 1.4, 0), 30)).toBe(true);
    expect(keyframeIsOnFrame(keyframe('b', 0.02, 0), 30)).toBe(false);
  });

  it('reports nothing off-frame for the starter document at its own fps', () => {
    const doc = createStarterMotionDocument(NOW);
    expect(countOffFrameKeyframes(doc)).toBe(0);
    expect(quantizeDocumentToFps(doc)).toBe(doc);
  });

  it('merges keys that collapse onto the same frame, later value wins', () => {
    const doc = docWithKeys([keyframe('early', 0.02, 0), keyframe('late', 0.031, 1)]);
    const quantized = quantizeDocumentToFps(doc);
    const keyframes = quantized.timeline.clips[0].channels[0].keyframes;

    expect(keyframes).toHaveLength(1);
    expect(keyframes[0].id).toBe('late');
    expect(keyframes[0].value).toBe(1);
    expect(keyframes[0].time).toBeCloseTo(1 / 30, 9);
    expect(countOffFrameKeyframes(quantized)).toBe(0);
  });

  it('clamps keys that sit past the clip end', () => {
    const doc = docWithKeys([keyframe('past', 5, 1)], 2);
    const clip = quantizeDocumentToFps(doc).timeline.clips[0];
    expect(clip.channels[0].keyframes[0].time).toBe(2);
  });

  it('keeps keys ordered and leaves already-aligned clips alone', () => {
    const aligned = enqueueClip();
    expect(quantizeClipToFps(aligned, 30)).toBe(aligned);

    const doc = docWithKeys([keyframe('b', 0.6, 1), keyframe('a', 0.02, 0)]);
    const times = quantizeDocumentToFps(doc).timeline.clips[0].channels[0].keyframes.map(
      (keyframe) => keyframe.time,
    );
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(times).toHaveLength(2);
  });
});

function enqueueClip() {
  return {
    id: 'aligned',
    name: 'Aligned',
    duration: 2,
    channels: [
      { id: 'c', targetId: 'node', property: 'opacity', keyframes: [keyframe('a', 0, 0), keyframe('b', 1, 1)] },
    ],
  };
}
