/**
 * lib/sequence.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The sequence model: what a plan is made of, when a step may fire, and — the
 * important one — when the runner must refuse to fire it.
 *
 * WHY THE RUNNER IS DETERMINISTIC AND SMALL
 * This is the piece that would be tempting to make agentic ("let the model decide
 * what to do next"), and the plan forbids it for a concrete reason: a control loop
 * an LLM drives is not replayable or auditable, and this system's entire value is
 * correspondence you can point at later. So the protocol is fixed — the steps below
 * are the whole vocabulary — and nothing here calls a model.
 *
 * WHY THE STALL RULE LOOKS THE WAY IT DOES
 * A sequence outlives the app. If a 14-day wait elapses while Qeda is closed, then on
 * next launch the step is overdue, and firing it silently would mean the app quietly
 * decided, while nobody was looking, that a legal deadline had passed. So:
 *
 *   A step may fire automatically only if it came due while the app was open.
 *
 * Concretely: `lastSeenAt` is the last instant the run was advanced. A step is
 * *stalled* when it came due strictly after that instant and is due now
 * (`lastSeenAt < not_before <= now`). Stalled steps are surfaced for the user to
 * confirm, one at a time, with their lateness shown — never auto-fired, and never
 * hidden. `lateSec` is recorded for every fired step either way, so the record
 * answers "was this done on time".
 *
 * Everything here is pure: it takes rows and a timestamp and returns a decision.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { addDays, type DeadlineClass } from './correspondence';

export type SequenceStepKind =
  /** Wait a number of days before the plan may continue. */
  | 'wait'
  /** Decide whether to carry on, based on what came back. */
  | 'branch'
  /** Create one chase task per recipient that went quiet. */
  | 'escalate'
  /** Create a single task (a filing, a phone call, a document to prepare). */
  | 'task'
  /** End the run. */
  | 'stop';

export type SequenceRunStatus = 'running' | 'completed' | 'stalled' | 'stopped';
export type SequenceStepRunStatus =
  | 'pending'
  | 'waiting'
  | 'stalled'
  | 'fired'
  | 'skipped';

/** What a branch step asks about. */
export type BranchCondition = 'replied' | 'no_response' | 'all_settled';

export interface SequenceStepConfig {
  /** wait: days to wait. */
  days?: number;
  /** branch: what to test. */
  on?: BranchCondition;
  /** escalate: days until the chase task is due. */
  dueInDays?: number;
  /** task: title and detail for the task this step creates. */
  title?: string;
  detail?: string;
  priority?: 1 | 2 | 3;
}

export interface SequenceStep {
  id: string;
  sequence_id: string;
  position: number;
  kind: SequenceStepKind;
  title: string;
  config_json: string;
}

export interface SequenceRun {
  id: string;
  sequence_id: string;
  project_id: string | null;
  message_id: string | null;
  status: SequenceRunStatus;
  current_step_id: string | null;
  last_seen_at: number | null;
  started_at: number;
  finished_at: number | null;
}

export interface SequenceStepRun {
  id: string;
  run_id: string;
  step_id: string;
  status: SequenceStepRunStatus;
  not_before: number | null;
  fired_at: number | null;
  late_sec: number | null;
  detail: string;
}

/** Parse a step's config, tolerating anything malformed rather than throwing. */
export function parseStepConfig(configJson: string): SequenceStepConfig {
  try {
    const parsed = JSON.parse(configJson);
    if (parsed && typeof parsed === 'object') {
      return parsed as SequenceStepConfig;
    }
  } catch {
    // A plan with a broken config line is a data problem, not a crash.
  }
  return {};
}

/**
 * When this step becomes eligible, given it is being reached now.
 *
 * Only `wait` defers; every other kind is due immediately. The result is always an
 * absolute timestamp — that is the property that makes a plan survive a restart.
 */
export function notBeforeFor(
  step: Pick<SequenceStep, 'kind' | 'config_json'>,
  now: number,
): number {
  if (step.kind !== 'wait') return now;
  const { days } = parseStepConfig(step.config_json);
  return addDays(now, Math.max(days ?? 0, 0));
}

/**
 * A step that came due more than a moment ago is late, and says so.
 *
 * The tolerance exists because every step is materialised with `not_before = now` at
 * the instant it is reached: without it, a plan's own first step would report itself
 * as late by the few seconds it took the read to happen.
 */
export const LATE_TOLERANCE_SEC = 60;

/**
 * Whether this step's window has already closed.
 *
 * NOTE what is deliberately absent: any test of whether the app was running when the
 * window closed. An earlier design tried to distinguish "elapsed while closed" from
 * "elapsed while open", and there is no honest way to do it — a read heartbeat cannot
 * tell a user who had the board open from one who did not. So the rule is uniform and
 * stronger: **a plan step is never fired unattended.** Every step is presented with
 * its due date and its lateness, and fired by exactly one explicit action. That
 * removes the failure mode the distinction was meant to catch (an app deciding on its
 * own that a legal deadline had passed) by removing the autonomy instead of trying to
 * detect the situation.
 */
export function stepIsLate(
  stepRun: Pick<SequenceStepRun, 'not_before'>,
  now: number,
): boolean {
  if (stepRun.not_before === null) return false;
  return now - stepRun.not_before > LATE_TOLERANCE_SEC;
}

/** How late a step is, in seconds. Zero when it is on time or early. */
export function latenessSeconds(
  stepRun: Pick<SequenceStepRun, 'not_before'>,
  now: number,
): number {
  if (stepRun.not_before === null) return 0;
  return Math.max(now - stepRun.not_before, 0);
}

// ─── Analysis ─────────────────────────────────────────────────────────────────

export type StepOutlook =
  /** Done, or a branch that decided not to continue. */
  | 'done'
  /** Waiting for its date. */
  | 'waiting'
  /** Its date passed while the app was closed — needs confirmation. */
  | 'stalled'
  /** Due, inside an open session. Safe to fire. */
  | 'due'
  /** Beyond the current step. */
  | 'upcoming';

export interface StepView {
  step: SequenceStep;
  stepRun: SequenceStepRun | null;
  outlook: StepOutlook;
  /** Absolute instant this step is (or was) due. */
  notBefore: number | null;
  lateSec: number;
  detail: string;
}

export interface RunAnalysis {
  currentStepId: string | null;
  /**
   * The next step that can be fired, if any. Nothing fires without an explicit
   * request naming this step, so this is a preview rather than a trigger.
   */
  actionable: StepView | null;
  /** Steps whose window already closed — fired only by explicit confirmation. */
  stalled: StepView[];
  waitingUntil: number | null;
  /** True when the plan has no further steps to take. */
  complete: boolean;
  steps: StepView[];
}

function describeOutlook(view: StepView): string {
  switch (view.outlook) {
    case 'done':
      return view.stepRun?.detail || 'Done';
    case 'waiting':
      return view.notBefore
        ? `Waiting until ${new Date(view.notBefore * 1000).toLocaleDateString()}`
        : 'Waiting';
    case 'stalled': {
      const days = Math.max(Math.round(view.lateSec / 86_400), 1);
      return `Its window closed ${days} day${days === 1 ? '' : 's'} ago`;
    }
    case 'due':
      return 'Ready now';
    default:
      return 'Not reached yet';
  }
}

/**
 * Where a run stands, from its rows and a timestamp.
 *
 * The outlook is computed from the step's *stored* `not_before` only. Nothing here
 * recomputes a date from a duration, which is what guarantees that a run means the
 * same thing after a restart as it did before one.
 */
export function analyzeRun(input: {
  run: Pick<SequenceRun, 'current_step_id' | 'status'>;
  steps: SequenceStep[];
  stepRuns: SequenceStepRun[];
  now: number;
}): RunAnalysis {
  const { run, steps, stepRuns, now } = input;
  const byStep = new Map(stepRuns.map((stepRun) => [stepRun.step_id, stepRun]));

  const ordered = [...steps].sort((a, b) => a.position - b.position);
  const views: StepView[] = ordered.map((step) => {
    const stepRun = byStep.get(step.id) ?? null;
    let outlook: StepOutlook = 'upcoming';

    if (stepRun) {
      if (stepRun.status === 'fired' || stepRun.status === 'skipped') {
        outlook = 'done';
      } else if (stepRun.status === 'waiting') {
        if (stepRun.not_before === null || stepRun.not_before > now) {
          outlook = 'waiting';
        } else {
          outlook = stepIsLate(stepRun, now) ? 'stalled' : 'due';
        }
      } else if (step.id === run.current_step_id) {
        outlook =
          stepRun.not_before !== null && stepRun.not_before > now
            ? 'waiting'
            : stepIsLate(stepRun, now)
              ? 'stalled'
              : 'due';
      } else {
        outlook = 'upcoming';
      }
    } else if (step.id === run.current_step_id && run.status === 'running') {
      outlook = 'due';
    } else if (
      run.current_step_id === null &&
      run.status === 'running' &&
      step === ordered[0]
    ) {
      // A freshly started run has no current step yet; its first step is the one.
      outlook = 'due';
    }

    const view: StepView = {
      step,
      stepRun,
      outlook,
      notBefore: stepRun?.not_before ?? null,
      lateSec: stepRun ? latenessSeconds(stepRun, now) : 0,
      detail: '',
    };
    view.detail = describeOutlook(view);
    return view;
  });

  const stalled = views.filter((view) => view.outlook === 'stalled');
  const due = views.find((view) => view.outlook === 'due') ?? null;
  const waiting = views.find((view) => view.outlook === 'waiting') ?? null;

  return {
    currentStepId: run.current_step_id,
    // The next unfinished step, late or not. This is a *description*, not a trigger:
    // nothing in this module fires a step, and the runner refuses any step the caller
    // does not name — so saying "this is the one the next click applies to" while the
    // step is late is exactly what lets the UI put the lateness next to the button
    // that would record it. A null here would mean the user has nothing to confirm,
    // which is the opposite of the case.
    actionable: due ?? stalled[0] ?? null,
    stalled,
    waitingUntil: waiting?.notBefore ?? null,
    complete:
      run.status === 'completed' ||
      run.status === 'stopped' ||
      views.every((view) => view.outlook === 'done'),
    steps: views,
  };
}

// ─── The worked template ──────────────────────────────────────────────────────

export interface SequenceTemplateStep {
  kind: SequenceStepKind;
  title: string;
  config: SequenceStepConfig;
}

/**
 * "Demand → escalation", the plan the founding project actually needs.
 *
 * Timeframes here are *suggestions in a form the user edits*, not jurisdiction rules
 * — the plan defers jurisdiction content (D1), and the runner stores whatever date
 * it is given rather than deriving one from a statute.
 */
export const DEMAND_THEN_ESCALATE: readonly SequenceTemplateStep[] = [
  {
    kind: 'wait',
    title: 'Wait 14 days for a reply',
    config: { days: 14 },
  },
  {
    kind: 'branch',
    title: 'Did everyone answer?',
    config: { on: 'all_settled' },
  },
  {
    kind: 'escalate',
    title: 'Chase whoever stayed quiet',
    config: { dueInDays: 3, priority: 1 },
  },
  {
    kind: 'wait',
    title: 'Wait 7 days for the chase',
    config: { days: 7 },
  },
  {
    kind: 'task',
    title: 'Review and decide the next step',
    config: {
      title: 'Decide next step on the dispute',
      detail:
        'The chase window has closed. Review what came back and decide whether to escalate further or close it out.',
      dueInDays: 2,
    },
  },
  { kind: 'stop', title: 'Plan complete', config: {} },
];

/** Class a plan derives its urgency from, when it creates tasks. */
export const SEQUENCE_DEFAULT_DEADLINE_CLASS: DeadlineClass = 'tactical';
