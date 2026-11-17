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
  /** Compact mode for narrow/modal contexts */
  compact?: boolean;
}

export function PlanPanel({
  plan,
  isRunning = false,
  className,
  defaultCollapsed = false,
  title = 'Agent Plan',
  compact = false,
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
        'group relative overflow-hidden rounded-xl border transition-all duration-200',
        compact
          ? 'border-border/50 bg-card/60 shadow-sm'
          : 'border-border/70 bg-card/85 shadow-xs',
        isRunning && !compact && 'ring-1 ring-primary/20',
        className,
      )}
      aria-label="Agent execution plan"
    >
      {/* Subtle top ambient gradient line when running */}
      {isRunning && (
        <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-primary/50 to-transparent animate-pulse" />
      )}

      {/* Header bar */}
      <div className={cn(
        'flex items-center justify-between gap-3 transition-colors',
        compact ? 'px-3 py-2 sm:px-3' : 'px-3.5 py-2.5 sm:px-4'
      )}>
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={cn(
              'flex shrink-0 items-center justify-center rounded-lg border transition-colors',
              compact ? 'size-6' : 'size-7',
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
              <SparklesIcon className={cn('animate-pulse', compact ? 'size-3.5' : 'size-4')} />
            ) : (
              <ListTodoIcon className={cn(compact ? 'size-3.5' : 'size-4')} />
            )}
          </div>

          <div className="flex items-center gap-2 min-w-0">
            <span className={cn(
              'font-semibold tracking-tight text-foreground truncate',
              compact ? 'text-[11px]' : 'text-xs'
            )}>
              {title}
            </span>

            {plan.version > 1 && (
              <Badge
                variant="outline"
                className={cn(
                  'font-medium border-primary/30 text-primary bg-primary/5',
                  compact ? 'px-1 py-0 text-[9px]' : 'px-1.5 py-0 text-[10px]'
                )}
              >
                v{plan.version}
              </Badge>
            )}

            <span className={cn(
              'text-muted-foreground',
              compact ? 'text-[10px]' : 'text-[11px]'
            )}>
              {stats.done}/{stats.total}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Status pill */}
          {isRunning ? (
            <Badge
              variant="secondary"
              className={cn(
                'gap-1.5 font-medium border-transparent bg-primary/10 text-primary',
                compact ? 'px-1.5 py-0 text-[10px]' : 'gap-1.5 px-2 py-0.5 text-[11px]'
              )}
            >
              <Loader2Icon className={cn('animate-spin', compact ? 'size-2.5' : 'size-3')} />
              <span>{compact ? 'Run' : 'Executing'}</span>
            </Badge>
          ) : stats.allFinished ? (
            <Badge
              variant="secondary"
              className={cn(
                'gap-1 font-medium border-transparent bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                compact ? 'px-1.5 py-0 text-[10px]' : 'px-2 py-0.5 text-[11px]'
              )}
            >
              <CheckCircle2Icon className={cn(compact ? 'size-2.5' : 'size-3')} />
              <span>{compact ? 'Done' : 'Completed'}</span>
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className={cn(
                'font-normal text-muted-foreground border-border/60',
                compact ? 'px-1.5 py-0 text-[10px]' : 'px-2 py-0.5 text-[11px]'
              )}
            >
              {compact ? 'Wait' : 'Paused'}
            </Badge>
          )}

          {/* Collapse / Expand Button */}
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className={cn(
              'flex items-center justify-center rounded-md text-muted-foreground/80 hover:bg-muted/60 hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
              compact ? 'size-5' : 'size-6'
            )}
            aria-label={collapsed ? 'Expand plan' : 'Collapse plan'}
          >
            {collapsed ? (
              <ChevronDownIcon className={cn(compact ? 'size-3' : 'size-3.5')} />
            ) : (
              <ChevronUpIcon className={cn(compact ? 'size-3' : 'size-3.5')} />
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
        <div className={cn(
          'divide-y divide-border/40',
          compact ? 'divide-border/20 px-0.5 py-0.5 sm:px-1' : 'px-1 py-1 sm:px-2'
        )}>
          {plan.items.map((item, index) => (
            <PlanItemRow key={item.id} item={item} index={index} compact={compact} />
          ))}
        </div>
      )}
    </div>
  );
}

interface PlanItemRowProps {
  item: PlanItem;
  index: number;
  compact?: boolean;
}

function PlanItemRow({ item, index, compact = false }: PlanItemRowProps) {
  const isInProgress = item.status === 'in-progress';
  const isDone = item.status === 'done';
  const isFailed = item.status === 'failed';
  const isPending = item.status === 'pending';

  return (
    <div
      className={cn(
        'group/item flex items-center gap-2.5 rounded-lg transition-colors',
        compact ? 'gap-1.5 px-1.5 py-1' : 'gap-2.5 px-2.5 py-1.5',
        isInProgress && 'bg-primary/5 text-foreground',
        isDone && 'text-muted-foreground/90',
        isPending && 'text-muted-foreground/75',
        isFailed && 'bg-destructive/5 text-destructive',
      )}
    >
      {/* Status icon */}
      <div className="shrink-0 flex items-center justify-center">
        {isDone && <CheckCircle2Icon className={cn('text-emerald-500', compact ? 'size-3' : 'size-3.5')} />}
        {isInProgress && (
          <Loader2Icon className={cn('text-primary animate-spin', compact ? 'size-3' : 'size-3.5')} />
        )}
        {isFailed && <XCircleIcon className={cn('text-destructive', compact ? 'size-3' : 'size-3.5')} />}
        {isPending && (
          <CircleDashedIcon className={cn('text-muted-foreground/40', compact ? 'size-3' : 'size-3.5')} />
        )}
      </div>

      {/* Step index badge */}
      <span
        className={cn(
          'font-mono shrink-0 rounded transition-colors',
          compact ? 'text-[9px] px-0.5 py-0' : 'text-[10px] px-1 py-0.5',
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
          'min-w-0 flex-1 leading-snug truncate transition-all',
          compact ? 'text-[10px]' : 'text-xs',
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
          'shrink-0 font-medium capitalize transition-colors',
          compact ? 'text-[9px]' : 'text-[10px]',
          isDone && 'text-emerald-500/80',
          isInProgress && 'text-primary font-semibold',
          isPending && 'text-muted-foreground/40',
          isFailed && 'text-destructive',
        )}
      >
        {item.status === 'in-progress'
          ? compact ? 'work' : 'working'
          : item.status === 'done'
            ? 'done'
            : item.status === 'failed'
              ? 'fail'
              : 'pending'}
      </span>
    </div>
  );
}
