/**
 * components/tasks/SingleTaskLens.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Anti-overwhelm Single-Task Focus Lens for ADHD minds.
 *
 * Replaces the multi-column Kanban board with a zero-distraction focus view
 * presenting ONLY the current active task, its next 2-minute step, and
 * a direct path into Flow mode.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BrainIcon,
  CheckIcon,
  ClockIcon,
  FocusIcon,
  LayersIcon,
  ListTodoIcon,
  SparklesIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { XP_REWARDS } from '@/lib/gamification';
import type { StepProgress, Task } from '@/main/ipc/channels';

export interface SingleTaskLensProps {
  tasks: Task[];
  stepProgress: Record<string, StepProgress>;
  onFocus: (task: Task) => void;
  onOpenSteps: (task: Task) => void;
  onComplete: (task: Task, event: React.MouseEvent) => void;
  onExit: () => void;
}

export function SingleTaskLens({
  tasks,
  stepProgress,
  onFocus,
  onOpenSteps,
  onComplete,
  onExit,
}: SingleTaskLensProps) {
  // Sort tasks by status (active first) and priority (1 > 2 > 3)
  const openTasks = tasks
    .filter((t) => t.status !== 'done')
    .sort((a, b) => {
      if (a.status === 'active' && b.status !== 'active') return -1;
      if (b.status === 'active' && a.status !== 'active') return 1;
      return a.priority - b.priority;
    });

  const [currentIndex, setCurrentIndex] = useState(0);

  const task = openTasks[currentIndex] ?? null;
  const progress = task ? stepProgress[task.id] : undefined;

  const handleNext = () => {
    if (currentIndex < openTasks.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    }
  };

  if (!task) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="rounded-full bg-emerald-500/10 p-4">
          <CheckIcon className="size-8 text-emerald-400" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-foreground">
            Clear Horizon!
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            No open tasks left on your board. You’ve achieved full flow.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onExit} className="gap-2">
          <LayersIcon className="size-4" />
          Return to Board
        </Button>
      </div>
    );
  }

  const priorityLabel =
    task.priority === 1 ? 'High' : task.priority === 2 ? 'Medium' : 'Low';
  const priorityColor =
    task.priority === 1
      ? 'text-rose-400 border-rose-500/30 bg-rose-500/10'
      : task.priority === 2
        ? 'text-amber-400 border-amber-500/30 bg-amber-500/10'
        : 'text-zinc-400 border-zinc-500/30 bg-zinc-500/10';

  return (
    <div className="relative flex h-full flex-col items-center justify-center p-6">
      {/* Top Controls */}
      <div className="absolute top-4 right-4 left-4 flex items-center justify-between">
        <Badge
          variant="secondary"
          className="gap-1.5 border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs text-primary"
        >
          <BrainIcon className="size-3.5" />
          Single-Task Lens
        </Badge>

        <div className="flex items-center gap-2">
          <span className="text-xs tabular-nums text-muted-foreground">
            {currentIndex + 1} of {openTasks.length}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={onExit}
            className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <LayersIcon className="size-3.5" />
            Show All
          </Button>
        </div>
      </div>

      {/* Main Single Task Card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={task.id}
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.98 }}
          transition={{ duration: 0.2 }}
          className="flex w-full max-w-xl flex-col gap-6 rounded-2xl border border-border/80 bg-card p-8 shadow-xl"
        >
          {/* Header row with badges */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                  priorityColor,
                )}
              >
                {priorityLabel} Priority
              </span>
              {task.estimate_mins && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <ClockIcon className="size-3.5" />
                  {task.estimate_mins} mins
                </span>
              )}
            </div>

            {progress && progress.total > 0 && (
              <Badge
                variant="outline"
                className="gap-1 text-xs text-muted-foreground"
              >
                <ListTodoIcon className="size-3" />
                {progress.done}/{progress.total} steps done
              </Badge>
            )}
          </div>

          {/* Task Title & Description */}
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-card-foreground">
              {task.title}
            </h2>
            {task.description && (
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {task.description}
              </p>
            )}
          </div>

          {/* Action Row */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button
              size="lg"
              className="flex-1 gap-2 bg-amber-500 font-semibold text-zinc-950 hover:bg-amber-400"
              onClick={() => onFocus(task)}
            >
              <FocusIcon className="size-4 stroke-[2.5]" />
              Enter Flow State
            </Button>

            <Button
              size="lg"
              variant="outline"
              className="gap-2 border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-400"
              onClick={(e) => onComplete(task, e)}
            >
              <CheckIcon className="size-4 stroke-[2.5]" />
              Mark Done (+
              {task.priority === 1
                ? XP_REWARDS.TASK_HIGH
                : task.priority === 2
                  ? XP_REWARDS.TASK_MED
                  : XP_REWARDS.TASK_LOW}{' '}
              XP)
            </Button>

            <Button
              size="lg"
              variant="secondary"
              className="gap-2"
              onClick={() => onOpenSteps(task)}
            >
              <SparklesIcon className="size-4 text-amber-500" />
              Sub-Steps
            </Button>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Pagination arrows */}
      <div className="mt-6 flex items-center gap-3">
        <Button
          size="sm"
          variant="ghost"
          disabled={currentIndex === 0}
          onClick={handlePrev}
          className="gap-1 text-xs text-muted-foreground"
        >
          <ArrowLeftIcon className="size-3.5" />
          Previous
        </Button>
        <span className="text-xs text-muted-foreground/60">·</span>
        <Button
          size="sm"
          variant="ghost"
          disabled={currentIndex >= openTasks.length - 1}
          onClick={handleNext}
          className="gap-1 text-xs text-muted-foreground"
        >
          Next Task
          <ArrowRightIcon className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
