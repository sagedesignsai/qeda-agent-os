/**
 * __tests__/project-file-browser.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The Project File Browser modal.
 *
 * IPC is mocked by channel, so the assertions are about the component's contract:
 * the rail switches scope, the list and preview render, a missing file cannot be
 * selected, and `onSelect` receives a complete selection payload for consumers
 * like chat, documents, and Studio.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { ProjectFileBrowserDialog } from '../components/projects/ProjectFileBrowserDialog';
import type {
  ProjectFileEntry,
  ProjectFileListResult,
  ProjectFileRootsInfo,
} from '../main/ipc/channels';

const PROJECT_ID = 'project-1';

const project = {
  id: PROJECT_ID,
  name: 'Alpha launch',
  description: '',
  status: 'active',
  color: '',
  icon: 'folder',
  deadline: null,
  repo_path: '/tmp/alpha',
  notebook_id: null,
  sort_order: 0,
  created_at: 0,
  updated_at: 0,
};

const brief: ProjectFileEntry = {
  id: 'file-brief',
  projectId: PROJECT_ID,
  name: 'brief.md',
  path: '/tmp/alpha/brief.md',
  relativePath: 'brief.md',
  rootKey: 'repo',
  kind: 'text',
  mimeType: 'text/markdown',
  sizeBytes: 128,
  mtimeMs: 1,
  sources: ['repo'],
  primarySource: 'repo',
  missing: false,
  mediaUrl: 'qeda-media://project-file/file-brief',
  thumbnailUrl: null,
  meta: {},
};

const take: ProjectFileEntry = {
  id: 'file-take',
  projectId: PROJECT_ID,
  name: 'demo.mp4',
  path: '/tmp/media/demo.mp4',
  relativePath: 'demo.mp4',
  rootKey: 'db',
  kind: 'video',
  mimeType: 'video/mp4',
  sizeBytes: 4096,
  mtimeMs: 2,
  sources: ['studio-take'],
  primarySource: 'studio-take',
  missing: false,
  mediaUrl: 'qeda-media://project-file/file-take',
  thumbnailUrl: null,
  meta: { studioTakeId: 'take-1' },
};

const missing: ProjectFileEntry = {
  ...brief,
  id: 'file-missing',
  name: 'gone.png',
  path: '/tmp/alpha/gone.png',
  kind: 'image',
  mimeType: 'image/png',
  missing: true,
};

const rootsInfo: ProjectFileRootsInfo = {
  roots: [
    {
      key: 'repo',
      label: 'Project repo',
      type: 'repo',
      path: '/tmp/alpha',
      exists: true,
    },
  ],
  totals: {
    repo: 1,
    'code-project': 0,
    assets: 0,
    'studio-take': 1,
    attachment: 0,
    'research-file': 0,
    indexed: 0,
  },
  scannedAt: 1_700_000_000,
  stale: false,
  truncated: false,
};

function listResult(files: ProjectFileEntry[]): ProjectFileListResult {
  return {
    files,
    directories: [],
    total: files.length,
    truncated: false,
    scannedAt: 1_700_000_000,
  };
}

function setup() {
  const invoke = jest.fn(
    async (channel: string, payload?: Record<string, unknown>) => {
      switch (channel) {
        case 'projects:rollups':
          return [
            {
              project,
              taskTotal: 0,
              taskDone: 0,
              taskActive: 0,
              taskBacklog: 0,
              overdue: 0,
              nextDueAt: null,
              focusSecToday: 0,
              focusSecTotal: 0,
              blocksToday: 0,
              lastActivityAt: null,
            },
          ];
        case 'project-files:roots':
          return rootsInfo;
        case 'project-files:list':
          return listResult(
            payload?.source === 'studio-take' ? [take] : [brief, take, missing],
          );
        case 'project-files:read-text':
          return { text: '# Brief', truncated: false, sizeBytes: 7 };
        default:
          return null;
      }
    },
  );

  window.electron = {
    ipc: {
      invoke,
      on: jest.fn(() => () => {}),
    },
  } as unknown as typeof window.electron;

  return { invoke };
}

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
  })) as unknown as typeof window.matchMedia;

  window.HTMLMediaElement.prototype.play = jest.fn(() => Promise.resolve());
  window.HTMLMediaElement.prototype.pause = jest.fn();
  window.HTMLMediaElement.prototype.load = jest.fn();
  window.HTMLElement.prototype.scrollIntoView = jest.fn();
});

describe('ProjectFileBrowserDialog', () => {
  it('renders the catalog and previews a selected text file', async () => {
    setup();
    render(
      <ProjectFileBrowserDialog
        open
        onOpenChange={jest.fn()}
        projectId={PROJECT_ID}
      />,
    );

    expect(await screen.findByText('brief.md')).toBeInTheDocument();
    expect(screen.getByText('demo.mp4')).toBeInTheDocument();
    // The rail label and the per-row source badges share the same text.
    expect(screen.getAllByText('Project repo').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByText('brief.md'));

    expect(await screen.findByText('/tmp/alpha/brief.md')).toBeInTheDocument();
    expect(await screen.findByText('# Brief')).toBeInTheDocument();
  });

  it('filters by source from the rail', async () => {
    const { invoke } = setup();
    render(
      <ProjectFileBrowserDialog
        open
        onOpenChange={jest.fn()}
        projectId={PROJECT_ID}
      />,
    );

    await screen.findByText('brief.md');
    fireEvent.click(screen.getByRole('button', { name: /^Studio takes/ }));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith(
        'project-files:list',
        expect.objectContaining({ source: 'studio-take' }),
      );
    });
    expect(await screen.findByText('demo.mp4')).toBeInTheDocument();
  });

  it('returns a complete selection payload in select mode', async () => {
    const onSelect = jest.fn();
    setup();
    render(
      <ProjectFileBrowserDialog
        open
        onOpenChange={jest.fn()}
        projectId={PROJECT_ID}
        mode="select"
        onSelect={onSelect}
      />,
    );

    const confirm = screen.getByRole('button', { name: 'Select' });
    expect(confirm).toBeDisabled();

    fireEvent.click(await screen.findByText('brief.md'));
    expect(confirm).toBeEnabled();

    fireEvent.click(confirm);

    expect(onSelect).toHaveBeenCalledWith([
      expect.objectContaining({
        projectId: PROJECT_ID,
        id: 'file-brief',
        name: 'brief.md',
        path: '/tmp/alpha/brief.md',
        kind: 'text',
        mediaUrl: 'qeda-media://project-file/file-brief',
        source: 'repo',
      }),
    ]);
  });

  it('will not select a file that is missing on disk', async () => {
    const onSelect = jest.fn();
    setup();
    render(
      <ProjectFileBrowserDialog
        open
        onOpenChange={jest.fn()}
        projectId={PROJECT_ID}
        mode="select"
        onSelect={onSelect}
      />,
    );

    await screen.findByText('gone.png');
    fireEvent.click(screen.getByText('gone.png'));

    expect(screen.getByRole('button', { name: 'Select' })).toBeDisabled();
    expect(screen.getByText('Missing')).toBeInTheDocument();
  });

  it('passes the search term to the catalog query', async () => {
    const { invoke } = setup();
    render(
      <ProjectFileBrowserDialog
        open
        onOpenChange={jest.fn()}
        projectId={PROJECT_ID}
      />,
    );

    await screen.findByText('brief.md');
    fireEvent.change(screen.getByPlaceholderText('Search this project…'), {
      target: { value: 'demo' },
    });

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith(
        'project-files:list',
        expect.objectContaining({ query: 'demo' }),
      );
    });
  });

  it('restricts the catalog to the accepted extensions', async () => {
    const { invoke } = setup();
    render(
      <ProjectFileBrowserDialog
        open
        onOpenChange={jest.fn()}
        projectId={PROJECT_ID}
        mode="select"
        accept={['image']}
        acceptExtensions={['.svg']}
        onSelect={jest.fn()}
      />,
    );

    await screen.findByText('brief.md');

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith(
        'project-files:list',
        expect.objectContaining({ extensions: ['svg'] }),
      );
    });
  });
});
