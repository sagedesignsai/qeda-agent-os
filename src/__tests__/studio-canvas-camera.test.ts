/**
 * __tests__/studio-canvas-camera.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The timeline zoom clips drive a global canvas camera: the composed frame is
 * scaled/panned as a whole. These tests pin the transform and its clamping.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { renderStudioFrame } from '../lib/studio/render/frame-renderer';
import { drawStudioFrame } from '../lib/studio/render/compose';
import { IDLE_CAMERA } from '../lib/studio/render/camera';
import { DEFAULT_STUDIO_STYLING } from '../lib/studio/styling';

jest.mock('../lib/studio/render/display-list-flag', () => ({
  isDisplayListRendererEnabled: () => false,
}));

jest.mock('../lib/studio/render/compose', () => ({
  drawStudioFrame: jest.fn(),
}));

const mockedDrawStudioFrame = drawStudioFrame as jest.MockedFunction<
  typeof drawStudioFrame
>;

function makeInput() {
  return {
    width: 1000,
    height: 562,
    styling: DEFAULT_STUDIO_STYLING,
    timeMs: 0,
    video: null,
    videoReady: false,
    camera: IDLE_CAMERA,
    effects: [],
    captions: [],
    overlays: [],
    overlayAssets: new Map(),
  };
}

function makeCtx() {
  return {
    save: jest.fn(),
    restore: jest.fn(),
    translate: jest.fn(),
    scale: jest.fn(),
    clearRect: jest.fn(),
    fillRect: jest.fn(),
  } as unknown as CanvasRenderingContext2D & {
    save: jest.Mock;
    restore: jest.Mock;
    translate: jest.Mock;
    scale: jest.Mock;
  };
}

describe('global canvas camera', () => {
  beforeEach(() => {
    mockedDrawStudioFrame.mockClear();
  });

  it('scales and pans the whole composed frame around the canvas centre', () => {
    const ctx = makeCtx();

    renderStudioFrame(ctx, {
      ...makeInput(),
      canvasCamera: { scale: 2, panX: 0.25, panY: 0.5 },
    });

    expect(ctx.save).toHaveBeenCalledTimes(1);
    expect(ctx.translate).toHaveBeenNthCalledWith(1, 500, 281);
    expect(ctx.scale).toHaveBeenCalledWith(2, 2);
    expect(ctx.translate).toHaveBeenNthCalledWith(2, -250, -281);
    expect(mockedDrawStudioFrame).toHaveBeenCalledTimes(1);
    expect(ctx.restore).toHaveBeenCalledTimes(1);
  });

  it('clamps the pan so a zoom never exposes an empty canvas edge', () => {
    const ctx = makeCtx();

    renderStudioFrame(ctx, {
      ...makeInput(),
      // 0.1 would leave a gap at 2x; the camera clamps to 0.25.
      canvasCamera: { scale: 2, panX: 0.1, panY: 0.9 },
    });

    expect(ctx.translate).toHaveBeenNthCalledWith(2, -250, -421.5);
  });

  it('leaves the frame untouched at 1x', () => {
    const ctx = makeCtx();

    renderStudioFrame(ctx, {
      ...makeInput(),
      canvasCamera: { ...IDLE_CAMERA },
    });

    expect(ctx.save).not.toHaveBeenCalled();
    expect(ctx.scale).not.toHaveBeenCalled();
    expect(mockedDrawStudioFrame).toHaveBeenCalledTimes(1);
  });
});