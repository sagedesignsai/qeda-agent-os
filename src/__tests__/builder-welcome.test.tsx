/**
 * __tests__/builder-welcome.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The no-workspace Builder onboarding. The welcome view is a composer-first
 * landing, so these cover the prominent prompt input, the draft that has to
 * survive into the real conversation, and the setup affordances beneath it.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { BuilderWelcome } from '@/components/builder/BuilderWelcome';

const connected = {
  state: 'connected' as const,
  version: '2.0.24',
  message: 'Reachable.',
};

const CODE_PROJECT = {
  id: 'code-1',
  project_id: 'project-1',
  name: 'website-ui',
  directory: '/repos/website-ui',
  source: 'clone' as const,
  remote_url: 'https://example.com/website.git',
  index_status: 'not-indexed' as const,
  indexed_files: 0,
  indexed_at: null,
  index_error: null,
  created_at: 1,
  updated_at: 1,
};

function renderWelcome(
  overrides: Partial<Parameters<typeof BuilderWelcome>[0]> = {},
) {
  const props = {
    status: connected,
    runtimeLoading: false,
    projectName: 'Website',
    projectRepoPath: null as string | null,
    prompt: '',
    onPromptChange: jest.fn(),
    creatingSession: false,
    error: null as string | null,
    onChooseWorkspace: jest.fn(),
    onLinkExistingCodeProject: jest.fn(),
    projectId: 'project-1' as string | null,
    codeProjects: [] as (typeof CODE_PROJECT)[] | never[],
    codeProjectsLoading: false,
    codeProjectsBusy: false,
    indexingId: null as string | null,
    onOpenCodeProject: jest.fn(),
    onOpenTerminal: jest.fn(),
    onProvisionCodeProject: jest.fn(),
    onIndexCodeProject: jest.fn(),
    ...overrides,
  };
  return { props, ...render(<BuilderWelcome {...props} />) };
}

describe('BuilderWelcome', () => {
  it('leads with a prominent prompt input instead of setup chrome', () => {
    renderWelcome();

    // The composer is the headline element, not a card in a setup grid.
    expect(
      screen.getByRole('heading', { name: 'What do you want to build?' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeInTheDocument();

    // The old numbered two-step headings are gone.
    expect(screen.queryByText('01')).not.toBeInTheDocument();
    expect(screen.queryByText('02')).not.toBeInTheDocument();
  });

  it('states why the composer cannot be sent yet, without pretending to send', () => {
    renderWelcome();
    expect(
      screen.getByText('Choose a codebase below to start building.'),
    ).toBeInTheDocument();
  });

  it('explains a disconnected runtime and explains a failed setup', () => {
    renderWelcome({
      status: { state: 'not-running', message: 'Offline.' },
      error: 'Could not create an isolated workspace.',
    });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not create an isolated workspace.',
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'Start the local Builder service',
    );
  });

  it('reports an unsupported runtime distinctly from an offline one', () => {
    renderWelcome({
      status: { state: 'unsupported', message: 'Too old.' },
    });
    expect(screen.getByRole('status')).toHaveTextContent('needs an update');
  });

  it('seeds the shared draft from a starter chip without sending', () => {
    const onPromptChange = jest.fn();
    renderWelcome({ onPromptChange });

    fireEvent.click(screen.getByRole('button', { name: 'Launch page' }));
    expect(onPromptChange).toHaveBeenCalledWith(
      expect.stringContaining('landing page'),
    );
  });

  it('asks the user to confirm the active project repository before binding it', () => {
    const onChooseWorkspace = jest.fn();
    renderWelcome({
      projectRepoPath: '/repos/website',
      onChooseWorkspace,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Use Project repo' }));
    expect(onChooseWorkspace).toHaveBeenCalledWith('/repos/website');

    fireEvent.click(screen.getByRole('button', { name: 'Choose another' }));
    expect(onChooseWorkspace).toHaveBeenLastCalledWith(null);
  });

  it('offers Project-scoped provisioning and explicit source indexing', () => {
    const onProvisionCodeProject = jest.fn();
    const onIndexCodeProject = jest.fn();
    renderWelcome({
      codeProjects: [CODE_PROJECT],
      onProvisionCodeProject,
      onIndexCodeProject,
    });

    fireEvent.click(screen.getByRole('button', { name: /Index source/ }));
    expect(onIndexCodeProject).toHaveBeenCalledWith('code-1');

    fireEvent.click(screen.getByRole('button', { name: /New project/ }));
    fireEvent.change(screen.getByLabelText('Folder name'), {
      target: { value: 'new-app' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Choose folder…' }));
    expect(onProvisionCodeProject).toHaveBeenCalledWith({
      name: 'new-app',
      source: 'created',
    });
  });

  it('requires a remote URL before a clone can be staged', () => {
    const onProvisionCodeProject = jest.fn();
    renderWelcome({ onProvisionCodeProject });

    fireEvent.click(screen.getByRole('button', { name: /Clone repository/ }));
    fireEvent.change(screen.getByLabelText('Folder name'), {
      target: { value: 'website' },
    });

    expect(
      screen.getByRole('button', { name: 'Choose folder…' }),
    ).toBeDisabled();

    fireEvent.change(screen.getByLabelText('HTTPS or SSH Git URL'), {
      target: { value: 'https://example.com/website.git' },
    });
    expect(
      screen.getByRole('button', { name: 'Choose folder…' }),
    ).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Choose folder…' }));
    expect(onProvisionCodeProject).toHaveBeenCalledWith({
      name: 'website',
      source: 'clone',
      remoteUrl: 'https://example.com/website.git',
    });
  });
});
