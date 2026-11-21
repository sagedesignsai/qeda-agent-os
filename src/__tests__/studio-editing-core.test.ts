import {
  addClipEffect,
  addEffectKeyframe,
  describeProject,
  materializeProjectTracks,
  moveClip,
  removeClip,
  reorderTracks,
} from '../lib/studio/editing';
import { evaluateEffectIntensity } from '../lib/studio/keyframes';
import { DEFAULT_STUDIO_STYLING, type StudioTake } from '../lib/studio-types';
import {
  convertTakeToTimeline,
  studioClipToTimelineClip,
} from '../lib/studio/timeline/convert';

function legacyTake(overrides: Partial<StudioTake> = {}): StudioTake {
  return {
    id: 'take-1',
    projectId: null,
    title: 'Demo recording',
    description: null,
    sourceType: 'screen',
    sourceName: null,
    durationMs: 10_000,
    videoPath: '/tmp/demo.mp4',
    audioPath: '/tmp/demo.wav',
    mouseEventsPath: null,
    cuts: [],
    zooms: [
      {
        id: 'zoom-1',
        startMs: 1000,
        endMs: 3000,
        targetX: 0.5,
        targetY: 0.5,
        scale: 1.5,
      },
    ],
    captions: [],
    effects: [
      {
        id: 'fx-legacy',
        type: 'vignette',
        startMs: 0,
        endMs: 5000,
        intensity: 0.4,
      },
    ],
    overlays: [],
    styling: DEFAULT_STUDIO_STYLING,
    socialKit: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function allClips(take: StudioTake) {
  return (take.tracks ?? []).flatMap((track) => track.clips);
}

describe('materializeProjectTracks', () => {
  it('projects legacy effects and zooms onto the effects lane without loss', () => {
    const project = materializeProjectTracks(legacyTake());

    expect(project.effects).toEqual([]);
    const effectsTrack = project.tracks?.find((track) => track.type === 'effects');
    expect(effectsTrack).toBeDefined();
    const ids = effectsTrack!.clips.map((clip) => clip.id);
    expect(ids).toContain('fx-legacy');
    expect(ids).toContain('zoom-1');
    expect(project.tracks?.some((track) => track.type === 'audio')).toBe(true);
  });

  it('is idempotent for an already materialized take', () => {
    const once = materializeProjectTracks(legacyTake());
    const twice = materializeProjectTracks(once);
    expect(twice).toBe(once);
  });
});

describe('clip effects', () => {
  it('adds params and keyframes intensity for a clip', () => {
    const project = materializeProjectTracks(legacyTake());
    const video = allClips(project).find((clip) => clip.itemType === 'video');
    expect(video).toBeDefined();

    const added = addClipEffect(project, video!.id, {
      type: 'spotlight',
      intensity: 0.5,
      params: { radius: 0.3 },
    });
    expect(added.error).toBeUndefined();
    expect(added.effect?.params.radius).toBe(0.3);

    const kf1 = addEffectKeyframe(added.take, video!.id, added.effect!.id, {
      timeMs: 0,
      intensity: 0,
    });
    const kf2 = addEffectKeyframe(kf1.take, video!.id, added.effect!.id, {
      timeMs: video!.durationMs,
      intensity: 1,
    });

    const clip = allClips(kf2.take).find((candidate) => candidate.id === video!.id)!;
    const keyframes = (clip.payload?.keyframes ?? []).filter(
      (keyframe) => keyframe.property === `effect:${added.effect!.id}:intensity`,
    );
    expect(keyframes).toHaveLength(2);

    const timelineClip = studioClipToTimelineClip(clip, undefined, 'video');
    const start = evaluateEffectIntensity(
      timelineClip,
      clip.payload!.effects![0],
      0,
    );
    const end = evaluateEffectIntensity(
      timelineClip,
      clip.payload!.effects![0],
      video!.durationMs,
    );
    expect(start).toBeLessThan(end);
    expect(end).toBeGreaterThan(0.5);
  });
});

describe('track and clip guards', () => {
  const project = materializeProjectTracks(legacyTake());

  it('rejects a partial track reorder', () => {
    const result = reorderTracks(project, [project.tracks![0].id]);
    expect(result.error).toMatch(/all \d+ tracks/);
  });

  it('rejects moving a video clip onto the audio lane', () => {
    const video = allClips(project).find((clip) => clip.itemType === 'video')!;
    const audio = project.tracks!.find((track) => track.type === 'audio')!;
    const result = moveClip(project, video.id, { trackId: audio.id });
    expect(result.error).toMatch(/Cannot move/);
  });

  it('describes the project with effect and clip counts', () => {
    const state = describeProject(project);
    expect(state.tracks.length).toBeGreaterThan(0);
    expect(state.tracks.flatMap((track) => track.clips).length).toBe(
      allClips(project).length,
    );
  });

  it('does not resurrect a deleted projected caption from the legacy array', () => {
    const withCaption = materializeProjectTracks(
      legacyTake({
        captions: [{ id: 'cap-1', startMs: 0, endMs: 1000, text: 'Hello' }],
      }),
    );
    expect(allClips(withCaption).some((clip) => clip.id === 'cap-1')).toBe(true);

    const removed = removeClip(withCaption, 'cap-1');
    const timeline = convertTakeToTimeline(removed.take);
    expect(
      timeline.flatMap((track) => track.clips).some((clip) => clip.id === 'cap-1'),
    ).toBe(false);
  });
});
