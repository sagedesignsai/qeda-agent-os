/**
 * components/music/MusicHome.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The Music landing view: choose a task, start focus, and shape the listening
 * space with a scene. Library browsing stays available as a separate view.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  ArrowRightIcon,
  CheckCircle2Icon,
  Clock3Icon,
  Loader2Icon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  SparklesIcon,
  TargetIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { useFocusSession } from '@/hooks/use-focus-session';
import type { Task } from '@/main/ipc/channels';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ScenePicker } from './ScenePicker';

export interface MusicHomeProps {
  onBrowseLibrary: () => void;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0');
  const secs = (seconds % 60).toString().padStart(2, '0');
  return `${mins}:${secs}`;
}

export function MusicHome({ onBrowseLibrary }: MusicHomeProps) {
  const navigate = useNavigate();
  const focus = useFocusSession();
  const [taskPickerOpen, setTaskPickerOpen] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [taskQuery, setTaskQuery] = useState('');

  useEffect(() => {
    if (!taskPickerOpen) return;

    let cancelled = false;
    setTasksLoading(true);
    void (async () => {
      try {
        const rows = await window.electron.ipc.invoke<Task[]>('tasks:list', {});
        if (!cancelled)
          setTasks((rows ?? []).filter((task) => task.status !== 'done'));
      } catch {
        if (!cancelled) toast.error('Could not load tasks');
      } finally {
        if (!cancelled) setTasksLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [taskPickerOpen]);

  const filteredTasks = useMemo(() => {
    const query = taskQuery.trim().toLocaleLowerCase();
    if (!query) return tasks;
    return tasks.filter((task) =>
      task.title.toLocaleLowerCase().includes(query),
    );
  }, [taskQuery, tasks]);

  const startFocusOn = (task: Task) => {
    focus.startFocus(task);
    focus.start();
    setTaskPickerOpen(false);
    setTaskQuery('');
  };

  const task = focus.focusedTask;
  const running = focus.timer.running;
  const phaseLabel =
    focus.timer.phase === 'break'
      ? 'Break'
      : focus.timer.phase === 'work'
        ? 'Focus'
        : 'Ready';

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-7 p-5 md:p-7">
        <section className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            Make room to focus.
          </h2>
          <p className="max-w-xl text-sm text-muted-foreground">
            Pair the work in front of you with a soundscape that helps you
            settle in.
          </p>
        </section>

        <section className="overflow-hidden rounded-xl border border-border/70 bg-card">
          <div className="flex flex-col gap-5 p-4 sm:flex-row sm:items-center sm:p-5">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <TargetIcon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-foreground">
                    {task ? task.title : 'Choose a task to begin'}
                  </h3>
                  {task && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {phaseLabel}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {task
                    ? running
                      ? 'Your focus timer is running across Qeda.'
                      : 'Your session is paused. Resume when you’re ready.'
                    : 'A focus session stays with you while you move around the app.'}
                </p>
                {task && (
                  <div className="mt-3 flex max-w-md items-center gap-3">
                    <Progress value={focus.progress * 100} className="h-1.5" />
                    <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                      {formatTime(focus.timer.secondsLeft)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2 sm:pl-3">
              {task ? (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => (running ? focus.pause() : focus.start())}
                  >
                    {running ? (
                      <PauseIcon className="size-3.5" />
                    ) : (
                      <PlayIcon className="size-3.5 fill-current" />
                    )}
                    {running ? 'Pause' : 'Resume'}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={focus.reset}
                    aria-label="Reset focus timer"
                    title="Reset focus timer"
                  >
                    <RotateCcwIcon className="size-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground"
                    onClick={() => setTaskPickerOpen(true)}
                  >
                    Change task
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setTaskPickerOpen(true)}
                >
                  <PlayIcon className="size-3.5 fill-current" />
                  Choose a task
                </Button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 border-t border-border/60 bg-muted/20 px-4 py-2.5 text-[11px] text-muted-foreground sm:px-5">
            <Clock3Icon className="size-3.5 shrink-0" />
            <span>
              {focus.preset.work} min focus / {focus.preset.break} min break
            </span>
            <span className="mx-1 h-3 w-px bg-border" />
            <span>
              Applying a scene starts its ambience and any music it includes.
            </span>
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <SparklesIcon className="size-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">
                  Choose your sound
                </h3>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Apply a scene to start its ambience and any music it includes.
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-xs text-muted-foreground"
              onClick={onBrowseLibrary}
            >
              Browse library <ArrowRightIcon className="size-3.5" />
            </Button>
          </div>

          <div className="rounded-xl border border-border/70 bg-card/40 p-3 sm:p-4">
            <ScenePicker />
          </div>
        </section>

        <Dialog
          open={taskPickerOpen}
          onOpenChange={(open) => {
            setTaskPickerOpen(open);
            if (!open) setTaskQuery('');
          }}
        >
          <DialogContent className="flex max-h-[min(80vh,40rem)] flex-col gap-3 sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Choose a focus task</DialogTitle>
              <DialogDescription>
                Starting a task begins its focus timer. You can change tasks
                later.
              </DialogDescription>
            </DialogHeader>
            <Input
              value={taskQuery}
              onChange={(event) => setTaskQuery(event.target.value)}
              placeholder="Find a task"
              aria-label="Find a task"
            />
            <ScrollArea className="min-h-0 flex-1">
              <div className="flex flex-col gap-1 pr-2">
                {tasksLoading ? (
                  <p className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
                    <Loader2Icon className="size-3.5 animate-spin" />
                    Loading tasks…
                  </p>
                ) : filteredTasks.length > 0 ? (
                  filteredTasks.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => startFocusOn(item)}
                      className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {item.status === 'active' ? (
                        <PlayIcon className="size-3.5 shrink-0 text-primary" />
                      ) : (
                        <CheckCircle2Icon className="size-3.5 shrink-0 text-muted-foreground" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {item.title}
                        </span>
                        <span className="block text-[11px] capitalize text-muted-foreground">
                          {item.status} task
                          {item.estimate_mins
                            ? ` · ${item.estimate_mins} min estimate`
                            : ''}
                        </span>
                      </span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        Start focus
                      </span>
                    </button>
                  ))
                ) : (
                  <div className="flex flex-col items-center gap-2 py-8 text-center">
                    <p className="text-sm font-medium text-foreground">
                      {tasks.length === 0
                        ? 'No open tasks'
                        : 'No matching tasks'}
                    </p>
                    <p className="max-w-xs text-xs text-muted-foreground">
                      {tasks.length === 0
                        ? 'Create a task in Tasks, then return here to start a focus session.'
                        : 'Try a different search.'}
                    </p>
                    {tasks.length === 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-1"
                        onClick={() => {
                          setTaskPickerOpen(false);
                          navigate('/tasks');
                        }}
                      >
                        Open tasks
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>
      </div>
    </ScrollArea>
  );
}
