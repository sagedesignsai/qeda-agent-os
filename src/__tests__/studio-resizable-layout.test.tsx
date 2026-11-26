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
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
    agentRecording: null,
    agentRecordingSeconds: 0,
    stopAgentRecording: jest.fn().mockResolvedValue({ stopped: false }),
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
        createRadialGradient: jest.fn(() => gradient),
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
          if (
            channel === 'studio:composition-list' ||
            channel === 'studio:composition-template-list'
          ) {
            return Promise.resolve([]);
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

    // Verify header has project name input (no breadcrumbs) and Undo/Redo/Save controls
    expect(screen.queryByText('Showcase Studio')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Project name')).toHaveValue(
      'Showcase Resizable Test Take',
    );
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Redo' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Save project' }),
    ).toBeInTheDocument();

    // Verify left content dock tabs
    expect(screen.getByRole('button', { name: 'Media' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Text' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Effects' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Audio' })).toBeInTheDocument();

    // Verify right inspector (header shows 'Clip Properties' or 'Global Settings')
    expect(screen.getByText('Global Settings')).toBeInTheDocument();

    const releaseKitButton = screen.getByRole('button', {
      name: 'Generate social release kit',
    });
    expect(releaseKitButton).not.toHaveTextContent('Release Kit');
    expect(releaseKitButton.querySelector('svg')).toHaveClass(
      'studio-icon-shimmer',
    );

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

  it('supports editing project name and saving via header controls', async () => {
    const ipcInvoke = window.electron.ipc.invoke as jest.Mock;
    ipcInvoke.mockClear();

    renderStudioEditor();

    const nameInput = screen.getByLabelText('Project name');
    fireEvent.change(nameInput, { target: { value: 'Updated Showcase Title' } });
    fireEvent.blur(nameInput);

    await waitFor(() => {
      expect(ipcInvoke).toHaveBeenCalledWith('studio:save-take', {
        id: 'take-res-1',
        title: 'Updated Showcase Title',
      });
    });

    ipcInvoke.mockClear();
    const saveButton = screen.getByRole('button', { name: 'Save project' });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(ipcInvoke).toHaveBeenCalledWith(
        'studio:save-take',
        expect.objectContaining({
          id: 'take-res-1',
          title: 'Updated Showcase Title',
        }),
      );
    });
  });

  it('allows collapsing inspector via header toggle', () => {
    renderStudioEditor();

    const rightToggleBtn = screen.getByTitle('Hide Studio Inspector');
    fireEvent.click(rightToggleBtn);

    expect(screen.getByTitle('Show Studio Inspector')).toBeInTheDocument();

    fireEvent.click(screen.getByTitle('Show Studio Inspector'));
    expect(screen.getByTitle('Hide Studio Inspector')).toBeInTheDocument();
  });

  it('collapses the timeline to transport controls from the editor header', () => {
    renderStudioEditor();

    fireEvent.click(screen.getByRole('button', { name: 'Collapse Timeline' }));

    expect(screen.getByRole('toolbar', { name: 'Timeline playback controls' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play playback' })).toBeInTheDocument();
    expect(screen.queryByText('Tracks')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Expand Timeline' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Expand Timeline' }));

    expect(screen.getByText('Tracks')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Collapse Timeline' })).toBeInTheDocument();
  });

  it('renders timeline track badges and controls', () => {
    renderStudioEditor();

    // Track names appear in the timeline headers; 'Effects' also appears in
    // the content panel tab, so we use getAllByText to accept multiple matches.
    expect(screen.getAllByText('Effects').length).toBeGreaterThan(0);
    expect(screen.getByText('Text & Captions')).toBeInTheDocument();
    expect(screen.getByText('Video 1')).toBeInTheDocument();
    expect(screen.getByText('Audio 1')).toBeInTheDocument();
    expect(screen.queryByText('Media Overlays')).not.toBeInTheDocument();
  });
});
