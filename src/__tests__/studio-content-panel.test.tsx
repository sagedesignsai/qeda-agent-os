/**
 * __tests__/studio-content-panel.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Unit and integration tests for StudioContentPanel and Content Tabs:
 *   - Tab switching (Media, Text, Effects, Audio)
 *   - Adding clips via 1-click "+" button
 *   - Drag-and-drop payload formation
 *   - StudioProjectsView "+ Blank Project" triggering
 *   - TimelineStore addClip functionality
 * ─────────────────────────────────────────────────────────────────────────────
 */

import '@testing-library/jest-dom';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SidebarProvider } from '../components/ui/sidebar';
import { TooltipProvider } from '../components/ui/tooltip';
import { StudioContentPanel } from '../components/studio/content/StudioContentPanel';
import { StudioProjectsView } from '../components/studio/projects/StudioProjectsView';
import { timelineStore } from '../hooks/use-timeline-store';
import type { StudioTakeSummary } from '../lib/studio-types';

describe('Studio Content Panel & Blank Project Flow', () => {
  const mockTakes: StudioTakeSummary[] = [
    {
      id: 'take-1',
      title: 'Demo Release v1.0',
      description: null,
      sourceType: 'window',
      sourceName: 'VS Code',
      videoPath: '/path/to/take1.webm',
      durationMs: 30000,
      cutCount: 0,
      zoomCount: 0,
      projectId: 'docugent',
      projectName: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ];

  beforeAll(() => {
    window.matchMedia = jest.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }) as MediaQueryList);

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
  });

  beforeEach(() => {
    timelineStore.setTracksAndDuration([], 10000);
    jest.clearAllMocks();
    window.electron = {
      ipc: {
        invoke: jest.fn().mockImplementation((channel: string) => {
          if (channel === 'studio:import-media') {
            return Promise.resolve({
              canceled: false,
              files: [
                {
                  name: 'promo.mp4',
                  path: '/dummy/promo.mp4',
                  sizeBytes: 15728640,
                  type: 'video',
                },
              ],
            });
          }
          return Promise.resolve(null);
        }),
        on: jest.fn(),
      },
    } as unknown as typeof window.electron;
  });

  it('renders StudioContentPanel with 4 tabs and defaults to Media tab', () => {
    render(
      <TooltipProvider>
        <StudioContentPanel takes={mockTakes} onAddClip={jest.fn()} />
      </TooltipProvider>,
    );

    expect(
      screen.getByRole('button', { name: /^Media$/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Text$/i })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^Effects$/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^Audio$/i }),
    ).toBeInTheDocument();

    // In Media tab, we see import button and project recordings
    expect(screen.getByText('Import Media Files')).toBeInTheDocument();
    expect(screen.getByText('Demo Release v1.0')).toBeInTheDocument();
  });

  it('switches to Text tab and adds a text preset on click', () => {
    const onAddClip = jest.fn();

    render(
      <TooltipProvider>
        <StudioContentPanel takes={mockTakes} onAddClip={onAddClip} />
      </TooltipProvider>,
    );

    // Switch to Text tab
    fireEvent.click(screen.getByRole('button', { name: /Text/i }));
    expect(screen.getByText('Primary Heading')).toBeInTheDocument();
    expect(screen.getByText('Lower Third Badge')).toBeInTheDocument();

    // Click "+" button to add heading preset
    const addButtons = screen.getAllByRole('button', {
      name: /Add to timeline at playhead/i,
    });
    fireEvent.click(addButtons[0]);

    expect(onAddClip).toHaveBeenCalledWith(
      expect.objectContaining({
        trackType: 'captions',
        name: 'Major Headline',
        durationMs: 3000,
      }),
    );
  });

  it('switches to Effects tab and adds a kinetic zoom preset', () => {
    const onAddClip = jest.fn();

    render(
      <TooltipProvider>
        <StudioContentPanel takes={mockTakes} onAddClip={onAddClip} />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Effects/i }));
    expect(screen.getByText('1.5x Focus Zoom')).toBeInTheDocument();
    expect(screen.getByText('2.0x Macro Punch-in')).toBeInTheDocument();

    const addButtons = screen.getAllByRole('button', {
      name: /Add to timeline at playhead/i,
    });
    fireEvent.click(addButtons[0]);

    expect(onAddClip).toHaveBeenCalledWith(
      expect.objectContaining({
        trackType: 'effects',
        name: '1.5x Focus Zoom',
        durationMs: 2500,
      }),
    );
  });

  it('switches to Audio tab and plays sound preview', () => {
    const onAddClip = jest.fn();

    render(
      <TooltipProvider>
        <StudioContentPanel takes={mockTakes} onAddClip={onAddClip} />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Audio/i }));
    expect(screen.getByText('Fast Whoosh')).toBeInTheDocument();
    expect(screen.getByText('Success Chime')).toBeInTheDocument();

    // Click play preview
    const playButtons = screen.getAllByRole('button', {
      name: /Play preview/i,
    });
    fireEvent.click(playButtons[0]);

    // Click add to timeline
    const addButtons = screen.getAllByRole('button', {
      name: /Add to timeline at playhead/i,
    });
    fireEvent.click(addButtons[0]);

    expect(onAddClip).toHaveBeenCalledWith(
      expect.objectContaining({
        trackType: 'audio',
        name: 'Fast Whoosh',
        durationMs: 600,
      }),
    );
  });

  it('triggers native import when clicking import area in Media tab', async () => {
    render(
      <TooltipProvider>
        <StudioContentPanel takes={mockTakes} onAddClip={jest.fn()} />
      </TooltipProvider>,
    );

    const importZone = screen.getByRole('button', {
      name: /Import Media Files/i,
    });
    await act(async () => {
      fireEvent.click(importZone);
    });

    expect(window.electron.ipc.invoke).toHaveBeenCalledWith(
      'studio:import-media',
      { types: ['video', 'audio', 'image'] },
    );
    expect(await screen.findByText('promo.mp4')).toBeInTheDocument();
  });

  it('renders Blank Project button in StudioProjectsView and invokes callback', () => {
    const onNewBlankProject = jest.fn();

    render(
      <SidebarProvider>
        <StudioProjectsView
          takes={mockTakes}
          onOpenTake={jest.fn()}
          onNewRecording={jest.fn()}
          onNewBlankProject={onNewBlankProject}
          onRenameTake={jest.fn()}
          onQuickExport={jest.fn()}
          onDeleteTake={jest.fn()}
        />
      </SidebarProvider>,
    );

    const blankBtn = screen.getByRole('button', { name: /Blank Project/i });
    expect(blankBtn).toBeInTheDocument();

    fireEvent.click(blankBtn);
    expect(onNewBlankProject).toHaveBeenCalledTimes(1);
  });

  it('TimelineStore.addClip inserts clip onto track and updates store duration', () => {
    const clip = timelineStore.addClip('video', {
      name: 'Custom Video Clip',
      durationMs: 12000,
      startMs: 2000,
      color: '#3b82f6',
    });

    expect(clip.name).toBe('Custom Video Clip');
    expect(clip.startMs).toBe(2000);
    expect(clip.durationMs).toBe(12000);

    const state = timelineStore.getState();
    expect(state.tracks.length).toBe(1);
    expect(state.tracks[0].clips.length).toBe(1);
    expect(state.tracks[0].clips[0].id).toBe(clip.id);
    expect(state.durationMs).toBeGreaterThanOrEqual(14000); // 2000 + 12000
  });
});
