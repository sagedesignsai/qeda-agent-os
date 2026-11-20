/**
 * __tests__/studio-waveform.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Tests for audio waveform peak computation used in timeline visualization.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { computeWaveformPeaks } from '@/lib/studio/audio/mixer';

describe('computeWaveformPeaks', () => {
  function createMockAudioBuffer(
    durationSec: number,
    sampleRate: number,
    amplitude: number,
  ) {
    const length = Math.floor(durationSec * sampleRate);
    const channelData = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      // Simple sine wave
      channelData[i] = amplitude * Math.sin((2 * Math.PI * i) / sampleRate);
    }
    return {
      duration: durationSec,
      sampleRate,
      length,
      numberOfChannels: 1,
      getChannelData: () => channelData,
    } as unknown as AudioBuffer;
  }

  it('returns empty array for zero duration buffer', () => {
    const buffer = createMockAudioBuffer(0, 48000, 0.5);
    const peaks = computeWaveformPeaks(buffer);
    expect(peaks.length).toBe(0);
  });

  it('computes peaks proportional to buffer duration', () => {
    const buffer = createMockAudioBuffer(5, 48000, 0.5);
    const peaks = computeWaveformPeaks(buffer, 80);
    // 5 seconds * 80 peaks/sec = 400 peaks
    expect(peaks.length).toBe(400);
  });

  it('caps peak count at maxPeaks', () => {
    const buffer = createMockAudioBuffer(100, 48000, 0.5);
    const peaks = computeWaveformPeaks(buffer, 80, 500);
    // 100 * 80 = 8000, but capped at 500
    expect(peaks.length).toBe(500);
  });

  it('returns peaks between 0 and 1', () => {
    const buffer = createMockAudioBuffer(2, 48000, 0.8);
    const peaks = computeWaveformPeaks(buffer);
    for (let i = 0; i < peaks.length; i++) {
      expect(peaks[i]).toBeGreaterThanOrEqual(0);
      expect(peaks[i]).toBeLessThanOrEqual(1);
    }
  });

  it('higher amplitude produces higher peaks', () => {
    const quiet = createMockAudioBuffer(2, 48000, 0.1);
    const loud = createMockAudioBuffer(2, 48000, 0.9);

    const quietPeaks = computeWaveformPeaks(quiet);
    const loudPeaks = computeWaveformPeaks(loud);

    // Average peak of loud should be higher than quiet
    const avgQuiet = quietPeaks.reduce((a, b) => a + b, 0) / quietPeaks.length;
    const avgLoud = loudPeaks.reduce((a, b) => a + b, 0) / loudPeaks.length;
    expect(avgLoud).toBeGreaterThan(avgQuiet);
  });

  it('silence produces near-zero peaks', () => {
    const buffer = createMockAudioBuffer(2, 48000, 0);
    const peaks = computeWaveformPeaks(buffer);
    for (let i = 0; i < peaks.length; i++) {
      expect(peaks[i]).toBeCloseTo(0, 4);
    }
  });

  it('returns at least 1 peak for very short buffers', () => {
    const buffer = createMockAudioBuffer(0.01, 48000, 0.5);
    const peaks = computeWaveformPeaks(buffer);
    expect(peaks.length).toBeGreaterThanOrEqual(1);
  });
});
