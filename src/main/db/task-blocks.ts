/**
 * db/task-blocks.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * CRUD helpers for the `task_blocks` table — the time-boxing calendar.
 *
 * A block is a unit of *planned* time. It may point at a task (`task_id`) or
 * stand alone with a plain `title` (e.g. "Inbox zero"). The Today view loads
 * one day's blocks at a time; the join against `tasks` means the UI rarely
 * needs a second query.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { nanoid } from 'nanoid';
import { getDb } from './client.js';

// ─── Domain types ─────────────────────────────────────────────────────────────

export type BlockStatus = 'planned' | 'active' | 'done' | 'skipped';

export interface TaskBlock {
  id: string;
  task_id: string | null;
  /** Set for project-level blocks (standups, reviews); null for task blocks. */
  project_id: string | null;
  title: string;
  /** Unix epoch seconds. */
  start_at: number;
  end_at: number;
  status: BlockStatus;
  created_at: number;
  updated_at: number;
}

/** A block with just enough task context to render it without a second query. */
export interface TaskBlockWithTask extends TaskBlock {
  task_title: string | null;
  task_priority: number | null;
  task_status: string | null;
  task_estimate_mins: number | null;
}

// ─── Reads ────────────────────────────────────────────────────────────────────

const SELECT_WITH_TASK = `
  SELECT b.*,
         t.title          AS task_title,
         t.priority       AS task_priority,
         t.status         AS task_status,
         t.estimate_mins  AS task_estimate_mins
    FROM task_blocks b
    LEFT JOIN tasks t ON t.id = b.task_id
`;

/**
 * Blocks overlapping the window `[from, to)`. Both bounds are optional —
 * omitting them returns the whole calendar.
 */
export function listBlocks(opts?: {
  from?: number;
  to?: number;
  taskId?: string;
  /** Match blocks owned by the project *or* by one of its tasks. */
  projectId?: string | null;
}): TaskBlockWithTask[] {
  const where: string[] = [];
  const values: unknown[] = [];

  if (opts?.from !== undefined) {
    where.push('b.end_at >= ?');
    values.push(opts.from);
  }
  if (opts?.to !== undefined) {
    where.push('b.start_at < ?');
    values.push(opts.to);
  }
  if (opts?.taskId) {
    where.push('b.task_id = ?');
    values.push(opts.taskId);
  }
  if (opts?.projectId) {
    where.push('(b.project_id = ? OR t.project_id = ?)');
    values.push(opts.projectId, opts.projectId);
  }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return getDb()
    .prepare(`${SELECT_WITH_TASK} ${clause} ORDER BY b.start_at ASC`)
    .all(...values) as TaskBlockWithTask[];
}

/** A single block by id. */
export function getBlock(id: string): TaskBlock | null {
  return (
    (getDb().prepare(`SELECT * FROM task_blocks WHERE id = ?`).get(id) as
      TaskBlock | undefined) ?? null
  );
}

// ─── Writes ───────────────────────────────────────────────────────────────────

/** Create a time block. */
export function createBlock(opts: {
  task_id?: string | null;
  project_id?: string | null;
  title?: string;
  start_at: number;
  end_at: number;
  status?: BlockStatus;
}): TaskBlock {
  const id = nanoid();
  const now = Math.floor(Date.now() / 1000);

  getDb()
    .prepare(
      `INSERT INTO task_blocks
         (id, task_id, project_id, title, start_at, end_at, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      opts.task_id ?? null,
      opts.project_id ?? null,
      opts.title ?? '',
      opts.start_at,
      opts.end_at,
      opts.status ?? 'planned',
      now,
      now,
    );

  return getBlock(id)!;
}

/** Patch a block. Only provided fields change. */
export function updateBlock(
  id: string,
  patch: Partial<
    Pick<
      TaskBlock,
      'task_id' | 'project_id' | 'title' | 'start_at' | 'end_at' | 'status'
    >
  >,
): void {
  const now = Math.floor(Date.now() / 1000);
  const sets: string[] = ['updated_at = ?'];
  const values: unknown[] = [now];

  for (const [key, val] of Object.entries(patch)) {
    if (val !== undefined) {
      sets.push(`${key} = ?`);
      values.push(val);
    }
  }

  values.push(id);
  getDb()
    .prepare(`UPDATE task_blocks SET ${sets.join(', ')} WHERE id = ?`)
    .run(...values);
}

/** Delete a block. */
export function deleteBlock(id: string): void {
  getDb().prepare(`DELETE FROM task_blocks WHERE id = ?`).run(id);
}
