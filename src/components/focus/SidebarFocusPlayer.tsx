/**
 * components/focus/SidebarFocusPlayer.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The app-wide home for a focus session, in the rail next to the music player.
 *
 * It replaces the floating bottom-centre bar, which covered the Chat composer
 * and other bottom-docked inputs. Same three densities as `SidebarMusicPlayer`:
 *
 *   collapsed — a ring with the remaining minutes; click opens a popover
 *   card      — a large clock, the task, its next step, transport and Complete
 *   sheet     — the clock, presets, the full step checklist and session actions
 *
 * Audio deliberately does not live here: the music system already owns
 * playback, scenes and the mixer, and a second set of controls in the rail was
 * duplicate chrome for the same store.
 *
 * The full-screen overlay is still the Tasks page's job; "maximize" navigates
 * there *with the current project scope* (the old bar dropped `?project=`), and
 * `FocusRuntime` parks an open overlay back in the rail when the route leaves
 * `/tasks` so a hidden `modal` state cannot reopen later.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  CheckIcon,
  ChevronUpIcon,
  Maximize2Icon,
  PauseIcon,
  PlayIcon,
  SkipForwardIcon,
  TimerIcon,
  XIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useSidebar } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';
import { XP_REWARDS } from '@/lib/gamification';
import { DURATION_PRESETS } from '@/lib/focus/presets';
import { useFocusSession } from '@/hooks/use-focus-session';
import { useProjectScope } from '@/hooks/use-project-scope';
import { useIpcEvent } from '@/hooks/use-ipc';
import { completeTask } from '@/lib/focus/task-actions';
import type { TaskStep } from '@/main/ipc/channels';

function formatClock(secondsLeft: number): string {
  const mins = Math.floor(secondsLeft / 60)
    .toString()
    .padStart(2, '0');
  const secs = (secondsLeft % 60).toString().padStart(2, '0');
  return `${mins}:${secs}`;
}

/**
 * The countdown is the point of the session, so it is the largest thing in every
 * non-collapsed view. `compact` is for the 30px icon tile, where only the
 * remaining minutes fit.
 */
function FocusClock({
  secondsLeft,
  progress,
  isBreak,
  size = 72,
  compact = false,
}: {
  secondsLeft: number;
  progress: number;
  isBreak: boolean;
  size?: number;
  compact?: boolean;
}) {
  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  const stroke = isBreak ? '#34d399' : '#f59e0b';
  const fontSize =
    size >= 100
      ? 'text-2xl'
      : size >= 84
        ? 'text-lg'
        : size >= 64
          ? 'text-sm'
          : 'text-[10px]';

  return (
    <span
      className="relative flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg viewBox="0 0 40 40" className="size-full -rotate-90">
        <circle
          cx="20"
          cy="20"
          r={radius}
          className="stroke-muted/30"
          strokeWidth="2.5"
          fill="transparent"
        />
        <circle
          cx="20"
          cy="20"
          r={radius}
          stroke={stroke}
          strokeWidth="2.5"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress * circumference}
          strokeLinecap="round"
          fill="transparent"
          className="transition-all duration-300 ease-linear"
        />
      </svg>
      <span
        className={cn('absolute font-mono font-bold tabular-nums', fontSize)}
        style={{ color: stroke }}
      >
        {compact
          ? String(Math.ceil(secondsLeft / 60))
          : formatClock(secondsLeft)}
      </span>
    </span>
  );
}

export function SidebarFocusPlayer() {
  const focus = useFocusSession();
  const navigate = useNavigate();
  const { withScope } = useProjectScope();
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';

  const [popoverOpen, setPopoverOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [steps, setSteps] = useState<TaskStep[]>([]);
  const [stepsVersion, setStepsVersion] = useState(0);

  const task = focus.focusedTask;
  const taskId = task?.id ?? null;

  // Steps are the smallest unit of "what do I do next". Loading them for the
  // focused task lets the rail show the next one without opening the board.
  useEffect(() => {
    if (!taskId) return undefined;
    let cancelled = false;
    void window.electron.ipc
      .invoke<TaskStep[]>('tasks:steps-list', { taskId })
      .then((rows) => {
        if (!cancelled) setSteps(rows ?? []);
      })
      .catch(() => {
        if (!cancelled) setSteps([]);
      });
    return () => {
      cancelled = true;
    };
  }, [taskId, stepsVersion]);

  // Step toggles from the board, the sheet, or the AI breakdown all broadcast;
  // refetching keeps this checklist in step with every other surface.
  useIpcEvent(
    'tasks:changed',
    () => setStepsVersion((version) => version + 1),
    [],
  );

  if (!task) return null;

  const { timer, progress } = focus;
  const isBreak = timer.phase === 'break';
  const running = timer.running;
  const timeLabel = formatClock(timer.secondsLeft);
  const phaseLabel =
    timer.phase === 'idle' ? 'Ready' : isBreak ? 'Break time' : 'Deep focus';
  const xpReward =
    task.priority === 1
      ? XP_REWARDS.TASK_HIGH
      : task.priority === 2
        ? XP_REWARDS.TASK_MED
        : XP_REWARDS.TASK_LOW;

  const doneSteps = steps.filter((step) => step.done === 1).length;
  const nextStep = steps.find((step) => step.done === 0) ?? null;

  const toggleStep = async (step: TaskStep) => {
    const next = step.done !== 1;
    setSteps((prev) =>
      prev.map((row) =>
        row.id === step.id ? { ...row, done: next ? 1 : 0 } : row,
      ),
    );
    try {
      await window.electron.ipc.invoke('tasks:step-toggle', {
        id: step.id,
        done: next,
      });
      if (next) {
        void window.electron.ipc
          .invoke('gamification:award-xp', {
            amount: XP_REWARDS.STEP_COMPLETE,
            source: 'step_complete',
            entityId: step.id,
            idempotencyKey: `step_done:${step.id}`,
          })
          .catch(() => {});
      }
    } catch {
      setSteps((prev) =>
        prev.map((row) =>
          row.id === step.id ? { ...row, done: step.done } : row,
        ),
      );
      toast.error('Could not update step');
    }
  };

  const complete = async () => {
    setCompleting(true);
    try {
      await completeTask(task);
      toast.success('Task complete', {
        description: `+${xpReward} XP · ${task.title}`,
      });
      focus.clearFocus();
      setPopoverOpen(false);
      setSheetOpen(false);
    } catch {
      toast.error('Could not complete the task');
    } finally {
      setCompleting(false);
    }
  };

  /** Open the full-screen overlay *in the current project scope*. */
  const expand = () => {
    setPopoverOpen(false);
    setSheetOpen(false);
    navigate(withScope('/tasks'));
    focus.setDisplayMode('modal');
  };

  const end = () => {
    setPopoverOpen(false);
    setSheetOpen(false);
    focus.clearFocus();
  };

  const playPause = (size: 'sm' | 'default' = 'sm') => (
    <Button
      size="icon"
      variant={running ? 'ghost' : 'default'}
      className={cn('rounded-full', size === 'sm' ? 'size-7' : 'size-9')}
      onClick={running ? focus.pause : focus.start}
      aria-label={running ? 'Pause timer' : 'Start timer'}
    >
      {running ? (
        <PauseIcon className={size === 'sm' ? 'size-3' : 'size-4'} />
      ) : (
        <PlayIcon
          className={cn('fill-current', size === 'sm' ? 'size-3' : 'size-4')}
        />
      )}
    </Button>
  );

  const stepRow = (step: TaskStep, compact = false) => (
    <button
      key={step.id}
      type="button"
      onClick={() => void toggleStep(step)}
      className={cn(
        'flex w-full items-center gap-1.5 rounded text-left transition-colors hover:bg-sidebar-accent/60',
        compact ? 'px-1 py-0.5' : 'px-1.5 py-1',
      )}
      aria-label={`${step.done ? 'Reopen' : 'Complete'} step: ${step.title}`}
    >
      <span
        className={cn(
          'flex shrink-0 items-center justify-center rounded-full border',
          compact ? 'size-2.5' : 'size-3',
          step.done
            ? 'border-emerald-500 bg-emerald-500 text-white'
            : 'border-muted-foreground/40',
        )}
        aria-hidden
      >
        {step.done === 1 && <CheckIcon className="size-2 stroke-[3]" />}
      </span>
      <span
        className={cn(
          'min-w-0 flex-1 truncate',
          compact ? 'text-[10px]' : 'text-[11px]',
          step.done === 1 && 'text-muted-foreground line-through',
        )}
        title={step.title}
      >
        {step.title}
      </span>
    </button>
  );

  const stepProgressLine =
    steps.length > 0 ? `${doneSteps}/${steps.length} steps` : null;

  const collapsedButton = (
    <button
      type="button"
      className={cn(
        'relative mx-auto flex size-8 items-center justify-center overflow-hidden rounded-md',
        'ring-1 ring-sidebar-border/70 transition-colors hover:ring-primary/40',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
      )}
      aria-label={`${phaseLabel}: ${timeLabel} left on ${task.title}`}
    >
      <FocusClock
        secondsLeft={timer.secondsLeft}
        progress={progress}
        isBreak={isBreak}
        size={30}
        compact
      />
      {running && (
        <span
          className={cn(
            'absolute bottom-0.5 size-1 rounded-full',
            isBreak ? 'bg-emerald-400' : 'bg-amber-400',
          )}
          aria-hidden
        />
      )}
    </button>
  );

  const card = (
    <div className="overflow-hidden rounded-lg border border-sidebar-border/70 bg-sidebar-accent/35 shadow-sm">
      <div className="flex items-center justify-between gap-1 px-2 pt-1.5">
        <span className="flex min-w-0 items-center gap-1.5 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
          <span
            className={cn(
              'size-1.5 shrink-0 rounded-full',
              running
                ? isBreak
                  ? 'animate-pulse bg-emerald-400'
                  : 'animate-pulse bg-amber-400'
                : 'bg-muted-foreground',
            )}
            aria-hidden
          />
          <span className="truncate">{phaseLabel}</span>
        </span>
        <Button
          size="icon"
          variant="ghost"
          className="size-5 shrink-0 rounded-full text-muted-foreground"
          onClick={() => setSheetOpen(true)}
          aria-label="Open focus panel"
        >
          <ChevronUpIcon className="size-3" />
        </Button>
      </div>

      <button
        type="button"
        className="flex w-full items-center gap-2 px-2 pt-0.5 pb-1 text-left transition-colors hover:bg-sidebar-accent/40"
        onClick={() => setSheetOpen(true)}
        aria-label={`Open focus panel for ${task.title}`}
      >
        <FocusClock
          secondsLeft={timer.secondsLeft}
          progress={progress}
          isBreak={isBreak}
          size={72}
        />
        <span className="min-w-0 flex-1">
          <span
            className="block truncate text-[11px] font-semibold text-sidebar-foreground"
            title={task.title}
          >
            {task.title}
          </span>
          <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
            {focus.preset.label} min
            {stepProgressLine ? ` · ${stepProgressLine}` : ''}
          </span>
        </span>
      </button>

      {nextStep && (
        <div className="mx-1.5 mb-1 rounded-md border border-sidebar-border/60 bg-sidebar/40 px-0.5 py-0.5">
          {stepRow(nextStep, true)}
        </div>
      )}

      <div className="flex items-center gap-0.5 px-1.5 pb-1">
        {playPause()}
        <Button
          size="icon"
          variant="ghost"
          className="size-7 rounded-full text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
          onClick={focus.skip}
          aria-label="Skip phase"
        >
          <SkipForwardIcon className="size-3" />
        </Button>
        <span className="flex-1" />
        <Button
          size="icon"
          variant="ghost"
          className="size-7 rounded-full text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
          onClick={expand}
          aria-label="Maximize focus mode"
        >
          <Maximize2Icon className="size-3" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-7 rounded-full text-muted-foreground hover:bg-sidebar-accent hover:text-destructive"
          onClick={end}
          aria-label="End focus session"
        >
          <XIcon className="size-3" />
        </Button>
      </div>

      <div className="px-1.5 pb-1.5">
        <Button
          size="sm"
          disabled={completing}
          className="h-7 w-full gap-1.5 rounded-md bg-emerald-600 px-2 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-500 active:scale-[0.99]"
          onClick={() => void complete()}
        >
          <CheckIcon className="size-3 stroke-[2.5]" />
          <span>Complete</span>
          <Badge
            variant="secondary"
            className="h-4 border-0 bg-emerald-700/60 px-1 text-[9px] font-bold text-emerald-100"
          >
            +{xpReward}
          </Badge>
        </Button>
      </div>
    </div>
  );

  const popoverBody = (
    <>
      <div className="border-b border-border/60 bg-muted/30 px-3 py-2">
        <div className="flex items-center gap-2 text-xs font-medium">
          <TimerIcon className="size-3.5 text-primary" />
          {phaseLabel}
          {stepProgressLine && (
            <span className="ml-auto text-[10px] text-muted-foreground">
              {stepProgressLine}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col items-center px-3 pt-3 pb-2">
        <FocusClock
          secondsLeft={timer.secondsLeft}
          progress={progress}
          isBreak={isBreak}
          size={88}
        />
        <p
          className="mt-2 w-full truncate text-center text-xs font-semibold"
          title={task.title}
        >
          {task.title}
        </p>
      </div>

      {steps.length > 0 && (
        <div className="mx-3 mb-2 space-y-0.5 border-t border-border/50 pt-2">
          {steps.slice(0, 3).map((step) => stepRow(step, true))}
        </div>
      )}

      <div className="flex items-center gap-1 px-3 pb-2">
        {playPause()}
        <Button
          size="icon"
          variant="ghost"
          className="size-7 rounded-full text-muted-foreground"
          onClick={focus.skip}
          aria-label="Skip phase"
        >
          <SkipForwardIcon className="size-3" />
        </Button>
        <span className="flex-1" />
        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1 rounded-md px-2 text-[11px]"
          onClick={expand}
        >
          <Maximize2Icon className="size-3" />
          Open
        </Button>
      </div>

      <div className="px-3 pb-2">
        <Button
          size="sm"
          disabled={completing}
          className="h-7 w-full gap-1.5 rounded-md bg-emerald-600 text-[11px] font-semibold text-white hover:bg-emerald-500"
          onClick={() => void complete()}
        >
          <CheckIcon className="size-3 stroke-[2.5]" />
          Complete · +{xpReward} XP
        </Button>
      </div>

      <div className="flex items-center gap-1 border-t border-border/60 bg-muted/20 px-2 py-1.5">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 flex-1 justify-start gap-1 rounded-md px-2 text-[11px]"
          onClick={() => {
            setPopoverOpen(false);
            setSheetOpen(true);
          }}
        >
          <ChevronUpIcon className="size-3 text-primary" />
          Focus panel
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 rounded-md px-2 text-[11px] text-muted-foreground"
          onClick={end}
        >
          End
        </Button>
      </div>
    </>
  );

  return (
    <>
      <div className={cn(collapsed && 'flex justify-center pb-1')}>
        {collapsed ? (
          <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>{collapsedButton}</PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                <p className="max-w-[14rem] truncate font-medium">
                  {task.title}
                </p>
                <p className="max-w-[14rem] text-[11px] text-muted-foreground">
                  {phaseLabel} · {timeLabel} left
                </p>
              </TooltipContent>
            </Tooltip>
            <PopoverContent
              side="right"
              align="end"
              sideOffset={10}
              className="w-72 gap-0 overflow-hidden p-0"
            >
              {popoverBody}
            </PopoverContent>
          </Popover>
        ) : (
          card
        )}
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
        >
          <SheetHeader className="border-b border-border/60 px-4 py-3">
            <SheetTitle className="flex items-center gap-2 text-sm">
              <TimerIcon className="size-4 text-primary" />
              Focus
            </SheetTitle>
            <SheetDescription className="text-[11px]">
              The timer keeps running anywhere in Qeda.
            </SheetDescription>
          </SheetHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            <div className="flex flex-col items-center">
              <FocusClock
                secondsLeft={timer.secondsLeft}
                progress={progress}
                isBreak={isBreak}
                size={112}
              />
              <p
                className="mt-2 max-w-full truncate text-sm font-semibold"
                title={task.title}
              >
                {task.title}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {phaseLabel}
                {timer.completed > 0 &&
                  ` · ${timer.completed} pomodoro${timer.completed > 1 ? 's' : ''}`}
              </p>
            </div>

            <ToggleGroup
              type="single"
              value={String(focus.presetIndex)}
              onValueChange={(value) =>
                value !== '' && focus.setPresetIndex(Number(value))
              }
              size="sm"
              aria-label="Focus duration"
            >
              {DURATION_PRESETS.map((preset, index) => (
                <ToggleGroupItem
                  key={preset.label}
                  value={String(index)}
                  className="text-[11px]"
                  aria-label={`${preset.work} minute focus, ${preset.break} minute break`}
                >
                  {preset.label} min
                </ToggleGroupItem>
              ))}
            </ToggleGroup>

            <div className="flex items-center justify-center gap-2">
              {playPause('default')}
              <Button
                size="icon"
                variant="outline"
                className="size-9 rounded-full"
                onClick={focus.skip}
                aria-label="Skip phase"
              >
                <SkipForwardIcon className="size-4" />
              </Button>
            </div>

            <div className="rounded-lg border border-border/60 p-2">
              <div className="mb-1 flex items-center justify-between px-1">
                <span className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                  Steps
                </span>
                {stepProgressLine && (
                  <span className="text-[10px] text-muted-foreground">
                    {stepProgressLine}
                  </span>
                )}
              </div>
              {steps.length === 0 ? (
                <p className="px-1 py-1 text-[11px] text-muted-foreground">
                  No steps yet — break this task down on the board.
                </p>
              ) : (
                <div className="max-h-48 space-y-0.5 overflow-y-auto">
                  {steps.map((step) => stepRow(step))}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Button
                disabled={completing}
                className="w-full gap-2 bg-emerald-600 font-semibold text-white hover:bg-emerald-500"
                onClick={() => void complete()}
              >
                <CheckIcon className="size-4 stroke-[2.5]" />
                Complete Task (+{xpReward} XP)
              </Button>
              <Button variant="outline" className="w-full gap-2" onClick={expand}>
                <Maximize2Icon className="size-4" />
                Open focus mode
              </Button>
              <Button
                variant="ghost"
                className="w-full gap-2 text-muted-foreground hover:text-destructive"
                onClick={end}
              >
                <XIcon className="size-4" />
                End session
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
