/**
 * components/PageHeader.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Contextual header used by the main screens.
 *
 * Two densities, because the screens have two different jobs:
 *
 *   density="default" – identity (breadcrumbs + title/subtitle) on top, a
 *     bordered action toolbar beneath. For screens whose actions need real
 *     horizontal room: Chat (context picker + asset search), Terminal (running
 *     service pill + mode switcher), Workspace (in-panel).
 *
 *   density="dense" – one `min-h-10` row carrying identity, meta and actions
 *     together. For the root System pages (Projects, Tasks, Documents)
 *     where a second row would just steal list height.
 *
 * In dense mode `crumbs` supplies ancestor links and the last crumb is
 * replaced by `title` (falling back to the crumb label). `subtitle` renders
 * inline after the heading and is hidden below `md`.
 *
 * `nav` is the one slot that is specific to the dense row: a view switcher
 * (tab strip, segmented control) placed immediately after the heading, before
 * the right-aligned `meta`/`children`/`actions` cluster. It is `shrink-0`, so
 * a long title truncates rather than squeezing it. Tabs that live here must be
 * rendered *inside* their `Tabs` root, which therefore wraps this component.
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
  crumbs: PageCrumb[];
  title?: ReactNode;
  subtitle?: ReactNode;
  /** View switcher (tabs, segmented control). Dense row only. */
  nav?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  /** Optional content rendered alongside actions in the second row. */
  children?: ReactNode;
  /**
   * `'dense'` folds everything into one row. Only the trailing crumb becomes a
   * heading, so pass a single-level `crumbs` unless there is a real ancestor to
   * link back to.
   */
  density?: 'default' | 'dense';
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
  density = 'default',
  className,
}: PageHeaderProps) {
  if (density === 'dense') {
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

        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1.5">
          {meta}
          {children}
          {actions}
        </div>
      </header>
    );
  }

  return (
    <header
      className={cn(
        'flex shrink-0 flex-col gap-3 border-b bg-card/20 px-5 py-4 backdrop-blur-xs',
        className,
      )}
    >
      <div
        data-slot="page-header-identity"
        className="flex min-w-0 flex-wrap items-start gap-x-3 gap-y-2"
      >
        <SidebarTrigger className="-ml-1 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1 basis-48">
          <Breadcrumb className="min-w-0">
            <BreadcrumbList className="text-xs">
              {crumbs.map((crumb, index) => {
                const isLast = index === crumbs.length - 1;
                return (
                  <Fragment key={`${crumb.label}-${index}`}>
                    <BreadcrumbItem className="min-w-0">
                      {isLast || !crumb.to ? (
                        <BreadcrumbPage className="truncate text-xs font-medium">
                          {crumb.label}
                        </BreadcrumbPage>
                      ) : (
                        <BreadcrumbLink asChild className="truncate text-xs">
                          <Link to={crumb.to}>{crumb.label}</Link>
                        </BreadcrumbLink>
                      )}
                    </BreadcrumbItem>
                    {!isLast && <BreadcrumbSeparator />}
                  </Fragment>
                );
              })}
            </BreadcrumbList>
          </Breadcrumb>

          {(title || subtitle) && (
            <div className="mt-1 min-w-0">
              {title && (
                <h1 className="truncate text-base font-semibold tracking-tight text-foreground">
                  {title}
                </h1>
              )}
              {subtitle && (
                <p className="truncate text-xs text-muted-foreground">
                  {subtitle}
                </p>
              )}
            </div>
          )}
        </div>
        {meta && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {meta}
          </div>
        )}
      </div>

      {(actions || children) && (
        <div
          data-slot="page-header-toolbar"
          className="flex flex-wrap items-center justify-between gap-3 border-t border-border/50 pt-3"
        >
          {children && <div className="min-w-0 flex-1">{children}</div>}
          {actions && (
            <div className="flex max-w-full flex-wrap items-center gap-2">
              {actions}
            </div>
          )}
        </div>
      )}
    </header>
  );
}
