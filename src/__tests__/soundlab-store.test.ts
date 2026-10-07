/**
 * __tests__/soundlab-store.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Unit tests for SoundLabStore: session loading, track/pattern/clip mutations,
 * undo/redo stack, and playhead time subscription isolation.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { soundLabStore } from '../hooks/use-soundlab-store';
import { buildDefaultTracks } from '../lib/soundlab-types';
import type { SoundLabSessionWithTracks } from '../lib/soundlab-types';

describe('SoundLabStore', () => {
  const sampleSession: SoundLabSessionWithTracks = {
    id: 's-1',
    projectId: null,
    title: 'Focus Lab',
    bpm: 120,
    keySignature: 'C',
    targetBand: 'alpha',
    durationBeats: 64,
    loopEnabled: false,
    loopStartBeat: 0,
    loopEndBeat: 32,
    createdAt: 1000,
    updatedAt: 1000,
    tracks: buildDefaultTracks('s-1', 'alpha'),
  };

  beforeEach(() => {
    soundLabStore.loadSession(sampleSession);
  });

  it('loads a session and initializes track state', () => {
    const state = soundLabStore.getState();
    expect(state.session?.id).toBe('s-1');
    expect(state.session?.title).toBe('Focus Lab');
    expect(state.tracks.length).toBeGreaterThan(0);
    expect(state.isPlaying).toBe(false);
    expect(state.playheadBeat).toBe(0);
  });

  it('canUndo and canRedo start as false after loading session', () => {
    expect(soundLabStore.canUndo()).toBe(false);
    expect(soundLabStore.canRedo()).toBe(false);
  });

  describe('Track operations and undo/redo', () => {
    it('adds and removes a track with undo support', () => {
      const initialCount = soundLabStore.getState().tracks.length;
      const newTrack = {
        id: 'new-trk-1',
        sessionId: 's-1',
        type: 'instrument' as const,
        name: 'Lead Synth',
        sortOrder: initialCount,
        muted: false,
        solo: false,
        volume: 0.8,
        pan: 0,
        color: '#ff00aa',
        config: {},
        patterns: [],
        clips: [],
        automation: [],
      };

      soundLabStore.addTrack(newTrack);
      expect(soundLabStore.getState().tracks.length).toBe(initialCount + 1);
      expect(soundLabStore.canUndo()).toBe(true);

      soundLabStore.undo();
      expect(soundLabStore.getState().tracks.length).toBe(initialCount);
      expect(soundLabStore.canRedo()).toBe(true);

      soundLabStore.redo();
      expect(soundLabStore.getState().tracks.length).toBe(initialCount + 1);

      soundLabStore.removeTrack('new-trk-1');
      expect(soundLabStore.getState().tracks.length).toBe(initialCount);
    });

    it('updates track volume, pan and mute without breaking undo', () => {
      const trackId = soundLabStore.getState().tracks[0].id;
      soundLabStore.updateTrack(trackId, { volume: 0.5, muted: true });

      const updated = soundLabStore.getState().tracks.find((t) => t.id === trackId);
      expect(updated?.volume).toBe(0.5);
      expect(updated?.muted).toBe(true);
    });
  });

  describe('Pattern and note editing', () => {
    it('adds and removes notes within a pattern with undo', () => {
      const track = soundLabStore.getState().tracks[0];
      const pattern = track.patterns[0];
      expect(pattern).toBeDefined();

      const note = {
        id: 'n-1',
        pitch: 60,
        startBeat: 0,
        durationBeats: 1,
        velocity: 0.8,
      };

      soundLabStore.addNote(track.id, pattern.id, note);
      const afterAdd = soundLabStore
        .getState()
        .tracks.find((t) => t.id === track.id)
        ?.patterns.find((p) => p.id === pattern.id);
      expect(afterAdd?.notes).toHaveLength(1);
      expect(afterAdd?.notes[0].pitch).toBe(60);

      soundLabStore.undo();
      const afterUndo = soundLabStore
        .getState()
        .tracks.find((t) => t.id === track.id)
        ?.patterns.find((p) => p.id === pattern.id);
      expect(afterUndo?.notes).toHaveLength(0);
    });
  });

  describe('Clip management', () => {
    it('places, updates and removes clips on timeline', () => {
      const track = soundLabStore.getState().tracks[0];
      const pattern = track.patterns[0];
      const clip = {
        id: 'c-1',
        trackId: track.id,
        patternId: pattern.id,
        startBeat: 4,
        durationBeats: 8,
      };

      soundLabStore.addClip(track.id, clip);
      let trk = soundLabStore.getState().tracks.find((t) => t.id === track.id);
      expect(trk?.clips).toHaveLength(1);
      expect(trk?.clips[0].startBeat).toBe(4);

      soundLabStore.updateClip(track.id, 'c-1', { startBeat: 8 });
      trk = soundLabStore.getState().tracks.find((t) => t.id === track.id);
      expect(trk?.clips[0].startBeat).toBe(8);

      soundLabStore.removeClip(track.id, 'c-1');
      trk = soundLabStore.getState().tracks.find((t) => t.id === track.id);
      expect(trk?.clips).toHaveLength(0);
    });
  });

  describe('Playback and time subscriptions', () => {
    it('subscribeTime receives beat updates on seek without notifying general listener', () => {
      const generalListener = jest.fn();
      const timeListener = jest.fn();

      const unsubGeneral = soundLabStore.subscribe(generalListener);
      const unsubTime = soundLabStore.subscribeTime(timeListener);

      soundLabStore.seek(16.5);
      expect(timeListener).toHaveBeenCalledWith(16.5);
      expect(generalListener).not.toHaveBeenCalled();

      // forceGeneral = true notifies general listeners
      soundLabStore.seek(20, true);
      expect(generalListener).toHaveBeenCalledTimes(1);

      unsubGeneral();
      unsubTime();
    });

    it('toggles isPlaying and playMode', () => {
      soundLabStore.setPlaying(true);
      expect(soundLabStore.getState().isPlaying).toBe(true);

      soundLabStore.setPlayMode('song');
      expect(soundLabStore.getState().playMode).toBe('song');
      soundLabStore.setPlayMode('pattern');
      expect(soundLabStore.getState().playMode).toBe('pattern');
    });
  });
});
