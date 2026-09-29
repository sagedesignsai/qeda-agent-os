/**
 * db/projects.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The Projects spine.
 *
 * A project is the unit of *intent* the whole productivity system hangs off:
 * it carries a deadline, a repo path, an optional notebook, and every task,
 * time block, chat, and terminal session can point back at it.
 *
 * `listProjectRollups` is what makes the Projects page useful at a glance — it
 * answers "how far along is this, what's overdue, and how much focus has it
 * actually received?" without the UI stitching four queries together.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { nanoid } from 'nanoid';
import { getDb } from './client.js';
import { INBOX_PROJECT_ID } from './schema.js';
import { startOfDay } from './focus-sessions.js';

export { INBOX_PROJECT_ID };

// ─── Domain types ─────────────────────────────────────────────────────────────

export type ProjectStatus = 'active' | 'paused' | 'done' | 'archived';

export interface Project {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  color: string;
  icon: string;
  /** Unix epoch seconds; nullable. The horizon the focus system plans against. */
  deadline: number | null;
  /** Working directory terminal sessions in this project inherit. */
  repo_path: string | null;
  /** Optional knowledge-base notebook holding this project's documents. */
  notebook_id: string | null;
  sort_order: number;
  created_at: number;
  updated_at: number;
}

/** A project with the numbers the Projects page renders on each card. */
export interface ProjectRollup {
  project: Project;
  taskTotal: number;
  taskDone: number;
  taskActive: number;
  taskBacklog: number;
  /** Open tasks past their due date. */
  overdue: number;
  /** Seconds of completed-or-attempted work focus applied today. */
  focusSecToday: number;
  /** Total seconds of work focus across the project's life. */
  focusSecTotal: number;
  /** Time blocks scheduled today (project-owned or via one of its tasks). */
  blocksToday: number;
}

// ─── Reads ────────────────────────────────────────────────────────────────────

/** List projects, newest-significant first by sort order. */
export function listProjects(opts?: {
  status?: ProjectStatus;
  includeArchived?: boolean;
}): Project[] {
  const where: string[] = [];
  const values: unknown[] = [];

  if (opts?.status) {
    where.push('status = ?');
    values.push(opts.status);
  } else if (!opts?.includeArchived) {
    where.push("status != 'archived'");
  }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return getDb()
    .prepare(
      `SELECT * FROM projects ${clause} ORDER BY sort_order ASC, created_at ASC`,
    )
    .all(...values) as Project[];
}

/** A single project by id. */
export function getProject(id: string): Project | null {
  return (
    (getDb().prepare(`SELECT * FROM projects WHERE id = ?`).get(id) as
      Project | undefined) ?? null
  );
}

/**
 * Per-project progress, overdue count, focus time and today's block count.
 * Returns null for an unknown project.
 */
export function projectRollup(
  id: string,
  now: number = Math.floor(Date.now() / 1000),
): ProjectRollup | null {
  const project = getProject(id);
  if (!project) return null;

  const db = getDb();

  const tasks = db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         COALESCE(SUM(CASE WHEN status = 'done'    THEN 1 ELSE 0 END), 0) AS done,
         COALESCE(SUM(CASE WHEN status = 'active'  THEN 1 ELSE 0 END), 0) AS active,
         COALESCE(SUM(CASE WHEN status = 'backlog' THEN 1 ELSE 0 END), 0) AS backlog,
         COALESCE(SUM(CASE WHEN status != 'done'
                            AND due_at IS NOT NULL
                            AND due_at < ? THEN 1 ELSE 0 END), 0) AS overdue
       FROM tasks WHERE project_id = ?`,
    )
    .get(now, id) as {
    total: number;
    done: number;
    active: number;
    backlog: number;
    overdue: number;
  };

  const dayStart = startOfDay(now);
  const focus = db
    .prepare(
      `SELECT
         COALESCE(SUM(f.actual_sec), 0) AS total,
         COALESCE(SUM(CASE WHEN f.started_at >= ? AND f.started_at < ?
                           THEN f.actual_sec ELSE 0 END), 0) AS today
       FROM focus_sessions f
       JOIN tasks t ON t.id = f.task_id
       WHERE t.project_id = ? AND f.kind = 'work'`,
    )
    .get(dayStart, dayStart + 86_400, id) as { total: number; today: number };

  const blocks = db
    .prepare(
      `SELECT COUNT(*) AS n
         FROM task_blocks b
         LEFT JOIN tasks t ON t.id = b.task_id
        WHERE (b.project_id = ? OR t.project_id = ?)
          AND b.start_at >= ? AND b.start_at < ?`,
    )
    .get(id, id, dayStart, dayStart + 86_400) as { n: number };

  return {
    project,
    taskTotal: tasks.total,
    taskDone: tasks.done,
    taskActive: tasks.active,
    taskBacklog: tasks.backlog,
    overdue: tasks.overdue,
    focusSecToday: focus.today,
    focusSecTotal: focus.total,
    blocksToday: blocks.n,
  };
}

/** Rollups for every listed project — one pass for the Projects page. */
export function listProjectRollups(opts?: {
  status?: ProjectStatus;
  includeArchived?: boolean;
  now?: number;
}): ProjectRollup[] {
  const now = opts?.now ?? Math.floor(Date.now() / 1000);
  return listProjects(opts)
    .map((p) => projectRollup(p.id, now))
    .filter((r): r is ProjectRollup => r !== null);
}

// ─── Writes ───────────────────────────────────────────────────────────────────

/** Create a project. */
export function createProject(opts: {
  name: string;
  description?: string;
  status?: ProjectStatus;
  color?: string;
  icon?: string;
  deadline?: number | null;
  repo_path?: string | null;
  notebook_id?: string | null;
}): Project {
  const id = nanoid();
  const now = Math.floor(Date.now() / 1000);

  const maxSort = (
    getDb()
      .prepare(`SELECT COALESCE(MAX(sort_order), 0) AS m FROM projects`)
      .get() as { m: number }
  ).m;

  getDb()
    .prepare(
      `INSERT INTO projects
         (id, name, description, status, color, icon, deadline, repo_path, notebook_id, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      opts.name,
      opts.description ?? '',
      opts.status ?? 'active',
      opts.color ?? '',
      opts.icon ?? 'folder',
      opts.deadline ?? null,
      opts.repo_path ?? null,
      opts.notebook_id ?? null,
      maxSort + 1,
      now,
      now,
    );

  return getProject(id)!;
}

/** Patch a project. Only provided fields change. */
export function updateProject(
  id: string,
  patch: Partial<
    Pick<
      Project,
      | 'name'
      | 'description'
      | 'status'
      | 'color'
      | 'icon'
      | 'deadline'
      | 'repo_path'
      | 'notebook_id'
      | 'sort_order'
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
    .prepare(`UPDATE projects SET ${sets.join(', ')} WHERE id = ?`)
    .run(...values);
}

/**
 * Delete a project. Its tasks are re-homed to the Inbox rather than deleted —
 * losing work because a container was removed would be unforgivable. Blocks,
 * chats, and terminal sessions simply lose the association.
 *
 * The Inbox itself cannot be deleted.
 */
export function deleteProject(id: string): boolean {
  if (id === INBOX_PROJECT_ID) return false;

  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare(`UPDATE tasks SET project_id = ? WHERE project_id = ?`).run(
      INBOX_PROJECT_ID,
      id,
    );
    db.prepare(
      `UPDATE task_blocks SET project_id = NULL WHERE project_id = ?`,
    ).run(id);
    db.prepare(
      `UPDATE sessions SET project_id = NULL WHERE project_id = ?`,
    ).run(id);
    db.prepare(
      `UPDATE terminal_sessions SET project_id = NULL WHERE project_id = ?`,
    ).run(id);
    db.prepare(`DELETE FROM projects WHERE id = ?`).run(id);
  });
  tx();
  return true;
}

/** Count tasks in a project (cheap helper for guards and the UI). */
export function countProjectTasks(id: string): number {
  return (
    getDb()
      .prepare(`SELECT COUNT(*) AS n FROM tasks WHERE project_id = ?`)
      .get(id) as { n: number }
  ).n;
}
