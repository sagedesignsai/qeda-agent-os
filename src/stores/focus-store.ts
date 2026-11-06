/**
 * stores/focus-store.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The app-wide focus session. This used to live inside `Tasks.tsx`, which meant
 * navigating to Chat silently killed the pomodoro.
 *
 * The store owns state and transitions only. Persisting a phase, awarding XP,
 * sending a notification and pausing music all happen in `FocusRuntime`, because
 * those are effects and the store must stay usable from a test that has no
 * renderer.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { create } from 'zustand';
import type { Task } from '@/main/ipc/channels';
import { useAppStore } from '@/stores/app-store';
import { presetAt } from '@/lib/focus/presets';
import {
  durationsFromMinutes,
  focusProgress,
  initialTimerState,
  pauseTimer,
  resetTimer,
  skipTimer,
  startTimer,
  tickTimer,
  type FocusTimerState,
  type PhaseCompleteInfo,
} from '@/lib/focus/timer';

export type FocusDisplayMode = 'modal' | 'floating' | 'closed';

interface FocusStoreState {
  focusedTask: Task | null;
  displayMode: FocusDisplayMode;
  presetIndex: number;
  timer: FocusTimerState;
  /**
   * The most recent finished phase. The runtime consumes it and clears it;
   * keeping it here (rather than making `tick` fire a callback) is what lets
   * the store stay free of IPC, audio and notification side effects.
   */
  lastEvent: PhaseCompleteInfo | null;

  startFocus: (task: Task) => void;
  setFocusedTask: (task: Task | null) => void;
  setDisplayMode: (mode: FocusDisplayMode) => void;
  setPresetIndex: (index: number) => void;
  start: () => void;
  pause: () => void;
  reset: () => void;
  skip: () => PhaseCompleteInfo | null;
  tick: () => PhaseCompleteInfo | null;
  consumeEvent: () => void;
  clearFocus: () => void;
}

function durationsFor(presetIndex: number) {
  const preset = presetAt(presetIndex);
  return durationsFromMinutes(preset.work, preset.break);
}

export const useFocusStore = create<FocusStoreState>((set, get) => ({
  focusedTask: null,
  displayMode: 'closed',
  presetIndex: 0,
  timer: initialTimerState(durationsFor(0).workSec),
  lastEvent: null,

  startFocus: (task) => {
    const presetIndex = get().presetIndex;
    const durations = durationsFor(presetIndex);
    set({
      focusedTask: task,
      displayMode: 'modal',
      timer: initialTimerState(durations.workSec),
      lastEvent: null,
    });
    // Mirror into the cross-feature store so Chat/Terminal read the same
    // task without a second fetch. focus-store owns the timer/display;
    // app-store is the derived chat/terminal context.
    useAppStore.setState({
      focusedTask: task,
      focusedTaskId: task?.id ?? null,
    });
  },

  setFocusedTask: (task) => {
    set({ focusedTask: task });
    if (!task) set({ displayMode: 'closed' });
    useAppStore.setState({
      focusedTask: task,
      focusedTaskId: task?.id ?? null,
    });
  },

  setDisplayMode: (displayMode) => set({ displayMode }),

  setPresetIndex: (presetIndex) => {
    const durations = durationsFor(presetIndex);
    set({
      presetIndex,
      timer: initialTimerState(durations.workSec),
    });
  },

  start: () => {
    set({ timer: startTimer(get().timer, durationsFor(get().presetIndex)) });
  },

  pause: () => set({ timer: pauseTimer(get().timer) }),

  reset: () => {
    set({ timer: resetTimer(get().timer, durationsFor(get().presetIndex)) });
  },

  skip: () => {
    const result = skipTimer(get().timer, durationsFor(get().presetIndex));
    set({ timer: result.state, lastEvent: result.complete });
    return result.complete;
  },

  tick: () => {
    const result = tickTimer(get().timer, durationsFor(get().presetIndex));
    if (result.complete || result.state !== get().timer) {
      set({
        timer: result.state,
        ...(result.complete ? { lastEvent: result.complete } : {}),
      });
    }
    return result.complete;
  },

  consumeEvent: () => set({ lastEvent: null }),

  clearFocus: () => {
    const durations = durationsFor(get().presetIndex);
    set({
      focusedTask: null,
      displayMode: 'closed',
      timer: initialTimerState(durations.workSec),
      lastEvent: null,
    });
    useAppStore.setState({ focusedTask: null, focusedTaskId: null });
  },
}));

/** Convenience selector; the store keeps the timer in one object. */
export function selectFocusProgress(state: FocusStoreState): number {
  return focusProgress(state.timer);
}

export function selectDurations(state: FocusStoreState) {
  return durationsFor(state.presetIndex);
}
