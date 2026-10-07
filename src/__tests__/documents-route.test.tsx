/**
 * __tests__/documents-route.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Guards the /documents landing page against silently re-acquiring its old
 * behaviour: navigating to the index used to redirect into the most recently
 * edited document, which made the template gallery unreachable whenever the
 * user had any document at all.
 *
 * `documents:list` orders by `updated_at DESC`, so "the first document" was
 * never arbitrary — it was always the last thing edited.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

import type { PdfDocumentSummary } from '@/lib/pdf-studio/types';

// A static import, not a lazy one: jest's CJS transform has no
// `--experimental-vm-modules`, so `await import()` in a test body throws.
import Documents from '@/renderer/pages/Documents';
import { SidebarProvider } from '@/components/ui/sidebar';

// jsdom has no `matchMedia`; `useIsMobile` (via SidebarProvider) needs one.
beforeAll(() => {
  window.matchMedia = jest.fn().mockImplementation(
    (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      }) as MediaQueryList,
  );
});

// `PageHeader` renders a `SidebarTrigger`, which needs the sidebar context.
function renderPage() {
  return render(
    <SidebarProvider>
      <MemoryRouter>
        <Documents />
      </MemoryRouter>
    </SidebarProvider>,
  );
}

const navigateMock = jest.fn();
const invokeMock = jest.fn();

jest.mock('react-router', () => ({
  ...jest.requireActual('react-router'),
  useNavigate: () => navigateMock,
  useParams: () => ({ documentId: undefined }),
  Link: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

const summary = (id: string, title: string): PdfDocumentSummary => ({
  id,
  projectId: null,
  projectName: null,
  title,
  description: '',
  templateId: 'blank',
  blockCount: 1,
  createdAt: 1,
  updatedAt: 2,
});

beforeEach(() => {
  navigateMock.mockClear();
  invokeMock.mockReset();
  (window as unknown as { electron: unknown }).electron = {
    ipc: {
      invoke: invokeMock,
      on: () => () => {},
    },
  };
  // Every channel resolve to a benign value; documents:list is overridden per test.
  invokeMock.mockResolvedValue(undefined);
});

describe('Documents landing page', () => {
  it('does not navigate away from the index when documents exist', async () => {
    invokeMock.mockImplementation((channel: string) =>
      channel === 'documents:list'
        ? Promise.resolve([summary('a', 'Most Recent')])
        : Promise.resolve(undefined),
    );

    renderPage();

    // Wait for the list to actually load before asserting. The gallery itself
    // renders on the first paint (with an empty list), so waiting on it proves
    // nothing — the old effect only fired *after* `documents:list` resolved.
    await waitFor(() => {
      expect(screen.getByText('Most Recent')).toBeInTheDocument();
    });

    expect(navigateMock).not.toHaveBeenCalled();
    expect(
      screen.queryByText(/Document Composer & Studio/),
    ).toBeInTheDocument();
  });

  it('offers existing documents as recent entries, not just templates', async () => {
    invokeMock.mockImplementation((channel: string) =>
      channel === 'documents:list'
        ? Promise.resolve([
            summary('a', 'Quarterly Proposal'),
            summary('b', 'Itemized Invoice'),
          ])
        : Promise.resolve(undefined),
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Recent')).toBeInTheDocument();
    });
    // Existing work is one click away instead of hiding behind "new document".
    expect(screen.getByText('Quarterly Proposal')).toBeInTheDocument();
    expect(screen.getByText('Itemized Invoice')).toBeInTheDocument();
  });

  it('omits the recent section when there are no documents', async () => {
    invokeMock.mockImplementation((channel: string) =>
      channel === 'documents:list'
        ? Promise.resolve([])
        : Promise.resolve(undefined),
    );

    renderPage();

    await waitFor(() => {
      expect(
        screen.getByText('Document Composer & Studio'),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText('Recent')).toBeNull();
  });
});
