/**
 * __tests__/studio-svg-animation.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Unit and integration tests for SVGator & After Effects style SVG Vector
 * Layer Animation, Trim Path Write-On Effects, and Plugins in Showcase Studio.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { drawSvgAnimatedLayer } from '../components/studio/renderers/svg-animator';
import { GlobalSvgLayerSection } from '../components/studio/inspector/sections/GlobalSvgLayerSection';
import { StudioPluginsModal } from '../components/studio/plugins/StudioPluginsModal';
import { BUILTIN_STUDIO_PLUGINS } from '../components/studio/plugins/StudioPluginRegistry';
import { PRESET_SVG_VECTORS } from '../lib/studio/svg-types';
import { DEFAULT_STUDIO_STYLING } from '../lib/studio-types';

describe('Showcase Studio SVG Vector Motion Engine & Plugins', () => {
  let mockCtx: CanvasRenderingContext2D;

  beforeAll(() => {
    global.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  });

  beforeEach(() => {
    mockCtx = {
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      lineCap: 'butt',
      lineJoin: 'miter',
      globalAlpha: 1.0,
      shadowColor: '',
      shadowBlur: 0,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      fillRect: jest.fn(),
      strokeRect: jest.fn(),
      clearRect: jest.fn(),
      beginPath: jest.fn(),
      fill: jest.fn(),
      stroke: jest.fn(),
      setLineDash: jest.fn(),
      save: jest.fn(),
      restore: jest.fn(),
      translate: jest.fn(),
      rotate: jest.fn(),
      scale: jest.fn(),
    } as unknown as CanvasRenderingContext2D;

    // Mock Path2D
    global.Path2D = jest.fn().mockImplementation((d) => ({
      d,
    })) as unknown as typeof Path2D;
  });

  describe('Canvas 2D SVG Animator Engine', () => {
    it('renders animated SVG layer paths with trim path dash array calculation', () => {
      const sampleLayer = PRESET_SVG_VECTORS[0].defaultLayer;

      drawSvgAnimatedLayer(mockCtx, {
        layer: sampleLayer,
        currentTimeMs: 1500,
        cw: 1920,
        ch: 1080,
      });

      expect(mockCtx.save).toHaveBeenCalled();
      expect(mockCtx.translate).toHaveBeenCalled();
      expect(mockCtx.rotate).toHaveBeenCalled();
      expect(mockCtx.scale).toHaveBeenCalled();
      expect(mockCtx.setLineDash).toHaveBeenCalled();
      expect(mockCtx.stroke).toHaveBeenCalled();
      expect(mockCtx.restore).toHaveBeenCalled();
    });

    it('applies SVG filter glow shadowBlur and shadowColor', () => {
      const sampleLayer = PRESET_SVG_VECTORS[0].defaultLayer;

      drawSvgAnimatedLayer(mockCtx, {
        layer: {
          ...sampleLayer,
          filter: {
            type: 'glow',
            color: '#38bdf8',
            blurRadius: 20,
          },
        },
        currentTimeMs: 1000,
        cw: 1920,
        ch: 1080,
      });

      expect(mockCtx.shadowColor).toBe('#38bdf8');
      expect(mockCtx.shadowBlur).toBe(20);
    });

    it('skips rendering when currentTimeMs is outside layer start/duration window', () => {
      const sampleLayer = PRESET_SVG_VECTORS[0].defaultLayer;

      drawSvgAnimatedLayer(mockCtx, {
        layer: {
          ...sampleLayer,
          startMs: 2000,
          durationMs: 3000,
        },
        currentTimeMs: 100, // Before start
        cw: 1920,
        ch: 1080,
      });

      expect(mockCtx.save).not.toHaveBeenCalled();
    });
  });

  describe('Global Svg Layer Inspector Section', () => {
    it('renders preset SVG vector buttons when no layer is selected', () => {
      const onAddPreset = jest.fn();

      render(
        <GlobalSvgLayerSection
          svgLayer={null}
          onUpdateSvgLayer={jest.fn()}
          onAddPresetSvg={onAddPreset}
        />,
      );

      expect(screen.getByText('SVG Vector Motion')).toBeInTheDocument();
      expect(screen.getByText('Qeda Finish Lightning Q')).toBeInTheDocument();

      const btn = screen.getByText('Qeda Finish Lightning Q');
      fireEvent.click(btn);

      expect(onAddPreset).toHaveBeenCalledWith('svg-qeda-lightning');
    });

    it('renders Trim Path & Filter controls when an SVG layer is active', () => {
      const sampleLayer = PRESET_SVG_VECTORS[0].defaultLayer;
      const onUpdateLayer = jest.fn();

      render(
        <GlobalSvgLayerSection
          svgLayer={sampleLayer}
          onUpdateSvgLayer={onUpdateLayer}
          onAddPresetSvg={jest.fn()}
        />,
      );

      expect(
        screen.getByText(`SVG Layer: ${sampleLayer.name}`),
      ).toBeInTheDocument();
      expect(screen.getByText('Trim Path Draw-On')).toBeInTheDocument();
      expect(screen.getByText('Vector Filter')).toBeInTheDocument();
    });
  });

  describe('Specialized SVG Plugins in Plugin Modal', () => {
    it('registers SVGator and After Effects plugins in registry', () => {
      const trimPathPlugin = BUILTIN_STUDIO_PLUGINS.find(
        (p) => p.id === 'plugin-svg-trim-path',
      );
      const filterPlugin = BUILTIN_STUDIO_PLUGINS.find(
        (p) => p.id === 'plugin-svg-filter-effects',
      );

      expect(trimPathPlugin).toBeDefined();
      expect(trimPathPlugin?.name).toBe('SVG Stroke & Trim Path Animator');

      expect(filterPlugin).toBeDefined();
      expect(filterPlugin?.name).toBe('SVG Layer Compositor & Filter Effects');
    });

    it('renders SVG Trim Path and SVG Filters tabs in Studio Plugins Modal', () => {
      render(
        <StudioPluginsModal
          open={true}
          styling={DEFAULT_STUDIO_STYLING}
          onOpenChange={jest.fn()}
          onUpdateStyling={jest.fn()}
        />,
      );

      expect(screen.getByText('SVG Trim Path')).toBeInTheDocument();
      expect(screen.getByText('SVG Filters')).toBeInTheDocument();

      const tabTrigger = screen.getByRole('tab', { name: /SVG Trim Path/i });
      expect(tabTrigger).toBeInTheDocument();
      expect(screen.getByText('SVG Filters')).toBeInTheDocument();
    });
  });
});
