/**
 * __tests__/workspace-suggestion.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Deterministic suggestion heuristic for the WorkspacePicker.
 */

import { getSuggestedWorkspace } from '@/lib/workspace-suggestion';
import type { Task } from '@/main/ipc/channels';

function makeTask(overrides: Partial<Task>): Task {
  return {
    id: 't-1',
    project_id: 'inbox',
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

describe('getSuggestedWorkspace', () => {
  it('suggests builder for code work', () => {
    const res = getSuggestedWorkspace(
      makeTask({ title: 'Fix react component bug in API endpoint' }),
    );
    expect(res.workspace).toBe('builder');
  });

  it('suggests terminal for shell / ops work', () => {
    const res = getSuggestedWorkspace(
      makeTask({ title: 'Deploy script and run tests' }),
    );
    expect(res.workspace).toBe('terminal');
  });

  it('suggests documents for written deliverables', () => {
    const res = getSuggestedWorkspace(
      makeTask({ title: 'Draft invoice letter for client' }),
    );
    expect(res.workspace).toBe('documents');
  });

  it('suggests chat for research / planning', () => {
    const res = getSuggestedWorkspace(
      makeTask({ title: 'Research competitors and plan strategy' }),
    );
    expect(res.workspace).toBe('chat');
  });

  it('defaults to chat when keywords are absent', () => {
    const res = getSuggestedWorkspace(makeTask({ title: 'Buy groceries' }));
    expect(res.workspace).toBe('chat');
    expect(res.rationale).toMatch(/plan/i);
  });

  it('builder wins over terminal when both match', () => {
    const res = getSuggestedWorkspace(
      makeTask({ title: 'Fix code and run tests' }),
    );
    // Builder is checked first: code intent should route to Builder.
    expect(res.workspace).toBe('builder');
  });
});
