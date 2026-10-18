/**
 * db/messages.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Storage for what Correspondence is actually about: a message, the bodies it went
 * to, and the state of each of those.
 *
 * Kept separate from `db/correspondence.ts` (the contact registry) because the two
 * have different lifecycles: a contact outlives every message it appears in, and
 * the registry is edited by hand while this table is written by the dispatch flow.
 * One file each means a reader looking for "how does a letter get sent" never has
 * to read the CRUD for organisations.
 *
 * THE THREE INVARIANTS THIS FILE ENFORCES
 *
 *  1. **A clock is an absolute timestamp.** `response_due_at` is computed once at
 *     dispatch from a chosen window and then never derived again. Nothing here
 *     stores a duration, which is what makes the state meaningful after the app has
 *     been closed for a week — the plan's conservative-executor rule, applied at the
 *     only layer that can enforce it.
 *
 *  2. **Every state change writes an append-only event.** Rows are updated, so the
 *     row alone cannot say when something was answered; `correspondence_events` can,
 *     and it is never rewritten. That log is both the audit trail a dispute needs and
 *     the surface a later tamper-evident hash chain would run over.
 *
 *  3. **Dispatch never sends anything.** It records that the user sent it. There is
 *     no transport in this file and no channel that could add one, so "the app cannot
 *     email your legal correspondence behind your back" is a property of the shape of
 *     the code rather than of a policy setting.
 *
 * All functions are synchronous (better-sqlite3 is sync by design).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { randomUUID } from 'node:crypto';
import { getDb } from './client.js';
import { createTask } from './tasks.js';
import {
  addDays,
  attentionQueue,
  clockStateFor,
  dueFrom,
  type AttentionItem,
  type ClockState,
  type ContactChannelKind,
  type DeadlineClass,
  type DispatchState,
  type ReplyState,
} from '../../lib/correspondence.js';

// ─── Row types ────────────────────────────────────────────────────────────────

export interface Message {
  id: string;
  project_id: string | null;
  subject: string;
  body: string;
  created_at: number;
  updated_at: number;
}

export interface MessageAttachment {
  id: string;
  message_id: string;
  kind: 'document' | 'file';
  document_id: string | null;
  path: string | null;
  label: string;
  created_at: number;
}

export interface MessageRecipient {
  id: string;
  message_id: string;
  contact_id: string;
  channel_id: string | null;
  channel_kind: ContactChannelKind;
  dispatch_state: DispatchState;
  reply_state: ReplyState;
  sent_at: number | null;
  replied_at: number | null;
  response_due_at: number | null;
  deadline_class: DeadlineClass;
  external_ref: string;
  notes: string;
  escalation_task_id: string | null;
  created_at: number;
  updated_at: number;
}

/** A recipient with the things the board needs to name it and read its clock. */
export interface RecipientWithContact extends MessageRecipient {
  contact_name: string;
  contact_role: string;
  channel_value: string | null;
  clock: ClockState;
  /**
   * The owning project, lifted off the message. Carried here so a renderer that
   * reads a flat list of recipients — the rail, the attention list — can apply the
   * project lens without a second round trip per row.
   */
  project_id: string | null;
}

export type CorrespondenceEventKind =
  | 'dispatched'
  | 'replied'
  | 'no_response'
  | 'clock'
  | 'note'
  | 'escalated';

export interface CorrespondenceEvent {
  id: string;
  project_id: string | null;
  recipient_id: string | null;
  message_id: string | null;
  kind: CorrespondenceEventKind;
  detail: string;
  created_at: number;
}

export interface MessageDetail extends Message {
  attachments: MessageAttachment[];
  recipients: RecipientWithContact[];
  events: CorrespondenceEvent[];
}

export interface MessageSummary extends Message {
  recipient_count: number;
  awaiting_count: number;
  overdue_count: number;
  sent_at: number | null;
  next_due_at: number | null;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/** Append one immutable event. The only writer of the log. */
function appendEvent(input: {
  projectId: string | null;
  messageId: string | null;
  recipientId: string | null;
  kind: CorrespondenceEventKind;
  detail?: string;
  createdAt?: number;
}): void {
  getDb()
    .prepare(
      `INSERT INTO correspondence_events
         (id, project_id, recipient_id, message_id, kind, detail, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      randomUUID(),
      input.projectId,
      input.recipientId,
      input.messageId,
      input.kind,
      input.detail ?? '',
      input.createdAt ?? nowSeconds(),
    );
}

function projectIdForMessage(messageId: string): string | null {
  return (
    getDb()
      .prepare<[string], { project_id: string | null }>(
        'SELECT project_id FROM correspondence_messages WHERE id = ?',
      )
      .get(messageId)?.project_id ?? null
  );
}

/** Attach a contact name, channel value and current clock to a raw recipient row. */
function decorateRecipients(
  rows: MessageRecipient[],
  now: number,
): RecipientWithContact[] {
  if (rows.length === 0) return [];
  const db = getDb();
  const contactIds = [...new Set(rows.map((row) => row.contact_id))];
  const placeholders = contactIds.map(() => '?').join(', ');
  const contacts = db
    .prepare<string[], { id: string; name: string; role: string }>(
      `SELECT id, name, role FROM contacts WHERE id IN (${placeholders})`,
    )
    .all(...contactIds);
  const byId = new Map(contacts.map((contact) => [contact.id, contact]));

  const channelIds = rows
    .map((row) => row.channel_id)
    .filter((id): id is string => Boolean(id));
  const channels =
    channelIds.length > 0
      ? db
          .prepare<string[], { id: string; value: string }>(
            `SELECT id, value FROM contact_channels WHERE id IN (${channelIds
              .map(() => '?')
              .join(', ')})`,
          )
          .all(...channelIds)
      : [];
  const channelById = new Map(channels.map((channel) => [channel.id, channel]));

  const messageIds = [...new Set(rows.map((row) => row.message_id))];
  const owners = db
    .prepare<string[], { id: string; project_id: string | null }>(
      `SELECT id, project_id FROM correspondence_messages WHERE id IN (${messageIds
        .map(() => '?')
        .join(', ')})`,
    )
    .all(...messageIds);
  const projectByMessage = new Map(owners.map((owner) => [owner.id, owner.project_id]));

  return rows.map((row) => ({
    ...row,
    contact_name: byId.get(row.contact_id)?.name ?? 'Unknown contact',
    contact_role: byId.get(row.contact_id)?.role ?? '',
    channel_value: row.channel_id
      ? (channelById.get(row.channel_id)?.value ?? null)
      : null,
    clock: clockStateFor(row, now),
    project_id: projectByMessage.get(row.message_id) ?? null,
  }));
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export interface MessageAttachmentInput {
  kind: 'document' | 'file';
  documentId?: string | null;
  path?: string | null;
  label?: string;
}

export interface SaveMessageInput {
  id?: string;
  projectId?: string | null;
  subject?: string;
  body?: string;
  /** When provided, the attachment list is replaced wholesale. */
  attachments?: MessageAttachmentInput[];
}

function writeAttachments(
  messageId: string,
  attachments: MessageAttachmentInput[],
): void {
  const db = getDb();
  db.prepare('DELETE FROM message_attachments WHERE message_id = ?').run(messageId);
  for (const attachment of attachments) {
    db.prepare(
      `INSERT INTO message_attachments (id, message_id, kind, document_id, path, label)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      messageId,
      attachment.kind,
      attachment.documentId ?? null,
      attachment.path ?? null,
      attachment.label ?? '',
    );
  }
}

export function saveMessage(input: SaveMessageInput): MessageDetail {
  const db = getDb();

  if (input.id) {
    const sets: string[] = ['updated_at = unixepoch()'];
    const values: unknown[] = [];
    if (input.subject !== undefined) {
      sets.push('subject = ?');
      values.push(input.subject);
    }
    if (input.body !== undefined) {
      sets.push('body = ?');
      values.push(input.body);
    }
    if (input.projectId !== undefined) {
      sets.push('project_id = ?');
      values.push(input.projectId);
    }
    values.push(input.id);
    db.prepare(`UPDATE correspondence_messages SET ${sets.join(', ')} WHERE id = ?`).run(
      ...values,
    );
    if (input.attachments !== undefined) {
      writeAttachments(input.id, input.attachments);
    }
    return getMessageDetail(input.id)!;
  }

  const id = randomUUID();
  db.prepare(
    `INSERT INTO correspondence_messages (id, project_id, subject, body) VALUES (?, ?, ?, ?)`,
  ).run(
    id,
    input.projectId ?? null,
    input.subject ?? '',
    input.body ?? '',
  );
  if (input.attachments) writeAttachments(id, input.attachments);
  return getMessageDetail(id)!;
}

export function getMessageDetail(
  id: string,
  now = nowSeconds(),
): MessageDetail | null {
  const db = getDb();
  const message = db
    .prepare<[string], Message>('SELECT * FROM correspondence_messages WHERE id = ?')
    .get(id);
  if (!message) return null;

  const attachments = db
    .prepare<[string], MessageAttachment>(
      'SELECT * FROM message_attachments WHERE message_id = ? ORDER BY created_at',
    )
    .all(id);

  const recipients = db
    .prepare<[string], MessageRecipient>(
      `SELECT * FROM message_recipients
        WHERE message_id = ?
        ORDER BY sent_at IS NULL, response_due_at`,
    )
    .all(id);

  const events = db
    .prepare<[string], CorrespondenceEvent>(
      `SELECT * FROM correspondence_events
        WHERE message_id = ?
        ORDER BY created_at DESC, rowid DESC`,
    )
    .all(id);

  return {
    ...message,
    attachments,
    recipients: decorateRecipients(recipients, now),
    events,
  };
}

/**
 * Messages for one scope, each with the counts the list needs.
 *
 * Aggregated in SQL rather than by loading every recipient of every message: the
 * board renders this list on every mutation, and a per-message round trip is the
 * shape that turns a 200-message history into a visible stall.
 */
export function listMessages(
  projectId?: string | null,
  now = nowSeconds(),
): MessageSummary[] {
  const db = getDb();
  const messages = (
    projectId
      ? db
          .prepare<[string], Message>(
            `SELECT * FROM correspondence_messages WHERE project_id = ? ORDER BY updated_at DESC`,
          )
          .all(projectId)
      : db
          .prepare<[], Message>(`SELECT * FROM correspondence_messages ORDER BY updated_at DESC`)
          .all()
  ) as Message[];

  if (messages.length === 0) return [];

  const ids = messages.map((message) => message.id);
  const rows = db
    .prepare<
      (string | number)[],
      {
        message_id: string;
        recipient_count: number;
        awaiting_count: number;
        overdue_count: number;
        sent_at: number | null;
        next_due_at: number | null;
      }
    >(
      `SELECT message_id,
              COUNT(*) AS recipient_count,
              SUM(CASE WHEN reply_state = 'awaiting' AND dispatch_state = 'sent'
                       THEN 1 ELSE 0 END) AS awaiting_count,
              SUM(CASE WHEN reply_state = 'awaiting' AND dispatch_state = 'sent'
                            AND response_due_at IS NOT NULL AND response_due_at < ?
                       THEN 1 ELSE 0 END) AS overdue_count,
              MIN(sent_at) AS sent_at,
              MIN(CASE WHEN reply_state = 'awaiting' AND dispatch_state = 'sent'
                       THEN response_due_at END) AS next_due_at
         FROM message_recipients
        WHERE message_id IN (${ids.map(() => '?').join(', ')})
        GROUP BY message_id`,
    )
    .all(now, ...ids);

  const byMessage = new Map(rows.map((row) => [row.message_id, row]));

  return messages.map((message) => {
    const stats = byMessage.get(message.id);
    return {
      ...message,
      recipient_count: stats?.recipient_count ?? 0,
      awaiting_count: stats?.awaiting_count ?? 0,
      overdue_count: stats?.overdue_count ?? 0,
      sent_at: stats?.sent_at ?? null,
      next_due_at: stats?.next_due_at ?? null,
    };
  });
}

export function deleteMessage(id: string): boolean {
  return getDb().prepare('DELETE FROM correspondence_messages WHERE id = ?').run(id).changes > 0;
}

// ─── Recipients ───────────────────────────────────────────────────────────────

export interface RecipientPick {
  contactId: string;
  channelId: string | null;
  channelKind: ContactChannelKind;
}

/**
 * Reconcile the recipient list of a message against a new set of picks.
 *
 * Only queued recipients can be added or removed. Anything already dispatched is
 * left exactly as it is, because a record of what was sent is not editable — if a
 * user picked the wrong body, the answer is to withdraw that recipient (which is
 * itself a recorded event), not to make the history disappear.
 */
export function setMessageRecipients(
  messageId: string,
  picks: RecipientPick[],
): MessageDetail {
  const db = getDb();

  const tx = db.transaction(() => {
    const queued = db
      .prepare<[string], MessageRecipient>(
        `SELECT * FROM message_recipients
          WHERE message_id = ? AND dispatch_state = 'queued'`,
      )
      .all(messageId);
    const queuedByContact = new Map(queued.map((row) => [row.contact_id, row]));

    const keepIds = new Set<string>();
    for (const pick of picks) {
      const existing = queuedByContact.get(pick.contactId);
      if (existing) {
        // Already queued for this body: update how they will be reached.
        db.prepare(
          `UPDATE message_recipients
              SET channel_id = ?, channel_kind = ?, updated_at = unixepoch()
            WHERE id = ?`,
        ).run(pick.channelId, pick.channelKind, existing.id);
        keepIds.add(existing.id);
        continue;
      }
      const alreadySent = db
        .prepare<[string, string], { id: string }>(
          `SELECT id FROM message_recipients
            WHERE message_id = ? AND contact_id = ? AND dispatch_state <> 'queued'`,
        )
        .get(messageId, pick.contactId);
      if (alreadySent) {
        keepIds.add(alreadySent.id);
        continue;
      }

      db.prepare(
        `INSERT INTO message_recipients
           (id, message_id, contact_id, channel_id, channel_kind)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(
        randomUUID(),
        messageId,
        pick.contactId,
        pick.channelId,
        pick.channelKind,
      );
    }

    for (const row of queued) {
      if (!keepIds.has(row.id)) {
        db.prepare('DELETE FROM message_recipients WHERE id = ?').run(row.id);
      }
    }
  });

  tx();
  return getMessageDetail(messageId)!;
}

export interface DispatchInput {
  messageId: string;
  /** Which recipients are being dispatched. Omitted means all queued ones. */
  recipientIds?: string[];
  /** Defaults to now. Accepted so a user can record yesterday's post. */
  sentAt?: number;
  deadlineClass?: DeadlineClass;
  /** Response window in days. Defaults to the class's suggested window. */
  windowDays?: number;
  /** Explicit due dates per recipient, when the windows differ. */
  dueAtByRecipient?: Record<string, number | null>;
  /** Recipients nothing is expected back from (a filing, not a request). */
  replyNotExpected?: string[];
}

/**
 * Record a dispatch.
 *
 * This is the whole "send" verb, and it deliberately does not send: it stamps when,
 * computes each recipient's absolute deadline, moves them to `sent`, and writes one
 * event per body. Every clock in the system starts here, which is why the window is
 * an explicit argument rather than something inferred from a template.
 */
export function dispatchMessage(input: DispatchInput): MessageDetail {
  const db = getDb();
  const sentAt = input.sentAt ?? nowSeconds();
  const projectId = projectIdForMessage(input.messageId);

  const tx = db.transaction(() => {
    const targets = input.recipientIds
      ? (db
          .prepare<string[], MessageRecipient>(
            `SELECT * FROM message_recipients
              WHERE message_id = ?
                AND id IN (${input.recipientIds.map(() => '?').join(', ')})`,
          )
          .all(input.messageId, ...input.recipientIds) as MessageRecipient[])
      : (db
          .prepare<[string], MessageRecipient>(
            `SELECT * FROM message_recipients
              WHERE message_id = ? AND dispatch_state = 'queued'`,
          )
          .all(input.messageId) as MessageRecipient[]);

    for (const recipient of targets) {
      const deadlineClass = input.deadlineClass ?? recipient.deadline_class;
      const explicit = input.dueAtByRecipient?.[recipient.id];
      const dueAt =
        explicit !== undefined
          ? explicit
          : dueFrom(sentAt, deadlineClass, input.windowDays);
      const notExpected = input.replyNotExpected?.includes(recipient.id) ?? false;

      db.prepare(
        `UPDATE message_recipients
            SET dispatch_state = 'sent',
                reply_state = ?,
                sent_at = ?,
                response_due_at = ?,
                deadline_class = ?,
                updated_at = unixepoch()
          WHERE id = ?`,
      ).run(
        notExpected ? 'not_expected' : 'awaiting',
        sentAt,
        notExpected ? null : dueAt,
        deadlineClass,
        recipient.id,
      );

      // The detail names the consequence, not the intent: a recipient with no
      // window is recorded as having no window, never as "no reply expected".
      const detail = notExpected
        ? `Sent by ${recipient.channel_kind}; send-only, no reply expected`
        : dueAt !== null
          ? `Sent by ${recipient.channel_kind}; ${deadlineClass} window closes ${new Date(
              dueAt * 1000,
            )
              .toISOString()
              .slice(0, 10)}`
          : `Sent by ${recipient.channel_kind}; awaiting a reply with no deadline set`;

      appendEvent({
        projectId,
        messageId: input.messageId,
        recipientId: recipient.id,
        kind: 'dispatched',
        detail,
        createdAt: sentAt,
      });
    }
  });

  tx();
  return getMessageDetail(input.messageId)!;
}

export interface RecipientPatch {
  replyState?: ReplyState;
  dispatchState?: DispatchState;
  externalRef?: string;
  notes?: string;
  responseDueAt?: number | null;
  deadlineClass?: DeadlineClass;
}

/**
 * Update one recipient, and log why.
 *
 * The event kind is derived from what changed rather than passed in, so a reply
 * cannot be recorded without a `replied` event and a deadline cannot move without a
 * `clock` event. That is the property that makes the log usable as evidence later:
 * it is complete by construction, not by discipline.
 */
export function updateRecipient(
  id: string,
  patch: RecipientPatch,
  now = nowSeconds(),
): RecipientWithContact | null {
  const db = getDb();
  const before = db
    .prepare<[string], MessageRecipient>(
      'SELECT * FROM message_recipients WHERE id = ?',
    )
    .get(id);
  if (!before) return null;

  const projectId = projectIdForMessage(before.message_id);
  const sets: string[] = ['updated_at = unixepoch()'];
  const values: unknown[] = [];

  if (patch.dispatchState !== undefined) {
    sets.push('dispatch_state = ?');
    values.push(patch.dispatchState);
  }
  if (patch.externalRef !== undefined) {
    sets.push('external_ref = ?');
    values.push(patch.externalRef);
  }
  if (patch.notes !== undefined) {
    sets.push('notes = ?');
    values.push(patch.notes);
  }
  if (patch.deadlineClass !== undefined) {
    sets.push('deadline_class = ?');
    values.push(patch.deadlineClass);
  }
  if (patch.responseDueAt !== undefined) {
    sets.push('response_due_at = ?');
    values.push(patch.responseDueAt);
  }
  if (patch.replyState !== undefined) {
    sets.push('reply_state = ?');
    values.push(patch.replyState);
    // A reply is stamped when it is recorded; that timestamp is what stops the
    // clock, so it is not the user's to type.
    if (patch.replyState === 'replied') {
      sets.push('replied_at = ?');
      values.push(now);
    }
    if (patch.replyState === 'awaiting') {
      sets.push('replied_at = NULL');
    }
  }

  values.push(id);
  db.prepare(
    `UPDATE message_recipients SET ${sets.join(', ')} WHERE id = ?`,
  ).run(...values);

  if (patch.replyState !== undefined && patch.replyState !== before.reply_state) {
    if (patch.replyState === 'replied') {
      appendEvent({
        projectId,
        messageId: before.message_id,
        recipientId: id,
        kind: 'replied',
        detail: 'Reply received — clock stopped',
        createdAt: now,
      });
    } else if (patch.replyState === 'no_response') {
      appendEvent({
        projectId,
        messageId: before.message_id,
        recipientId: id,
        kind: 'no_response',
        detail: 'Marked as no response',
        createdAt: now,
      });
    } else if (patch.replyState === 'not_expected') {
      appendEvent({
        projectId,
        messageId: before.message_id,
        recipientId: id,
        kind: 'note',
        detail: 'No reply expected',
        createdAt: now,
      });
    }
  }

  if (
    patch.responseDueAt !== undefined &&
    patch.responseDueAt !== before.response_due_at
  ) {
    appendEvent({
      projectId,
      messageId: before.message_id,
      recipientId: id,
      kind: 'clock',
      detail:
        patch.responseDueAt === null
          ? 'Deadline cleared'
          : `Deadline set to ${new Date(patch.responseDueAt * 1000)
              .toISOString()
              .slice(0, 10)}`,
      createdAt: now,
    });
  }

  if (
    patch.externalRef !== undefined &&
    patch.externalRef !== before.external_ref
  ) {
    appendEvent({
      projectId,
      messageId: before.message_id,
      recipientId: id,
      kind: 'note',
      detail: patch.externalRef
        ? `Reference: ${patch.externalRef}`
        : 'Reference cleared',
      createdAt: now,
    });
  }

  const updated = db
    .prepare<[string], MessageRecipient>(
      'SELECT * FROM message_recipients WHERE id = ?',
    )
    .get(id);
  return updated ? decorateRecipients([updated], now)[0] : null;
}

/** Withdraw one recipient: a recorded decision, not a deletion. */
export function withdrawRecipient(id: string, now = nowSeconds()) {
  return updateRecipient(
    id,
    { dispatchState: 'withdrawn', replyState: 'not_expected' },
    now,
  );
}

// ─── Escalation ───────────────────────────────────────────────────────────────

export interface EscalationInput {
  recipientIds: string[];
  /** Days until the chase task is due. Defaults to a week. */
  dueInDays?: number;
}

export interface EscalationResult {
  created: Array<{ recipientId: string; taskId: string; title: string }>;
  /** Already had a chase task — re-running is safe and says so. */
  alreadyEscalated: Array<{ recipientId: string; taskId: string }>;
  /** Nothing to chase: they answered, or no reply was ever expected. */
  skipped: string[];
}

const DEFAULT_ESCALATION_DAYS = 7;

/**
 * Turn "they went quiet" into actual work.
 *
 * The alternative — an attention row the user reads and then re-reads next week —
 * is how a missed statutory window happens. So escalation creates a real task in the
 * existing task manager, linked back through `escalation_task_id`, and the link is
 * why this is safe to call twice: a recipient that already has a chase task is
 * reported as such rather than given a second one.
 *
 * Priority and due date come from the clock, not from the caller: a late statutory
 * window is high priority and due sooner than a tactical nudge, because that
 * difference is the entire reason the deadline class exists.
 */
export function escalateRecipients(
  input: EscalationInput,
  now = nowSeconds(),
): EscalationResult {
  const db = getDb();
  const result: EscalationResult = {
    created: [],
    alreadyEscalated: [],
    skipped: [],
  };
  const dueInDays = input.dueInDays ?? DEFAULT_ESCALATION_DAYS;

  const tx = db.transaction(() => {
    for (const recipientId of input.recipientIds) {
      const recipient = db
        .prepare<[string], MessageRecipient>(
          'SELECT * FROM message_recipients WHERE id = ?',
        )
        .get(recipientId);
      if (!recipient) {
        result.skipped.push(recipientId);
        continue;
      }

      if (recipient.escalation_task_id) {
        result.alreadyEscalated.push({
          recipientId,
          taskId: recipient.escalation_task_id,
        });
        continue;
      }

      if (
        recipient.reply_state === 'replied' ||
        recipient.reply_state === 'not_expected'
      ) {
        result.skipped.push(recipientId);
        continue;
      }

      const contact = db
        .prepare<[string], { name: string }>(
          'SELECT name FROM contacts WHERE id = ?',
        )
        .get(recipient.contact_id);
      const message = db
        .prepare<[string], { subject: string; project_id: string | null }>(
          'SELECT subject, project_id FROM correspondence_messages WHERE id = ?',
        )
        .get(recipient.message_id);

      const late =
        recipient.response_due_at !== null && recipient.response_due_at < now;
      const statutory = recipient.deadline_class === 'statutory';
      const subject = message?.subject || 'your letter';
      const name = contact?.name ?? 'them';

      const title = late
        ? `Chase ${name} — ${statutory ? 'statutory window closed' : 'no reply'} on "${subject}"`
        : `Follow up with ${name} — "${subject}"`;

      const description = [
        // The subject is repeated here, not just in the title, because a chase task is
        // read in a list where titles truncate and the body is the only place that
        // survives intact. "Chase De Beers Group — statutory window…" without the
        // letter it is about is a task nobody can act on a month later.
        `About "${subject}".`,
        `Sent by ${recipient.channel_kind}${recipient.sent_at ? ` on ${new Date(recipient.sent_at * 1000).toISOString().slice(0, 10)}` : ''}.`,
        recipient.response_due_at
          ? `${statutory ? 'Statutory' : recipient.deadline_class} window closed ${new Date(recipient.response_due_at * 1000).toISOString().slice(0, 10)}.`
          : 'No deadline was ever set on this one.',
        recipient.external_ref ? `Reference: ${recipient.external_ref}.` : '',
        'Raised from Correspondence.',
      ]
        .filter(Boolean)
        .join(' ');

      const task = createTask({
        title,
        description,
        // A blown statutory window is urgent; a stale follow-up is not.
        priority: statutory && late ? 1 : 2,
        due_at: addDays(now, statutory && late ? 3 : dueInDays),
        project_id: message?.project_id ?? undefined,
      });

      db.prepare(
        `UPDATE message_recipients
            SET escalation_task_id = ?, updated_at = unixepoch()
          WHERE id = ?`,
      ).run(task.id, recipientId);

      appendEvent({
        projectId: message?.project_id ?? null,
        messageId: recipient.message_id,
        recipientId,
        kind: 'escalated',
        detail: `Chase task created: ${task.title}`,
        createdAt: now,
      });

      result.created.push({ recipientId, taskId: task.id, title: task.title });
    }
  });

  tx();
  return result;
}

// ─── Attention ────────────────────────────────────────────────────────────────

/**
 * An attention row carries its message's identity alongside the ranked recipient, so
 * the board can say what to chase without a second read.
 */
export type AttentionRow = AttentionItem<RecipientWithContact> & {
  message_id: string;
  message_subject: string;
};

/**
 * Everything waiting on the user, most urgent first.
 *
 * Only dispatched recipients are considered — nothing queued has a clock yet, and
 * nothing settled has one that matters. Ranking itself lives in
 * `lib/correspondence.ts` so the board, the rail and any future runner share one
 * definition of urgency.
 */
export function listAttention(
  projectId?: string | null,
  now = nowSeconds(),
): AttentionRow[] {
  const db = getDb();
  const recipients = (
    projectId
      ? db
          .prepare<[string], MessageRecipient>(
            `SELECT r.* FROM message_recipients r
               JOIN correspondence_messages m ON m.id = r.message_id
              WHERE m.project_id = ? AND r.dispatch_state = 'sent'`,
          )
          .all(projectId)
      : db
          .prepare<[], MessageRecipient>(
            `SELECT * FROM message_recipients WHERE dispatch_state = 'sent'`,
          )
          .all()
  ) as MessageRecipient[];

  const decorated = decorateRecipients(recipients, now);
  const messageIds = [...new Set(decorated.map((row) => row.message_id))];
  const messages =
    messageIds.length > 0
      ? db
          .prepare<string[], { id: string; subject: string; project_id: string | null }>(
            `SELECT id, subject, project_id FROM correspondence_messages
              WHERE id IN (${messageIds.map(() => '?').join(', ')})`,
          )
          .all(...messageIds)
      : [];
  const byId = new Map(messages.map((message) => [message.id, message]));

  return attentionQueue(decorated, now).map((item) => ({
    ...item,
    message_id: item.recipient.message_id,
    message_subject: byId.get(item.recipient.message_id)?.subject ?? '',
  }));
}

/**
 * Every clock still running in a scope — the Deadline Rail's read.
 *
 * Deliberately wider than `listAttention`: the rail draws all live deadlines,
 * including the ones with plenty of time left, because the point of an axis is to
 * show the whole situation. Attention is the filtered subset that needs a decision.
 */
export function listLiveClocks(
  projectId?: string | null,
  now = nowSeconds(),
): RecipientWithContact[] {
  const db = getDb();
  const rows = (
    projectId
      ? db
          .prepare<[string], MessageRecipient>(
            `SELECT r.* FROM message_recipients r
               JOIN correspondence_messages m ON m.id = r.message_id
              WHERE m.project_id = ?
                AND r.dispatch_state = 'sent'
                AND r.reply_state = 'awaiting'
                AND r.response_due_at IS NOT NULL`,
          )
          .all(projectId)
      : db
          .prepare<[], MessageRecipient>(
            `SELECT * FROM message_recipients
              WHERE dispatch_state = 'sent'
                AND reply_state = 'awaiting'
                AND response_due_at IS NOT NULL`,
          )
          .all()
  ) as MessageRecipient[];

  return decorateRecipients(rows, now).sort(
    (a, b) => (a.response_due_at ?? 0) - (b.response_due_at ?? 0),
  );
}

/** Totals for the header and the project card. */
export function messageCounts(
  projectId?: string | null,
  now = nowSeconds(),
): {
  messages: number;
  awaiting: number;
  overdue: number;
  nextDueAt: number | null;
} {
  const db = getDb();
  const scope = projectId ? 'WHERE m.project_id = ?' : '';
  const args = projectId ? [projectId] : [];

  const messages = db
    .prepare<unknown[], { n: number }>(
      `SELECT COUNT(*) AS n FROM correspondence_messages m ${scope}`,
    )
    .get(...args)?.n ?? 0;

  const row = db
    .prepare<
      unknown[],
      { awaiting: number; overdue: number; next_due_at: number | null }
    >(
      `SELECT
         SUM(CASE WHEN r.reply_state = 'awaiting' AND r.dispatch_state = 'sent'
                  THEN 1 ELSE 0 END) AS awaiting,
         SUM(CASE WHEN r.reply_state = 'awaiting' AND r.dispatch_state = 'sent'
                       AND r.response_due_at IS NOT NULL AND r.response_due_at < ?
                  THEN 1 ELSE 0 END) AS overdue,
         MIN(CASE WHEN r.reply_state = 'awaiting' AND r.dispatch_state = 'sent'
                  THEN r.response_due_at END) AS next_due_at
       FROM message_recipients r
       JOIN correspondence_messages m ON m.id = r.message_id
       ${scope}`,
    )
    .get(now, ...args) as
    | { awaiting: number; overdue: number; next_due_at: number | null }
    | undefined;

  return {
    messages,
    awaiting: row?.awaiting ?? 0,
    overdue: row?.overdue ?? 0,
    nextDueAt: row?.next_due_at ?? null,
  };
}

/** Recent history for one recipient — the correspondence trail a dispute needs. */
export function listRecipientEvents(
  recipientId: string,
): CorrespondenceEvent[] {
  return getDb()
    .prepare<[string], CorrespondenceEvent>(
      `SELECT * FROM correspondence_events
        WHERE recipient_id = ?
        ORDER BY created_at DESC, rowid DESC`,
    )
    .all(recipientId);
}

/** Recipients whose window passed while the app was closed, for the stall notice. */
export function stalledRecipients(
  projectId?: string | null,
  now = nowSeconds(),
): RecipientWithContact[] {
  const db = getDb();
  const rows = (
    projectId
      ? db
          .prepare<[string, number], MessageRecipient>(
            `SELECT r.* FROM message_recipients r
               JOIN correspondence_messages m ON m.id = r.message_id
              WHERE m.project_id = ?
                AND r.dispatch_state = 'sent'
                AND r.reply_state = 'awaiting'
                AND r.response_due_at IS NOT NULL
                AND r.response_due_at < ?`,
          )
          .all(projectId, now)
      : db
          .prepare<[number], MessageRecipient>(
            `SELECT * FROM message_recipients
              WHERE dispatch_state = 'sent'
                AND reply_state = 'awaiting'
                AND response_due_at IS NOT NULL
                AND response_due_at < ?`,
          )
          .all(now)
  ) as MessageRecipient[];

  return decorateRecipients(rows, now);
}

export interface RecipientTrail {
  recipientId: string;
  contact: string;
  contact_role: string;
  message_id: string;
  message_subject: string;
  channel_kind: ContactChannelKind;
  channel_value: string | null;
  dispatch_state: DispatchState;
  reply_state: ReplyState;
  sent_at: number | null;
  replied_at: number | null;
  due: number | null;
  deadline_class: DeadlineClass;
  external_ref: string;
  notes: string;
  escalation_task_id: string | null;
  events: CorrespondenceEvent[];
}

/** One recipient, their message, channel, state, deadline context, and recent events. */
export function getRecipientTrail(
  recipientId: string,
  now = nowSeconds(),
): RecipientTrail | null {
  const db = getDb();
  const row = db
    .prepare<[string], MessageRecipient>(
      `SELECT * FROM message_recipients WHERE id = ?`,
    )
    .get(recipientId);
  if (!row) return null;

  const decorated = decorateRecipients([row], now)[0];
  const message = db
    .prepare<[string], { subject: string }>(
      `SELECT subject FROM correspondence_messages WHERE id = ?`,
    )
    .get(row.message_id);
  const events = listRecipientEvents(recipientId);

  return {
    recipientId: row.id,
    contact: decorated.contact_name,
    contact_role: decorated.contact_role,
    message_id: row.message_id,
    message_subject: message?.subject ?? '',
    channel_kind: row.channel_kind,
    channel_value: decorated.channel_value,
    dispatch_state: row.dispatch_state,
    reply_state: row.reply_state,
    sent_at: row.sent_at,
    replied_at: row.replied_at,
    due: row.response_due_at,
    deadline_class: row.deadline_class,
    external_ref: row.external_ref,
    notes: row.notes,
    escalation_task_id: row.escalation_task_id,
    events,
  };
}

