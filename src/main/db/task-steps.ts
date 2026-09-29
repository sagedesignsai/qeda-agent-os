/**
 * db/task-steps.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * CRUD helpers for the `task_steps` table.
 *
 * A step is a single actionable piece of a larger task. Steps deliberately live
 * *inside* a task (rather than as board cards) so breaking a task down feels
 * like making progress, not like flooding the backlog with more work.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { nanoid } from 'nanoid';
import { getDb } from './client.js';

// ─── Domain types ─────────────────────────────────────────────────────────────

export interface TaskStep {
  id: string;
  task_id: string;
  title: string;
  /** SQLite has no boolean type — 0 | 1. */
  done: 0 | 1;
  position: number;
  created_at: number;
}

export interface StepProgress {
  total: number;
  done: number;
}

// ─── Reads ────────────────────────────────────────────────────────────────────

/** All steps for a task, in display order. */
export function listSteps(taskId: string): TaskStep[] {
  return getDb()
    .prepare(
      `SELECT * FROM task_steps WHERE task_id = ? ORDER BY position ASC, created_at ASC`,
    )
    .all(taskId) as TaskStep[];
}

/** A single step by id. */
export function getStep(id: string): TaskStep | null {
  return (
    (getDb().prepare(`SELECT * FROM task_steps WHERE id = ?`).get(id) as
      TaskStep | undefined) ?? null
  );
}

/**
 * Step progress for one task.
 */
export function stepProgress(taskId: string): StepProgress {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS total, COALESCE(SUM(done), 0) AS done
         FROM task_steps WHERE task_id = ?`,
    )
    .get(taskId) as { total: number; done: number };
  return { total: row.total, done: row.done };
}

/**
 * Step progress for every task that has steps, keyed by task id.
 * The board fetches this once instead of querying per card.
 */
export function stepProgressMap(): Record<string, StepProgress> {
  const rows = getDb()
    .prepare(
      `SELECT task_id,
              COUNT(*) AS total,
              COALESCE(SUM(done), 0) AS done
         FROM task_steps
        GROUP BY task_id`,
    )
    .all() as Array<{ task_id: string; total: number; done: number }>;

  const map: Record<string, StepProgress> = {};
  for (const r of rows) map[r.task_id] = { total: r.total, done: r.done };
  return map;
}

// ─── Writes ───────────────────────────────────────────────────────────────────

/** Append a single step to the end of a task's checklist. */
export function createStep(opts: { task_id: string; title: string }): TaskStep {
  const id = nanoid();
  const maxPos = (
    getDb()
      .prepare(
        `SELECT COALESCE(MAX(position), -1) AS m FROM task_steps WHERE task_id = ?`,
      )
      .get(opts.task_id) as { m: number }
  ).m;

  getDb()
    .prepare(
      `INSERT INTO task_steps (id, task_id, title, done, position)
       VALUES (?, ?, ?, 0, ?)`,
    )
    .run(id, opts.task_id, opts.title, maxPos + 1);

  return getStep(id)!;
}

/**
 * Append many steps at once (e.g. an AI task breakdown), preserving order and
 * running in a single transaction so a partial breakdown can never land.
 */
export function createSteps(
  taskId: string,
  titles: readonly string[],
): TaskStep[] {
  const clean = titles.map((t) => t.trim()).filter(Boolean);
  if (clean.length === 0) return [];

  const db = getDb();
  const base = (
    db
      .prepare(
        `SELECT COALESCE(MAX(position), -1) AS m FROM task_steps WHERE task_id = ?`,
      )
      .get(taskId) as { m: number }
  ).m;

  const insert = db.prepare(
    `INSERT INTO task_steps (id, task_id, title, done, position)
     VALUES (?, ?, ?, 0, ?)`,
  );

  const ids: string[] = [];
  const tx = db.transaction(() => {
    clean.forEach((title, i) => {
      const id = nanoid();
      ids.push(id);
      insert.run(id, taskId, title, base + 1 + i);
    });
  });
  tx();

  return ids.map((id) => getStep(id)!).filter(Boolean);
}

/** Toggle (or set) a step's done flag. */
export function setStepDone(id: string, done: boolean): void {
  getDb()
    .prepare(`UPDATE task_steps SET done = ? WHERE id = ?`)
    .run(done ? 1 : 0, id);
}

/** Patch a step's title and/or position. */
export function updateStep(
  id: string,
  patch: Partial<Pick<TaskStep, 'title' | 'position'>>,
): void {
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [key, val] of Object.entries(patch)) {
    if (val !== undefined) {
      sets.push(`${key} = ?`);
      values.push(val);
    }
  }
  if (sets.length === 0) return;
  values.push(id);
  getDb()
    .prepare(`UPDATE task_steps SET ${sets.join(', ')} WHERE id = ?`)
    .run(...values);
}

/** Delete a single step. */
export function deleteStep(id: string): void {
  getDb().prepare(`DELETE FROM task_steps WHERE id = ?`).run(id);
}

/** Remove every step for a task (used when "un-breaking-down"). */
export function deleteStepsForTask(taskId: string): void {
  getDb().prepare(`DELETE FROM task_steps WHERE task_id = ?`).run(taskId);
}
