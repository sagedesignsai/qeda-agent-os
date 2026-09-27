/**
 * pages/Tasks.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The ADHD focus system: a *doing* surface (Today) and a *planning* surface
 * (Board), plus an AI copilot that removes the activation barrier.
 *
 *   ┌─ PageHeader ────────────────────────────────────────────────────────────┐
 *   │  Backlog · Active · Done                              [Brain dump] [+]  │
 *   ├─ Tabs: Today | Board ───────────────────────────────────────────────────┤
 *   │  Today  → focus stats, time blocks, "Plan my day"                       │
 *   │  Board  → the three-column kanban                                       │
 *   └─────────────────────────────────────────────────────────────────────────┘
 *   [FocusMode overlay]  [TaskStepsSheet]  [BrainDumpDialog]  [ScheduleBlock]
 *
 * FocusMode pairs the pomodoro timer with a synthesised soundscape and records
 * every phase to the DB, which is what feeds the stats strip and streaks.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import { BrainDumpDialog } from '@/components/tasks/BrainDumpDialog';
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
import { useFocusAudio, type UseFocusAudioReturn } from '@/hooks/use-focus-audio';
import { useFocusTimer, type PhaseCompleteInfo, type UseFocusTimerReturn } from '@/hooks/use-focus-timer';
import { useProjectScope } from '@/hooks/use-project-scope';
import { ProjectScopeChip } from '@/components/projects/ProjectScopeChip';
import { useGamification } from '@/hooks/use-gamification';
import { HeaderLevelChip } from '@/components/gamification/HeaderLevelChip';
import { ParticleCanvas, triggerParticleBurst } from '@/components/gamification/ParticleCanvas';
import { FloatingFocusBar } from '@/components/focus/FloatingFocusBar';
import { SingleTaskLens } from '@/components/tasks/SingleTaskLens';
import { ActiveLaunchpad } from '@/components/tasks/ActiveLaunchpad';
import { getNextBestMove, type TaskRecommendation } from '@/lib/task-recommendations';
import { XP_REWARDS } from '@/lib/gamification';
import type { FocusStats, StepProgress, Task } from '@/main/ipc/channels';

// ─── Types & helpers ──────────────────────────────────────────────────────────

type Priority = 1 | 2 | 3;
type Status = Task['status'];

const PRIORITY_META: Record<Priority, { label: string; color: string; border: string }> = {
  1: { label: 'High',   color: 'text-rose-400',    border: 'border-l-rose-500' },
  2: { label: 'Medium', color: 'text-amber-400',   border: 'border-l-amber-500' },
  3: { label: 'Low',    color: 'text-zinc-500',    border: 'border-l-zinc-600' },
};

const STATUS_META: Record<Status, { label: string; icon: React.ComponentType<{ className?: string }>; next: Status | null }> = {
  backlog: { label: 'Backlog', icon: CircleDashedIcon, next: 'active' },
  active:  { label: 'Active',  icon: PlayIcon,         next: 'done' },
  done:    { label: 'Done',    icon: CheckIcon,        next: null },
};

const COLUMNS: Status[] = ['backlog', 'active', 'done'];

const DURATION_PRESETS = [
  { label: '25 / 5', work: 25, break: 5 },
  { label: '50 / 10', work: 50, break: 10 },
] as const;

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
}: TaskCardProps) {
  const pm = PRIORITY_META[task.priority as Priority];
  const sm = STATUS_META[task.status];
  const isOverdue =
    task.due_at !== null && task.due_at !== undefined &&
    task.due_at < Math.floor(Date.now() / 1000) &&
    task.status !== 'done';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.15 }}
      className={cn(
        'group rounded-lg border border-l-2 bg-card px-3 py-2.5 shadow-sm',
        pm.border,
        'border-border/60',
      )}
    >
      {/* Title row */}
      <div className="flex items-start justify-between gap-2">
        <p
          className={cn(
            'text-sm font-medium leading-snug text-card-foreground',
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
              className="size-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
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
              Focus mode
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onOpenSteps(task)}>
              <SparklesIcon className="mr-2 size-3 text-amber-500" />
              Break down
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onSchedule(task)}>
              <CalendarPlusIcon className="mr-2 size-3" />
              Block time
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
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
          {task.description}
        </p>
      )}

      {/* Metadata row */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Badge
          variant="outline"
          className={cn('h-4 border-0 bg-transparent px-0 text-[10px]', pm.color)}
        >
          {pm.label}
        </Badge>

        {progress && progress.total > 0 && (
          <button
            type="button"
            onClick={() => onOpenSteps(task)}
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
          <span className="text-[10px] text-muted-foreground">
            🍅 ×{task.pomodoro_count}
          </span>
        )}

        {task.due_at && (
          <span
            className={cn(
              'flex items-center gap-0.5 text-[10px]',
              isOverdue ? 'text-rose-400' : 'text-muted-foreground',
            )}
          >
            <ClockIcon className="size-2.5" />
            {isOverdue ? 'overdue' : formatDistanceToNow(task.due_at * 1000, { addSuffix: true })}
          </span>
        )}
      </div>

      {/* Focus button (visible on hover) */}
      {task.status !== 'done' && (
        <Button
          size="sm"
          variant="ghost"
          className="mt-2 h-6 w-full gap-1 text-[10px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
          onClick={() => onFocus(task)}
        >
          <FocusIcon className="size-3" />
          Focus
        </Button>
      )}
    </motion.div>
  );
}

// ─── Focus mode overlay ───────────────────────────────────────────────────────

interface FocusModeProps {
  task: Task;
  audio: UseFocusAudioReturn;
  timer: UseFocusTimerReturn;
  presetIndex: number;
  onPresetChange: (index: number) => void;
  onMinimize: () => void;
  onClose: () => void;
  onComplete: (task: Task, event: React.MouseEvent) => void;
}

function FocusMode({
  task,
  audio,
  timer,
  presetIndex,
  onPresetChange,
  onMinimize,
  onClose,
  onComplete,
}: FocusModeProps) {
  const navigate = useNavigate();
  const [showAudio, setShowAudio] = useState(false);
  const { state, progress, pause, reset, skip } = timer;

  const mins = Math.floor(state.secondsLeft / 60).toString().padStart(2, '0');
  const secs = (state.secondsLeft % 60).toString().padStart(2, '0');

  const phaseColor = state.phase === 'break' ? 'text-emerald-400' : 'text-amber-400';
  const ringColor = state.phase === 'break' ? '#34d399' : '#f59e0b';

  const handleStart = useCallback(() => {
    if (!audio.playing && (audio.config.noise || audio.config.binaural)) {
      void audio.start();
    }
    timer.start();
  }, [audio, timer]);

  const handToAgent = async () => {
    try {
      const session = await window.electron.ipc.invoke<{ id: string }>(
        'terminal:session-create',
        { title: task.title },
      );
      onClose();
      navigate(`/terminal/${session.id}?goal=${encodeURIComponent(task.title)}`);
    } catch {
      toast.error('Could not create terminal session');
    }
  };

  const xpReward =
    task.priority === 1
      ? XP_REWARDS.TASK_HIGH
      : task.priority === 2
        ? XP_REWARDS.TASK_MED
        : XP_REWARDS.TASK_LOW;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/90 backdrop-blur-md"
      onClick={(e) => e.target === e.currentTarget && onMinimize()}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="my-8 flex w-full max-w-md flex-col items-center gap-6 rounded-2xl border border-zinc-800 bg-zinc-950 p-8"
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
              title="Minimize to floating bar"
            >
              <Minimize2Icon className="size-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="size-7 rounded-full text-zinc-400 hover:text-rose-400"
              onClick={onClose}
              title="Exit focus mode"
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
            <span className={cn('font-mono text-4xl font-bold tabular-nums', phaseColor)}>
              {mins}:{secs}
            </span>
            <span className="mt-1 text-[10px] uppercase tracking-widest text-zinc-500">
              {state.phase === 'idle' ? 'ready' : state.phase}
            </span>
          </div>
        </div>

        {/* Duration preset */}
        <ToggleGroup
          type="single"
          value={String(presetIndex)}
          onValueChange={(v) => v !== '' && onPresetChange(Number(v))}
          size="sm"
        >
          {DURATION_PRESETS.map((p, i) => (
            <ToggleGroupItem key={p.label} value={String(i)} className="text-[11px]">
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
            >
              <PauseIcon className="size-5" />
            </Button>
          ) : (
            <Button
              size="icon"
              className="size-10 rounded-full bg-emerald-600 hover:bg-emerald-500"
              onClick={handleStart}
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
          >
            <RefreshCwIcon className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="outline"
            className={cn(
              'size-10 rounded-full border-zinc-700',
              (audio.playing || showAudio) && 'border-sky-700 text-sky-400',
            )}
            onClick={() => {
              setShowAudio((v) => !v);
              if (audio.playing) audio.stop();
            }}
            aria-label="Soundscape"
          >
            <WavesIcon className="size-4" />
          </Button>
        </div>

        {/* Pomodoro count */}
        {state.completed > 0 && (
          <p className="text-sm text-zinc-400">
            {'🍅'.repeat(Math.min(state.completed, 8))} {state.completed} pomodoro
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
              <FocusAudioPanel audio={audio} />
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
  onStartFlow?: (task: Task, event: React.MouseEvent) => void;
  onShuffle?: () => void;
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
  onStartFlow,
  onShuffle,
}: ColumnProps) {
  const meta = STATUS_META[status];
  const StatusIcon = meta.icon;

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      {/* Column header */}
      <div className="flex items-center gap-1.5 px-1">
        <StatusIcon className="size-3.5 text-muted-foreground" />
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
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
        <div className="flex flex-col gap-2 pr-1 pb-4">
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
              />
            ))}
            {tasks.length === 0 && (
              status === 'active' && recommendation?.task && onStartFlow && onShuffle ? (
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
                  className="rounded-lg border border-dashed border-border/40 py-8 text-center"
                >
                  <p className="text-xs text-muted-foreground/50">Empty</p>
                </motion.div>
              )
            )}
          </AnimatePresence>
        </div>
      </ScrollArea>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Tasks() {
  const { projectId, projectName, clear: clearProjectScope } = useProjectScope();
  const { projects } = useProjects();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [stepProgress, setStepProgress] = useState<Record<string, StepProgress>>({});
  const [stats, setStats] = useState<FocusStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'today' | 'board'>('today');
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  /** Set when the dialog is editing an existing task; null = create. */
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [brainDumpOpen, setBrainDumpOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [copilotInitialPrompt, setCopilotInitialPrompt] = useState<string | null>(null);
  /** Bumped whenever task data may have changed, to refresh the Today view. */
  const [dataVersion, setDataVersion] = useState(0);
  const [focusedTask, setFocusedTask] = useState<Task | null>(null);
  const [focusDisplayMode, setFocusDisplayMode] = useState<'modal' | 'floating' | 'closed'>('closed');
  const [singleLens, setSingleLens] = useState(false);
  const [presetIndex, setPresetIndex] = useState(0);
  const preset = DURATION_PRESETS[presetIndex];

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

  const gamification = useGamification();
  const audio = useFocusAudio();

  const recommendation = useMemo(
    () => getNextBestMove({ tasks, stepProgress, shuffleIndex }),
    [tasks, stepProgress, shuffleIndex],
  );

  const startFocus = useCallback((task: Task) => {
    setFocusedTask(task);
    setFocusDisplayMode('modal');
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
      const map = await window.electron.ipc.invoke<Record<string, StepProgress>>(
        'tasks:steps-progress',
      );
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
    } finally {
      setStatsLoading(false);
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

  const mutations = useTaskMutations({
    onCreated: (task) => setTasks((prev) => [task, ...prev]),
    onUpdated: (id, patch) =>
      setTasks((prev) =>
        prev.map((t) => (t.id === id ? ({ ...t, ...patch } as Task) : t)),
      ),
    onRemoved: (id) => setTasks((prev) => prev.filter((t) => t.id !== id)),
  });

  /** Create when editingTask is null; write the patch when editing. */
  const handleTaskSubmit = async (
    data: CreateTaskInput | UpdateTaskPatch,
  ) => {
    if (editingTask) {
      await mutations.update(editingTask.id, data as UpdateTaskPatch);
    } else {
      const scoped: CreateTaskInput = {
        ...(data as CreateTaskInput),
        // A scoped surface files new tasks there unless the form said otherwise.
        project_id:
          (data as CreateTaskInput).project_id ?? projectId ?? null,
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

  const handleMove = async (id: string, to: Status) => {
    const target = tasks.find((t) => t.id === id);
    if (to === 'done' && target && target.status !== 'done') {
      const xp =
        target.priority === 1
          ? XP_REWARDS.TASK_HIGH
          : target.priority === 2
            ? XP_REWARDS.TASK_MED
            : XP_REWARDS.TASK_LOW;
      void gamification.awardXp(xp, `task_p${target.priority}`, id);
      triggerParticleBurst(window.innerWidth / 2, window.innerHeight / 2);
    }
    if (to === 'done' && focusedTask?.id === id) {
      focusTimer.pause();
      setFocusDisplayMode('closed');
      setFocusedTask(null);
    }
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status: to } : t)));
    try {
      await window.electron.ipc.invoke('tasks:update', { id, status: to });
    } catch {
      toast.error('Could not update task');
      void load();
    }
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

  const handleStartFlow = useCallback(
    (task: Task, e: React.MouseEvent) => {
      triggerParticleBurst(e.clientX, e.clientY);
      void handleMove(task.id, 'active');
      startFocus(task);
    },
    [handleMove, startFocus],
  );

  const handlePhaseComplete = useCallback(
    async (info: PhaseCompleteInfo & { taskId: string }) => {
      try {
        await window.electron.ipc.invoke('focus:session-create', {
          task_id: info.taskId,
          kind: info.phase,
          planned_sec: info.plannedSec,
          actual_sec: info.actualSec,
          completed: info.completed,
        });
      } catch {
        /* session recording is best-effort */
      }

      if (info.phase === 'work' && info.completed) {
        const mins = Math.max(1, Math.round(info.actualSec / 60));
        const xp = mins * XP_REWARDS.FOCUS_MINUTE + XP_REWARDS.POMODORO_COMPLETE;
        void gamification.awardXp(xp, 'pomodoro_complete', info.taskId);
        triggerParticleBurst(window.innerWidth / 2, window.innerHeight / 2);

        setTasks((prev) =>
          prev.map((t) =>
            t.id === info.taskId
              ? { ...t, pomodoro_count: t.pomodoro_count + 1 }
              : t,
          ),
        );
        try {
          await window.electron.ipc.invoke('tasks:increment-pomodoro', {
            id: info.taskId,
          });
        } catch {
          /* best-effort */
        }
      }

      void loadStats();
    },
    [loadStats, gamification],
  );

  const handleTimerPhase = useCallback(
    (info: PhaseCompleteInfo) => {
      if (focusedTask) {
        handlePhaseComplete({ ...info, taskId: focusedTask.id });
      }
      if (info.phase === 'work' && info.completed) {
        toast.success('Pomodoro complete! Take a break.');
        void window.electron.ipc.invoke('notifications:notify', {
          title: 'Pomodoro Complete! 🍅',
          body: 'Great focus session. Take a 5-minute restorative break.',
        });
      } else if (info.phase === 'break' && info.completed) {
        toast.info('Break finished! Ready to resume flow.');
        void window.electron.ipc.invoke('notifications:notify', {
          title: 'Break Finished! ⚡',
          body: 'Your break is done. Jump back into flow state.',
        });
      }
    },
    [focusedTask, handlePhaseComplete],
  );

  const focusTimer = useFocusTimer({
    taskId: focusedTask?.id ?? null,
    workMins: preset.work,
    breakMins: preset.break,
    onPhaseComplete: handleTimerPhase,
  });

  const handlePrioritize = async () => {
    setIsPrioritizing(true);
    try {
      const result = await window.electron.ipc.invoke<{
        orderedIds: string[];
        reasoning: string;
      }>('tasks:prioritize', {});
      const idOrder = result.orderedIds;
      setTasks((prev) =>
        [...prev].sort((a, b) => idOrder.indexOf(a.id) - idOrder.indexOf(b.id)),
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

  const openSchedule = (task: Task | null) => {
    setScheduleTaskId(task?.id ?? null);
    setScheduleOpen(true);
  };

  const tasksByStatus = (status: Status) =>
    tasks.filter((t) => t.status === status);

  const openTasks = useMemo(
    () => tasks.filter((t) => t.status !== 'done'),
    [tasks],
  );

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        crumbs={[
          { label: 'Tasks' },
          ...(projectName ? [{ label: projectName }] : []),
        ]}
        actions={
          <div className="flex items-center gap-2">
            <HeaderLevelChip state={gamification.state} loading={gamification.loading} />
            <ProjectScopeChip name={projectName} onClear={clearProjectScope} />
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 text-xs"
              onClick={() => setCopilotOpen(true)}
            >
              <BotIcon className="size-3 text-primary" />
              Copilot
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 text-xs"
              onClick={() => setBrainDumpOpen(true)}
            >
              <BrainIcon className="size-3 text-violet-500" />
              Brain dump
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 text-xs"
              onClick={() => void handlePrioritize()}
              disabled={isPrioritizing || tasks.length === 0}
            >
              {isPrioritizing ? (
                <Loader2Icon className="size-3 animate-spin" />
              ) : (
                <SparklesIcon className="size-3" />
              )}
              Prioritize
            </Button>
            <Button
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={openCreate}
            >
              <PlusIcon className="size-3" />
              New task
            </Button>
          </div>
        }
      />

      <Tabs
        value={view}
        onValueChange={(v) => setView(v as 'today' | 'board')}
        className="min-h-0 flex-1 gap-0"
      >
        <div className="flex items-center justify-between border-b border-border/60 px-4 pt-3">
          <TabsList>
            <TabsTrigger value="today" className="gap-1.5">
              <FocusIcon className="size-3.5" />
              Today
            </TabsTrigger>
            <TabsTrigger value="board" className="gap-1.5">
              <CircleDashedIcon className="size-3.5" />
              Board
            </TabsTrigger>
          </TabsList>

          {view === 'board' && (
            <Button
              size="sm"
              variant={singleLens ? 'default' : 'outline'}
              className={cn(
                'h-7 gap-1.5 text-xs',
                singleLens && 'bg-amber-500 font-semibold text-zinc-950 hover:bg-amber-400',
              )}
              onClick={() => setSingleLens(!singleLens)}
            >
              <BrainIcon className="size-3.5" />
              {singleLens ? 'Show All Columns' : 'Single-Task Lens'}
            </Button>
          )}
        </div>

        <TabsContent value="today" className="min-h-0 overflow-hidden">
          <TodayTimeline
            tasks={tasks}
            stats={stats}
            statsLoading={statsLoading}
            stepProgress={stepProgress}
            refreshSignal={dataVersion}
            projectId={projectId}
            onFocusTask={startFocus}
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
              onFocus={startFocus}
              onOpenSteps={openSteps}
              onComplete={(task, e) => {
                triggerParticleBurst(e.clientX, e.clientY);
                void handleMove(task.id, 'done');
              }}
              onExit={() => setSingleLens(false)}
            />
          ) : (
            <div className="flex h-full min-h-0 gap-3 overflow-hidden p-4">
              {COLUMNS.map((status) => (
                <Column
                  key={status}
                  status={status}
                  tasks={tasksByStatus(status)}
                  stepProgress={stepProgress}
                  recommendation={status === 'active' ? recommendation : null}
                  onMove={handleMove}
                  onDelete={handleDelete}
                  onFocus={startFocus}
                  onOpenSteps={openSteps}
                  onSchedule={openSchedule}
                  onEdit={openEdit}
                  onStartFlow={handleStartFlow}
                  onShuffle={() => setShuffleIndex((prev) => prev + 1)}
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
        open={brainDumpOpen}
        onOpenChange={setBrainDumpOpen}
        onCreated={(created) => setTasks((prev) => [...created, ...prev])}
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
        onSaved={() => undefined}
      />

      <TaskStepsSheet
        task={stepsTask}
        open={stepsOpen}
        onOpenChange={setStepsOpen}
        onChanged={() => void loadSteps()}
      />

      {/* Focus mode overlay */}
      <AnimatePresence>
        {focusDisplayMode === 'modal' && focusedTask && (
          <FocusMode
            task={focusedTask}
            audio={audio}
            timer={focusTimer}
            presetIndex={presetIndex}
            onPresetChange={setPresetIndex}
            onMinimize={() => setFocusDisplayMode('floating')}
            onClose={() => {
              setFocusDisplayMode('closed');
              setFocusedTask(null);
              focusTimer.pause();
            }}
            onComplete={(task, e) => {
              triggerParticleBurst(e.clientX, e.clientY);
              void handleMove(task.id, 'done');
            }}
          />
        )}
      </AnimatePresence>

      {/* Ambient Floating Focus Bar & Mini-Player */}
      <AnimatePresence>
        {focusDisplayMode === 'floating' && focusedTask && (
          <FloatingFocusBar
            task={focusedTask}
            timerState={focusTimer.state}
            progress={focusTimer.progress}
            audio={audio}
            onStart={() => {
              if (!audio.playing && (audio.config.noise || audio.config.binaural)) {
                void audio.start();
              }
              focusTimer.start();
            }}
            onPause={focusTimer.pause}
            onSkip={focusTimer.skip}
            onExpand={() => setFocusDisplayMode('modal')}
            onClose={() => {
              setFocusDisplayMode('closed');
              setFocusedTask(null);
              focusTimer.pause();
            }}
            onCompleteTask={(task, e) => {
              triggerParticleBurst(e.clientX, e.clientY);
              void handleMove(task.id, 'done');
            }}
          />
        )}
      </AnimatePresence>

      {/* Soundscape keeps playing outside focus mode — give it an off switch. */}
      <AnimatePresence>
        {audio.playing && (!focusedTask || focusDisplayMode === 'closed') && (
          <motion.button
            type="button"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            onClick={() => audio.stop()}
            className="fixed right-4 bottom-4 z-40 flex items-center gap-2 rounded-full border border-border/60 bg-card px-3 py-1.5 text-xs text-muted-foreground shadow-lg transition-colors hover:text-foreground"
          >
            <WavesIcon className="size-3.5 text-sky-500" />
            Soundscape playing
            <span className="text-muted-foreground/60">· stop</span>
          </motion.button>
        )}
      </AnimatePresence>

      <ParticleCanvas />
    </div>
  );
}
