/**
 * __tests__/projects-empty-state.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The fallback for a user who skipped onboarding: when only the seeded Inbox
 * exists, the Projects page shows a first-run empty state inviting them to
 * create a project — while still surfacing the Inbox so quick capture is
 * reachable.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { SidebarProvider } from '../components/ui/sidebar';
import { TooltipProvider } from '../components/ui/tooltip';
import Projects from '../renderer/pages/Projects';
import type { Project, ProjectRollup } from '../main/ipc/channels';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

function makeProject(overrides: Partial<Project>): Project {
  return {
    id: 'p',
    name: 'Project',
    description: '',
    status: 'active',
    color: '',
    icon: 'folder',
    deadline: null,
    repo_path: null,
    notebook_id: null,
    sort_order: 0,
    created_at: 0,
    updated_at: 0,
    ...overrides,
  };
}

function makeRollup(project: Project): ProjectRollup {
  return {
    project,
    taskTotal: 0,
    taskDone: 0,
    taskActive: 0,
    taskBacklog: 0,
    overdue: 0,
    focusSecToday: 0,
    focusSecTotal: 0,
    blocksToday: 0,
  };
}

const INBOX = makeProject({
  id: 'inbox',
  name: 'Inbox',
  icon: 'inbox',
  sort_order: -1,
});

function renderProjects(rollups: ProjectRollup[]) {
  const invoke = jest.fn((channel: string) => {
    if (channel === 'projects:rollups') return Promise.resolve(rollups);
    return Promise.resolve(undefined);
  });

  Object.defineProperty(window, 'electron', {
    writable: true,
    value: {
      ipc: { invoke, on: () => () => {}, once: () => {} },
    },
  });

  render(
    <TooltipProvider>
      <SidebarProvider>
        <MemoryRouter>
          <Projects />
        </MemoryRouter>
      </SidebarProvider>
    </TooltipProvider>,
  );

  return invoke;
}

describe('Projects empty state', () => {
  it('invites a first project when only the Inbox exists, keeping the Inbox reachable', async () => {
    renderProjects([makeRollup(INBOX)]);

    expect(await screen.findByText('No projects yet')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Create your first project/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/keep capturing into the Inbox/i),
    ).toBeInTheDocument();
    // The Inbox card is surfaced so its tasks are not stranded.
    expect(screen.getByText('Inbox')).toBeInTheDocument();
  });

  it('shows the project grid once a real project exists', async () => {
    renderProjects([
      makeRollup(INBOX),
      makeRollup(makeProject({ id: 'p1', name: 'Ship onboarding' })),
    ]);

    expect(await screen.findByText('Ship onboarding')).toBeInTheDocument();
    expect(screen.queryByText('No projects yet')).not.toBeInTheDocument();
  });
});
