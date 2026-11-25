import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { StudioCommandBar } from '../components/studio/StudioCommandBar';
import { BUILTIN_STUDIO_ADDONS } from '../components/studio/addons/StudioAddonRegistry';
import {
  GENERATIVE_BACKGROUND_PRESETS,
  getBackgroundPreviewCss,
  isGenerativeBackground,
  parseGenerativeBackground,
  serializeGenerativeBackground,
} from '../lib/studio/render/background-generator';
import { drawStudioBackground } from '../lib/studio/render/background';
import { DEFAULT_STUDIO_STYLING } from '../lib/studio-types';
import type { TimelineClip, TimelineTrack } from '../lib/studio-types';

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView = jest.fn();
});

const videoClip: TimelineClip = {
  id: 'clip-video',
  trackId: 'track-video',
  itemType: 'video',
  name: 'Walkthrough',
  startMs: 0,
  durationMs: 3000,
  sourceStartMs: 0,
  sourceDurationMs: 3000,
  color: '#334155',
  payload: {},
};

const videoTrack: TimelineTrack = {
  id: 'track-video',
  name: 'Video',
  type: 'video',
  locked: false,
  visible: true,
  clips: [videoClip],
};

describe('Showcase Studio addons', () => {
  it('only offers the device mockup addon for video clips', () => {
    const addon = BUILTIN_STUDIO_ADDONS.find(
      (item) => item.scope === 'clip',
    );
    if (!addon || addon.scope !== 'clip') throw new Error('Clip addon missing');
    expect(addon.canRun(videoTrack, videoClip)).toBe(true);

    const audioTrack: TimelineTrack = {
      ...videoTrack,
      id: 'track-audio',
      type: 'audio',
      clips: [{ ...videoClip, trackId: 'track-audio', itemType: 'audio' }],
    };
    expect(addon.canRun(audioTrack, audioTrack.clips[0])).toBe(false);
  });

  it('exposes registered addons in the command bar and invokes the selected addon', () => {
    const onRunAddon = jest.fn();
    render(
      <StudioCommandBar
        open
        onOpenChange={jest.fn()}
        addons={BUILTIN_STUDIO_ADDONS}
        onRunAddon={onRunAddon}
      />,
    );

    fireEvent.click(screen.getByText('Add Device Mockup'));
    expect(onRunAddon).toHaveBeenCalledWith('clip-device-mockup');
    expect(screen.getByText('Configure Canvas Background')).toBeInTheDocument();
  });

  it('applies the selected mockup as clip data without changing global styling', () => {
    const addon = BUILTIN_STUDIO_ADDONS.find(
      (item) => item.scope === 'clip',
    );
    if (!addon || addon.scope !== 'clip') throw new Error('Clip addon missing');
    const AddonDialog = addon.Dialog;
    const onApply = jest.fn(() => true);
    const onOpenChange = jest.fn();

    render(
      <AddonDialog
        open
        clip={videoClip}
        track={videoTrack}
        videoUrl={null}
        onApply={onApply}
        onOpenChange={onOpenChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Apply to clip' }));

    expect(onApply).toHaveBeenCalledWith({
      payload: expect.objectContaining({
        deviceFrame: {
          type: 'browser',
          color: '#303541',
          padding: 8,
        },
      }),
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(DEFAULT_STUDIO_STYLING.deviceFrame?.type).toBe('none');
  });

  it('clears an existing clip frame without replacing other clip payload data', () => {
    const addon = BUILTIN_STUDIO_ADDONS.find(
      (item) => item.scope === 'clip',
    );
    if (!addon || addon.scope !== 'clip') throw new Error('Clip addon missing');
    const AddonDialog = addon.Dialog;
    const onApply = jest.fn(() => true);

    render(
      <AddonDialog
        open
        clip={{
          ...videoClip,
          payload: {
            speed: 1.5,
            deviceFrame: { type: 'iphone' },
          },
        }}
        track={videoTrack}
        videoUrl={null}
        onApply={onApply}
        onOpenChange={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remove frame' }));

    expect(onApply).toHaveBeenCalledWith({
      payload: {
        speed: 1.5,
        deviceFrame: undefined,
      },
    });
  });

  it('applies a selected canvas background through the background addon', () => {
    const addon = BUILTIN_STUDIO_ADDONS.find(
      (item) => item.scope === 'canvas',
    );
    expect(addon).toBeDefined();
    if (!addon || addon.scope !== 'canvas') return;

    const onApply = jest.fn();
    const onOpenChange = jest.fn();

    render(
      <addon.Dialog
        open
        styling={DEFAULT_STUDIO_STYLING}
        onApply={onApply}
        onOpenChange={onOpenChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Emerald Aurora' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply background' }));

    expect(onApply).toHaveBeenCalledWith(
      'linear-gradient(135deg, #064e3b 0%, #022c22 50%, #020617 100%)',
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('selects and customizes an animated generative preset through the background addon', () => {
    const addon = BUILTIN_STUDIO_ADDONS.find(
      (item) => item.scope === 'canvas',
    );
    expect(addon).toBeDefined();
    if (!addon || addon.scope !== 'canvas') return;

    const onApply = jest.fn();
    const onOpenChange = jest.fn();

    render(
      <addon.Dialog
        open
        styling={DEFAULT_STUDIO_STYLING}
        onApply={onApply}
        onOpenChange={onOpenChange}
      />,
    );

    fireEvent.mouseDown(screen.getByRole('tab', { name: /Generator/i }));
    fireEvent.click(screen.getByRole('tab', { name: /Generator/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Neon Plasma' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply background' }));

    expect(onApply).toHaveBeenCalledTimes(1);
    const applied = onApply.mock.calls[0][0] as string;
    expect(isGenerativeBackground(applied)).toBe(true);
    const parsed = parseGenerativeBackground(applied);
    expect(parsed).toMatchObject({
      style: 'plasma',
      paletteId: 'neon-plasma',
      animated: true,
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('round-trips generative background configs and draws all styles safely', () => {
    for (const preset of GENERATIVE_BACKGROUND_PRESETS) {
      const encoded = serializeGenerativeBackground(preset.config);
      expect(encoded.length).toBeLessThan(256);
      expect(isGenerativeBackground(encoded)).toBe(true);
      expect(parseGenerativeBackground(encoded)).toEqual(preset.config);
      expect(getBackgroundPreviewCss(encoded)).toContain('linear-gradient');

      const mockGradient = { addColorStop: jest.fn() };
      const ctx = {
        fillStyle: '',
        globalAlpha: 1,
        globalCompositeOperation: 'source-over',
        strokeStyle: '',
        lineWidth: 1,
        fillRect: jest.fn(),
        beginPath: jest.fn(),
        closePath: jest.fn(),
        rect: jest.fn(),
        clip: jest.fn(),
        save: jest.fn(),
        restore: jest.fn(),
        translate: jest.fn(),
        rotate: jest.fn(),
        moveTo: jest.fn(),
        lineTo: jest.fn(),
        arc: jest.fn(),
        fill: jest.fn(),
        stroke: jest.fn(),
        createLinearGradient: jest.fn(() => mockGradient),
        createRadialGradient: jest.fn(() => mockGradient),
      } as unknown as CanvasRenderingContext2D;

      expect(() =>
        drawStudioBackground(ctx, {
          width: 640,
          height: 360,
          background: encoded,
          timeMs: 1250,
        }),
      ).not.toThrow();
    }
  });
});
