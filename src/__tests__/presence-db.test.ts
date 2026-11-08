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
  updateItem,
  counts,
  getProfile,
  ensureProfile,
  updateProfile,
  getStreak,
  updateStreak,
} from '../main/db/presence';

describe('presence data layer', () => {
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

  // ── Batches ──────────────────────────────────────────────────────────────

  it('creates and lists batches', () => {
    const batch = createBatch('project-1', 'Build LinkedIn presence', { goal: 'personal_brand' });
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
    const item = createItem(batch.id, 'connection_suggestion', 'Reach out', 'Body text', 'x', 'contact', 'contact-1');
    expect(item.status).toBe('pending');
    expect(item.kind).toBe('connection_suggestion');
    expect(item.platform).toBe('x');
  });

  it('updates item status and feedback', () => {
    const batch = createBatch('project-1', '', {});
    const item = createItem(batch.id, 'post_draft', 'Title', 'Body', 'any', null, null);

    const updated = updateItem(item.id, { status: 'done', feedback: 'Got 5 likes!' });
    expect(updated).not.toBeNull();
    expect(updated!.status).toBe('done');
    expect(updated!.feedback).toBe('Got 5 likes!');
  });

  it('deletes an item', () => {
    const batch = createBatch('project-1', '', {});
    const item = createItem(batch.id, 'post_draft', 'Title', 'Body', 'any', null, null);
    expect(deleteItem(item.id)).toBe(true);
    expect(getItem(item.id)).toBeNull();
  });

  // ── Batch detail ─────────────────────────────────────────────────────────

  it('returns batch with items', () => {
    const batch = createBatch('project-1', '', {});
    createItem(batch.id, 'post_draft', 'T1', 'B1', 'linkedin', null, null);
    createItem(batch.id, 'engagement_prompt', 'T2', 'B2', 'discord', null, null);

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

  // ── Counts ───────────────────────────────────────────────────────────────

  it('counts batches and item statuses', () => {
    const batch = createBatch('project-1', '', {});
    const item1 = createItem(batch.id, 'post_draft', 'T1', 'B1', 'linkedin', null, null);
    const item2 = createItem(batch.id, 'post_draft', 'T2', 'B2', 'x', null, null);
    updateItem(item1.id, { status: 'done' });
    updateItem(item2.id, { status: 'skipped' });

    const c = counts('project-1');
    expect(c.batches).toBe(1);
    expect(c.done).toBe(1);
    expect(c.skipped).toBe(1);
    expect(c.pending).toBe(0);
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
});
