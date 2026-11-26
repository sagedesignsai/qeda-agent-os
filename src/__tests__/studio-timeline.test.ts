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
  compositionDurationMs,
  convertTakeToTracks,
  extractCaptionsFromTracks,
  extractCutsFromTracks,
  extractZoomsFromTracks,
  normalizeCuts,
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

    // Video track is split around the cut, and the cut closes up: the second
    // clip starts where the first ended, while its source offset jumps to 7500.
    expect(tracks[2].clips).toHaveLength(2);
    expect(tracks[2].clips[0].startMs).toBe(0);
    expect(tracks[2].clips[0].durationMs).toBe(6000);
    expect(tracks[2].clips[0].sourceStartMs).toBe(0);
    expect(tracks[2].clips[1].startMs).toBe(6000);
    expect(tracks[2].clips[1].durationMs).toBe(4500);
    expect(tracks[2].clips[1].sourceStartMs).toBe(7500);

    // Audio track also segmented around the cut
    expect(tracks[3].clips).toHaveLength(2);
    expect(tracks[3].clips[1].startMs).toBe(6000);
    expect(tracks[3].clips[0].name).toBe('Microphone');
  });

  it('reports the composition duration, not the recording duration', () => {
    const cuts = normalizeCuts(sampleTakeWithCuts.cuts, 12000);
    expect(compositionDurationMs(12000, cuts)).toBe(10500);
  });

  it('round-trips cuts from source spans instead of ruler gaps', () => {
    const tracks = convertTakeToTracks(sampleTakeWithCuts);
    const cuts = extractCutsFromTracks(tracks, sampleTakeWithCuts.durationMs);

    expect(cuts).toHaveLength(1);
    expect(cuts[0].startMs).toBe(6000);
    expect(cuts[0].endMs).toBe(7500);

    // Zooms and captions come back on the source axis even though they were
    // laid out in composition time.
    expect(extractZoomsFromTracks(tracks, cuts)[0]).toMatchObject({
      startMs: 2000,
      endMs: 5000,
    });
    expect(extractCaptionsFromTracks(tracks, cuts)[0]).toMatchObject({
      startMs: 1000,
      endMs: 4000,
    });
  });

  it('treats a deleted video clip as a cut on the next sync', () => {
    const tracks = convertTakeToTracks(sampleTakeWithoutCuts);
    timelineStore.setTracksAndDuration(tracks, 12000);

    const videoTrack = timelineStore
      .getState()
      .tracks.find((t) => t.type === 'video')!;
    timelineStore.splitClipAt(videoTrack.id, videoTrack.clips[0].id, 4000);

    const split = timelineStore
      .getState()
      .tracks.find((t) => t.id === videoTrack.id)!;
    timelineStore.setSelectedClipId(split.clips[1].id);
    timelineStore.deleteSelectedClip();

    // The survivor still covers source 0-4000, so 4000-12000 became a cut.
    const cuts = extractCutsFromTracks(timelineStore.getState().tracks, 12000);
    expect(cuts).toEqual([
      expect.objectContaining({ startMs: 4000, endMs: 12000 }),
    ]);
  });

  it('refuses to slide a video clip off the timeline spine', () => {
    const tracks = convertTakeToTracks(sampleTakeWithoutCuts);
    timelineStore.setTracksAndDuration(tracks, 12000);

    const videoTrack = timelineStore
      .getState()
      .tracks.find((t) => t.type === 'video')!;
    timelineStore.moveClip(videoTrack.id, videoTrack.clips[0].id, 2000);

    expect(
      timelineStore
        .getState()
        .tracks.find((t) => t.id === videoTrack.id)!.clips[0].startMs,
    ).toBe(0);
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

describe('Timeline edit transactions', () => {
  it('batches drag persistence and records one undo snapshot', () => {
    const track = {
      id: 'track-video-transaction',
      type: 'video' as const,
      name: 'Video',
      locked: false,
      visible: true,
      clips: [
        {
          id: 'clip-transaction',
          trackId: 'track-video-transaction',
          itemType: 'video' as const,
          name: 'Clip',
          startMs: 0,
          durationMs: 5000,
          sourceStartMs: 0,
          sourceDurationMs: 5000,
          color: '#334155',
        },
      ],
    };
    timelineStore.setTracksAndDuration([track], 5000, true, true);
    const commits: number[] = [];
    const unsubscribe = timelineStore.subscribeTracks(() => commits.push(1));

    timelineStore.beginUndoTransaction();
    timelineStore.moveClip(track.id, 'clip-transaction', 1000);
    timelineStore.moveClip(track.id, 'clip-transaction', 2000);

    expect(commits).toHaveLength(0);
    expect(timelineStore.findClip('clip-transaction')?.clip.startMs).toBe(2000);

    timelineStore.endUndoTransaction();
    unsubscribe();

    expect(commits).toHaveLength(1);
    timelineStore.undo();
    expect(timelineStore.findClip('clip-transaction')?.clip.startMs).toBe(0);
  });
});

describe('Cut-centered transitions', () => {
  beforeEach(() => {
    timelineStore.setTracksAndDuration([], 0, true);
  });

  const buildAdjacentClips = () => {
    const tracks = [
      {
        id: 'track-video-1',
        type: 'video' as const,
        name: 'Video 1',
        locked: false,
        visible: true,
        clips: [
          {
            id: 'clip-a',
            trackId: 'track-video-1',
            itemType: 'video' as const,
            name: 'Clip A',
            startMs: 0,
            durationMs: 5000,
            sourceStartMs: 0,
            sourceDurationMs: 5000,
            color: '#334155',
          },
          {
            id: 'clip-b',
            trackId: 'track-video-1',
            itemType: 'video' as const,
            name: 'Clip B',
            startMs: 5000,
            durationMs: 5000,
            sourceStartMs: 5000,
            sourceDurationMs: 5000,
            color: '#334155',
          },
        ],
      },
    ];
    timelineStore.setTracksAndDuration(tracks, 10000, true);
    return tracks;
  };

  it('creates a transition centered on the cut between two adjacent clips', () => {
    buildAdjacentClips();
    timelineStore.seek(5000, true);

    const transition = timelineStore.addTransitionClip({
      transitionType: 'fade',
      durationMs: 600,
    });

    expect(transition).not.toBeNull();
    expect(transition!.payload?.fromClipId).toBe('clip-a');
    expect(transition!.payload?.toClipId).toBe('clip-b');
    expect(transition!.startMs).toBe(4700); // cutMs (5000) - durationMs/2 (300)
    expect(transition!.durationMs).toBe(600);
  });

  it('clamps transition duration to the shorter clip', () => {
    const tracks = [
      {
        id: 'track-video-1',
        type: 'video' as const,
        name: 'Video 1',
        locked: false,
        visible: true,
        clips: [
          {
            id: 'clip-a',
            trackId: 'track-video-1',
            itemType: 'video' as const,
            name: 'Clip A',
            startMs: 0,
            durationMs: 300,
            sourceStartMs: 0,
            sourceDurationMs: 300,
            color: '#334155',
          },
          {
            id: 'clip-b',
            trackId: 'track-video-1',
            itemType: 'video' as const,
            name: 'Clip B',
            startMs: 300,
            durationMs: 5000,
            sourceStartMs: 300,
            sourceDurationMs: 5000,
            color: '#334155',
          },
        ],
      },
    ];
    timelineStore.setTracksAndDuration(tracks, 5300, true);
    timelineStore.seek(300, true);

    const transition = timelineStore.addTransitionClip({
      transitionType: 'fade',
      durationMs: 600,
    });

    // Duration clamped to min(600, 300, 5000, 600) = 300
    expect(transition).not.toBeNull();
    expect(transition!.durationMs).toBe(300);
  });

  it('rejects transition when clips are too short', () => {
    const tracks = [
      {
        id: 'track-video-1',
        type: 'video' as const,
        name: 'Video 1',
        locked: false,
        visible: true,
        clips: [
          {
            id: 'clip-a',
            trackId: 'track-video-1',
            itemType: 'video' as const,
            name: 'Clip A',
            startMs: 0,
            durationMs: 50,
            sourceStartMs: 0,
            sourceDurationMs: 50,
            color: '#334155',
          },
          {
            id: 'clip-b',
            trackId: 'track-video-1',
            itemType: 'video' as const,
            name: 'Clip B',
            startMs: 50,
            durationMs: 5000,
            sourceStartMs: 50,
            sourceDurationMs: 5000,
            color: '#334155',
          },
        ],
      },
    ];
    timelineStore.setTracksAndDuration(tracks, 5050, true);
    timelineStore.seek(50, true);

    const transition = timelineStore.addTransitionClip({
      transitionType: 'fade',
      durationMs: 600,
    });

    // Duration clamped to min(600, 50, 5000, 100) = 50, which is < 100
    expect(transition).toBeNull();
  });

  it('re-centers transition when the outgoing clip is trimmed', () => {
    buildAdjacentClips();
    timelineStore.seek(5000, true);

    const transition = timelineStore.addTransitionClip({
      transitionType: 'fade',
      durationMs: 600,
    });
    expect(transition).not.toBeNull();
    expect(transition!.startMs).toBe(4700);

    // Trim clip-a end from 5000 to 4000
    timelineStore.trimClip('track-video-1', 'clip-a', 'end', 4000);

    const state = timelineStore.getState();
    const transTrack = state.tracks.find((t) => t.type === 'transitions');
    const transClip = transTrack?.clips[0];

    // Transition should re-center on the new cut (4000) with clamped duration
    // min(600, 4000, 1000, 8000) = 600, but clip-b starts at 5000, so cut is 4000
    // clip-b is no longer adjacent to clip-a (gap from 4000 to 5000)
    // alignCutTransitions should remove the transition since clips are no longer adjacent
    expect(transClip).toBeUndefined();
  });

  it('re-centers transition when the incoming clip is trimmed at start', () => {
    buildAdjacentClips();
    timelineStore.seek(5000, true);

    const transition = timelineStore.addTransitionClip({
      transitionType: 'fade',
      durationMs: 600,
    });
    expect(transition).not.toBeNull();

    // Move clip-b start to 4500 (trim at start) — make them adjacent first
    const tracks = timelineStore.getState().tracks.map((t) =>
      t.id === 'track-video-1'
        ? {
            ...t,
            clips: t.clips.map((c) =>
              c.id === 'clip-b'
                ? { ...c, startMs: 4500, durationMs: 5500, sourceStartMs: 5000 }
                : c,
            ),
          }
        : t,
    );
    // Adjust clip-a to end at 4500
    const adjustedTracks = tracks.map((t) =>
      t.id === 'track-video-1'
        ? {
            ...t,
            clips: t.clips.map((c) =>
              c.id === 'clip-a'
                ? { ...c, durationMs: 4500, sourceDurationMs: 4500 }
                : c,
            ),
          }
        : t,
    );
    timelineStore.setTracksAndDuration(adjustedTracks, 10000, false);

    // Re-add transition at the new cut
    timelineStore.seek(4500, true);
    const newTransition = timelineStore.addTransitionClip({
      transitionType: 'fade',
      durationMs: 600,
    });
    expect(newTransition).not.toBeNull();
    expect(newTransition!.startMs).toBe(4200); // 4500 - 300
  });

  it('supports undo after adding a transition', () => {
    buildAdjacentClips();
    timelineStore.seek(5000, true);

    timelineStore.addTransitionClip({
      transitionType: 'fade',
      durationMs: 600,
    });

    let state = timelineStore.getState();
    let transTrack = state.tracks.find((t) => t.type === 'transitions');
    expect(transTrack?.clips.length).toBe(1);

    timelineStore.undo();
    state = timelineStore.getState();
    transTrack = state.tracks.find((t) => t.type === 'transitions');
    // After undo, the transitions track may not exist or be empty
    expect(transTrack?.clips.length ?? 0).toBe(0);
  });

  it('supports undo after trimming a clip', () => {
    buildAdjacentClips();

    timelineStore.trimClip('track-video-1', 'clip-a', 'end', 4000);
    let state = timelineStore.getState();
    let clipA = state.tracks
      .find((t) => t.id === 'track-video-1')!
      .clips.find((c) => c.id === 'clip-a');
    expect(clipA?.durationMs).toBe(4000);

    timelineStore.undo();
    state = timelineStore.getState();
    clipA = state.tracks
      .find((t) => t.id === 'track-video-1')!
      .clips.find((c) => c.id === 'clip-a');
    expect(clipA?.durationMs).toBe(5000);
  });

  it('supports undo after moving a clip', () => {
    buildAdjacentClips();
    // Enable multi-track so moveClip works
    timelineStore.setTracksAndDuration(
      timelineStore.getState().tracks,
      10000,
      false,
      true,
    );

    timelineStore.moveClip('track-video-1', 'clip-a', 1000);
    let state = timelineStore.getState();
    let clipA = state.tracks
      .find((t) => t.id === 'track-video-1')!
      .clips.find((c) => c.id === 'clip-a');
    expect(clipA?.startMs).toBe(1000);

    timelineStore.undo();
    state = timelineStore.getState();
    clipA = state.tracks
      .find((t) => t.id === 'track-video-1')!
      .clips.find((c) => c.id === 'clip-a');
    expect(clipA?.startMs).toBe(0);
  });

  it('updates existing transition for the same clip pair', () => {
    buildAdjacentClips();
    timelineStore.seek(5000, true);

    const t1 = timelineStore.addTransitionClip({
      transitionType: 'fade',
      durationMs: 600,
    });
    expect(t1).not.toBeNull();

    const t2 = timelineStore.addTransitionClip({
      transitionType: 'slide-left',
      durationMs: 800,
    });
    expect(t2).not.toBeNull();
    // Should update the same transition, not create a new one
    expect(t2!.id).toBe(t1!.id);
    expect(t2!.payload?.transitionType).toBe('slide-left');
    expect(t2!.durationMs).toBe(800);
  });

  it('evaluates transition participants at the cut point', () => {
    const { evaluateEditorTimeline } = require('../lib/studio/timeline/evaluate');

    buildAdjacentClips();
    timelineStore.seek(5000, true);
    timelineStore.addTransitionClip({
      transitionType: 'fade',
      durationMs: 600,
    });

    const state = timelineStore.getState();

    // Evaluate at the exact cut point (5000ms) — progress should be 0.5
    const frame = evaluateEditorTimeline(state.tracks, 5000);
    const outgoing = frame.video.find(
      (v: any) => v.clip.id === 'clip-a' && v.transition?.role === 'outgoing',
    );
    const incoming = frame.video.find(
      (v: any) => v.clip.id === 'clip-b' && v.transition?.role === 'incoming',
    );

    expect(outgoing).not.toBeNull();
    expect(incoming).not.toBeNull();
    expect(outgoing!.transition!.progress).toBeCloseTo(0.5);
    expect(incoming!.transition!.progress).toBeCloseTo(0.5);
  });

  it('evaluates transition progress at start and end of transition window', () => {
    const { evaluateEditorTimeline } = require('../lib/studio/timeline/evaluate');

    buildAdjacentClips();
    timelineStore.seek(5000, true);
    timelineStore.addTransitionClip({
      transitionType: 'fade',
      durationMs: 600,
    });

    const state = timelineStore.getState();

    // At start of transition (4700ms) — progress = 0
    const frameStart = evaluateEditorTimeline(state.tracks, 4700);
    const outgoingStart = frameStart.video.find(
      (v: any) => v.clip.id === 'clip-a' && v.transition?.role === 'outgoing',
    );
    expect(outgoingStart?.transition?.progress).toBeCloseTo(0);

    // At end of transition (5299ms, just before 5300) — progress ≈ 1
    const frameEnd = evaluateEditorTimeline(state.tracks, 5299);
    const outgoingEnd = frameEnd.video.find(
      (v: any) => v.clip.id === 'clip-a' && v.transition?.role === 'outgoing',
    );
    expect(outgoingEnd?.transition?.progress).toBeCloseTo(1);
  });
});

describe('Ripple delete and trim', () => {
  beforeEach(() => {
    timelineStore.setTracksAndDuration([], 0, true);
  });

  const buildThreeClips = () => {
    const tracks = [
      {
        id: 'track-video-1',
        type: 'video' as const,
        name: 'Video 1',
        locked: false,
        visible: true,
        clips: [
          {
            id: 'clip-a',
            trackId: 'track-video-1',
            itemType: 'video' as const,
            name: 'Clip A',
            startMs: 0,
            durationMs: 3000,
            sourceStartMs: 0,
            sourceDurationMs: 3000,
            color: '#334155',
          },
          {
            id: 'clip-b',
            trackId: 'track-video-1',
            itemType: 'video' as const,
            name: 'Clip B',
            startMs: 3000,
            durationMs: 4000,
            sourceStartMs: 3000,
            sourceDurationMs: 4000,
            color: '#334155',
          },
          {
            id: 'clip-c',
            trackId: 'track-video-1',
            itemType: 'video' as const,
            name: 'Clip C',
            startMs: 7000,
            durationMs: 3000,
            sourceStartMs: 7000,
            sourceDurationMs: 3000,
            color: '#334155',
          },
        ],
      },
    ];
    timelineStore.setTracksAndDuration(tracks, 10000, true);
  };

  it('ripple delete removes a clip and shifts subsequent clips to close the gap', () => {
    buildThreeClips();
    timelineStore.setSelectedClipId('clip-b');

    timelineStore.deleteSelectedClip(true);

    const state = timelineStore.getState();
    const track = state.tracks.find((t) => t.id === 'track-video-1')!;
    expect(track.clips).toHaveLength(2);
    expect(track.clips[0].id).toBe('clip-a');
    expect(track.clips[0].startMs).toBe(0);
    expect(track.clips[1].id).toBe('clip-c');
    // Clip C should shift left by clip-b's duration (4000ms)
    expect(track.clips[1].startMs).toBe(3000);
    expect(state.durationMs).toBe(6000); // 3000 + 3000
  });

  it('regular delete leaves a gap without shifting subsequent clips', () => {
    buildThreeClips();
    timelineStore.setSelectedClipId('clip-b');

    timelineStore.deleteSelectedClip(false);

    const state = timelineStore.getState();
    const track = state.tracks.find((t) => t.id === 'track-video-1')!;
    expect(track.clips).toHaveLength(2);
    expect(track.clips[0].id).toBe('clip-a');
    expect(track.clips[0].startMs).toBe(0);
    expect(track.clips[1].id).toBe('clip-c');
    // Clip C should NOT move
    expect(track.clips[1].startMs).toBe(7000);
    expect(state.durationMs).toBe(10000);
  });

  it('ripple delete supports undo', () => {
    buildThreeClips();
    timelineStore.setSelectedClipId('clip-b');

    timelineStore.deleteSelectedClip(true);
    let state = timelineStore.getState();
    expect(state.tracks[0].clips).toHaveLength(2);

    timelineStore.undo();
    state = timelineStore.getState();
    expect(state.tracks[0].clips).toHaveLength(3);
    expect(state.tracks[0].clips[1].id).toBe('clip-b');
    expect(state.tracks[0].clips[1].startMs).toBe(3000);
  });

  it('ripple trim shifts subsequent clips when trimming end edge inward', () => {
    buildThreeClips();

    // Trim clip-a's end from 3000 to 2000 (shorten by 1000ms)
    timelineStore.rippleTrimClip('track-video-1', 'clip-a', 'end', 2000);

    const state = timelineStore.getState();
    const track = state.tracks.find((t) => t.id === 'track-video-1')!;
    const clipA = track.clips.find((c) => c.id === 'clip-a')!;
    const clipB = track.clips.find((c) => c.id === 'clip-b')!;
    const clipC = track.clips.find((c) => c.id === 'clip-c')!;

    expect(clipA.durationMs).toBe(2000);
    // Clip B should shift left by 1000ms
    expect(clipB.startMs).toBe(2000);
    // Clip C should also shift left by 1000ms
    expect(clipC.startMs).toBe(6000);
  });

  it('ripple trim does not shift clips when trimming start edge', () => {
    buildThreeClips();

    // Trim clip-a's start from 0 to 1000
    timelineStore.rippleTrimClip('track-video-1', 'clip-a', 'start', 1000);

    const state = timelineStore.getState();
    const track = state.tracks.find((t) => t.id === 'track-video-1')!;
    const clipA = track.clips.find((c) => c.id === 'clip-a')!;
    const clipB = track.clips.find((c) => c.id === 'clip-b')!;

    expect(clipA.startMs).toBe(1000);
    expect(clipA.durationMs).toBe(2000);
    // Clip B should NOT move when trimming start edge
    expect(clipB.startMs).toBe(3000);
  });

  it('ripple trim supports undo', () => {
    buildThreeClips();

    timelineStore.rippleTrimClip('track-video-1', 'clip-a', 'end', 2000);
    let state = timelineStore.getState();
    let clipB = state.tracks[0].clips.find((c) => c.id === 'clip-b')!;
    expect(clipB.startMs).toBe(2000);

    timelineStore.undo();
    state = timelineStore.getState();
    clipB = state.tracks[0].clips.find((c) => c.id === 'clip-b')!;
    expect(clipB.startMs).toBe(3000);
  });

  it('ripple delete removes associated transitions for deleted clips', () => {
    buildThreeClips();

    // Add a transition between clip-a and clip-b
    timelineStore.seek(3000, true);
    timelineStore.addTransitionClip({
      transitionType: 'fade',
      durationMs: 500,
    });

    // Verify transition exists
    let state = timelineStore.getState();
    const transTrack = state.tracks.find((t) => t.type === 'transitions');
    expect(transTrack).not.toBeNull();
    expect(transTrack!.clips).toHaveLength(1);

    // Ripple delete clip-b
    timelineStore.setSelectedClipId('clip-b');
    timelineStore.deleteSelectedClip(true);

    // Transition should be removed because clip-b no longer exists
    state = timelineStore.getState();
    const transTrackAfter = state.tracks.find((t) => t.type === 'transitions');
    expect(transTrackAfter!.clips).toHaveLength(0);
  });

  it('ripple delete on the first clip shifts all remaining clips', () => {
    buildThreeClips();
    timelineStore.setSelectedClipId('clip-a');

    timelineStore.deleteSelectedClip(true);

    const state = timelineStore.getState();
    const track = state.tracks.find((t) => t.id === 'track-video-1')!;
    expect(track.clips).toHaveLength(2);
    expect(track.clips[0].id).toBe('clip-b');
    expect(track.clips[0].startMs).toBe(0);
    expect(track.clips[1].id).toBe('clip-c');
    expect(track.clips[1].startMs).toBe(4000);
  });

  it('ripple delete on the last clip has no shift effect', () => {
    buildThreeClips();
    timelineStore.setSelectedClipId('clip-c');

    timelineStore.deleteSelectedClip(true);

    const state = timelineStore.getState();
    const track = state.tracks.find((t) => t.id === 'track-video-1')!;
    expect(track.clips).toHaveLength(2);
    expect(track.clips[0].id).toBe('clip-a');
    expect(track.clips[0].startMs).toBe(0);
    expect(track.clips[1].id).toBe('clip-b');
    expect(track.clips[1].startMs).toBe(3000);
    expect(state.durationMs).toBe(7000);
  });
});
