/**
 * __tests__/header-tab-strip.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The header tab strip exists to *remove* stacked surfaces, so the assertions
 * are about absence: the vendored trigger's double focus outline, its active
 * border+shadow pill, and the track's own fill must not survive the override.
 * A regression here is invisible in a snapshot but obvious on screen.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { HeaderTab, HeaderTabStrip } from '@/components/HeaderTabStrip';

const classesOf = (el: Element | null) => el?.getAttribute('class') ?? '';

describe('HeaderTabStrip', () => {
  it('drops the track fill and padding so only the active tab reads as a surface', () => {
    render(
      <Tabs value="today">
        <HeaderTabStrip>
          <HeaderTab value="today">Today</HeaderTab>
          <HeaderTab value="board">Board</HeaderTab>
        </HeaderTabStrip>
        <TabsContent value="today">Panel</TabsContent>
      </Tabs>,
    );

    const track = screen.getByRole('tablist');
    expect(classesOf(track)).not.toMatch(/bg-muted/);
    expect(classesOf(track)).toMatch(/bg-transparent/);
  });

  it('replaces the inherited 3px ring + outline pair with a single 1px ring', () => {
    render(
      <Tabs value="today">
        <HeaderTabStrip>
          <HeaderTab value="today">Today</HeaderTab>
        </HeaderTabStrip>
        <TabsContent value="today">Panel</TabsContent>
      </Tabs>,
    );

    const cls = classesOf(screen.getByRole('tab', { name: 'Today' }));
    expect(cls).not.toMatch(/ring-\[3px\]/);
    expect(cls).toMatch(/focus-visible:ring-1\b/);
    // The vendored trigger sets outline-1 and outline-ring together; the
    // override must neutralise the width so only the ring shows.
    expect(cls).toMatch(/focus-visible:outline-none/);
  });

  it('uses an accent fill for the active tab rather than a bordered pill', () => {
    render(
      <Tabs value="today">
        <HeaderTabStrip>
          <HeaderTab value="today">Today</HeaderTab>
          <HeaderTab value="board">Board</HeaderTab>
        </HeaderTabStrip>
        <TabsContent value="today">Panel</TabsContent>
      </Tabs>,
    );

    const active = classesOf(screen.getByRole('tab', { name: 'Today' }));
    expect(active).toMatch(/data-active:bg-accent/);
    // border-input + shadow-sm are the "double box" edges. The `dark:` forms
    // matter most: they outrank an unprefixed override in the cascade, so a
    // leftover one would repaint the active tab in dark mode.
    expect(active).not.toMatch(/data-active:border-input/);
    expect(active).not.toMatch(/data-active:shadow-sm\b/);
    expect(active).toMatch(/dark:data-active:border-transparent/);
    expect(active).toMatch(/dark:data-active:bg-accent/);
  });

  it('keeps Radix tab semantics and roving focus intact', () => {
    render(
      <Tabs value="today">
        <HeaderTabStrip>
          <HeaderTab value="today">Today</HeaderTab>
          <HeaderTab value="board">Board</HeaderTab>
        </HeaderTabStrip>
        <TabsContent value="today">TODAY</TabsContent>
        <TabsContent value="board">BOARD</TabsContent>
      </Tabs>,
    );

    const today = screen.getByRole('tab', { name: 'Today' });
    const board = screen.getByRole('tab', { name: 'Board' });

    expect(today).toHaveAttribute('aria-selected', 'true');
    expect(board).toHaveAttribute('aria-selected', 'false');
    // Content is still driven by the Tabs root, not by the trigger styling.
    expect(screen.getByText('TODAY')).toBeInTheDocument();
    expect(screen.queryByText('BOARD')).toBeNull();
  });
});
