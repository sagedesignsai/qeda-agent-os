/**
 * components/tasks/TodayTimeline.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The "Today" surface of the focus system.
 *
 * A calm, chronological view of the day's time blocks with a one-tap path into
 * focus mode. It exists so the user has a single, finite list to look at —
 * the board is for planning, this is for *doing*.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import {
  CalendarPlusIcon,
  CircleIcon,
  ClockIcon,
  FocusIcon,
  Loader2Icon,
  MoreHorizontalIcon,
  SparklesIcon,
  Trash2Icon,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { FocusStatsStrip } from './FocusStatsStrip';
import { ScheduleBlockDialog } from './ScheduleBlockDialog';
import type {
  FocusStats,
  Task,
  TaskBlockWithTask,
} from '@/main/ipc/channels';

type BlockStatus = TaskBlockWithTask['status'];

const BLOCK_STATUS: Record<
  BlockStatus,
  { label: string; dot: string; fill: string; text: string }
> = {
  planned: {
    label: 'Planned',
    dot: 'bg-zinc-400',
    fill: 'fill-zinc-400',
    text: 'text-muted-foreground',
  },
  active: {
    label: 'In progress',
    dot: 'bg-sky-500',
    fill: 'fill-sky-500',
    text: 'text-sky-500',
  },
  done: {
    label: 'Done',
    dot: 'bg-emerald-500',
    fill: 'fill-emerald-500',
    text: 'text-emerald-500',
  },
  skipped: {
    label: 'Skipped',
    dot: 'bg-zinc-600',
    fill: 'fill-zinc-600',
    text: 'text-muted-foreground line-through',
  },
};

const ALL_STATUSES: BlockStatus[] = ['planned', 'active', 'done', 'skipped'];

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

export interface TodayTimelineProps {
  tasks: Task[];
  stats: FocusStats | null;
  statsLoading?: boolean;
  /** Bump to force a reload of blocks (e.g. after a task changes). */
  refreshSignal?: number;
  onFocusTask: (task: Task) => void;
}

export function TodayTimeline({
  tasks,
  stats,
  statsLoading,
  refreshSignal = 0,
  onFocusTask,
}: TodayTimelineProps) {
  const [blocks, setBlocks] = useState<TaskBlockWithTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [planning, setPlanning] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [presetTaskId, setPresetTaskId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const from = startOfToday();
      const rows = await window.electron.ipc.invoke<TaskBlockWithTask[]>(
        'tasks:blocks-list',
        { from, to: from + 86_400 },
      );
      setBlocks(rows ?? []);
    } catch {
      toast.error('Could not load today’s blocks');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshSignal]);

  const updateStatus = async (block: TaskBlockWithTask, status: BlockStatus) => {
    setBlocks((prev) =>
      prev.map((b) => (b.id === block.id ? { ...b, status } : b)),
    );
    try {
      await window.electron.ipc.invoke('tasks:block-update', {
        id: block.id,
        status,
      });
    } catch {
      toast.error('Could not update block');
      void load();
    }
  };

  const removeBlock = async (block: TaskBlockWithTask) => {
    setBlocks((prev) => prev.filter((b) => b.id !== block.id));
    try {
      await window.electron.ipc.invoke('tasks:block-delete', { id: block.id });
    } catch {
      toast.error('Could not delete block');
      void load();
    }
  };

  const planMyDay = async () => {
    setPlanning(true);
    try {
      const result = await window.electron.ipc.invoke<{
        blocks: unknown[];
        note: string;
      }>('tasks:plan-day', {});
      await load();
      if ((result.blocks ?? []).length === 0) {
        toast.info('Nothing to schedule', {
          description: result.note?.slice(0, 140),
        });
      } else {
        toast.success(`Planned ${result.blocks.length} block${result.blocks.length > 1 ? 's' : ''}`, {
          description: result.note?.slice(0, 140),
        });
      }
    } catch {
      toast.error('Could not plan your day', {
        description: 'Check your model settings and try again.',
      });
    } finally {
      setPlanning(false);
    }
  };

  const openTasks = tasks.filter((t) => t.status !== 'done');
  const nowSec = Math.floor(Date.now() / 1000);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-4">
      <FocusStatsStrip stats={stats} loading={statsLoading} />

      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">{format(new Date(), 'EEEE')}</h2>
          <p className="text-xs text-muted-foreground">
            {format(new Date(), 'MMMM d')} · {blocks.length} block
            {blocks.length === 1 ? '' : 's'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 text-xs"
            onClick={() => void planMyDay()}
            disabled={planning || openTasks.length === 0}
          >
            {planning ? (
              <Loader2Icon className="size-3 animate-spin" />
            ) : (
              <SparklesIcon className="size-3 text-amber-500" />
            )}
            Plan my day
          </Button>
          <Button
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => {
              setPresetTaskId(null);
              setScheduleOpen(true);
            }}
          >
            <CalendarPlusIcon className="size-3" />
            Block time
          </Button>
        </div>
      </div>

      {/* Timeline */}
      {loading ? (
        <div className="flex flex-1 items-center justify-center py-16">
          <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : blocks.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/50 py-16 text-center">
          <ClockIcon className="size-6 text-muted-foreground/50" />
          <div>
            <p className="text-sm font-medium">Nothing blocked yet</p>
            <p className="text-xs text-muted-foreground">
              Let the copilot shape your day, or block one thing yourself.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 text-xs"
            onClick={() => void planMyDay()}
            disabled={planning || openTasks.length === 0}
          >
            <SparklesIcon className="size-3 text-amber-500" />
            Plan my day
          </Button>
        </div>
      ) : (
        <ol className="flex flex-col gap-2">
          {blocks.map((block) => {
            const meta = BLOCK_STATUS[block.status];
            const task = tasks.find((t) => t.id === block.task_id) ?? null;
            const label = block.task_title || block.title || 'Untitled block';
            const isNow =
              nowSec >= block.start_at &&
              nowSec < block.end_at &&
              block.status !== 'done';
            const mins = Math.round((block.end_at - block.start_at) / 60);

            return (
              <li
                key={block.id}
                className={cn(
                  'group flex items-center gap-3 rounded-lg border border-border/60 bg-card px-3 py-2.5',
                  isNow && 'border-sky-500/50 ring-1 ring-sky-500/20',
                )}
              >
                {/* Time rail */}
                <div className="flex w-12 shrink-0 flex-col items-end">
                  <span className="text-xs font-medium tabular-nums">
                    {format(block.start_at * 1000, 'HH:mm')}
                  </span>
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    {format(block.end_at * 1000, 'HH:mm')}
                  </span>
                </div>

                <span className={cn('size-1.5 shrink-0 rounded-full', meta.dot)} />

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      'truncate text-sm font-medium',
                      block.status === 'done' && 'text-muted-foreground line-through',
                    )}
                  >
                    {label}
                  </p>
                  <p className={cn('text-[10px]', meta.text)}>
                    {meta.label} · {mins}m
                    {isNow && ' · now'}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex shrink-0 items-center gap-1">
                  {task && task.status !== 'done' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 gap-1 text-[11px] text-muted-foreground"
                      onClick={() => onFocusTask(task)}
                    >
                      <FocusIcon className="size-3" />
                      Focus
                    </Button>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-7 opacity-0 transition-opacity group-hover:opacity-100"
                      >
                        <MoreHorizontalIcon className="size-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                      <DropdownMenuLabel>Mark as</DropdownMenuLabel>
                      {ALL_STATUSES.map((status) => (
                        <DropdownMenuItem
                          key={status}
                          onClick={() => void updateStatus(block, status)}
                        >
                          <CircleIcon
                            className={cn(
                              'mr-2 size-2',
                              BLOCK_STATUS[status].fill,
                            )}
                          />
                          {BLOCK_STATUS[status].label}
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => void removeBlock(block)}
                      >
                        <Trash2Icon className="mr-2 size-3" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <ScheduleBlockDialog
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        tasks={openTasks}
        presetTaskId={presetTaskId}
        onSaved={() => void load()}
      />
    </div>
  );
}
