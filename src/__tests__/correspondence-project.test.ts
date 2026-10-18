/**
 * __tests__/correspondence-project.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * What correspondence contributes to a project's rollup.
 *
 * The number a project shows most people is the wrong one to get wrong: "3 awaiting
 * reply" is the count of outstanding obligations, so it must exclude everything that
 * is not one. A draft that never left is not owed a reply. A filing that asked for
 * nothing is not owed a reply. Another project's letter is not this project's problem.
 * And a project's contacts must be its own, because a shared letterhead is not a
 * shared registry.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import Database from 'better-sqlite3';
import { useTestDatabase } from '../main/db/client';
import { applyMigrations } from '../main/db/schema';
import { createProject, projectOverview } from '../main/db/projects';
import { saveChannel, saveContact } from '../main/db/correspondence';
import {
  dispatchMessage,
  saveMessage,
  setMessageRecipients,
  updateRecipient,
} from '../main/db/messages';

const NOW = 1_800_000_000;

describe('project rollup of correspondence', () => {
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

  function contactWithEmail(projectId: string | null, name: string, email: string) {
    const contact = saveContact({ projectId, name });
    const channel = saveChannel({
      contactId: contact.id,
      kind: 'email',
      value: email,
    });
    return { contact, channel };
  }

  function linked(projectId: string) {
    return projectOverview(projectId, { now: NOW })!.linked;
  }

  it("counts a project's own contacts, and nobody else's", () => {
    const dispute = createProject({ name: 'Dispute' });
    const elsewhere = createProject({ name: 'Elsewhere' });

    contactWithEmail(dispute.id, 'De Beers Group', 'hr@debeers.example');
    contactWithEmail(dispute.id, 'CCMA', 'info@ccma.example');
    contactWithEmail(elsewhere.id, 'Anglo American', 'hr@anglo.example');
    // An unfiled body is a real contact with no project — it must not leak into any
    // project's count.
    contactWithEmail(null, 'Black Sash', 'help@blacksash.example');

    expect(linked(dispute.id).contacts).toBe(2);
    expect(linked(elsewhere.id).contacts).toBe(1);
  });

  it('counts only the letters that are actually owed an answer', () => {
    const project = createProject({ name: 'Dispute' });
    const a = contactWithEmail(project.id, 'De Beers Group', 'a@example.org');
    const b = contactWithEmail(project.id, 'CCMA', 'b@example.org');
    const c = contactWithEmail(project.id, 'Dept of Labour', 'c@example.org');

    const message = saveMessage({ projectId: project.id, subject: 'Letter of demand' });
    setMessageRecipients(message.id, [
      { contactId: a.contact.id, channelId: a.channel.id, channelKind: 'email' },
      { contactId: b.contact.id, channelId: b.channel.id, channelKind: 'email' },
      { contactId: c.contact.id, channelId: c.channel.id, channelKind: 'email' },
    ]);
    const dispatched = dispatchMessage({
      messageId: message.id,
      sentAt: NOW,
      deadlineClass: 'statutory',
      windowDays: 14,
    });

    expect(linked(project.id).awaitingReplies).toBe(3);

    // One answered, one formally gave up. Both clocks are closed, and each is closed
    // for its own reason.
    updateRecipient(dispatched.recipients[0].id, { replyState: 'replied' }, NOW);
    updateRecipient(dispatched.recipients[1].id, { replyState: 'no_response' }, NOW);

    expect(linked(project.id).awaitingReplies).toBe(1);
  });

  it('does not count a filing, an unsent draft, or another project', () => {
    const project = createProject({ name: 'Dispute' });
    const elsewhere = createProject({ name: 'Elsewhere' });

    // A SARS submission: sent, but nothing is coming back and nothing is overdue.
    const filingBody = contactWithEmail(project.id, 'SARS', 'returns@sars.example');
    const filing = saveMessage({ projectId: project.id, subject: 'VAT return' });
    const filingRecipients = setMessageRecipients(filing.id, [
      {
        contactId: filingBody.contact.id,
        channelId: filingBody.channel.id,
        channelKind: 'email',
      },
    ]);
    dispatchMessage({
      messageId: filing.id,
      sentAt: NOW,
      deadlineClass: 'statutory',
      windowDays: 30,
      replyNotExpected: [filingRecipients.recipients[0].id],
    });

    // Written but never recorded as sent — still on the user's desk, not theirs.
    const draftBody = contactWithEmail(project.id, 'CCMA', 'draft@example.org');
    const draft = saveMessage({ projectId: project.id, subject: 'Draft, unrecorded' });
    setMessageRecipients(draft.id, [
      {
        contactId: draftBody.contact.id,
        channelId: draftBody.channel.id,
        channelKind: 'email',
      },
    ]);

    // A live letter, but filed under a different project.
    const otherBody = contactWithEmail(elsewhere.id, 'Anglo American', 'hr@anglo.example');
    const other = saveMessage({ projectId: elsewhere.id, subject: 'Unrelated' });
    setMessageRecipients(other.id, [
      {
        contactId: otherBody.contact.id,
        channelId: otherBody.channel.id,
        channelKind: 'email',
      },
    ]);
    dispatchMessage({
      messageId: other.id,
      sentAt: NOW,
      deadlineClass: 'tactical',
      windowDays: 7,
    });

    expect(linked(project.id).awaitingReplies).toBe(0);
    expect(linked(elsewhere.id).awaitingReplies).toBe(1);
  });
});
