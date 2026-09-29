/**
 * __tests__/task-recommendations.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Unit tests for the pure "Next Best Move" momentum recommendation engine.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { getNextBestMove } from '@/lib/task-recommendations';
import type { Task } from '@/main/ipc/channels';

function makeTask(overrides: Partial<Task>): Task {
  return {
    id: 't-1',
    // `Task['project_id']` is non-nullable (the DB always stores the Inbox), but
    // this fixture exercises the "no project" path, so the null is forced past the
    // type. The runtime value under test is unchanged.
    project_id: null as unknown as string,
    title: 'Sample task',
    description: '',
    status: 'backlog',
    priority: 2,
    estimate_mins: 30,
    due_at: null,
    pomodoro_count: 0,
    position: 0,
    created_at: 1000,
    updated_at: 1000,
    ...overrides,
  };
}

describe('getNextBestMove', () => {
  it('returns empty recommendation when task list is empty', () => {
    const res = getNextBestMove({ tasks: [] });
    expect(res.task).toBeNull();
    expect(res.totalCandidates).toBe(0);
    expect(res.rationale).toMatch(/backlog is empty/i);
  });

  it('ignores active or done tasks, focusing only on backlog candidates', () => {
    const tasks: Task[] = [
      makeTask({ id: 'done-1', status: 'done', priority: 1 }),
      makeTask({ id: 'active-1', status: 'active', priority: 1 }),
    ];
    const res = getNextBestMove({ tasks });
    expect(res.task).toBeNull();
    expect(res.totalCandidates).toBe(0);
  });

  it('prioritizes P1 tasks over P2 and P3 tasks', () => {
    const p3 = makeTask({ id: 't-p3', priority: 3, estimate_mins: 60 });
    const p2 = makeTask({ id: 't-p2', priority: 2, estimate_mins: 60 });
    const p1 = makeTask({ id: 't-p1', priority: 1, estimate_mins: 60 });

    const res = getNextBestMove({ tasks: [p3, p2, p1] });
    expect(res.task?.id).toBe('t-p1');
    expect(res.totalCandidates).toBe(3);
    expect(res.rationale).toContain('High priority');
  });

  it('prefers quick wins (<= 15m) when priorities are identical', () => {
    const p2Long = makeTask({ id: 'p2-long', priority: 2, estimate_mins: 60 });
    const p2Quick = makeTask({
      id: 'p2-quick',
      priority: 2,
      estimate_mins: 15,
    });

    const res = getNextBestMove({ tasks: [p2Long, p2Quick] });
    expect(res.task?.id).toBe('p2-quick');
    expect(res.rationale).toContain('Quick Win (15m)');
  });

  it('rewards tasks with partial sub-step progress to sustain momentum', () => {
    const taskA = makeTask({ id: 'task-a', priority: 2, estimate_mins: 45 });
    const taskB = makeTask({ id: 'task-b', priority: 2, estimate_mins: 45 });

    const stepProgress = {
      'task-b': { total: 4, done: 2 },
    };

    const res = getNextBestMove({ tasks: [taskA, taskB], stepProgress });
    expect(res.task?.id).toBe('task-b');
    expect(res.rationale).toContain('Momentum ready: 2/4');
  });

  it('boosts overdue tasks with urgent rationale', () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const regular = makeTask({ id: 'reg', priority: 2, estimate_mins: 30 });
    const overdue = makeTask({
      id: 'overdue',
      priority: 2,
      estimate_mins: 30,
      due_at: nowSec - 3600, // 1 hour ago
    });

    const res = getNextBestMove({ tasks: [regular, overdue] });
    expect(res.task?.id).toBe('overdue');
    expect(res.rationale).toMatch(/Urgent: overdue/i);
  });

  it('cycles deterministically through candidates when shuffleIndex increments', () => {
    const t1 = makeTask({ id: 't1', priority: 1 });
    const t2 = makeTask({ id: 't2', priority: 2 });
    const t3 = makeTask({ id: 't3', priority: 3 });

    const rec0 = getNextBestMove({ tasks: [t1, t2, t3], shuffleIndex: 0 });
    const rec1 = getNextBestMove({ tasks: [t1, t2, t3], shuffleIndex: 1 });
    const rec2 = getNextBestMove({ tasks: [t1, t2, t3], shuffleIndex: 2 });
    const rec3 = getNextBestMove({ tasks: [t1, t2, t3], shuffleIndex: 3 });

    expect(rec0.task?.id).toBe('t1');
    expect(rec1.task?.id).toBe('t2');
    expect(rec2.task?.id).toBe('t3');
    // Wraps around
    expect(rec3.task?.id).toBe('t1');
  });
});
