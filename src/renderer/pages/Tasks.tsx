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
  Loader2Icon,
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
} from 'lucide-react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
import { CopilotPanel } from '@/components/copilot/CopilotPanel';
import { FocusAudioPanel } from '@/components/tasks/FocusAudioPanel';
import { ScheduleBlockDialog } from '@/components/tasks/ScheduleBlockDialog';
import { TaskStepsSheet } from '@/components/tasks/TaskStepsSheet';
import { TodayTimeline } from '@/components/tasks/TodayTimeline';
import { useFocusAudio, type UseFocusAudioReturn } from '@/hooks/use-focus-audio';
import { useFocusTimer, type PhaseCompleteInfo } from '@/hooks/use-focus-timer';
import { useProjectScope } from '@/hooks/use-project-scope';
import { ProjectScopeChip } from '@/components/projects/ProjectScopeChip';
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
}

function TaskCard({
  task,
  progress,
  onMove,
  onDelete,
  onFocus,
  onOpenSteps,
  onSchedule,
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
  onClose: () => void;
  onPhaseComplete: (info: PhaseCompleteInfo & { taskId: string }) => void;
}

function FocusMode({ task, audio, onClose, onPhaseComplete }: FocusModeProps) {
  const navigate = useNavigate();
  const [presetIndex, setPresetIndex] = useState(0);
  const [showAudio, setShowAudio] = useState(false);
  const preset = DURATION_PRESETS[presetIndex];

  const handlePhase = useCallback(
    (info: PhaseCompleteInfo) => {
      onPhaseComplete({ ...info, taskId: task.id });
      if (info.phase === 'work' && info.completed) {
        toast.success('Pomodoro complete! Take a break.');
      }
    },
    [task.id, onPhaseComplete],
  );

  const { state, progress, start, pause, reset, skip } = useFocusTimer({
    taskId: task.id,
    workMins: preset.work,
    breakMins: preset.break,
    onPhaseComplete: handlePhase,
  });

  const mins = Math.floor(state.secondsLeft / 60).toString().padStart(2, '0');
  const secs = (state.secondsLeft % 60).toString().padStart(2, '0');

  const phaseColor = state.phase === 'break' ? 'text-emerald-400' : 'text-amber-400';
  const ringColor = state.phase === 'break' ? '#34d399' : '#f59e0b';

  const handleStart = useCallback(() => {
    if (!audio.playing && (audio.config.noise || audio.config.binaural)) {
      void audio.start();
    }
    start();
  }, [audio, start]);

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

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/90 backdrop-blur-md"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="my-8 flex w-full max-w-md flex-col items-center gap-6 rounded-2xl border border-zinc-800 bg-zinc-950 p-8"
      >
        {/* Task info */}
        <div className="text-center">
          <div className="mb-1 flex items-center justify-center gap-1.5">
            <BrainIcon className="size-4 text-amber-400" />
            <span className="text-xs uppercase tracking-widest text-zinc-500">
              Focus
            </span>
          </div>
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
          onValueChange={(v) => v !== '' && setPresetIndex(Number(v))}
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

        {/* Hand to agent */}
        <Button
          variant="outline"
          className="gap-2 border-zinc-700 text-zinc-300 hover:border-emerald-700 hover:text-emerald-400"
          onClick={handToAgent}
        >
          <TerminalSquareIcon className="size-4" />
          Hand to Agent
        </Button>

        <Button variant="ghost" className="text-xs text-zinc-600" onClick={onClose}>
          Exit focus mode
        </Button>
      </motion.div>
    </motion.div>
  );
}

// ─── New task dialog ──────────────────────────────────────────────────────────

interface NewTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: {
    title: string;
    description: string;
    priority: Priority;
    estimate_mins: number | null;
  }) => void;
}

function NewTaskDialog({ open, onOpenChange, onSave }: NewTaskDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>(2);
  const [estimate, setEstimate] = useState('');

  const handleSave = () => {
    if (!title.trim()) return;
    const parsed = Number(estimate);
    onSave({
      title: title.trim(),
      description: description.trim(),
      priority,
      estimate_mins: estimate.trim() && parsed > 0 ? parsed : null,
    });
    setTitle('');
    setDescription('');
    setPriority(2);
    setEstimate('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
          <DialogDescription>Add a task to your backlog.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <Input
            placeholder="Task title…"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            autoFocus
          />
          <Textarea
            placeholder="Description (optional)…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="resize-none"
          />

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Priority:</span>
            {([1, 2, 3] as Priority[]).map((p) => (
              <Button
                key={p}
                size="sm"
                variant={priority === p ? 'default' : 'outline'}
                className={cn(
                  'h-7 px-2.5 text-xs',
                  priority === p && PRIORITY_META[p].color,
                )}
                onClick={() => setPriority(p)}
              >
                {PRIORITY_META[p].label}
              </Button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Estimate:</span>
            <Input
              type="number"
              min={5}
              step={5}
              placeholder="mins"
              value={estimate}
              onChange={(e) => setEstimate(e.target.value)}
              className="h-7 w-24 text-xs"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!title.trim()}>
            Add task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Column ───────────────────────────────────────────────────────────────────

interface ColumnProps {
  status: Status;
  tasks: Task[];
  stepProgress: Record<string, StepProgress>;
  onMove: (id: string, to: Status) => void;
  onDelete: (id: string) => void;
  onFocus: (task: Task) => void;
  onOpenSteps: (task: Task) => void;
  onSchedule: (task: Task) => void;
}

function Column({
  status,
  tasks,
  stepProgress,
  onMove,
  onDelete,
  onFocus,
  onOpenSteps,
  onSchedule,
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
              />
            ))}
            {tasks.length === 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="rounded-lg border border-dashed border-border/40 py-8 text-center"
              >
                <p className="text-xs text-muted-foreground/50">Empty</p>
              </motion.div>
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
  const [tasks, setTasks] = useState<Task[]>([]);
  const [stepProgress, setStepProgress] = useState<Record<string, StepProgress>>({});
  const [stats, setStats] = useState<FocusStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'today' | 'board'>('today');
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [brainDumpOpen, setBrainDumpOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);
  /** Bumped whenever task data may have changed, to refresh the Today view. */
  const [dataVersion, setDataVersion] = useState(0);
  const [focusedTask, setFocusedTask] = useState<Task | null>(null);
  const [stepsTask, setStepsTask] = useState<Task | null>(null);
  const [stepsOpen, setStepsOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleTaskId, setScheduleTaskId] = useState<string | null>(null);
  const [isPrioritizing, setIsPrioritizing] = useState(false);

  const audio = useFocusAudio();

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

  const handleCreate = async (data: {
    title: string;
    description: string;
    priority: Priority;
    estimate_mins: number | null;
  }) => {
    try {
      const task = await window.electron.ipc.invoke<Task>('tasks:create', {
        title: data.title,
        description: data.description,
        priority: data.priority,
        estimate_mins: data.estimate_mins,
        project_id: projectId ?? undefined,
        status: 'backlog',
      });
      setTasks((prev) => [task, ...prev]);
    } catch {
      toast.error('Could not create task');
    }
  };

  const handleMove = async (id: string, to: Status) => {
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
    [loadStats],
  );

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
              onClick={() => setNewTaskOpen(true)}
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
        <div className="border-b border-border/60 px-4 pt-3">
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
        </div>

        <TabsContent value="today" className="min-h-0 overflow-hidden">
          <TodayTimeline
            tasks={tasks}
            stats={stats}
            statsLoading={statsLoading}
            refreshSignal={dataVersion}
            projectId={projectId}
            onFocusTask={setFocusedTask}
          />
        </TabsContent>

        <TabsContent value="board" className="min-h-0 overflow-hidden">
          {loading ? (
            <div className="flex h-full items-center justify-center p-4">
              <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="flex h-full min-h-0 gap-3 overflow-hidden p-4">
              {COLUMNS.map((status) => (
                <Column
                  key={status}
                  status={status}
                  tasks={tasksByStatus(status)}
                  stepProgress={stepProgress}
                  onMove={handleMove}
                  onDelete={handleDelete}
                  onFocus={setFocusedTask}
                  onOpenSteps={openSteps}
                  onSchedule={openSchedule}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <NewTaskDialog
        open={newTaskOpen}
        onOpenChange={setNewTaskOpen}
        onSave={handleCreate}
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
        {focusedTask && (
          <FocusMode
            task={focusedTask}
            audio={audio}
            onClose={() => setFocusedTask(null)}
            onPhaseComplete={handlePhaseComplete}
          />
        )}
      </AnimatePresence>

      {/* Soundscape keeps playing outside focus mode — give it an off switch. */}
      <AnimatePresence>
        {audio.playing && !focusedTask && (
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
    </div>
  );
}
