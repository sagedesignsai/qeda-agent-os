/**
 * __tests__/page-header.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Verifies the shared page header separates section identity from toolbar actions.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { PageHeader } from '@/components/PageHeader';
import { SidebarProvider } from '@/components/ui/sidebar';

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

  it('keeps metadata with identity and renders actions in a separate toolbar', () => {
    const { container } = render(
      <SidebarProvider>
        <MemoryRouter>
          <PageHeader
            crumbs={[{ label: 'Tasks' }]}
            meta={<span>Level 1</span>}
            actions={<button type="button">New task</button>}
          >
            <span>Quick actions</span>
          </PageHeader>
        </MemoryRouter>
      </SidebarProvider>,
    );

    const identity = container.querySelector(
      '[data-slot="page-header-identity"]',
    );
    const toolbar = container.querySelector(
      '[data-slot="page-header-toolbar"]',
    );
    const action = screen.getByRole('button', { name: 'New task' });

    expect(identity).toContainElement(screen.getByText('Tasks'));
    expect(identity).toContainElement(screen.getByText('Level 1'));
    expect(identity).not.toContainElement(action);
    expect(toolbar).toContainElement(action);
    expect(toolbar).toContainElement(screen.getByText('Quick actions'));
  });

  it('collapses identity, meta and actions into one row when dense', () => {
    const { container } = render(
      <SidebarProvider>
        <MemoryRouter>
          <PageHeader
            density="dense"
            crumbs={[{ label: 'Tasks' }]}
            meta={<span>Level 1</span>}
            actions={<button type="button">New task</button>}
          >
            <span>Quick actions</span>
          </PageHeader>
        </MemoryRouter>
      </SidebarProvider>,
    );

    const header = container.querySelector('header');
    const identity = container.querySelector(
      '[data-slot="page-header-identity"]',
    );

    // Dense headers have no second row at all.
    expect(
      container.querySelector('[data-slot="page-header-toolbar"]'),
    ).toBeNull();

    // Everything shares the single header row.
    expect(header).toContainElement(screen.getByText('Tasks'));
    expect(header).toContainElement(screen.getByText('Level 1'));
    expect(header).toContainElement(screen.getByText('Quick actions'));
    expect(header).toContainElement(
      screen.getByRole('button', { name: 'New task' }),
    );

    // Identity still groups the heading, but cannot hide the actions.
    expect(identity).toContainElement(screen.getByText('Tasks'));
    expect(identity).not.toContainElement(
      screen.getByRole('button', { name: 'New task' }),
    );
  });

  it('places nav between the heading and the action cluster when dense', () => {
    const { container } = render(
      <SidebarProvider>
        <MemoryRouter>
          <PageHeader
            density="dense"
            crumbs={[{ label: 'Tasks' }]}
            nav={<button type="button">Today</button>}
            actions={<button type="button">New task</button>}
          />
        </MemoryRouter>
      </SidebarProvider>,
    );

    const nav = container.querySelector('[data-slot="page-header-nav"]');
    expect(nav).toContainElement(screen.getByRole('button', { name: 'Today' }));
    // Same row as the heading and the actions — no second toolbar.
    expect(nav?.closest('header')).toContainElement(
      screen.getByRole('button', { name: 'New task' }),
    );
  });

  it('omits the nav slot entirely when none is given', () => {
    const { container } = render(
      <SidebarProvider>
        <MemoryRouter>
          <PageHeader density="dense" crumbs={[{ label: 'Projects' }]} />
        </MemoryRouter>
      </SidebarProvider>,
    );

    expect(
      container.querySelector('[data-slot="page-header-nav"]'),
    ).toBeNull();
  });

  it('renders ancestor crumbs as links when dense and lets title override the leaf', () => {
    render(
      <SidebarProvider>
        <MemoryRouter initialEntries={['/projects/acme']}>
          <PageHeader
            density="dense"
            crumbs={[{ label: 'Projects', to: '/projects' }, { label: 'Acme' }]}
            title="Acme Rebuild"
          />
        </MemoryRouter>
      </SidebarProvider>,
    );

    expect(screen.getByRole('link', { name: 'Projects' })).toHaveAttribute(
      'href',
      '/projects',
    );
    expect(
      screen.getByRole('heading', { name: 'Acme Rebuild' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Acme')).toBeNull();
  });
});
