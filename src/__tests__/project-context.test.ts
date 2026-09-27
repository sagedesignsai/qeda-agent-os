/**
 * __tests__/project-context.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The "Active project" block injected into agent system prompts: describes the
 * scoped project (outcome, deadline, repo, progress) and degrades to an empty
 * string rather than ever breaking a turn.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import Database from 'better-sqlite3';
import { useTestDatabase } from '../main/db/client';
import { applyMigrations, INBOX_PROJECT_ID } from '../main/db/schema';
import { createProject } from '../main/db/projects';
import { createTask, updateTask } from '../main/db/tasks';
import { renderProjectContext } from '../main/ai/project-context';

describe('renderProjectContext', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyMigrations(db);
    useTestDatabase(db);
  });

  afterEach(() => {
    useTestDatabase(null);
    db.close();
  });

  it('renders nothing when no project is scoped', () => {
    expect(renderProjectContext(undefined)).toBe('');
    expect(renderProjectContext({})).toBe('');
  });

  it('renders the project block with outcome, repo, deadline, and progress', () => {
    const project = createProject({
      name: 'Vellum launch',
      description: 'Ship the 1.0 to real users.',
      repo_path: '/data/projects/vellum',
      deadline: new Date(2026, 11, 1).getTime() / 1000,
    });
    createTask({ title: 'Onboarding', project_id: project.id, status: 'done' });
    const active = createTask({
      title: 'Docs',
      project_id: project.id,
      status: 'active',
    });
    updateTask(active.id, {
      due_at: Math.floor(Date.now() / 1000) - 86_400,
    });

    const block = renderProjectContext({ projectId: project.id });

    expect(block).toContain('## Active project');
    expect(block).toContain(`**Vellum launch**`);
    expect(block).toContain(`(id: ${project.id})`);
    expect(block).toContain('Outcome: Ship the 1.0 to real users.');
    expect(block).toContain('Repo: /data/projects/vellum');
    expect(block).toContain('Deadline:');
    expect(block).toContain('Tasks: 2 total, 1 done, 1 active, 1 overdue');
  });

  it('stays minimal when the project has no extras', () => {
    const project = createProject({ name: 'Bare' });
    const block = renderProjectContext({ projectId: project.id });

    expect(block).toContain('**Bare**');
    expect(block).not.toContain('Outcome:');
    expect(block).not.toContain('Repo:');
    expect(block).not.toContain('Deadline:');
    expect(block).toContain('Tasks: 0 total');
  });

  it('returns empty for an unknown project', () => {
    expect(renderProjectContext({ projectId: 'nope' })).toBe('');
  });

  it('is usable for the Inbox too', () => {
    const block = renderProjectContext({ projectId: INBOX_PROJECT_ID });
    expect(block).toContain('**Inbox**');
  });
});
