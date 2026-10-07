/**
 * __tests__/builder-workspace-surfaces.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Tests the Builder's presentation-only code and diff surfaces with injected
 * renderer fixtures, without depending on OpenCode or project-process IPC.
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
        content: 'export default function App() {\n  return null;\n}',
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
  it('renders the empty editor honestly when there are no workspace files', () => {
    render(<BuilderCodeWorkspace />);
    expect(screen.getByText('Workspace is empty')).toBeInTheDocument();
    expect(
      screen.getByText('No generated files are being shown'),
    ).toBeInTheDocument();
    expect(screen.getByText('Nothing to inspect yet')).toBeInTheDocument();
  });

  it('opens a selected file from the AI Elements file tree', () => {
    render(<BuilderCodeWorkspace files={files} />);
    const fileItems = screen.getAllByRole('treeitem', { name: /App\.tsx/ });
    fireEvent.click(fileItems[fileItems.length - 1]);

    expect(screen.getByText('src/App.tsx')).toBeInTheDocument();
    expect(
      screen.getByText('export default function App() {'),
    ).toBeInTheDocument();
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
