/**
 * __tests__/onboarding.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The first-launch flow: it must walk from welcome → project → first task →
 * ready, persist `onboardingCompleted` exactly once, and never trap the user
 * behind a step they want to skip.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { OnboardingDialog } from '../components/onboarding/OnboardingDialog';

// jsdom lacks these; Radix (Dialog/Select) expects them.
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

const invoke = jest.fn((channel: string, payload?: unknown) => {
  switch (channel) {
    case 'projects:rollups':
      return Promise.resolve([]);
    case 'projects:create':
      return Promise.resolve({
        id: 'project-1',
        name: (payload as { name?: string })?.name ?? 'Project',
        description: '',
        status: 'active',
        color: '',
        icon: 'folder',
        deadline: null,
        repo_path: null,
        notebook_id: null,
        sort_order: 1,
        created_at: 0,
        updated_at: 0,
      });
    case 'tasks:create':
      return Promise.resolve({ id: 'task-1' });
    case 'dialog:open-directory':
      return Promise.resolve('/home/user/awesome-project');
    default:
      return Promise.resolve(undefined);
  }
});

beforeAll(() => {
  Object.defineProperty(window, 'electron', {
    writable: true,
    value: {
      ipc: {
        invoke,
        on: () => () => {},
        once: () => {},
      },
    },
  });
});

beforeEach(() => {
  invoke.mockClear();
});

// Full-app suites running in parallel can starve these renders past Jest's 5s
// default, so the wizard gets the same realistic budget as the App tests.
const TEST_TIMEOUT = 20_000;

describe('OnboardingDialog', () => {
  it('starts on the welcome step and advances to the project step', async () => {
    render(
      <OnboardingDialog open onClose={() => {}} onOpenProject={() => {}} />,
    );

    expect(await screen.findByText(/Welcome to Qeda/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Get started/i }));

    expect(await screen.findByText(/Name your project/i)).toBeInTheDocument();
    // Exact match, so the dialog title "Name your project" is not picked up too.
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
  }, TEST_TIMEOUT);

  it('persists completion when skipped', async () => {
    const onClose = jest.fn();
    render(
      <OnboardingDialog open onClose={onClose} onOpenProject={() => {}} />,
    );

    fireEvent.click(await screen.findByRole('button', { name: /Skip for now/i }));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('settings:save', {
        onboardingCompleted: true,
      });
    });
    expect(onClose).toHaveBeenCalled();
  }, TEST_TIMEOUT);

  it('creates the project and reaches the ready step', async () => {
    const onOpenProject = jest.fn();
    render(
      <OnboardingDialog open onClose={() => {}} onOpenProject={onOpenProject} />,
    );

    fireEvent.click(await screen.findByRole('button', { name: /Get started/i }));
    fireEvent.change(await screen.findByLabelText('Name'), {
      target: { value: 'Ship onboarding' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Continue/i }));

    // First-task step: leave the task empty and just create the project.
    expect(await screen.findByText(/first step/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Create project$/i }));

    expect(await screen.findByText(/set up/i)).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith(
      'projects:create',
      expect.objectContaining({ name: 'Ship onboarding' }),
    );
    // No task was entered, so nothing should have been created.
    expect(invoke).not.toHaveBeenCalledWith('tasks:create', expect.anything());
    expect(invoke).toHaveBeenCalledWith('settings:save', {
      onboardingCompleted: true,
    });

    fireEvent.click(screen.getByRole('button', { name: /Open project/i }));
    expect(onOpenProject).toHaveBeenCalledWith('project-1');
  }, TEST_TIMEOUT);

  it('selects a directory via native dialog and infers project name if blank', async () => {
    render(
      <OnboardingDialog open onClose={() => {}} onOpenProject={() => {}} />,
    );

    fireEvent.click(await screen.findByRole('button', { name: /Get started/i }));
    expect(await screen.findByRole('button', { name: /Browse…/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Browse…/i }));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('dialog:open-directory', {
        title: 'Select Project Directory',
      });
    });

    await waitFor(() => {
      expect(screen.getByDisplayValue('/home/user/awesome-project')).toBeInTheDocument();
      expect(screen.getByDisplayValue('awesome-project')).toBeInTheDocument();
    });
  }, TEST_TIMEOUT);
});
