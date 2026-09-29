/**
 * components/gamification/HeaderLevelChip.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Minimalist header chip displaying current Level, XP, and Streak Shield status.
 *
 * Clicking opens a sleek popover breakdown of the user's flow rank, next level
 * progress, forgiving streak shields, and XP earning rules.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { FlameIcon, ShieldIcon, SparklesIcon, ZapIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { XP_REWARDS, type GamificationState } from '@/lib/gamification';

interface HeaderLevelChipProps {
  state: GamificationState | null;
  loading?: boolean;
}

export function HeaderLevelChip({ state, loading }: HeaderLevelChipProps) {
  if (loading || !state) {
    return <Skeleton className="h-7 w-28 rounded-md" />;
  }

  const pct = Math.round(state.progress * 100);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 border-border/60 bg-card px-2.5 text-xs transition-colors hover:border-border hover:bg-muted/30"
        >
          <ZapIcon className="size-3.5 fill-amber-500 text-amber-500" />
          <span className="font-semibold text-foreground">
            Lvl {state.currentLevel}
          </span>
          <span className="hidden text-[11px] tabular-nums text-muted-foreground sm:inline">
            {state.xpInLevel}/{state.xpForNextLevel} XP
          </span>

          {state.streakShields > 0 && (
            <span
              className="flex items-center gap-0.5 text-sky-400"
              title={`${state.streakShields} streak shield(s) available`}
            >
              <ShieldIcon className="size-3 fill-sky-400/20" />
              <span className="text-[10px] font-bold">
                {state.streakShields}
              </span>
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-border/60 pb-3">
          <div>
            <div className="flex items-center gap-1.5">
              <ZapIcon className="size-4 fill-amber-500 text-amber-500" />
              <h4 className="text-sm font-semibold">
                Level {state.currentLevel}
              </h4>
              <Badge
                variant="secondary"
                className="text-[10px] uppercase font-bold tracking-wider"
              >
                {state.rankTitle}
              </Badge>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Total XP: {state.currentXp.toLocaleString()}
            </p>
          </div>
          <div className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-500">
            <FlameIcon className="size-3.5" />
            <span>{state.streakDays}d streak</span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-3 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Level Progress</span>
            <span className="font-medium tabular-nums text-foreground">
              {state.xpInLevel} / {state.xpForNextLevel} XP ({pct}%)
            </span>
          </div>
          <Progress value={pct} className="h-2" />
        </div>

        {/* Streak Shield Status */}
        <div className="mt-3 rounded-lg border border-sky-500/30 bg-sky-500/10 p-2.5 text-xs">
          <div className="flex items-center gap-1.5 font-medium text-sky-400">
            <ShieldIcon className="size-3.5 fill-sky-400/20" />
            <span>Streak Shields: {state.streakShields} / 3</span>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            Forgiving grace: Missing a day consumes 1 shield instead of
            resetting your flow streak to zero.
          </p>
        </div>

        {/* XP Earning Guide */}
        <div className="mt-3 space-y-1 border-t border-border/60 pt-2.5 text-[11px] text-muted-foreground">
          <div className="flex items-center justify-between">
            <span>Focused Deep Work</span>
            <span className="font-semibold text-foreground">
              +{XP_REWARDS.FOCUS_MINUTE} XP / min
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>High Priority Task (P1)</span>
            <span className="font-semibold text-amber-400">
              +{XP_REWARDS.TASK_HIGH} XP
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>Sub-step Completed</span>
            <span className="font-semibold text-foreground">
              +{XP_REWARDS.STEP_COMPLETE} XP
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>Pomodoro Finished</span>
            <span className="font-semibold text-emerald-400">
              +{XP_REWARDS.POMODORO_COMPLETE} XP
            </span>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
