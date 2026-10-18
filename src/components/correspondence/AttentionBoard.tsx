/**
 * components/correspondence/AttentionBoard.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The landing screen. Not a list of everything — an answer to "what is waiting on
 * me, and what have I already sent".
 *
 * WHY THIS ORDER, TOP TO BOTTOM
 *   1. **The rail** — the whole situation at a glance, including clocks with plenty
 *      of time left, because an axis you can't see the whole of isn't an axis.
 *   2. **The stall notice** — sent items with no deadline. It is a defect rather
 *      than a deadline, it is the exact shape of a forgotten obligation, and it is
 *      the one thing this system would otherwise let a user hide from themselves.
 *   3. **Needs you** — the ranked attention queue, each row acting in one click.
 *   4. **The sent log** — the record, expandable, including everything already
 *      settled. This is the audit trail a dispute reads, so it is never filtered
 *      down to only what is still live.
 *
 * No kanban, deliberately. A board of cards being dragged between columns says the
 * user's job is moving cards; their actual job here is waiting, watching, and acting
 * on exactly the parties that need it.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from 'react';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  PaperclipIcon,
  SendIcon,
  SquareArrowOutUpRightIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { RecipientWithContact } from '@/main/ipc/channels';
import {
  useAttention,
  useLiveClocks,
  useMessageActions,
  useMessageDetail,
  useMessages,
  useStalledRuns,
} from '@/hooks/use-correspondence';
import { DeadlineRail } from './DeadlineRail';
import { RecipientLane } from './RecipientLane';
import { SequenceTrail } from './SequenceTrail';

export interface AttentionBoardProps {
  projectId: string | null;
  /** Open the composer — the board's only creation affordance. */
  onCompose: () => void;
}

export function AttentionBoard({ projectId, onCompose }: AttentionBoardProps) {
  const { items, loading: attentionLoading } = useAttention(projectId);
  const { clocks } = useLiveClocks(projectId);
  const { messages, loading: messagesLoading } = useMessages(projectId);
  const { stalled: stalledRuns } = useStalledRuns(projectId);
  const actions = useMessageActions();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { detail } = useMessageDetail(expandedId);

  const stalled = items.filter((item) => item.state === 'no-clock');

  /** The verbs, wired once so a lane can be dropped anywhere. */
  const laneActions = (recipient: RecipientWithContact) => ({
    onLogReply: () =>
      void actions.updateRecipient(recipient.id, { replyState: 'replied' }),
    onMarkNoResponse: () =>
      void actions.updateRecipient(recipient.id, { replyState: 'no_response' }),
    onSetDeadline: (dueAt: number | null) =>
      void actions.updateRecipient(recipient.id, { responseDueAt: dueAt }),
    onSetReference: (reference: string) =>
      void actions.updateRecipient(recipient.id, { externalRef: reference }),
    onWithdraw: () =>
      void actions.updateRecipient(recipient.id, {
        dispatchState: 'withdrawn',
        replyState: 'not_expected',
      }),
    onEscalate: () => void actions.escalate([recipient.id]),
  });

  /**
   * Everyone past their date, escalated in one action.
   *
   * The founding case is five bodies that silently went quiet on the same day; asking
   * the user to visit five lanes to create five tasks is how the escalation never
   * happens.
   */
  const quietIds = items
    .filter(
      (item) =>
        item.state === 'overdue' || item.recipient.reply_state === 'no_response',
    )
    .map((item) => item.recipient.id);

  const railClocks = clocks
    .filter((clock) => clock.response_due_at !== null)
    .map((clock) => ({
      id: clock.id,
      label: clock.contact_name,
      deadlineClass: clock.deadline_class,
      dueAt: clock.response_due_at as number,
      state: clock.clock,
    }));

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <DeadlineRail clocks={railClocks} />

        {/* ── Plans waiting on a decision ──────────────────────────────────── */}
        {stalledRuns.length > 0 && (
          <section
            aria-label="Plans waiting on a decision"
            className="rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2"
          >
            <p className="text-[11px] font-medium">
              {stalledRuns.length} plan{stalledRuns.length === 1 ? '' : 's'} waiting on
              you
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              No plan step ever fires on its own, so a step past its date sits here
              until you decide. Open the item in Sent below to continue it.
            </p>
            <ul className="mt-1 flex flex-col gap-0.5">
              {stalledRuns.map(({ run, analysis }) => (
                <li key={run.id} className="text-[11px] text-muted-foreground">
                  {analysis.stalled[0]?.step.title ?? 'A step'} —{' '}
                  {analysis.stalled[0]?.detail ?? ''}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ── Stall notice ─────────────────────────────────────────────────── */}
        {stalled.length > 0 && (
          <section
            aria-label="Sent with no deadline"
            className="rounded-xl border border-dashed px-3 py-2"
          >
            <p className="text-[11px] font-medium">
              {stalled.length} thing{stalled.length === 1 ? '' : 's'} sent with no
              deadline set
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Nothing will remind you about these. Give each one a date below and
              it joins the rail.
            </p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {stalled.map((item) => (
                <li key={item.recipient.id}>
                  <RecipientLane
                    recipient={item.recipient}
                    messageSubject={item.message_subject}
                    {...laneActions(item.recipient)}
                  />
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ── Needs you ────────────────────────────────────────────────────── */}
        <section aria-label="Needs you" className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-xs font-medium">Needs you</h2>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground">
                {items.length === 0
                  ? 'nothing overdue or waiting'
                  : `${items.length} thing${items.length === 1 ? '' : 's'}`}
              </span>
              {quietIds.length > 1 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 gap-1 px-2 text-[11px]"
                  onClick={() => void actions.escalate(quietIds)}
                >
                  <SquareArrowOutUpRightIcon className="size-3" />
                  Chase all {quietIds.length}
                </Button>
              )}
            </div>
          </div>

          {attentionLoading && (
            <p className="py-4 text-[11px] text-muted-foreground">Loading…</p>
          )}

          {!attentionLoading && items.length === 0 && (
            <div className="rounded-xl border border-dashed px-3 py-4">
              <p className="text-[11px] text-muted-foreground">
                {messages.length === 0
                  ? 'Nothing has been sent yet. Compose the first item and the clocks start here.'
                  : 'Every clock is still comfortably ahead. Nothing needs a decision today.'}
              </p>
            </div>
          )}

          <ul className="flex flex-col gap-1.5">
            {items.map((item) => (
              <li key={item.recipient.id} className="flex flex-col gap-1">
                <p className="text-[11px] font-medium">
                  {item.reason}
                  <span className="ml-1.5 font-normal text-muted-foreground">
                    {item.recipient.contact_name}
                    {item.message_subject ? ` · ${item.message_subject}` : ''}
                  </span>
                </p>
                <RecipientLane
                  recipient={item.recipient}
                  {...laneActions(item.recipient)}
                />
              </li>
            ))}
          </ul>
        </section>

        {/* ── Sent log ─────────────────────────────────────────────────────── */}
        <section aria-label="Sent log" className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-xs font-medium">Sent</h2>
            <span className="text-[11px] text-muted-foreground">
              {messages.length} item{messages.length === 1 ? '' : 's'} on record
            </span>
          </div>

          {messagesLoading && (
            <p className="py-4 text-[11px] text-muted-foreground">Loading…</p>
          )}

          {!messagesLoading && messages.length === 0 && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-fit gap-1.5 text-xs"
              onClick={onCompose}
            >
              <SendIcon className="size-3.5" />
              Compose the first item
            </Button>
          )}

          <ul className="flex flex-col gap-1.5">
            {messages.map((message) => {
              const expanded = expandedId === message.id;
              const overdue = message.overdue_count;
              return (
                <li
                  key={message.id}
                  className={cn(
                    'rounded-lg border border-border/60',
                    overdue > 0 && 'border-destructive/30',
                  )}
                >
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-2.5 py-2 text-left"
                    onClick={() => setExpandedId(expanded ? null : message.id)}
                    aria-expanded={expanded}
                  >
                    {expanded ? (
                      <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground" />
                    )}

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium">
                        {message.subject || 'Untitled item'}
                      </span>
                      <span className="block text-[11px] text-muted-foreground">
                        {message.sent_at
                          ? `Sent ${new Date(message.sent_at * 1000).toLocaleDateString()}`
                          : 'Not sent yet'}
                        {' · '}
                        {message.recipient_count} recipient
                        {message.recipient_count === 1 ? '' : 's'}
                      </span>
                    </span>

                    {message.awaiting_count > 0 && (
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        {message.awaiting_count} awaiting
                      </Badge>
                    )}
                    {overdue > 0 && (
                      <Badge
                        variant="destructive"
                        className="shrink-0 text-[10px]"
                      >
                        {overdue} past date
                      </Badge>
                    )}
                  </button>

                  {expanded && (
                    <div className="flex flex-col gap-2 border-t border-border/60 px-2.5 py-2">
                      {detail?.id === message.id && detail.body && (
                        <p className="whitespace-pre-wrap text-[11px] text-muted-foreground">
                          {detail.body}
                        </p>
                      )}

                      {detail?.id === message.id &&
                        detail.attachments.length > 0 && (
                          <ul className="flex flex-wrap gap-1">
                            {detail.attachments.map((attachment) => (
                              <li key={attachment.id}>
                                <Badge
                                  variant="outline"
                                  className="gap-1 text-[10px]"
                                >
                                  <PaperclipIcon className="size-2.5" />
                                  {attachment.label ||
                                    attachment.path ||
                                    attachment.document_id ||
                                    'Attachment'}
                                </Badge>
                              </li>
                            ))}
                          </ul>
                        )}

                      {detail?.id === message.id ? (
                        <div className="flex flex-col gap-1.5">
                          {detail.recipients.map((recipient) => (
                            <RecipientLane
                              key={recipient.id}
                              recipient={recipient}
                              {...laneActions(recipient)}
                            />
                          ))}
                        </div>
                      ) : (
                        <p className="text-[11px] text-muted-foreground">
                          Loading recipients…
                        </p>
                      )}

                      {/* The plan that follows this item up, if any. */}
                      <SequenceTrail
                        messageId={message.id}
                        projectId={projectId}
                        messageSent={Boolean(message.sent_at)}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}
