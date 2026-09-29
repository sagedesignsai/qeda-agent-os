/**
 * components/tasks/ActiveLaunchpad.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Interactive Next Best Move launcher that occupies the empty Active column.
 *
 * Eliminates the cold-start paralysis of an empty in-progress list by
 * spotlighting the highest-leverage task, reducing activation energy with a
 * 1-click flow launcher and optional AI breakdown escape hatch.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ClockIcon,
  FlameIcon,
  RefreshCwIcon,
  SparklesIcon,
  ZapIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { XP_REWARDS } from '@/lib/gamification';
import type { TaskRecommendation } from '@/lib/task-recommendations';
import type { Task } from '@/main/ipc/channels';

export interface ActiveLaunchpadProps {
  recommendation: TaskRecommendation;
  onStartFlow: (task: Task, event: React.MouseEvent) => void;
  onOpenSteps: (task: Task) => void;
  onShuffle: () => void;
  className?: string;
}

export function ActiveLaunchpad({
  recommendation,
  onStartFlow,
  onOpenSteps,
  onShuffle,
  className,
}: ActiveLaunchpadProps) {
  const { task, rationale, totalCandidates } = recommendation;
  const [shuffling, setShuffling] = useState(false);

  if (!task) return null;

  const xpReward =
    task.priority === 1
      ? XP_REWARDS.TASK_HIGH
      : task.priority === 2
        ? XP_REWARDS.TASK_MED
        : XP_REWARDS.TASK_LOW;

  const handleShuffleClick = () => {
    setShuffling(true);
    onShuffle();
    setTimeout(() => setShuffling(false), 200);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className={cn(
        'relative flex flex-col gap-3 rounded-xl border border-amber-500/40 bg-gradient-to-b from-amber-500/10 via-card/90 to-card p-4 shadow-md backdrop-blur-sm',
        className,
      )}
    >
      {/* Top Header Tag */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-500">
          <ZapIcon className="size-3.5 fill-amber-500" />
          <span>Recommended Next Move</span>
        </div>
        <Badge
          variant="secondary"
          className="border-0 bg-amber-500/20 px-1.5 text-[10px] font-bold text-amber-400"
        >
          +{xpReward} XP
        </Badge>
      </div>

      {/* Task Headline & Metadata */}
      <AnimatePresence mode="wait">
        <motion.div
          key={task.id}
          initial={{ opacity: 0, x: 6 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -6 }}
          transition={{ duration: 0.15 }}
          className="space-y-1.5"
        >
          <h4 className="text-sm font-semibold leading-snug text-card-foreground">
            {task.title}
          </h4>

          {/* Rationale Pill */}
          <p className="flex items-center gap-1 text-[11px] leading-tight text-amber-400/90">
            <FlameIcon className="size-3 shrink-0" />
            <span>{rationale}</span>
          </p>

          <div className="flex items-center gap-2 pt-0.5 text-[10px] text-muted-foreground">
            <span
              className={cn(
                'font-medium',
                task.priority === 1
                  ? 'text-rose-400'
                  : task.priority === 2
                    ? 'text-amber-400'
                    : 'text-zinc-400',
              )}
            >
              P{task.priority}{' '}
              {task.priority === 1
                ? 'High'
                : task.priority === 2
                  ? 'Med'
                  : 'Low'}
            </span>
            {task.estimate_mins && (
              <span className="flex items-center gap-0.5">
                <ClockIcon className="size-2.5" />
                {task.estimate_mins}m
              </span>
            )}
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Action Row */}
      <div className="flex items-center gap-2 pt-1">
        <Button
          size="sm"
          className="flex-1 gap-1.5 bg-amber-500 text-xs font-semibold text-zinc-950 shadow-sm hover:bg-amber-400 active:scale-95"
          onClick={(e) => onStartFlow(task, e)}
        >
          <ZapIcon className="size-3.5 fill-current" />
          Start Flow
        </Button>

        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => onOpenSteps(task)}
          title="Break down into small steps first"
        >
          <SparklesIcon className="size-3 text-amber-500" />
          Break down
        </Button>
      </div>

      {/* Footer: Shuffle candidate */}
      {totalCandidates > 1 && (
        <div className="flex items-center justify-between border-t border-border/40 pt-2 text-[10px] text-muted-foreground">
          <span>Or drag any card from Backlog</span>
          <button
            type="button"
            onClick={handleShuffleClick}
            className="flex items-center gap-1 font-medium text-amber-500/80 transition-colors hover:text-amber-400"
          >
            <RefreshCwIcon
              className={cn('size-2.5', shuffling && 'animate-spin')}
            />
            Suggest another
          </button>
        </div>
      )}
    </motion.div>
  );
}
