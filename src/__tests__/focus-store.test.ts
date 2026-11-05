/**
 * __tests__/focus-store.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The app-wide focus machine.
 *
 * Phase 1 extracted this out of `Tasks.tsx`, where a bad transition was hidden
 * behind a page that owned the interval. The point of these tests is that the
 * *store* reports a finished phase exactly once: `FocusRuntime` consumes
 * `lastEvent` to persist a session, award XP and notify the OS, so a duplicate
 * event means duplicate XP and duplicate notifications.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useFocusStore } from '../stores/focus-store';
import { durationsFromMinutes } from '../lib/focus/timer';
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

const WORK_SEC = 25 * 60;

function resetStore(): void {
  useFocusStore.setState({
    focusedTask: null,
    displayMode: 'closed',
    presetIndex: 0,
    timer: {
      phase: 'idle',
      secondsLeft: WORK_SEC,
      running: false,
      completed: 0,
      phaseTotal: WORK_SEC,
    },
    lastEvent: null,
  });
}

beforeEach(resetStore);

describe('focus store', () => {
  it('starts a session idle at the preset length', () => {
    useFocusStore.getState().startFocus(TASK);
    const state = useFocusStore.getState();

    expect(state.focusedTask?.id).toBe(TASK.id);
    expect(state.displayMode).toBe('modal');
    expect(state.timer).toEqual({
      phase: 'idle',
      secondsLeft: WORK_SEC,
      running: false,
      completed: 0,
      phaseTotal: WORK_SEC,
    });
  });

  it('pauses without losing the countdown and resumes from it', () => {
    const store = useFocusStore.getState();
    store.startFocus(TASK);
    store.start();
    useFocusStore.setState((state) => ({
      timer: { ...state.timer, secondsLeft: 1200 },
    }));

    useFocusStore.getState().pause();
    expect(useFocusStore.getState().timer.running).toBe(false);
    expect(useFocusStore.getState().tick()).toBeNull();
    expect(useFocusStore.getState().timer.secondsLeft).toBe(1200);

    useFocusStore.getState().start();
    expect(useFocusStore.getState().timer.running).toBe(true);
    expect(useFocusStore.getState().timer.secondsLeft).toBe(1200);

    useFocusStore.getState().tick();
    expect(useFocusStore.getState().timer.secondsLeft).toBe(1199);
  });

  it('reports a completed work phase once, then advances to a paused break', () => {
    useFocusStore.getState().startFocus(TASK);
    useFocusStore.getState().start();
    useFocusStore.setState((state) => ({
      timer: { ...state.timer, secondsLeft: 1 },
    }));

    const event = useFocusStore.getState().tick();

    expect(event).toEqual({
      phase: 'work',
      plannedSec: WORK_SEC,
      actualSec: WORK_SEC,
      completed: true,
    });
    const after = useFocusStore.getState();
    expect(after.timer).toMatchObject({
      phase: 'break',
      running: false,
      completed: 1,
      secondsLeft: durationsFromMinutes(25, 5).breakSec,
    });
    expect(after.lastEvent).toEqual(event);

    // The runtime consumes the event; a second tick must not re-report it.
    after.consumeEvent();
    expect(useFocusStore.getState().lastEvent).toBeNull();
    expect(useFocusStore.getState().tick()).toBeNull();
  });

  it('records a skipped phase as incomplete and still counts the pomodoro', () => {
    useFocusStore.getState().startFocus(TASK);
    useFocusStore.getState().start();
    useFocusStore.setState((state) => ({
      timer: { ...state.timer, secondsLeft: 1200 },
    }));

    const event = useFocusStore.getState().skip();

    expect(event).toEqual({
      phase: 'work',
      plannedSec: WORK_SEC,
      actualSec: 300,
      completed: false,
    });
    expect(useFocusStore.getState().timer).toMatchObject({
      phase: 'break',
      completed: 1,
      running: false,
    });
  });

  it('changing the preset resets the clock but keeps the focused task', () => {
    useFocusStore.getState().startFocus(TASK);
    useFocusStore.getState().setPresetIndex(1);

    const state = useFocusStore.getState();
    expect(state.focusedTask?.id).toBe(TASK.id);
    expect(state.timer).toMatchObject({
      phase: 'idle',
      secondsLeft: 50 * 60,
      phaseTotal: 50 * 60,
      running: false,
    });
  });

  it('clamps degenerate preset durations to at least one second', () => {
    expect(durationsFromMinutes(0, -5)).toEqual({ workSec: 1, breakSec: 1 });
  });
});
