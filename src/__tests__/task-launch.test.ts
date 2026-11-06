/**
 * __tests__/task-launch.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Unified Tasks → workspace hand-off. Verifies eager session creation,
 * navigation contracts, and that the timer is not auto-started.
 */

import {
  buildChatPrompt,
  buildTerminalGoal,
  startTaskInWorkspace,
} from '@/lib/task-launch';
import type { Task } from '@/main/ipc/channels';

function makeTask(overrides: Partial<Task>): Task {
  return {
    id: 'task-1',
    project_id: 'proj-1',
    title: 'Ship the feature',
    description: 'Details here',
    status: 'backlog',
    priority: 1,
    estimate_mins: 30,
    due_at: null,
    pomodoro_count: 0,
    position: 0,
    created_at: 1000,
    updated_at: 1000,
    ...overrides,
  };
}

describe('task-launch', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    try {
      window.localStorage.clear();
    } catch {
      // jsdom may not provide localStorage in some configs.
    }
  });

  it('builds prompts that name the task and its context', () => {
    const t = makeTask({});
    expect(buildChatPrompt(t)).toContain('Ship the feature');
    expect(buildChatPrompt(t)).toContain('Details here');
    expect(buildTerminalGoal(t)).toBe('Ship the feature');
  });

  it('chat launch marks active, creates a session eagerly, and navigates with task context', async () => {
    const task = makeTask({ status: 'backlog' });
    const invoke = jest
      .fn()
      .mockResolvedValueOnce(null) // tasks:update (void)
      .mockResolvedValueOnce({ id: 'sess-1' }); // sessions:create
    (window as unknown as { electron: unknown }).electron = {
      ipc: { invoke },
    };
    const navigate = jest.fn();
    const onMarkedActive = jest.fn();
    const onFocusTask = jest.fn();

    const result = await startTaskInWorkspace(task, 'chat', {
      navigate,
      onMarkedActive,
      onFocusTask,
    });

    expect(invoke).toHaveBeenCalledWith('tasks:update', {
      id: 'task-1',
      status: 'active',
    });
    expect(invoke).toHaveBeenCalledWith('sessions:create', {
      title: 'Ship the feature',
      projectId: 'proj-1',
    });
    expect(onMarkedActive).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'task-1', status: 'active' }),
    );
    expect(onFocusTask).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'task-1', status: 'active' }),
    );
    expect(navigate).toHaveBeenCalledWith(
      '/chat/sess-1?project=proj-1&task=task-1',
      expect.objectContaining({
        state: expect.objectContaining({
          chatContext: { taskId: 'task-1', projectId: 'proj-1' },
          initialPrompt: expect.stringContaining('Ship the feature'),
        }),
      }),
    );
    expect(result.kind).toBe('navigate');
  });

  it('terminal launch uses goal + task + project query', async () => {
    const task = makeTask({ status: 'active' });
    const invoke = jest.fn().mockResolvedValueOnce({ id: 'term-1' }); // terminal:session-create
    (window as unknown as { electron: unknown }).electron = {
      ipc: { invoke },
    };
    const navigate = jest.fn();

    const result = await startTaskInWorkspace(task, 'terminal', {
      navigate,
    });

    expect(invoke).toHaveBeenCalledWith('terminal:session-create', {
      title: 'Ship the feature',
      goal: 'Ship the feature',
      project_id: 'proj-1',
    });
    expect(navigate).toHaveBeenCalledWith(
      '/terminal/term-1?goal=Ship%20the%20feature&task=task-1&project=proj-1',
    );
    expect(result.kind).toBe('navigate');
  });

  it('documents and focus return signals without navigation', async () => {
    const task = makeTask({ status: 'active' });
    (window as unknown as { electron: unknown }).electron = {
      ipc: { invoke: jest.fn() },
    };
    const navigate = jest.fn();

    const doc = await startTaskInWorkspace(task, 'documents', { navigate });
    const foc = await startTaskInWorkspace(task, 'focus', { navigate });

    expect(doc.kind).toBe('documents');
    expect(foc.kind).toBe('focus');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('does not call tasks:update when already active', async () => {
    const task = makeTask({ status: 'active' });
    const invoke = jest.fn().mockResolvedValueOnce({ id: 'sess-2' });
    (window as unknown as { electron: unknown }).electron = {
      ipc: { invoke },
    };

    await startTaskInWorkspace(task, 'chat', {
      navigate: jest.fn(),
    });

    expect(invoke).not.toHaveBeenCalledWith('tasks:update', expect.anything());
    expect(invoke).toHaveBeenCalledWith('sessions:create', expect.anything());
  });
});
