/**
 * __tests__/builder-workspace-surfaces.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Tests the Builder's presentation-only code and diff surfaces with injected
 * renderer fixtures, without depending on OpenCode or project-process IPC.
 *
 * THE PRELOAD BRIDGE IS STILL STUBBED HERE
 * ─────────────────────────────────────────
 * `BuilderCodeWorkspace` fetches document text over
 * `builder:workspace-file-read` rather than from the tree node's `content`
 * field (see the banner in the component). So "no IPC dependency" is not the
 * same as "no `window.electron`": without a stub the component throws
 * `Cannot read properties of undefined (reading 'ipc')`, swallows it into its
 * error state, and the document never renders. Only the read of one channel is
 * stubbed; everything else resolves to null, matching `builder-project-scope`.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BuilderChangesWorkspace } from '@/components/builder/BuilderChangesWorkspace';
import { BuilderCodeWorkspace } from '@/components/builder/BuilderCodeWorkspace';
import type {
  BuilderFileChange,
  BuilderFileNode,
} from '@/lib/builder-workspace';

// Single source of truth for the fixture's document text. The component reads
// it back over IPC, so the stub below serves exactly this string.
const APP_TSX = 'export default function App() {\n  return null;\n}';

const files: BuilderFileNode[] = [
  {
    path: 'src',
    name: 'src',
    kind: 'directory',
    children: [
      {
        path: 'src/App.tsx',
        name: 'App.tsx',
        kind: 'file',
        language: 'tsx',
        content: APP_TSX,
        change: 'modified',
      },
    ],
  },
];

const changes: BuilderFileChange[] = [
  {
    path: 'src/App.tsx',
    kind: 'modified',
    additions: 2,
    deletions: 1,
    diff: '@@ -1,1 +1,2 @@\n-old\n+new\n+another',
  },
];

describe('BuilderCodeWorkspace', () => {
  let invoke: jest.Mock;

  beforeEach(() => {
    invoke = jest.fn((channel: string) => {
      if (channel === 'builder:workspace-file-read') {
        return Promise.resolve({
          content: APP_TSX,
          language: 'tsx',
          truncated: false,
        });
      }
      return Promise.resolve(null);
    });
    window.electron = {
      ipc: { invoke, on: jest.fn(() => () => {}) },
    } as unknown as typeof window.electron;
  });

  afterEach(() => {
    delete (window as { electron?: unknown }).electron;
  });

  it('renders the empty editor honestly when there are no workspace files', () => {
    render(<BuilderCodeWorkspace />);
    expect(screen.getByText('Workspace is empty')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Project files will appear here when a build workspace is ready.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Nothing to inspect yet')).toBeInTheDocument();
    expect(
      screen.getByText(
        'When the workspace is created, source files will be available here for review.',
      ),
    ).toBeInTheDocument();
  });

  it('opens a selected file from the AI Elements file tree', async () => {
    render(<BuilderCodeWorkspace files={files} />);
    const fileItems = screen.getAllByRole('treeitem', { name: /App\.tsx/ });
    fireEvent.click(fileItems[fileItems.length - 1]);

    expect(screen.getByText('src/App.tsx')).toBeInTheDocument();
    // The document body arrives over IPC, not from the tree node's `content`.
    await waitFor(() => {
      expect(
        screen.getByText('export default function App() {'),
      ).toBeInTheDocument();
    });
    expect(invoke).toHaveBeenCalledWith('builder:workspace-file-read', {
      filePath: 'src/App.tsx',
    });
    // The requested language comes off the read response and replaces the
    // placeholder badge.
    expect(screen.getByText('tsx')).toBeInTheDocument();
    expect(screen.queryByText('read only')).not.toBeInTheDocument();
  });

  it('filters the file tree by path or filename', () => {
    render(<BuilderCodeWorkspace files={files} />);
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Filter workspace files' }),
      {
        target: { value: 'missing' },
      },
    );
    expect(screen.getByText('No matching files')).toBeInTheDocument();
    expect(
      screen.queryByRole('treeitem', { name: /App\.tsx/ }),
    ).not.toBeInTheDocument();
  });
});

describe('BuilderChangesWorkspace', () => {
  it('shows a reviewable diff and keeps destructive actions gated without handlers', () => {
    render(<BuilderChangesWorkspace changes={changes} />);
    expect(screen.getByText('src/App.tsx')).toBeInTheDocument();
    expect(screen.getByText('+new')).toBeInTheDocument();
    expect(screen.getByText('-old')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep changes' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Discard' })).toBeDisabled();
  });

  it('filters changed files by type', async () => {
    render(<BuilderChangesWorkspace changes={changes} />);
    const addedTab = screen.getByRole('tab', { name: /Added/ });
    fireEvent.mouseDown(addedTab, { button: 0 });
    fireEvent.click(addedTab);
    await waitFor(() => {
      expect(addedTab).toHaveAttribute('aria-selected', 'true');
    });
    expect(screen.getByText('Nothing in this filter')).toBeInTheDocument();
  });
});
