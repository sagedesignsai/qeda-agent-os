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
import { dayKey, startOfDay } from './focus-sessions.js';
import type { Task } from './tasks.js';

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
  /**
   * Unix epoch seconds; nullable. Retained for compatibility but no longer a
   * UI affordance: project urgency is derived from task due dates
   * (`ProjectRollup.nextDueAt`), so this is not set from the app's project UI.
   */
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
  /**
   * The soonest due date among open tasks, or null when none is scheduled.
   * This is what makes a project "at risk" — urgency comes from the tasks that
   * do the work, not a hand-set project deadline.
   */
  nextDueAt: number | null;
  /** Seconds of completed-or-attempted work focus applied today. */
  focusSecToday: number;
  /** Total seconds of work focus across the project's life. */
  focusSecTotal: number;
  /** Time blocks scheduled today (project-owned or via one of its tasks). */
  blocksToday: number;
  /**
   * Latest sign of life in the project — the newest of a task edit, a focus
   * session, or a project edit. Null when the project has never seen any.
   * Drives the "stale" health signal, so it deliberately ignores reordering
   * (moving a card is not work).
   */
  lastActivityAt: number | null;
}

/** One calendar day of focus, for the project's trailing trend. */
export interface ProjectFocusDay {
  /** Local `YYYY-MM-DD`. */
  day: string;
  /** Seconds of work focus that started on the day. */
  sec: number;
}

/** How much other work is attached to a project. */
export interface ProjectLinkedCounts {
  documents: number;
  studioTakes: number;
  terminalSessions: number;
  chatSessions: number;
}

/** Everything the project detail page needs, in one read. */
export interface ProjectOverview {
  project: Project;
  rollup: ProjectRollup;
  /** Trailing per-day work focus, oldest first. */
  focusByDay: ProjectFocusDay[];
  /** The most recently updated tasks in the project. */
  recentTasks: Task[];
  linked: ProjectLinkedCounts;
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
                            AND due_at < ? THEN 1 ELSE 0 END), 0) AS overdue,
         MIN(CASE WHEN status != 'done' AND due_at IS NOT NULL
                  THEN due_at END) AS next_due
       FROM tasks WHERE project_id = ?`,
    )
    .get(now, id) as {
    total: number;
    done: number;
    active: number;
    backlog: number;
    overdue: number;
    next_due: number | null;
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

  const activity = db
    .prepare(
      `SELECT MAX(ts) AS last FROM (
         SELECT MAX(updated_at) AS ts FROM tasks WHERE project_id = ?
         UNION ALL
         SELECT MAX(COALESCE(f.ended_at, f.started_at)) AS ts
           FROM focus_sessions f
           JOIN tasks t ON t.id = f.task_id
          WHERE t.project_id = ?
         UNION ALL
         SELECT updated_at AS ts FROM projects WHERE id = ?
       )`,
    )
    .get(id, id, id) as { last: number | null };

  return {
    project,
    taskTotal: tasks.total,
    taskDone: tasks.done,
    taskActive: tasks.active,
    taskBacklog: tasks.backlog,
    overdue: tasks.overdue,
    nextDueAt: tasks.next_due ?? null,
    focusSecToday: focus.today,
    focusSecTotal: focus.total,
    blocksToday: blocks.n,
    lastActivityAt: activity.last ?? null,
  };
}

/**
 * Everything the project detail page renders, resolved in one round-trip:
 * the rollup, a trailing focus trend, the most recently touched tasks, and the
 * counts of adjacent work (docs, studio takes, terminals, chats).
 *
 * Returns null for an unknown project.
 */
export function projectOverview(
  id: string,
  opts?: { now?: number; days?: number },
): ProjectOverview | null {
  const now = opts?.now ?? Math.floor(Date.now() / 1000);
  const days = opts?.days ?? 14;

  const project = getProject(id);
  if (!project) return null;
  const rollup = projectRollup(id, now);
  if (!rollup) return null;

  const db = getDb();

  // The trailing window as calendar days ending today. Built with Date so a
  // DST transition cannot duplicate or skip a day key (adding 86_400s can).
  const start = new Date(now * 1000);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  const windowStart = Math.floor(start.getTime() / 1000);

  const focusRows = db
    .prepare(
      `SELECT f.started_at AS started_at, f.actual_sec AS actual_sec
         FROM focus_sessions f
         JOIN tasks t ON t.id = f.task_id
        WHERE t.project_id = ? AND f.kind = 'work' AND f.started_at >= ?`,
    )
    .all(id, windowStart) as Array<{ started_at: number; actual_sec: number }>;

  const byDay = new Map<string, number>();
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(now * 1000);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    byDay.set(dayKey(Math.floor(d.getTime() / 1000)), 0);
  }
  for (const row of focusRows) {
    const key = dayKey(row.started_at);
    byDay.set(key, (byDay.get(key) ?? 0) + row.actual_sec);
  }

  const recentTasks = db
    .prepare(
      `SELECT * FROM tasks WHERE project_id = ? ORDER BY updated_at DESC LIMIT 8`,
    )
    .all(id) as Task[];

  const count = (sql: string): number =>
    (db.prepare(sql).get(id) as { n: number }).n;

  return {
    project,
    rollup,
    focusByDay: [...byDay.entries()].map(([day, sec]) => ({ day, sec })),
    recentTasks,
    linked: {
      documents: count(
        `SELECT COUNT(*) AS n FROM documents WHERE project_id = ?`,
      ),
      studioTakes: count(
        `SELECT COUNT(*) AS n FROM studio_takes WHERE project_id = ?`,
      ),
      terminalSessions: count(
        `SELECT COUNT(*) AS n FROM terminal_sessions WHERE project_id = ?`,
      ),
      chatSessions: count(
        `SELECT COUNT(*) AS n FROM sessions WHERE project_id = ?`,
      ),
    },
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
 * Persist a manual project order. Writes `sort_order` by array index in one
 * transaction so a multi-row drag lands atomically — a crash partway through
 * cannot leave two projects claiming the same slot.
 *
 * Deliberately does not touch `updated_at`: moving a card is not work, and
 * `projectRollup.lastActivityAt` uses it to decide whether a project is stale.
 */
export function reorderProjects(orderedIds: string[]): void {
  const db = getDb();
  const stmt = db.prepare(`UPDATE projects SET sort_order = ? WHERE id = ?`);
  const tx = db.transaction(() => {
    orderedIds.forEach((id, index) => stmt.run(index, id));
  });
  tx();
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
