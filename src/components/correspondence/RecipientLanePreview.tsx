/**
 * components/correspondence/RecipientLanePreview.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * A schematic of the one idea this system exists for: a single sent item fanning
 * out into per-recipient clocks that diverge.
 *
 * WHY IT IS HERE, AND WHY IT IS STATIC
 * This is the empty state's job, not decoration. "One letter, seven bodies, each
 * on its own clock" is the whole pitch and it is genuinely hard to picture from a
 * sentence — a CRM shows you a pipeline moving toward a close you control; this
 * shows you parties you are waiting on, and one of them is already late.
 *
 * It renders fixed, illustrative rows and is labelled as a preview so it can never
 * be mistaken for the user's own correspondence. It is deliberately not built on
 * the real state model: at this point there is no state model to read, and a
 * component that looked real but was wired to nothing would be worse than an
 * honest picture.
 *
 * The two things it has to teach, both of which the plan calls out as
 * non-negotiable:
 *   1. Each recipient's state is independent — same message, different clocks.
 *   2. A statutory clock and a tactical one must not look alike. The missed
 *      statutory notice is the only row drawn in a destructive tone.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { AlertTriangleIcon, CheckIcon, ClockIcon, MailIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/** One illustrative recipient. `tone` is the whole point of the schematic. */
interface PreviewLane {
  name: string;
  channel: string;
  /** What is true for this recipient, in the user's words. */
  status: string;
  /** `overdue` = a statutory clock missed; `waiting` = a clock still running. */
  tone: 'overdue' | 'waiting' | 'settled';
}

/**
 * Rows chosen to make the divergence obvious: two bodies past their window, one
 * answered, one still out. Names are generic on purpose — the founding project's
 * real counterparties are private, and inventing plausible ones would imply this
 * is its data.
 */
const PREVIEW_LANES: readonly PreviewLane[] = [
  {
    name: 'Pension fund trustees',
    channel: 'Postal',
    status: 'No reply · 3 days past a statutory window',
    tone: 'overdue',
  },
  {
    name: 'Commission for Conciliation',
    channel: 'Portal referral',
    status: 'No reply · due in 4 days',
    tone: 'waiting',
  },
  {
    name: 'Former employer',
    channel: 'Email',
    status: 'Replied · clock stopped',
    tone: 'settled',
  },
];

const LANE_ICON = {
  overdue: AlertTriangleIcon,
  waiting: ClockIcon,
  settled: CheckIcon,
} as const;

function Lane({ lane }: { lane: PreviewLane }) {
  const Icon = LANE_ICON[lane.tone];
  return (
    <li
      className={cn(
        'flex items-center gap-2.5 rounded-md border px-2.5 py-2 text-left',
        lane.tone === 'overdue'
          ? 'border-destructive/40 bg-destructive/5'
          : 'border-border/60 bg-card/40',
      )}
    >
      <Icon
        className={cn(
          'size-3.5 shrink-0',
          lane.tone === 'overdue'
            ? 'text-destructive'
            : lane.tone === 'settled'
              ? 'text-muted-foreground'
              : 'text-muted-foreground',
        )}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium">{lane.name}</span>
        <span className="block truncate text-[11px] text-muted-foreground">
          {lane.status}
        </span>
      </span>
      <span className="shrink-0 text-[11px] text-muted-foreground">
        {lane.channel}
      </span>
    </li>
  );
}

export function RecipientLanePreview() {
  return (
    <section
      aria-label="Preview of per-recipient tracking"
      className="w-full max-w-md rounded-xl border border-dashed p-3"
    >
      <p className="mb-3 text-[11px] uppercase tracking-wide text-muted-foreground">
        Preview · one letter, many recipients, independent clocks
      </p>

      {/* The sent item, i.e. the thing being tracked. */}
      <div className="flex items-center gap-2.5 rounded-md bg-muted/50 px-2.5 py-2">
        <MailIcon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-xs font-medium">
          Letter of demand
        </span>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          sent · 3 recipients
        </span>
      </div>

      {/* A hairline, so the rows read as branching off the item above. */}
      <div aria-hidden className="mx-auto h-3 w-px bg-border" />

      <ul className="flex flex-col gap-1.5">
        {PREVIEW_LANES.map((lane) => (
          <Lane key={lane.name} lane={lane} />
        ))}
      </ul>
    </section>
  );
}
