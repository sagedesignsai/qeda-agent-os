/**
 * __tests__/documents-route.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Guards the /documents landing page.
 *
 * The original regression this file exists for: navigating to the index used to
 * redirect into the most recently edited document, which made the landing page
 * unreachable whenever the user had any document at all. `documents:list`
 * orders by `updated_at DESC`, so "the first document" was never arbitrary — it
 * was always the last thing edited. That guard is kept.
 *
 * WHAT CHANGED AND WHY THE EXPECTATIONS MOVED
 * The landing page used to open with a product pitch ("Document Composer &
 * Studio") and then list the user's own documents in a capped "Recent" grid.
 * It now leads with the AI composer — the same shape as the chat empty state
 * (`components/chat/ChatWelcome.tsx`) — because recents live in the sidebar
 * (`components/sidebar/DocumentsMenu.tsx`) and duplicating a capped slice of
 * that list on the page was both a dead end and a second copy of the same
 * query. The old "Recent" assertions were removed deliberately, alongside the
 * behaviour they described.
 *
 * Templates no longer create a document on a bare click. They seed the
 * composer, and the Document Drafter produces the draft. That is asserted here
 * because the previous behaviour silently created a file — and, with no
 * in-flight guard, created two on a double-click.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

/** Answer `documents:list` with `docs`; everything else resolves to undefined. */
function listReturns(docs: PdfDocumentSummary[]) {
  invokeMock.mockImplementation((channel: string) =>
    channel === 'documents:list'
      ? Promise.resolve(docs)
      : Promise.resolve(undefined),
  );
}

beforeEach(() => {
  navigateMock.mockClear();
  invokeMock.mockReset();
  (window as unknown as { electron: unknown }).electron = {
    ipc: {
      invoke: invokeMock,
      on: () => () => {},
    },
  };
  invokeMock.mockResolvedValue(undefined);
});

describe('Documents landing page', () => {
  it('does not navigate away from the index when documents exist', async () => {
    listReturns([summary('a', 'Most Recent')]);

    renderPage();

    // Wait on the header's document count — that only appears once the list has
    // actually resolved, so unlike the old waitFor-on-gallery it proves the
    // fetch completed rather than that the first paint happened.
    await waitFor(() => {
      expect(screen.getByText('1 document')).toBeInTheDocument();
    });

    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('leads with the composer rather than a product pitch', async () => {
    listReturns([]);

    renderPage();

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText(/Draft a letter of demand/i),
      ).toBeInTheDocument();
    });

    // The marketing hero is gone; the composer is the page.
    expect(
      screen.queryByText(/Document Composer & Studio/),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Start from a template')).toBeInTheDocument();
  });

  it('tells a first-run user they have no documents', async () => {
    listReturns([]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/No documents yet/i)).toBeInTheDocument();
    });
  });

  it('shows a loading state instead of claiming the workspace is empty', async () => {
    // `documents:list` never resolves: the request is genuinely still in
    // flight. The old page could not tell this apart from "you have none" and
    // showed the marketing hero in both cases.
    invokeMock.mockImplementation((channel: string) =>
      channel === 'documents:list'
        ? new Promise(() => {})
        : Promise.resolve(undefined),
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Loading your documents/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/No documents yet/i)).not.toBeInTheDocument();
  });

  it('does not create a document when a template is clicked', async () => {
    listReturns([]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Start from a template')).toBeInTheDocument();
    });

    const template = screen.getByText('Professional Consulting Invoice');
    fireEvent.click(template);

    // The template seeds the composer and opens the drafter; it does not write.
    // Previously this fired `documents:save` immediately and, with no in-flight
    // guard, a second click produced a second document.
    expect(invokeMock).not.toHaveBeenCalledWith(
      'documents:save',
      expect.anything(),
    );
  });
});
