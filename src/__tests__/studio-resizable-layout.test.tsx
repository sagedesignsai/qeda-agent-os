/**
 * __tests__/studio-resizable-layout.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Unit and integration tests for the Studio Resizable Panels layout:
 *   - Nested ResizablePanelGroup structure (Outer vertical + Inner horizontal)
 *   - Top workspace vs Bottom full-width timeline layout
 *   - Left content dock & Right inspector header toggle controls
 *   - Panel resizing and collapse/expand callbacks
 * ─────────────────────────────────────────────────────────────────────────────
 */

import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { TooltipProvider } from '../components/ui/tooltip';
import { SidebarProvider } from '../components/ui/sidebar';
import Studio from '../renderer/pages/Studio';
import type { StudioTake } from '../lib/studio-types';

const mockTake: StudioTake = {
  id: 'take-res-1',
  title: 'Showcase Resizable Test Take',
  description: 'Testing resizable panels',
  sourceType: 'window',
  sourceName: 'IDE Window',
  videoPath: '/path/to/test.webm',
  audioPath: null,
  mouseEventsPath: null,
  durationMs: 45000,
  fileSizeBytes: 1234567,
  cuts: [],
  zooms: [],
  captions: [],
  styling: {
    background: 'linear-gradient(135deg, #1e1b4b 0%, #0f172a 100%)',
    borderRadius: 16,
    padding: 32,
    shadow: '2xl',
    aspectRatio: '16:9',
    zoomIntensity: 1.5,
    cameraEasing: 'smooth',
    showCaptions: true,
    captionStyle: 'karaoke',
  },
  socialKit: null,
  projectId: null,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

// Mock useStudio.
// Mirrors the real hook's full surface (src/hooks/use-studio.ts): Studio
// destructures the pagination and timeline-persistence members too, and a
// partial mock leaves them `undefined`, which only blows up once a timeline
// commit reaches `updateTimelineData`.
jest.mock('@/hooks/use-studio', () => ({
  useStudio: () => ({
    takes: [mockTake],
    activeTake: mockTake,
    loading: false,
    isRecording: false,
    recordingSeconds: 0,
    isProcessingDraft: false,
    isGeneratingSocialKit: false,
    loadTake: jest.fn().mockResolvedValue(mockTake),
    refreshTakes: jest.fn().mockResolvedValue(undefined),
    loadMoreTakes: jest.fn().mockResolvedValue(undefined),
    hasMoreTakes: false,
    loadingMoreTakes: false,
    listSources: jest.fn().mockResolvedValue([]),
    startRecording: jest.fn().mockResolvedValue('take-new'),
    stopRecording: jest.fn().mockResolvedValue(mockTake),
    updateStyling: jest.fn(),
    updateZooms: jest.fn(),
    updateCuts: jest.fn(),
    updateCaptions: jest.fn(),
    updateEffects: jest.fn(),
    updateOverlays: jest.fn(),
    updateTimelineData: jest.fn(),
    runMagicDraft: jest.fn(),
    generateSocialKit: jest.fn(),
    exportVideo: jest.fn(),
    deleteTake: jest.fn(),
  }),
}));

// Mock useProjectScope
jest.mock('@/hooks/use-project-scope', () => ({
  useProjectScope: () => ({
    projectId: null,
    projectName: null,
  }),
}));

describe('Studio Resizable Panels Layout', () => {
  beforeAll(() => {
    // jsdom has no `matchMedia`; `useIsMobile` (via SidebarProvider) needs one.
    window.matchMedia = jest.fn().mockImplementation(
      (query: string) =>
        ({
          matches: false,
          media: query,
          onchange: null,
          addListener: jest.fn(),
          removeListener: jest.fn(),
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
          dispatchEvent: jest.fn(),
        }) as MediaQueryList,
    );

    window.HTMLMediaElement.prototype.play = jest
      .fn()
      .mockImplementation(() => Promise.resolve());
    window.HTMLMediaElement.prototype.pause = jest.fn();
    window.HTMLMediaElement.prototype.load = jest.fn();

    window.PointerEvent = window.MouseEvent as unknown as typeof PointerEvent;
    window.HTMLElement.prototype.scrollIntoView = jest.fn();
    window.HTMLElement.prototype.hasPointerCapture = jest.fn(() => false);
    window.HTMLElement.prototype.releasePointerCapture = jest.fn();
    window.HTMLElement.prototype.setPointerCapture = jest.fn();
    global.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;

    HTMLCanvasElement.prototype.getContext = jest.fn(() => {
      const gradient = { addColorStop: jest.fn() };
      const ctx: Record<string, unknown> = {
        canvas: { width: 800, height: 400 },
        measureText: jest.fn(() => ({ width: 50 })),
        createLinearGradient: jest.fn(() => gradient),
      };
      return new Proxy(ctx, {
        get: (target, prop: string) => {
          if (prop in target) return target[prop];
          return jest.fn();
        },
      });
    }) as unknown as typeof HTMLCanvasElement.prototype.getContext;

    window.electron = {
      ipc: {
        invoke: jest.fn().mockImplementation((channel: string) => {
          if (channel === 'studio:read-video-data') {
            return Promise.resolve('qeda-media://studio/take-res-1');
          }
          return Promise.resolve(null);
        }),
        on: jest.fn().mockReturnValue(() => {}),
      },
    } as unknown as typeof window.electron;
  });

  // `Studio` renders a `PageHeader`, which renders a `SidebarTrigger` and so
  // needs the sidebar context that `AppLayout` supplies in the real app.
  const renderStudioEditor = () => {
    return render(
      <SidebarProvider>
        <TooltipProvider>
          <MemoryRouter initialEntries={['/studio/take-res-1']}>
            <Routes>
              <Route path="/studio" element={<Studio />} />
              <Route path="/studio/:takeId" element={<Studio />} />
            </Routes>
          </MemoryRouter>
        </TooltipProvider>
      </SidebarProvider>,
    );
  };

  it('renders the resizable structure with top workspace and bottom timeline', () => {
    renderStudioEditor();

    // Verify header title and controls
    expect(screen.getByText('Showcase Studio')).toBeInTheDocument();
    expect(
      screen.getAllByText('Showcase Resizable Test Take').length,
    ).toBeGreaterThan(0);

    // Verify left content dock tabs
    expect(screen.getByRole('button', { name: 'Media' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Text' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Effects' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Audio' })).toBeInTheDocument();

    // Verify right inspector
    expect(screen.getByText('Studio Inspector')).toBeInTheDocument();

    // Verify bottom timeline toolbar and track headers
    expect(screen.getByText('Tracks')).toBeInTheDocument();
    expect(screen.getByText('00:00:00')).toBeInTheDocument();
  });

  it('provides header toggle buttons for left library and right inspector', () => {
    renderStudioEditor();

    const leftToggleBtn = screen.getByTitle('Hide Content Library');
    const rightToggleBtn = screen.getByTitle('Hide Studio Inspector');

    expect(leftToggleBtn).toBeInTheDocument();
    expect(rightToggleBtn).toBeInTheDocument();

    // Clicking left toggle button should toggle title attribute
    fireEvent.click(leftToggleBtn);
    expect(screen.getByTitle('Show Content Library')).toBeInTheDocument();

    // Clicking again expands it back
    fireEvent.click(screen.getByTitle('Show Content Library'));
    expect(screen.getByTitle('Hide Content Library')).toBeInTheDocument();
  });

  it('allows collapsing inspector via header toggle', () => {
    renderStudioEditor();

    const rightToggleBtn = screen.getByTitle('Hide Studio Inspector');
    fireEvent.click(rightToggleBtn);

    expect(screen.getByTitle('Show Studio Inspector')).toBeInTheDocument();

    fireEvent.click(screen.getByTitle('Show Studio Inspector'));
    expect(screen.getByTitle('Hide Studio Inspector')).toBeInTheDocument();
  });

  it('renders timeline track badges and controls', () => {
    renderStudioEditor();

    // Track names track what each track now carries: `effects` holds both
    // kinetic zooms and canvas FX, `captions` holds subtitles and text, and an
    // `overlays` track appears only once a take actually has media overlays —
    // this take has none, so it keeps the historical four-track shape.
    expect(screen.getByText('Effects & Zooms')).toBeInTheDocument();
    expect(screen.getByText('Subtitles & Text')).toBeInTheDocument();
    expect(screen.getByText('Primary Video')).toBeInTheDocument();
    expect(screen.getByText('Audio Waveform')).toBeInTheDocument();
    expect(screen.queryByText('Media Overlays')).not.toBeInTheDocument();
  });
});
