/**
 * lib/focus/timer.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The focus phase machine, with no React and no interval.
 *
 * It was extracted from `hooks/use-focus-timer.ts` when focus moved app-wide:
 * the store owns one ticker, and the state transitions are pure so they can be
 * tested without fake timers. It briefly left `use-focus-timer.ts` behind as an adapter; that hook is gone now and the store is the only consumer.
 * callers that still want a local timer.
 * ─────────────────────────────────────────────────────────────────────────────
 */

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

export interface TimerDurations {
  workSec: number;
  breakSec: number;
}

export interface TickResult {
  state: FocusTimerState;
  complete: PhaseCompleteInfo | null;
}

const safeSeconds = (value: number) => Math.max(1, Math.round(value));

export function durationsFromMinutes(workMins: number, breakMins: number): TimerDurations {
  return {
    workSec: safeSeconds(workMins * 60),
    breakSec: safeSeconds(breakMins * 60),
  };
}

export function initialTimerState(workSec: number): FocusTimerState {
  return {
    phase: 'idle',
    secondsLeft: workSec,
    running: false,
    completed: 0,
    phaseTotal: workSec,
  };
}

/** Begin the idle phase, or resume a paused one without resetting its clock. */
export function startTimer(
  state: FocusTimerState,
  durations: TimerDurations,
): FocusTimerState {
  if (state.running) return state;
  const startingWork = state.phase === 'idle';
  return {
    ...state,
    phase: startingWork ? 'work' : state.phase,
    secondsLeft: startingWork ? durations.workSec : state.secondsLeft,
    phaseTotal: startingWork ? durations.workSec : state.phaseTotal,
    running: true,
  };
}

export function pauseTimer(state: FocusTimerState): FocusTimerState {
  return { ...state, running: false };
}

export function resetTimer(
  state: FocusTimerState,
  durations: TimerDurations,
): FocusTimerState {
  return {
    phase: 'idle',
    secondsLeft: durations.workSec,
    running: false,
    completed: state.completed,
    phaseTotal: durations.workSec,
  };
}

function nextPhaseState(
  state: FocusTimerState,
  durations: TimerDurations,
): FocusTimerState {
  if (state.phase === 'work') {
    return {
      phase: 'break',
      secondsLeft: durations.breakSec,
      running: false,
      completed: state.completed + 1,
      phaseTotal: durations.breakSec,
    };
  }
  return {
    phase: 'work',
    secondsLeft: durations.workSec,
    running: false,
    completed: state.completed,
    phaseTotal: durations.workSec,
  };
}

/**
 * One second of wall clock. `complete` is returned rather than broadcast so the
 * caller decides what a finished phase means (persist, notify, score, pause
 * music) in exactly one place.
 */
export function tickTimer(state: FocusTimerState, durations: TimerDurations): TickResult {
  if (!state.running) return { state, complete: null };
  if (state.secondsLeft > 1) {
    return {
      state: { ...state, secondsLeft: state.secondsLeft - 1 },
      complete: null,
    };
  }
  const complete: PhaseCompleteInfo = {
    phase: state.phase === 'break' ? 'break' : 'work',
    plannedSec: state.phaseTotal,
    actualSec: state.phaseTotal,
    completed: true,
  };
  return { state: nextPhaseState(state, durations), complete };
}

/** End the current phase immediately; recorded as not completed. */
export function skipTimer(state: FocusTimerState, durations: TimerDurations): TickResult {
  if (state.phase === 'idle') return { state, complete: null };
  const complete: PhaseCompleteInfo = {
    phase: state.phase,
    plannedSec: state.phaseTotal,
    actualSec: Math.max(0, state.phaseTotal - state.secondsLeft),
    completed: false,
  };
  return { state: nextPhaseState(state, durations), complete };
}

export function focusProgress(state: FocusTimerState): number {
  if (state.phaseTotal <= 0) return 0;
  return Math.min(1, Math.max(0, 1 - state.secondsLeft / state.phaseTotal));
}
