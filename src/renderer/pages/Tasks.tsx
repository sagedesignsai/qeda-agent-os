/**
 * pages/Tasks.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * ADHD Focus Task Manager.
 *
 * Layout:
 *   ┌─────────────────────────────────────────────────────────────────────────┐
 *   │  PageHeader  (+ New Task button + Prioritize AI button)                  │
 *   ├──────────┬──────────┬──────────────────────────────────────────────────┤
 *   │ Backlog  │  Active  │  Done                                             │
 *   │ (cards)  │  (cards) │  (cards)                                         │
 *   └──────────┴──────────┴──────────────────────────────────────────────────┘
 *   [FocusMode overlay when a task is focused]
 *
 * Each TaskCard shows:
 *   - Priority indicator (colored left border)
 *   - Title + description snippet
 *   - Pomodoro count (🍅 ×n)
 *   - Due date (if set, red when overdue)
 *   - Quick actions: Move to next status, Focus, Delete
 *
 * FocusMode overlay:
 *   - Full-screen dark overlay
 *   - Task title + description
 *   - Pomodoro timer (25 min work / 5 min break, configurable)
 *   - "Hand to agent" → opens a new terminal session with the task as goal
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import { formatDistanceToNow } from 'date-fns';
import {
  ArrowRightIcon,
  BrainIcon,
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
  TerminalSquareIcon,
  TimerIcon,
  Trash2Icon,
  UndoIcon,
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { Task } from '@/main/ipc/channels';

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

// ─── Pomodoro timer ───────────────────────────────────────────────────────────

const WORK_MINS = 25;
const BREAK_MINS = 5;

type TimerPhase = 'work' | 'break' | 'idle';

interface PomodoroState {
  phase: TimerPhase;
  secondsLeft: number;
  running: boolean;
  completed: number; // pomodoros completed this session
}

function usePomodoroTimer(taskId: string | null, onComplete: () => void) {
  const [state, setState] = useState<PomodoroState>({
    phase: 'idle',
    secondsLeft: WORK_MINS * 60,
    running: false,
    completed: 0,
  });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clear = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  useEffect(() => {
    // Reset timer when task changes
    clear();
    setState({ phase: 'idle', secondsLeft: WORK_MINS * 60, running: false, completed: 0 });
  }, [taskId]);

  useEffect(() => {
    if (!state.running) { clear(); return; }

    intervalRef.current = setInterval(() => {
      setState((prev) => {
        if (prev.secondsLeft > 1) {
          return { ...prev, secondsLeft: prev.secondsLeft - 1 };
        }
        // Phase complete
        clear();
        if (prev.phase === 'work') {
          onComplete();
          return {
            phase: 'break',
            secondsLeft: BREAK_MINS * 60,
            running: false,
            completed: prev.completed + 1,
          };
        }
        return {
          phase: 'work',
          secondsLeft: WORK_MINS * 60,
          running: false,
          completed: prev.completed,
        };
      });
    }, 1000);

    return clear;
  }, [state.running, onComplete]);

  const start = () =>
    setState((p) => ({
      ...p,
      phase: p.phase === 'idle' ? 'work' : p.phase,
      secondsLeft: p.phase === 'idle' ? WORK_MINS * 60 : p.secondsLeft,
      running: true,
    }));
  const pause = () => setState((p) => ({ ...p, running: false }));
  const reset = () => {
    clear();
    setState({ phase: 'idle', secondsLeft: WORK_MINS * 60, running: false, completed: state.completed });
  };

  return { state, start, pause, reset };
}

// ─── Task card ────────────────────────────────────────────────────────────────

interface TaskCardProps {
  task: Task;
  onMove: (id: string, to: Status) => void;
  onDelete: (id: string) => void;
  onFocus: (task: Task) => void;
}

function TaskCard({ task, onMove, onDelete, onFocus }: TaskCardProps) {
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
          <DropdownMenuContent align="end" className="w-40">
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
  onClose: () => void;
  onPomodoroComplete: (taskId: string) => void;
}

function FocusMode({ task, onClose, onPomodoroComplete }: FocusModeProps) {
  const navigate = useNavigate();
  const onComplete = useCallback(() => {
    onPomodoroComplete(task.id);
    toast.success('Pomodoro complete! Take a 5-min break.');
  }, [task.id, onPomodoroComplete]);

  const { state, start, pause, reset } = usePomodoroTimer(task.id, onComplete);

  const mins = Math.floor(state.secondsLeft / 60).toString().padStart(2, '0');
  const secs = (state.secondsLeft % 60).toString().padStart(2, '0');

  const phaseColor = state.phase === 'break' ? 'text-emerald-400' : 'text-amber-400';
  const ringColor  = state.phase === 'break' ? 'ring-emerald-500/40' : 'ring-amber-500/40';

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="flex w-full max-w-md flex-col items-center gap-8 rounded-2xl border border-zinc-800 bg-zinc-950 p-8"
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
          className={cn(
            'flex size-36 flex-col items-center justify-center rounded-full ring-4 transition-all',
            ringColor,
            state.running ? 'ring-opacity-100' : 'ring-opacity-30',
          )}
        >
          <span className={cn('font-mono text-4xl font-bold tabular-nums', phaseColor)}>
            {mins}:{secs}
          </span>
          <span className="mt-1 text-[10px] uppercase tracking-widest text-zinc-500">
            {state.phase === 'idle' ? 'ready' : state.phase}
          </span>
        </div>

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
              onClick={start}
            >
              <PlayIcon className="size-5" />
            </Button>
          )}
          <Button
            size="icon"
            variant="outline"
            className="size-10 rounded-full border-zinc-700"
            onClick={reset}
          >
            <RefreshCwIcon className="size-4" />
          </Button>
        </div>

        {/* Pomodoro count */}
        {state.completed > 0 && (
          <p className="text-sm text-zinc-400">
            {'🍅'.repeat(state.completed)} {state.completed} pomodoro{state.completed > 1 ? 's' : ''} this session
          </p>
        )}

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
  onSave: (data: { title: string; description: string; priority: Priority }) => void;
}

function NewTaskDialog({ open, onOpenChange, onSave }: NewTaskDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>(2);

  const handleSave = () => {
    if (!title.trim()) return;
    onSave({ title: title.trim(), description: description.trim(), priority });
    setTitle('');
    setDescription('');
    setPriority(2);
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
  onMove: (id: string, to: Status) => void;
  onDelete: (id: string) => void;
  onFocus: (task: Task) => void;
}

function Column({ status, tasks, onMove, onDelete, onFocus }: ColumnProps) {
  const meta = STATUS_META[status];
  const StatusIcon = meta.icon;

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      {/* Column header */}
      <div className="flex items-center gap-1.5 px-1">
        <StatusIcon className="size-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
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
                onMove={onMove}
                onDelete={onDelete}
                onFocus={onFocus}
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
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [focusedTask, setFocusedTask] = useState<Task | null>(null);
  const [isPrioritizing, setIsPrioritizing] = useState(false);

  const load = useCallback(async () => {
    try {
      const rows = await window.electron.ipc.invoke<Task[]>('tasks:list', {});
      setTasks(rows ?? []);
    } catch {
      toast.error('Could not load tasks');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async (data: {
    title: string;
    description: string;
    priority: Priority;
  }) => {
    try {
      const task = await window.electron.ipc.invoke<Task>('tasks:create', {
        title: data.title,
        description: data.description,
        priority: data.priority,
        status: 'backlog',
      });
      setTasks((prev) => [task, ...prev]);
    } catch {
      toast.error('Could not create task');
    }
  };

  const handleMove = async (id: string, to: Status) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status: to } : t)),
    );
    try {
      await window.electron.ipc.invoke('tasks:update', { id, status: to });
    } catch {
      toast.error('Could not update task');
      void load(); // revert
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

  const handlePomodoroComplete = async (taskId: string) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId ? { ...t, pomodoro_count: t.pomodoro_count + 1 } : t,
      ),
    );
    try {
      await window.electron.ipc.invoke('tasks:increment-pomodoro', { id: taskId });
    } catch {
      // Best-effort
    }
  };

  const handlePrioritize = async () => {
    setIsPrioritizing(true);
    try {
      const result = await window.electron.ipc.invoke<{ orderedIds: string[]; reasoning: string }>(
        'tasks:prioritize',
        {},
      );
      // Reorder tasks by the agent's suggestion
      const idOrder = result.orderedIds;
      setTasks((prev) => {
        const sorted = [...prev].sort(
          (a, b) => idOrder.indexOf(a.id) - idOrder.indexOf(b.id),
        );
        return sorted;
      });
      toast.success('Tasks prioritized by AI', {
        description: result.reasoning.slice(0, 120),
      });
    } catch {
      toast.error('Could not prioritize tasks');
    } finally {
      setIsPrioritizing(false);
    }
  };

  const tasksByStatus = (status: Status) =>
    tasks.filter((t) => t.status === status);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        crumbs={[{ label: 'Tasks' }]}
        actions={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 text-xs"
              onClick={handlePrioritize}
              disabled={isPrioritizing || tasks.length === 0}
            >
              {isPrioritizing ? (
                <Loader2Icon className="size-3 animate-spin" />
              ) : (
                <BrainIcon className="size-3" />
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

      {/* Board */}
      <div className="flex min-h-0 flex-1 gap-3 overflow-hidden p-4">
        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          COLUMNS.map((status) => (
            <Column
              key={status}
              status={status}
              tasks={tasksByStatus(status)}
              onMove={handleMove}
              onDelete={handleDelete}
              onFocus={setFocusedTask}
            />
          ))
        )}
      </div>

      {/* New task dialog */}
      <NewTaskDialog
        open={newTaskOpen}
        onOpenChange={setNewTaskOpen}
        onSave={handleCreate}
      />

      {/* Focus mode overlay */}
      <AnimatePresence>
        {focusedTask && (
          <FocusMode
            task={focusedTask}
            onClose={() => setFocusedTask(null)}
            onPomodoroComplete={handlePomodoroComplete}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
