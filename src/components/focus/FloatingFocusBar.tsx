/**
 * components/focus/FloatingFocusBar.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The app-wide mini focus bar.
 *
 * Rendered by `FocusRuntime`, not by the Tasks page, so it survives navigation.
 * It reads the global stores directly; the only thing it cannot do alone is
 * expand the full focus modal, which is why `onExpand` is a prop (the runtime
 * can navigate to /tasks first).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from 'react';
import { motion } from 'motion/react';
import {
  CheckIcon,
  Maximize2Icon,
  PauseIcon,
  PlayIcon,
  SkipForwardIcon,
  WavesIcon,
  XIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { XP_REWARDS } from '@/lib/gamification';
import { useFocusSession } from '@/hooks/use-focus-session';
import { useSoundscape } from '@/hooks/use-soundscape';
import { completeTask } from '@/lib/focus/task-actions';

export interface FloatingFocusBarProps {
  onExpand: () => void;
  /** Render in normal flow (inside the global dock) instead of fixed-centre. */
  inline?: boolean;
}

export function FloatingFocusBar({
  onExpand,
  inline,
}: FloatingFocusBarProps) {
  const focus = useFocusSession();
  const soundscape = useSoundscape();
  const [completing, setCompleting] = useState(false);
  const { focusedTask: task, timer, progress } = focus;

  if (!task) return null;

  const mins = Math.floor(timer.secondsLeft / 60)
    .toString()
    .padStart(2, '0');
  const secs = (timer.secondsLeft % 60).toString().padStart(2, '0');

  const isBreak = timer.phase === 'break';
  const phaseColor = isBreak ? 'text-emerald-400' : 'text-amber-400';
  const strokeColor = isBreak ? '#34d399' : '#f59e0b';

  const xpReward =
    task.priority === 1
      ? XP_REWARDS.TASK_HIGH
      : task.priority === 2
        ? XP_REWARDS.TASK_MED
        : XP_REWARDS.TASK_LOW;

  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - progress * circumference;

  const start = () => {
    if (!soundscape.started) void soundscape.start();
    focus.start();
  };

  const complete = async () => {
    setCompleting(true);
    try {
      await completeTask(task);
      toast.success('Task complete', {
        description: `+${xpReward} XP · ${task.title}`,
      });
      focus.clearFocus();
    } catch {
      toast.error('Could not complete the task');
    } finally {
      setCompleting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 24, scale: 0.95 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className={cn(
        'flex items-center gap-3 rounded-full border border-border/70 bg-card/95 px-4 py-2 shadow-2xl backdrop-blur-xl',
        inline
          ? 'relative w-full justify-between'
          : 'fixed bottom-6 left-1/2 z-50 -translate-x-1/2',
      )}
    >
      <div className="relative flex size-10 shrink-0 items-center justify-center">
        <svg className="size-10 -rotate-90">
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
            stroke={strokeColor}
            strokeWidth="2.5"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            fill="transparent"
            className="transition-all duration-300 ease-linear"
          />
        </svg>
        <span
          className={cn(
            'absolute font-mono text-[11px] font-bold tabular-nums',
            phaseColor,
          )}
        >
          {mins}:{secs}
        </span>
      </div>

      <div className="flex max-w-[200px] flex-col sm:max-w-[260px]">
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              'size-1.5 rounded-full',
              timer.running
                ? isBreak
                  ? 'animate-pulse bg-emerald-400'
                  : 'animate-pulse bg-amber-400'
                : 'bg-muted-foreground',
            )}
          />
          <span className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
            {timer.phase === 'idle'
              ? 'Ready'
              : isBreak
                ? 'Break time'
                : 'Deep focus'}
          </span>
        </div>
        <p className="truncate text-xs font-medium text-card-foreground">
          {task.title}
        </p>
      </div>

      <div className="h-6 w-px bg-border/60" />

      <div className="flex items-center gap-1">
        {timer.running ? (
          <Button
            size="icon"
            variant="ghost"
            className="size-7 rounded-full text-foreground hover:bg-muted"
            onClick={focus.pause}
            title="Pause timer"
          >
            <PauseIcon className="size-3.5" />
          </Button>
        ) : (
          <Button
            size="icon"
            variant="ghost"
            className="size-7 rounded-full text-foreground hover:bg-muted"
            onClick={start}
            title="Start timer"
          >
            <PlayIcon className="size-3.5 fill-current" />
          </Button>
        )}

        <Button
          size="icon"
          variant="ghost"
          className="size-7 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={() => focus.skip()}
          title="Skip phase"
        >
          <SkipForwardIcon className="size-3.5" />
        </Button>

        <Button
          size="icon"
          variant="ghost"
          className={cn(
            'size-7 rounded-full transition-colors',
            soundscape.playing
              ? 'bg-primary/10 text-primary hover:bg-primary/20'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
          onClick={() => void soundscape.toggle()}
          title={soundscape.playing ? 'Mute soundscape' : 'Enable soundscape'}
        >
          <WavesIcon
            className={cn('size-3.5', soundscape.playing && 'animate-pulse')}
          />
        </Button>
      </div>

      <div className="h-6 w-px bg-border/60" />

      <Button
        size="sm"
        disabled={completing}
        className="h-7 gap-1.5 rounded-full bg-emerald-600 px-3 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500 active:scale-95"
        onClick={() => void complete()}
      >
        <CheckIcon className="size-3.5 stroke-[2.5]" />
        <span>Complete</span>
        <Badge
          variant="secondary"
          className="h-4 border-0 bg-emerald-700/60 px-1 text-[9px] font-bold text-emerald-100"
        >
          +{xpReward} XP
        </Badge>
      </Button>

      <div className="flex items-center gap-0.5">
        <Button
          size="icon"
          variant="ghost"
          className="size-6 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={onExpand}
          title="Maximize focus mode"
        >
          <Maximize2Icon className="size-3" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-6 rounded-full text-muted-foreground hover:bg-muted hover:text-destructive"
          onClick={focus.clearFocus}
          title="End session"
        >
          <XIcon className="size-3" />
        </Button>
      </div>
    </motion.div>
  );
}
