/**
 * components/plan/PlanPanel.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Beautiful, animated plan execution tracker for Qeda agents.
 *
 * Shows the agent's committed tasks in real time:
 *   • Pending     (○ dashed circle)
 *   • In-progress (⏳ animated pulse/spinner)
 *   • Done        (✅ emerald checkmark)
 *   • Failed      (❌ red alert)
 *
 * Includes an interactive progress bar, collapsible view, re-plan indicators,
 * and seamless glassmorphic styling matching Qeda's design tokens.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useMemo } from 'react';
import {
  CheckCircle2Icon,
  CircleDashedIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ListTodoIcon,
  Loader2Icon,
  XCircleIcon,
  SparklesIcon,
} from 'lucide-react';
import type { AgentPlan, PlanItem } from '@/lib/agent-plan';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

export interface PlanPanelProps {
  plan: AgentPlan | null;
  isRunning?: boolean;
  className?: string;
  defaultCollapsed?: boolean;
  title?: string;
}

export function PlanPanel({
  plan,
  isRunning = false,
  className,
  defaultCollapsed = false,
  title = 'Agent Plan',
}: PlanPanelProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const stats = useMemo(() => {
    if (!plan || plan.items.length === 0) {
      return {
        total: 0,
        done: 0,
        inProgress: 0,
        failed: 0,
        percent: 0,
        allFinished: false,
      };
    }
    const total = plan.items.length;
    const done = plan.items.filter((i) => i.status === 'done').length;
    const inProgress = plan.items.filter(
      (i) => i.status === 'in-progress',
    ).length;
    const failed = plan.items.filter((i) => i.status === 'failed').length;
    const percent = Math.round(((done + failed) / total) * 100);
    const allFinished = done + failed === total;

    return { total, done, inProgress, failed, percent, allFinished };
  }, [plan]);

  if (!plan || plan.items.length === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-xl border border-border/70 bg-card/85 backdrop-blur-md shadow-xs transition-all duration-200',
        isRunning && 'ring-1 ring-primary/20',
        className,
      )}
      aria-label="Agent execution plan"
    >
      {/* Subtle top ambient gradient line when running */}
      {isRunning && (
        <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-primary/50 to-transparent animate-pulse" />
      )}

      {/* Header bar */}
      <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 sm:px-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={cn(
              'flex size-7 shrink-0 items-center justify-center rounded-lg border transition-colors',
              stats.allFinished
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500'
                : isRunning
                  ? 'border-primary/30 bg-primary/10 text-primary'
                  : 'border-border/60 bg-muted/50 text-muted-foreground',
            )}
          >
            {stats.allFinished ? (
              <CheckCircle2Icon className="size-4" />
            ) : isRunning ? (
              <SparklesIcon className="size-4 animate-pulse" />
            ) : (
              <ListTodoIcon className="size-4" />
            )}
          </div>

          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-semibold tracking-tight text-foreground truncate">
              {title}
            </span>

            {plan.version > 1 && (
              <Badge
                variant="outline"
                className="px-1.5 py-0 text-[10px] font-medium border-primary/30 text-primary bg-primary/5"
              >
                v{plan.version}
              </Badge>
            )}

            <span className="text-[11px] text-muted-foreground">
              {stats.done}/{stats.total} completed
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Status pill */}
          {isRunning ? (
            <Badge
              variant="secondary"
              className="gap-1.5 px-2 py-0.5 text-[11px] font-medium bg-primary/10 text-primary border-transparent"
            >
              <Loader2Icon className="size-3 animate-spin" />
              <span>Executing</span>
            </Badge>
          ) : stats.allFinished ? (
            <Badge
              variant="secondary"
              className="gap-1 px-2 py-0.5 text-[11px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-transparent"
            >
              <CheckCircle2Icon className="size-3" />
              <span>Completed</span>
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="px-2 py-0.5 text-[11px] font-normal text-muted-foreground border-border/60"
            >
              Paused
            </Badge>
          )}

          {/* Collapse / Expand Button */}
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="flex size-6 items-center justify-center rounded-md text-muted-foreground/80 hover:bg-muted/60 hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            aria-label={collapsed ? 'Expand plan' : 'Collapse plan'}
          >
            {collapsed ? (
              <ChevronDownIcon className="size-3.5" />
            ) : (
              <ChevronUpIcon className="size-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Progress Track */}
      <div className="h-1 w-full bg-muted/40 overflow-hidden">
        <div
          className={cn(
            'h-full transition-all duration-500 ease-out',
            stats.allFinished
              ? 'bg-emerald-500'
              : stats.failed > 0
                ? 'bg-amber-500'
                : 'bg-primary',
          )}
          style={{ width: `${stats.percent}%` }}
        />
      </div>

      {/* Items List */}
      {!collapsed && (
        <div className="divide-y divide-border/40 px-1 py-1 sm:px-2">
          {plan.items.map((item, index) => (
            <PlanItemRow key={item.id} item={item} index={index} />
          ))}
        </div>
      )}
    </div>
  );
}

interface PlanItemRowProps {
  item: PlanItem;
  index: number;
}

function PlanItemRow({ item, index }: PlanItemRowProps) {
  const isInProgress = item.status === 'in-progress';
  const isDone = item.status === 'done';
  const isFailed = item.status === 'failed';
  const isPending = item.status === 'pending';

  return (
    <div
      className={cn(
        'group/item flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 transition-colors',
        isInProgress && 'bg-primary/5 text-foreground',
        isDone && 'text-muted-foreground/90',
        isPending && 'text-muted-foreground/75',
        isFailed && 'bg-destructive/5 text-destructive',
      )}
    >
      {/* Status icon */}
      <div className="shrink-0 flex items-center justify-center">
        {isDone && <CheckCircle2Icon className="size-3.5 text-emerald-500" />}
        {isInProgress && (
          <Loader2Icon className="size-3.5 text-primary animate-spin" />
        )}
        {isFailed && <XCircleIcon className="size-3.5 text-destructive" />}
        {isPending && (
          <CircleDashedIcon className="size-3.5 text-muted-foreground/40" />
        )}
      </div>

      {/* Step index badge */}
      <span
        className={cn(
          'text-[10px] font-mono shrink-0 px-1 py-0.5 rounded transition-colors',
          isInProgress
            ? 'bg-primary/15 text-primary font-semibold'
            : isDone
              ? 'bg-muted/60 text-muted-foreground/60'
              : 'text-muted-foreground/40',
        )}
      >
        {index + 1}
      </span>

      {/* Description */}
      <span
        className={cn(
          'min-w-0 flex-1 text-xs leading-snug truncate transition-all',
          isDone && 'line-through text-muted-foreground/60',
          isInProgress && 'font-medium text-foreground',
          isPending && 'text-muted-foreground',
        )}
      >
        {item.title}
      </span>

      {/* Status Pill */}
      <span
        className={cn(
          'shrink-0 text-[10px] font-medium capitalize transition-colors',
          isDone && 'text-emerald-500/80',
          isInProgress && 'text-primary font-semibold',
          isPending && 'text-muted-foreground/40',
          isFailed && 'text-destructive',
        )}
      >
        {item.status === 'in-progress'
          ? 'working'
          : item.status === 'done'
            ? 'done'
            : item.status === 'failed'
              ? 'failed'
              : 'pending'}
      </span>
    </div>
  );
}
