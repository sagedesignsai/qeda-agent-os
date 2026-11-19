import {
  addStudioCompositionEffect,
  createStudioCompositionDocument,
  updateStudioCompositionLayer,
} from '../lib/studio/composition';
import { drawStudioCompositionFrame } from '../lib/studio/render/composition';
import { renderStudioCompositionVideo } from '../lib/studio/render/composition-export';
import type { StudioComposition } from '../lib/studio/types';

describe('Studio composition frame rendering', () => {
  it('draws active canvas effects above the composed media frame', () => {
    const composition = addStudioCompositionEffect(
      createStudioCompositionDocument({
        sceneId: 'app-spotlight',
        takes: [{ id: 'source', title: 'Source', durationMs: 1000 }],
      }),
      'vignette',
    );
    const gradient = { addColorStop: jest.fn() };
    const createRadialGradient = jest.fn(() => gradient);
    const drawImage = jest.fn();
    const ctx = {
      clearRect: jest.fn(),
      fillRect: jest.fn(),
      save: jest.fn(),
      beginPath: jest.fn(),
      roundRect: jest.fn(),
      clip: jest.fn(),
      drawImage,
      restore: jest.fn(),
      createRadialGradient,
    } as unknown as CanvasRenderingContext2D;

    drawStudioCompositionFrame({
      ctx,
      document: composition,
      width: 1000,
      height: 562,
      timeMs: 0,
      media: new Map([
        [
          composition.layers[0].id,
          {
            element: {} as unknown as CanvasImageSource,
            width: 1000,
            height: 562,
          },
        ],
      ]),
    });

    expect(createRadialGradient).toHaveBeenCalledWith(
      500,
      281,
      expect.any(Number),
      500,
      281,
      expect.any(Number),
    );
    expect(gradient.addColorStop).toHaveBeenCalledTimes(2);
    expect(drawImage.mock.invocationCallOrder[0]).toBeLessThan(
      createRadialGradient.mock.invocationCallOrder[0],
    );
  });

  it('renders layer motion through the shared composition frame renderer', () => {
    const composition = createStudioCompositionDocument({
      sceneId: 'app-spotlight',
      takes: [{ id: 'source', title: 'Source', durationMs: 1000 }],
    });
    const layer = composition.layers[0];
    const document = updateStudioCompositionLayer(
      composition,
      layer.id,
      { transitionIn: { type: 'slide-left', durationMs: 500 } },
    );
    const roundRect = jest.fn();
    const ctx = {
      clearRect: jest.fn(),
      fillRect: jest.fn(),
      save: jest.fn(),
      beginPath: jest.fn(),
      roundRect,
      clip: jest.fn(),
      drawImage: jest.fn(),
      restore: jest.fn(),
    } as unknown as CanvasRenderingContext2D;

    drawStudioCompositionFrame({
      ctx,
      document,
      width: 1000,
      height: 562,
      timeMs: 0,
      media: new Map([
        [
          layer.id,
          {
            element: {} as unknown as CanvasImageSource,
            width: 1000,
            height: 562,
          },
        ],
      ]),
    });

    const layout = layer.layouts['16:9'];
    expect(roundRect.mock.calls[0][0]).toBeCloseTo(
      (layout.x - layout.width) * 1000,
    );
  });

  it('draws visible layers in z-order and skips layers outside their time range', () => {
    const composition = createStudioCompositionDocument({
      sceneId: 'desktop-mobile-comparison',
      takes: [
        { id: 'desktop', title: 'Desktop', durationMs: 12000 },
        { id: 'mobile', title: 'Mobile', durationMs: 9000 },
      ],
    });
    const [desktop, mobile] = composition.layers;
    const document = {
      ...composition,
      layers: [
        { ...desktop, zIndex: 2 },
        { ...mobile, zIndex: 0, endMs: 4000 },
      ],
    };
    const drawImage = jest.fn();
    const ctx = {
      clearRect: jest.fn(),
      fillRect: jest.fn(),
      save: jest.fn(),
      beginPath: jest.fn(),
      roundRect: jest.fn(),
      clip: jest.fn(),
      drawImage,
      restore: jest.fn(),
    } as unknown as CanvasRenderingContext2D;
    const media = new Map([
      [
        desktop.id,
        {
          element: { source: 'desktop' } as unknown as CanvasImageSource,
          width: 1920,
          height: 1080,
        },
      ],
      [
        mobile.id,
        {
          element: { source: 'mobile' } as unknown as CanvasImageSource,
          width: 1080,
          height: 1920,
        },
      ],
    ]);

    drawStudioCompositionFrame({
      ctx,
      document,
      width: 1920,
      height: 1080,
      timeMs: 1000,
      media,
    });
    expect(drawImage.mock.calls.map(([element]) => element)).toEqual([
      media.get(mobile.id)?.element,
      media.get(desktop.id)?.element,
    ]);

    drawImage.mockClear();
    drawStudioCompositionFrame({
      ctx,
      document,
      width: 1920,
      height: 1080,
      timeMs: 5000,
      media,
    });
    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(drawImage.mock.calls[0][0]).toBe(media.get(desktop.id)?.element);
  });

  it('rejects exporting a composition with no media layers', async () => {
    const composition: StudioComposition = {
      id: 'empty-composition',
      projectId: null,
      title: 'Empty',
      document: {
        ...createStudioCompositionDocument({
          sceneId: 'app-spotlight',
          takes: [{ id: 'source', title: 'Source', durationMs: 1000 }],
        }),
        layers: [],
        audioSourceLayerId: null,
      },
      createdAt: 0,
      updatedAt: 0,
    };

    await expect(renderStudioCompositionVideo(composition)).rejects.toThrow(
      'Add at least one media layer before exporting.',
    );
  });
});
