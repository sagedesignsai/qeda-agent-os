/**
 * __tests__/copilot-tools.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Exercises the copilot's task tools directly against an in-memory database.
 *
 * These tools are the copilot's hands, so the important guarantees are
 * behavioural: a call mutates the DB exactly as promised, and the risky/destructive
 * ones are classified so the agent can gate them behind approval.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// The `ai` package is ESM-only; `tool()` just needs to return its config.
jest.mock('ai', () => ({
  tool: jest.fn((config: unknown) => config),
  isStepCount: jest.fn(),
}));

import Database from 'better-sqlite3';
import { useTestDatabase } from '../main/db/client';
import { applyMigrations } from '../main/db/schema';
import { listTasks } from '../main/db/tasks';
import { listSteps } from '../main/db/task-steps';
import { listBlocks } from '../main/db/task-blocks';
import { listTerminalSessions } from '../main/db/terminal';
import { taskTools } from '../main/tools/tasks';
import { copilotTools, isRiskyCopilotTool } from '../main/ai/task-copilot-agent';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Invoke a tool the way the SDK does: `execute(input, options)`. */
function run(tool: unknown, input: unknown): Promise<any> {
  return (tool as { execute: (i: unknown, o: unknown) => Promise<any> }).execute(
    input,
    { toolCallId: 'test', messages: [] },
  );
}

describe('copilot task tools', () => {
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

  it('creates a task and reports it back', async () => {
    const result = await run(taskTools.createTask, {
      title: 'Draft the proposal',
      priority: 1,
      estimate_mins: 60,
    });

    expect(result.success).toBe(true);
    expect(result.task.title).toBe('Draft the proposal');
    expect(result.task.priority).toBe(1);
    expect(result.task.estimate_mins).toBe(60);
    expect(listTasks()).toHaveLength(1);
  });

  it('creates many tasks for a brain dump', async () => {
    const result = await run(taskTools.createTasks, {
      tasks: [{ title: 'Call the bank' }, { title: 'Book dentist', priority: 2 }],
    });

    expect(result.success).toBe(true);
    expect(result.count).toBe(2);
    expect(listTasks()).toHaveLength(2);
  });

  it('adds checklist steps to an existing task', async () => {
    const created = await run(taskTools.createTask, { title: 'Ship release' });
    const result = await run(taskTools.addSteps, {
      taskId: created.task.id,
      steps: ['Open the changelog', 'Write one line', 'Tag the version'],
    });

    expect(result.success).toBe(true);
    expect(result.count).toBe(3);
    expect(listSteps(created.task.id)).toHaveLength(3);
  });

  it('refuses to add steps to a missing task', async () => {
    const result = await run(taskTools.addSteps, {
      taskId: 'nope',
      steps: ['x'],
    });
    expect(result.success).toBe(false);
  });

  it('schedules a time block with the requested duration', async () => {
    const task = await run(taskTools.createTask, { title: 'Deep work' });
    const start = '2026-09-27T14:00:00.000Z';

    const result = await run(taskTools.scheduleBlock, {
      taskId: task.task.id,
      start,
      durationMins: 90,
    });

    expect(result.success).toBe(true);
    const blocks = listBlocks();
    expect(blocks).toHaveLength(1);
    expect(blocks[0].end_at - blocks[0].start_at).toBe(90 * 60);
    expect(blocks[0].task_id).toBe(task.task.id);
  });

  it('reads tasks, stats, and blocks', async () => {
    await run(taskTools.createTask, { title: 'One' });
    const list = await run(taskTools.listTasks, {});
    expect(list.success).toBe(true);
    expect(list.count).toBe(1);

    const stats = await run(taskTools.getFocusStats, {});
    expect(stats.success).toBe(true);
    expect(stats.stats.todayWorkSessions).toBe(0);

    const blocks = await run(taskTools.listBlocks, {});
    expect(blocks.success).toBe(true);
    expect(Array.isArray(blocks.blocks)).toBe(true);
  });

  it('updates a task (risky tool)', async () => {
    const task = await run(taskTools.createTask, { title: 'Tidy desk' });
    const result = await run(taskTools.updateTask, {
      taskId: task.task.id,
      priority: 3,
      status: 'active',
    });

    expect(result.success).toBe(true);
    expect(result.task.priority).toBe(3);
    expect(result.task.status).toBe('active');
  });

  it('completes and deletes tasks (risky tools)', async () => {
    const task = await run(taskTools.createTask, { title: 'File taxes' });

    // Pass `done` explicitly: with the SDK's `tool()` mocked as identity the
    // zod default is not applied (the real SDK fills it in).
    const done = await run(taskTools.completeTask, {
      taskId: task.task.id,
      done: true,
    });
    expect(done.success).toBe(true);
    expect(listTasks()[0].status).toBe('done');

    const reopened = await run(taskTools.completeTask, {
      taskId: task.task.id,
      done: false,
    });
    expect(reopened.success).toBe(true);
    expect(listTasks()[0].status).toBe('active');

    const removed = await run(taskTools.deleteTask, { taskId: task.task.id });
    expect(removed.success).toBe(true);
    expect(listTasks()).toHaveLength(0);
  });

  it('moves and deletes blocks (risky tools)', async () => {
    const task = await run(taskTools.createTask, { title: 'Write' });
    const block = await run(taskTools.scheduleBlock, {
      taskId: task.task.id,
      start: '2026-09-27T09:00:00.000Z',
      durationMins: 30,
    });

    await run(taskTools.moveBlock, {
      blockId: block.block.id,
      start: '2026-09-27T10:00:00.000Z',
      durationMins: 60,
    });
    const moved = listBlocks()[0];
    expect(moved.end_at - moved.start_at).toBe(60 * 60);

    await run(taskTools.deleteBlock, { blockId: block.block.id });
    expect(listBlocks()).toHaveLength(0);
  });

  it('hands a task to the terminal by opening a session', async () => {
    const result = await run(taskTools.handToTerminal, {
      goal: 'Scaffold a React project',
    });
    expect(result.success).toBe(true);
    expect(typeof result.sessionId).toBe('string');
    expect(listTerminalSessions()).toHaveLength(1);
  });

  it('classifies exactly the gated tools as risky, derived not listed', () => {
    // The six `destructive` task verbs, unchanged from the old hand-maintained
    // set, plus the two `cost` indexing tools that are new intended behaviour.
    const gated = [...copilotTools]
      .filter((name) => isRiskyCopilotTool(name))
      .sort();

    expect(gated).toEqual(
      [
        'assignTaskToProject',
        'completeTask',
        'deleteBlock',
        'deleteTask',
        'indexFile',
        'indexPage',
        'moveBlock',
        'updateTask',
      ].sort(),
    );

    // Additive tools must never require approval.
    for (const additive of [
      'createTask',
      'createTasks',
      'addSteps',
      'scheduleBlock',
      'handToTerminal',
    ]) {
      expect(isRiskyCopilotTool(additive)).toBe(false);
    }
  });
});
