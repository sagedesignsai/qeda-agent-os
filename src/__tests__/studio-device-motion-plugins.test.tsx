/**
 * __tests__/studio-device-motion-plugins.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Unit and component tests for Showcase Studio Device Mockup Frames,
 * Intro & Outro Motion Cards, and Studio Plugins Modal.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  drawDeviceFrameHeader,
  drawDeviceFrameFooter,
} from '../components/studio/renderers/device-frames';
import { drawMotionCard } from '../components/studio/renderers/motion-cards';
import { StudioPluginsModal } from '../components/studio/plugins/StudioPluginsModal';
import { StudioInspector } from '../components/studio/inspector/StudioInspector';
import { DEFAULT_STUDIO_STYLING } from '../lib/studio-types';

describe('Showcase Studio Device Mockups & Motion Cards', () => {
  let mockCtx: CanvasRenderingContext2D;

  beforeAll(() => {
    global.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  });

  beforeEach(() => {
    // Canvas 2D mock context
    mockCtx = {
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      font: '',
      textAlign: 'left',
      textBaseline: 'top',
      globalAlpha: 1.0,
      shadowColor: '',
      shadowBlur: 0,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      fillRect: jest.fn(),
      strokeRect: jest.fn(),
      clearRect: jest.fn(),
      beginPath: jest.fn(),
      moveTo: jest.fn(),
      lineTo: jest.fn(),
      arc: jest.fn(),
      roundRect: jest.fn(),
      fill: jest.fn(),
      stroke: jest.fn(),
      fillText: jest.fn(),
      measureText: jest.fn().mockReturnValue({ width: 100 }),
      save: jest.fn(),
      restore: jest.fn(),
      clip: jest.fn(),
      drawImage: jest.fn(),
      createLinearGradient: jest.fn().mockReturnValue({
        addColorStop: jest.fn(),
      }),
      createRadialGradient: jest.fn().mockReturnValue({
        addColorStop: jest.fn(),
      }),
    } as unknown as CanvasRenderingContext2D;
  });

  describe('Device Frame Renderers', () => {
    it('renders browser frame header with address bar URL and title', () => {
      drawDeviceFrameHeader(mockCtx, {
        frame: {
          type: 'browser',
          title: 'Qeda App Showcase',
          url: 'https://qeda.app',
          theme: 'dark',
          showControls: true,
        },
        winX: 100,
        winY: 50,
        winW: 800,
        winH: 500,
        headerH: 26,
        radius: 12,
      });

      expect(mockCtx.fillRect).toHaveBeenCalled();
      expect(mockCtx.roundRect).toHaveBeenCalled();
      expect(mockCtx.fillText).toHaveBeenCalledWith(
        expect.stringContaining('https://qeda.app'),
        expect.any(Number),
        expect.any(Number),
      );
    });

    it('renders MacBook laptop notch header and hinge footer', () => {
      drawDeviceFrameHeader(mockCtx, {
        frame: { type: 'macbook' },
        winX: 100,
        winY: 50,
        winW: 800,
        winH: 500,
        headerH: 26,
        radius: 12,
      });

      expect(mockCtx.fillRect).toHaveBeenCalled();
      expect(mockCtx.roundRect).toHaveBeenCalled();

      drawDeviceFrameFooter(mockCtx, {
        frame: { type: 'macbook' },
        winX: 100,
        winY: 50,
        winW: 800,
        winH: 500,
        headerH: 26,
        radius: 12,
      });

      expect(mockCtx.stroke).toHaveBeenCalled();
    });

    it('renders iPhone mobile frame header and bottom home indicator', () => {
      drawDeviceFrameHeader(mockCtx, {
        frame: { type: 'iphone' },
        winX: 100,
        winY: 50,
        winW: 360,
        winH: 640,
        headerH: 30,
        radius: 24,
      });

      expect(mockCtx.roundRect).toHaveBeenCalled();

      drawDeviceFrameFooter(mockCtx, {
        frame: { type: 'iphone' },
        winX: 100,
        winY: 50,
        winW: 360,
        winH: 640,
        headerH: 30,
        radius: 24,
      });

      expect(mockCtx.fill).toHaveBeenCalled();
    });
  });

  describe('Motion Card Renderers', () => {
    it('renders Intro Motion Card when enabled and active during timestamp', () => {
      drawMotionCard(mockCtx, {
        card: {
          enabled: true,
          title: 'Welcome to Qeda',
          subtitle: 'Open Source Agent OS',
          badge: 'FEATURE DEMO',
          durationMs: 3000,
          preset: 'kinetic',
        },
        cardType: 'intro',
        currentTimeMs: 1000,
        totalDurationMs: 20000,
        cw: 1920,
        ch: 1080,
      });

      expect(mockCtx.save).toHaveBeenCalled();
      expect(mockCtx.fillText).toHaveBeenCalledWith(
        'Welcome to Qeda',
        expect.any(Number),
        expect.any(Number),
      );
      expect(mockCtx.fillText).toHaveBeenCalledWith(
        'Open Source Agent OS',
        expect.any(Number),
        expect.any(Number),
      );
      expect(mockCtx.restore).toHaveBeenCalled();
    });

    it('renders Outro Call to Action Motion Card near the end of playback', () => {
      drawMotionCard(mockCtx, {
        card: {
          enabled: true,
          title: 'Download Qeda OS',
          subtitle: 'https://qeda.app',
          badge: 'GET STARTED',
          durationMs: 3000,
          preset: 'cyber',
        },
        cardType: 'outro',
        currentTimeMs: 18000,
        totalDurationMs: 20000,
        cw: 1920,
        ch: 1080,
      });

      expect(mockCtx.fillText).toHaveBeenCalledWith(
        'Download Qeda OS',
        expect.any(Number),
        expect.any(Number),
      );
    });

    it('does not render motion card if enabled is false', () => {
      drawMotionCard(mockCtx, {
        card: {
          enabled: false,
          title: 'Hidden Card',
          durationMs: 3000,
        },
        cardType: 'intro',
        currentTimeMs: 1000,
        totalDurationMs: 20000,
        cw: 1920,
        ch: 1080,
      });

      expect(mockCtx.fillText).not.toHaveBeenCalled();
    });
  });

  describe('Studio Plugins Modal Component', () => {
    it('renders plugins modal tabs and allows applying device frame updates', () => {
      const onUpdateStyling = jest.fn();
      const onOpenChange = jest.fn();

      render(
        <StudioPluginsModal
          open={true}
          styling={DEFAULT_STUDIO_STYLING}
          onOpenChange={onOpenChange}
          onUpdateStyling={onUpdateStyling}
        />,
      );

      expect(
        screen.getByText('Showcase Motion Studio Plugins'),
      ).toBeInTheDocument();
      expect(screen.getByText('Device Mockup Frame')).toBeInTheDocument();

      const applyBtn = screen.getByText('Apply Device Frame Plugin');
      fireEvent.click(applyBtn);

      expect(onUpdateStyling).toHaveBeenCalledWith({
        deviceFrame: expect.objectContaining({
          type: expect.any(String),
        }),
      });
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe('Studio Inspector Device & Motion Accordions', () => {
    it('renders Device Mockup Frame & Intro/Outro Cards sections in Inspector', () => {
      const onUpdateStyling = jest.fn();

      render(
        <StudioInspector
          styling={DEFAULT_STUDIO_STYLING}
          isProcessingDraft={false}
          isGeneratingSocialKit={false}
          onUpdateStyling={onUpdateStyling}
          onRunMagicDraft={jest.fn()}
          onGenerateSocialKit={jest.fn()}
          onExportVideo={jest.fn()}
        />,
      );

      expect(screen.getByText('Device Mockup Frame')).toBeInTheDocument();
      expect(screen.getByText('Intro & Outro Cards')).toBeInTheDocument();
    });
  });
});
