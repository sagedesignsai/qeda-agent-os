/**
 * components/correspondence/RecipientLane.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * One recipient of one message: how it was sent, where its clock stands, and the
 * four things a person actually does about it.
 *
 * WHY THE VERBS ARE ALWAYS VISIBLE RATHER THAN IN AN OVERFLOW MENU
 * "Log a reply", "no response", "move the date" and "withdraw" are the entire
 * working vocabulary of this system. Hiding them behind a menu in a list of lanes
 * would make the point of the product — acting on exactly the parties that need it
 * — into a scavenger hunt. They are ghost buttons so they recede visually without
 * being unreachable.
 *
 * The clock is never inferred from the UI: `reply_state`, `deadline_class` and
 * `response_due_at` all live in the database and are read back, so the same lane
 * says the same thing in the attention list, in the sent log and after a restart.
 * Recording a reply stamps `replied_at` in main, because a timestamp the user types
 * is not evidence of when something happened.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from 'react';
import {
  AlertTriangleIcon,
  CheckCheckIcon,
  CheckIcon,
  ClockIcon,
  HistoryIcon,
  SendIcon,
  SquareArrowOutUpRightIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  CHANNEL_LABELS,
  DEADLINE_LABELS,
  REPLY_LABELS,
  type ClockState,
} from '@/lib/correspondence';
import type { RecipientWithContact } from '@/main/ipc/channels';
import { useRecipientEvents } from '@/hooks/use-correspondence';

const CLOCK_STYLE: Record<
  ClockState,
  { icon: typeof ClockIcon; className: string; label: string }
> = {
  overdue: {
    icon: AlertTriangleIcon,
    className: 'text-destructive',
    label: 'Past the date',
  },
  'due-soon': {
    icon: ClockIcon,
    className: 'text-foreground',
    label: 'Due soon',
  },
  waiting: {
    icon: ClockIcon,
    className: 'text-muted-foreground',
    label: 'Waiting',
  },
  'no-clock': {
    icon: AlertTriangleIcon,
    className: 'text-muted-foreground',
    label: 'No deadline set',
  },
  settled: {
    icon: CheckIcon,
    className: 'text-muted-foreground',
    label: 'Settled',
  },
};

/**
 * How loud this lane is allowed to be.
 *
 * A late statutory clock gets the destructive treatment and a late tactical one does
 * not — a blown 14-day legal window and a missed "call them Tuesday" must not look
 * alike. The tactical one is still visible (its icon keeps the late tone), because
 * hiding lateness entirely would be the opposite failure.
 */
function toneFor(recipient: RecipientWithContact): 'loud' | 'quiet' | 'done' {
  if (recipient.clock === 'overdue') {
    return recipient.deadline_class === 'statutory' ? 'loud' : 'quiet';
  }
  if (recipient.clock === 'settled') return 'done';
  return 'quiet';
}

export interface RecipientLaneProps {
  recipient: RecipientWithContact;
  /** Present on the board, where the lane stands alone and needs its subject. */
  messageSubject?: string;
  onLogReply: () => void;
  onMarkNoResponse: () => void;
  onSetDeadline: (dueAt: number | null) => void;
  onSetReference: (reference: string) => void;
  onWithdraw: () => void;
  /**
   * Create a chase task for this body. Omitted in contexts where escalation is not
   * being offered, which hides the verb rather than rendering a dead control.
   */
  onEscalate?: () => void;
}

export function RecipientLane({
  recipient,
  messageSubject,
  onLogReply,
  onMarkNoResponse,
  onSetDeadline,
  onSetReference,
  onWithdraw,
  onEscalate,
}: RecipientLaneProps) {
  const [editingDate, setEditingDate] = useState(false);
  const [editingRef, setEditingRef] = useState(false);
  const [reference, setReference] = useState(recipient.external_ref);
  const [showTrail, setShowTrail] = useState(false);

  const style = CLOCK_STYLE[recipient.clock];
  const Icon = style.icon;
  const tone = toneFor(recipient);
  const awaiting =
    recipient.dispatch_state === 'sent' && recipient.reply_state === 'awaiting';

  const dueDateValue = recipient.response_due_at
    ? new Date(recipient.response_due_at * 1000).toISOString().slice(0, 10)
    : '';

  const commitDate = (value: string) => {
    if (!value) {
      onSetDeadline(null);
      setEditingDate(false);
      return;
    }
    // Local midnight of the chosen day: the user picked a date, not an instant,
    // and storing a UTC-shifted one would show up a day early west of Greenwich.
    const parsed = new Date(`${value}T23:59:59`);
    onSetDeadline(Math.floor(parsed.getTime() / 1000));
    setEditingDate(false);
  };

  return (
    <div
      className={cn(
        'flex flex-col gap-1 rounded-md border px-2.5 py-2',
        tone === 'loud'
          ? 'border-destructive/40 bg-destructive/5'
          : tone === 'done'
            ? 'border-border/60 opacity-70'
            : 'border-border/60',
      )}
    >
      <div className="flex items-center gap-2">
        <Icon className={cn('size-3.5 shrink-0', style.className)} />

        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium">
            {recipient.contact_name}
          </span>
          <span className="block truncate text-[11px] text-muted-foreground">
            {messageSubject ? `${messageSubject} · ` : ''}
            {CHANNEL_LABELS[recipient.channel_kind]}
            {recipient.channel_value ? ` · ${recipient.channel_value}` : ''}
          </span>
        </span>

        <Badge
          variant="outline"
          className={cn('shrink-0 text-[10px]', style.className)}
        >
          {recipient.clock === 'settled'
            ? REPLY_LABELS[recipient.reply_state]
            : DEADLINE_LABELS[recipient.deadline_class]}
        </Badge>
      </div>

      {/* Where the clock stands, in a sentence. */}
      <p className="text-[11px] text-muted-foreground">
        {recipient.clock === 'overdue' && recipient.response_due_at
          ? `Window closed ${new Date(recipient.response_due_at * 1000).toLocaleDateString()}`
          : recipient.clock === 'due-soon' && recipient.response_due_at
            ? `Due ${new Date(recipient.response_due_at * 1000).toLocaleDateString()}`
            : recipient.clock === 'no-clock'
              ? 'Sent with no deadline — this is how one gets forgotten'
              : recipient.replied_at
                ? `Answered ${new Date(recipient.replied_at * 1000).toLocaleDateString()}`
                : `${style.label}${recipient.response_due_at ? ` · ${new Date(recipient.response_due_at * 1000).toLocaleDateString()}` : ''}`}
        {recipient.external_ref ? ` · Ref ${recipient.external_ref}` : ''}
      </p>

      {/* ── The verbs ───────────────────────────────────────────────────────── */}
      {editingDate ? (
        <div className="flex items-center gap-1.5">
          <Input
            type="date"
            autoFocus
            defaultValue={dueDateValue}
            aria-label="Deadline"
            className="h-7 w-40 text-xs"
            onChange={(event) => commitDate(event.target.value)}
          />
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-[11px] text-muted-foreground"
            onClick={() => {
              onSetDeadline(null);
              setEditingDate(false);
            }}
          >
            Clear deadline
          </Button>
        </div>
      ) : editingRef ? (
        <div className="flex items-center gap-1.5">
          <Input
            autoFocus
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            placeholder="Reference or case number"
            aria-label="Reference"
            className="h-7 flex-1 text-xs"
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                onSetReference(reference.trim());
                setEditingRef(false);
              }
              if (event.key === 'Escape') setEditingRef(false);
            }}
          />
          <Button
            size="sm"
            className="h-7 text-[11px]"
            onClick={() => {
              onSetReference(reference.trim());
              setEditingRef(false);
            }}
          >
            Save
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-1">
          {awaiting && (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 gap-1 px-1.5 text-[11px]"
                title="Stamps today's date and stops the clock"
                onClick={onLogReply}
              >
                <CheckIcon className="size-3" />
                They replied
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 gap-1 px-1.5 text-[11px] text-muted-foreground"
                title="Records that nothing came back — the deadline stays visible"
                onClick={onMarkNoResponse}
              >
                No response
              </Button>
            </>
          )}

          {recipient.dispatch_state === 'sent' && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-1.5 text-[11px] text-muted-foreground"
              onClick={() => setEditingDate(true)}
            >
              {recipient.response_due_at ? 'Move deadline' : 'Set a deadline'}
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-1.5 text-[11px] text-muted-foreground"
            onClick={() => setEditingRef(true)}
          >
            {recipient.external_ref ? 'Edit reference' : 'Record reference'}
          </Button>

          {recipient.dispatch_state === 'sent' && awaiting && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-1.5 text-[11px] text-muted-foreground"
              title="Keeps the record but stops watching it"
              onClick={onWithdraw}
            >
              <SendIcon className="size-3" />
              Stop watching
            </Button>
          )}

          {/* Escalation is for the ones that went quiet — never for a live clock. */}
          {onEscalate &&
            (recipient.clock === 'overdue' ||
              recipient.reply_state === 'no_response') &&
            (recipient.escalation_task_id ? (
              <Badge
                variant="outline"
                className="h-6 gap-1 text-[11px] text-muted-foreground"
                title="A chase task exists in Tasks for this recipient"
              >
                <CheckCheckIcon className="size-3" />
                Chase task raised
              </Badge>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 gap-1 px-1.5 text-[11px]"
                title="Creates a task in Tasks, due soon, linked back to this recipient"
                onClick={onEscalate}
              >
                <SquareArrowOutUpRightIcon className="size-3" />
                Chase it
              </Button>
            ))}

          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-1.5 text-[11px] text-muted-foreground"
            onClick={() => setShowTrail((previous) => !previous)}
            aria-expanded={showTrail}
          >
            <HistoryIcon className="size-3" />
            {showTrail ? 'Hide history' : 'History'}
          </Button>
        </div>
      )}

      {showTrail && <RecipientTrail recipientId={recipient.id} />}
    </div>
  );
}

/**
 * What actually happened, in order.
 *
 * This is the artefact a dispute needs: not "we wrote to them" but a dated list of
 * the dispatch, each deadline change, the reply (or the recorded silence) and any
 * escalation. Loaded only when opened, because most lanes are never opened.
 */
function RecipientTrail({ recipientId }: { recipientId: string }) {
  const { events, loading } = useRecipientEvents(recipientId);

  if (loading && events.length === 0) {
    return (
      <p className="text-[11px] text-muted-foreground">Loading history…</p>
    );
  }

  if (events.length === 0) {
    return (
      <p className="text-[11px] text-muted-foreground">
        Nothing recorded against this recipient yet.
      </p>
    );
  }

  return (
    <ol className="flex flex-col gap-0.5 border-l border-border/60 pl-2.5">
      {events.map((event) => (
        <li key={event.id} className="text-[11px] text-muted-foreground">
          <span className="tabular-nums">
            {new Date(event.created_at * 1000).toLocaleDateString()}
          </span>{' '}
          <span className="text-foreground/80">{event.kind.replace('_', ' ')}</span>
          {event.detail ? ` — ${event.detail}` : ''}
        </li>
      ))}
    </ol>
  );
}
