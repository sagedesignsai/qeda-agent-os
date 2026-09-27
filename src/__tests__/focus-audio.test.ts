/**
 * __tests__/focus-audio.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The sample generators are pure and deterministic in length, so they can be
 * tested without an AudioContext. We also assert the engine degrades to a
 * no-op when Web Audio is unavailable (as in jsdom / SSR).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  DEFAULT_SOUND_CONFIG,
  FocusAudioEngine,
  binauralFrequencies,
  generateNoise,
  type NoiseType,
} from '../lib/focus-audio';

const NOISE_TYPES: NoiseType[] = ['white', 'pink', 'brown'];

describe('focus-audio generators', () => {
  it('generates a buffer of the requested length for every noise type', () => {
    for (const type of NOISE_TYPES) {
      const data = generateNoise(type, 2048);
      expect(data).toBeInstanceOf(Float32Array);
      expect(data).toHaveLength(2048);
      // All samples must be finite and within a sane amplitude range.
      for (const sample of data) {
        expect(Number.isFinite(sample)).toBe(true);
        expect(Math.abs(sample)).toBeLessThan(4);
      }
    }
  });

  it('produces varied, non-constant noise', () => {
    const data = generateNoise('brown', 1024);
    const unique = new Set(data);
    expect(unique.size).toBeGreaterThan(100);
  });

  it('splits a binaural beat symmetrically around the carrier', () => {
    expect(binauralFrequencies(200, 10)).toEqual({ left: 195, right: 205 });
    expect(binauralFrequencies(100, 0)).toEqual({ left: 100, right: 100 });
  });
});

describe('FocusAudioEngine without Web Audio', () => {
  beforeEach(() => {
    // jsdom has no Web Audio implementation — make that explicit and safe.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).AudioContext;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).webkitAudioContext;
  });

  it('starts as a no-op and reports not playing', async () => {
    const engine = new FocusAudioEngine();
    expect(engine.isPlaying).toBe(false);

    await engine.start({ ...DEFAULT_SOUND_CONFIG, noise: 'pink' });
    expect(engine.isPlaying).toBe(false);

    // These must be safe to call regardless of playback state.
    engine.update({ ...DEFAULT_SOUND_CONFIG, noiseVolume: 0.1 });
    engine.stop();
    await engine.dispose();
  });
});
