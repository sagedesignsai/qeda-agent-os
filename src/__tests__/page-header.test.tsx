/**
 * __tests__/page-header.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Verifies the single-row page header: everything shares one row, `nav` sits
 * between identity and actions, and the row cannot be made to grow.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { PageHeader } from '@/components/PageHeader';
import { SidebarProvider } from '@/components/ui/sidebar';

function renderHeader(ui: React.ReactElement) {
  return render(
    <SidebarProvider>
      <MemoryRouter>{ui}</MemoryRouter>
    </SidebarProvider>,
  );
}

describe('PageHeader', () => {
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

  it('keeps identity and actions in the one row, with no toolbar', () => {
    const { container } = renderHeader(
      <PageHeader
        crumbs={[{ label: 'Tasks' }]}
        meta={<span>Level 1</span>}
        actions={<button type="button">New task</button>}
      >
        <span>Quick actions</span>
      </PageHeader>,
    );

    const header = container.querySelector('header');
    const identity = container.querySelector(
      '[data-slot="page-header-identity"]',
    );
    const action = screen.getByRole('button', { name: 'New task' });

    expect(header).toContainElement(screen.getByText('Tasks'));
    expect(header).toContainElement(screen.getByText('Level 1'));
    expect(header).toContainElement(screen.getByText('Quick actions'));
    expect(header).toContainElement(action);

    // Identity still groups the heading, but cannot hide the actions.
    expect(identity).toContainElement(screen.getByText('Tasks'));
    expect(identity).not.toContainElement(action);

    // There is no second toolbar row to fall back to.
    expect(
      container.querySelector('[data-slot="page-header-toolbar"]'),
    ).toBeNull();
  });

  it('locks the action cluster to one line so the row cannot grow', () => {
    const { container } = renderHeader(
      <PageHeader
        crumbs={[{ label: 'Tasks' }]}
        actions={
          <>
            {['One', 'Two', 'Three', 'Four'].map((label) => (
              <button key={label} type="button">
                {label}
              </button>
            ))}
          </>
        }
      />,
    );

    // `flex-nowrap` is the whole point: an overflowing screen truncates rather
    // than wrapping the header onto a second line. Collapsing into an overflow
    // menu is the screen's job, not the layout's.
    expect(
      container.querySelector('[data-slot="page-header-actions"]'),
    ).toHaveClass('flex-nowrap');
    expect(
      container.querySelector('[data-slot="page-header-actions"]'),
    ).not.toHaveClass('flex-wrap');
  });

  it('places nav between the heading and the action cluster', () => {
    const { container } = renderHeader(
      <PageHeader
        crumbs={[{ label: 'Tasks' }]}
        nav={<button type="button">Today</button>}
        actions={<button type="button">New task</button>}
      />,
    );

    // Non-null assertions: `querySelector` returns `null`, and the assertion
    // on the next line is what proves these are present.
    const nav = container.querySelector('[data-slot="page-header-nav"]')!;
    const actions = container.querySelector(
      '[data-slot="page-header-actions"]',
    )!;

    expect(nav).toContainElement(screen.getByRole('button', { name: 'Today' }));
    // Same row as the heading and the actions — no second toolbar.
    expect(nav?.closest('header')).toContainElement(
      screen.getByRole('button', { name: 'New task' }),
    );
    // Order matters: the switcher sits before the commands it switches between.
    expect(actions).not.toBeNull();
    expect(
      nav?.compareDocumentPosition(actions as Node) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('omits the nav slot entirely when none is given', () => {
    const { container } = renderHeader(
      <PageHeader crumbs={[{ label: 'Projects' }]} />,
    );

    expect(container.querySelector('[data-slot="page-header-nav"]')).toBeNull();
  });

  it('renders ancestor crumbs as links and lets title override the leaf', () => {
    renderHeader(
      <PageHeader
        crumbs={[{ label: 'Projects', to: '/projects' }, { label: 'Acme' }]}
        title="Acme Rebuild"
      />,
    );

    expect(screen.getByRole('link', { name: 'Projects' })).toHaveAttribute(
      'href',
      '/projects',
    );
    expect(
      screen.getByRole('heading', { name: 'Acme Rebuild' }),
    ).toBeInTheDocument();
    // The trailing crumb is consumed by the heading, not repeated.
    expect(screen.queryByText('Acme')).toBeNull();
  });

  it('renders no breadcrumb trail for a single crumb', () => {
    const { container } = renderHeader(
      <PageHeader crumbs={[{ label: 'Projects' }]} />,
    );

    // One crumb means there is no ancestry to show; only the heading.
    expect(container.querySelector('nav[aria-label="breadcrumb"]')).toBeNull();
    expect(
      screen.getByRole('heading', { name: 'Projects' }),
    ).toBeInTheDocument();
  });
});
