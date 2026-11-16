/**
 * db/presence.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Storage for the Presence coach — suggestions, feedback, posts, streaks, and
 * onboarding profile. Reads contacts from the existing `contacts` table
 * (read-only) to suggest outreach targets.
 *
 * Follows the same sync better-sqlite3 pattern as every other store.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { randomUUID } from 'node:crypto';
import { getDb } from './client.js';
import {
  displayStreak,
  localDateString,
  type PresenceKind,
  type PresencePlatform,
  type PresenceStatus,
} from '../../lib/presence.js';

// ─── Row types ────────────────────────────────────────────────────────────────

export interface PresenceBatch {
  id: string;
  project_id: string | null;
  focus: string;
  context_json: string;
  created_at: number;
}

export interface PresenceItem {
  id: string;
  batch_id: string;
  kind: PresenceKind;
  title: string;
  body: string;
  platform: PresencePlatform;
  source_kind: string | null;
  source_id: string | null;
  status: PresenceStatus;
  feedback: string;
  outcome: string;
  posted_at: number | null;
  edited_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface PresencePost {
  id: string;
  project_id: string | null;
  platform: PresencePlatform;
  content: string;
  posted_at: number;
  metrics: string;
  item_id: string | null;
  created_at: number;
}

export interface PresenceProfile {
  id: string;
  project_id: string;
  streak_count: number;
  best_streak: number;
  last_active_date: string | null;
  onboarding_complete: boolean;
  platforms_json: string;
  goal: string;
  created_at: number;
  updated_at: number;
}

export interface PresenceItemPatch {
  status?: PresenceStatus;
  feedback?: string;
  outcome?: string;
  posted_at?: number | null;
  body?: string;
}

export interface PresenceBatchDetail {
  batch: PresenceBatch;
  items: PresenceItem[];
}

// ─── Batches ──────────────────────────────────────────────────────────────────

export function listBatches(projectId?: string | null): PresenceBatch[] {
  const db = getDb();
  if (projectId) {
    return db
      .prepare<[string], PresenceBatch>(
        'SELECT * FROM presence_batches WHERE project_id = ? ORDER BY created_at DESC',
      )
      .all(projectId) as PresenceBatch[];
  }
  return db
    .prepare<[], PresenceBatch>(
      'SELECT * FROM presence_batches ORDER BY created_at DESC',
    )
    .all() as PresenceBatch[];
}

export function getBatch(id: string): PresenceBatch | null {
  const db = getDb();
  const row = db
    .prepare<[string], PresenceBatch>(
      'SELECT * FROM presence_batches WHERE id = ?',
    )
    .get(id) as PresenceBatch | undefined;
  return row ?? null;
}

export function createBatch(
  projectId: string | null,
  focus: string,
  contextJson: Record<string, unknown>,
): PresenceBatch {
  const db = getDb();
  const id = randomUUID();
  db.prepare<[string, string | null, string, string], unknown>(
    'INSERT INTO presence_batches (id, project_id, focus, context_json) VALUES (?, ?, ?, ?)',
  ).run(id, projectId, focus, JSON.stringify(contextJson));
  return {
    id,
    project_id: projectId,
    focus,
    context_json: JSON.stringify(contextJson),
    created_at: Math.floor(Date.now() / 1000),
  };
}

export function deleteBatch(id: string): boolean {
  const db = getDb();
  const info = db
    .prepare<[string]>('DELETE FROM presence_batches WHERE id = ?')
    .run(id);
  return info.changes > 0;
}

// ─── Items ────────────────────────────────────────────────────────────────────

export function listItems(batchId: string): PresenceItem[] {
  const db = getDb();
  return db
    .prepare<[string], PresenceItem>(
      'SELECT * FROM presence_items WHERE batch_id = ? ORDER BY created_at ASC',
    )
    .all(batchId) as PresenceItem[];
}

export function getItem(id: string): PresenceItem | null {
  const db = getDb();
  const row = db
    .prepare<[string], PresenceItem>(
      'SELECT * FROM presence_items WHERE id = ?',
    )
    .get(id) as PresenceItem | undefined;
  return row ?? null;
}

export function createItem(
  batchId: string,
  kind: PresenceKind,
  title: string,
  body: string,
  platform: PresencePlatform,
  sourceKind: string | null,
  sourceId: string | null,
): PresenceItem {
  const db = getDb();
  const id = randomUUID();
  const now = Math.floor(Date.now() / 1000);
  db.prepare(
    'INSERT INTO presence_items (id, batch_id, kind, title, body, platform, source_kind, source_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(
    id,
    batchId,
    kind,
    title,
    body,
    platform,
    sourceKind,
    sourceId,
    now,
    now,
  );
  return {
    id,
    batch_id: batchId,
    kind,
    title,
    body,
    platform,
    source_kind: sourceKind,
    source_id: sourceId,
    status: 'pending',
    feedback: '',
    outcome: '',
    posted_at: null,
    edited_at: null,
    created_at: now,
    updated_at: now,
  };
}

export function updateItem(
  id: string,
  patch: PresenceItemPatch,
  projectId?: string,
): PresenceItem | null {
  const db = getDb();
  const existing = getItem(id);
  if (!existing) return null;
  if (projectId) assertItemInProject(id, projectId);

  const updates: string[] = [];
  const values: (string | number | null)[] = [];

  const bodyEdited = patch.body !== undefined && patch.body !== existing.body;

  if (patch.status !== undefined) {
    updates.push('status = ?');
    values.push(patch.status);
  }
  if (patch.feedback !== undefined) {
    updates.push('feedback = ?');
    values.push(patch.feedback);
  }
  if (patch.outcome !== undefined) {
    updates.push('outcome = ?');
    values.push(patch.outcome);
  }
  if (patch.posted_at !== undefined) {
    updates.push('posted_at = ?');
    values.push(patch.posted_at ?? null);
  }
  if (patch.body !== undefined) {
    updates.push('body = ?');
    values.push(patch.body);
    if (bodyEdited) {
      updates.push('edited_at = ?');
      values.push(Math.floor(Date.now() / 1000));
    }
  }

  if (updates.length === 0) return existing;

  const now = Math.floor(Date.now() / 1000);
  updates.push('updated_at = ?');
  values.push(now);
  values.push(id);

  db.transaction(() => {
    db.prepare(
      `UPDATE presence_items SET ${updates.join(', ')} WHERE id = ?`,
    ).run(...values);

    if (projectId && patch.status === 'done') {
      recordActivity(projectId, 'done', id);
    } else if (projectId && bodyEdited) {
      recordActivity(projectId, 'edited', id);
    }
  })();

  return getItem(id);
}

export function deleteItem(id: string, projectId?: string): boolean {
  const db = getDb();
  if (projectId) assertItemInProject(id, projectId);
  const info = db
    .prepare<[string]>('DELETE FROM presence_items WHERE id = ?')
    .run(id);
  return info.changes > 0;
}

// ─── Posts ────────────────────────────────────────────────────────────────────

export function logPost(
  projectId: string | null,
  platform: PresencePlatform,
  content: string,
  metrics: string,
  itemId: string | null,
): PresencePost {
  const db = getDb();
  if (itemId) {
    if (!projectId) {
      throw new Error('A project is required when logging a post for an item');
    }
    assertItemInProject(itemId, projectId);
  }

  const id = randomUUID();
  const now = Math.floor(Date.now() / 1000);
  db.transaction(() => {
    db.prepare<
      [
        string,
        string | null,
        string,
        string,
        number,
        string,
        string | null,
        number,
      ],
      unknown
    >(
      'INSERT INTO presence_posts (id, project_id, platform, content, posted_at, metrics, item_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(id, projectId, platform, content, now, metrics, itemId, now);

    if (itemId && projectId) {
      db.prepare(
        `UPDATE presence_items
         SET posted_at = ?, body = ?,
             edited_at = CASE WHEN body <> ? THEN ? ELSE edited_at END,
             updated_at = ?
         WHERE id = ?`,
      ).run(now, content, content, now, now, itemId);
    }

    if (projectId) recordActivity(projectId, 'posted', itemId);
  })();

  return {
    id,
    project_id: projectId,
    platform,
    content,
    posted_at: now,
    metrics,
    item_id: itemId,
    created_at: now,
  };
}

export function listPosts(projectId?: string | null): PresencePost[] {
  const db = getDb();
  if (projectId) {
    return db
      .prepare<[string], PresencePost>(
        'SELECT * FROM presence_posts WHERE project_id = ? ORDER BY posted_at DESC',
      )
      .all(projectId) as PresencePost[];
  }
  return db
    .prepare<[], PresencePost>(
      'SELECT * FROM presence_posts ORDER BY posted_at DESC',
    )
    .all() as PresencePost[];
}

// ─── Counts ───────────────────────────────────────────────────────────────────

export function counts(projectId?: string | null): {
  batches: number;
  pending: number;
  done: number;
  skipped: number;
} {
  const db = getDb();
  const batchWhere = projectId ? 'WHERE project_id = ?' : '';

  const batches = projectId
    ? (db
        .prepare<[string]>(
          `SELECT COUNT(*) FROM presence_batches ${batchWhere}`,
        )
        .get(projectId) as { 'COUNT(*)': number })
    : (db
        .prepare<[]>(`SELECT COUNT(*) FROM presence_batches ${batchWhere}`)
        .get() as { 'COUNT(*)': number });

  const countRow = projectId
    ? (db
        .prepare<[string]>(
          `SELECT
          SUM(CASE WHEN pi.status = 'pending' THEN 1 ELSE 0 END) AS pending,
          SUM(CASE WHEN pi.status = 'done' THEN 1 ELSE 0 END) AS done,
          SUM(CASE WHEN pi.status = 'skipped' THEN 1 ELSE 0 END) AS skipped
        FROM presence_items pi
        INNER JOIN presence_batches pb ON pb.id = pi.batch_id
        WHERE pb.project_id = ?`,
        )
        .all(projectId)[0] as {
        pending: number | null;
        done: number | null;
        skipped: number | null;
      })
    : (db
        .prepare<[]>(
          `SELECT
          SUM(CASE WHEN pi.status = 'pending' THEN 1 ELSE 0 END) AS pending,
          SUM(CASE WHEN pi.status = 'done' THEN 1 ELSE 0 END) AS done,
          SUM(CASE WHEN pi.status = 'skipped' THEN 1 ELSE 0 END) AS skipped
        FROM presence_items pi
        INNER JOIN presence_batches pb ON pb.id = pi.batch_id`,
        )
        .all()[0] as {
        pending: number | null;
        done: number | null;
        skipped: number | null;
      });

  return {
    batches: batches['COUNT(*)'] ?? 0,
    pending: countRow?.pending ?? 0,
    done: countRow?.done ?? 0,
    skipped: countRow?.skipped ?? 0,
  };
}

// ─── Batch detail (batch + items) ─────────────────────────────────────────────

export function getBatchDetail(batchId: string): PresenceBatchDetail | null {
  const batch = getBatch(batchId);
  if (!batch) return null;
  return { batch, items: listItems(batchId) };
}

// ─── Profile (onboarding + streak) ────────────────────────────────────────────

export function getProfile(projectId: string): PresenceProfile | null {
  const db = getDb();
  const row = db
    .prepare<[string], PresenceProfile>(
      'SELECT * FROM presence_profile WHERE project_id = ?',
    )
    .get(projectId) as PresenceProfile | null;
  if (!row) return null;
  return {
    ...row,
    onboarding_complete: !!row.onboarding_complete,
  };
}

export function ensureProfile(projectId: string): PresenceProfile {
  let profile = getProfile(projectId);
  if (profile) return profile;

  const db = getDb();
  const id = randomUUID();
  const now = Math.floor(Date.now() / 1000);
  db.prepare<[string, string, number, number], unknown>(
    'INSERT INTO presence_profile (id, project_id, created_at, updated_at) VALUES (?, ?, ?, ?)',
  ).run(id, projectId, now, now);
  return {
    id,
    project_id: projectId,
    streak_count: 0,
    best_streak: 0,
    last_active_date: null,
    onboarding_complete: false,
    platforms_json: '[]',
    goal: '',
    created_at: now,
    updated_at: now,
  };
}

export function updateProfile(
  projectId: string,
  patch: {
    streak_count?: number;
    last_active_date?: string | null;
    onboarding_complete?: boolean;
    platforms_json?: string;
    goal?: string;
  },
): PresenceProfile {
  const db = getDb();
  ensureProfile(projectId);

  const updates: string[] = [];
  const values: (string | number | null)[] = [];

  if (patch.streak_count !== undefined) {
    updates.push('streak_count = ?');
    values.push(patch.streak_count);
  }
  if (patch.last_active_date !== undefined) {
    updates.push('last_active_date = ?');
    values.push(patch.last_active_date ?? null);
  }
  if (patch.onboarding_complete !== undefined) {
    updates.push('onboarding_complete = ?');
    values.push(patch.onboarding_complete ? 1 : 0);
  }
  if (patch.platforms_json !== undefined) {
    updates.push('platforms_json = ?');
    values.push(patch.platforms_json);
  }
  if (patch.goal !== undefined) {
    updates.push('goal = ?');
    values.push(patch.goal);
  }

  if (updates.length === 0) return getProfile(projectId)!;

  const now = Math.floor(Date.now() / 1000);
  updates.push('updated_at = ?');
  values.push(now);
  values.push(projectId);

  db.prepare(
    `UPDATE presence_profile SET ${updates.join(', ')} WHERE project_id = ?`,
  ).run(...values);

  return getProfile(projectId)!;
}

// ─── Streak helpers ───────────────────────────────────────────────────────────

/**
 * Compute and update the streak after a recorded activity.
 * Returns the new streak count.
 */
export function updateStreak(projectId: string): number {
  const profile = ensureProfile(projectId);
  const today = localDateString();

  if (profile.last_active_date === today) {
    // Already active today, no change needed
    return profile.streak_count;
  }

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = localDateString(yesterday);

  let newStreak: number;
  if (profile.last_active_date === yesterdayStr) {
    // Consecutive day
    newStreak = profile.streak_count + 1;
  } else {
    // Streak broken or first day
    newStreak = 1;
  }

  // Update best_streak if current streak is higher
  const newBestStreak = Math.max(profile.best_streak, newStreak);

  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  db.prepare(
    'UPDATE presence_profile SET streak_count = ?, best_streak = ?, last_active_date = ?, updated_at = ? WHERE project_id = ?',
  ).run(newStreak, newBestStreak, today, now, projectId);

  return newStreak;
}

/** Return the current streak count and last active date. */
export function getStreak(projectId: string): {
  streak_count: number;
  last_active_date: string | null;
} {
  const profile = getProfile(projectId);
  if (!profile) {
    return { streak_count: 0, last_active_date: null };
  }
  return {
    streak_count: displayStreak(
      profile.streak_count,
      profile.last_active_date,
    ),
    last_active_date: profile.last_active_date,
  };
}

// ─── Ownership validation ────────────────────────────────────────────────────

/**
 * Verify that an item belongs to a project, throw if not.
 */
export function assertItemInProject(
  itemId: string,
  projectId: string,
): PresenceItem {
  const item = getItem(itemId);
  if (!item) {
    throw new Error(`Item not found: ${itemId}`);
  }
  const batch = getBatch(item.batch_id);
  if (!batch || batch.project_id !== projectId) {
    throw new Error(`Item does not belong to project: ${itemId}`);
  }
  return item;
}

/**
 * Verify that a batch belongs to a project, throw if not.
 */
export function assertBatchInProject(
  batchId: string,
  projectId: string,
): PresenceBatch {
  const batch = getBatch(batchId);
  if (!batch) {
    throw new Error(`Batch not found: ${batchId}`);
  }
  if (batch.project_id !== projectId) {
    throw new Error(`Batch does not belong to project: ${batchId}`);
  }
  return batch;
}

// ─── Recent items for AI context ──────────────────────────────────────────────

/**
 * Return the last N presence items with status and feedback, for feeding
 * back into the AI coach prompt.
 */
export function listRecentItems(
  projectId: string | null,
  limit: number = 10,
): PresenceItem[] {
  const db = getDb();
  if (projectId) {
    return db
      .prepare<[string, number], PresenceItem>(
        `SELECT pi.* FROM presence_items pi
         INNER JOIN presence_batches pb ON pb.id = pi.batch_id
         WHERE pb.project_id = ?
         ORDER BY pi.updated_at DESC
         LIMIT ?`,
      )
      .all(projectId, limit) as PresenceItem[];
  }
  return db
    .prepare<[number], PresenceItem>(
      `SELECT * FROM presence_items ORDER BY updated_at DESC LIMIT ?`,
    )
    .all(limit) as PresenceItem[];
}

// ─── Activity ledger (streak tracking) ────────────────────────────────────────

export interface PresenceActivity {
  id: string;
  project_id: string;
  date: string;
  source: 'done' | 'edited' | 'posted';
  item_id: string | null;
  created_at: number;
}

/**
 * Record an activity event for streak tracking.
 * Idempotent per date due to UNIQUE(project_id, date) constraint.
 */
export function recordActivity(
  projectId: string,
  source: 'done' | 'edited' | 'posted',
  itemId: string | null = null,
): PresenceActivity {
  const db = getDb();
  const id = randomUUID();
  const date = localDateString();
  const now = Math.floor(Date.now() / 1000);

  db.prepare<
    [string, string, string, string, string | null, number],
    unknown
  >(
    `INSERT INTO presence_activity (id, project_id, date, source, item_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(project_id, date) DO UPDATE SET
       source = excluded.source,
       item_id = COALESCE(excluded.item_id, presence_activity.item_id)`,
  ).run(id, projectId, date, source, itemId, now);

  const activity = db
    .prepare<[string, string], PresenceActivity>(
      'SELECT * FROM presence_activity WHERE project_id = ? AND date = ?',
    )
    .get(projectId, date) as PresenceActivity | undefined;
  if (!activity) {
    throw new Error(`Failed to record Presence activity for project ${projectId}`);
  }

  updateStreak(projectId);
  return activity;
}

/**
 * Get activity for a date range or just today.
 */
export function getActivityBetween(
  projectId: string,
  startDate: string,
  endDate: string,
): PresenceActivity[] {
  const db = getDb();
  return db
    .prepare<[string, string, string], PresenceActivity>(
      'SELECT * FROM presence_activity WHERE project_id = ? AND date >= ? AND date <= ? ORDER BY date DESC',
    )
    .all(projectId, startDate, endDate) as PresenceActivity[];
}

/**
 * Get activity for a single date.
 */
export function getActivityForDate(
  projectId: string,
  date: string,
): PresenceActivity | null {
  const db = getDb();
  return (
    db
      .prepare<[string, string], PresenceActivity>(
        'SELECT * FROM presence_activity WHERE project_id = ? AND date = ?',
      )
      .get(projectId, date) as PresenceActivity | undefined
  ) ?? null;
}
