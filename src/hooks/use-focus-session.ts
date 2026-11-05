/**
 * hooks/use-focus-session.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * React binding for the app-wide focus store.
 *
 * A single hook rather than a context: the store already provides subscription
 * granularity, and a context value that changes every second would re-render
 * every consumer.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useFocusStore } from '@/stores/focus-store';
import { presetAt } from '@/lib/focus/presets';
import { focusProgress } from '@/lib/focus/timer';

export function useFocusSession() {
  const focusedTask = useFocusStore((s) => s.focusedTask);
  const displayMode = useFocusStore((s) => s.displayMode);
  const presetIndex = useFocusStore((s) => s.presetIndex);
  const timer = useFocusStore((s) => s.timer);
  const startFocus = useFocusStore((s) => s.startFocus);
  const setFocusedTask = useFocusStore((s) => s.setFocusedTask);
  const setDisplayMode = useFocusStore((s) => s.setDisplayMode);
  const setPresetIndex = useFocusStore((s) => s.setPresetIndex);
  const start = useFocusStore((s) => s.start);
  const pause = useFocusStore((s) => s.pause);
  const reset = useFocusStore((s) => s.reset);
  const skip = useFocusStore((s) => s.skip);
  const clearFocus = useFocusStore((s) => s.clearFocus);

  return {
    focusedTask,
    displayMode,
    presetIndex,
    preset: presetAt(presetIndex),
    timer,
    progress: focusProgress(timer),
    startFocus,
    setFocusedTask,
    setDisplayMode,
    setPresetIndex,
    start,
    pause,
    reset,
    skip,
    clearFocus,
  };
}

export type FocusSession = ReturnType<typeof useFocusSession>;
