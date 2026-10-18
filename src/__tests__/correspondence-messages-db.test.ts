/**
 * __tests__/correspondence-messages-db.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The dispatch path, against a real database.
 *
 * What these tests protect, in order of how much it would hurt to get wrong:
 *
 *   • **A dispatched recipient is never rewritten.** One letter to seven bodies is
 *     the point of the system, and "the record of what was sent" only means
 *     something if editing the message afterwards cannot change it.
 *   • **Recording a reply stops that clock and nobody else's.** Five organisations
 *     answer on five schedules; a single global status is the bug this whole model
 *     exists to avoid.
 *   • **Every state change leaves an event.** The log is the audit trail a dispute
 *     reads, so it has to be complete by construction rather than by discipline.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import Database from 'better-sqlite3';
import { useTestDatabase } from '../main/db/client';
import { applyMigrations } from '../main/db/schema';
import { createProject } from '../main/db/projects';
import { saveChannel, saveContact } from '../main/db/correspondence';
import {
  dispatchMessage,
  listAttention,
  listLiveClocks,
  listMessages,
  listRecipientEvents,
  messageCounts,
  saveMessage,
  setMessageRecipients,
  stalledRecipients,
  updateRecipient,
  withdrawRecipient,
} from '../main/db/messages';
import { SECONDS_PER_DAY, addDays } from '../lib/correspondence';

const NOW = 1_800_000_000;

describe('messages and recipients data layer', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyMigrations(db);
    useTestDatabase(db);
  });

  afterEach(() => {
    useTestDatabase(null as unknown as Database.Database);
    db.close();
  });

  /** A contact with one email channel, which is what the composer would pick. */
  function contactWithEmail(name: string, email: string) {
    const contact = saveContact({ projectId: null, name });
    const channel = saveChannel({
      contactId: contact.id,
      kind: 'email',
      value: email,
    });
    return { contact, channel };
  }

  it('records a dispatch with an absolute clock per recipient', () => {
    const project = createProject({ name: 'Dispute' });
    const a = contactWithEmail('De Beers Group', 'hr@debeers.example');
    const b = contactWithEmail('CCMA', 'info@ccma.example');

    const draft = saveMessage({
      projectId: project.id,
      subject: 'Letter of demand',
    });
    setMessageRecipients(draft.id, [
      { contactId: a.contact.id, channelId: a.channel.id, channelKind: 'email' },
      { contactId: b.contact.id, channelId: b.channel.id, channelKind: 'email' },
    ]);
    dispatchMessage({
      messageId: draft.id,
      sentAt: NOW,
      deadlineClass: 'statutory',
      windowDays: 14,
    });

    const detail = listMessages(project.id)[0];
    expect(detail.recipient_count).toBe(2);
    expect(detail.awaiting_count).toBe(2);
    expect(detail.sent_at).toBe(NOW);

    const recipients = listLiveClocks(project.id, NOW);
    expect(recipients).toHaveLength(2);
    // Stored as a date, not as a duration: this is what survives a restart.
    expect(recipients[0].response_due_at).toBe(addDays(NOW, 14));
    expect(recipients[0].clock).toBe('waiting');
  });

  it('writes one event per recipient at dispatch', () => {
    const person = contactWithEmail('Black Sash', 'help@blacksash.example');
    const message = saveMessage({ projectId: null, subject: 'Query' });
    setMessageRecipients(message.id, [
      { contactId: person.contact.id, channelId: person.channel.id, channelKind: 'email' },
    ]);
    const dispatched = dispatchMessage({
      messageId: message.id,
      sentAt: NOW,
      deadlineClass: 'tactical',
      windowDays: 7,
    });

    const recipientId = dispatched.recipients[0].id;
    const events = listRecipientEvents(recipientId);
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('dispatched');
    expect(events[0].created_at).toBe(NOW);
  });

  it('accepts an explicit date per recipient when the windows differ', () => {
    const a = contactWithEmail('De Beers', 'a@example.org');
    const b = contactWithEmail('CCMA', 'b@example.org');
    const message = saveMessage({ projectId: null, subject: 'Mixed' });
    const withRecipients = setMessageRecipients(message.id, [
      { contactId: a.contact.id, channelId: a.channel.id, channelKind: 'email' },
      { contactId: b.contact.id, channelId: b.channel.id, channelKind: 'email' },
    ]);

    const [first, second] = withRecipients.recipients;
    const dispatched = dispatchMessage({
      messageId: message.id,
      sentAt: NOW,
      dueAtByRecipient: {
        [first.id]: addDays(NOW, 30),
        [second.id]: addDays(NOW, 14),
      },
    });

    const due = dispatched.recipients.map((r) => r.response_due_at).sort();
    expect(due).toEqual([addDays(NOW, 14), addDays(NOW, 30)]);
  });

  it('treats a filing as send-only: no reply expected and no clock', () => {
    const registry = contactWithEmail('SARS', 'service@sars.example');
    const message = saveMessage({ projectId: null, subject: 'IRP5 correction' });
    const withRecipients = setMessageRecipients(message.id, [
      {
        contactId: registry.contact.id,
        channelId: registry.channel.id,
        channelKind: 'email',
      },
    ]);

    const dispatched = dispatchMessage({
      messageId: message.id,
      sentAt: NOW,
      replyNotExpected: [withRecipients.recipients[0].id],
    });

    expect(dispatched.recipients[0].reply_state).toBe('not_expected');
    expect(dispatched.recipients[0].response_due_at).toBeNull();
    expect(listAttention(null, NOW)).toHaveLength(0);
  });

  it('stops one clock without touching the others', () => {
    const a = contactWithEmail('Anglo American', 'trustees@anglo.example');
    const b = contactWithEmail('CCMA', 'info@ccma.example');
    const message = saveMessage({ projectId: null, subject: 'Letter of demand' });
    const withRecipients = setMessageRecipients(message.id, [
      { contactId: a.contact.id, channelId: a.channel.id, channelKind: 'email' },
      { contactId: b.contact.id, channelId: b.channel.id, channelKind: 'email' },
    ]);
    const dispatched = dispatchMessage({
      messageId: message.id,
      sentAt: NOW,
      deadlineClass: 'statutory',
      windowDays: 14,
    });

    const answering = dispatched.recipients[0];
    const silence = dispatched.recipients[1];
    updateRecipient(answering.id, { replyState: 'replied' }, addDays(NOW, 5));

    const after = listLiveClocks(null, addDays(NOW, 5));
    expect(after.map((row) => row.id)).toEqual([silence.id]);

    const events = listRecipientEvents(answering.id);
    expect(events.map((event) => event.kind)).toContain('replied');
    expect(events[0].detail).toContain('clock stopped');

    // The board is not "every open clock" — a letter with nine days of its window
    // left does not need the user. Asked at a point where the surviving clock is due
    // soon, only that one is on the board, which is what makes this an assertion about
    // *one* clock having stopped rather than about the queue being empty.
    const queue = listAttention(null, addDays(NOW, 12));
    expect(queue.map((item) => item.recipient.id)).toEqual([silence.id]);
  });

  it('reports what was sent with no deadline as a defect', () => {
    const person = contactWithEmail('Industrial Aid Society', 'help@ias.example');
    const message = saveMessage({ projectId: null, subject: 'Housing query' });
    const withRecipients = setMessageRecipients(message.id, [
      {
        contactId: person.contact.id,
        channelId: person.channel.id,
        channelKind: 'email',
      },
    ]);
    const recipientId = withRecipients.recipients[0].id;

    // Dispatch with no window at all — the shape a hasty send leaves behind.
    dispatchMessage({
      messageId: message.id,
      sentAt: NOW,
      dueAtByRecipient: { [recipientId]: null },
    });

    expect(stalledRecipients(null, NOW)).toHaveLength(0);
    const queue = listAttention(null, NOW);
    expect(queue[0].state).toBe('no-clock');

    // Giving it a date moves it onto the rail, and the change is recorded.
    updateRecipient(recipientId, { responseDueAt: addDays(NOW, 10) }, NOW);
    expect(listLiveClocks(null, NOW)).toHaveLength(1);
    expect(
      listRecipientEvents(recipientId).map((event) => event.kind),
    ).toContain('clock');
  });

  it('logs a reference without disturbing the clock', () => {
    const person = contactWithEmail('CCMA', 'info@ccma.example');
    const message = saveMessage({ projectId: null, subject: 'Referral' });
    const withRecipients = setMessageRecipients(message.id, [
      {
        contactId: person.contact.id,
        channelId: person.channel.id,
        channelKind: 'email',
      },
    ]);
    const dispatched = dispatchMessage({
      messageId: message.id,
      sentAt: NOW,
      deadlineClass: 'statutory',
      windowDays: 14,
    });

    const updated = updateRecipient(
      dispatched.recipients[0].id,
      { externalRef: 'GAJB 12345' },
      NOW,
    );

    expect(updated?.external_ref).toBe('GAJB 12345');
    expect(updated?.response_due_at).toBe(dispatched.recipients[0].response_due_at);
    expect(
      listRecipientEvents(dispatched.recipients[0].id).map((event) => event.kind),
    ).toContain('note');
  });

  it('marks a no-response without erasing the deadline', () => {
    const person = contactWithEmail('De Beers', 'hr@debeers.example');
    const message = saveMessage({ projectId: null, subject: 'Demand' });
    const withRecipients = setMessageRecipients(message.id, [
      {
        contactId: person.contact.id,
        channelId: person.channel.id,
        channelKind: 'email',
      },
    ]);
    const dispatched = dispatchMessage({
      messageId: message.id,
      sentAt: NOW,
      deadlineClass: 'statutory',
      windowDays: 14,
    });

    const updated = updateRecipient(
      dispatched.recipients[0].id,
      { replyState: 'no_response' },
      addDays(NOW, 15),
    );

    // The fact that they did not answer is recorded; when the window closed is not
    // falsified to match.
    expect(updated?.reply_state).toBe('no_response');
    expect(updated?.response_due_at).toBe(addDays(NOW, 14));
    expect(listLiveClocks(null, addDays(NOW, 15))).toHaveLength(0);
  });

  it('keeps dispatched recipients when the message is edited afterwards', () => {
    const a = contactWithEmail('De Beers', 'a@example.org');
    const b = contactWithEmail('Black Sash', 'b@example.org');
    const message = saveMessage({ projectId: null, subject: 'Demand' });
    setMessageRecipients(message.id, [
      { contactId: a.contact.id, channelId: a.channel.id, channelKind: 'email' },
    ]);
    dispatchMessage({ messageId: message.id, sentAt: NOW, windowDays: 14 });

    // Now add a second body to the same record.
    const after = setMessageRecipients(message.id, [
      { contactId: a.contact.id, channelId: a.channel.id, channelKind: 'email' },
      { contactId: b.contact.id, channelId: b.channel.id, channelKind: 'email' },
    ]);

    expect(after.recipients).toHaveLength(2);
    const sent = after.recipients.find((r) => r.contact_id === a.contact.id);
    const queued = after.recipients.find((r) => r.contact_id === b.contact.id);
    // The dispatched one is untouched — still sent, still on its original clock.
    expect(sent?.dispatch_state).toBe('sent');
    expect(sent?.sent_at).toBe(NOW);
    expect(queued?.dispatch_state).toBe('queued');
  });

  it('withdraws a recipient as a recorded decision, not a deletion', () => {
    const person = contactWithEmail('Wrong Department', 'wrong@example.org');
    const message = saveMessage({ projectId: null, subject: 'Demand' });
    const withRecipients = setMessageRecipients(message.id, [
      {
        contactId: person.contact.id,
        channelId: person.channel.id,
        channelKind: 'email',
      },
    ]);
    const dispatched = dispatchMessage({ messageId: message.id, sentAt: NOW });
    const recipientId = dispatched.recipients[0].id;

    const withdrawn = withdrawRecipient(recipientId, NOW);

    expect(withdrawn?.dispatch_state).toBe('withdrawn');
    // Still on the record, so the history shows it was sent and then stopped.
    expect(listMessages(null)[0].recipient_count).toBe(1);
    expect(listAttention(null, addDays(NOW, 90))).toHaveLength(0);
  });

  it('counts awaiting and overdue across the scope', () => {
    const project = createProject({ name: 'Dispute' });
    const person = contactWithEmail('CCMA', 'info@ccma.example');
    const message = saveMessage({ projectId: project.id, subject: 'Referral' });
    setMessageRecipients(message.id, [
      {
        contactId: person.contact.id,
        channelId: person.channel.id,
        channelKind: 'email',
      },
    ]);
    dispatchMessage({
      messageId: message.id,
      sentAt: NOW,
      deadlineClass: 'statutory',
      windowDays: 14,
    });

    expect(messageCounts(project.id, NOW)).toEqual({
      messages: 1,
      awaiting: 1,
      overdue: 0,
      nextDueAt: addDays(NOW, 14),
    });

    const later = addDays(NOW, 20);
    expect(messageCounts(project.id, later)).toEqual({
      messages: 1,
      awaiting: 1,
      overdue: 1,
      nextDueAt: addDays(NOW, 14),
    });
    expect(listAttention(project.id, later)[0].state).toBe('overdue');
  });

  it('scopes messages to a project', () => {
    const first = createProject({ name: 'A' });
    const second = createProject({ name: 'B' });
    saveMessage({ projectId: first.id, subject: 'One' });
    saveMessage({ projectId: second.id, subject: 'Two' });

    expect(listMessages(first.id)).toHaveLength(1);
    expect(listMessages(null)).toHaveLength(2);
  });

  it('has a clock that does not move when nothing changes', () => {
    const person = contactWithEmail('De Beers', 'hr@debeers.example');
    const message = saveMessage({ projectId: null, subject: 'Demand' });
    setMessageRecipients(message.id, [
      {
        contactId: person.contact.id,
        channelId: person.channel.id,
        channelKind: 'email',
      },
    ]);
    dispatchMessage({
      messageId: message.id,
      sentAt: NOW,
      deadlineClass: 'statutory',
      windowDays: 14,
    });

    // Re-reading a day later changes the reading, never the stored date.
    const dayLater = listLiveClocks(null, NOW + SECONDS_PER_DAY);
    expect(dayLater[0].response_due_at).toBe(addDays(NOW, 14));
    expect(messageCounts(null, NOW + SECONDS_PER_DAY).overdue).toBe(0);
  });
});
