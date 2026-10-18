/**
 * db/correspondence.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Storage for the Correspondence system's first two nouns: who you deal with
 * (`contacts`) and how you reach each one (`contact_channels`).
 *
 * WHY CHANNELS ARE ROWS, NOT A JSON BLOB
 * "Verify all contact information" is a task a user can only close if the thing
 * being verified is a value: an email that bounces, a phone number that is
 * correct, a body that only accepts portal submissions. One verification state on
 * the organisation would be a lie about at least one of those, so state lives on
 * the channel and the contact's usefulness is derived from its channels.
 *
 * WHY THE IMPORT IS A SINGLE TRANSACTION
 * Harvest writes a reviewed grid of up to a hundred rows. A partial import would
 * leave a project with half its counterparties, and — worse — re-running it would
 * duplicate the half that landed. The whole grid is therefore one transaction that
 * upserts by name and by channel identity, so running it twice is a no-op rather
 * than a second copy of everything.
 *
 * All functions are synchronous (better-sqlite3 is sync by design), like every
 * other store here.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { randomUUID } from 'node:crypto';
import { getDb } from './client.js';
import {
  canonicalChannelValue,
  channelDedupeKey,
  contactNameDedupeKey,
  type ChannelVerification,
  type ContactChannelKind,
  type ContactKind,
  type ContactSource,
} from '../../lib/correspondence.js';
import type { HarvestRowDraft } from '../../lib/harvest.js';

// ─── Row types ────────────────────────────────────────────────────────────────

export interface Contact {
  id: string;
  project_id: string | null;
  kind: ContactKind;
  name: string;
  role: string;
  parent_id: string | null;
  notes: string;
  created_at: number;
  updated_at: number;
}

export interface ContactChannel {
  id: string;
  contact_id: string;
  kind: ContactChannelKind;
  /** Normalised — see `canonicalChannelValue`. */
  value: string;
  label: string;
  verified: ChannelVerification;
  verified_at: number | null;
  source: ContactSource;
  /** Extractor's confidence, or null for a value the user typed. */
  confidence: number | null;
  created_at: number;
  updated_at: number;
}

export interface ContactWithChannels extends Contact {
  channels: ContactChannel[];
}

// ─── Reads ────────────────────────────────────────────────────────────────────

/**
 * Contacts with their channels attached, in one round trip.
 *
 * Two queries rather than N: the caller renders a list, and a per-contact channel
 * lookup would be the N+1 that makes a 200-row registry feel broken.
 */
export function listContacts(projectId?: string | null): ContactWithChannels[] {
  const db = getDb();
  const contacts = (
    projectId
      ? db
          .prepare<[string], Contact>(
            `SELECT * FROM contacts WHERE project_id = ? ORDER BY lower(name)`,
          )
          .all(projectId)
      : db
          .prepare<[], Contact>(`SELECT * FROM contacts ORDER BY lower(name)`)
          .all()
  ) as Contact[];

  if (contacts.length === 0) return [];

  const ids = contacts.map((c) => c.id);
  const placeholders = ids.map(() => '?').join(', ');
  const channels = db
    .prepare<string[], ContactChannel>(
      `SELECT * FROM contact_channels
        WHERE contact_id IN (${placeholders})
        ORDER BY kind, value`,
    )
    .all(...ids) as ContactChannel[];

  const byContact = new Map<string, ContactChannel[]>();
  for (const channel of channels) {
    const list = byContact.get(channel.contact_id);
    if (list) list.push(channel);
    else byContact.set(channel.contact_id, [channel]);
  }

  return contacts.map((contact) => ({
    ...contact,
    channels: byContact.get(contact.id) ?? [],
  }));
}

export function getContact(id: string): ContactWithChannels | null {
  const db = getDb();
  const contact = db
    .prepare<[string], Contact>('SELECT * FROM contacts WHERE id = ?')
    .get(id);
  if (!contact) return null;
  const channels = db
    .prepare<[string], ContactChannel>(
      'SELECT * FROM contact_channels WHERE contact_id = ? ORDER BY kind, value',
    )
    .all(id);
  return { ...contact, channels };
}

/**
 * The contact a channel value already belongs to, within a project scope.
 *
 * Used by the import to merge rather than duplicate, and by the review grid to
 * warn about a body that is already in the registry.
 */
export function findContactByChannel(
  kind: ContactChannelKind,
  value: string,
  projectId?: string | null,
): Contact | null {
  const canonical = canonicalChannelValue(kind, value);
  if (!canonical) return null;
  const db = getDb();
  if (projectId) {
    return (
      db
        .prepare<[string, string, string], Contact>(
          `SELECT c.* FROM contacts c
             JOIN contact_channels ch ON ch.contact_id = c.id
            WHERE c.project_id = ? AND ch.kind = ? AND ch.value = ?
            LIMIT 1`,
        )
        .get(projectId, kind, canonical) ?? null
    );
  }
  return (
    db
      .prepare<[string, string], Contact>(
        `SELECT c.* FROM contacts c
           JOIN contact_channels ch ON ch.contact_id = c.id
          WHERE ch.kind = ? AND ch.value = ?
          LIMIT 1`,
      )
      .get(kind, canonical) ?? null
  );
}

/** Every channel of a given kind carrying this value, for duplicate detection. */
export function findChannel(kind: ContactChannelKind, value: string) {
  const canonical = canonicalChannelValue(kind, value);
  return (
    getDb()
      .prepare<[string, string], ContactChannel>(
        'SELECT * FROM contact_channels WHERE kind = ? AND value = ? LIMIT 1',
      )
      .get(kind, canonical) ?? null
  );
}

// ─── Writes ───────────────────────────────────────────────────────────────────

export interface SaveContactInput {
  id?: string;
  projectId?: string | null;
  kind?: ContactKind;
  name: string;
  role?: string;
  parentId?: string | null;
  notes?: string;
}

/** Create or patch a contact. Mirrors the project/task stores' shape. */
export function saveContact(input: SaveContactInput): ContactWithChannels {
  const db = getDb();
  const name = input.name.trim();
  if (!name) throw new Error('A contact needs a name');

  if (input.id) {
    const sets: string[] = ['updated_at = unixepoch()'];
    const values: unknown[] = [];
    if (input.name !== undefined) {
      sets.push('name = ?');
      values.push(name);
    }
    if (input.kind !== undefined) {
      sets.push('kind = ?');
      values.push(input.kind);
    }
    if (input.role !== undefined) {
      sets.push('role = ?');
      values.push(input.role);
    }
    if (input.notes !== undefined) {
      sets.push('notes = ?');
      values.push(input.notes);
    }
    if (input.parentId !== undefined) {
      sets.push('parent_id = ?');
      values.push(input.parentId);
    }
    if (input.projectId !== undefined) {
      sets.push('project_id = ?');
      values.push(input.projectId);
    }
    values.push(input.id);
    db.prepare(`UPDATE contacts SET ${sets.join(', ')} WHERE id = ?`).run(
      ...values,
    );
    return getContact(input.id)!;
  }

  const id = randomUUID();
  db.prepare(
    `INSERT INTO contacts (id, project_id, kind, name, role, parent_id, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.projectId ?? null,
    input.kind ?? 'organisation',
    name,
    input.role ?? '',
    input.parentId ?? null,
    input.notes ?? '',
  );
  return getContact(id)!;
}

/** Delete a contact. Its channels cascade; nothing else references it yet. */
export function deleteContact(id: string): boolean {
  return getDb().prepare('DELETE FROM contacts WHERE id = ?').run(id).changes > 0;
}

export interface SaveChannelInput {
  id?: string;
  contactId: string;
  kind: ContactChannelKind;
  value: string;
  label?: string;
  source?: ContactSource;
  confidence?: number | null;
}

/**
 * Create or patch a channel.
 *
 * Two invariants enforced here rather than in the UI, because both are about
 * correctness of the stored data:
 *   • the value is canonicalised, so duplicate detection works no matter how it
 *     was typed;
 *   • a newly added channel is `unverified`, and adding one never marks it
 *     verified — only `setChannelVerified` can, and only from a user action.
 */
export function saveChannel(input: SaveChannelInput): ContactChannel {
  const db = getDb();
  const value = canonicalChannelValue(input.kind, input.value);
  if (!value) throw new Error('A channel needs a value');

  if (input.id) {
    const sets: string[] = ['updated_at = unixepoch()'];
    const values: unknown[] = [];
    if (input.label !== undefined) {
      sets.push('label = ?');
      values.push(input.label);
    }
    if (input.kind !== undefined) {
      sets.push('kind = ?');
      values.push(input.kind);
    }
    // A changed value re-opens verification: the old check was about the old
    // address, and carrying `verified` across would assert something untested.
    if (input.value !== undefined) {
      sets.push('value = ?', "verified = 'unverified'", 'verified_at = NULL');
      values.push(value);
    }
    values.push(input.id);
    db.prepare(`UPDATE contact_channels SET ${sets.join(', ')} WHERE id = ?`).run(
      ...values,
    );
    return db
      .prepare<[string], ContactChannel>(
        'SELECT * FROM contact_channels WHERE id = ?',
      )
      .get(input.id)!;
  }

  const id = randomUUID();
  db.prepare(
    `INSERT INTO contact_channels
       (id, contact_id, kind, value, label, source, confidence)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.contactId,
    input.kind,
    value,
    input.label ?? '',
    input.source ?? 'manual',
    input.confidence ?? null,
  );
  return db
    .prepare<[string], ContactChannel>(
      'SELECT * FROM contact_channels WHERE id = ?',
    )
    .get(id)!;
}

export function deleteChannel(id: string): boolean {
  return (
    getDb().prepare('DELETE FROM contact_channels WHERE id = ?').run(id)
      .changes > 0
  );
}

/**
 * Record the outcome of checking a channel. `verified_at` is stamped only for a
 * positive check — a bounce records that it is wrong, not that it was confirmed,
 * and a timestamp there would be read as the latter.
 */
export function setChannelVerified(
  id: string,
  verified: ChannelVerification,
): ContactChannel | null {
  const db = getDb();
  db.prepare(
    `UPDATE contact_channels
        SET verified = ?, verified_at = ?, updated_at = unixepoch()
      WHERE id = ?`,
  ).run(verified, verified === 'verified' ? Math.floor(Date.now() / 1000) : null, id);
  return (
    db
      .prepare<[string], ContactChannel>(
        'SELECT * FROM contact_channels WHERE id = ?',
      )
      .get(id) ?? null
  );
}

// ─── Harvest import ───────────────────────────────────────────────────────────

export interface HarvestImportResult {
  createdContacts: number;
  mergedContacts: number;
  createdChannels: number;
  skippedChannels: number;
  contacts: ContactWithChannels[];
}

/**
 * Write a reviewed harvest grid.
 *
 * The input rows are the user's edited values, not the extractor's output — the
 * grid is the approval step, and by the time this runs every cell has been in
 * front of them. Merging is by name within the scope (so a second import of the
 * same page updates rather than duplicates) and by `(kind, value)` for channels
 * (so the same email is never stored twice).
 *
 * `created_contacts` vs `merged` matters to the UI: "7 contacts imported" and
 * "7 contacts, 3 already here" are different sentences, and only the second one
 * tells the user their registry is deduplicating correctly.
 */
export function importHarvestRows(input: {
  projectId: string | null;
  rows: HarvestRowDraft[];
}): HarvestImportResult {
  const db = getDb();
  const contactIds: string[] = [];
  let createdContacts = 0;
  let mergedContacts = 0;
  let createdChannels = 0;
  let skippedChannels = 0;

  const tx = db.transaction(() => {
    const existing = listContacts(input.projectId ?? null);

    for (const row of input.rows) {
      const name = row.name.trim();
      if (!name) continue;

      const key = contactNameDedupeKey(name);
      const match = existing.find(
        (c) => contactNameDedupeKey(c.name) === key && key.length > 0,
      );

      let contact: ContactWithChannels;
      if (match) {
        mergedContacts += 1;
        contact = match;
      } else {
        const id = randomUUID();
        db.prepare(
          `INSERT INTO contacts (id, project_id, kind, name, role, notes)
           VALUES (?, ?, ?, ?, ?, ?)`,
        ).run(
          id,
          input.projectId ?? null,
          row.kind,
          name,
          row.role ?? '',
          row.notes ?? '',
        );
        contact = { ...getContact(id)!, channels: [] };
        existing.push(contact);
        createdContacts += 1;
      }

      contactIds.push(contact.id);

      const existingKeys = new Set(
        contact.channels.map((c) => channelDedupeKey(c.kind, c.value)),
      );

      for (const channel of row.channels) {
        const value = canonicalChannelValue(channel.kind, channel.value);
        if (!value) continue;
        const channelKey = channelDedupeKey(channel.kind, value);

        // Already on this contact, or already on another one in the same scope —
        // either way it is the same way of reaching the same body.
        if (existingKeys.has(channelKey)) {
          skippedChannels += 1;
          continue;
        }
        const elsewhere = db
          .prepare<[string, string], { id: string }>(
            'SELECT id FROM contact_channels WHERE kind = ? AND value = ? LIMIT 1',
          )
          .get(channel.kind, value);
        if (elsewhere) {
          skippedChannels += 1;
          continue;
        }

        db.prepare(
          `INSERT INTO contact_channels
             (id, contact_id, kind, value, label, source, confidence)
           VALUES (?, ?, ?, ?, ?, 'harvest', ?)`,
        ).run(
          randomUUID(),
          contact.id,
          channel.kind,
          value,
          channel.label ?? '',
          channel.confidence ?? null,
        );
        existingKeys.add(channelKey);
        createdChannels += 1;
      }
    }
  });

  tx();

  return {
    createdContacts,
    mergedContacts,
    createdChannels,
    skippedChannels,
    contacts: contactIds
      .map((id) => getContact(id))
      .filter((c): c is ContactWithChannels => c !== null),
  };
}

/** Counts for the rail badge and the project rollup. */
export function contactCounts(projectId?: string | null): {
  contacts: number;
  channels: number;
  unverified: number;
} {
  const db = getDb();
  const scopeJoin = projectId
    ? 'JOIN contacts c ON c.id = ch.contact_id AND c.project_id = ?'
    : '';
  const args = projectId ? [projectId] : [];

  const row = db
    .prepare<unknown[], { channels: number; unverified: number }>(
      `SELECT COUNT(*) AS channels,
              SUM(CASE WHEN ch.verified = 'unverified' THEN 1 ELSE 0 END) AS unverified
         FROM contact_channels ch
         ${scopeJoin}`,
    )
    .get(...args) as { channels: number; unverified: number } | undefined;

  const contacts = projectId
    ? (db
        .prepare<[string], { n: number }>(
          'SELECT COUNT(*) AS n FROM contacts WHERE project_id = ?',
        )
        .get(projectId)?.n ?? 0)
    : (db.prepare<[], { n: number }>('SELECT COUNT(*) AS n FROM contacts').get()
        ?.n ?? 0);

  return {
    contacts,
    channels: row?.channels ?? 0,
    unverified: row?.unverified ?? 0,
  };
}
