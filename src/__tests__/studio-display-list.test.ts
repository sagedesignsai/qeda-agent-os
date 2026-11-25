/**
 * Display-list (Tier 2.5) contract tests.
 *
 * These run in plain jsdom with no canvas backend: `buildFrameProgram` is pure
 * data, which is the whole point of the boundary. Pixel parity is covered
 * separately by the Electron export smoke test.
 */

import {
  composeMatrices,
  rotationMatrix,
  translationMatrix,
} from '@/lib/studio/render/display-list';
import { filmGrainOffset } from '@/lib/studio/render/prng';
import { buildFrameProgram } from '@/lib/studio/render/program';
import { IDLE_CAMERA } from '@/lib/studio/render/camera';
import { applyStudioTextAnimator } from '@/lib/studio/render/text-style';
import { evaluateEditorTimeline } from '@/lib/studio/timeline/evaluate';
import type { StudioStyling, TimelineTrack } from '@/lib/studio/types';
import type { BuildFrameProgramInput } from '@/lib/studio/render/program';

const STYLING: StudioStyling = {
  canvasMode: 'showcase',
  background: '#0a0b10',
  borderRadius: 18,
  padding: 8,
  shadow: 'md',
  aspectRatio: '16:9',
  zoomIntensity: 1.5,
  cameraEasing: 'smooth',
  showCaptions: true,
  captionStyle: 'badge',
};

const ASSETS = {
  byAssetId: new Map([['asset-1', { width: 1920, height: 1080 }]]),
  byClipId: new Map([['ov-1', { width: 800, height: 600 }]]),
  recordedVideo: { width: 1920, height: 1080 },
};

const OVERLAY_RECORD = {
  id: 'ov-1',
  kind: 'image' as const,
  srcPath: '/overlay.png',
  startMs: 0,
  endMs: 5000,
  x: 0.5,
  y: 0.5,
  widthPct: 0.3,
  opacity: 0.9,
  rotation: 0,
  cornerRadius: 8,
};

function fullStackTracks(): TimelineTrack[] {
  return [
    {
      id: 'track-effects',
      type: 'effects',
      name: 'Effects',
      locked: false,
      visible: true,
      clips: [
        {
          id: 'fx-1',
          trackId: 'track-effects',
          itemType: 'effect',
          name: 'Zoom 2x',
          startMs: 0,
          durationMs: 5000,
          sourceStartMs: 0,
          sourceDurationMs: 5000,
          payload: { effectType: 'neon-glow', intensity: 0.7 },
        },
      ],
    },
    {
      id: 'track-captions',
      type: 'captions',
      name: 'Text',
      locked: false,
      visible: true,
      clips: [
        {
          id: 'cap-1',
          trackId: 'track-captions',
          itemType: 'text',
          name: 'Hello world',
          startMs: 500,
          durationMs: 3000,
          sourceStartMs: 500,
          sourceDurationMs: 3000,
          payload: { text: 'Hello world' },
        },
      ],
    },
    {
      id: 'track-overlays',
      type: 'overlays',
      name: 'Overlays',
      locked: false,
      visible: true,
      clips: [
        {
          id: 'ov-1',
          trackId: 'track-overlays',
          itemType: 'overlay',
          name: 'Image Overlay',
          startMs: 0,
          durationMs: 5000,
          sourceStartMs: 0,
          sourceDurationMs: 5000,
          payload: { kind: 'image' },
        },
      ],
    },
    {
      id: 'track-video',
      type: 'video',
      name: 'Video',
      locked: false,
      visible: true,
      clips: [
        {
          id: 'clip-1',
          trackId: 'track-video',
          itemType: 'video',
          name: 'Clip',
          startMs: 0,
          durationMs: 5000,
          sourceStartMs: 0,
          sourceDurationMs: 5000,
          payload: { mediaAssetId: 'asset-1' },
        },
      ],
    },
  ];
}

function build(
  tracks: TimelineTrack[],
  compTimeMs = 1000,
  overrides: Partial<BuildFrameProgramInput> = {},
) {
  return buildFrameProgram({
    width: 1920,
    height: 1080,
    compTimeMs,
    styling: STYLING,
    evaluatedFrame: evaluateEditorTimeline(tracks, compTimeMs),
    camera: { ...IDLE_CAMERA },
    assets: ASSETS,
    overlays: [OVERLAY_RECORD],
    overlayAssets: new Map([['ov-1', { width: 800, height: 600 }]]),
    ...overrides,
  });
}

describe('display list — ordering contract', () => {
  it('paints content, overlays, effects, chrome, then unclipped text', () => {
    const program = build(fullStackTracks());
    expect(program.ops.map((op) => op.kind)).toEqual([
      'video',
      'overlay',
      'effect',
      'chrome',
      'text',
    ]);
  });

  it('keeps effects below chrome and captions above it', () => {
    const kinds = build(fullStackTracks()).ops.map((op) => op.kind);
    expect(kinds.indexOf('effect')).toBeLessThan(kinds.indexOf('chrome'));
    expect(kinds.indexOf('chrome')).toBeLessThan(kinds.indexOf('text'));
  });

  it('clips content to the window and captions to nothing', () => {
    const ops = build(fullStackTracks()).ops;
    expect(ops[0].clip).toBe('window');
    expect(ops[1].clip).toBe('window');
    // Neon bloom would be amputated by a content clip, so it stays window
    // clipped; the rest of the canvas effects sit inside the content box.
    expect(ops[2].clip).toBe('window');
    expect(ops[3].clip).toBe('window');
    expect(ops[4].clip).toBe('none');
  });

  it('draws the window shadow and content backdrop in showcase mode', () => {
    const program = build(fullStackTracks());
    expect(program.windowFrame?.shadow).toBe(true);
    expect(program.contentBackdrop).toMatchObject({
      width: expect.any(Number),
      height: expect.any(Number),
      color: '#0b0d12',
    });
  });
});

describe('display list — determinism', () => {
  it('produces identical programs for identical inputs', () => {
    const a = JSON.stringify(build(fullStackTracks()));
    const b = JSON.stringify(build(fullStackTracks()));
    expect(a).toBe(b);
  });

  it('derives grain offsets from time, not randomness', () => {
    const first = filmGrainOffset(1000, 256);
    const again = filmGrainOffset(1000, 256);
    expect(again).toEqual(first);
    expect(filmGrainOffset(2000, 256)).not.toEqual(first);
  });
});

describe('display list — text styling', () => {
  it('builds positioned free-text ops from each clip style', () => {
    const tracks = fullStackTracks();
    const caption = tracks.find((track) => track.type === 'captions')!.clips[0];
    caption.payload = {
      ...caption.payload,
      x: 0.25,
      y: 0.75,
      transform: {
        position: { x: 12, y: -8 },
        rotation: 15,
        scale: { x: 1.2, y: 0.8 },
      },
      textStyle: {
        fontFamily: 'Georgia, serif',
        fontSize: 72,
        color: '#ff3366',
        align: 'right',
      },
    };

    const textOp = build(tracks, 1000, {
      styling: { ...STYLING, canvasMode: 'edit' },
    }).ops.find((op) => op.kind === 'text');

    expect(textOp?.layout.mode).toBe('free');
    if (textOp?.layout.mode !== 'free') return;
    expect(textOp.layout).toMatchObject({
      text: 'Hello world',
      style: {
        fontFamily: 'Georgia, serif',
        fontSize: 72,
        fill: '#ff3366',
        align: 'right',
      },
    });
    expect(textOp.transform[4]).toBe(492);
    expect(textOp.transform[5]).toBe(802);
  });

  it('keeps legacy caption styling until a clip is customized', () => {
    const textOp = build(fullStackTracks()).ops.find(
      (op) => op.kind === 'text',
    );
    expect(textOp?.layout.mode).toBe('caption');
  });

  it('retains text animation behavior for styled clips', () => {
    const caption = applyStudioTextAnimator(
      {
        id: 'caption',
        startMs: 0,
        endMs: 1000,
        text: 'Hello world',
      },
      { mode: 'typewriter', progress: 0.5 },
    );

    expect(caption.text).toBe('Hello');
  });
});

describe('display list — transitions', () => {
  const transitionTracks = (): TimelineTrack[] => [
    {
      id: 'track-transitions',
      type: 'transitions',
      name: 'Transitions',
      locked: false,
      visible: true,
      clips: [
        {
          id: 'tr-1',
          trackId: 'track-transitions',
          itemType: 'transition',
          name: 'Fade',
          startMs: 900,
          durationMs: 200,
          sourceStartMs: 900,
          sourceDurationMs: 200,
          payload: { fromClipId: 'a', toClipId: 'b', transitionType: 'fade' },
        },
      ],
    },
    {
      id: 'track-video',
      type: 'video',
      name: 'Video',
      locked: false,
      visible: true,
      clips: [
        {
          id: 'a',
          trackId: 'track-video',
          itemType: 'video',
          name: 'A',
          startMs: 0,
          durationMs: 1000,
          sourceStartMs: 0,
          sourceDurationMs: 1000,
          payload: { mediaAssetId: 'asset-1' },
        },
        {
          id: 'b',
          trackId: 'track-video',
          itemType: 'video',
          name: 'B',
          startMs: 1000,
          durationMs: 1000,
          sourceStartMs: 0,
          sourceDurationMs: 1000,
          payload: { mediaAssetId: 'asset-1' },
        },
      ],
    },
  ];

  it('holds the outgoing clip opaque while the incoming clip ramps', () => {
    const program = build(transitionTracks(), 1000);
    const videoOps = program.ops.filter((op) => op.kind === 'video');
    expect(videoOps).toHaveLength(2);
    expect(videoOps[0].opacity).toBeCloseTo(1, 5);
    expect(videoOps[1].opacity).toBeCloseTo(0.5, 5);
  });

  it('resolves a blur transition into a structured filter', () => {
    const tracks = transitionTracks();
    tracks[0].clips[0].payload = {
      fromClipId: 'a',
      toClipId: 'b',
      transitionType: 'blur',
    };
    const videoOps = build(tracks, 1000).ops.filter(
      (op) => op.kind === 'video',
    );
    // Both participants blur: the legacy renderer applies the filter to every
    // clip in the loop while a paired blur transition is active.
    expect(videoOps[0].filter?.blurPx).toBeCloseTo(12, 5);
    expect(videoOps[1].filter?.blurPx).toBeCloseTo(12, 5);
  });
});

describe('display list — time domain', () => {
  it('addresses caption spans and karaoke in composition time', () => {
    const program = build(fullStackTracks(), 1200);
    const textOp = program.ops.find((op) => op.kind === 'text');
    expect(textOp?.kind).toBe('text');
    if (textOp?.kind !== 'text' || textOp.layout.mode !== 'caption') {
      throw new Error('expected a caption text op');
    }
    expect(textOp.layout.caption.startMs).toBe(500);
    expect(textOp.layout.caption.endMs).toBe(3500);
    expect(textOp.layout.timeMs).toBe(1200);
  });

  it('carries preserved word timings onto the caption', () => {
    const tracks = fullStackTracks();
    tracks[1].clips[0].payload = {
      text: 'Hello world',
      words: [
        { word: 'Hello', startMs: 500, endMs: 1800 },
        { word: 'world', startMs: 1800, endMs: 3500 },
      ],
    };
    const textOp = build(tracks).ops.find((op) => op.kind === 'text');
    if (textOp?.kind !== 'text' || textOp.layout.mode !== 'caption') {
      throw new Error('expected a caption text op');
    }
    expect(textOp.layout.caption.words).toHaveLength(2);
  });
});

describe('display list — geometry', () => {
  it('composes affine matrices in canvas order', () => {
    const matrix = composeMatrices(
      translationMatrix(10, 20),
      rotationMatrix(Math.PI / 2),
    );
    expect(matrix[4]).toBeCloseTo(10, 6);
    expect(matrix[5]).toBeCloseTo(20, 6);
    expect(matrix[0]).toBeCloseTo(0, 6);
    expect(matrix[1]).toBeCloseTo(1, 6);
  });

  it('places a default video clip on the content centre', () => {
    const program = build(fullStackTracks());
    const videoOp = program.ops[0];
    expect(videoOp.kind).toBe('video');
    if (videoOp.kind !== 'video') return;
    const frame = program.windowFrame!;
    expect(videoOp.transform[4]).toBeCloseTo(
      frame.contentX + frame.contentWidth / 2,
      4,
    );
    expect(videoOp.transform[5]).toBeCloseTo(
      frame.contentY + frame.contentHeight / 2,
      4,
    );
  });

  it('omits chrome and shadow in the edge-to-edge edit canvas', () => {
    const program = build(fullStackTracks(), 1000, {
      styling: { ...STYLING, canvasMode: 'edit' },
    });
    expect(program.windowFrame?.shadow).toBe(false);
    expect(program.contentBackdrop).toBeUndefined();
    expect(program.ops.some((op) => op.kind === 'chrome')).toBe(false);
  });
});
