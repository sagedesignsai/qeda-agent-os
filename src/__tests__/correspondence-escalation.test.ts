/**
 * __tests__/correspondence-escalation.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Escalation is where a correspondence system either prevents a missed deadline or
 * just describes one. These tests fix the three properties that make it useful
 * rather than decorative:
 *
 *   • it produces real work in the existing task manager, not a flag;
 *   • re-running it cannot produce a second task for the same body;
 *   • it refuses to chase anyone who has answered or was never expected to.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import Database from 'better-sqlite3';
import { useTestDatabase } from '../main/db/client';
import { applyMigrations } from '../main/db/schema';
import { createProject } from '../main/db/projects';
import { saveChannel, saveContact } from '../main/db/correspondence';
import {
  dispatchMessage,
  escalateRecipients,
  listRecipientEvents,
  saveMessage,
  setMessageRecipients,
  updateRecipient,
} from '../main/db/messages';
import { getTask, listTasks } from '../main/db/tasks';
import { addDays } from '../lib/correspondence';

const NOW = 1_800_000_000;

describe('escalation into the task manager', () => {
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

  /** A dispatched message with the given number of recipients, all past their date. */
  function dispatchedMessage(
    names: string[],
    deadlineClass: 'statutory' | 'tactical' = 'statutory',
  ) {
    const project = createProject({ name: 'Dispute' });
    const contacts = names.map((name) => {
      const contact = saveContact({ projectId: project.id, name });
      const channel = saveChannel({
        contactId: contact.id,
        kind: 'email',
        value: `${name.toLowerCase().replace(/\s+/g, '.')}@example.org`,
      });
      return { contact, channel };
    });

    const message = saveMessage({
      projectId: project.id,
      subject: 'Letter of demand',
    });
    setMessageRecipients(
      message.id,
      contacts.map(({ contact, channel }) => ({
        contactId: contact.id,
        channelId: channel.id,
        channelKind: 'email' as const,
      })),
    );
    const dispatched = dispatchMessage({
      messageId: message.id,
      sentAt: NOW,
      deadlineClass,
      windowDays: 14,
    });

    return { project, message, contacts, recipients: dispatched.recipients };
  }

  it('creates one linked task per recipient that went quiet', () => {
    const { project, recipients } = dispatchedMessage([
      'De Beers Group',
      'Anglo American',
    ]);

    // A week after the window closed.
    const late = addDays(NOW, 21);
    const result = escalateRecipients(
      { recipientIds: recipients.map((r) => r.id) },
      late,
    );

    expect(result.created).toHaveLength(2);
    expect(result.skipped).toHaveLength(0);

    const tasks = listTasks({ projectId: project.id });
    expect(tasks).toHaveLength(2);
    // The task names the body and says why it exists.
    expect(tasks.map((task) => task.title).join(' ')).toContain('De Beers Group');
    expect(tasks[0].description).toContain('Raised from Correspondence');
    expect(tasks[0].description).toContain('Letter of demand');
  });

  it('presses harder on a blown statutory window than on a stale nudge', () => {
    const statutory = dispatchedMessage(['De Beers Group'], 'statutory');
    const tactical = dispatchedMessage(['Old Colleague'], 'tactical');
    const late = addDays(NOW, 21);

    escalateRecipients({ recipientIds: [statutory.recipients[0].id] }, late);
    escalateRecipients({ recipientIds: [tactical.recipients[0].id] }, late);

    const hardTask = listTasks({ projectId: statutory.project.id })[0];
    const softTask = listTasks({ projectId: tactical.project.id })[0];

    expect(hardTask.priority).toBe(1);
    expect(hardTask.due_at).toBe(addDays(late, 3));
    expect(softTask.priority).toBe(2);
    expect(softTask.due_at).toBe(addDays(late, 7));
  });

  it('is idempotent — a second run reports instead of duplicating', () => {
    const { project, recipients } = dispatchedMessage(['De Beers Group']);
    const late = addDays(NOW, 21);

    const first = escalateRecipients({ recipientIds: [recipients[0].id] }, late);
    const second = escalateRecipients({ recipientIds: [recipients[0].id] }, late);

    expect(first.created).toHaveLength(1);
    expect(second.created).toHaveLength(0);
    expect(second.alreadyEscalated).toEqual([
      { recipientId: recipients[0].id, taskId: first.created[0].taskId },
    ]);
    expect(listTasks({ projectId: project.id })).toHaveLength(1);
  });

  it('records the escalation in the recipient trail', () => {
    const { recipients } = dispatchedMessage(['De Beers Group']);
    const late = addDays(NOW, 21);
    escalateRecipients({ recipientIds: [recipients[0].id] }, late);

    const events = listRecipientEvents(recipients[0].id);
    expect(events[0].kind).toBe('escalated');
    expect(events[0].detail).toContain('Chase task created');
  });

  it('refuses to chase someone who answered', () => {
    const { project, recipients } = dispatchedMessage(['Anglo American']);
    updateRecipient(recipients[0].id, { replyState: 'replied' }, NOW);

    const result = escalateRecipients(
      { recipientIds: [recipients[0].id] },
      addDays(NOW, 21),
    );

    expect(result.created).toHaveLength(0);
    expect(result.skipped).toEqual([recipients[0].id]);
    expect(listTasks({ projectId: project.id })).toHaveLength(0);
  });

  it('refuses to chase a filing nothing was expected back from', () => {
    const contact = saveContact({ projectId: null, name: 'SARS' });
    const channel = saveChannel({
      contactId: contact.id,
      kind: 'email',
      value: 'service@sars.example',
    });
    const message = saveMessage({ projectId: null, subject: 'IRP5 correction' });
    const withRecipients = setMessageRecipients(message.id, [
      { contactId: contact.id, channelId: channel.id, channelKind: 'email' },
    ]);
    dispatchMessage({
      messageId: message.id,
      sentAt: NOW,
      replyNotExpected: [withRecipients.recipients[0].id],
    });

    const result = escalateRecipients({
      recipientIds: [withRecipients.recipients[0].id],
    });

    expect(result.created).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
  });

  it('handles an unknown recipient without throwing', () => {
    const result = escalateRecipients({ recipientIds: ['not-a-recipient'] });
    expect(result.created).toHaveLength(0);
    expect(result.skipped).toEqual(['not-a-recipient']);
  });

  it('files the chase in the message\u2019s project rather than the Inbox', () => {
    const { project, recipients } = dispatchedMessage(['Black Sash']);
    const late = addDays(NOW, 21);
    const result = escalateRecipients({ recipientIds: [recipients[0].id] }, late);

    const task = getTask(result.created[0].taskId);
    expect(task?.project_id).toBe(project.id);
    expect(task?.status).toBe('backlog');
  });

  it('escalates a batch in one call', () => {
    const { recipients, project } = dispatchedMessage([
      'De Beers',
      'Anglo American',
      'Black Sash',
      'Industrial Aid Society',
      'SARS',
    ]);
    const late = addDays(NOW, 30);

    const result = escalateRecipients(
      { recipientIds: recipients.map((recipient) => recipient.id), dueInDays: 5 },
      late,
    );

    expect(result.created).toHaveLength(5);
    expect(listTasks({ projectId: project.id })).toHaveLength(5);
  });
});
