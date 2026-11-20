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
      isMultiTrack: false,
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
        on: jest.fn(() => jest.fn()),
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
    expect(screen.getByText('Import Media')).toBeInTheDocument();
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
      name: /Import Media/i,
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

  it('adds media selected from the project file browser to the media library', async () => {
    const onAddClip = jest.fn();
    const invoke = window.electron.ipc.invoke as jest.Mock;
    invoke.mockImplementation((channel: string) => {
      if (channel === 'projects:rollups') {
        return Promise.resolve([
          {
            project: { id: 'docugent', name: 'Docugent' },
            taskTotal: 0,
            taskDone: 0,
            overdueCount: 0,
            focusSeconds: 0,
          },
        ]);
      }
      if (channel === 'project-files:roots') {
        return Promise.resolve({
          roots: [],
          totals: {
            repo: 0,
            'code-project': 0,
            assets: 1,
            'studio-take': 0,
            attachment: 0,
            'research-file': 0,
            indexed: 0,
          },
          scannedAt: null,
          stale: false,
          truncated: false,
        });
      }
      if (channel === 'project-files:list') {
        return Promise.resolve({
          files: [
            {
              id: 'brand-image',
              projectId: 'docugent',
              name: 'brand.png',
              path: '/project/assets/brand.png',
              relativePath: 'brand.png',
              rootKey: 'assets',
              kind: 'image',
              mimeType: 'image/png',
              sizeBytes: 512,
              mtimeMs: 1,
              sources: ['assets'],
              primarySource: 'assets',
              missing: false,
              mediaUrl: null,
              thumbnailUrl: null,
              meta: {},
            },
          ],
          directories: [],
          total: 1,
          truncated: false,
          scannedAt: null,
        });
      }
      return Promise.resolve(null);
    });

    render(
      <TooltipProvider>
        <StudioContentPanel
          takes={mockTakes}
          onAddClip={onAddClip}
          projectId="docugent"
        />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Browse project files/i }));
    fireEvent.click(await screen.findByRole('button', { name: /brand\.png/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Add media' }));

    const addToTimeline = (await screen.findAllByRole('button', {
      name: /Add to timeline at playhead/i,
    }))[0];
    fireEvent.click(addToTimeline);

    // Images are now placed on the video track with mediaAssetId payload
    expect(onAddClip).toHaveBeenCalledWith(
      expect.objectContaining({
        trackType: 'video',
        name: 'brand.png',
        payload: expect.objectContaining({
          mediaAssetId: expect.any(String),
        }),
      }),
    );
  });

  it('renders New Recording button in StudioProjectsView and invokes callback', () => {
    const onNewRecording = jest.fn();

    render(
      <SidebarProvider>
        <StudioProjectsView
          takes={mockTakes}
          onOpenTake={jest.fn()}
          onNewRecording={onNewRecording}
          onRenameTake={jest.fn()}
          onQuickExport={jest.fn()}
          onDeleteTake={jest.fn()}
        />
      </SidebarProvider>,
    );

    const newRecordingBtn = screen.getByRole('button', { name: /New Recording/i });
    expect(newRecordingBtn).toBeInTheDocument();

    fireEvent.click(newRecordingBtn);
    expect(onNewRecording).toHaveBeenCalledTimes(1);
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
