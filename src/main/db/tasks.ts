/**
 * db/tasks.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * CRUD helpers for the ADHD task manager `tasks` table.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { nanoid } from 'nanoid';
import { getDb } from './client.js';
import { INBOX_PROJECT_ID } from './schema.js';

// ─── Domain types ─────────────────────────────────────────────────────────────

export type TaskStatus = 'backlog' | 'active' | 'done';
export type TaskPriority = 1 | 2 | 3; // 1=high 2=medium 3=low

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  due_at: number | null;
  /** Rough time estimate in minutes (drives time blocking). */
  estimate_mins: number | null;
  /** Owning project. Defaults to the Inbox so a task always has a home. */
  project_id: string;
  pomodoro_count: number;
  position: number;
  created_at: number;
  updated_at: number;
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

/**
 * Return tasks ordered by status then position, optionally narrowed to one
 * status and/or one project.
 */
export function listTasks(opts?: {
  status?: TaskStatus;
  /** Narrow to one project; nullish means every project. */
  projectId?: string | null;
}): Task[] {
  const where: string[] = [];
  const values: unknown[] = [];

  if (opts?.status) {
    where.push('status = ?');
    values.push(opts.status);
  }
  if (opts?.projectId) {
    where.push('project_id = ?');
    values.push(opts.projectId);
  }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return getDb()
    .prepare(
      `SELECT * FROM tasks ${clause} ORDER BY status, position ASC, created_at ASC`,
    )
    .all(...values) as Task[];
}

/** Get a single task by id. */
export function getTask(id: string): Task | null {
  return (
    (getDb().prepare(`SELECT * FROM tasks WHERE id = ?`).get(id) as
      Task | undefined) ?? null
  );
}

/** Create a new task. Returns the saved row. */
export function createTask(opts: {
  title: string;
  description?: string;
  priority?: TaskPriority;
  due_at?: number | null;
  estimate_mins?: number | null;
  /** Omit to file the task in the Inbox. */
  project_id?: string | null;
  status?: TaskStatus;
}): Task {
  const id = nanoid();
  const now = Math.floor(Date.now() / 1000);

  const maxPos = (
    getDb()
      .prepare(
        `SELECT COALESCE(MAX(position), -1) AS m FROM tasks WHERE status = ?`,
      )
      .get(opts.status ?? 'backlog') as { m: number }
  ).m;

  getDb()
    .prepare(
      `INSERT INTO tasks
         (id, title, description, status, priority, due_at, estimate_mins, project_id, position, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      opts.title,
      opts.description ?? '',
      opts.status ?? 'backlog',
      opts.priority ?? 2,
      opts.due_at ?? null,
      opts.estimate_mins ?? null,
      opts.project_id ?? INBOX_PROJECT_ID,
      maxPos + 1,
      now,
      now,
    );

  return getTask(id)!;
}

/** Patch a task. Only provided fields are updated. */
export function updateTask(
  id: string,
  patch: Partial<
    Pick<
      Task,
      | 'title'
      | 'description'
      | 'status'
      | 'priority'
      | 'due_at'
      | 'estimate_mins'
      | 'position'
      | 'pomodoro_count'
    >
  > & {
    /** `null` un-assigns the task; it is stored as the Inbox. */
    project_id?: string | null;
  },
): void {
  const now = Math.floor(Date.now() / 1000);
  const sets: string[] = ['updated_at = ?'];
  const values: unknown[] = [now];

  for (const [key, val] of Object.entries(patch)) {
    if (val !== undefined) {
      // A task always belongs to a project, so `null` (the UI's "no project"
      // choice) means the Inbox — same rule as `createTask`. Writing NULL here
      // would leave a row that `Task['project_id']: string` cannot represent,
      // and that the project-filter queries would silently drop.
      const value =
        key === 'project_id' && val === null ? INBOX_PROJECT_ID : val;
      sets.push(`${key} = ?`);
      values.push(value);
    }
  }

  values.push(id);
  getDb()
    .prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`)
    .run(...values);
}

/** Increment the pomodoro counter for a task. */
export function incrementPomodoro(id: string): void {
  const now = Math.floor(Date.now() / 1000);
  getDb()
    .prepare(
      `UPDATE tasks SET pomodoro_count = pomodoro_count + 1, updated_at = ? WHERE id = ?`,
    )
    .run(now, id);
}

/** Delete a task. */
export function deleteTask(id: string): void {
  getDb().prepare(`DELETE FROM tasks WHERE id = ?`).run(id);
}
