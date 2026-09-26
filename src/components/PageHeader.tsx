/**
 * renderer/components/PageHeader.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Contextual header used by the main screens: a breadcrumb trail on the left
 * (Notion-style) with optional trailing actions, and an optional large title.
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
  actions?: ReactNode;
  /** Optional second row rendered below the breadcrumb/title. */
  children?: ReactNode;
  className?: string;
}

export function PageHeader({
  crumbs,
  title,
  subtitle,
  actions,
  children,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        'flex shrink-0 flex-col gap-2 border-b bg-card/20 px-4 py-2.5 backdrop-blur-xs',
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <SidebarTrigger className="-ml-1 shrink-0 text-muted-foreground" />
        <Breadcrumb className="min-w-0 flex-1">
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

        {actions && (
          <div className="flex shrink-0 items-center gap-1.5">{actions}</div>
        )}
      </div>

      {(title || subtitle) && (
        <div className="min-w-0">
          {title && (
            <h1 className="truncate text-base font-semibold tracking-tight text-foreground">
              {title}
            </h1>
          )}
          {subtitle && (
            <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
      )}

      {children}
    </header>
  );
}
