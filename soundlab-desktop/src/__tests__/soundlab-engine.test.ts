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
  getAmEnvelope,
  getTrackOutputGain,
  SoundLabEngine,
} from '../lib/soundlab-engine';
import { buildDefaultTracks } from '../lib/soundlab-types';
import type {
  SoundLabSessionWithTracks,
  SoundLabTrack,
} from '../lib/soundlab-types';

describe('SoundLab audio math utilities', () => {
  it('keeps AM gain unipolar and within the configured depth', () => {
    expect(getAmEnvelope(0)).toEqual({ offset: 1, amplitude: 0 });
    expect(getAmEnvelope(1)).toEqual({ offset: 0.5, amplitude: 0.5 });
    const { offset, amplitude } = getAmEnvelope(0.8);
    expect(offset - amplitude).toBeCloseTo(0.2);
    expect(offset + amplitude).toBeCloseTo(1);
  });

  it('preserves track volume while applying mute and solo', () => {
    expect(getTrackOutputGain(0.2, false, false, false)).toBe(0.2);
    expect(getTrackOutputGain(0.2, true, true, false)).toBe(0);
    expect(getTrackOutputGain(0.2, false, false, true)).toBe(0);
    expect(getTrackOutputGain(0.2, false, true, true)).toBe(0.2);
  });

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

function makeAudioParam() {
  return {
    value: 0,
    setTargetAtTime: jest.fn(),
    setValueAtTime: jest.fn(),
    linearRampToValueAtTime: jest.fn(),
    exponentialRampToValueAtTime: jest.fn(),
    cancelScheduledValues: jest.fn(),
  };
}

function makeAudioContextMock() {
  const createNode = () => ({
    gain: makeAudioParam(),
    frequency: makeAudioParam(),
    pan: makeAudioParam(),
    threshold: makeAudioParam(),
    knee: makeAudioParam(),
    ratio: makeAudioParam(),
    attack: makeAudioParam(),
    release: makeAudioParam(),
    connect: jest.fn((destination: unknown) => destination),
    disconnect: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(),
  });
  const ctx = {
    currentTime: 2,
    sampleRate: 48_000,
    state: 'running',
    destination: {},
    createGain: jest.fn(createNode),
    createDynamicsCompressor: jest.fn(createNode),
    createStereoPanner: jest.fn(createNode),
    createOscillator: jest.fn(createNode),
    resume: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
  };
  return ctx;
}

function makeTrack(
  id: string,
  type: SoundLabTrack['type'],
  volume: number,
): SoundLabTrack {
  return {
    id,
    sessionId: 'session',
    type,
    name: id,
    sortOrder: 0,
    muted: false,
    solo: false,
    volume,
    pan: 0,
    color: '#fff',
    config:
      type === 'entrainment'
        ? { mode: 'isochronic', carrierHz: 220, beatHz: 10, amDepth: 1 }
        : {},
    patterns: [],
    clips: [],
    automation: [],
  };
}

describe('SoundLabEngine with a controllable audio clock', () => {
  let ctx: ReturnType<typeof makeAudioContextMock>;
  let originalAudioContext: typeof AudioContext | undefined;

  beforeEach(() => {
    jest.useFakeTimers();
    originalAudioContext = window.AudioContext;
    ctx = makeAudioContextMock();
    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      value: jest.fn(() => ctx),
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    if (originalAudioContext) {
      Object.defineProperty(window, 'AudioContext', {
        configurable: true,
        value: originalAudioContext,
      });
    } else {
      delete (window as unknown as { AudioContext?: typeof AudioContext })
        .AudioContext;
    }
  });

  function makeSession(): SoundLabSessionWithTracks {
    return {
      id: 'session',
      projectId: null,
      title: 'Test',
      bpm: 120,
      keySignature: 'C',
      targetBand: 'alpha',
      durationBeats: 64,
      loopEnabled: false,
      loopStartBeat: 0,
      loopEndBeat: 32,
      createdAt: 1,
      updatedAt: 1,
      tracks: [
        makeTrack('instrument', 'instrument', 0.2),
        makeTrack('entrainment', 'entrainment', 0.4),
      ],
    };
  }

  it('derives the playhead from AudioContext time and resumes at the requested beat', async () => {
    const engine = new SoundLabEngine();
    const onBeat = jest.fn();
    const session = makeSession();

    await engine.start(session, onBeat);
    ctx.currentTime = 2.5;
    (engine as unknown as { tick: () => void }).tick();
    expect(onBeat).toHaveBeenLastCalledWith(1);

    await engine.start(session, onBeat, undefined, 8);
    ctx.currentTime = 3;
    (engine as unknown as { tick: () => void }).tick();
    expect(onBeat).toHaveBeenLastCalledWith(9);
    engine.stop();
    await engine.dispose();
  });

  it('wraps the playhead at the enabled loop end without stopping playback', async () => {
    const engine = new SoundLabEngine();
    const onBeat = jest.fn();
    const onStop = jest.fn();
    const session = {
      ...makeSession(),
      loopEnabled: true,
      loopStartBeat: 2,
      loopEndBeat: 4,
    };

    await engine.start(session, onBeat, onStop);
    ctx.currentTime = 3.5; // 3 beats elapsed from the context's initial time.
    (engine as unknown as { tick: () => void }).tick();
    expect(onBeat).toHaveBeenLastCalledWith(3);

    ctx.currentTime = 4.5; // Absolute beat 5 wraps to beat 3.
    (engine as unknown as { tick: () => void }).tick();
    expect(onBeat).toHaveBeenLastCalledWith(3);
    expect(engine.isPlaying).toBe(true);
    expect(onStop).not.toHaveBeenCalled();
    engine.stop();
    await engine.dispose();
  });

  it('normalizes a requested start beat beyond the loop end to loop start', async () => {
    const engine = new SoundLabEngine();
    const onBeat = jest.fn();
    const session = {
      ...makeSession(),
      loopEnabled: true,
      loopStartBeat: 2,
      loopEndBeat: 4,
    };

    await engine.start(session, onBeat, undefined, 6);
    (engine as unknown as { tick: () => void }).tick();
    expect(onBeat).toHaveBeenLastCalledWith(2);
    engine.stop();
    await engine.dispose();
  });

  it('schedules clip notes again after crossing a loop boundary', async () => {
    const engine = new SoundLabEngine();
    const session = makeSession();
    session.loopEnabled = true;
    session.loopStartBeat = 0;
    session.loopEndBeat = 2;
    const instrument = session.tracks[0];
    instrument.patterns = [
      {
        id: 'pattern',
        trackId: instrument.id,
        name: 'Loop note',
        lengthBeats: 2,
        notes: [
          {
            id: 'note',
            pitch: 60,
            startBeat: 0,
            durationBeats: 0.25,
            velocity: 0.8,
          },
        ],
      },
    ];
    instrument.clips = [
      {
        id: 'clip',
        trackId: instrument.id,
        patternId: 'pattern',
        startBeat: 0,
        durationBeats: 2,
      },
    ];

    await engine.start(session);
    (engine as unknown as { tick: () => void }).tick();
    ctx.currentTime = 3; // Cross the 2-beat loop end.
    (engine as unknown as { tick: () => void }).tick();

    const noteStartTimes = ctx.createOscillator.mock.results
      .map((result) => result.value.start.mock.calls[0]?.[0])
      .filter((time): time is number => typeof time === 'number');
    expect(noteStartTimes).toContain(2);
    expect(noteStartTimes).toContain(3);
    engine.stop();
    await engine.dispose();
  });

  it('restores the stored volume on unmute and applies solo routing', async () => {
    const engine = new SoundLabEngine();
    await engine.start(makeSession());

    const instrumentBus = (
      engine as unknown as {
        trackBuses: Map<string, ReturnType<typeof makeAudioParam>>;
      }
    ).trackBuses.get('instrument') as unknown as {
      gain: ReturnType<typeof makeAudioParam>;
    };
    engine.updateTrackMute('instrument', true);
    engine.updateTrackMute('instrument', false);
    expect(instrumentBus.gain.setTargetAtTime).toHaveBeenLastCalledWith(
      0.2,
      2,
      0.02,
    );

    engine.updateTrackSolo('entrainment', true);
    expect(instrumentBus.gain.setTargetAtTime).toHaveBeenLastCalledWith(
      0,
      2,
      0.02,
    );
    engine.stop();
    await engine.dispose();
  });
});
