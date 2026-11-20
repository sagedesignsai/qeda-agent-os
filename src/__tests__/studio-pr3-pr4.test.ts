/**
 * Tests for PR3 (Export audio parity) and PR4 (Camera parity).
 *
 * PR3: mixAudioSamples works without AudioContext, typed track volume,
 * speed-adjusted mixing, and silence emission.
 *
 * PR4: stepCameraWithDelta produces frame-rate-independent camera motion.
 */

import { mixAudioSamples } from '@/lib/studio/audio/mixer';
import {
  CAMERA_SMOOTHING_60FPS,
  stepCamera,
  stepCameraWithDelta,
  type StudioCameraState,
} from '@/lib/studio/render/camera';
import type { TimelineTrack } from '@/lib/studio/types';
import type { EvaluatedTimelineClip } from '@/lib/studio/timeline/evaluate';

// ─── PR3: Export Audio Parity ────────────────────────────────────────────────

/**
 * Mock AudioBuffer that works in Bun test environment where AudioContext
 * is not available. Only implements the fields read by mixAudioSamples.
 */
interface MockAudioBuffer {
  sampleRate: number;
  length: number;
  duration: number;
  numberOfChannels: number;
  getChannelData(channel: number): Float32Array;
}

function makeMockAudioBuffer(
  sampleRate: number,
  durationSec: number,
  frequency: number,
  numberOfChannels: number = 2,
): MockAudioBuffer {
  const length = Math.floor(sampleRate * durationSec);
  const channels: Float32Array[] = [];
  for (let ch = 0; ch < numberOfChannels; ch++) {
    const data = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      data[i] = Math.sin(2 * Math.PI * frequency * (i / sampleRate));
    }
    channels.push(data);
  }
  return {
    sampleRate,
    length,
    duration: durationSec,
    numberOfChannels,
    getChannelData(ch: number) {
      return channels[ch];
    },
  };
}

/** Build a minimal evaluated audio clip */
function makeEvaluatedClip(
  clipId: string,
  sourceTimeMs: number,
  durationMs: number,
  sourceDurationMs: number,
  audioBuffer: MockAudioBuffer,
  volume: number = 1.0,
): EvaluatedTimelineClip {
  return {
    itemType: 'audio' as const,
    clip: {
      id: clipId,
      trackId: 'track-audio',
      name: clipId,
      startMs: 0,
      durationMs,
      sourceStartMs: 0,
      sourceDurationMs,
      payload: {
        audioBuffer: audioBuffer as any,
        volume,
        speed: sourceDurationMs / durationMs,
      },
    },
    track: makeTrack('track-audio'),
    localTimeMs: 0,
    sourceTimeMs,
  };
}

/** Build a minimal timeline track */
function makeTrack(trackId: string, muted: boolean = false, volume: number = 1.0): TimelineTrack {
  return {
    id: trackId,
    type: 'audio' as const,
    name: 'Audio',
    clips: [],
    locked: false,
    visible: true,
    muted,
    volume,
  };
}

describe('PR3 — Export audio parity', () => {
  it('mixes samples without depending on getAudioContext()', () => {
    const sampleRate = 48000;
    const buffer = makeMockAudioBuffer(sampleRate, 1, 440);
    const clip = makeEvaluatedClip('c1', 0, 1000, 1000, buffer);
    const tracks = [makeTrack('track-audio')];
    const framesCount = 4800; // 100ms at 48kHz

    const result = mixAudioSamples([clip], tracks, sampleRate, framesCount);
    expect(result).not.toBeNull();
    expect(result!.length).toBe(framesCount * 2); // stereo
    // Samples should be non-zero (sine wave)
    let hasNonZero = false;
    for (let i = 0; i < result!.length; i++) {
      if (Math.abs(result![i]) > 0.001) {
        hasNonZero = true;
        break;
      }
    }
    expect(hasNonZero).toBe(true);
  });

  it('respects per-track volume (typed field)', () => {
    const sampleRate = 48000;
    const buffer = makeMockAudioBuffer(sampleRate, 1, 440);
    const clip = makeEvaluatedClip('c1', 0, 1000, 1000, buffer);
    const tracks = [makeTrack('track-audio', false, 0.5)];
    const framesCount = 480;

    const result = mixAudioSamples([clip], tracks, sampleRate, framesCount);
    expect(result).not.toBeNull();
    // With 0.5 track volume, samples should be halved
    for (let i = 0; i < result!.length; i++) {
      expect(Math.abs(result![i])).toBeLessThanOrEqual(0.51);
    }
  });

  it('skips muted tracks', () => {
    const sampleRate = 48000;
    const buffer = makeMockAudioBuffer(sampleRate, 1, 440);
    const clip = makeEvaluatedClip('c1', 0, 1000, 1000, buffer);
    const tracks = [makeTrack('track-audio', true)];
    const framesCount = 480;

    const result = mixAudioSamples([clip], tracks, sampleRate, framesCount);
    expect(result).not.toBeNull();
    // All samples should be zero (track is muted)
    for (let i = 0; i < result!.length; i++) {
      expect(result![i]).toBe(0);
    }
  });

  it('returns null for empty clip list', () => {
    const result = mixAudioSamples([], [], 48000, 4800);
    expect(result).toBeNull();
  });

  it('speed-adjusted clips mix at correct source offsets', () => {
    const sampleRate = 48000;
    // 2-second source, 1-second clip → plays at 2x speed
    const buffer = makeMockAudioBuffer(sampleRate, 2, 440);
    const clip = makeEvaluatedClip('c1', 0, 1000, 2000, buffer);
    const tracks = [makeTrack('track-audio')];
    const framesCount = 4800; // 100ms

    const result = mixAudioSamples([clip], tracks, sampleRate, framesCount);
    expect(result).not.toBeNull();
    // Should have non-zero samples (reading from source at 2x rate)
    let hasNonZero = false;
    for (let i = 0; i < result!.length; i++) {
      if (Math.abs(result![i]) > 0.001) {
        hasNonZero = true;
        break;
      }
    }
    expect(hasNonZero).toBe(true);
  });

  it('per-clip volume is applied correctly', () => {
    const sampleRate = 48000;
    const buffer = makeMockAudioBuffer(sampleRate, 1, 440);
    const clip = makeEvaluatedClip('c1', 0, 1000, 1000, buffer, 0.25);
    const tracks = [makeTrack('track-audio')];
    const framesCount = 480;

    const result = mixAudioSamples([clip], tracks, sampleRate, framesCount);
    expect(result).not.toBeNull();
    // With 0.25 clip volume, samples should be quartered
    for (let i = 0; i < result!.length; i++) {
      expect(Math.abs(result![i])).toBeLessThanOrEqual(0.26);
    }
  });
});

// ─── PR4: Camera Parity ─────────────────────────────────────────────────────

describe('PR4 — Camera parity', () => {
  it('CAMERA_SMOOTHING_60FPS has all easing values', () => {
    expect(CAMERA_SMOOTHING_60FPS.snappy).toBe(0.22);
    expect(CAMERA_SMOOTHING_60FPS.smooth).toBe(0.12);
    expect(CAMERA_SMOOTHING_60FPS.cinematic).toBe(0.07);
  });

  it('stepCamera delegates to stepCameraWithDelta with 16.667ms', () => {
    const current: StudioCameraState = { scale: 1, panX: 0.5, panY: 0.5 };
    const target: StudioCameraState = { scale: 1.5, panX: 0.3, panY: 0.7 };

    const result1 = stepCamera(current, target, 'smooth');
    const result2 = stepCameraWithDelta(current, target, 'smooth', 16.667);

    expect(result1.scale).toBeCloseTo(result2.scale, 6);
    expect(result1.panX).toBeCloseTo(result2.panX, 6);
    expect(result1.panY).toBeCloseTo(result2.panY, 6);
  });

  it('stepCameraWithDelta at 16.67ms matches 60fps smoothing', () => {
    const current: StudioCameraState = { scale: 1, panX: 0.5, panY: 0.5 };
    const target: StudioCameraState = { scale: 2, panX: 0, panY: 1 };

    const result = stepCameraWithDelta(current, target, 'smooth', 16.667);
    // At dtMs=16.667, alpha should equal the 60fps smoothing factor (0.12)
    const expectedScale = 1 + (2 - 1) * 0.12;
    const expectedPanX = 0.5 + (0 - 0.5) * 0.12;
    const expectedPanY = 0.5 + (1 - 0.5) * 0.12;

    expect(result.scale).toBeCloseTo(expectedScale, 4);
    expect(result.panX).toBeCloseTo(expectedPanX, 4);
    expect(result.panY).toBeCloseTo(expectedPanY, 4);
  });

  it('stepCameraWithDelta at different frame rates produce equivalent motion over equal wall time', () => {
    // Simulate 100ms of camera motion at two different frame rates
    const start: StudioCameraState = { scale: 1, panX: 0.5, panY: 0.5 };
    const target: StudioCameraState = { scale: 2, panX: 0, panY: 1 };

    // 60 Hz: 6 steps of 16.667ms
    let state60 = { ...start };
    for (let i = 0; i < 6; i++) {
      state60 = stepCameraWithDelta(state60, target, 'smooth', 16.667);
    }

    // 30 Hz: 3 steps of 33.333ms
    let state30 = { ...start };
    for (let i = 0; i < 3; i++) {
      state30 = stepCameraWithDelta(state30, target, 'smooth', 33.333);
    }

    // 120 Hz: 12 steps of 8.333ms
    let state120 = { ...start };
    for (let i = 0; i < 12; i++) {
      state120 = stepCameraWithDelta(state120, target, 'smooth', 8.333);
    }

    // All three should converge to approximately the same state after 100ms
    expect(state60.scale).toBeCloseTo(state30.scale, 2);
    expect(state60.panX).toBeCloseTo(state30.panX, 2);
    expect(state60.panY).toBeCloseTo(state30.panY, 2);

    expect(state60.scale).toBeCloseTo(state120.scale, 2);
    expect(state60.panX).toBeCloseTo(state120.panX, 2);
    expect(state60.panY).toBeCloseTo(state120.panY, 2);
  });

  it('export and preview converge from the same start state', () => {
    const start: StudioCameraState = { scale: 1, panX: 0.5, panY: 0.5 };
    const target: StudioCameraState = { scale: 1.8, panX: 0.2, panY: 0.8 };

    // Preview: 60 Hz for 1 second (60 frames)
    let preview = { ...start };
    for (let i = 0; i < 60; i++) {
      preview = stepCameraWithDelta(preview, target, 'snappy', 16.667);
    }

    // Export: 30 fps for 1 second (30 frames)
    let export_ = { ...start };
    for (let i = 0; i < 30; i++) {
      export_ = stepCameraWithDelta(export_, target, 'snappy', 33.333);
    }

    // Both should be very close to the target after 1 second of snappy easing
    expect(preview.scale).toBeCloseTo(export_.scale, 1);
    expect(preview.panX).toBeCloseTo(export_.panX, 1);
    expect(preview.panY).toBeCloseTo(export_.panY, 1);
  });

  it('no regression: stepCamera still works with easing names', () => {
    const current: StudioCameraState = { scale: 1, panX: 0.5, panY: 0.5 };
    const target: StudioCameraState = { scale: 1.5, panX: 0.3, panY: 0.7 };

    const snappy = stepCamera(current, target, 'snappy');
    const smooth = stepCamera(current, target, 'smooth');
    const cinematic = stepCamera(current, target, 'cinematic');

    // Snappy should move more than smooth, which moves more than cinematic
    expect(snappy.scale).toBeGreaterThan(smooth.scale);
    expect(smooth.scale).toBeGreaterThan(cinematic.scale);
  });
});
