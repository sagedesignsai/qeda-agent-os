/**
 * components/focus/FloatingFocusBar.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Ambient floating focus bar & mini-player for sustained flow state.
 *
 * Sits anchored at the bottom-center of the screen during an active focus
 * session so the user can navigate between Board, Today, Chat, Terminal, or
 * external apps without losing their countdown, soundscape, or task anchor.
 *
 * Provides 1-click task completion with instant dopamine celebration.
 * ─────────────────────────────────────────────────────────────────────────────
 */

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
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { XP_REWARDS } from '@/lib/gamification';
import type { Task } from '@/main/ipc/channels';
import type { FocusTimerState } from '@/hooks/use-focus-timer';
import type { UseFocusAudioReturn } from '@/hooks/use-focus-audio';

export interface FloatingFocusBarProps {
  task: Task;
  timerState: FocusTimerState;
  progress: number;
  audio: UseFocusAudioReturn;
  onStart: () => void;
  onPause: () => void;
  onSkip: () => void;
  onExpand: () => void;
  onClose: () => void;
  onCompleteTask: (task: Task, event: React.MouseEvent) => void;
}

export function FloatingFocusBar({
  task,
  timerState,
  progress,
  audio,
  onStart,
  onPause,
  onSkip,
  onExpand,
  onClose,
  onCompleteTask,
}: FloatingFocusBarProps) {
  const mins = Math.floor(timerState.secondsLeft / 60)
    .toString()
    .padStart(2, '0');
  const secs = (timerState.secondsLeft % 60).toString().padStart(2, '0');

  const isBreak = timerState.phase === 'break';
  const phaseColor = isBreak ? 'text-emerald-400' : 'text-amber-400';
  const strokeColor = isBreak ? '#34d399' : '#f59e0b';

  const xpReward =
    task.priority === 1
      ? XP_REWARDS.TASK_HIGH
      : task.priority === 2
        ? XP_REWARDS.TASK_MED
        : XP_REWARDS.TASK_LOW;

  // Circular progress SVG calculations
  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - progress * circumference;

  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 24, scale: 0.95 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border border-border/70 bg-card/95 px-4 py-2 shadow-2xl backdrop-blur-xl"
    >
      {/* Timer with circular SVG ring */}
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

      {/* Task info & phase */}
      <div className="flex max-w-[200px] flex-col sm:max-w-[260px]">
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              'size-1.5 rounded-full',
              timerState.running
                ? isBreak
                  ? 'bg-emerald-400 animate-pulse'
                  : 'bg-amber-400 animate-pulse'
                : 'bg-zinc-500',
            )}
          />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {timerState.phase === 'idle'
              ? 'Ready'
              : isBreak
                ? 'Break Time'
                : 'Deep Focus'}
          </span>
        </div>
        <p className="truncate text-xs font-medium text-card-foreground">
          {task.title}
        </p>
      </div>

      <div className="h-6 w-px bg-border/60" />

      {/* Transport Controls */}
      <div className="flex items-center gap-1">
        {timerState.running ? (
          <Button
            size="icon"
            variant="ghost"
            className="size-7 rounded-full text-foreground hover:bg-muted"
            onClick={onPause}
            title="Pause timer"
          >
            <PauseIcon className="size-3.5" />
          </Button>
        ) : (
          <Button
            size="icon"
            variant="ghost"
            className="size-7 rounded-full text-foreground hover:bg-muted"
            onClick={onStart}
            title="Start timer"
          >
            <PlayIcon className="size-3.5 fill-current" />
          </Button>
        )}

        <Button
          size="icon"
          variant="ghost"
          className="size-7 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={onSkip}
          title="Skip phase"
        >
          <SkipForwardIcon className="size-3.5" />
        </Button>

        {/* Soundscape toggle */}
        <Button
          size="icon"
          variant="ghost"
          className={cn(
            'size-7 rounded-full transition-colors',
            audio.playing
              ? 'bg-sky-500/10 text-sky-400 hover:bg-sky-500/20'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
          onClick={() => void audio.toggle()}
          title={audio.playing ? 'Mute soundscape' : 'Enable soundscape'}
        >
          <WavesIcon
            className={cn('size-3.5', audio.playing && 'animate-pulse')}
          />
        </Button>
      </div>

      <div className="h-6 w-px bg-border/60" />

      {/* 1-Click Complete with Dopamine XP incentive */}
      <Button
        size="sm"
        className="h-7 gap-1.5 rounded-full bg-emerald-600 px-3 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500 active:scale-95"
        onClick={(e) => onCompleteTask(task, e)}
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

      {/* Expand & Close */}
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
          onClick={onClose}
          title="End session"
        >
          <XIcon className="size-3" />
        </Button>
      </div>
    </motion.div>
  );
}
