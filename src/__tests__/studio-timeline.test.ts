/**
 * __tests__/studio-timeline.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Tests for the Studio Multi-Track Timeline Engine:
 *   - Track generation from StudioTake domain model (with & without silence cuts)
 *   - Non-destructive clip splitting & source offset preservation
 *   - Non-destructive in/out trimming
 *   - Track muting, locking, and visibility state toggles
 *   - Isolated playhead time subscription
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  convertTakeToTracks,
  type StudioTake,
  DEFAULT_STUDIO_STYLING,
} from '../lib/studio-types';
import { timelineStore } from '../hooks/use-timeline-store';

describe('Studio Multi-Track Timeline Engine', () => {
  const sampleTakeWithoutCuts: StudioTake = {
    id: 'take-test-raw',
    projectId: null,
    title: 'Raw Showcase Take',
    description: null,
    sourceType: 'window',
    sourceName: 'Visual Studio Code',
    videoPath: '/dummy/path/raw.webm',
    audioPath: null,
    mouseEventsPath: null,
    durationMs: 12000,
    fileSizeBytes: 1048576,
    styling: DEFAULT_STUDIO_STYLING,
    zooms: [],
    cuts: [],
    captions: [],
    socialKit: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const sampleTakeWithCuts: StudioTake = {
    id: 'take-test-123',
    projectId: null,
    title: 'Showcase Demo Take',
    description: null,
    sourceType: 'window',
    sourceName: 'Visual Studio Code',
    videoPath: '/dummy/path/video.webm',
    audioPath: null,
    mouseEventsPath: null,
    durationMs: 12000,
    fileSizeBytes: 1048576,
    styling: DEFAULT_STUDIO_STYLING,
    zooms: [
      {
        id: 'zoom-1',
        startMs: 2000,
        endMs: 5000,
        targetX: 0.6,
        targetY: 0.4,
        scale: 1.8,
      },
    ],
    cuts: [
      {
        id: 'cut-1',
        startMs: 6000,
        endMs: 7500,
        reason: 'silence',
      },
    ],
    captions: [
      {
        id: 'cap-1',
        startMs: 1000,
        endMs: 4000,
        text: 'Welcome to Qeda Studio',
      },
    ],
    socialKit: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  it('converts raw StudioTake into 4 stacked visual tracks', () => {
    const tracks = convertTakeToTracks(sampleTakeWithoutCuts);

    expect(tracks).toHaveLength(4);
    expect(tracks[0].type).toBe('effects');
    expect(tracks[1].type).toBe('captions');
    expect(tracks[2].type).toBe('video');
    expect(tracks[3].type).toBe('audio');

    // Video & audio tracks contain 1 continuous clip of 12000ms
    expect(tracks[2].clips).toHaveLength(1);
    expect(tracks[2].clips[0].durationMs).toBe(12000);

    expect(tracks[3].clips).toHaveLength(1);
    expect(tracks[3].clips[0].durationMs).toBe(12000);
  });

  it('auto-prunes silence cuts into segmented video and audio clips', () => {
    const tracks = convertTakeToTracks(sampleTakeWithCuts);

    expect(tracks).toHaveLength(4);

    // Effects track contains the zoom keyframe
    expect(tracks[0].clips).toHaveLength(1);
    expect(tracks[0].clips[0].startMs).toBe(2000);
    expect(tracks[0].clips[0].durationMs).toBe(3000);

    // Captions track contains the subtitle snippet
    expect(tracks[1].clips).toHaveLength(1);
    expect(tracks[1].clips[0].startMs).toBe(1000);
    expect(tracks[1].clips[0].durationMs).toBe(3000);

    // Video track is segmented around the cut (0-6000ms and 7500-12000ms)
    expect(tracks[2].clips).toHaveLength(2);
    expect(tracks[2].clips[0].startMs).toBe(0);
    expect(tracks[2].clips[0].durationMs).toBe(6000);
    expect(tracks[2].clips[1].startMs).toBe(7500);
    expect(tracks[2].clips[1].durationMs).toBe(4500);

    // Audio track also segmented around the cut
    expect(tracks[3].clips).toHaveLength(2);
  });

  it('performs non-destructive clip splitting with source offsets', () => {
    const tracks = convertTakeToTracks(sampleTakeWithoutCuts);
    timelineStore.setTracksAndDuration(
      tracks,
      sampleTakeWithoutCuts.durationMs,
    );

    const videoTrack = timelineStore
      .getState()
      .tracks.find((t) => t.type === 'video');
    expect(videoTrack).toBeDefined();
    const originalClip = videoTrack!.clips[0];

    // Split video clip at 4000ms
    const splitSuccess = timelineStore.splitClipAt(
      videoTrack!.id,
      originalClip.id,
      4000,
    );
    expect(splitSuccess).toBe(true);

    const updatedTrack = timelineStore
      .getState()
      .tracks.find((t) => t.id === videoTrack!.id);
    expect(updatedTrack!.clips).toHaveLength(2);

    const firstPart = updatedTrack!.clips[0];
    const secondPart = updatedTrack!.clips[1];

    // Part 1: starts at 0ms, duration 4000ms, sourceStartMs 0ms
    expect(firstPart.startMs).toBe(0);
    expect(firstPart.durationMs).toBe(4000);
    expect(firstPart.sourceStartMs).toBe(0);

    // Part 2: starts at 4000ms, duration 8000ms, sourceStartMs shifted to 4000ms!
    expect(secondPart.startMs).toBe(4000);
    expect(secondPart.durationMs).toBe(8000);
    expect(secondPart.sourceStartMs).toBe(4000);
  });

  it('performs non-destructive in/out edge trimming', () => {
    const tracks = convertTakeToTracks(sampleTakeWithoutCuts);
    timelineStore.setTracksAndDuration(
      tracks,
      sampleTakeWithoutCuts.durationMs,
    );

    const videoTrack = timelineStore
      .getState()
      .tracks.find((t) => t.type === 'video');
    const clip = videoTrack!.clips[0];

    // Trim start edge by 1500ms
    timelineStore.trimClip(videoTrack!.id, clip.id, 'start', 1500);

    let updatedTrack = timelineStore
      .getState()
      .tracks.find((t) => t.id === videoTrack!.id);
    let updatedClip = updatedTrack!.clips[0];

    expect(updatedClip.startMs).toBe(1500);
    expect(updatedClip.durationMs).toBe(10500);
    expect(updatedClip.sourceStartMs).toBe(1500);

    // Trim end edge to 8000ms
    timelineStore.trimClip(videoTrack!.id, clip.id, 'end', 8000);

    updatedTrack = timelineStore
      .getState()
      .tracks.find((t) => t.id === videoTrack!.id);
    updatedClip = updatedTrack!.clips[0];

    expect(updatedClip.startMs).toBe(1500);
    expect(updatedClip.durationMs).toBe(6500);
  });

  it('toggles track lock, visibility, and audio muting', () => {
    const tracks = convertTakeToTracks(sampleTakeWithoutCuts);
    timelineStore.setTracksAndDuration(
      tracks,
      sampleTakeWithoutCuts.durationMs,
    );

    const audioTrack = timelineStore
      .getState()
      .tracks.find((t) => t.type === 'audio');
    expect(audioTrack).toBeDefined();

    expect(audioTrack!.muted).toBe(false);
    timelineStore.toggleTrackMute(audioTrack!.id);
    expect(
      timelineStore.getState().tracks.find((t) => t.id === audioTrack!.id)!
        .muted,
    ).toBe(true);

    expect(audioTrack!.locked).toBe(false);
    timelineStore.toggleTrackLock(audioTrack!.id);
    expect(
      timelineStore.getState().tracks.find((t) => t.id === audioTrack!.id)!
        .locked,
    ).toBe(true);

    expect(audioTrack!.visible).toBe(true);
    timelineStore.toggleTrackVisibility(audioTrack!.id);
    expect(
      timelineStore.getState().tracks.find((t) => t.id === audioTrack!.id)!
        .visible,
    ).toBe(false);
  });

  it('supports isolated 60fps playhead time subscription without general notification', () => {
    let generalNotifyCount = 0;
    let timeNotifyCount = 0;
    let lastTime = 0;

    const unsubGeneral = timelineStore.subscribe(() => {
      generalNotifyCount++;
    });

    const unsubTime = timelineStore.subscribeTime((ms) => {
      timeNotifyCount++;
      lastTime = ms;
    });

    // High frequency seek with triggerGeneralNotify = false
    timelineStore.seek(2500, false);
    timelineStore.seek(3000, false);
    timelineStore.seek(3500, false);

    expect(timeNotifyCount).toBe(3);
    expect(lastTime).toBe(3500);
    expect(generalNotifyCount).toBe(0); // Zero React re-renders!

    unsubGeneral();
    unsubTime();
  });

  it('finds and updates clips non-destructively with payload merging', () => {
    const tracks = convertTakeToTracks(sampleTakeWithCuts);
    timelineStore.setTracksAndDuration(tracks, sampleTakeWithCuts.durationMs);

    const firstVideoClip = tracks.find((t) => t.type === 'video')!.clips[0];

    const found = timelineStore.findClip(firstVideoClip.id);
    expect(found).not.toBeNull();
    expect(found!.clip.id).toBe(firstVideoClip.id);
    expect(found!.track.type).toBe('video');

    // Update clip payload and properties
    timelineStore.updateClip(firstVideoClip.id, {
      name: 'Updated Intro Clip',
      payload: { speed: 1.5, volume: 0.8 },
    });

    const updated = timelineStore.findClip(firstVideoClip.id);
    expect(updated!.clip.name).toBe('Updated Intro Clip');
    expect(updated!.clip.payload?.speed).toBe(1.5);
    expect(updated!.clip.payload?.volume).toBe(0.8);
  });
});
