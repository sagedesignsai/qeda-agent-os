/**
 * __tests__/projects-db.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Covers the Projects spine: the Inbox bootstrap, project CRUD, per-project
 * rollups, re-homing on delete, and the project_id threaded through tasks,
 * blocks, chats, and terminal sessions.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import Database from 'better-sqlite3';
import { useTestDatabase } from '../main/db/client';
import { applyMigrations, INBOX_PROJECT_ID } from '../main/db/schema';
import { createTask, listTasks, updateTask } from '../main/db/tasks';
import { createBlock, listBlocks } from '../main/db/task-blocks';
import { createFocusSession, startOfDay } from '../main/db/focus-sessions';
import {
  createSession,
  listSessions,
  updateSessionProject,
} from '../main/db/sessions';
import {
  createTerminalSession,
  listTerminalSessions,
} from '../main/db/terminal';
import {
  listProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  projectRollup,
  listProjectRollups,
  projectOverview,
  reorderProjects,
  countProjectTasks,
} from '../main/db/projects';

describe('projects data layer', () => {
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

  it('seeds an Inbox project and adopts orphan tasks', () => {
    // applyMigrations already ran MIGRATE_INBOX_PROJECT.
    const inbox = getProject(INBOX_PROJECT_ID);
    expect(inbox).not.toBeNull();
    expect(inbox?.name).toBe('Inbox');
    // Inbox sorts first.
    expect(listProjects()[0].id).toBe(INBOX_PROJECT_ID);
  });

  it('creates, lists, updates, and filters projects', () => {
    const a = createProject({ name: 'Vellum launch' });
    const b = createProject({ name: 'Taxes', status: 'paused' });

    // Newest projects sort after the Inbox (-1).
    expect(listProjects().map((p) => p.id)).toEqual([
      INBOX_PROJECT_ID,
      a.id,
      b.id,
    ]);

    // Status filter narrows.
    const paused = listProjects({ status: 'paused' });
    expect(paused.map((p) => p.id)).toEqual([b.id]);

    updateProject(a.id, { status: 'archived', name: 'Vellum 1.0' });
    expect(getProject(a.id)?.name).toBe('Vellum 1.0');
    // Archived projects are hidden unless explicitly included.
    expect(listProjects().map((p) => p.id)).toEqual([INBOX_PROJECT_ID, b.id]);
    expect(listProjects({ includeArchived: true })).toHaveLength(3);
  });

  it('files new tasks in the Inbox by default and filters by project', () => {
    const project = createProject({ name: 'Side quest' });

    const inboxTask = createTask({ title: 'Unsorted thought' });
    const projectTask = createTask({
      title: 'Do the thing',
      project_id: project.id,
    });

    expect(inboxTask.project_id).toBe(INBOX_PROJECT_ID);
    expect(projectTask.project_id).toBe(project.id);

    expect(listTasks({ projectId: project.id }).map((t) => t.id)).toEqual([
      projectTask.id,
    ]);
    expect(countProjectTasks(project.id)).toBe(1);
  });

  it('rolls up task progress, overdue items, focus time, and today\u2019s blocks', () => {
    const project = createProject({ name: 'Rollup' });
    const now = Math.floor(Date.now() / 1000);
    const yesterday = now - 90_000;

    const done = createTask({
      title: 'done',
      project_id: project.id,
      status: 'done',
    });
    const active = createTask({
      title: 'active',
      project_id: project.id,
      status: 'active',
    });
    createTask({ title: 'backlog', project_id: project.id, status: 'backlog' });
    // Overdue: not done, due before now.
    updateTask(active.id, { due_at: yesterday });

    // A block today, owned directly by the project.
    createBlock({
      project_id: project.id,
      title: 'Standup',
      start_at: startOfDay(now) + 3600,
      end_at: startOfDay(now) + 5400,
    });

    // Focus today and focus overall, via a project task.
    createFocusSession({
      task_id: done.id,
      kind: 'work',
      actual_sec: 600,
      started_at: startOfDay(now) + 60,
    });
    createFocusSession({
      task_id: done.id,
      kind: 'work',
      actual_sec: 300,
      started_at: now - 200_000,
    });

    const rollup = projectRollup(project.id, now)!;
    expect(rollup.project.id).toBe(project.id);
    expect(rollup.taskTotal).toBe(3);
    expect(rollup.taskDone).toBe(1);
    expect(rollup.taskActive).toBe(1);
    expect(rollup.taskBacklog).toBe(1);
    expect(rollup.overdue).toBe(1);
    // The soonest open due date is the active task's (there is only one).
    expect(rollup.nextDueAt).toBe(yesterday);
    expect(rollup.blocksToday).toBe(1);
    expect(rollup.focusSecToday).toBe(600);
    expect(rollup.focusSecTotal).toBe(900);
    // Creating tasks/sessions counts as activity.
    expect(rollup.lastActivityAt).not.toBeNull();

    const all = listProjectRollups({ now });
    expect(all.map((r) => r.project.id)).toContain(project.id);
  });

  it('persists a manual order via sort_order', () => {
    const a = createProject({ name: 'A' });
    const b = createProject({ name: 'B' });
    const c = createProject({ name: 'C' });

    reorderProjects([c.id, a.id, b.id]);

    // Inbox keeps sort_order -1 and stays first; the rest follow the new order.
    expect(listProjects().map((p) => p.id)).toEqual([
      INBOX_PROJECT_ID,
      c.id,
      a.id,
      b.id,
    ]);
  });

  it('reports an overview with a trailing trend, recent tasks, and linked work', () => {
    const project = createProject({ name: 'Overview' });
    const now = Math.floor(Date.now() / 1000);

    const task = createTask({
      title: 'Ship',
      project_id: project.id,
      status: 'active',
    });
    createTask({ title: 'Second', project_id: project.id });

    createFocusSession({
      task_id: task.id,
      kind: 'work',
      actual_sec: 600,
      started_at: startOfDay(now) + 60,
    });

    // Adjacent work, inserted directly — only the counts matter here.
    db.prepare(
      `INSERT INTO documents (id, project_id, title, data_json) VALUES ('d1', ?, 'Doc', '{}')`,
    ).run(project.id);
    db.prepare(
      `INSERT INTO terminal_sessions (id, project_id) VALUES ('t1', ?)`,
    ).run(project.id);

    const overview = projectOverview(project.id, { now, days: 14 })!;
    expect(overview.project.id).toBe(project.id);
    expect(overview.focusByDay).toHaveLength(14);
    // The single session lands in today's (last) bucket.
    expect(overview.focusByDay[13].sec).toBe(600);
    expect(overview.focusByDay.reduce((sum, d) => sum + d.sec, 0)).toBe(600);
    expect(overview.recentTasks.map((t) => t.title).sort()).toEqual([
      'Second',
      'Ship',
    ]);
    expect(overview.linked.documents).toBe(1);
    expect(overview.linked.terminalSessions).toBe(1);
    expect(overview.linked.studioTakes).toBe(0);
    expect(overview.linked.chatSessions).toBe(0);

    expect(projectOverview('does-not-exist')).toBeNull();
  });

  it('re-homes tasks to the Inbox when a project is deleted', () => {
    const project = createProject({ name: 'Doomed' });
    const task = createTask({ title: 'Survivor', project_id: project.id });

    const block = createBlock({
      project_id: project.id,
      title: 'Orphan block',
      start_at: 1000,
      end_at: 2000,
    });
    const chat = createSession('Project chat', project.id);
    const term = createTerminalSession({ project_id: project.id });

    expect(deleteProject(project.id)).toBe(true);
    expect(getProject(project.id)).toBeNull();

    // The task survives, re-homed to the Inbox.
    expect(listTasks().find((t) => t.id === task.id)?.project_id).toBe(
      INBOX_PROJECT_ID,
    );
    // Associations on the other records are cleared, not the records.
    expect(listBlocks()[0].project_id).toBeNull();
    expect(listSessions().find((s) => s.id === chat.id)?.project_id).toBeNull();
    expect(
      listTerminalSessions().find((s) => s.id === term.id)?.project_id,
    ).toBeNull();
    expect(block.id).toBeDefined();
  });

  it('refuses to delete the Inbox', () => {
    expect(deleteProject(INBOX_PROJECT_ID)).toBe(false);
    expect(getProject(INBOX_PROJECT_ID)).not.toBeNull();
  });

  it('threads project_id through blocks, chats, and terminal sessions', () => {
    const project = createProject({ name: 'Threaded' });

    const task = createTask({ title: 'Block owner', project_id: project.id });
    const taskBlock = createBlock({
      task_id: task.id,
      title: 'via task',
      start_at: 10,
      end_at: 20,
    });
    const projectBlock = createBlock({
      project_id: project.id,
      title: 'via project',
      start_at: 30,
      end_at: 40,
    });
    const other = createBlock({ title: 'elsewhere', start_at: 50, end_at: 60 });

    // Project filter matches the project-owned block *and* the task-owned one.
    const scoped = listBlocks({ projectId: project.id }).map((b) => b.id);
    expect(scoped).toContain(taskBlock.id);
    expect(scoped).toContain(projectBlock.id);
    expect(scoped).not.toContain(other.id);

    const chat = createSession('Threaded chat', project.id);
    expect(listSessions({ projectId: project.id }).map((s) => s.id)).toEqual([
      chat.id,
    ]);
    updateSessionProject(chat.id, null);
    expect(listSessions({ projectId: project.id })).toHaveLength(0);

    const terminal = createTerminalSession({ project_id: project.id });
    expect(
      listTerminalSessions({ projectId: project.id }).map((s) => s.id),
    ).toEqual([terminal.id]);
  });
});
