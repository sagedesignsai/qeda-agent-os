/**
 * __tests__/builder-sandbox-ui.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Sandbox sessions deliberately disable the local-only review surfaces: their
 * workspace lives in E2B, so preview, Keep, and Discard would either probe a
 * path that does not exist locally or apply a diff that has not been captured
 * yet. These tests pin that the UI says so and keeps the controls disabled.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { BuilderCanvas } from '@/components/builder/BuilderCanvas';
import type { BuilderWorkspace } from '@/lib/builder-workspace';

const sandboxWorkspace: BuilderWorkspace = {
  directory: '/home/user/repo',
  name: 'repo',
  branch: 'main',
  dirty: false,
  changedFileCount: 0,
  worktreePath: '/home/user/repo',
  sandbox: true,
};

const idleStatus = {
  state: 'idle' as const,
  url: null,
  owner: null,
  command: null,
  directory: null,
  log: [],
  exitCode: null,
  message: '',
};

describe('BuilderCanvas sandbox mode', () => {
  it('labels the workspace as an E2B sandbox', () => {
    render(
      <BuilderCanvas
        surface="changes"
        viewport="desktop"
        onSurfaceChange={jest.fn()}
        onViewportChange={jest.fn()}
        previewUrl=""
        previewOwner={null}
        previewStatus={idleStatus}
        workspace={sandboxWorkspace}
      />,
    );

    expect(screen.getByText('E2B sandbox')).toBeInTheDocument();
    expect(screen.queryByText('Isolated worktree')).not.toBeInTheDocument();
  });

  it('keeps Keep and Discard disabled even when handlers are supplied', () => {
    render(
      <BuilderCanvas
        surface="changes"
        viewport="desktop"
        onSurfaceChange={jest.fn()}
        onViewportChange={jest.fn()}
        previewUrl=""
        previewOwner={null}
        previewStatus={idleStatus}
        workspace={sandboxWorkspace}
        changes={[
          {
            path: 'src/App.tsx',
            kind: 'modified',
            additions: 1,
            deletions: 1,
            diff: '@@ -1 +1 @@\n-a\n+b\n',
          },
        ]}
        onKeepAll={jest.fn()}
        onDiscardAll={jest.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Keep changes' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Discard' })).toBeDisabled();
  });

  it('explains why preview is unavailable', () => {
    render(
      <BuilderCanvas
        surface="preview"
        viewport="desktop"
        onSurfaceChange={jest.fn()}
        onViewportChange={jest.fn()}
        previewUrl=""
        previewOwner={null}
        previewStatus={idleStatus}
        workspace={sandboxWorkspace}
        canStartPreview={false}
        onStartPreview={jest.fn()}
      />,
    );

    expect(
      screen.getByText(
        /Preview is unavailable while the session runs in an E2B sandbox/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Start preview' }),
    ).toBeDisabled();
  });
});
