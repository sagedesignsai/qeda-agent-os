/**
 * components/tasks/FocusStage.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The in-session counterpart to `TodayEmptyHero`.
 *
 * The idle page asks "what should I do?" — this one answers "you are already
 * doing it." It keeps the active task, the phase, the next physical step and
 * the way out of the session in one calm card, so minimising the focus modal
 * never drops the user back into a launchpad they have already launched from.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'motion/react';
import {
  BotIcon,
  CheckIcon,
  CoffeeIcon,
  Maximize2Icon,
  PauseIcon,
  PlayIcon,
  SkipForwardIcon,
  SparklesIcon,
  SunIcon,
  UsersIcon,
  WaypointsIcon,
  ZapIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useFocusSession } from '@/hooks/use-focus-session';
import { useProjectScope } from '@/hooks/use-project-scope';
import { XP_REWARDS } from '@/lib/gamification';
import type { Task, TaskStep } from '@/main/ipc/channels';

export interface FocusStageProps {
  className?: string;
  /** Open the full-screen focus overlay (the immersive version of this card). */
  onExpand: () => void;
  onComplete: (task: Task, event: React.MouseEvent) => void;
  onOpenCopilot?: (task: Task) => void;
}

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}

function formatClock(seconds: number): string {
  return `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;
}

export function FocusStage({
  className,
  onExpand,
  onComplete,
  onOpenCopilot,
}: FocusStageProps) {
  const focus = useFocusSession();
  const task = focus.focusedTask;
  const { activeProjectId, withScope } = useProjectScope();
  const navigate = useNavigate();
  const [steps, setSteps] = useState<TaskStep[]>([]);

  const taskId = task?.id ?? null;

  useEffect(() => {
    if (!taskId) {
      setSteps([]);
      return undefined;
    }
    let cancelled = false;
    void window.electron.ipc
      .invoke<TaskStep[]>('tasks:steps-list', { taskId })
      .then((list) => {
        if (!cancelled) setSteps(list ?? []);
      })
      .catch(() => {
        if (!cancelled) setSteps([]);
      });
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  const nextStep = useMemo(() => steps.find((step) => !step.done) ?? null, [steps]);
  const doneSteps = steps.filter((step) => step.done).length;

  if (!task) return null;

  const timer = focus.timer;
  const isBreak = timer.phase === 'break';
  const isIdle = timer.phase === 'idle';
  const isRunning = timer.running;
  const accent = isBreak ? 'emerald' : 'amber';
  const ringColor = isBreak ? '#34d399' : '#f59e0b';
  const radius = 88;
  const circumference = 2 * Math.PI * radius;

  const finishAt = new Date(
    Date.now() + timer.secondsLeft * 1000,
  ).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  const xpAtStake =
    task.priority === 1
      ? XP_REWARDS.TASK_HIGH
      : task.priority === 2
        ? XP_REWARDS.TASK_MED
        : XP_REWARDS.TASK_LOW;

  const phaseLabel = isBreak ? 'Recover' : isIdle ? 'Ready' : 'Flow';
  const phaseCopy = isBreak
    ? 'Step away. Start the break when you are ready.'
    : isIdle
      ? 'The task is set. Start the clock when you are.'
      : isRunning
        ? 'One thing at a time. Nothing else needs you right now.'
        : 'Paused. Pick the thread back up when you are ready.';

  const toggleNextStep = async () => {
    if (!nextStep) return;
    setSteps((prev) =>
      prev.map((step) =>
        step.id === nextStep.id ? { ...step, done: 1 } : step,
      ),
    );
    try {
      await window.electron.ipc.invoke('tasks:step-toggle', {
        id: nextStep.id,
        done: true,
      });
    } catch {
      /* the local tick is optimistic; reloading shows the truth */
    }
  };

  const openPresence = () => {
    const project = task.project_id || activeProjectId;
    navigate(project ? `/presence?project=${project}` : '/presence');
  };

  const openTrace = () => {
    navigate(task.project_id ? `/trace/${task.project_id}` : withScope('/trace'));
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={cn(
        'relative isolate overflow-hidden rounded-2xl border bg-gradient-to-br p-4 sm:p-5',
        isBreak
          ? 'border-emerald-500/40 from-emerald-500/10 via-card/95 to-card'
          : 'border-amber-500/40 from-amber-500/10 via-card/95 to-card',
        className,
      )}
    >
      {/* Ambient phase light — alive, but far below the reading plane. */}
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute -top-24 -right-16 size-64 rounded-full blur-3xl',
          isBreak ? 'bg-emerald-500/15' : 'bg-amber-500/15',
        )}
      />
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute -bottom-32 -left-20 size-72 rounded-full blur-3xl',
          isBreak ? 'bg-teal-500/10' : 'bg-orange-500/10',
        )}
      />

      {/* Session ribbon */}
      <div className="relative flex flex-wrap items-center gap-x-2.5 gap-y-1 border-b border-border/40 pb-2.5">
        <span className="relative flex size-2">
          <span
            className={cn(
              'absolute inline-flex size-full animate-ping rounded-full opacity-60',
              isBreak ? 'bg-emerald-400' : 'bg-amber-400',
            )}
          />
          <span
            className={cn(
              'relative inline-flex size-2 rounded-full',
              isBreak ? 'bg-emerald-400' : 'bg-amber-400',
            )}
          />
        </span>
        <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
          {isBreak ? 'Break in progress' : isRunning ? 'In flow' : 'Session parked'}
        </span>
        <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground/80">
          {task.title}
        </span>
        <Badge
          variant="secondary"
          className={cn(
            'border-0 px-1.5 text-[10px] font-bold',
            isBreak
              ? 'bg-emerald-500/15 text-emerald-400'
              : 'bg-amber-500/15 text-amber-400',
          )}
        >
          {formatClock(timer.secondsLeft)} left
        </Badge>
      </div>

      <div className="relative mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
        {/* Timer ring */}
        <div className="relative mx-auto size-[168px] shrink-0 sm:mx-0 sm:size-[184px]">
          <svg
            viewBox="0 0 200 200"
            className="size-full -rotate-90"
            aria-hidden
          >
            <circle
              cx="100"
              cy="100"
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth="6"
              className="text-border/50"
            />
            <circle
              cx="100"
              cy="100"
              r={radius}
              fill="none"
              stroke={ringColor}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - focus.progress)}
              className="transition-[stroke-dashoffset] duration-700 ease-linear"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[10px] font-semibold tracking-[0.2em] text-muted-foreground uppercase">
              {phaseLabel}
            </span>
            <span className="mt-0.5 font-mono text-4xl font-semibold tabular-nums tracking-tight">
              {formatClock(timer.secondsLeft)}
            </span>
            <span className="mt-1 text-[10px] text-muted-foreground">
              {isBreak ? 'until work' : `done ~${finishAt}`}
            </span>
          </div>
        </div>

        {/* The one thing */}
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={cn(
                'h-5 border-0 px-1.5 text-[10px] font-semibold',
                isBreak
                  ? 'bg-emerald-500/10 text-emerald-400'
                  : 'bg-amber-500/10 text-amber-400',
              )}
            >
              {isBreak ? (
                <CoffeeIcon className="mr-1 size-3" />
              ) : (
                <ZapIcon className="mr-1 size-3 fill-current" />
              )}
              {phaseLabel}
            </Badge>
            {!isBreak && task.priority === 1 ? (
              <span className="text-[10px] font-medium text-rose-400">
                High priority
              </span>
            ) : null}
          </div>

          <h2 className="text-xl leading-tight font-semibold tracking-tight sm:text-2xl">
            {task.title}
          </h2>

          {isBreak ? (
            <p className="max-w-md text-xs text-muted-foreground">
              {phaseCopy} Next up when you return: <span className="text-foreground">{task.title}</span>.
            </p>
          ) : nextStep ? (
            <button
              type="button"
              onClick={() => void toggleNextStep()}
              className="group flex w-full max-w-md items-start gap-2 rounded-lg border border-border/50 bg-background/40 px-2.5 py-2 text-left transition-colors hover:border-amber-500/40 hover:bg-background/70"
            >
              <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border border-muted-foreground/40 text-transparent transition-colors group-hover:border-amber-500 group-hover:text-amber-500">
                <CheckIcon className="size-3" />
              </span>
              <span className="min-w-0">
                <span className="block text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                  Now
                </span>
                <span className="block truncate text-xs font-medium">
                  {nextStep.title}
                </span>
              </span>
              <span className="ml-auto shrink-0 self-center text-[10px] text-muted-foreground">
                {doneSteps}/{steps.length}
              </span>
            </button>
          ) : (
            <p className="max-w-md text-xs text-muted-foreground">
              {task.description || phaseCopy}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-0.5 text-[10px] text-muted-foreground">
            {/* Pomodoro trail */}
            <span className="flex items-center gap-1" title="Pomodoros this session">
              {Array.from({ length: Math.max(4, timer.completed + 1) }).map(
                (_, i) => {
                  const filled = i < timer.completed;
                  const current = i === timer.completed && !isBreak;
                  return (
                    <SunIcon
                      key={i}
                      className={cn(
                        'size-3',
                        filled
                          ? 'fill-amber-400 text-amber-400'
                          : current
                            ? 'animate-pulse fill-amber-400/40 text-amber-400'
                            : 'text-muted-foreground/30',
                      )}
                    />
                  );
                },
              )}
            </span>
            <span className="tabular-nums">
              {timer.completed} round{timer.completed === 1 ? '' : 's'} today
            </span>
            <span aria-hidden>·</span>
            <span className="flex items-center gap-0.5 text-amber-400/90">
              <SparklesIcon className="size-2.5" />
              +{xpAtStake} XP
            </span>
          </div>
        </div>
      </div>

      {/* Session controls */}
      <div className="relative mt-4 flex flex-wrap items-center gap-2 border-t border-border/40 pt-3">
        <Button
          size="sm"
          className={cn(
            'h-8 gap-1.5 text-xs font-semibold text-zinc-950',
            isBreak
              ? 'bg-emerald-400 hover:bg-emerald-300'
              : 'bg-amber-500 hover:bg-amber-400',
          )}
          onClick={() => (isRunning ? focus.pause() : focus.start())}
        >
          {isRunning ? (
            <PauseIcon className="size-3.5 fill-current" />
          ) : (
            <PlayIcon className="size-3.5 fill-current" />
          )}
          {isRunning
            ? 'Pause'
            : isBreak
              ? 'Start break'
              : isIdle
                ? 'Start focus'
                : 'Resume'}
        </Button>

        {!isBreak ? (
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs"
            onClick={(event) => onComplete(task, event)}
          >
            <CheckIcon className="size-3.5 text-emerald-400" />
            Complete task
          </Button>
        ) : null}

        <Button
          size="sm"
          variant="ghost"
          className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          disabled={isIdle}
          onClick={() => focus.skip()}
        >
          {isBreak ? (
            <SkipForwardIcon className="size-3.5" />
          ) : (
            <CoffeeIcon className="size-3.5" />
          )}
          {isBreak ? 'Back early' : 'Take a break'}
        </Button>

        <div className="ml-auto flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-8 gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            onClick={openPresence}
          >
            <UsersIcon className="size-3.5" />
            Presence
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            onClick={openTrace}
          >
            <WaypointsIcon className="size-3.5" />
            NovaTrace
          </Button>
          {onOpenCopilot ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 gap-1 text-[11px] text-muted-foreground hover:text-foreground"
              onClick={() => onOpenCopilot(task)}
            >
              <BotIcon className="size-3.5" />
              Copilot
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            className="h-8 gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            onClick={onExpand}
          >
            <Maximize2Icon className="size-3.5" />
            Expand
          </Button>
        </div>
      </div>
    </motion.section>
  );
}
