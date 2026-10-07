/**
 * components/projects/ProjectOverviewPanel.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The "more" on a project's detail page: where the focus time has gone, what
 * moved recently, and how much adjacent work hangs off the project.
 *
 * All of it comes from a single `projects:overview` read so the panel is one
 * query round-trip, and every section is purely presentational — the trend is
 * plain flex bars rather than a charting library, keeping the panel dependency-
 * free and cheap to render in tests.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Link } from 'react-router';
import {
  FileTextIcon,
  MessageSquareIcon,
  TerminalIcon,
  VideoIcon,
  ActivityIcon,
  TargetIcon,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { formatFocusDuration } from '@/components/tasks/FocusStatsStrip';
import type { ProjectOverview } from '@/main/ipc/channels';

const STATUS_DOT: Record<string, string> = {
  backlog: 'bg-zinc-400',
  active: 'bg-emerald-500',
  done: 'bg-sky-500',
};

export interface ProjectOverviewPanelProps {
  overview: ProjectOverview | null;
  loading?: boolean;
  className?: string;
}

export function ProjectOverviewPanel({
  overview,
  loading = false,
  className,
}: ProjectOverviewPanelProps) {
  if (loading || !overview) {
    return (
      <div className={cn('grid gap-4 md:grid-cols-2', className)}>
        <div className="h-40 animate-pulse rounded-xl border bg-card/40" />
        <div className="h-40 animate-pulse rounded-xl border bg-card/40" />
      </div>
    );
  }

  const { project, focusByDay, recentTasks, linked } = overview;
  const maxSec = Math.max(1, ...focusByDay.map((d) => d.sec));
  const windowTotal = focusByDay.reduce((sum, d) => sum + d.sec, 0);

  const linkedItems: Array<{
    icon: LucideIcon;
    label: string;
    value: number;
    to: string;
  }> = [
    {
      icon: FileTextIcon,
      label: 'Documents',
      value: linked.documents,
      to: `/documents?projectId=${project.id}`,
    },
    {
      icon: VideoIcon,
      label: 'Studio takes',
      value: linked.studioTakes,
      to: `/studio?projectId=${project.id}`,
    },
    {
      icon: TerminalIcon,
      label: 'Terminals',
      value: linked.terminalSessions,
      to: `/terminal?project=${project.id}`,
    },
    {
      icon: MessageSquareIcon,
      label: 'Chats',
      value: linked.chatSessions,
      to: `/chat?project=${project.id}`,
    },
  ];

  return (
    <div className={cn('grid gap-4 md:grid-cols-2', className)}>
      {/* Focus trend */}
      <section className="rounded-xl border bg-card/40 p-4">
        <header className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-xs font-medium">
            <ActivityIcon className="size-3.5 text-muted-foreground" />
            Focus trend
          </h3>
          <span className="text-[11px] text-muted-foreground">
            {formatFocusDuration(windowTotal)} in {focusByDay.length}d
          </span>
        </header>

        <div className="flex h-24 items-end gap-1">
          {focusByDay.map((d) => {
            const height =
              d.sec === 0 ? 2 : Math.max(6, (d.sec / maxSec) * 100);
            return (
              <div
                key={d.day}
                className="flex flex-1 flex-col items-center justify-end gap-1"
                title={`${d.day}: ${formatFocusDuration(d.sec)}`}
              >
                <div
                  className={cn(
                    'w-full rounded-sm',
                    d.sec > 0 ? 'bg-primary/70' : 'bg-muted',
                  )}
                  style={{ height: `${height}%` }}
                />
              </div>
            );
          })}
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
          <span>{focusByDay[0]?.day.slice(5)}</span>
          <span>{focusByDay[focusByDay.length - 1]?.day.slice(5)}</span>
        </div>
      </section>

      {/* Recent activity */}
      <section className="rounded-xl border bg-card/40 p-4">
        <h3 className="mb-3 text-xs font-medium">Recent tasks</h3>
        {recentTasks.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            No tasks in this project yet.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {recentTasks.map((task) => (
              <li
                key={task.id}
                className="flex items-center gap-2 text-xs"
                title={task.title}
              >
                <span
                  className={cn(
                    'size-1.5 shrink-0 rounded-full',
                    STATUS_DOT[task.status] ?? 'bg-zinc-400',
                  )}
                />
                <span
                  className={cn(
                    'min-w-0 flex-1 truncate',
                    task.status === 'done' &&
                      'text-muted-foreground line-through',
                  )}
                >
                  {task.title}
                </span>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {formatDistanceToNow(new Date(task.updated_at * 1000), {
                    addSuffix: true,
                  })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Linked work */}
      <section className="rounded-xl border bg-card/40 p-4 md:col-span-2">
        <h3 className="mb-3 flex items-center gap-1.5 text-xs font-medium">
          <TargetIcon className="size-3.5 text-muted-foreground" />
          Linked work
        </h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {linkedItems.map(({ icon: Icon, label, value, to }) => (
            <Link
              key={label}
              to={to}
              className="flex items-center gap-2 rounded-lg border bg-background/40 px-3 py-2 transition-colors hover:border-primary/40 hover:bg-card/70"
            >
              <Icon className="size-3.5 text-muted-foreground" />
              <span className="flex-1 text-[11px] text-muted-foreground">
                {label}
              </span>
              <span className="text-sm font-semibold tabular-nums">
                {value}
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
