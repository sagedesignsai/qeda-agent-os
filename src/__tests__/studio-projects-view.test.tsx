/**
 * __tests__/studio-projects-view.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Unit tests for the Studio Projects Library (Grid / List view).
 *   - Renders projects in Grid view by default
 *   - Switches to List view mode and persists preference
 *   - Filters projects with live search
 *   - Renders empty states (zero projects & zero search matches)
 *   - StudioProjectCard & StudioProjectRow user interactions
 * ─────────────────────────────────────────────────────────────────────────────
 */

import '@testing-library/jest-dom';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SidebarProvider } from '../components/ui/sidebar';
import { TooltipProvider } from '../components/ui/tooltip';
import { StudioProjectsView } from '../components/studio/projects/StudioProjectsView';
import { StudioProjectCard } from '../components/studio/projects/StudioProjectCard';
import { StudioProjectRow } from '../components/studio/projects/StudioProjectRow';
import type { StudioTakeSummary } from '../lib/studio-types';

describe('StudioProjectsView & Components', () => {
  const mockTakes: StudioTakeSummary[] = [
    {
      id: 'take-1',
      title: 'Demo Release v1.0',
      description: null,
      sourceType: 'window',
      sourceName: 'Visual Studio Code',
      videoPath: '/path/to/take1.webm',
      durationMs: 45000, // 00:45
      cutCount: 0,
      zoomCount: 0,
      fileSizeBytes: 10485760, // 10 MB
      projectId: 'docugent',
      projectName: null,
      createdAt: Date.now() - 3600000,
      updatedAt: Date.now() - 3600000,
    },
    {
      id: 'take-2',
      title: 'Terminal Showcase Walkthrough',
      description: null,
      sourceType: 'screen',
      sourceName: 'Entire Screen 1',
      videoPath: '/path/to/take2.webm',
      durationMs: 82000, // 01:22
      cutCount: 2,
      zoomCount: 1,
      fileSizeBytes: 20971520, // 20 MB
      projectId: 'qeda',
      projectName: null,
      createdAt: Date.now() - 86400000,
      updatedAt: Date.now() - 86400000,
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
    localStorage.clear();
    jest.clearAllMocks();
    window.electron = {
      ipc: {
        invoke: jest.fn().mockResolvedValue('data:video/webm;base64,AAAA'),
        on: jest.fn(),
      },
    } as unknown as typeof window.electron;
  });

  it('renders projects in Grid view by default', () => {
    const onOpenTake = jest.fn();
    const onNewRecording = jest.fn();

    render(
      <SidebarProvider>
        <StudioProjectsView
          takes={mockTakes}
          onOpenTake={onOpenTake}
          onNewRecording={onNewRecording}
          onRenameTake={jest.fn()}
          onQuickExport={jest.fn()}
          onDeleteTake={jest.fn()}
        />
      </SidebarProvider>,
    );

    expect(screen.getByText('Studio Projects')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Toggle Sidebar' }),
    ).toBeInTheDocument();
    expect(screen.getByText('2 projects')).toBeInTheDocument();

    expect(screen.getByText('Demo Release v1.0')).toBeInTheDocument();
    expect(
      screen.getByText('Terminal Showcase Walkthrough'),
    ).toBeInTheDocument();

    // Duration badges
    expect(screen.getByText('00:45')).toBeInTheDocument();
    expect(screen.getByText('01:22')).toBeInTheDocument();

    // Clicking card opens take
    fireEvent.click(screen.getByText('Demo Release v1.0'));
    expect(onOpenTake).toHaveBeenCalledWith('take-1');
  });

  it('switches to List view mode on toggle and persists in localStorage', () => {
    render(
      <SidebarProvider>
        <StudioProjectsView
          takes={mockTakes}
          onOpenTake={jest.fn()}
          onNewRecording={jest.fn()}
          onRenameTake={jest.fn()}
          onQuickExport={jest.fn()}
          onDeleteTake={jest.fn()}
        />
      </SidebarProvider>,
    );

    const listBtn = screen.getByTitle('List view');
    fireEvent.click(listBtn);

    expect(localStorage.getItem('studio_projects_view_mode')).toBe('list');

    const gridBtn = screen.getByTitle('Grid view');
    fireEvent.click(gridBtn);

    expect(localStorage.getItem('studio_projects_view_mode')).toBe('grid');
  });

  it('filters projects based on live search query', () => {
    render(
      <SidebarProvider>
        <StudioProjectsView
          takes={mockTakes}
          onOpenTake={jest.fn()}
          onNewRecording={jest.fn()}
          onRenameTake={jest.fn()}
          onQuickExport={jest.fn()}
          onDeleteTake={jest.fn()}
        />
      </SidebarProvider>,
    );

    const searchInput = screen.getByPlaceholderText('Search projects...');
    fireEvent.change(searchInput, { target: { value: 'Terminal' } });

    expect(
      screen.getByText('Terminal Showcase Walkthrough'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Demo Release v1.0')).not.toBeInTheDocument();

    // Test non-matching query
    fireEvent.change(searchInput, { target: { value: 'NonExistentProject' } });
    expect(
      screen.getByText('No matching showcase projects'),
    ).toBeInTheDocument();

    // Clear search
    const clearBtn = screen.getByText('Clear Search');
    fireEvent.click(clearBtn);

    expect(screen.getByText('Demo Release v1.0')).toBeInTheDocument();
    expect(
      screen.getByText('Terminal Showcase Walkthrough'),
    ).toBeInTheDocument();
  });

  it('renders zero projects empty state and triggers new recording', () => {
    const onNewRecording = jest.fn();

    render(
      <SidebarProvider>
        <StudioProjectsView
          takes={[]}
          onOpenTake={jest.fn()}
          onNewRecording={onNewRecording}
          onRenameTake={jest.fn()}
          onQuickExport={jest.fn()}
          onDeleteTake={jest.fn()}
        />
      </SidebarProvider>,
    );

    expect(screen.getByText('No Studio Projects Yet')).toBeInTheDocument();
    const ctaBtn = screen.getByText('Record First Showcase Take');
    fireEvent.click(ctaBtn);

    expect(onNewRecording).toHaveBeenCalledTimes(1);
  });

  it('renders StudioProjectCard with video hover and open action', async () => {
    const onOpen = jest.fn();
    const onRename = jest.fn();
    const onQuickExport = jest.fn();
    const onDelete = jest.fn();

    render(
      <StudioProjectCard
        take={mockTakes[0]}
        onOpen={onOpen}
        onRename={onRename}
        onQuickExport={onQuickExport}
        onDelete={onDelete}
      />,
    );

    expect(screen.getByText('Demo Release v1.0')).toBeInTheDocument();
    expect(screen.getByText('00:45')).toBeInTheDocument();
    expect(screen.getByText('docugent')).toBeInTheDocument();

    // Hover triggers IPC read video
    const cardPoster = screen.getByRole('button', {
      name: /Open showcase take/i,
    });
    await act(async () => {
      fireEvent.mouseEnter(cardPoster);
    });
    expect(window.electron.ipc.invoke).toHaveBeenCalledWith(
      'studio:read-video-data',
      {
        takeId: 'take-1',
      },
    );

    // Clicking card opens take
    fireEvent.click(cardPoster);
    expect(onOpen).toHaveBeenCalledWith('take-1');
  });

  it('renders StudioProjectRow with direct quick export and open action', () => {
    const onOpen = jest.fn();
    const onQuickExport = jest.fn();

    render(
      <TooltipProvider>
        <StudioProjectRow
          take={mockTakes[1]}
          onOpen={onOpen}
          onRename={jest.fn()}
          onQuickExport={onQuickExport}
          onDelete={jest.fn()}
        />
      </TooltipProvider>,
    );

    expect(
      screen.getByText('Terminal Showcase Walkthrough'),
    ).toBeInTheDocument();
    expect(screen.getByText('01:22')).toBeInTheDocument();
    expect(screen.getByText('qeda')).toBeInTheDocument();

    // Quick export icon button
    const buttons = screen.getAllByRole('button');
    const exportBtn = buttons.find((b) =>
      b.querySelector('svg.lucide-download'),
    );
    expect(exportBtn).toBeDefined();

    fireEvent.click(exportBtn!);
    expect(onQuickExport).toHaveBeenCalledWith('take-2');

    // Title click opens take
    fireEvent.click(screen.getByText('Terminal Showcase Walkthrough'));
    expect(onOpen).toHaveBeenCalledWith('take-2');
  });
});
