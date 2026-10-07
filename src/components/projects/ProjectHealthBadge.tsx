/**
 * components/projects/ProjectHealthBadge.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The "needs attention" mark on a project card or row.
 *
 * Why a badge and not just the existing overdue count: the card already shows
 * numbers, but a glance across a grid needs a single, consistent *signal*.
 * Health is classified once in `lib/projects.ts`; this file owns only the
 * label/colour mapping.
 *
 * Calm by default: on-track, done, and archived projects render nothing. The
 * badge appears only when something is genuinely wrong (overdue, at risk, or
 * stale), so a healthy grid stays quiet.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { AlertTriangleIcon, ClockIcon, FlameIcon } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ProjectHealthLevel } from '@/lib/projects';

interface HealthMeta {
  label: string;
  hint: string;
  className: string;
  Icon: LucideIcon;
}

const META: Partial<Record<ProjectHealthLevel, HealthMeta>> = {
  overdue: {
    label: 'Overdue',
    hint: 'Has tasks past their due date.',
    className: 'text-rose-400 border-rose-500/40 bg-rose-500/10',
    Icon: FlameIcon,
  },
  'at-risk': {
    label: 'At risk',
    hint: 'Deadline is close and work is still open.',
    className: 'text-amber-400 border-amber-500/40 bg-amber-500/10',
    Icon: AlertTriangleIcon,
  },
  stale: {
    label: 'Stale',
    hint: 'No task or focus activity in over two weeks.',
    className: 'text-zinc-400 border-zinc-500/40 bg-zinc-500/10',
    Icon: ClockIcon,
  },
};

export function projectHealthMeta(
  level: ProjectHealthLevel,
): HealthMeta | null {
  return META[level] ?? null;
}

export interface ProjectHealthBadgeProps {
  level: ProjectHealthLevel;
  className?: string;
  /** Show a lucide icon beside the label (default true). */
  showIcon?: boolean;
}

export function ProjectHealthBadge({
  level,
  className,
  showIcon = true,
}: ProjectHealthBadgeProps) {
  const meta = projectHealthMeta(level);
  if (!meta) return null;

  const { Icon } = meta;
  return (
    <span
      title={meta.hint}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-normal',
        meta.className,
        className,
      )}
    >
      {showIcon && <Icon className="size-2.5" />}
      {meta.label}
    </span>
  );
}
