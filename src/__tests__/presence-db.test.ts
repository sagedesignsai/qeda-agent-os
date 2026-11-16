/**
 * __tests__/presence-db.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Tests for the Presence coach data layer — CRUD, streaks, and profile storage.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import Database from 'better-sqlite3';
import { useTestDatabase } from '../main/db/client';
import { applyMigrations } from '../main/db/schema';
import {
  createBatch,
  createItem,
  deleteBatch,
  deleteItem,
  getBatch,
  getBatchDetail,
  getItem,
  listBatches,
  listItems,
  listPosts,
  listRecentItems,
  logPost,
  recordActivity,
  updateItem,
  counts,
  getProfile,
  ensureProfile,
  updateProfile,
  getStreak,
  updateStreak,
  assertItemInProject,
  getActivityBetween,
} from '../main/db/presence';
import {
  displayStreak,
  getMilestoneMessage,
  localDateString,
} from '../lib/presence';

describe('presence data layer', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyMigrations(db);
    useTestDatabase(db);
    // Presence rows carry a real foreign key to projects. Seed the project the
    // tests scope themselves to, otherwise every insert fails the constraint.
    db.prepare(
      "INSERT INTO projects (id, name) VALUES ('project-1', 'Test Project')",
    ).run();
  });

  afterEach(() => {
    useTestDatabase(null as unknown as Database.Database);
    db.close();
  });

  // ── Batches ──────────────────────────────────────────────────────────────

  it('creates and lists batches', () => {
    const batch = createBatch('project-1', 'Build LinkedIn presence', {
      goal: 'personal_brand',
    });
    expect(batch.id).toBeDefined();
    expect(batch.project_id).toBe('project-1');

    const batches = listBatches('project-1');
    expect(batches).toHaveLength(1);
    expect(batches[0].id).toBe(batch.id);
  });

  it('returns empty array when no batches exist', () => {
    expect(listBatches('nonexistent')).toHaveLength(0);
  });

  it('gets a batch by id', () => {
    const batch = createBatch('project-1', 'Focus', {});
    const found = getBatch(batch.id);
    expect(found).not.toBeNull();
    expect(found!.focus).toBe('Focus');
  });

  it('deletes a batch and cascades to items', () => {
    const batch = createBatch('project-1', 'Focus', {});
    createItem(batch.id, 'post_draft', 'Title', 'Body', 'linkedin', null, null);
    expect(listItems(batch.id)).toHaveLength(1);

    expect(deleteBatch(batch.id)).toBe(true);
    expect(getBatch(batch.id)).toBeNull();
    expect(listItems(batch.id)).toHaveLength(0);
  });

  // ── Items ────────────────────────────────────────────────────────────────

  it('creates an item with pending status', () => {
    const batch = createBatch('project-1', '', {});
    const item = createItem(
      batch.id,
      'connection_suggestion',
      'Reach out',
      'Body text',
      'x',
      'contact',
      'contact-1',
    );
    expect(item.status).toBe('pending');
    expect(item.kind).toBe('connection_suggestion');
    expect(item.platform).toBe('x');
  });

  it('updates item status and feedback', () => {
    const batch = createBatch('project-1', '', {});
    const item = createItem(
      batch.id,
      'post_draft',
      'Title',
      'Body',
      'any',
      null,
      null,
    );

    const updated = updateItem(item.id, {
      status: 'done',
      feedback: 'Got 5 likes!',
    });
    expect(updated).not.toBeNull();
    expect(updated!.status).toBe('done');
    expect(updated!.feedback).toBe('Got 5 likes!');
  });

  it('keeps done status when the user edits a suggestion and records one daily activity', () => {
    const batch = createBatch('project-1', '', {});
    const item = createItem(
      batch.id,
      'post_draft',
      'Title',
      'Original body',
      'linkedin',
      null,
      null,
    );

    updateItem(item.id, { status: 'done' }, 'project-1');
    const edited = updateItem(
      item.id,
      { body: 'Corrected body' },
      'project-1',
    );

    expect(edited?.status).toBe('done');
    expect(edited?.body).toBe('Corrected body');
    expect(edited?.edited_at).toBeGreaterThan(0);
    expect(
      getActivityBetween('project-1', localDateString(), localDateString()),
    ).toHaveLength(1);
    expect(getStreak('project-1').streak_count).toBe(1);
    expect(listPosts('project-1')).toHaveLength(0);
  });

  it('rejects item access from another project', () => {
    db.prepare(
      "INSERT INTO projects (id, name) VALUES ('project-2', 'Other Project')",
    ).run();
    const batch = createBatch('project-1', '', {});
    const item = createItem(
      batch.id,
      'post_draft',
      'Title',
      'Body',
      'linkedin',
      null,
      null,
    );

    expect(() => assertItemInProject(item.id, 'project-2')).toThrow(
      /does not belong to project/i,
    );
  });

  it('deletes an item', () => {
    const batch = createBatch('project-1', '', {});
    const item = createItem(
      batch.id,
      'post_draft',
      'Title',
      'Body',
      'any',
      null,
      null,
    );
    expect(deleteItem(item.id)).toBe(true);
    expect(getItem(item.id)).toBeNull();
  });

  // ── Batch detail ─────────────────────────────────────────────────────────

  it('returns batch with items', () => {
    const batch = createBatch('project-1', '', {});
    createItem(batch.id, 'post_draft', 'T1', 'B1', 'linkedin', null, null);
    createItem(
      batch.id,
      'engagement_prompt',
      'T2',
      'B2',
      'discord',
      null,
      null,
    );

    const detail = getBatchDetail(batch.id);
    expect(detail).not.toBeNull();
    expect(detail!.items).toHaveLength(2);
  });

  // ── Posts ────────────────────────────────────────────────────────────────

  it('logs and lists posts', () => {
    const post = logPost('project-1', 'linkedin', 'Post content', '', null);
    expect(post.id).toBeDefined();
    expect(post.platform).toBe('linkedin');

    const posts = listPosts('project-1');
    expect(posts).toHaveLength(1);
  });

  it('links an explicitly logged post to its item and records activity', () => {
    const batch = createBatch('project-1', '', {});
    const item = createItem(
      batch.id,
      'post_draft',
      'Title',
      'Body',
      'linkedin',
      null,
      null,
    );

    const post = logPost(
      'project-1',
      'linkedin',
      'Published body',
      '12 likes',
      item.id,
    );

    expect(post.item_id).toBe(item.id);
    expect(getItem(item.id)?.posted_at).toBe(post.posted_at);
    expect(getItem(item.id)?.body).toBe('Published body');
    expect(getItem(item.id)?.edited_at).toBeGreaterThan(0);
    expect(getActivityBetween('project-1', localDateString(), localDateString()))
      .toHaveLength(1);
    expect(getStreak('project-1').streak_count).toBe(1);
  });

  // ── Counts ───────────────────────────────────────────────────────────────

  it('counts batches and item statuses', () => {
    const batch = createBatch('project-1', '', {});
    const item1 = createItem(
      batch.id,
      'post_draft',
      'T1',
      'B1',
      'linkedin',
      null,
      null,
    );
    const item2 = createItem(
      batch.id,
      'post_draft',
      'T2',
      'B2',
      'x',
      null,
      null,
    );
    updateItem(item1.id, { status: 'done' });
    updateItem(item2.id, { status: 'skipped' });

    const c = counts('project-1');
    expect(c.batches).toBe(1);
    expect(c.done).toBe(1);
    expect(c.skipped).toBe(1);
    expect(c.pending).toBe(0);
  });

  describe('presence streak display', () => {
    it('keeps a streak active today or yesterday and clears it after a gap', () => {
      expect(displayStreak(8, '2026-11-16', '2026-11-16')).toBe(8);
      expect(displayStreak(8, '2026-11-15', '2026-11-16')).toBe(8);
      expect(displayStreak(8, '2026-11-14', '2026-11-16')).toBe(0);
    });

    it('only celebrates milestones reached today', () => {
      expect(getMilestoneMessage(31)).toBeNull();
      expect(getMilestoneMessage(60)).toContain('60 days');
    });
  });

  // ── Recent items ─────────────────────────────────────────────────────────

  it('returns recent items for a project', () => {
    const batch = createBatch('project-1', '', {});
    createItem(batch.id, 'post_draft', 'T1', 'B1', 'linkedin', null, null);
    createItem(batch.id, 'post_draft', 'T2', 'B2', 'x', null, null);

    const recent = listRecentItems('project-1', 5);
    expect(recent).toHaveLength(2);
  });

  // ── Profile ──────────────────────────────────────────────────────────────

  it('creates a profile on first access', () => {
    const profile = ensureProfile('project-1');
    expect(profile.id).toBeDefined();
    expect(profile.onboarding_complete).toBe(false);
    expect(profile.streak_count).toBe(0);
  });

  it('updates onboarding answers', () => {
    const profile = updateProfile('project-1', {
      onboarding_complete: true,
      platforms_json: JSON.stringify(['linkedin', 'x']),
      goal: 'personal_brand',
    });
    expect(profile.onboarding_complete).toBe(true);
    expect(profile.platforms_json).toBe(JSON.stringify(['linkedin', 'x']));
    expect(profile.goal).toBe('personal_brand');
  });

  it('returns null for non-existent profile', () => {
    expect(getProfile('nonexistent')).toBeNull();
  });

  // ── Streak ───────────────────────────────────────────────────────────────

  it('starts a streak at 1', () => {
    const streak = updateStreak('project-1');
    expect(streak).toBe(1);
    const s = getStreak('project-1');
    expect(s.streak_count).toBe(1);
  });

  it('does not increment streak on same day', () => {
    updateStreak('project-1');
    const streak2 = updateStreak('project-1');
    expect(streak2).toBe(1);
  });

  it('returns zero streak for no profile', () => {
    const s = getStreak('nonexistent');
    expect(s.streak_count).toBe(0);
    expect(s.last_active_date).toBeNull();
  });

  it('does not present a stored streak as active after a gap', () => {
    updateProfile('project-1', {
      streak_count: 12,
      last_active_date: '2000-01-01',
    });

    expect(getStreak('project-1').streak_count).toBe(0);
  });

  // ── Activity ledger idempotency ──────────────────────────────────────────

  it('records only one activity row per day regardless of how many actions occur', () => {
    const batch = createBatch('project-1', '', {});
    const item = createItem(
      batch.id,
      'post_draft',
      'T',
      'B',
      'linkedin',
      null,
      null,
    );

    // Multiple actions on the same day
    updateItem(item.id, { status: 'done' }, 'project-1');
    updateItem(item.id, { body: 'Edited body' }, 'project-1');
    recordActivity('project-1', 'posted', item.id);

    const today = localDateString();
    const activities = getActivityBetween('project-1', today, today);
    expect(activities).toHaveLength(1);
  });

  it('updates the source on conflict but keeps one row', () => {
    const batch = createBatch('project-1', '', {});
    const item = createItem(
      batch.id,
      'post_draft',
      'T',
      'B',
      'linkedin',
      null,
      null,
    );

    updateItem(item.id, { status: 'done' }, 'project-1');
    const today = localDateString();
    let activities = getActivityBetween('project-1', today, today);
    expect(activities).toHaveLength(1);
    expect(activities[0].source).toBe('done');

    // Second action same day should update source but not add a row
    recordActivity('project-1', 'posted', item.id);
    activities = getActivityBetween('project-1', today, today);
    expect(activities).toHaveLength(1);
    expect(activities[0].source).toBe('posted');
  });
});
