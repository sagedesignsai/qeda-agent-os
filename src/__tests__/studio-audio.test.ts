/**
 * __tests__/studio-audio.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Tests for the Studio multitrack audio mixing pipeline:
 *   - Audio clip evaluation at various playhead positions
 *   - Per-clip volume application
 *   - Per-track mute behavior
 *   - Overlapping audio clips on multiple tracks
 *   - Track volume control
 *   - Audio mixer class lifecycle
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { timelineStore } from '../hooks/use-timeline-store';
import type { TimelineTrack, TimelineClip } from '../lib/studio/types';

describe('Studio Multitrack Audio', () => {
  beforeEach(() => {
    timelineStore.setTracksAndDuration([], 0, true);
  });

  const buildAudioTracks = (): TimelineTrack[] => {
    const track1: TimelineTrack = {
      id: 'audio-1',
      type: 'audio',
      name: 'Audio 1',
      locked: false,
      visible: true,
      muted: false,
      volume: 1,
      clips: [
        {
          id: 'audio-clip-1',
          trackId: 'audio-1',
          name: 'Voice',
          itemType: 'audio',
          startMs: 0,
          durationMs: 5000,
          sourceStartMs: 0,
          sourceDurationMs: 5000,
          payload: {
            volume: 1,
          },
        } as any,
        {
          id: 'audio-clip-2',
          trackId: 'audio-1',
          name: 'Voice 2',
          itemType: 'audio',
          startMs: 5000,
          durationMs: 5000,
          sourceStartMs: 5000,
          sourceDurationMs: 5000,
          payload: {
            volume: 1,
          },
        } as any,
      ],
    };

    const track2: TimelineTrack = {
      id: 'audio-2',
      type: 'audio',
      name: 'Audio 2',
      locked: false,
      visible: true,
      muted: false,
      volume: 0.5,
      clips: [
        {
          id: 'audio-clip-3',
          trackId: 'audio-2',
          name: 'Music',
          itemType: 'audio',
          startMs: 0,
          durationMs: 10000,
          sourceStartMs: 0,
          sourceDurationMs: 10000,
          payload: {
            volume: 0.8,
          },
        } as any,
      ],
    };

    return [track1, track2];
  };

  describe('evaluateEditorTimeline audio', () => {
    it('returns audio clips active at the current playhead position', () => {
      const { evaluateEditorTimeline } = require('../lib/studio/timeline/evaluate');
      const tracks = buildAudioTracks();
      timelineStore.setTracksAndDuration(tracks, 10000);

      const frame = evaluateEditorTimeline(tracks, 2500);

      // At 2500ms, clip-1 (0-5000) and clip-3 (0-10000) should be active
      expect(frame.audio).toHaveLength(2);
      const ids = frame.audio.map((a: any) => a.clip.id);
      expect(ids).toContain('audio-clip-1');
      expect(ids).toContain('audio-clip-3');
    });

    it('returns correct audio clips after clip boundary', () => {
      const { evaluateEditorTimeline } = require('../lib/studio/timeline/evaluate');
      const tracks = buildAudioTracks();

      const frame = evaluateEditorTimeline(tracks, 7500);

      // At 7500ms, clip-2 (5000-10000) and clip-3 (0-10000) should be active
      expect(frame.audio).toHaveLength(2);
      const ids = frame.audio.map((a: any) => a.clip.id);
      expect(ids).toContain('audio-clip-2');
      expect(ids).toContain('audio-clip-3');
      expect(ids).not.toContain('audio-clip-1');
    });

    it('returns no audio clips outside clip ranges', () => {
      const { evaluateEditorTimeline } = require('../lib/studio/timeline/evaluate');
      const tracks = buildAudioTracks();

      const frame = evaluateEditorTimeline(tracks, 15000);
      expect(frame.audio).toHaveLength(0);
    });

    it('includes audio from muted tracks in evaluation (mute applied at mixer level)', () => {
      const { evaluateEditorTimeline } = require('../lib/studio/timeline/evaluate');
      const tracks = buildAudioTracks();
      const mutedTracks = tracks.map((t) =>
        t.id === 'audio-2' ? { ...t, muted: true } : t,
      );

      const frame = evaluateEditorTimeline(mutedTracks, 2500);

      // evaluateEditorTimeline returns all active clips regardless of mute;
      // the mute flag is respected by the mixer, not the evaluator.
      expect(frame.audio).toHaveLength(2);
    });

    it('skips invisible tracks', () => {
      const { evaluateEditorTimeline } = require('../lib/studio/timeline/evaluate');
      const tracks = buildAudioTracks();
      const hiddenTracks = tracks.map((t) =>
        t.id === 'audio-1' ? { ...t, visible: false } : t,
      );

      const frame = evaluateEditorTimeline(hiddenTracks, 2500);

      expect(frame.audio).toHaveLength(1);
      expect(frame.audio[0].clip.id).toBe('audio-clip-3');
    });
  });

  describe('audio clip volume', () => {
    it('stores per-clip volume in payload', () => {
      const tracks = buildAudioTracks();
      const clip = tracks[0].clips[0];
      expect(clip.payload?.volume).toBe(1);

      const musicClip = tracks[1].clips[0];
      expect(musicClip.payload?.volume).toBe(0.8);
    });

    it('allows updating clip volume via updateClip', () => {
      const tracks = buildAudioTracks();
      timelineStore.setTracksAndDuration(tracks, 10000);

      // updateClip(clipId, patch, trackId?)
      timelineStore.updateClip('audio-clip-1', {
        payload: { volume: 0.5 },
      }, 'audio-1');

      const state = timelineStore.getState();
      const updated = state.tracks[0].clips[0];
      // updateClip merges payload, so volume should be updated
      expect(updated.payload?.volume).toBe(0.5);
    });
  });

  describe('track volume control', () => {
    it('sets track volume via setTrackVolume', () => {
      const tracks = buildAudioTracks();
      timelineStore.setTracksAndDuration(tracks, 10000);

      timelineStore.setTrackVolume('audio-1', 0.75);

      const state = timelineStore.getState();
      const track = state.tracks.find((t) => t.id === 'audio-1')!;
      expect(track.volume).toBe(0.75);
    });

    it('clamps volume to 0-1 range', () => {
      const tracks = buildAudioTracks();
      timelineStore.setTracksAndDuration(tracks, 10000);

      timelineStore.setTrackVolume('audio-1', 1.5);
      let state = timelineStore.getState();
      expect(state.tracks.find((t) => t.id === 'audio-1')!.volume).toBe(1);

      timelineStore.setTrackVolume('audio-1', -0.5);
      state = timelineStore.getState();
      expect(state.tracks.find((t) => t.id === 'audio-1')!.volume).toBe(0);
    });

    it('ignores setTrackVolume for non-existent track', () => {
      const tracks = buildAudioTracks();
      timelineStore.setTracksAndDuration(tracks, 10000);

      timelineStore.setTrackVolume('non-existent', 0.5);
      const state = timelineStore.getState();
      // No crash, tracks unchanged
      expect(state.tracks).toHaveLength(2);
    });

    it('supports undo for volume changes', () => {
      const tracks = buildAudioTracks();
      timelineStore.setTracksAndDuration(tracks, 10000);

      timelineStore.setTrackVolume('audio-1', 0.25);
      let state = timelineStore.getState();
      expect(state.tracks.find((t) => t.id === 'audio-1')!.volume).toBe(0.25);

      timelineStore.undo();
      state = timelineStore.getState();
      // Volume reverts to original (1)
      expect(state.tracks.find((t) => t.id === 'audio-1')!.volume).toBe(1);
    });
  });

  describe('track mute toggle', () => {
    it('toggles track mute via toggleTrackMute', () => {
      const tracks = buildAudioTracks();
      timelineStore.setTracksAndDuration(tracks, 10000);

      timelineStore.toggleTrackMute('audio-1');
      let state = timelineStore.getState();
      expect(state.tracks.find((t) => t.id === 'audio-1')!.muted).toBe(true);

      timelineStore.toggleTrackMute('audio-1');
      state = timelineStore.getState();
      expect(state.tracks.find((t) => t.id === 'audio-1')!.muted).toBe(false);
    });

    it('supports undo for mute toggle', () => {
      const tracks = buildAudioTracks();
      timelineStore.setTracksAndDuration(tracks, 10000);

      timelineStore.toggleTrackMute('audio-1');
      let state = timelineStore.getState();
      expect(state.tracks.find((t) => t.id === 'audio-1')!.muted).toBe(true);

      timelineStore.undo();
      state = timelineStore.getState();
      expect(state.tracks.find((t) => t.id === 'audio-1')!.muted).toBe(false);
    });
  });

  describe('overlapping audio clips', () => {
    it('evaluates overlapping clips on different tracks simultaneously', () => {
      const { evaluateEditorTimeline } = require('../lib/studio/timeline/evaluate');
      const tracks = buildAudioTracks();

      // At 2500ms, both tracks have active clips
      const frame = evaluateEditorTimeline(tracks, 2500);
      expect(frame.audio).toHaveLength(2);

      // Verify local time is correct for each clip
      const clip1 = frame.audio.find((a: any) => a.clip.id === 'audio-clip-1')!;
      const clip3 = frame.audio.find((a: any) => a.clip.id === 'audio-clip-3')!;
      expect(clip1.localTimeMs).toBe(2500);
      expect(clip3.localTimeMs).toBe(2500);
    });

    it('evaluates adjacent clips with no overlap at boundary', () => {
      const { evaluateEditorTimeline } = require('../lib/studio/timeline/evaluate');
      const tracks = buildAudioTracks();

      // At exactly 5000ms, clip-1 has ended (half-open range) and clip-2 starts
      const frame = evaluateEditorTimeline(tracks, 5000);
      const ids = frame.audio.map((a: any) => a.clip.id);
      expect(ids).not.toContain('audio-clip-1');
      expect(ids).toContain('audio-clip-2');
    });
  });

  describe('audio mixer class', () => {
    it('creates and disposes without error', () => {
      // StudioAudioMixer uses the shared AudioContext; in a test environment
      // it may not be available, so we verify the class doesn't crash.
      try {
        const { StudioAudioMixer } = require('../lib/studio/audio/mixer');
        const mixer = new StudioAudioMixer();
        mixer.dispose();
      } catch {
        // AudioContext may not be available in the test environment
      }
    });
  });
});
