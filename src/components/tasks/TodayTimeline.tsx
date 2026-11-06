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

import { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import {
  CalendarPlusIcon,
  CheckIcon,
  CircleIcon,
  ClockIcon,
  FocusIcon,
  Loader2Icon,
  ListTodoIcon,
  MoreHorizontalIcon,
  SparklesIcon,
  SunIcon,
  Trash2Icon,
  ZapIcon,
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
import { useGamification } from '@/hooks/use-gamification';
import { triggerParticleBurst } from '@/components/gamification/ParticleCanvas';
import { XP_REWARDS } from '@/lib/gamification';
import { localDayKey } from '@/lib/focus/daily-key';
import { ScheduleBlockDialog } from './ScheduleBlockDialog';
import { MorningKickoffDialog } from './MorningKickoffDialog';
import { TodayEmptyHero } from './TodayEmptyHero';
import { ActiveLaunchpad } from './ActiveLaunchpad';
import { getNextBestMove } from '@/lib/task-recommendations';
import type {
  FocusStats,
  StepProgress,
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
  stepProgress?: Record<string, StepProgress>;
  /** Bump to force a reload of blocks (e.g. after a task changes). */
  refreshSignal?: number;
  /** Scope the timeline to one project, for a project's Today view. */
  projectId?: string | null;
  onFocusTask: (task: Task) => void;
  onOpenSteps?: (task: Task) => void;
  onSendPrompt?: (prompt: string) => void;
  onOpenBrainDump?: () => void;
}

export function TodayTimeline({
  tasks,
  stats,
  stepProgress,
  refreshSignal = 0,
  projectId,
  onFocusTask,
  onOpenSteps,
  onSendPrompt,
  onOpenBrainDump,
}: TodayTimelineProps) {
  const [blocks, setBlocks] = useState<TaskBlockWithTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [planning, setPlanning] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [kickoffOpen, setKickoffOpen] = useState(false);
  const [presetTaskId, setPresetTaskId] = useState<string | null>(null);
  const [shuffleIndex, setShuffleIndex] = useState(0);
  const gamification = useGamification();

  const recommendation = useMemo(
    () => getNextBestMove({ tasks, stepProgress, shuffleIndex }),
    [tasks, stepProgress, shuffleIndex],
  );

  const load = useCallback(async () => {
    try {
      const from = startOfToday();
      const rows = await window.electron.ipc.invoke<TaskBlockWithTask[]>(
        'tasks:blocks-list',
        { from, to: from + 86_400, projectId: projectId ?? null },
      );
      setBlocks(rows ?? []);
    } catch {
      toast.error('Could not load today’s blocks');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load, refreshSignal]);

  const updateStatus = async (
    block: TaskBlockWithTask,
    status: BlockStatus,
  ) => {
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
      }>('tasks:plan-day', { projectId: projectId ?? null });
      await load();
      if ((result.blocks ?? []).length === 0) {
        toast.info('Nothing to schedule', {
          description: result.note?.slice(0, 140),
        });
      } else {
        void gamification.awardXp(
          XP_REWARDS.DAY_PLAN,
          'ai_day_plan',
          undefined,
          `ai_day_plan:${localDayKey()}`,
        );
        triggerParticleBurst(window.innerWidth / 2, window.innerHeight / 2);
        toast.success(
          `Planned ${result.blocks.length} block${result.blocks.length > 1 ? 's' : ''} (+40 XP)`,
          {
            description: result.note?.slice(0, 140),
          },
        );
      }
    } catch {
      toast.error('Could not plan your day', {
        description: 'Check your model settings and try again.',
      });
    } finally {
      setPlanning(false);
    }
  };

  const openTasks = useMemo(
    () => tasks.filter((t) => t.status !== 'done'),
    [tasks],
  );
  // Coarse ticker so the "now" highlight + header date stay fresh while idle.
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = window.setInterval(
      () => setNowSec(Math.floor(Date.now() / 1000)),
      60_000,
    );
    return () => window.clearInterval(id);
  }, []);
  const today = useMemo(() => new Date(nowSec * 1000), [nowSec]);

  // Right-column "Up next" queue: open tasks sorted by status, priority,
  // then due date — the same activation-first order the lens uses.
  const queue = useMemo(
    () =>
      [...openTasks].sort((a, b) => {
        if (a.status === 'active' && b.status !== 'active') return -1;
        if (b.status === 'active' && a.status !== 'active') return 1;
        if (a.priority !== b.priority) return a.priority - b.priority;
        const ad = a.due_at ?? Number.MAX_SAFE_INTEGER;
        const bd = b.due_at ?? Number.MAX_SAFE_INTEGER;
        return ad - bd;
      }),
    [openTasks],
  );
  const scheduledTaskIds = useMemo(
    () => new Set(blocks.map((b) => b.task_id).filter(Boolean) as string[]),
    [blocks],
  );
  const doneCount = blocks.filter((b) => b.status === 'done').length;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-4 lg:overflow-hidden">
     
      {/* Timeline — 2-col dashboard on desktop (fixed header, columns scroll
          internally so the page itself never scrolls), stacked scroll on small. */}
      {loading ? (
        <div className="flex flex-1 items-center justify-center py-16">
          <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : blocks.length === 0 ? (
        <div className="flex min-h-0 flex-col gap-3 lg:flex-1 lg:flex-row">
          {/* Left: kickoff hero */}
          <section className="flex min-w-0 flex-col lg:min-h-0 lg:flex-1">
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pr-1">
              <TodayEmptyHero
                recommendation={recommendation}
                openTasksCount={openTasks.length}
                streakDays={stats?.streakDays ?? gamification.state?.streakDays ?? 0}
                onStartFlow={(task, e) => {
                  triggerParticleBurst(e.clientX, e.clientY);
                  onFocusTask(task);
                }}
                onOpenSteps={onOpenSteps}
                onShuffle={() => setShuffleIndex((prev) => prev + 1)}
                onOpenKickoff={() => setKickoffOpen(true)}
                onAutoPlan={() => void planMyDay()}
                onSendPrompt={onSendPrompt}
                onOpenBrainDump={onOpenBrainDump}
                planning={planning}
              />
            </div>
          </section>

          {/* Right: Up next (same queue as the scheduled dashboard, minus
              Copilot/Launchpad which the hero already owns). Keeps the empty
              day a 2-col fixed dashboard instead of a scrolling card. */}
          <aside className="flex w-full shrink-0 flex-col gap-3 pr-1 lg:min-h-0 lg:w-[340px] lg:overflow-y-auto">
            <section className="flex min-h-0 flex-1 flex-col rounded-lg border border-border/60 bg-card/40">
              <header className="flex shrink-0 items-center justify-between px-3 pt-2.5 pb-1.5">
                <h3 className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                  <ListTodoIcon className="size-3.5" />
                  Up next
                </h3>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {queue.length} open
                </span>
              </header>
              {queue.length === 0 ? (
                <p className="px-3 pb-3 text-xs text-muted-foreground">
                  Nothing open. Brain-dump a thought or create a task to get
                  going.
                </p>
              ) : (
                <ul className="flex flex-col gap-1 px-2 pb-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
                  {queue.slice(0, 8).map((task) => {
                    const prog =
                      stepProgress?.[task.id] ??
                      ({ total: 0, done: 0 } as const);
                    return (
                      <li
                        key={task.id}
                        className="flex items-center gap-2 rounded-md border border-border/40 bg-card px-2.5 py-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium">
                            {task.title}
                          </p>
                          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                            <span
                              className={cn(
                                'font-medium',
                                task.priority === 1
                                  ? 'text-rose-400'
                                  : task.priority === 2
                                    ? 'text-amber-400'
                                    : 'text-muted-foreground',
                              )}
                            >
                              P{task.priority}
                            </span>
                            {task.estimate_mins ? (
                              <span className="flex items-center gap-0.5 tabular-nums">
                                <ClockIcon className="size-2.5" />
                                {task.estimate_mins}m
                              </span>
                            ) : null}
                            {prog.total > 0 ? (
                              <span className="flex items-center gap-0.5 tabular-nums">
                                <CheckIcon className="size-2.5" />
                                {prog.done}/{prog.total}
                              </span>
                            ) : null}
                            {task.status === 'active' ? (
                              <span className="text-emerald-500">· Active</span>
                            ) : null}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 shrink-0 gap-1 text-[11px] text-muted-foreground"
                          onClick={() => onFocusTask(task)}
                        >
                          <ZapIcon className="size-3" />
                          Start…
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="shrink-0 rounded-lg border border-dashed border-border/60 bg-card/30 px-3 py-3">
              <p className="text-xs font-medium">No blocks yet</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Schedule time for what matters most. Blocks turn open tasks
                into a real plan.
              </p>
              <Button
                size="sm"
                className="mt-2 h-7 gap-1.5 text-xs"
                onClick={() => {
                  setPresetTaskId(null);
                  setScheduleOpen(true);
                }}
              >
                <CalendarPlusIcon className="size-3" />
                Block time
              </Button>
            </section>
          </aside>
        </div>
      ) : (
        <div className="flex min-h-0 flex-col gap-3 lg:flex-1 lg:flex-row">
          {/* Left: schedule */}
          <section className="flex min-w-0 flex-col lg:min-h-0 lg:flex-1">
            <header className="flex items-center justify-between px-1 pb-2">
              <h3 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                Schedule
              </h3>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {doneCount}/{blocks.length} done
                {doneCount === blocks.length ? ' · all clear' : ''}
              </span>
            </header>
            <ol className="flex flex-col gap-2 pr-1 pb-1 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
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

                  <span
                    className={cn('size-1.5 shrink-0 rounded-full', meta.dot)}
                  />

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        'truncate text-sm font-medium',
                        block.status === 'done' &&
                          'text-muted-foreground line-through',
                      )}
                    >
                      {label}
                    </p>
                    <p className={cn('text-[10px]', meta.text)}>
                      {meta.label} · {mins}m{isNow && ' · now'}
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
                        Start…
                      </Button>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Block actions"
                          className="size-7 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 max-sm:opacity-100"
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
          </section>

          {/* Right: focus queue — next move + open tasks that are not
              already on the schedule. Scrolls internally; the page does not. */}
          <aside className="flex w-full shrink-0 flex-col gap-3 pr-1 lg:min-h-0 lg:w-[340px] lg:overflow-y-auto">
            <button
              type="button"
              onClick={() =>
                onSendPrompt?.(
                  'Review my current schedule for today, suggest optimizations, or help adjust my plan.',
                )
              }
              className="group flex w-full shrink-0 items-center gap-2.5 rounded-lg border border-border/60 bg-card/60 px-3.5 py-2 text-left text-xs text-muted-foreground transition-all hover:border-amber-500/40 hover:bg-card hover:text-foreground"
            >
              <SparklesIcon className="size-3.5 shrink-0 text-amber-500 transition-transform group-hover:scale-110" />
              <span className="min-w-0 flex-1 truncate">
                Ask Copilot to re-balance today…
              </span>
              <span className="shrink-0 rounded border border-border/60 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                Copilot
              </span>
            </button>

            <ActiveLaunchpad
              recommendation={recommendation}
              onStartFlow={(task, e) => {
                triggerParticleBurst(e.clientX, e.clientY);
                onFocusTask(task);
              }}
              onOpenSteps={onOpenSteps ?? (() => undefined)}
              onShuffle={() => setShuffleIndex((prev) => prev + 1)}
            />

            <section className="flex min-h-0 flex-1 flex-col rounded-lg border border-border/60 bg-card/40">
              <header className="flex shrink-0 items-center justify-between px-3 pt-2.5 pb-1.5">
                <h3 className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                  <ListTodoIcon className="size-3.5" />
                  Up next
                </h3>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {queue.length} open
                </span>
              </header>
              {queue.length === 0 ? (
                <p className="px-3 pb-3 text-xs text-muted-foreground">
                  Nothing open. Brain-dump a thought or create a task to get
                  going.
                </p>
              ) : (
                <ul className="flex flex-col gap-1 px-2 pb-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
                  {queue.slice(0, 8).map((task) => {
                    const prog =
                      stepProgress?.[task.id] ??
                      ({ total: 0, done: 0 } as const);
                    const scheduled = scheduledTaskIds.has(task.id);
                    return (
                      <li
                        key={task.id}
                        className="flex items-center gap-2 rounded-md border border-border/40 bg-card px-2.5 py-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium">
                            {task.title}
                          </p>
                          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                            <span
                              className={cn(
                                'font-medium',
                                task.priority === 1
                                  ? 'text-rose-400'
                                  : task.priority === 2
                                    ? 'text-amber-400'
                                    : 'text-muted-foreground',
                              )}
                            >
                              P{task.priority}
                            </span>
                            {task.estimate_mins ? (
                              <span className="flex items-center gap-0.5 tabular-nums">
                                <ClockIcon className="size-2.5" />
                                {task.estimate_mins}m
                              </span>
                            ) : null}
                            {prog.total > 0 ? (
                              <span className="flex items-center gap-0.5 tabular-nums">
                                <CheckIcon className="size-2.5" />
                                {prog.done}/{prog.total}
                              </span>
                            ) : null}
                            {scheduled ? (
                              <span className="text-sky-500">· Scheduled</span>
                            ) : null}
                            {task.status === 'active' ? (
                              <span className="text-emerald-500">· Active</span>
                            ) : null}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 shrink-0 gap-1 text-[11px] text-muted-foreground"
                          onClick={() => onFocusTask(task)}
                        >
                          <ZapIcon className="size-3" />
                          Start…
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </aside>
        </div>
      )}

      <ScheduleBlockDialog
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        tasks={openTasks}
        presetTaskId={presetTaskId}
        projectId={projectId ?? null}
        onSaved={() => void load()}
      />

      <MorningKickoffDialog
        open={kickoffOpen}
        onOpenChange={setKickoffOpen}
        tasks={tasks}
        projectId={projectId}
        onScheduled={() => void load()}
        onStartFocus={onFocusTask}
      />
    </div>
  );
}
