/**
 * components/projects/ProjectListRow.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * One project as a table row — the compact alternative to `ProjectCard` for
 * users with enough projects that a grid wastes room.
 *
 * Same data, same actions: it reuses `PROJECT_STATUS_META`, the icon
 * vocabulary, `ProjectHealthBadge`, and `formatFocusDuration`, so the two views
 * cannot drift apart. The row is the whole click target; the actions cell stops
 * propagation so its menu never opens the project.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createElement } from 'react';
import {
  MoreHorizontalIcon,
  PencilIcon,
  ArchiveIcon,
  Trash2Icon,
} from 'lucide-react';

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
import { TableRow, TableCell } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { projectHealth } from '@/lib/projects';
import { formatFocusDuration } from '@/components/tasks/FocusStatsStrip';
import { ProjectHealthBadge } from '@/components/projects/ProjectHealthBadge';
import {
  PROJECT_STATUS_META,
  projectIcon,
} from '@/components/projects/ProjectCard';
import type { ProjectRollup } from '@/main/ipc/channels';

export interface ProjectListRowProps {
  rollup: ProjectRollup;
  onOpen: (id: string) => void;
  onEdit: (rollup: ProjectRollup) => void;
  onArchive: (id: string, archived: boolean) => void;
  onDelete: (id: string) => void;
  /** HTML5 drag props from `useProjectDrag`, spread onto the row. */
  dragHandleProps?: {
    draggable: true;
    onDragStart: (e: React.DragEvent) => void;
    onDragEnd: () => void;
  };
  dropProps?: {
    onDragOver: (e: React.DragEvent) => void;
    onDragEnter: (e: React.DragEvent) => void;
    onDragLeave: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
  };
  dragging?: boolean;
  over?: boolean;
}

export function ProjectListRow({
  rollup,
  onOpen,
  onEdit,
  onArchive,
  onDelete,
  dragHandleProps,
  dropProps,
  dragging,
  over,
}: ProjectListRowProps) {
  const { project } = rollup;
  const status = PROJECT_STATUS_META[project.status];
  const health = projectHealth(rollup);
  const isInbox = project.id === 'inbox';

  const pct =
    rollup.taskTotal > 0
      ? Math.round((rollup.taskDone / rollup.taskTotal) * 100)
      : 0;

  return (
    <TableRow
      {...dragHandleProps}
      {...dropProps}
      onClick={() => onOpen(project.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen(project.id);
      }}
      className={cn(
        'cursor-pointer',
        dragging && 'opacity-40',
        over && 'bg-primary/5 ring-1 ring-inset ring-primary/30',
      )}
    >
      <TableCell>
        <div className="flex items-center gap-2.5">
          <div
            className="flex size-7 shrink-0 items-center justify-center rounded-md border bg-muted/40 text-muted-foreground"
            style={
              project.color
                ? { color: project.color, borderColor: `${project.color}55` }
                : undefined
            }
          >
            {createElement(projectIcon(project.icon), {
              className: 'size-3.5',
            })}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-medium">
                {project.name}
              </span>
              <ProjectHealthBadge level={health} />
            </div>
            {project.description && (
              <p className="max-w-md truncate text-xs text-muted-foreground">
                {project.description}
              </p>
            )}
          </div>
        </div>
      </TableCell>

      <TableCell>
        <Badge
          variant="outline"
          className={cn('text-[10px] font-normal', status.className)}
        >
          {status.label}
        </Badge>
      </TableCell>

      <TableCell className="w-40">
        <div className="flex items-center gap-2">
          <Progress value={pct} className="h-1.5 w-20" />
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {rollup.taskTotal === 0
              ? '—'
              : `${rollup.taskDone}/${rollup.taskTotal}`}
          </span>
        </div>
      </TableCell>

      <TableCell className="text-[11px] tabular-nums text-muted-foreground">
        {rollup.overdue > 0 ? (
          <span className="font-medium text-rose-400">{rollup.overdue}</span>
        ) : (
          '—'
        )}
      </TableCell>

      <TableCell className="text-[11px] tabular-nums text-muted-foreground">
        {rollup.focusSecToday > 0
          ? formatFocusDuration(rollup.focusSecToday)
          : '—'}
      </TableCell>

      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
        {!isInbox && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-7">
                <MoreHorizontalIcon className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
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
      </TableCell>
    </TableRow>
  );
}
