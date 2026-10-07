/**
 * __tests__/builder-chat-panel.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Covers the Builder's empty conversation, suggestion-to-draft flow, workspace
 * onboarding, and the supervised send gate (sending requires a bound workspace
 * and a reachable runtime; abort is reachable while running).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { BuilderChatPanel } from '@/components/builder/BuilderChatPanel';
import type { BuilderWorkspace } from '@/lib/builder-workspace';

const connected = {
  state: 'connected' as const,
  version: '2.0.24',
  message: 'Reachable.',
};

const workspace: BuilderWorkspace = {
  directory: '/repo/app',
  name: 'app',
  branch: 'main',
  dirty: false,
  changedFileCount: 0,
  worktreePath: null,
};

const session = { id: 'ses_1', title: 'Builder · app', createdAt: 1 };

async function submitPrompt() {
  const form = screen
    .getByRole('button', { name: 'Send prompt' })
    .closest('form');
  if (!form) throw new Error('Prompt form not found');
  // PromptInput's submit handler awaits file conversion before calling onSubmit,
  // so the assertion must flush the follow-up microtask.
  await act(async () => {
    fireEvent.submit(form);
  });
}

describe('BuilderChatPanel', () => {
  it('shows starter prompts and keeps sending disabled before runtime readiness', () => {
    render(
      <BuilderChatPanel
        status={{ state: 'not-running', message: 'No service.' }}
        prompt=""
        onPromptChange={jest.fn()}
      />,
    );

    expect(
      screen.getByText('A little idea goes a long way.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send prompt' })).toBeDisabled();
    expect(screen.getByText(/Waiting for the local agent/)).toBeInTheDocument();
  });

  it('puts a selected starter idea into the controlled prompt draft', () => {
    const onPromptChange = jest.fn();
    render(
      <BuilderChatPanel
        status={connected}
        prompt=""
        onPromptChange={onPromptChange}
      />,
    );

    act(() => {
      fireEvent.click(
        screen.getByRole('button', { name: /A dashboard with real data/ }),
      );
    });
    expect(onPromptChange).toHaveBeenCalledWith(
      'Create a clean dashboard with useful data visualizations',
    );
    expect(screen.getByRole('button', { name: 'Send prompt' })).toBeDisabled();
    expect(screen.getByText('Choose a project folder')).toBeInTheDocument();
  });

  it('offers no suggestion chips in the composer footer', () => {
    // The composer's example chip was removed: it duplicated the starter cards
    // above it, so the panel now offers each starter prompt from exactly one
    // place. Asserted by absence so a re-added chip fails here rather than
    // quietly restoring the duplication.
    render(
      <BuilderChatPanel
        status={connected}
        prompt=""
        onPromptChange={jest.fn()}
      />,
    );

    expect(
      screen.queryByRole('button', {
        name: 'Create a dashboard with useful data visualizations',
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Build a polished landing page/ }),
    ).not.toBeInTheDocument();
  });

  it('binds a workspace through the folder picker when the runtime is reachable', () => {
    const onChooseWorkspace = jest.fn();
    render(
      <BuilderChatPanel
        status={connected}
        prompt=""
        onPromptChange={jest.fn()}
        onChooseWorkspace={onChooseWorkspace}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: /Choose project folder/ }),
    );
    expect(onChooseWorkspace).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Send prompt' })).toBeDisabled();
  });

  it('explains an unsupported local service without enabling prompt submission', () => {
    render(
      <BuilderChatPanel
        status={{ state: 'unsupported', message: 'Unsupported version.' }}
        prompt="Build a page"
        onPromptChange={jest.fn()}
      />,
    );

    expect(screen.getByText('Update needed')).toBeInTheDocument();
    expect(screen.getByText(/version is not supported/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send prompt' })).toBeDisabled();
  });

  it('keeps sending disabled until a workspace is bound', () => {
    render(
      <BuilderChatPanel
        status={connected}
        prompt="Add a pricing page"
        onPromptChange={jest.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Send prompt' })).toBeDisabled();
    expect(
      screen.getByText('Choose a project folder first'),
    ).toBeInTheDocument();
  });

  it('sends a prompt once a session is bound, then clears the draft', async () => {
    const onSend = jest.fn();
    const onPromptChange = jest.fn();
    render(
      <BuilderChatPanel
        status={connected}
        prompt="Add a pricing page"
        onPromptChange={onPromptChange}
        workspace={workspace}
        session={session}
        onSend={onSend}
      />,
    );

    expect(screen.getByRole('button', { name: 'Send prompt' })).toBeEnabled();
    await submitPrompt();
    expect(onSend).toHaveBeenCalledWith('Add a pricing page');
    expect(onPromptChange).toHaveBeenCalledWith('');
  });

  it('exposes an abort control while a build is running', () => {
    const onAbort = jest.fn();
    render(
      <BuilderChatPanel
        status={connected}
        prompt=""
        onPromptChange={jest.fn()}
        workspace={workspace}
        session={session}
        running
        onAbort={onAbort}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Stop build' }));
    expect(onAbort).toHaveBeenCalledTimes(1);
  });
});
