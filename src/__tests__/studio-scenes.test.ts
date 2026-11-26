/**
 * __tests__/studio-scenes.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Scene scopes and master-story timing. These helpers are shared by the editor,
 * the story strip and the export renderer, so the invariants are pinned here.
 */

import {
  cloneStudioScene,
  createStudioSceneFromTemplate,
  getActiveStudioScene,
  getStudioScenes,
  projectStudioScene,
  resolveStudioSequence,
  reorderStudioScenes,
  sampleStudioSequence,
  studioSceneFromTake,
} from '../lib/studio/scenes';
import { DEFAULT_STUDIO_STYLING } from '../lib/studio/styling';
import type { StudioTake, StudioTrack } from '../lib/studio/types';

function makeTake(overrides: Partial<StudioTake> = {}): StudioTake {
  return {
    id: 'take-1',
    projectId: null,
    title: 'Demo',
    description: null,
    sourceType: 'screen',
    sourceName: 'Display',
    durationMs: 10000,
    videoPath: '/tmp/demo.mp4',
    audioPath: null,
    mouseEventsPath: null,
    cuts: [],
    zooms: [],
    captions: [],
    effects: [],
    overlays: [],
    styling: DEFAULT_STUDIO_STYLING,
    socialKit: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

const textTracks: StudioTrack[] = [
  {
    id: 'layer-text',
    name: 'Text & Captions',
    type: 'captions',
    locked: false,
    visible: true,
    clips: [
      {
        id: 'clip-a',
        trackId: 'layer-text',
        itemType: 'text',
        name: 'Hello',
        startMs: 0,
        durationMs: 2000,
        sourceInMs: 0,
        payload: { text: 'Hello' },
      },
    ],
  },
];

describe('studio scenes', () => {
  it('treats a legacy project as one implicit scene without mutating it', () => {
    const take = makeTake();

    const scenes = getStudioScenes(take);

    expect(take.scenes).toBeUndefined();
    expect(scenes).toHaveLength(1);
    expect(scenes[0].id).toBe('scene-main');
    expect(scenes[0].videoPath).toBe('/tmp/demo.mp4');
    expect(scenes[0].durationMs).toBe(10000);
  });

  it('projects scene content without stealing the project recording', () => {
    const take = makeTake({
      scenes: [
        {
          id: 'scene-main',
          name: 'Main',
          durationMs: 4000,
          videoPath: '/tmp/demo.mp4',
          tracks: textTracks,
        },
        {
          id: 'scene-title',
          name: 'Title',
          durationMs: 2000,
          tracks: [],
        },
      ],
      activeSceneId: 'scene-title',
    });

    const active = getActiveStudioScene(take);
    const projected = projectStudioScene(take, active);

    expect(projected.activeSceneId).toBe('scene-title');
    expect(projected.videoPath).toBe('');
    expect(projected.tracks).toEqual([]);
    // The project-level recording stays available for the main scene.
    expect(take.videoPath).toBe('/tmp/demo.mp4');
  });

  it('concatenates scenes in array order when no explicit sequence exists', () => {
    const take = makeTake({
      scenes: [
        { id: 'a', name: 'A', durationMs: 1000, tracks: [] },
        { id: 'b', name: 'B', durationMs: 2500, tracks: [] },
        { id: 'c', name: 'C', durationMs: 1500, tracks: [] },
      ],
    });

    const sequence = resolveStudioSequence(take);

    expect(sequence.durationMs).toBe(5000);
    expect(sequence.items.map((item) => item.startMs)).toEqual([0, 1000, 3500]);
    expect(sequence.items.map((item) => item.sceneId)).toEqual(['a', 'b', 'c']);
  });

  it('resolves a story time to the active scene and local time', () => {
    const take = makeTake({
      scenes: [
        { id: 'a', name: 'A', durationMs: 1000, tracks: [] },
        { id: 'b', name: 'B', durationMs: 2500, tracks: [] },
      ],
    });

    const frame = sampleStudioSequence(take, 1800);

    expect(frame.layers).toHaveLength(1);
    expect(frame.layers[0].scene.id).toBe('b');
    expect(frame.layers[0].sceneTimeMs).toBe(800);
  });

  it('clones a scene with fresh track and clip ids', () => {
    const source = studioSceneFromTake(makeTake({ tracks: textTracks }));
    const clone = cloneStudioScene(source, 'Copy');

    expect(clone.id).not.toBe(source.id);
    expect(clone.name).toBe('Copy');
    expect(clone.tracks?.[0].id).not.toBe('layer-text');
    expect(clone.tracks?.[0].clips[0].id).not.toBe('clip-a');
    expect(clone.tracks?.[0].clips[0].trackId).toBe(clone.tracks?.[0].id);
  });

  it('reorders scenes, which is the implicit story order', () => {
    const take = makeTake({
      scenes: [
        { id: 'a', name: 'A', durationMs: 1000, tracks: [] },
        { id: 'b', name: 'B', durationMs: 1000, tracks: [] },
        { id: 'c', name: 'C', durationMs: 1000, tracks: [] },
      ],
    });

    const next = reorderStudioScenes(take, 0, 2);

    expect(next.scenes?.map((scene) => scene.id)).toEqual(['b', 'c', 'a']);
    expect(resolveStudioSequence(next).items.map((item) => item.sceneId)).toEqual([
      'b',
      'c',
      'a',
    ]);
  });

  it('creates intro and outro template scenes with real text clips', () => {
    const intro = createStudioSceneFromTemplate('intro', 'Intro');
    const outro = createStudioSceneFromTemplate('outro', 'Outro');

    expect(intro.durationMs).toBe(3000);
    expect(intro.tracks?.[0].type).toBe('captions');
    expect(intro.tracks?.[0].clips.length).toBeGreaterThan(0);
    expect(intro.tracks?.[0].clips[0].payload?.text).toBeTruthy();
    expect(outro.tracks?.[0].clips[0].payload?.text).toBeTruthy();
  });
});