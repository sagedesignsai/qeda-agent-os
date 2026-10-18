/**
 * __tests__/correspondence-db.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The registry stores the one thing a correspondence system cannot get wrong twice:
 * who you are dealing with, and whether the way you reach them is known to work.
 *
 * Two behaviours justify most of this file:
 *   • **The import is idempotent.** Harvest is meant to be re-run on the same page
 *     as it grows, so a second import must merge into what is there rather than
 *     build a second copy of the registry. A partial or duplicated import is what
 *     makes a user stop trusting the list.
 *   • **Verification is per channel and is re-opened by an edit.** An email that
 *     bounces must not keep the `verified` badge that a different address earned,
 *     which is why changing a value clears it.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import Database from 'better-sqlite3';
import { useTestDatabase } from '../main/db/client';
import { applyMigrations } from '../main/db/schema';
import {
  contactCounts,
  deleteChannel,
  deleteContact,
  findContactByChannel,
  getContact,
  importHarvestRows,
  listContacts,
  saveChannel,
  saveContact,
  setChannelVerified,
} from '../main/db/correspondence';
import { createProject } from '../main/db/projects';
import type { HarvestRowDraft } from '../lib/harvest';

/** A reviewed grid row, as `HarvestSheet` would hand it to the import. */
function reviewedRow(
  name: string,
  channels: Array<{ kind: HarvestRowDraft['channels'][number]['kind']; value: string }>,
  overrides: Partial<HarvestRowDraft> = {},
): HarvestRowDraft {
  return {
    id: `row-${name}`,
    kind: 'organisation',
    name,
    role: '',
    notes: '',
    confidence: 0.9,
    nameOrigin: 'heading',
    inferred: false,
    channels: channels.map((channel) => ({
      ...channel,
      label: '',
      confidence: 0.95,
      inferred: false,
    })),
    ...overrides,
  };
}

describe('correspondence data layer', () => {
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

  // ── Contacts and channels ─────────────────────────────────────────────────

  it('creates a contact with channels, all unverified', () => {
    const contact = saveContact({
      projectId: null,
      name: 'Commission for Conciliation, Mediation and Arbitration',
      role: 'Dispute referral body',
    });
    const channel = saveChannel({
      contactId: contact.id,
      kind: 'email',
      value: 'Info@CCMA.example',
    });

    expect(channel.verified).toBe('unverified');
    expect(channel.verified_at).toBeNull();
    // Canonicalised on write, so the next harvest of the same address merges.
    expect(channel.value).toBe('info@ccma.example');

    const loaded = getContact(contact.id);
    expect(loaded?.channels).toHaveLength(1);
    expect(loaded?.role).toBe('Dispute referral body');
  });

  it('records a positive check with a timestamp and a bounce without one', () => {
    const contact = saveContact({ name: 'De Beers Group' });
    const channel = saveChannel({
      contactId: contact.id,
      kind: 'phone',
      value: '+27 11 374 7000',
    });

    const verified = setChannelVerified(channel.id, 'verified');
    expect(verified?.verified).toBe('verified');
    expect(verified?.verified_at).toBeGreaterThan(0);

    // A bounce says the value is wrong; stamping a time on it would read as a
    // confirmation.
    const bounced = setChannelVerified(channel.id, 'bounced');
    expect(bounced?.verified).toBe('bounced');
    expect(bounced?.verified_at).toBeNull();
  });

  it('re-opens verification when a channel value changes', () => {
    const contact = saveContact({ name: 'Anglo American' });
    const channel = saveChannel({
      contactId: contact.id,
      kind: 'email',
      value: 'old@anglo.example',
    });
    setChannelVerified(channel.id, 'verified');

    const updated = saveChannel({
      id: channel.id,
      contactId: contact.id,
      kind: 'email',
      value: 'new@anglo.example',
    });

    expect(updated.value).toBe('new@anglo.example');
    expect(updated.verified).toBe('unverified');
    expect(updated.verified_at).toBeNull();
  });

  it('finds the contact a channel value already belongs to', () => {
    const contact = saveContact({ projectId: null, name: 'Black Sash' });
    saveChannel({
      contactId: contact.id,
      kind: 'email',
      value: 'Help@BlackSash.example',
    });

    const found = findContactByChannel('email', 'help@blacksash.example');
    expect(found?.id).toBe(contact.id);
  });

  it('cascades channels when a contact is deleted', () => {
    const contact = saveContact({ name: 'Industrial Aid Society' });
    saveChannel({
      contactId: contact.id,
      kind: 'email',
      value: 'help@ias.example',
    });

    expect(deleteContact(contact.id)).toBe(true);
    expect(contactCounts().channels).toBe(0);
    expect(deleteChannel('does-not-exist')).toBe(false);
  });

  // ── Harvest import ────────────────────────────────────────────────────────

  it('imports a reviewed grid and reports what it did', () => {
    const project = createProject({ name: 'Employment dispute' });

    const result = importHarvestRows({
      projectId: project.id,
      rows: [
        reviewedRow('De Beers Group', [
          { kind: 'email', value: 'hr@debeers.example' },
          { kind: 'phone', value: '+27 (0)11 374 7000' },
        ]),
        reviewedRow('Commission for Conciliation', [
          { kind: 'email', value: 'info@ccma.example' },
        ]),
      ],
    });

    expect(result.createdContacts).toBe(2);
    expect(result.mergedContacts).toBe(0);
    expect(result.createdChannels).toBe(3);

    const contacts = listContacts(project.id);
    expect(contacts).toHaveLength(2);

    const phone = contacts
      .find((c) => c.name === 'De Beers Group')!
      .channels.find((channel) => channel.kind === 'phone');
    expect(phone?.value).toBe('+27113747000');
    // Harvested values carry provenance and never arrive pre-verified.
    expect(phone?.source).toBe('harvest');
    expect(phone?.verified).toBe('unverified');
    expect(phone?.confidence).toBeCloseTo(0.95);
  });

  it('merges rather than duplicates when the same page is harvested twice', () => {
    const project = createProject({ name: 'Employment dispute' });
    const grid = [
      reviewedRow('De Beers Group', [
        { kind: 'email', value: 'hr@debeers.example' },
      ]),
    ];

    const first = importHarvestRows({ projectId: project.id, rows: grid });
    const second = importHarvestRows({
      projectId: project.id,
      rows: [
        ...grid,
        // The page grew a phone number between runs.
        reviewedRow('De Beers Group', [
          { kind: 'phone', value: '+27 11 374 7000' },
        ]),
      ],
    });

    expect(first.createdContacts).toBe(1);
    // The registry does not grow on a re-harvest: both rows name the same body, so
    // both merge. What the second run adds is the phone number the page acquired in
    // between — enrichment, not a second De Beers Group.
    expect(second.createdContacts).toBe(0);
    expect(second.mergedContacts).toBe(2);
    // The email is already there, so it is skipped rather than duplicated.
    expect(second.skippedChannels).toBe(1);
    expect(second.createdChannels).toBe(1);

    const contacts = listContacts(project.id);
    expect(contacts).toHaveLength(1);
    expect(contacts[0].channels.map((channel) => channel.kind).sort()).toEqual([
      'email',
      'phone',
    ]);
  });

  it('matches an existing contact by name despite numbering and acronyms', () => {
    const project = createProject({ name: 'Employment dispute' });
    importHarvestRows({
      projectId: project.id,
      rows: [
        reviewedRow('Commission for Conciliation, Mediation and Arbitration (CCMA)', [
          { kind: 'email', value: 'info@ccma.example' },
        ]),
      ],
    });

    const second = importHarvestRows({
      projectId: project.id,
      rows: [
        reviewedRow('3. Commission for Conciliation Mediation Arbitration', [
          { kind: 'phone', value: '+27 11 646 0335' },
        ]),
      ],
    });

    expect(second.createdContacts).toBe(0);
    expect(second.mergedContacts).toBe(1);
    expect(listContacts(project.id)).toHaveLength(1);
  });

  it('matches an existing channel despite capitalisation', () => {
    const project = createProject({ name: 'Employment dispute' });
    importHarvestRows({
      projectId: project.id,
      rows: [
        reviewedRow('Black Sash', [{ kind: 'email', value: 'help@blacksash.example' }]),
      ],
    });

    const second = importHarvestRows({
      projectId: project.id,
      rows: [
        reviewedRow('Black Sash', [{ kind: 'email', value: 'HELP@BlackSash.example' }]),
      ],
    });

    expect(second.createdChannels).toBe(0);
    expect(second.skippedChannels).toBe(1);
    expect(listContacts(project.id)[0].channels).toHaveLength(1);
  });

  it('skips a row with no name and an empty channel value', () => {
    const result = importHarvestRows({
      projectId: null,
      rows: [
        reviewedRow('', [{ kind: 'email', value: '' }]),
        reviewedRow('SARS', [{ kind: 'email', value: '' }]),
      ],
    });

    expect(result.createdContacts).toBe(1);
    expect(result.createdChannels).toBe(0);
  });

  it('scopes the import to a project and counts across the registry', () => {
    const first = createProject({ name: 'Dispute A' });
    const second = createProject({ name: 'Dispute B' });

    importHarvestRows({
      projectId: first.id,
      rows: [
        reviewedRow('De Beers Group', [
          { kind: 'email', value: 'hr@debeers.example' },
        ]),
      ],
    });
    importHarvestRows({
      projectId: second.id,
      rows: [
        reviewedRow('Anglo American', [
          { kind: 'email', value: 'trustees@anglo.example' },
        ]),
      ],
    });

    expect(listContacts(first.id)).toHaveLength(1);
    expect(listContacts(null)).toHaveLength(2);
    expect(contactCounts().contacts).toBe(2);
    expect(contactCounts(first.id).contacts).toBe(1);
    expect(contactCounts().unverified).toBe(2);
  });
});
