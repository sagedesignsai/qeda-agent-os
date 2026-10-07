/**
 * __tests__/soundlab-modules.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Unit tests for SoundLab modular audio subsystems:
 *   - soundlab/soundlab-math: math & conversion utilities
 *   - soundlab/soundlab-drums: 808 percussion voice synthesis
 *   - soundlab/soundlab-synth: polyphonic ADSR note scheduler
 *   - soundlab/soundlab-entrainment: binaural, isochronic, monaural, am-embed & noise
 *   - soundlab/soundlab-mixer: bus routing, panners, and track mixer
 *   - soundlab/soundlab-scheduler: loop boundaries, transport beat calculations
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  clamp,
  getAudioCtorSafe,
  scheduleDrumHit,
  playDrumPreview,
  schedulePolyNote,
  startEntrainmentTrack,
  stopEntrainmentTrack,
  updateEntrainmentNodes,
  startNoiseTrack,
  TrackMixer,
  LookaheadScheduler,
} from '../lib/soundlab';
import type { SoundLabTrack, SoundLabSessionWithTracks } from '../lib/soundlab-types';

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

function makeMockAudioContext() {
  const createNode = () => ({
    gain: makeAudioParam(),
    frequency: makeAudioParam(),
    pan: makeAudioParam(),
    threshold: makeAudioParam(),
    knee: makeAudioParam(),
    ratio: makeAudioParam(),
    attack: makeAudioParam(),
    release: makeAudioParam(),
    connect: jest.fn((dest: unknown) => dest),
    disconnect: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(),
    buffer: null,
    loop: false,
  });

  return {
    currentTime: 10,
    sampleRate: 48000,
    state: 'running',
    destination: {},
    createGain: jest.fn(createNode),
    createDynamicsCompressor: jest.fn(createNode),
    createStereoPanner: jest.fn(createNode),
    createOscillator: jest.fn(createNode),
    createBufferSource: jest.fn(createNode),
    createChannelMerger: jest.fn(() => ({
      connect: jest.fn(),
      disconnect: jest.fn(),
    })),
    createBiquadFilter: jest.fn(createNode),
    createBuffer: jest.fn((_ch: number, length: number) => ({
      length,
      getChannelData: jest.fn(() => new Float32Array(length)),
      copyToChannel: jest.fn(),
    })),
    resume: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
  } as unknown as AudioContext;
}

describe('SoundLab Modular Audio Subsystems', () => {
  let ctx: AudioContext;

  beforeEach(() => {
    ctx = makeMockAudioContext();
  });

  describe('soundlab-math', () => {
    it('clamp restricts values to min/max', () => {
      expect(clamp(-5, 0, 1)).toBe(0);
      expect(clamp(15, 0, 10)).toBe(10);
      expect(clamp(0.5, 0, 1)).toBe(0.5);
    });

    it('getAudioCtorSafe detects window.AudioContext', () => {
      expect(getAudioCtorSafe()).toBeDefined();
    });
  });

  describe('soundlab-drums', () => {
    it('schedules kick, snare, hihat, and clap hits without errors', () => {
      const bus = ctx.createGain();
      expect(() => scheduleDrumHit(ctx, 'kick', 10, bus)).not.toThrow();
      expect(() => scheduleDrumHit(ctx, 'snare', 10.5, bus)).not.toThrow();
      expect(() => scheduleDrumHit(ctx, 'hihat', 11, bus)).not.toThrow();
      expect(() => scheduleDrumHit(ctx, 'clap', 11.5, bus)).not.toThrow();
      expect(ctx.createOscillator).toHaveBeenCalled();
      expect(ctx.createBufferSource).toHaveBeenCalled();
    });

    it('plays drum preview through destination', () => {
      const dest = ctx.createGain();
      expect(() => playDrumPreview(ctx, dest, 'kick')).not.toThrow();
    });
  });

  describe('soundlab-synth', () => {
    it('schedules polyphonic note with ADSR envelope', () => {
      const bus = ctx.createGain();
      const note = {
        id: 'n1',
        pitch: 60,
        startBeat: 0,
        durationBeats: 2,
        velocity: 0.8,
      };

      expect(() =>
        schedulePolyNote(ctx, note, 10, bus, { waveform: 'sine' }, 120),
      ).not.toThrow();
      expect(ctx.createOscillator).toHaveBeenCalled();
    });
  });

  describe('soundlab-entrainment', () => {
    const makeTrack = (mode: any): SoundLabTrack => ({
      id: 'trk-ent',
      sessionId: 'sess-1',
      type: 'entrainment',
      name: 'Entrainment',
      sortOrder: 0,
      muted: false,
      solo: false,
      volume: 0.8,
      pan: 0,
      color: '#00f',
      config: { mode, carrierHz: 432, beatHz: 10, amDepth: 0.8 },
      patterns: [],
      clips: [],
      automation: [],
    });

    it('starts and stops binaural entrainment track', () => {
      const bus = ctx.createGain();
      const track = makeTrack('binaural');
      const nodes = startEntrainmentTrack(ctx, track, bus, null);
      expect(nodes.oscillators.length).toBe(2);
      expect(() => stopEntrainmentTrack(ctx, nodes, null)).not.toThrow();
    });

    it('starts and updates isochronic and monaural modes', () => {
      const bus = ctx.createGain();
      const isoTrack = makeTrack('isochronic');
      const isoNodes = startEntrainmentTrack(ctx, isoTrack, bus, null);
      expect(isoNodes.lfo).toBeDefined();

      expect(() =>
        updateEntrainmentNodes(ctx, isoNodes, { carrierHz: 216, beatHz: 6 }, null),
      ).not.toThrow();
      stopEntrainmentTrack(ctx, isoNodes, null);

      const monTrack = makeTrack('monaural');
      const monNodes = startEntrainmentTrack(ctx, monTrack, bus, null);
      expect(monNodes.carrierGain).toBeDefined();
      stopEntrainmentTrack(ctx, monNodes, null);
    });

    it('starts noise track with buffer source', () => {
      const bus = ctx.createGain();
      const noiseTrack: SoundLabTrack = {
        ...makeTrack('binaural'),
        type: 'noise',
        config: { noiseType: 'pink' },
      };
      const source = startNoiseTrack(ctx, noiseTrack, bus);
      expect(source).toBeDefined();
      expect(source.loop).toBe(true);
    });
  });

  describe('soundlab-mixer', () => {
    it('builds track bus, updates volume/pan/mute/solo and disposes cleanly', () => {
      const mixer = new TrackMixer();
      mixer.ensureMasterGraph(ctx);

      const track: SoundLabTrack = {
        id: 't-inst',
        sessionId: 's-1',
        type: 'instrument',
        name: 'Pad',
        sortOrder: 0,
        muted: false,
        solo: false,
        volume: 0.7,
        pan: 0.2,
        color: '#f00',
        config: {},
        patterns: [],
        clips: [],
        automation: [],
      };

      const bus = mixer.buildTrackBus(ctx, track);
      expect(bus).toBeDefined();
      expect(mixer.trackBuses.has('t-inst')).toBe(true);

      mixer.updateTrackVolume(ctx, 't-inst', 0.9);
      expect(mixer.trackSettings.get('t-inst')?.volume).toBe(0.9);

      mixer.updateTrackPan(ctx, 't-inst', -0.5);
      expect(mixer.trackSettings.get('t-inst')?.pan).toBe(-0.5);

      mixer.updateTrackMute(ctx, 't-inst', true);
      expect(mixer.trackSettings.get('t-inst')?.muted).toBe(true);

      mixer.updateTrackSolo(ctx, 't-inst', true);
      expect(mixer.trackSettings.get('t-inst')?.solo).toBe(true);

      mixer.disconnectAll();
      expect(mixer.trackBuses.size).toBe(0);

      mixer.dispose();
      expect(mixer.master).toBeNull();
    });
  });

  describe('soundlab-scheduler', () => {
    const scheduler = new LookaheadScheduler();
    const session: SoundLabSessionWithTracks = {
      id: 'sess',
      projectId: null,
      title: 'Session',
      bpm: 120,
      keySignature: 'C',
      targetBand: 'alpha',
      durationBeats: 32,
      loopEnabled: true,
      loopStartBeat: 4,
      loopEndBeat: 12,
      createdAt: 0,
      updatedAt: 0,
      tracks: [],
    };

    it('calculates loop bounds and wraps transport beats accurately', () => {
      expect(scheduler.hasActiveLoop(session, 32)).toBe(true);
      expect(scheduler.getLoopEndBeat(session, 32)).toBe(12);

      // Before loop end: unchanged
      expect(scheduler.transportBeat(session, 32, 6)).toBe(6);
      // At loop end: wraps to loopStartBeat (4)
      expect(scheduler.transportBeat(session, 32, 12)).toBe(4);
      // After loop end by 2 beats (14): 4 + (14 - 4) % 8 = 4 + 2 = 6
      expect(scheduler.transportBeat(session, 32, 14)).toBe(6);
    });
  });
});
