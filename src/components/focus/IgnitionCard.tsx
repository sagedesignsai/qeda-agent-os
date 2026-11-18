/**
 * components/focus/IgnitionCard.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The rail's empty state, which is not empty.
 *
 * `SidebarFocusPlayer` lives in the sidebar footer, so it is the only slot in
 * the app that is present on every route. With no session running it used to
 * render nothing — a void exactly where the invitation belongs. This card fills
 * it with ONE task, the first physical move inside that task, and a single
 * button that starts the clock without leaving the page.
 *
 * Deliberately dumb: it renders what it is given and reports two intents
 * (start, not now). Which task to offer, and what starting means, belong to
 * `lib/focus/ignite.ts` and the caller.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { ArrowRightIcon, XIcon, ZapIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export interface IgnitionCardProps {
  /** The first move — a step's title when the task has one. */
  firstMove: string;
  /** The task itself; shown small, because the whole task is what feels heavy. */
  taskTitle: string;
  rationale: string;
  /** e.g. `Sonic Genius · 10 min`. */
  meta: string;
  minutes: number;
  collapsed: boolean;
  onStart: (event: React.MouseEvent) => void;
  onDismiss: () => void;
}

export function IgnitionCard({
  firstMove,
  taskTitle,
  rationale,
  meta,
  minutes,
  collapsed,
  onStart,
  onDismiss,
}: IgnitionCardProps) {
  if (collapsed) {
    return (
      <div className="flex justify-center pb-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onStart}
              aria-label={`Start a ${minutes} minute flow: ${taskTitle}`}
              className={cn(
                'relative mx-auto flex size-8 items-center justify-center rounded-md',
                'bg-amber-500/10 ring-1 ring-amber-500/40 transition-colors',
                'hover:bg-amber-500/20 hover:ring-amber-400',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400',
              )}
            >
              <ZapIcon className="size-4 fill-amber-400 text-amber-400" />
              <span
                className="absolute top-1 right-1 size-1 animate-pulse rounded-full bg-amber-400"
                aria-hidden
              />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            <p className="max-w-[14rem] truncate font-medium">{taskTitle}</p>
            <p className="max-w-[14rem] text-[11px] text-muted-foreground">
              Start a {minutes} minute flow
            </p>
          </TooltipContent>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-amber-500/30 bg-gradient-to-b from-amber-500/10 via-sidebar-accent/25 to-transparent shadow-sm">
      <div className="flex items-center justify-between gap-1 px-2 pt-1.5">
        <span className="flex min-w-0 items-center gap-1.5 text-[10px] font-semibold tracking-wider text-amber-500 uppercase">
          <ZapIcon className="size-3 shrink-0 fill-amber-500 text-amber-500" />
          <span className="truncate">Next up</span>
        </span>
        <div className="flex shrink-0 items-center gap-0.5">
          <Badge
            variant="secondary"
            className="h-4 border-0 bg-amber-500/15 px-1 text-[9px] font-bold text-amber-500"
          >
            {minutes} min
          </Badge>
          <Button
            size="icon"
            variant="ghost"
            className="size-5 rounded-full text-muted-foreground hover:text-sidebar-foreground"
            onClick={onDismiss}
            title="Not now"
            aria-label="Not now — hide this until tomorrow"
          >
            <XIcon className="size-3" />
          </Button>
        </div>
      </div>

      <div className="px-2 pt-1 pb-1.5">
        <p
          className="line-clamp-2 text-[11px] leading-snug font-semibold text-sidebar-foreground"
          title={firstMove}
        >
          {firstMove}
        </p>
        <p
          className="mt-0.5 truncate text-[10px] text-muted-foreground"
          title={rationale}
        >
          {rationale}
        </p>
        <p
          className="mt-0.5 truncate text-[10px] text-muted-foreground/80"
          title={taskTitle}
        >
          {meta}
        </p>
      </div>

      <div className="flex items-center gap-1 px-1.5 pb-1.5">
        <Button
          size="sm"
          onClick={onStart}
          className="h-7 flex-1 gap-1.5 rounded-md bg-amber-500 px-2 text-[11px] font-semibold text-zinc-950 shadow-sm hover:bg-amber-400 active:scale-[0.99]"
        >
          <ArrowRightIcon className="size-3 stroke-[2.5]" />
          Start flow
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onDismiss}
          className="h-7 rounded-md px-1.5 text-[10px] text-muted-foreground hover:text-sidebar-foreground"
        >
          Not now
        </Button>
      </div>
    </div>
  );
}
