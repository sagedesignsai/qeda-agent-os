/**
 * components/projects/ProjectCard.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * One project at a glance: how far along it is, what's overdue, how much focus
 * it has received today, and when it's due. The card is the whole point of the
 * Projects page — every number here comes from a single `projects:rollups`
 * query rather than being stitched together in the UI.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { formatDistanceToNow } from 'date-fns';
import {
  AlertTriangleIcon,
  ArchiveIcon,
  CalendarClockIcon,
  CheckCircle2Icon,
  FolderIcon,
  FolderKanbanIcon,
  InboxIcon,
  MoreHorizontalIcon,
  PencilIcon,
  TargetIcon,
  TerminalSquareIcon,
  Trash2Icon,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { formatFocusDuration } from '@/components/tasks/FocusStatsStrip';
import type { ProjectRollup, ProjectStatus } from '@/main/ipc/channels';

/** Map the small icon vocabulary stored on a project to lucide components. */
const ICONS: Record<string, LucideIcon> = {
  inbox: InboxIcon,
  folder: FolderIcon,
  target: TargetIcon,
  kanban: FolderKanbanIcon,
};

export function projectIcon(name: string | null | undefined): LucideIcon {
  return (name && ICONS[name]) || FolderKanbanIcon;
}

export const PROJECT_STATUS_META: Record<
  ProjectStatus,
  { label: string; className: string }
> = {
  active: { label: 'Active', className: 'text-emerald-400 border-emerald-500/40' },
  paused: { label: 'Paused', className: 'text-amber-400 border-amber-500/40' },
  done: { label: 'Done', className: 'text-sky-400 border-sky-500/40' },
  archived: { label: 'Archived', className: 'text-zinc-400 border-zinc-500/40' },
};

interface ProjectCardProps {
  rollup: ProjectRollup;
  onOpen: (id: string) => void;
  onEdit: (rollup: ProjectRollup) => void;
  onArchive: (id: string, archived: boolean) => void;
  onDelete: (id: string) => void;
  className?: string;
}

export function ProjectCard({
  rollup,
  onOpen,
  onEdit,
  onArchive,
  onDelete,
  className,
}: ProjectCardProps) {
  const { project } = rollup;
  const Icon = projectIcon(project.icon);
  const status = PROJECT_STATUS_META[project.status];

  const pct =
    rollup.taskTotal > 0
      ? Math.round((rollup.taskDone / rollup.taskTotal) * 100)
      : 0;

  const deadline =
    project.deadline !== null
      ? new Date(project.deadline * 1000)
      : null;
  const overdueDeadline = deadline !== null && deadline.getTime() < Date.now();
  const isInbox = project.id === 'inbox';

  // A div with the button role, not a <button>: the card contains its own
  // action buttons, and interactive elements may not nest.
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(project.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(project.id);
        }
      }}
      className={cn(
        'group relative flex w-full cursor-pointer flex-col gap-3 rounded-xl border bg-card/40 p-4 text-left transition-colors',
        'hover:border-primary/40 hover:bg-card/70',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted/40 text-muted-foreground"
          style={
            project.color
              ? { color: project.color, borderColor: `${project.color}55` }
              : undefined
          }
        >
          <Icon className="size-4" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{project.name}</span>
            <Badge
              variant="outline"
              className={cn('shrink-0 text-[10px] font-normal', status.className)}
            >
              {status.label}
            </Badge>
          </div>
          {project.description && (
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
              {project.description}
            </p>
          )}
        </div>

        {/* Actions are unavailable on the Inbox (it can't be deleted). */}
        {!isInbox && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 shrink-0 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontalIcon className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              onClick={(e) => e.stopPropagation()}
            >
              <DropdownMenuItem onClick={() => onEdit(rollup)}>
                <PencilIcon className="size-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  onArchive(project.id, project.status !== 'archived')
                }
              >
                <ArchiveIcon className="size-4" />
                {project.status === 'archived' ? 'Unarchive' : 'Archive'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => onDelete(project.id)}
              >
                <Trash2Icon className="size-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Progress */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>
            {rollup.taskTotal === 0
              ? 'No tasks yet'
              : `${rollup.taskDone}/${rollup.taskTotal} done`}
          </span>
          <span className="tabular-nums">{pct}%</span>
        </div>
        <Progress value={pct} className="h-1.5" />
      </div>

      {/* Meta strip */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        {rollup.taskActive > 0 && (
          <span className="inline-flex items-center gap-1">
            <CheckCircle2Icon className="size-3 text-emerald-500/80" />
            {rollup.taskActive} active
          </span>
        )}
        {rollup.overdue > 0 && (
          <span className="inline-flex items-center gap-1 font-medium text-rose-400">
            <AlertTriangleIcon className="size-3" />
            {rollup.overdue} overdue
          </span>
        )}
        {rollup.focusSecToday > 0 && (
          <span className="inline-flex items-center gap-1">
            {formatFocusDuration(rollup.focusSecToday)} today
          </span>
        )}
        {rollup.blocksToday > 0 && (
          <span className="inline-flex items-center gap-1">
            <CalendarClockIcon className="size-3" />
            {rollup.blocksToday} block{rollup.blocksToday === 1 ? '' : 's'}
          </span>
        )}
        {deadline && (
          <span
            className={cn(
              'inline-flex items-center gap-1',
              overdueDeadline && 'font-medium text-rose-400',
            )}
          >
            <TargetIcon className="size-3" />
            {formatDistanceToNow(deadline, { addSuffix: true })}
          </span>
        )}
        {project.repo_path && (
          <span className="inline-flex min-w-0 items-center gap-1">
            <TerminalSquareIcon className="size-3 shrink-0" />
            <span className="truncate font-mono">{project.repo_path}</span>
          </span>
        )}
      </div>
    </div>
  );
}
