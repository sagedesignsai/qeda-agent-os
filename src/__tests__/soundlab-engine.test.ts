/**
 * __tests__/soundlab-engine.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Unit tests for SoundLab Web Audio engine utilities and graceful fallback
 * when AudioContext is unavailable (jsdom / SSR).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  midiToHz,
  beatToSeconds,
  secondsToBeat,
  interpolateAutomation,
  SoundLabEngine,
} from '../lib/soundlab-engine';
import { buildDefaultTracks } from '../lib/soundlab-types';

describe('SoundLab audio math utilities', () => {
  describe('midiToHz', () => {
    it('calculates standard concert pitch A4 = 440 Hz', () => {
      expect(midiToHz(69)).toBeCloseTo(440, 4);
    });

    it('calculates octave intervals accurately', () => {
      expect(midiToHz(57)).toBeCloseTo(220, 4); // A3
      expect(midiToHz(81)).toBeCloseTo(880, 4); // A5
    });

    it('calculates middle C (C4 = 60) accurately', () => {
      // 440 * 2^((60 - 69)/12) ≈ 261.625565
      expect(midiToHz(60)).toBeCloseTo(261.6256, 3);
    });
  });

  describe('beat and time conversions', () => {
    it('converts beats to seconds at 120 BPM', () => {
      expect(beatToSeconds(1, 120)).toBe(0.5);
      expect(beatToSeconds(4, 120)).toBe(2.0);
      expect(beatToSeconds(0, 120)).toBe(0);
    });

    it('converts seconds to beats at 120 BPM', () => {
      expect(secondsToBeat(0.5, 120)).toBe(1);
      expect(secondsToBeat(2.0, 120)).toBe(4);
    });

    it('round-trips beat <-> seconds accurately across different BPMs', () => {
      const bpm = 136;
      const beat = 7.5;
      const sec = beatToSeconds(beat, bpm);
      expect(secondsToBeat(sec, bpm)).toBeCloseTo(beat, 6);
    });
  });

  describe('interpolateAutomation', () => {
    it('returns null for empty automation points', () => {
      expect(interpolateAutomation([], 2.5)).toBeNull();
    });

    it('clamps to first value when beat is at or before first point', () => {
      const points = [
        { id: '1', beat: 2, value: 0.3 },
        { id: '2', beat: 6, value: 0.9 },
      ];
      expect(interpolateAutomation(points, 1)).toBe(0.3);
      expect(interpolateAutomation(points, 2)).toBe(0.3);
    });

    it('clamps to last value when beat is at or after last point', () => {
      const points = [
        { id: '1', beat: 2, value: 0.3 },
        { id: '2', beat: 6, value: 0.9 },
      ];
      expect(interpolateAutomation(points, 6)).toBe(0.9);
      expect(interpolateAutomation(points, 10)).toBe(0.9);
    });

    it('linearly interpolates intermediate beats accurately', () => {
      const points = [
        { id: '1', beat: 0, value: 0.2 },
        { id: '2', beat: 4, value: 0.8 },
      ];
      expect(interpolateAutomation(points, 2)).toBeCloseTo(0.5, 4);
      expect(interpolateAutomation(points, 1)).toBeCloseTo(0.35, 4);
    });
  });
});

describe('SoundLabEngine without AudioContext', () => {
  beforeEach(() => {
    delete (window as any).AudioContext;
    delete (window as any).webkitAudioContext;
  });

  it('initializes safely with isPlaying false', () => {
    const engine = new SoundLabEngine();
    expect(engine.isPlaying).toBe(false);
  });

  it('play() and stop() are safe no-ops without throwing', async () => {
    const engine = new SoundLabEngine();
    const tracks = buildDefaultTracks('sess-1', 'alpha');
    const session = {
      id: 'sess-1',
      projectId: null,
      title: 'Test Session',
      bpm: 120,
      keySignature: 'C',
      targetBand: 'alpha' as const,
      durationBeats: 64,
      loopEnabled: false,
      loopStartBeat: 0,
      loopEndBeat: 32,
      createdAt: 1000,
      updatedAt: 1000,
      tracks,
    };

    await expect(engine.start(session)).resolves.toBeUndefined();
    expect(engine.isPlaying).toBe(false);

    engine.stop();
    await engine.dispose();
  });

  it('previews and parameter updates do not throw without AudioContext', () => {
    const engine = new SoundLabEngine();
    expect(() => engine.previewDrumHit('kick')).not.toThrow();
    expect(() => engine.updateTrackVolume('trk-1', 0.8)).not.toThrow();
    expect(() => engine.updateTrackMute('trk-1', true)).not.toThrow();
    expect(() => engine.updateBpm(130)).not.toThrow();
    expect(() =>
      engine.updateTrackEffects('trk-1', {
        eq: { lowGain: 2, midGain: 0, highGain: -2, midFreq: 1000 },
      }),
    ).not.toThrow();
  });
});
