import {
  applyShowcasePreset,
  getShowcasePreset,
  listShowcasePresets,
  parseShowcasePreset,
  SHOWCASE_PRESETS,
} from '../lib/studio/showcase-presets';
import { DEFAULT_STUDIO_STYLING, type StudioTake } from '../lib/studio-types';

function legacyTake(overrides: Partial<StudioTake> = {}): StudioTake {
  return {
    id: 'take-preset',
    projectId: null,
    title: 'Legacy recording',
    description: null,
    sourceType: 'screen',
    sourceName: null,
    durationMs: 60_000,
    videoPath: '/tmp/legacy.mp4',
    audioPath: '/tmp/legacy.wav',
    mouseEventsPath: null,
    cuts: [{ id: 'cut-1', startMs: 1000, endMs: 2000 }],
    zooms: [
      {
        id: 'zoom-1',
        startMs: 1000,
        endMs: 3000,
        targetX: 0.5,
        targetY: 0.5,
        scale: 1.4,
      },
    ],
    captions: [
      { id: 'caption-legacy', startMs: 0, endMs: 2000, text: 'Legacy caption' },
    ],
    effects: [
      {
        id: 'fx-legacy',
        type: 'vignette',
        startMs: 0,
        endMs: 5000,
        intensity: 0.4,
      },
    ],
    overlays: [
      {
        id: 'overlay-legacy',
        kind: 'image',
        srcPath: '/tmp/logo.png',
        startMs: 0,
        endMs: 2000,
        x: 0.5,
        y: 0.5,
        widthPct: 0.2,
        opacity: 1,
        rotation: 0,
        cornerRadius: 8,
      },
    ],
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

function videoClips(take: StudioTake) {
  return allClips(take).filter((clip) => clip.itemType === 'video');
}

function captionClips(take: StudioTake) {
  return allClips(take).filter((clip) => clip.itemType === 'text');
}

const recordings = [
  { path: '/tmp/one.mp4', name: 'One', durationMs: 20_000 },
  { path: '/tmp/two.mp4', name: 'Two', durationMs: 20_000 },
  { path: '/tmp/three.mp4', name: 'Three', durationMs: 20_000 },
];

describe('showcase preset catalog', () => {
  it('exposes a unique, validated catalog with summaries', () => {
    const ids = SHOWCASE_PRESETS.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(SHOWCASE_PRESETS.length).toBeGreaterThanOrEqual(4);

    const summaries = listShowcasePresets();
    expect(summaries).toHaveLength(SHOWCASE_PRESETS.length);
    for (const summary of summaries) {
      expect(summary.slots.length).toBeGreaterThan(0);
      expect(summary.segments.some((segment) => segment.role === 'recording')).toBe(
        true,
      );
      expect(summary.variants.length).toBeGreaterThan(0);
      expect(getShowcasePreset(summary.id)?.title).toBe(summary.title);
    }

    const product = getShowcasePreset('product-demo-60')!;
    expect(product.requiredRecordings).toBe(3);
    expect(product.aspectRatio).toBe('16:9');
    expect(product.effectStack.map((effect) => effect.type)).toEqual([
      'spotlight',
      'vignette',
    ]);
  });

  it('rejects copy that references an undeclared slot', () => {
    const base = SHOWCASE_PRESETS[0];
    expect(() =>
      parseShowcasePreset({
        ...base,
        slots: base.slots.filter((slot) => slot.key !== 'productName'),
      }),
    ).toThrow(/undeclared slot/);
  });

  it('rejects recording indexes outside the required recordings', () => {
    const base = SHOWCASE_PRESETS[0];
    expect(() =>
      parseShowcasePreset({
        ...base,
        segments: [
          {
            ...base.segments.find((segment) => segment.role === 'recording')!,
            recordingIndex: 9,
          },
        ],
      }),
    ).toThrow(/outside the 3 required recordings/);
  });
});

describe('applyShowcasePreset', () => {
  it('builds an editable product demo and replaces the legacy timeline', () => {
    const result = applyShowcasePreset(legacyTake(), {
      presetId: 'product-demo-60',
      slots: { productName: 'Acme Cloud', cta: 'Try Acme free' },
      recordings,
    });

    expect(result.error).toBeUndefined();
    const { take, applied } = result;
    expect(applied).toBeDefined();
    expect(applied!.videoClipIds).toHaveLength(3);
    expect(applied!.captionClipIds).toHaveLength(5);
    expect(applied!.durationMs).toBe(53_000);

    // The preset replaces the old timeline but keeps the media pool.
    expect(take.tracks).toHaveLength(2);
    expect(take.mediaAssets).toHaveLength(3);
    expect(take.cuts).toEqual([]);
    expect(take.zooms).toEqual([]);
    expect(take.captions).toEqual([]);
    expect(take.effects).toEqual([]);
    expect(take.overlays).toEqual([]);
    expect(take.styling.aspectRatio).toBe('16:9');
    expect(take.styling.captionStyle).toBe('badge');
    expect(take.styling.canvasMode).toBe('showcase');

    const videos = videoClips(take);
    expect(videos.map((clip) => clip.startMs)).toEqual([5_000, 19_000, 33_000]);
    expect(videos.every((clip) => clip.durationMs === 14_000)).toBe(true);
    expect(videos.every((clip) => clip.enterAnimation?.type === 'fade')).toBe(
      true,
    );
    expect(videos.every((clip) => clip.deviceFrame?.type === 'browser')).toBe(
      true,
    );

    for (const clip of videos) {
      expect(clip.payload?.effects).toHaveLength(2);
      const spotlight = clip.payload!.effects!.find(
        (effect) => effect.type === 'spotlight',
      )!;
      const effectKeyframes = (clip.payload?.keyframes ?? []).filter((keyframe) =>
        keyframe.property.startsWith(`effect:${spotlight.id}:intensity`),
      );
      expect(effectKeyframes.map((keyframe) => keyframe.value)).toEqual([
        0, 0.34, 0.34, 0,
      ]);
    }

    const texts = captionClips(take).map((clip) => clip.payload?.text);
    expect(texts).toHaveLength(5);
    expect(texts[0]).toBe('Meet Acme Cloud');
    expect(texts[4]).toBe('Try Acme free');
  });

  it('fills defaults and reports the suggested variants', () => {
    const result = applyShowcasePreset(legacyTake(), {
      presetId: 'mobile-app-preview',
      recordings: recordings.slice(0, 2),
    });

    expect(result.error).toBeUndefined();
    const { take, applied } = result;
    expect(take.styling.aspectRatio).toBe('9:16');
    expect(videoClips(take)).toHaveLength(2);
    expect(videoClips(take).every((clip) => clip.deviceFrame?.type === 'iphone')).toBe(
      true,
    );
    expect(captionClips(take)[0].payload?.text).toBe('Our app');
    expect(applied!.variants.map((variant) => variant.id)).toContain('app-store');
  });

  it('reuses one recording for multiple beats with source offsets', () => {
    const result = applyShowcasePreset(legacyTake(), {
      presetId: 'tutorial-walkthrough',
      recordings: [
        { path: '/tmp/tutorial.mp4', name: 'Tutorial', durationMs: 60_000 },
      ],
    });

    expect(result.error).toBeUndefined();
    const videos = videoClips(result.take);
    expect(videos).toHaveLength(2);
    expect(videos.map((clip) => clip.sourceInMs)).toEqual([0, 22_000]);
    expect(result.applied!.recordings).toHaveLength(1);
  });

  it('trims beats to the available source and warns', () => {
    const result = applyShowcasePreset(legacyTake(), {
      presetId: 'product-demo-60',
      recordings: [
        { path: '/tmp/short.mp4', name: 'Short', durationMs: 9_000 },
        { path: '/tmp/short-2.mp4', name: 'Short 2', durationMs: 9_000 },
        { path: '/tmp/short-3.mp4', name: 'Short 3', durationMs: 9_000 },
      ],
    });

    expect(result.error).toBeUndefined();
    expect(result.applied!.warnings.join(' ')).toMatch(/trimmed to 9000ms/);
    const videos = videoClips(result.take);
    expect(videos.every((clip) => clip.durationMs === 9_000)).toBe(true);
    expect(result.applied!.durationMs).toBe(5_000 + 9_000 * 3 + 6_000);
  });

  it('uses the project recording and existing video assets when none are passed', () => {
    const result = applyShowcasePreset(legacyTake(), {
      presetId: 'social-cutdown',
    });

    expect(result.error).toBeUndefined();
    expect(result.take.mediaAssets).toHaveLength(1);
    expect(videoClips(result.take)).toHaveLength(2);
    expect(result.take.styling.aspectRatio).toBe('9:16');
  });

  it('reports missing recordings and unknown presets without changing the take', () => {
    const take = legacyTake({ videoPath: '' });
    const before = JSON.stringify(take);
    const missing = applyShowcasePreset(take, {
      presetId: 'product-demo-60',
    });
    expect(missing.error).toMatch(/needs 3 recordings/);
    expect(JSON.stringify(missing.take)).toBe(before);

    const unknown = applyShowcasePreset(take, { presetId: 'nope' });
    expect(unknown.error).toMatch(/Unknown showcase preset/);
    expect(JSON.stringify(unknown.take)).toBe(before);
  });

  it('fills every slot default when none are supplied', () => {
    const result = applyShowcasePreset(legacyTake(), {
      presetId: 'social-cutdown',
      recordings: [{ path: '/tmp/social.mp4', durationMs: 30_000 }],
    });

    expect(result.error).toBeUndefined();
    expect(captionClips(result.take)[0].payload?.text).toBe(
      'Stop doing this manually',
    );
    expect(result.applied!.slots).toMatchObject({
      hook: 'Stop doing this manually',
      cta: 'Follow for more',
    });
  });
});
