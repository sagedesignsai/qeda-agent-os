/**
 * __tests__/builder-welcome.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The no-workspace Builder onboarding. The welcome view is a composer-first
 * landing, so these cover the prominent prompt input, the draft that has to
 * survive into the real conversation, and the setup affordances beneath it.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { BuilderWelcome } from '@/components/builder/BuilderWelcome';

// jsdom implements neither :fullscreen, :modal nor :popover-open, and nwsapi's
// probe for them recurses through jsdom's own `matches` until the stack
// overflows (~80s per probe). Floating UI asks for them as soon as a popper
// opens, so short-circuit to the correct jsdom answer up front.
const nativeMatches = Element.prototype.matches;
Element.prototype.matches = function matches(this: Element, selector: string) {
  if (
    selector === ':fullscreen' ||
    selector === ':modal' ||
    selector === ':popover-open'
  ) {
    return false;
  }
  return nativeMatches.call(this, selector);
} as typeof Element.prototype.matches;

// Radix (DropdownMenu/Dialog) needs pointer capture and layout shims in jsdom.
beforeAll(() => {
  window.PointerEvent = window.MouseEvent as unknown as typeof PointerEvent;
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  window.HTMLElement.prototype.scrollIntoView = jest.fn();
  window.HTMLElement.prototype.hasPointerCapture = jest.fn(() => false);
  window.HTMLElement.prototype.releasePointerCapture = jest.fn();
  window.HTMLElement.prototype.setPointerCapture = jest.fn();
});

/**
 * Open the composer's codebase menu. Radix opens a DropdownMenu on
 * Enter/Space/ArrowDown; a bare click is not its activation gesture.
 */
async function openCodebaseMenu(name: string | RegExp = 'Choose codebase') {
  fireEvent.keyDown(screen.getByRole('button', { name }), { key: 'Enter' });
  await screen.findByRole('menuitem', { name: /New project/ });
}

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
    onSubmitPrompt: jest.fn(),
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
      screen.getByText(
        'Choose a codebase below, or press Send to confirm one and start building.',
      ),
    ).toBeInTheDocument();
  });

  it('submits the draft as a one-shot start and leaves it in place', async () => {
    const onSubmitPrompt = jest.fn();
    const onPromptChange = jest.fn();
    renderWelcome({
      prompt: 'Create an internal application for the sales team.',
      onPromptChange,
      onSubmitPrompt,
    });

    const form = screen.getByRole('textbox').closest('form');
    if (!form) throw new Error('Prompt form not found');
    await act(async () => {
      fireEvent.submit(form);
    });

    expect(onSubmitPrompt).toHaveBeenCalledWith(
      'Create an internal application for the sales team.',
    );
    // The page clears the draft only after a session exists. A cancelled folder
    // picker or a failed start must leave this text untouched.
    expect(onPromptChange).not.toHaveBeenCalledWith('');
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

  it('binds the active project repo from the codebase menu, or clears it', async () => {
    const onChooseWorkspace = jest.fn();
    renderWelcome({
      projectRepoPath: '/repos/website',
      onChooseWorkspace,
    });

    await openCodebaseMenu('Website');
    fireEvent.click(await screen.findByRole('menuitem', { name: /^Website/ }));
    expect(onChooseWorkspace).toHaveBeenCalledWith('/repos/website');

    // The generic entry is the "choose another folder" path: it reopens the OS
    // picker with no default instead of binding a path by itself.
    await openCodebaseMenu('Website');
    fireEvent.click(
      await screen.findByRole('menuitem', { name: /Choose a folder/ }),
    );
    expect(onChooseWorkspace).toHaveBeenLastCalledWith(null);
  });

  it('offers Project-scoped provisioning and explicit source indexing', async () => {
    const onProvisionCodeProject = jest.fn();
    const onIndexCodeProject = jest.fn();
    renderWelcome({
      codeProjects: [CODE_PROJECT],
      onProvisionCodeProject,
      onIndexCodeProject,
    });

    // Indexing hangs off the linked codebase's own submenu.
    await openCodebaseMenu();
    fireEvent.click(
      await screen.findByRole('menuitem', {
        name: /Codebases in this Project/,
      }),
    );
    fireEvent.click(
      await screen.findByRole('menuitem', { name: /website-ui/ }),
    );
    fireEvent.click(
      await screen.findByRole('menuitem', { name: /Index source for search/ }),
    );
    expect(onIndexCodeProject).toHaveBeenCalledWith('code-1');

    // Provisioning opens a dialog because a folder name does not fit in a menu.
    await openCodebaseMenu();
    fireEvent.click(
      await screen.findByRole('menuitem', { name: /New project/ }),
    );
    fireEvent.change(await screen.findByLabelText('Folder name'), {
      target: { value: 'new-app' },
    });
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: /^Create/,
      }),
    );
    expect(onProvisionCodeProject).toHaveBeenCalledWith({
      name: 'new-app',
      source: 'created',
    });
  });

  it('requires a remote URL before a clone can be staged', async () => {
    const onProvisionCodeProject = jest.fn();
    renderWelcome({ onProvisionCodeProject });

    await openCodebaseMenu();
    fireEvent.click(
      await screen.findByRole('menuitem', { name: /Clone a repository/ }),
    );
    fireEvent.change(await screen.findByLabelText('Folder name'), {
      target: { value: 'website' },
    });

    const dialog = await screen.findByRole('dialog');
    const submit = () => within(dialog).getByRole('button', { name: /^Clone/ });
    expect(submit()).toBeDisabled();

    fireEvent.change(screen.getByLabelText('HTTPS or SSH Git URL'), {
      target: { value: 'https://example.com/website.git' },
    });
    expect(submit()).toBeEnabled();

    fireEvent.click(submit());
    expect(onProvisionCodeProject).toHaveBeenCalledWith({
      name: 'website',
      source: 'clone',
      remoteUrl: 'https://example.com/website.git',
    });
  });
});
