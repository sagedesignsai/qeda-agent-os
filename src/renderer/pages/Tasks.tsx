/**
 * pages/Tasks.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The ADHD focus system: a *doing* surface (Today) and a *planning* surface
 * (Board), plus an AI copilot that removes the activation barrier.
 *
 *   ┌─ PageHeader (dense, one row) ───────────────────────────────────────────┐
 *   │  Tasks                                    [Level] [⋯] [New task]        │
 *   ├─ Tabs: Today | Board ───────────────────────────────────────────────────┤
 *   │  Today  → focus stats, time blocks, "Plan my day"                       │
 *   │  Board  → the three-column kanban                                       │
 *   └─────────────────────────────────────────────────────────────────────────┘
 *   [FocusMode overlay]  [TaskStepsSheet]  [DocumentDrafterSheet]  [Schedule]
 *
 * FocusMode pairs the pomodoro timer with a synthesised soundscape and records
 * every phase to the DB, which is what feeds the stats strip and streaks.
 *
 * WHY THE DRAFTER IS REACHED FROM TWO PLACES, AND NOT MORE
 * ──────────────────────────────────────────────────────
 * `DocumentDrafterSheet` writes a real document, so the moment to offer it is
 * the moment someone decides a task produces *paper* — not the moment they are
 * merely looking at the board. That argues for a per-task action rather than a
 * header button, and it argues against spraying it across every surface.
 *
 *   - The card's `⋯` menu, next to "Break down" and "Block time". This is the
 *     task's existing action vocabulary, and it reaches every task in every
 *     column without adding chrome to the card itself.
 *   - Focus mode, under "Complete Task". Focus is where people land when they
 *     are *about to do the thing*, and it is the only one of the two entry
 *     points the Today timeline can reach — it hands off to FocusMode rather
 *     than to the board's cards.
 *
 * Those two cover every path a task can be worked from; a third button on the
 * lens or in the header would be the carpeting the two above exist to avoid.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import { formatDistanceToNow } from 'date-fns';
import {
  ArrowRightIcon,
  BotIcon,
  BrainIcon,
  CalendarPlusIcon,
  CheckIcon,
  ChevronDownIcon,
  CircleDashedIcon,
  ClockIcon,
  FocusIcon,
  PencilIcon,
  Loader2Icon,
  Minimize2Icon,
  PauseIcon,
  PenLineIcon,
  PlayIcon,
  PlusIcon,
  RefreshCwIcon,
  SkipForwardIcon,
  SparklesIcon,
  TerminalSquareIcon,
  Trash2Icon,
  UndoIcon,
  WavesIcon,
  XIcon,
} from 'lucide-react';
import { toast } from 'sonner';

import { OverflowMenu } from '@/components/OverflowMenu';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { HeaderTab, HeaderTabStrip } from '@/components/HeaderTabStrip';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import { BrainDumpDialog } from '@/components/tasks/BrainDumpDialog';
import { WorkspacePicker } from '@/components/tasks/WorkspacePicker';
import { startTaskInWorkspace } from '@/lib/task-launch';
import type { WorkspaceKind } from '@/lib/workspace-suggestion';
import { DocumentDrafterSheet } from '@/components/documents/drafter/DocumentDrafterSheet';
import { TaskDialog } from '@/components/tasks/TaskDialog';
import {
  useTaskMutations,
  type CreateTaskInput,
  type UpdateTaskPatch,
} from '@/hooks/use-task-mutations';
import { useProjects } from '@/hooks/use-projects';
import { CopilotPanel } from '@/components/copilot/CopilotPanel';
import { FocusAudioPanel } from '@/components/tasks/FocusAudioPanel';
import { ScheduleBlockDialog } from '@/components/tasks/ScheduleBlockDialog';
import { TaskStepsSheet } from '@/components/tasks/TaskStepsSheet';
import { TodayTimeline } from '@/components/tasks/TodayTimeline';
import { useFocusSession } from '@/hooks/use-focus-session';
import { useSoundscape } from '@/hooks/use-soundscape';
import { useIpcEvent } from '@/hooks/use-ipc';
import { DURATION_PRESETS } from '@/lib/focus/presets';
import { useProjectScope } from '@/hooks/use-project-scope';
import { useTaskDrag } from '@/hooks/use-task-drag';

import { useGamification } from '@/hooks/use-gamification';
import { HeaderLevelChip } from '@/components/gamification/HeaderLevelChip';
import {
  ParticleCanvas,
  triggerParticleBurst,
} from '@/components/gamification/ParticleCanvas';
import { SingleTaskLens } from '@/components/tasks/SingleTaskLens';
import { ActiveLaunchpad } from '@/components/tasks/ActiveLaunchpad';
import {
  getNextBestMove,
  type TaskRecommendation,
} from '@/lib/task-recommendations';
import { xpForTaskPriority } from '@/lib/gamification';
import type { FocusStats, StepProgress, Task } from '@/main/ipc/channels';

// ─── Types & helpers ──────────────────────────────────────────────────────────

type Priority = 1 | 2 | 3;
type Status = Task['status'];

const PRIORITY_META: Record<
  Priority,
  { label: string; color: string; border: string }
> = {
  1: { label: 'High', color: 'text-rose-400', border: 'border-l-rose-500' },
  2: { label: 'Medium', color: 'text-amber-400', border: 'border-l-amber-500' },
  3: { label: 'Low', color: 'text-zinc-500', border: 'border-l-zinc-600' },
};

const STATUS_META: Record<
  Status,
  {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    next: Status | null;
  }
> = {
  backlog: { label: 'Backlog', icon: CircleDashedIcon, next: 'active' },
  active: { label: 'Active', icon: PlayIcon, next: 'done' },
  done: { label: 'Done', icon: CheckIcon, next: null },
};

const COLUMNS: Status[] = ['backlog', 'active', 'done'];

/**
 * The prompt the Document Drafter opens on, for a given task.
 *
 * WHY IT IS BUILT RATHER THAN JUST PASSING `task.title`
 * ──────────────────────────────────────────────────────
 * The task's own words are the brief. `description` is where the actual
 * instruction lives — a title like "Chase invoices" carries almost nothing, and
 * a drafter handed only that will produce a generic letter rather than one
 * about *these* invoices. So the title, the description and the project name all
 * travel together.
 *
 * The imperative at the top matters just as much. The drafter is an agent that
 * can discuss a document or write one, and given "Chase invoices" it will
 * cheerfully explain how it *would* draft the letter — a conversation where the
 * user wanted a deliverable. "Write it now, do not discuss it" closes that door.
 *
 * The `[CONFIRM: …]` rule is repeated here on purpose. The drafter's own
 * instructions already forbid inventing statute numbers and figures, but the
 * user is about to spend real time on the output — so the safety behaviour is
 * stated in the request rather than left as something they discover in the
 * prose. Stated once, it also keeps the rest of the prompt short enough to read
 * at a glance in the transcript.
 */
function buildDrafterPrompt(task: Task, projectName: string | null): string {
  const lines = [
    'Draft the document this task calls for — write it into my documents now rather than describing what you would write.',
    '',
    `Task: ${task.title}`,
  ];

  const description = task.description?.trim();
  if (description) {
    lines.push(`What it has to cover: ${description}`);
  }
  if (projectName) {
    lines.push(
      `Project: ${projectName} — use this project's material as your source.`,
    );
  }

  lines.push(
    '',
    'Choose the document type that best fits the task. Do not invent dates, figures, statutes or party details that are not in the material — mark each one [CONFIRM: …] and list the open placeholders when you are done.',
  );

  return lines.join('\n');
}

// ─── Task card ────────────────────────────────────────────────────────────────

interface TaskCardProps {
  task: Task;
  progress?: StepProgress;
  onMove: (id: string, to: Status) => void;
  onDelete: (id: string) => void;
  onFocus: (task: Task) => void;
  onOpenSteps: (task: Task) => void;
  onSchedule: (task: Task) => void;
  onEdit: (task: Task) => void;
  /** Open the Document Drafter scoped to this task. */
  onDraftDocument: (task: Task) => void;
  /** In-flight drag source; dims the card while it is being dragged. */
  isDragging?: boolean;
  /**
   * HTML5 drag source props from `useTaskDrag`. Typed loosely because
   * `motion.div` narrows the DOM drag handlers to its own element type.
   */
  dragProps?: Record<string, unknown>;
}

function TaskCard({
  task,
  progress,
  onMove,
  onDelete,
  onFocus,
  onOpenSteps,
  onSchedule,
  onEdit,
  onDraftDocument,
  isDragging = false,
  dragProps,
  nowSec,
}: TaskCardProps & { nowSec?: number }) {
  const pm = PRIORITY_META[task.priority as Priority];
  const sm = STATUS_META[task.status];
  // Freshness comes from `nowSec` (60s ticker in Tasks) so an idle card
  // left open across midnight flips to "overdue" without a mutation.
  const now = nowSec ?? Math.floor(Date.now() / 1000);
  const isOverdue =
    task.due_at !== null &&
    task.due_at !== undefined &&
    task.due_at < now &&
    task.status !== 'done';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.15 }}
      {...dragProps}
      className={cn(
        'group rounded-md border border-l-2 bg-card px-2.5 py-2 shadow-xs',
        pm.border,
        'border-border/60',
        'cursor-grab transition-opacity active:cursor-grabbing',
        isDragging && 'opacity-40',
      )}
    >
      {/* Title row */}
      <div className="flex items-start justify-between gap-1.5">
        <p
          className={cn(
            'line-clamp-2 text-xs font-medium leading-snug text-card-foreground',
            task.status === 'done' && 'text-muted-foreground line-through',
          )}
        >
          {task.title}
        </p>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Task actions for ${task.title}`}
              className="size-5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 max-sm:opacity-100"
            >
              <ChevronDownIcon className="size-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            {sm.next && (
              <DropdownMenuItem onClick={() => onMove(task.id, sm.next!)}>
                <ArrowRightIcon className="mr-2 size-3" />
                Move to {STATUS_META[sm.next].label}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => onEdit(task)}>
              <PencilIcon className="mr-2 size-3" />
              Edit
            </DropdownMenuItem>
            {task.status === 'done' && (
              <DropdownMenuItem onClick={() => onMove(task.id, 'active')}>
                <UndoIcon className="mr-2 size-3" />
                Reopen
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => onFocus(task)}>
              <FocusIcon className="mr-2 size-3" />
              Start in workspace…
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onOpenSteps(task)}>
              <SparklesIcon className="mr-2 size-3 text-amber-500" />
              Break down
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onSchedule(task)}>
              <CalendarPlusIcon className="mr-2 size-3" />
              Block time
            </DropdownMenuItem>
            {/*
              Last action before the destructive separator, so drafting reads
              as the final thing this menu offers rather than as part of the
              housekeeping. The icon is the drafter sheet's own, so the menu
              item and the panel it opens are visibly the same thing.
            */}
            <DropdownMenuItem onClick={() => onDraftDocument(task)}>
              <PenLineIcon className="mr-2 size-3 text-primary" />
              Draft document with AI
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => onDelete(task.id)}
            >
              <Trash2Icon className="mr-2 size-3" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Description snippet */}
      {task.description && (
        <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
          {task.description}
        </p>
      )}

      {/* Metadata row */}
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <Badge
          variant="outline"
          className={cn(
            'h-4 border-0 bg-transparent px-0 text-[10px]',
            pm.color,
          )}
        >
          {pm.label}
        </Badge>

        {progress && progress.total > 0 && (
          <button
            type="button"
            onClick={() => onOpenSteps(task)}
            aria-label={`Breakdown steps for ${task.title}`}
            className="flex items-center gap-1 rounded-full bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
          >
            <CheckIcon className="size-2.5" />
            {progress.done}/{progress.total}
          </button>
        )}

        {task.estimate_mins && (
          <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
            <ClockIcon className="size-2.5" />
            {task.estimate_mins}m
          </span>
        )}

        {task.pomodoro_count > 0 && (
          <span
            className="text-[10px] text-muted-foreground"
            title={`${task.pomodoro_count} pomodoros completed`}
          >
            🍅 ×{task.pomodoro_count}
          </span>
        )}

        {task.due_at && (
          <span
            title={new Date(task.due_at * 1000).toLocaleString()}
            className={cn(
              'flex items-center gap-0.5 text-[10px]',
              isOverdue ? 'text-rose-400' : 'text-muted-foreground',
            )}
          >
            <ClockIcon className="size-2.5" />
            {isOverdue
              ? 'overdue'
              : formatDistanceToNow(task.due_at * 1000, { addSuffix: true })}
          </span>
        )}
      </div>

      {/* Start button. Hover-revealed on desktop, always visible on touch
          (`max-sm`) — a hover-only control is undiscoverable without a pointer. */}
      {task.status !== 'done' && (
        <Button
          size="sm"
          variant="ghost"
          className="mt-1.5 h-5 w-full gap-1 text-[10px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 max-sm:opacity-100"
          onClick={() => onFocus(task)}
        >
          <FocusIcon className="size-3" />
          Start…
        </Button>
      )}
    </motion.div>
  );
}

// ─── Focus mode overlay ───────────────────────────────────────────────────────

interface FocusModeProps {
  task: Task;
  presetIndex: number;
  onPresetChange: (index: number) => void;
  onMinimize: () => void;
  onClose: () => void;
  onComplete: (task: Task, event: React.MouseEvent) => void;
  /** Hand this task to the Document Drafter. */
  onDraftDocument: () => void;
}

function FocusMode({
  task,
  presetIndex,
  onPresetChange,
  onMinimize,
  onClose,
  onComplete,
  onDraftDocument,
}: FocusModeProps) {
  const navigate = useNavigate();
  const [showAudio, setShowAudio] = useState(false);
  const focus = useFocusSession();
  const soundscape = useSoundscape();
  const state = focus.timer;
  const { progress, pause, reset, skip } = focus;
  const dialogRef = useRef<HTMLDivElement>(null);

  // The overlay is modal in behaviour, not only in z-index: move focus into it,
  // keep Tab inside, and let Escape park the session in the sidebar. A sheet
  // opened on top (the document drafter) owns Escape while it is open.
  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (
        document.querySelector(
          '[data-slot="sheet-content"][data-state="open"]',
        )
      ) {
        return;
      }
      event.preventDefault();
      onMinimize();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onMinimize]);

  const trapTab = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return;
    const root = dialogRef.current;
    if (!root) return;
    const focusable = Array.from(
      root.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => el.offsetParent !== null);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const mins = Math.floor(state.secondsLeft / 60)
    .toString()
    .padStart(2, '0');
  const secs = (state.secondsLeft % 60).toString().padStart(2, '0');

  const phaseColor =
    state.phase === 'break' ? 'text-emerald-400' : 'text-amber-400';
  const ringColor = state.phase === 'break' ? '#34d399' : '#f59e0b';

  const handleStart = useCallback(() => {
    if (!soundscape.started) void soundscape.start();
    focus.start();
  }, [soundscape, focus]);

  const handToAgent = async () => {
    try {
      const session = await window.electron.ipc.invoke<{ id: string }>(
        'terminal:session-create',
        {
          title: task.title,
          goal: task.title,
          project_id: task.project_id ?? null,
        },
      );
      // Park in sidebar (timer keeps running / stays ready) instead of
      // clearing focus — navigating away must not kill the pomodoro.
      onMinimize();
      const projectQuery = task.project_id
        ? `&project=${encodeURIComponent(task.project_id)}`
        : '';
      navigate(
        `/terminal/${session.id}?goal=${encodeURIComponent(task.title)}&task=${encodeURIComponent(task.id)}${projectQuery}`,
      );
    } catch {
      toast.error('Could not create terminal session');
    }
  };

  const xpReward = xpForTaskPriority(task.priority);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/90 backdrop-blur-md"
      onClick={(e) => e.target === e.currentTarget && onMinimize()}
    >
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Focus mode: ${task.title}`}
        tabIndex={-1}
        onKeyDown={trapTab}
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="my-8 flex w-full max-w-md flex-col items-center gap-6 rounded-2xl border border-zinc-800 bg-zinc-950 p-8 focus:outline-none"
      >
        {/* Header bar with minimize & close */}
        <div className="flex w-full items-center justify-between pb-1 border-b border-zinc-900">
          <div className="flex items-center gap-1.5">
            <BrainIcon className="size-4 text-amber-400" />
            <span className="text-xs uppercase tracking-widest text-zinc-500">
              Focus Mode
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="size-7 rounded-full text-zinc-400 hover:text-white"
              onClick={onMinimize}
              title="Minimize to the sidebar"
              aria-label="Minimize focus mode to the sidebar"
            >
              <Minimize2Icon className="size-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="size-7 rounded-full text-zinc-400 hover:text-rose-400"
              onClick={onClose}
              title="Exit focus mode"
              aria-label="End focus session"
            >
              <XIcon className="size-3.5" />
            </Button>
          </div>
        </div>

        {/* Task info */}
        <div className="text-center">
          <h2 className="text-xl font-semibold text-white">{task.title}</h2>
          {task.description && (
            <p className="mt-1.5 text-sm text-zinc-400">{task.description}</p>
          )}
        </div>

        {/* Timer ring */}
        <div
          className="rounded-full p-1.5"
          style={{
            background: `conic-gradient(${ringColor} ${Math.round(progress * 360)}deg, rgba(63,63,70,0.5) 0deg)`,
          }}
        >
          <div className="flex size-36 flex-col items-center justify-center rounded-full bg-zinc-950">
            <span
              className={cn(
                'font-mono text-4xl font-bold tabular-nums',
                phaseColor,
              )}
            >
              {mins}:{secs}
            </span>
            <span className="mt-1 text-[10px] uppercase tracking-widest text-zinc-500">
              {state.phase === 'idle' ? 'ready' : state.phase}
            </span>
          </div>
        </div>

        {/* Duration preset. Changing it resets the timer, so mid-session
            changes confirm — a silent wipe would discard elapsed time. */}
        <ToggleGroup
          type="single"
          value={String(presetIndex)}
          onValueChange={(v) => {
            if (v === '') return;
            const next = Number(v);
            if (next === presetIndex) return;
            const inProgress =
              state.running ||
              state.secondsLeft < state.phaseTotal ||
              state.completed > 0;
            if (
              inProgress &&
              !window.confirm(
                'Changing the duration resets the timer. Continue?',
              )
            ) {
              return;
            }
            onPresetChange(next);
          }}
          size="sm"
        >
          {DURATION_PRESETS.map((p, i) => (
            <ToggleGroupItem
              key={p.label}
              value={String(i)}
              className="text-[11px]"
            >
              {p.label} min
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        {/* Controls */}
        <div className="flex items-center gap-3">
          {state.running ? (
            <Button
              size="icon"
              className="size-10 rounded-full bg-amber-600 hover:bg-amber-500"
              onClick={pause}
              aria-label="Pause timer"
            >
              <PauseIcon className="size-5" />
            </Button>
          ) : (
            <Button
              size="icon"
              className="size-10 rounded-full bg-emerald-600 hover:bg-emerald-500"
              onClick={handleStart}
              aria-label="Start timer"
            >
              <PlayIcon className="size-5" />
            </Button>
          )}
          <Button
            size="icon"
            variant="outline"
            className="size-10 rounded-full border-zinc-700 text-zinc-400"
            onClick={skip}
            aria-label="Skip phase"
          >
            <SkipForwardIcon className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="outline"
            className="size-10 rounded-full border-zinc-700"
            onClick={reset}
            aria-label="Reset timer"
          >
            <RefreshCwIcon className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="outline"
            className={cn(
              'size-10 rounded-full border-zinc-700',
              (soundscape.playing || showAudio) &&
                'border-primary/60 text-primary',
            )}
            onClick={() => {
              // First open also starts audio — previously the button only
              // revealed the mixer, leaving the user with no scene playing.
              if (!showAudio && !soundscape.started) void soundscape.start();
              setShowAudio((v) => !v);
            }}
            aria-label={
              showAudio ? 'Hide soundscape mixer' : 'Show soundscape mixer'
            }
          >
            <WavesIcon className="size-4" />
          </Button>
        </div>

        {/* Pomodoro count */}
        {state.completed > 0 && (
          <p className="text-sm text-zinc-400">
            {'🍅'.repeat(Math.min(state.completed, 8))} {state.completed}{' '}
            pomodoro
            {state.completed > 1 ? 's' : ''} this session
          </p>
        )}

        {/* Soundscape */}
        <AnimatePresence>
          {showAudio && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="w-full overflow-hidden"
            >
              <FocusAudioPanel />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Action Row */}
        <div className="flex w-full flex-col gap-2">
          <Button
            className="w-full gap-2 bg-emerald-600 font-semibold text-white hover:bg-emerald-500"
            onClick={(e) => onComplete(task, e)}
          >
            <CheckIcon className="size-4 stroke-[2.5]" />
            Complete Task (+{xpReward} XP)
          </Button>

          {/*
            Sits between "Complete" and the hand-off pair because it is the
            other way this task can end: not done, but turned into something a
            person has to read. Deliberately not a third column in the row
            below — at max-w-md, three labels and three icons stop being
            readable. The timer keeps running underneath; the sheet is a
            right-hand slide-over, so returning to focus is just closing it.
          */}
          <Button
            variant="outline"
            className="w-full gap-2 border-zinc-700 text-zinc-300 hover:border-primary/60 hover:bg-primary/10 hover:text-primary"
            onClick={onDraftDocument}
          >
            <PenLineIcon className="size-4 text-primary" />
            Draft a document with AI
          </Button>

          <div className="flex w-full items-center gap-2">
            <Button
              variant="outline"
              className="flex-1 gap-2 border-zinc-700 text-zinc-300 hover:border-emerald-700 hover:text-emerald-400"
              onClick={handToAgent}
            >
              <TerminalSquareIcon className="size-4" />
              Hand to Agent
            </Button>

            <Button
              variant="outline"
              className="border-zinc-700 text-zinc-400 hover:text-zinc-200"
              onClick={onMinimize}
            >
              <Minimize2Icon className="mr-1.5 size-3.5" />
              Minimize
            </Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Column ───────────────────────────────────────────────────────────────────

interface ColumnProps {
  status: Status;
  tasks: Task[];
  stepProgress: Record<string, StepProgress>;
  recommendation?: TaskRecommendation | null;
  onMove: (id: string, to: Status) => void;
  onDelete: (id: string) => void;
  onFocus: (task: Task) => void;
  onOpenSteps: (task: Task) => void;
  onSchedule: (task: Task) => void;
  onEdit: (task: Task) => void;
  /** Forwarded to each card: the drafter is per-task, not per-board. */
  onDraftDocument: (task: Task) => void;
  onStartFlow?: (task: Task, event: React.MouseEvent) => void;
  onShuffle?: () => void;
  /** True while a drag hovers this column. */
  isDropTarget?: boolean;
  getCardProps: (taskId: string) => {
    draggable: true;
    onDragStart: (e: React.DragEvent) => void;
    onDragEnd: () => void;
  };
  isDragging: (taskId: string) => boolean;
  dropProps: {
    onDragOver: (e: React.DragEvent) => void;
    onDragEnter: (e: React.DragEvent) => void;
    onDragLeave: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
  };
  nowSec?: number;
}

function Column({
  status,
  tasks,
  stepProgress,
  recommendation,
  onMove,
  onDelete,
  onFocus,
  onOpenSteps,
  onSchedule,
  onEdit,
  onDraftDocument,
  onStartFlow,
  onShuffle,
  isDropTarget = false,
  getCardProps,
  isDragging,
  dropProps,
  nowSec,
}: ColumnProps) {
  const meta = STATUS_META[status];
  const StatusIcon = meta.icon;

  return (
    <div
      data-slot="board-column"
      data-status={status}
      {...dropProps}
      className={cn(
        'flex min-w-0 flex-1 flex-col gap-1.5 rounded-md transition-colors',
        isDropTarget && 'bg-accent/40 ring-1 ring-primary/40',
      )}
    >
      {/* Column header */}
      <div className="flex items-center gap-1.5 px-1">
        <StatusIcon className="size-3.5 text-muted-foreground" />
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {meta.label}
        </span>
        <Badge
          variant="outline"
          className="ml-auto h-4 min-w-4 justify-center border-0 bg-muted/50 px-1.5 text-[10px]"
        >
          {tasks.length}
        </Badge>
      </div>

      {/* Cards */}
      <ScrollArea className="flex-1">
        <div className="flex min-h-full flex-col gap-1.5 pr-1 pb-4">
          <AnimatePresence initial={false}>
            {tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                progress={stepProgress[task.id]}
                onMove={onMove}
                onDelete={onDelete}
                onFocus={onFocus}
                onOpenSteps={onOpenSteps}
                onSchedule={onSchedule}
                onEdit={onEdit}
                onDraftDocument={onDraftDocument}
                isDragging={isDragging(task.id)}
                dragProps={getCardProps(task.id)}
                nowSec={nowSec}
              />
            ))}
            {tasks.length === 0 &&
              (status === 'active' &&
              recommendation?.task &&
              onStartFlow &&
              onShuffle ? (
                <ActiveLaunchpad
                  recommendation={recommendation}
                  onStartFlow={onStartFlow}
                  onOpenSteps={onOpenSteps}
                  onShuffle={onShuffle}
                />
              ) : (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="rounded-md border border-dashed border-border/40 py-6 text-center"
                >
                  <p className="text-[10px] text-muted-foreground/50">
                    {isDropTarget ? 'Drop here' : 'Empty'}
                  </p>
                </motion.div>
              ))}
          </AnimatePresence>
        </div>
      </ScrollArea>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Tasks() {
  const navigate = useNavigate();
  const {
    projectId,
    projectName,
    clear: clearProjectScope,
  } = useProjectScope();
  const { projects } = useProjects();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [stepProgress, setStepProgress] = useState<
    Record<string, StepProgress>
  >({});
  const [stats, setStats] = useState<FocusStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'today' | 'board'>('today');
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  /** Set when the dialog is editing an existing task; null = create. */
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [brainDumpOpen, setBrainDumpOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  // Quick capture entry points (tray, File menu, global shortcut) land on
  // /tasks?capture=1 to open the brain-dump dialog directly. Derived during
  // render (no effect); the param is stripped when the dialog closes so a
  // plain visit to /tasks never re-opens it.
  const captureRequested = searchParams.get('capture') === '1';
  const closeBrainDump = useCallback(() => {
    setBrainDumpOpen(false);
    if (captureRequested) {
      setSearchParams(
        (prev) => {
          prev.delete('capture');
          return prev;
        },
        { replace: true },
      );
    }
  }, [captureRequested, setSearchParams]);

  const [copilotOpen, setCopilotOpen] = useState(false);
  const [copilotInitialPrompt, setCopilotInitialPrompt] = useState<
    string | null
  >(null);
  /** Bumped whenever task data may have changed, to refresh the Today view. */
  const [dataVersion, setDataVersion] = useState(0);
  const [singleLens, setSingleLens] = useState(false);

  const handleSendCopilotPrompt = useCallback((prompt: string) => {
    setCopilotInitialPrompt(prompt);
    setCopilotOpen(true);
  }, []);

  const [stepsTask, setStepsTask] = useState<Task | null>(null);
  const [stepsOpen, setStepsOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleTaskId, setScheduleTaskId] = useState<string | null>(null);
  const [isPrioritizing, setIsPrioritizing] = useState(false);
  const [shuffleIndex, setShuffleIndex] = useState(0);
  /** Task pending a workspace choice. `null` = picker closed. */
  const [pickerTask, setPickerTask] = useState<Task | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  /**
   * The task the Document Drafter is open for. The sheet is always mounted —
   * it holds a live agent conversation that should survive being closed — so
   * "which task is being drafted" is the single piece of state that decides
   * whether it is showing anything. `null` means closed.
   */
  const [drafterTask, setDrafterTask] = useState<Task | null>(null);

  const gamification = useGamification();
  const focus = useFocusSession();

  // Coarse clock for overdue/due labels: ticks once a minute so an idle
  // board flips to "overdue" across midnight without a mutation. The 1s
  // focus timer already re-renders while running; this covers idle.
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = window.setInterval(
      () => setNowSec(Math.floor(Date.now() / 1000)),
      60_000,
    );
    return () => window.clearInterval(id);
  }, []);

  const recommendation = useMemo(
    () => getNextBestMove({ tasks, stepProgress, shuffleIndex }),
    [tasks, stepProgress, shuffleIndex],
  );

  const doStartFocus = useCallback(
    (task: Task) => {
      focus.startFocus(task);
    },
    [focus.startFocus],
  );

  /**
   * Explicit start (Focus button / Start Flow / Enter Flow / Today Focus):
   * ask which execution workspace to work in. Drag-to-Active and card
   * "Move" stay workspace-free (pure status moves via `handleMove`).
   */
  const requestStart = useCallback((task: Task) => {
    setPickerTask(task);
    setPickerOpen(true);
  }, []);

  const closePicker = useCallback(() => {
    setPickerOpen(false);
    setPickerTask(null);
  }, []);

  const load = useCallback(async () => {
    try {
      const rows = await window.electron.ipc.invoke<Task[]>(
        'tasks:list',
        projectId ? { projectId } : {},
      );
      setTasks(rows ?? []);
    } catch {
      toast.error('Could not load tasks');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const loadSteps = useCallback(async () => {
    try {
      const map = await window.electron.ipc.invoke<
        Record<string, StepProgress>
      >('tasks:steps-progress');
      setStepProgress(map ?? {});
    } catch {
      /* progress badges are best-effort */
    }
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const s = await window.electron.ipc.invoke<FocusStats>('focus:stats');
      setStats(s);
    } catch {
      /* stats are best-effort */
    }
  }, []);

  useEffect(() => {
    void load();
    void loadSteps();
    void loadStats();
  }, [load, loadSteps, loadStats]);

  /** Reload everything the copilot's tools could have touched. */
  const refreshAll = useCallback(() => {
    void load();
    void loadSteps();
    void loadStats();
    setDataVersion((v) => v + 1);
  }, [load, loadSteps, loadStats]);

  // The global focus runtime marks pomodoros done and can complete a task from
  // any route; this keeps the local board in step with those writes.
  useIpcEvent('tasks:changed', refreshAll, [refreshAll]);

  const mutations = useTaskMutations({
    onCreated: (task) => setTasks((prev) => [task, ...prev]),
    onUpdated: (id, patch) =>
      setTasks((prev) =>
        prev.map((t) => (t.id === id ? ({ ...t, ...patch } as Task) : t)),
      ),
    onRemoved: (id) => setTasks((prev) => prev.filter((t) => t.id !== id)),
  });

  /** Create when editingTask is null; write the patch when editing. */
  const handleTaskSubmit = async (data: CreateTaskInput | UpdateTaskPatch) => {
    if (editingTask) {
      await mutations.update(editingTask.id, data as UpdateTaskPatch);
    } else {
      const scoped: CreateTaskInput = {
        ...(data as CreateTaskInput),
        // A scoped surface files new tasks there unless the form said otherwise.
        project_id: (data as CreateTaskInput).project_id ?? projectId ?? null,
      };
      await mutations.create(scoped);
    }
  };

  const openCreate = () => {
    setEditingTask(null);
    setTaskDialogOpen(true);
  };

  const openEdit = (task: Task) => {
    setEditingTask(task);
    setTaskDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    try {
      await window.electron.ipc.invoke('tasks:delete', { id });
    } catch {
      toast.error('Could not delete task');
      void load();
    }
  };

  // Focus phase completion, XP, notifications and the power blocker all live in
  // `FocusRuntime` now: they must keep running when this page unmounts.

  const handleMove = useCallback(
    async (id: string, to: Status) => {
      const target = tasks.find((t) => t.id === id);
      // Dropping a card back where it came from is a no-op, not an XP event.
      if (!target || target.status === to) return;

      setTasks((prev) =>
        prev.map((t) => (t.id === id ? { ...t, status: to } : t)),
      );
      try {
        await window.electron.ipc.invoke('tasks:update', { id, status: to });
        // Award only after the write succeeds — previously XP fired before
        // IPC and survived a failed update (double-award on retry).
        if (to === 'done') {
          void gamification.awardXp(
            xpForTaskPriority(target.priority),
            `task_p${target.priority}`,
            id,
            // One-shot: reopening and completing the same task again must not
            // pay out twice.
            `task_done:${id}`,
          );
          triggerParticleBurst(window.innerWidth / 2, window.innerHeight / 2);
          // Completing the task you are focused on must end the session, or the
          // timer keeps running against a finished task.
          if (focus.focusedTask?.id === id) focus.clearFocus();
        }
      } catch {
        toast.error('Could not update task');
        void load();
      }
    },
    [tasks, focus.focusedTask, focus.clearFocus, gamification, load],
  );

  const handleStartFlow = useCallback(
    (task: Task, e: React.MouseEvent) => {
      triggerParticleBurst(e.clientX, e.clientY);
      // The picker marks the task active via `startTaskInWorkspace`.
      requestStart(task);
    },
    [requestStart],
  );

  const handleWorkspaceSelect = useCallback(
    async (workspace: WorkspaceKind) => {
      if (!pickerTask) return;
      const task = pickerTask;
      try {
        const result = await startTaskInWorkspace(task, workspace, {
          navigate,
          onMarkedActive: (t) =>
            setTasks((prev) =>
              prev.map((row) =>
                row.id === t.id ? { ...row, status: 'active' as const } : row,
              ),
            ),
          onFocusTask: (t) => {
            // Park in sidebar (ready) without opening the modal or
            // auto-starting the timer. "Just Focus" is the only modal path.
            focus.setFocusedTask(t);
            if (focus.displayMode === 'closed') {
              focus.setDisplayMode('sidebar');
            }
          },
        });
        closePicker();
        if (result.kind === 'documents') {
          setDrafterTask(task);
        }
      } catch {
        toast.error('Could not start workspace');
      }
    },
    // `focus` is a new object every render (useFocusSession returns a fresh
    // object); depend on the stable setters + displayMode instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pickerTask, navigate, focus.setFocusedTask, focus.setDisplayMode, focus.displayMode, closePicker],
  );

  const handleJustFocus = useCallback(() => {
    if (!pickerTask) {
      closePicker();
      return;
    }
    const task = pickerTask;
    closePicker();
    // Timer-only path: mark active then open the modal (timer stays idle until play).
    if (task.status !== 'active') void handleMove(task.id, 'active');
    doStartFocus({ ...task, status: 'active' });
  }, [pickerTask, handleMove, doStartFocus, closePicker]);

  /** Burst at the click, then mark done. Shared by every "complete" affordance. */
  const handleComplete = useCallback(
    (task: Task, e: React.MouseEvent) => {
      triggerParticleBurst(e.clientX, e.clientY);
      void handleMove(task.id, 'done');
    },
    [handleMove],
  );

  const handlePrioritize = async () => {
    setIsPrioritizing(true);
    try {
      const result = await window.electron.ipc.invoke<{
        orderedIds: string[];
        reasoning: string;
      }>('tasks:prioritize', projectId ? { projectId } : {});
      const idOrder = result.orderedIds;
      const orderIndex = new Map(idOrder.map((id, i) => [id, i]));
      setTasks((prev) =>
        [...prev].sort(
          (a, b) =>
            (orderIndex.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
            (orderIndex.get(b.id) ?? Number.MAX_SAFE_INTEGER),
        ),
      );
      toast.success('Tasks prioritized by AI', {
        description: result.reasoning.slice(0, 120),
      });
    } catch {
      toast.error('Could not prioritize tasks');
    } finally {
      setIsPrioritizing(false);
    }
  };

  const openSteps = (task: Task) => {
    setStepsTask(task);
    setStepsOpen(true);
  };

  // Always takes a task: every caller is a card's "Block time" menu item. The
  // old `Task | null` signature implied a standalone-block path that no caller
  // used, and the dialog still supports blank blocks via its own "custom" option.
  const openSchedule = (task: Task) => {
    setScheduleTaskId(task.id);
    setScheduleOpen(true);
  };

  // Memoised per status: `Column` re-renders on every parent render, and an
  // unmemoised filter handed each card a fresh `tasks` array identity, defeating
  // the `motion.div layout` animation on drag.
  const tasksByStatus = useMemo(
    () =>
      COLUMNS.reduce<Record<Status, Task[]>>(
        (acc, status) => {
          acc[status] = tasks.filter((t) => t.status === status);
          return acc;
        },
        { backlog: [], active: [], done: [] },
      ),
    [tasks],
  );

  const openTasks = useMemo(
    () => tasks.filter((t) => t.status !== 'done'),
    [tasks],
  );

  /**
   * The drafted prompt names the task's OWN project, not whatever scope the
   * board happens to be filtered by — a task can be drafted while the board is
   * scoped elsewhere, and naming the wrong project in the brief would point
   * the drafter at material the task has nothing to do with. A Map rather than
   * a `find` per render: the board re-renders on every timer tick and every
   * drag, and the lookup runs on each one.
   */
  const projectNameForTask = useMemo(
    () => new Map(projects.map((p) => [p.id, p.name])),
    [projects],
  );

  const drag = useTaskDrag({
    onDrop: (taskId: string, to: Status) => void handleMove(taskId, to),
  });

  /**
   * Open the drafter on a task. Shared by both entry points so the card menu
   * and focus mode cannot drift apart in what they hand over.
   */
  const openDrafter = useCallback((task: Task) => {
    setDrafterTask(task);
  }, []);

  const closeDrafter = useCallback(() => setDrafterTask(null), []);

  /**
   * Hand the finished document to the editor.
   *
   * The route is the editor route (`/documents/:documentId` — verified against
   * `renderer/routes.tsx`), not a "new document" route, so the created record
   * goes straight to the surface where a human edits it.
   *
   * Focus mode is minimized rather than closed on the way out: the sheet is a
   * full-height slide-over, and leaving a pomodoro ticking silently behind it
   * would lose the session when the user finally navigates away. Minimizing
   * parks it in the sidebar player, so coming back is one click.
   */
  const handleDocumentCreated = useCallback(
    (documentId: string) => {
      setDrafterTask(null);
      if (focus.displayMode !== 'closed') focus.setDisplayMode('sidebar');
      navigate(`/documents/${documentId}`);
    },
    [focus.displayMode, focus.setDisplayMode, navigate],
  );

  return (
    <div className="flex h-full flex-col" data-tour="tasks-page">
      {/* The Tabs root wraps the header because the Today/Board switcher lives
          in the header's `nav` slot, and Radix requires TabsList to descend
          from its Tabs context. */}
      <Tabs
        value={view}
        onValueChange={(v) => setView(v as 'today' | 'board')}
        className="min-h-0 flex-1 gap-0"
      >
        <PageHeader
          crumbs={[{ label: 'Tasks' }]}
          nav={
            <HeaderTabStrip>
              <HeaderTab value="today">
                <FocusIcon />
                Today
              </HeaderTab>
              <HeaderTab value="board">
                <CircleDashedIcon />
                Board
              </HeaderTab>
            </HeaderTabStrip>
          }
          meta={
            <>
              <HeaderLevelChip
                state={gamification.state}
                loading={gamification.loading}
              />
            </>
          }
          actions={
            <>
              {/* Board-only: a view modifier, so it sits with the other
                  header actions now that the tab strip is gone. */}
              {view === 'board' && (
                <Button
                  size="sm"
                  variant={singleLens ? 'default' : 'outline'}
                  title={singleLens ? 'Show all columns' : 'Single-task lens'}
                  className={cn(
                    'h-7 gap-1.5 text-xs',
                    singleLens &&
                      'bg-amber-500 font-semibold text-zinc-950 hover:bg-amber-400',
                  )}
                  onClick={() => setSingleLens(!singleLens)}
                >
                  <BrainIcon className="size-3.5" />
                  <span className="hidden sm:inline">
                    {singleLens ? 'Show All Columns' : 'Single-Task Lens'}
                  </span>
                </Button>
              )}

              {/* The single row only has room for the primary action, so the
                  three secondary commands collapse into an overflow menu. */}
              <OverflowMenu
                label="More task actions"
                items={[
                  {
                    label: 'Copilot',
                    icon: <BotIcon className="size-3.5 text-primary" />,
                    onSelect: () => setCopilotOpen(true),
                  },
                  {
                    label: 'Brain dump',
                    icon: <BrainIcon className="size-3.5 text-violet-500" />,
                    onSelect: () => setBrainDumpOpen(true),
                  },
                  {
                    label: 'Prioritize',
                    icon: isPrioritizing ? (
                      <Loader2Icon className="size-3.5 animate-spin" />
                    ) : (
                      <SparklesIcon className="size-3.5" />
                    ),
                    disabled: isPrioritizing || tasks.length === 0,
                    onSelect: () => void handlePrioritize(),
                    separatorBefore: true,
                  },
                ]}
              />

              <Button
                size="sm"
                data-tour="new-task-button"
                className="h-7 gap-1.5 px-2.5 text-xs"
                onClick={openCreate}
              >
                <PlusIcon className="size-3" />
                <span className="hidden sm:inline">New task</span>
              </Button>
            </>
          }
        />

        <TabsContent value="today" className="min-h-0 overflow-hidden">
          <TodayTimeline
            tasks={tasks}
            stats={stats}
            stepProgress={stepProgress}
            refreshSignal={dataVersion}
            projectId={projectId}
            onFocusTask={requestStart}
            onOpenSteps={openSteps}
            onSendPrompt={handleSendCopilotPrompt}
            onOpenBrainDump={() => setBrainDumpOpen(true)}
          />
        </TabsContent>

        <TabsContent value="board" className="min-h-0 overflow-hidden">
          {loading ? (
            <div className="flex h-full items-center justify-center p-4">
              <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : singleLens ? (
            <SingleTaskLens
              tasks={tasks}
              stepProgress={stepProgress}
              onFocus={requestStart}
              onOpenSteps={openSteps}
              onComplete={(task, e) => {
                triggerParticleBurst(e.clientX, e.clientY);
                void handleMove(task.id, 'done');
              }}
              onExit={() => setSingleLens(false)}
            />
          ) : (
            <div className="flex h-full min-h-0 gap-2 overflow-hidden p-3">
              {COLUMNS.map((status) => (
                <Column
                  key={status}
                  status={status}
                  tasks={tasksByStatus[status]}
                  stepProgress={stepProgress}
                  recommendation={status === 'active' ? recommendation : null}
                  onMove={handleMove}
                  onDelete={handleDelete}
                  onFocus={requestStart}
                  onOpenSteps={openSteps}
                  onSchedule={openSchedule}
                  onEdit={openEdit}
                  onDraftDocument={openDrafter}
                  onStartFlow={handleStartFlow}
                  onShuffle={() => setShuffleIndex((prev) => prev + 1)}
                  isDropTarget={drag.overColumn === status}
                  getCardProps={drag.getCardProps}
                  isDragging={drag.isDragging}
                  dropProps={drag.getColumnProps(status)}
                  nowSec={nowSec}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <TaskDialog
        open={taskDialogOpen}
        onOpenChange={setTaskDialogOpen}
        task={editingTask}
        projects={projects}
        defaultProjectId={projectId ?? null}
        onSubmit={handleTaskSubmit}
      />

      <BrainDumpDialog
        open={brainDumpOpen || captureRequested}
        onOpenChange={(open) =>
          open ? setBrainDumpOpen(true) : closeBrainDump()
        }
        onCreated={(created) => setTasks((prev) => [...created, ...prev])}
        projectId={projectId}
      />

      <CopilotPanel
        open={copilotOpen}
        onOpenChange={setCopilotOpen}
        projectId={projectId}
        onChanged={refreshAll}
        initialPrompt={copilotInitialPrompt}
        onInitialPromptHandled={() => setCopilotInitialPrompt(null)}
      />

      <ScheduleBlockDialog
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        tasks={openTasks}
        presetTaskId={scheduleTaskId}
        projectId={projectId}
        onSaved={() => undefined}
      />

      <TaskStepsSheet
        task={stepsTask}
        open={stepsOpen}
        onOpenChange={setStepsOpen}
        onChanged={() => void loadSteps()}
      />

      <WorkspacePicker
        open={pickerOpen}
        onOpenChange={(open) => {
          if (!open) closePicker();
          else setPickerOpen(true);
        }}
        task={pickerTask}
        projectName={
          pickerTask
            ? (projectNameForTask.get(pickerTask.project_id) ?? projectName)
            : projectName
        }
        onSelect={(ws) => void handleWorkspaceSelect(ws)}
        onJustFocus={handleJustFocus}
      />

      {/*
        The one drafter instance for the page, kept mounted so a conversation
        survives being closed.

        `projectId` is the task's OWN project, not the active board scope: a
        task can be drafted while the board is filtered elsewhere, and the
        document belongs with the task either way.

        The sheet fires `initialPrompt` once per distinct prompt string, which
        is why the prompt is built from the task and nothing else — no counter,
        no timestamp. Picking a *different* task produces different text and
        drafts immediately; re-opening the *same* task resumes that
        conversation instead of silently creating a second document. The sheet's
        "new draft" button is the way out of that.
      */}
      <DocumentDrafterSheet
        open={drafterTask !== null}
        onOpenChange={(open) => {
          if (!open) closeDrafter();
        }}
        taskId={drafterTask?.id}
        taskTitle={drafterTask?.title}
        projectId={drafterTask?.project_id}
        initialPrompt={
          drafterTask
            ? buildDrafterPrompt(
                drafterTask,
                projectNameForTask.get(drafterTask.project_id) ?? null,
              )
            : undefined
        }
        onDocumentCreated={handleDocumentCreated}
      />

      {/* Focus mode overlay */}
      <AnimatePresence>
        {focus.displayMode === 'modal' && focus.focusedTask && (
          <FocusMode
            task={focus.focusedTask}
            presetIndex={focus.presetIndex}
            onPresetChange={focus.setPresetIndex}
            onMinimize={() => focus.setDisplayMode('sidebar')}
            onClose={focus.clearFocus}
            onComplete={handleComplete}
            onDraftDocument={() =>
              focus.focusedTask && openDrafter(focus.focusedTask)
            }
          />
        )}
      </AnimatePresence>

      {/* The sidebar focus player is app-wide (`AppSidebar`). */}

      <ParticleCanvas />
    </div>
  );
}
