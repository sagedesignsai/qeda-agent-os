/**
 * components/correspondence/DeadlineRail.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The time axis the whole system is arranged around: where "now" sits, and which
 * clocks are behind it.
 *
 * WHY THIS IS NOT A LIST OF DATES
 * A date list tells you a deadline exists. It does not tell you that five separate
 * clocks are running in parallel and that two of them already passed — which is the
 * actual situation the system exists to make visible, and the one no CRM shows.
 * So: one horizontal axis, "now" as a vertical rule, a tick per live clock, and a
 * clock that has already passed overshoots *upward into a band above the axis*.
 * A missed deadline is literally outside the calendar, which is a thing you
 * understand in one second and never have to be taught.
 *
 * THE THREE THINGS IT ENCODES
 *   • position  – how far away the date is, on a symmetric range around today
 *   • height    – how late it is; a late tick reaches further above the rule
 *   • weight    – the deadline class. A late statutory clock is drawn in the
 *                 destructive tone; a late tactical one is not, because a missed
 *                 "call them Tuesday" and a blown statutory window must never look
 *                 the same.
 *
 * ACCESSIBILITY: the rail is decorative geometry, so the same information is
 * rendered as a real list for screen readers (and as a compact legend of the
 * nearest clocks for everyone). Nothing is conveyed by position alone.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  DEADLINE_LABELS,
  DEADLINE_DESCRIPTIONS,
  daysBetween,
  type ClockState,
  type DeadlineClass,
} from '@/lib/correspondence';
import { cn } from '@/lib/utils';

/** One live clock, already resolved to a date and a state. */
export interface RailClock {
  id: string;
  label: string;
  deadlineClass: DeadlineClass;
  /** Absolute unix seconds. */
  dueAt: number;
  state: ClockState;
}

export interface DeadlineRailProps {
  clocks: RailClock[];
  /** Half-width of the visible window, in days. */
  spanDays?: number;
  /** Unix seconds to treat as "now". Defaults to the real clock. */
  now?: number;
  className?: string;
}

/**
 * The axis geometry, in pixels. Named because the tick positions are computed from
 * them and a bare `44` in three places is how a rail ends up subtly misaligned.
 */
const CALENDAR_LINE_Y = 44;
const STEM_HEIGHT = 8;

/** How far above the line a late tick reaches, by lateness. */
function tickHeight(lateDays: number): number {
  // Capped so a clock that is months late does not push the band off the screen.
  return Math.min(6 + lateDays * 2, 34);
}

function formatDay(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

export function DeadlineRail({
  clocks,
  spanDays = 30,
  now,
  className,
}: DeadlineRailProps) {
  const nowSeconds = now ?? Math.floor(Date.now() / 1000);
  const span = Math.max(spanDays, 1) * 86_400;

  const positioned = clocks
    .map((clock) => {
      const offsetSeconds = clock.dueAt - nowSeconds;
      // Clamped into the visible window, so an ancient date still shows at the edge
      // rather than disappearing into an off-screen coordinate.
      const ratio = Math.max(-1, Math.min(1, offsetSeconds / span));
      return {
        clock,
        leftPercent: 50 + ratio * 50,
        lateDays: Math.max(daysBetween(nowSeconds, clock.dueAt) * -1, 0),
        offsetDays: daysBetween(nowSeconds, clock.dueAt),
      };
    })
    .sort((a, b) => b.lateDays - a.lateDays);

  const overdue = positioned.filter((entry) => entry.clock.state === 'overdue');

  return (
    <section
      aria-label="Deadline rail"
      className={cn(
        'rounded-xl border border-border/60 bg-card/40 px-3 pb-2 pt-3',
        className,
      )}
    >
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="text-[11px] font-medium">
          {clocks.length === 0
            ? 'No clocks running'
            : `${clocks.length} clock${clocks.length === 1 ? '' : 's'} running`}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {overdue.length === 0
            ? `Nothing past its date · window ±${spanDays} days`
            : `${overdue.length} past its date`}
        </p>
      </div>

      {/* ── The axis ────────────────────────────────────────────────────────────
          Geometry, in pixels: the container is 64px, the calendar line sits at y=44
          and each tick is an 8px stem hanging *below* it. A late clock's stem is
          lengthened by its lateness and drawn from the new top, so it crosses the line
          and reaches up into the band — one element, no special casing. */}
      <div aria-hidden className="relative h-16 select-none">
        {/* The overdue band: everything a tick overshoots into lives above here. */}
        <div className="absolute inset-x-0 top-0 h-8 rounded-md border border-dashed border-destructive/30 bg-destructive/5" />
        <span className="absolute left-1 top-0.5 text-[10px] text-destructive/80">
          past the date
        </span>

        {/* The calendar line. Ticks hang off it and overshoot upward when late. */}
        <div
          className="absolute inset-x-0 h-px bg-border"
          style={{ top: CALENDAR_LINE_Y }}
        />
        <span className="absolute bottom-0 left-0 text-[10px] text-muted-foreground">
          {formatDay(nowSeconds - span)}
        </span>
        <span className="absolute bottom-0 right-0 text-[10px] text-muted-foreground">
          {formatDay(nowSeconds + span)}
        </span>

        {positioned.map(({ clock, leftPercent, lateDays }) => {
          const isOverdue = clock.state === 'overdue';
          const isStatutory = clock.deadlineClass === 'statutory';
          const overshoot = isOverdue ? tickHeight(lateDays) : 0;

          return (
            <span
              key={clock.id}
              className={cn(
                'absolute w-0.5 -translate-x-1/2 rounded-full',
                isOverdue
                  ? isStatutory
                    ? 'bg-destructive'
                    : 'bg-destructive/40'
                  : clock.state === 'due-soon'
                    ? 'bg-foreground/60'
                    : 'bg-muted-foreground/30',
              )}
              style={{
                left: `${leftPercent}%`,
                top: CALENDAR_LINE_Y - overshoot,
                height: STEM_HEIGHT + overshoot,
              }}
              title={`${clock.label} — ${DEADLINE_LABELS[clock.deadlineClass]} · ${
                isOverdue
                  ? `${lateDays} day${lateDays === 1 ? '' : 's'} late`
                  : formatDay(clock.dueAt)
              }`}
            />
          );
        })}

        {/* "Now" is the one element that is always in the same place. */}
        <div className="absolute -top-0 bottom-0 left-1/2 w-px -translate-x-1/2 bg-primary/70" />
        <span className="absolute -bottom-0 left-1/2 -translate-x-1/2 translate-y-0 text-[10px] font-medium text-primary">
          now
        </span>
      </div>

      {/* ── The same information, readable ──────────────────────────────────── */}
      <ul className="mt-2 flex flex-col gap-0.5">
        {positioned.slice(0, 4).map(({ clock, offsetDays }) => (
          <li
            key={clock.id}
            className="flex items-center gap-2 text-[11px] text-muted-foreground"
          >
            <span
              className={cn(
                'size-1.5 shrink-0 rounded-full',
                clock.state === 'overdue'
                  ? clock.deadlineClass === 'statutory'
                    ? 'bg-destructive'
                    : 'bg-destructive/40'
                  : clock.state === 'due-soon'
                    ? 'bg-foreground/60'
                    : 'bg-muted-foreground/40',
              )}
            />
            <span className="truncate">{clock.label}</span>
            <span
              className="ml-auto shrink-0"
              title={DEADLINE_DESCRIPTIONS[clock.deadlineClass]}
            >
              {DEADLINE_LABELS[clock.deadlineClass]} ·{' '}
              {offsetDays < 0
                ? `${Math.abs(offsetDays)}d late`
                : offsetDays === 0
                  ? 'today'
                  : `in ${offsetDays}d`}
            </span>
          </li>
        ))}
        {positioned.length > 4 && (
          <li className="text-[11px] text-muted-foreground">
            and {positioned.length - 4} more on the rail
          </li>
        )}
      </ul>
    </section>
  );
}
