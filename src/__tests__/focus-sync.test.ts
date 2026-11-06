/**
 * __tests__/focus-sync.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * focus-store is the timer owner; app-store is the derived Chat/Terminal
 * context. Starting or clearing focus must mirror into app-store so Chat's
 * task badge and Terminal goal context stay in step with the timer.
 */

import { useFocusStore } from '../stores/focus-store';
import { useAppStore } from '../stores/app-store';
import type { Task } from '../main/ipc/channels';

const TASK: Task = {
  id: 'task-1',
  project_id: 'inbox',
  title: 'Write executive summary',
  description: '',
  status: 'active',
  priority: 1,
  position: 0,
  estimate_mins: 25,
  due_at: null,
  pomodoro_count: 0,
  created_at: 1000,
  updated_at: 1000,
};

beforeEach(() => {
  useFocusStore.setState({
    focusedTask: null,
    displayMode: 'closed',
    presetIndex: 0,
    lastEvent: null,
  });
  useAppStore.setState({ focusedTask: null, focusedTaskId: null });
});

describe('focus → app-store sync', () => {
  it('mirrors startFocus into app-store', () => {
    useFocusStore.getState().startFocus(TASK);
    expect(useFocusStore.getState().focusedTask?.id).toBe('task-1');
    expect(useAppStore.getState().focusedTask?.id).toBe('task-1');
    expect(useAppStore.getState().focusedTaskId).toBe('task-1');
  });

  it('clears both stores on clearFocus', () => {
    useFocusStore.getState().startFocus(TASK);
    useFocusStore.getState().clearFocus();
    expect(useFocusStore.getState().focusedTask).toBeNull();
    expect(useAppStore.getState().focusedTask).toBeNull();
    expect(useAppStore.getState().focusedTaskId).toBeNull();
  });

  it('setFocusedTask mirrors without opening the modal', () => {
    useFocusStore.getState().setFocusedTask(TASK);
    expect(useFocusStore.getState().focusedTask?.id).toBe('task-1');
    expect(useFocusStore.getState().displayMode).toBe('closed');
    expect(useAppStore.getState().focusedTask?.id).toBe('task-1');
  });
});
