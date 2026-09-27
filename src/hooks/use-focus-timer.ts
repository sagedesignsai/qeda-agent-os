/**
 * hooks/use-focus-timer.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * A pomodoro/flow interval timer with no UI opinions.
 *
 * The hook owns the countdown and phase machine (idle → work → break → work …)
 * and reports every finished phase through `onPhaseComplete`. Persisting the
 * session, playing a sound, or showing a toast are the caller's job — which is
 * what keeps this hook testable and the focus view uncluttered.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export type FocusPhase = 'idle' | 'work' | 'break';

export interface FocusTimerState {
  phase: FocusPhase;
  secondsLeft: number;
  running: boolean;
  /** Work phases completed this session. */
  completed: number;
  /** Total seconds of the current phase (for progress). */
  phaseTotal: number;
}

export interface PhaseCompleteInfo {
  phase: 'work' | 'break';
  plannedSec: number;
  /** Seconds actually elapsed before the phase ended. */
  actualSec: number;
  /** True when the phase ran all the way to zero. */
  completed: boolean;
}

export interface UseFocusTimerOptions {
  /** Resets the timer whenever this changes. */
  taskId: string | null;
  workMins?: number;
  breakMins?: number;
  onPhaseComplete?: (info: PhaseCompleteInfo) => void;
}

export interface UseFocusTimerReturn {
  state: FocusTimerState;
  /** 0–1 progress through the current phase. */
  progress: number;
  start: () => void;
  pause: () => void;
  reset: () => void;
  /** End the current phase immediately (recorded as not completed). */
  skip: () => void;
}

export function useFocusTimer({
  taskId,
  workMins = 25,
  breakMins = 5,
  onPhaseComplete,
}: UseFocusTimerOptions): UseFocusTimerReturn {
  const workSec = Math.max(1, Math.round(workMins * 60));
  const breakSec = Math.max(1, Math.round(breakMins * 60));

  const [state, setState] = useState<FocusTimerState>(() => ({
    phase: 'idle',
    secondsLeft: workSec,
    running: false,
    completed: 0,
    phaseTotal: workSec,
  }));

  // Keep the latest callback without re-arming the interval each render.
  const callbackRef = useRef(onPhaseComplete);
  useEffect(() => {
    callbackRef.current = onPhaseComplete;
  }, [onPhaseComplete]);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const clear = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // A new task is a fresh session.
  useEffect(() => {
    clear();
    setState({
      phase: 'idle',
      secondsLeft: workSec,
      running: false,
      completed: 0,
      phaseTotal: workSec,
    });
  }, [taskId, workSec, clear]);

  useEffect(() => {
    if (!state.running) {
      clear();
      return;
    }

    intervalRef.current = setInterval(() => {
      setState((prev) => {
        if (prev.secondsLeft > 1) {
          return { ...prev, secondsLeft: prev.secondsLeft - 1 };
        }

        clear();
        const planned = prev.phaseTotal;
        callbackRef.current?.({
          phase: prev.phase === 'break' ? 'break' : 'work',
          plannedSec: planned,
          actualSec: planned,
          completed: true,
        });

        if (prev.phase === 'work') {
          return {
            phase: 'break',
            secondsLeft: breakSec,
            running: false,
            completed: prev.completed + 1,
            phaseTotal: breakSec,
          };
        }
        return {
          phase: 'work',
          secondsLeft: workSec,
          running: false,
          completed: prev.completed,
          phaseTotal: workSec,
        };
      });
    }, 1000);

    return clear;
  }, [state.running, breakSec, workSec, clear]);

  const start = useCallback(() => {
    setState((prev) => {
      if (prev.running) return prev;
      const startingWork = prev.phase === 'idle';
      return {
        ...prev,
        phase: startingWork ? 'work' : prev.phase,
        secondsLeft: startingWork ? workSec : prev.secondsLeft,
        phaseTotal: startingWork ? workSec : prev.phaseTotal,
        running: true,
      };
    });
  }, [workSec]);

  const pause = useCallback(() => {
    setState((prev) => ({ ...prev, running: false }));
  }, []);

  const reset = useCallback(() => {
    clear();
    setState((prev) => ({
      phase: 'idle',
      secondsLeft: workSec,
      running: false,
      completed: prev.completed,
      phaseTotal: workSec,
    }));
  }, [clear, workSec]);

  const skip = useCallback(() => {
    setState((prev) => {
      if (prev.phase === 'idle') return prev;
      clear();
      callbackRef.current?.({
        phase: prev.phase,
        plannedSec: prev.phaseTotal,
        actualSec: Math.max(0, prev.phaseTotal - prev.secondsLeft),
        completed: false,
      });
      if (prev.phase === 'work') {
        return {
          phase: 'break',
          secondsLeft: breakSec,
          running: false,
          completed: prev.completed,
          phaseTotal: breakSec,
        };
      }
      return {
        phase: 'work',
        secondsLeft: workSec,
        running: false,
        completed: prev.completed,
        phaseTotal: workSec,
      };
    });
  }, [breakSec, clear, workSec]);

  const progress =
    state.phaseTotal > 0
      ? Math.min(1, Math.max(0, 1 - state.secondsLeft / state.phaseTotal))
      : 0;

  return { state, progress, start, pause, reset, skip };
}
