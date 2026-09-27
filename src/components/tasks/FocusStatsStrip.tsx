/**
 * components/tasks/FocusStatsStrip.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * A calm, three-metric progress strip: time focused today, sessions completed,
 * and the current daily streak. Deliberately understated — visible progress
 * without turning focus into a scoreboard contest.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { FlameIcon, SproutIcon, TimerIcon } from 'lucide-react';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { FocusStats } from '@/main/ipc/channels';

/** 90 → "1m", 5400 → "1h 30m". */
export function formatFocusDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 1) return '0m';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

export interface FocusStatsStripProps {
  stats: FocusStats | null;
  loading?: boolean;
  className?: string;
}

export function FocusStatsStrip({
  stats,
  loading = false,
  className,
}: FocusStatsStripProps) {
  if (loading || !stats) {
    return (
      <div className={cn('flex gap-2', className)}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-14 flex-1 rounded-lg" />
        ))}
      </div>
    );
  }

  const items = [
    {
      icon: TimerIcon,
      label: 'Focused today',
      value: formatFocusDuration(stats.todayFocusSec),
      tone: 'text-sky-500',
    },
    {
      icon: SproutIcon,
      label: 'Sessions',
      value: String(stats.todayWorkSessions),
      tone: 'text-emerald-500',
    },
    {
      icon: FlameIcon,
      label: 'Day streak',
      value: `${stats.streakDays}`,
      tone: 'text-amber-500',
    },
  ];

  return (
    <div className={cn('flex gap-2', className)}>
      {items.map(({ icon: Icon, label, value, tone }) => (
        <div
          key={label}
          className="flex flex-1 items-center gap-2.5 rounded-lg border border-border/60 bg-card px-3 py-2"
        >
          <Icon className={cn('size-4 shrink-0', tone)} />
          <div className="min-w-0">
            <p className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">
              {label}
            </p>
            <p className="text-sm font-semibold tabular-nums text-card-foreground">
              {value}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
