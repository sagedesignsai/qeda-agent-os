/**
 * components/PageHeader.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The single-row header every route renders. One density, no exceptions.
 *
 *   [sidebar] [ancestors › Title  subtitle]  [nav]   …   meta children actions
 *
 * It used to have a second, taller variant for screens "whose actions need real
 * horizontal room". Every screen ended up back on the compact row anyway, so the
 * variant was pure divergence: two type scales, a `nav` slot that silently
 * rendered nothing in the tall branch, and a toolbar row no page needed. There
 * is one row now. A screen with too many commands collapses the surplus into an
 * overflow menu (`components/OverflowMenu`) or the global command palette
 * rather than asking for a taller header.
 *
 * Two rules keep that promise, and both are load-bearing:
 *
 *   - The action cluster is `flex-nowrap`, never `flex-wrap`. An overflowing
 *     screen truncates instead of pushing the header onto a second line and
 *     stealing list height. Collapsing is the *screen's* call, not the layout's.
 *   - The identity group is `shrink`, not `flex-1`, for the same reason: the
 *     actions win the leftover width and the heading truncates first.
 *
 * `nav` is the view-switcher slot (tab strip, segmented control, Studio's take
 * picker). It is `shrink-0` for the same reason — a long title truncates rather
 * than squeezing it. Tabs that live here must be rendered *inside* their `Tabs`
 * root, which therefore wraps this component.
 *
 * Breadcrumb links use react-router `Link`, so they work with the app's
 * MemoryRouter and stay keyboard accessible.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import type { ReactNode } from 'react';
import { Fragment } from 'react';
import { Link } from 'react-router';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';

export interface PageCrumb {
  label: string;
  /** When omitted (or on the last crumb) the crumb renders as the current page. */
  to?: string;
}

interface PageHeaderProps {
  /**
   * Ancestor trail. The last entry becomes the `<h1>` (unless `title` overrides
   * it) and is dropped from the breadcrumb itself, so a single-entry array
   * renders no breadcrumb at all.
   */
  crumbs: PageCrumb[];
  title?: ReactNode;
  /** Rendered inline after the heading, hidden below `md`. */
  subtitle?: ReactNode;
  /** View switcher (tabs, segmented control, record picker). */
  nav?: ReactNode;
  /** Status readouts — chips, badges, counters. */
  meta?: ReactNode;
  /** Commands. Keep this to a primary action plus an overflow menu. */
  actions?: ReactNode;
  /** Inline content in the action cluster, between `meta` and `actions`. */
  children?: ReactNode;
  className?: string;
}

export function PageHeader({
  crumbs,
  title,
  subtitle,
  nav,
  meta,
  actions,
  children,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        'flex min-h-10 shrink-0 items-center gap-2 border-b bg-card/20 px-3 backdrop-blur-xs',
        className,
      )}
    >
      <SidebarTrigger className="-ml-1 size-7 shrink-0 text-muted-foreground" />

      {/* `shrink` (not `flex-1`) so the action group wins the leftover width
          and the heading truncates first. */}
      <div
        data-slot="page-header-identity"
        className="flex min-w-0 shrink items-center gap-2"
      >
        {crumbs.length > 1 && (
          <Breadcrumb className="min-w-0 shrink">
            <BreadcrumbList className="flex-wrap text-xs">
              {crumbs.slice(0, -1).map((crumb, index) => (
                // Separators are siblings of items, not children: both render
                // <li>, so nesting them is invalid list markup.
                <Fragment key={`${crumb.label}-${index}`}>
                  <BreadcrumbItem className="min-w-0">
                    {crumb.to ? (
                      <BreadcrumbLink
                        asChild
                        className="truncate text-xs font-normal"
                      >
                        <Link to={crumb.to}>{crumb.label}</Link>
                      </BreadcrumbLink>
                    ) : (
                      <BreadcrumbPage className="truncate text-xs font-normal text-muted-foreground">
                        {crumb.label}
                      </BreadcrumbPage>
                    )}
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                </Fragment>
              ))}
            </BreadcrumbList>
          </Breadcrumb>
        )}

        <h1 className="truncate text-sm font-semibold tracking-tight text-foreground">
          {title ?? crumbs[crumbs.length - 1]?.label}
        </h1>

        {subtitle && (
          <p className="hidden truncate text-xs text-muted-foreground md:block">
            {subtitle}
          </p>
        )}
      </div>

      {/* shrink-0: the heading truncates first so the switcher never squashes. */}
      {nav && (
        <div data-slot="page-header-nav" className="flex shrink-0">
          {nav}
        </div>
      )}

      {/* `flex-nowrap` is deliberate — see the banner. Wrapping here would
          quietly undo the single-row contract on exactly the screens that are
          already too crowded. */}
      <div
        data-slot="page-header-actions"
        className="flex min-w-0 flex-1 flex-nowrap items-center justify-end gap-1.5"
      >
        {meta && (
          <div
            data-slot="page-header-meta"
            className="flex shrink-0 items-center gap-1.5"
          >
            {meta}
          </div>
        )}
        {children}
        {actions}
      </div>
    </header>
  );
}
