/**
 * db/sequences.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Storage and the runner for plans: wait → chase → escalate → decide.
 *
 * WHAT THIS RUNNER IS, AND WHAT IT REFUSES TO BE
 * It is deterministic: a step is fired, or it is not, by rules that are written
 * down (`lib/sequence.ts`) and replayable from the rows. It is session-driven —
 * `advanceRun` is called while the user is present — and it deliberately does not
 * try to be a background scheduler, because the honest version of that is a tick
 * loop with retry, backoff and an idempotent send ledger, which is Phase 6 work.
 *
 * It also refuses, structurally, to lie on the user's behalf. A step whose window
 * elapsed while the app was closed (`lastSeenAt < not_before <= now`) is never fired
 * automatically: it is marked stalled, reported with its lateness, and left for the
 * user to confirm. "The app quietly decided a legal deadline had passed" is the one
 * failure mode a correspondence system cannot recover from.
 *
 * Every advance stamps `last_seen_at`, so the un-watched gap is always measurable
 * rather than guessed at.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { randomUUID } from 'node:crypto';
import { getDb } from './client.js';
import { escalateRecipients } from './messages.js';
import { createTask } from './tasks.js';
import {
  analyzeRun,
  notBeforeFor,
  parseStepConfig,
  type RunAnalysis,
  type SequenceRun,
  type SequenceRunStatus,
  type SequenceStep,
  type SequenceStepConfig,
  type SequenceStepKind,
  type SequenceStepRun,
} from '../../lib/sequence.js';

export interface Sequence {
  id: string;
  project_id: string | null;
  name: string;
  description: string;
  created_at: number;
  updated_at: number;
}

export interface SequenceDetail extends Sequence {
  steps: SequenceStep[];
}

export interface SequenceRunDetail {
  run: SequenceRun;
  analysis: RunAnalysis;
  /** Recipients still awaiting a reply on the run's message. */
  awaitingRecipientIds: string[];
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

// ─── Sequences ────────────────────────────────────────────────────────────────

export function createSequence(input: {
  projectId?: string | null;
  name: string;
  description?: string;
  steps: Array<{
    kind: SequenceStepKind;
    title: string;
    config?: SequenceStepConfig;
  }>;
}): SequenceDetail {
  const db = getDb();
  const id = randomUUID();

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO sequences (id, project_id, name, description)
       VALUES (?, ?, ?, ?)`,
    ).run(id, input.projectId ?? null, input.name, input.description ?? '');

    input.steps.forEach((step, index) => {
      db.prepare(
        `INSERT INTO sequence_steps (id, sequence_id, position, kind, title, config_json)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(
        randomUUID(),
        id,
        index,
        step.kind,
        step.title,
        JSON.stringify(step.config ?? {}),
      );
    });
  });

  tx();
  return getSequence(id)!;
}

export function getSequence(id: string): SequenceDetail | null {
  const db = getDb();
  const sequence = db
    .prepare<[string], Sequence>('SELECT * FROM sequences WHERE id = ?')
    .get(id);
  if (!sequence) return null;
  const steps = db
    .prepare<[string], SequenceStep>(
      'SELECT * FROM sequence_steps WHERE sequence_id = ? ORDER BY position',
    )
    .all(id);
  return { ...sequence, steps };
}

export function listSequences(projectId?: string | null): SequenceDetail[] {
  const db = getDb();
  const sequences = (
    projectId
      ? db
          .prepare<[string], Sequence>(
            'SELECT * FROM sequences WHERE project_id = ? ORDER BY lower(name)',
          )
          .all(projectId)
      : db.prepare<[], Sequence>('SELECT * FROM sequences ORDER BY lower(name)').all()
  ) as Sequence[];
  return sequences.map((sequence) => getSequence(sequence.id)!);
}

// ─── Runs ─────────────────────────────────────────────────────────────────────

/**
 * Start a plan against a dispatched message.
 *
 * The run's steps are materialised up front as `sequence_step_runs`, one per step, so
 * the run's whole schedule is visible immediately — including the waits that have not
 * begun. That is what lets the UI say "waiting until the 29th" rather than "step 3 of
 * 6", and it is why a run can be inspected after a restart without replaying history.
 *
 * Only the first step is given a `not_before`; each subsequent step's clock is set
 * when it is reached, because "14 days from when the letter went out" and "14 days
 * from when the last chase went out" are different dates.
 */
export function startRun(input: {
  sequenceId: string;
  messageId: string;
  projectId?: string | null;
  /** When the plan started. Defaults to now; explicit so a caller can record a plan
   *  begun earlier, and so the schedule is testable without waiting 14 days. */
  startedAt?: number;
}): SequenceRunDetail {
  const db = getDb();
  const sequence = getSequence(input.sequenceId);
  if (!sequence) throw new Error('That plan no longer exists');
  if (sequence.steps.length === 0) throw new Error('That plan has no steps');

  const runId = randomUUID();
  const now = input.startedAt ?? nowSeconds();
  const first = sequence.steps[0];

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO sequence_runs
         (id, sequence_id, project_id, message_id, status, current_step_id, last_seen_at, started_at)
       VALUES (?, ?, ?, ?, 'running', ?, ?, ?)`,
    ).run(
      runId,
      sequence.id,
      input.projectId ?? sequence.project_id,
      input.messageId,
      first.id,
      now,
      now,
    );

    for (const step of sequence.steps) {
      const isFirst = step.id === first.id;
      db.prepare(
        `INSERT INTO sequence_step_runs (id, run_id, step_id, status, not_before, detail)
         VALUES (?, ?, ?, ?, ?, '')`,
      ).run(
        randomUUID(),
        runId,
        step.id,
        isFirst ? 'waiting' : 'pending',
        isFirst ? notBeforeFor(step, now) : null,
      );
    }
  });

  tx();
  return getRunDetail(runId)!;
}

function stepRunsFor(runId: string): SequenceStepRun[] {
  return getDb()
    .prepare<[string], SequenceStepRun>(
      'SELECT * FROM sequence_step_runs WHERE run_id = ?',
    )
    .all(runId);
}

/**
 * Read a run, and record that the app was here.
 *
 * WHAT A READ DOES: stamps `last_seen_at`, and nothing else. It does not mark steps
 * stalled or fired, and it cannot change what the runner is willing to do — that rule
 * is stateless (`lib/sequence.ts`) so a read can never launder a missed window into an
 * on-time one, nor make a plan advance on its own.
 */
export function getRunDetail(runId: string, now = nowSeconds()): SequenceRunDetail | null {
  const db = getDb();
  const run = db
    .prepare<[string], SequenceRun>('SELECT * FROM sequence_runs WHERE id = ?')
    .get(runId);
  if (!run) return null;

  const stepRuns = stepRunsFor(runId);

  // The heartbeat. It is an audit stamp, not a gate: the runner's refusal to fire
  // anything unattended does not depend on it (see `lib/sequence.ts`). It exists so
  // the record shows when the plan was last looked at.
  if (run.status === 'running' && (run.last_seen_at ?? 0) < now) {
    db.prepare(
      'UPDATE sequence_runs SET last_seen_at = ? WHERE id = ?',
    ).run(now, runId);
  }

  const sequence = getSequence(run.sequence_id);
  if (!sequence) return null;

  const analysis = analyzeRun({
    run,
    steps: sequence.steps,
    stepRuns,
    now,
  });

  const awaiting =
    run.message_id === null
      ? []
      : (
          db
            .prepare<[string], { id: string }>(
              `SELECT id FROM message_recipients
                WHERE message_id = ?
                  AND dispatch_state = 'sent'
                  AND reply_state = 'awaiting'`,
            )
            .all(run.message_id) as Array<{ id: string }>
        ).map((row) => row.id);

  return { run, analysis, awaitingRecipientIds: awaiting };
}

export function listRunsForMessage(messageId: string, now = nowSeconds()) {
  const runs = getDb()
    .prepare<[string], SequenceRun>(
      'SELECT * FROM sequence_runs WHERE message_id = ? ORDER BY started_at DESC',
    )
    .all(messageId);
  return runs
    .map((run) => getRunDetail(run.id, now))
    .filter((detail): detail is SequenceRunDetail => detail !== null);
}

export interface AdvanceResult {
  run: SequenceRunDetail;
  /** The single step this call fired, with how late it was. */
  fired: Array<{ stepId: string; kind: SequenceStepKind; detail: string; lateSec: number }>;
  /** Steps whose window has closed and that are waiting for a decision. */
  stalled: Array<{ stepId: string; title: string; lateSec: number }>;
}

/**
 * Advance a plan by exactly one step — and only when the caller names that step.
 *
 * There is no watch-and-fire path. Called without `fireStepId`, this reports where the
 * plan stands and fires nothing, which is the preview half of "preview before catch
 * up". Called with one, it fires that step, records its lateness, and moves the plan to
 * the next step's clock.
 *
 * That shape is deliberate: it means there is no code path — in this runner or through
 * a bug in a caller — that can advance a plan while nobody asked it to.
 */
export function advanceRun(
  runId: string,
  options: { fireStepId?: string } = {},
  now = nowSeconds(),
): AdvanceResult {
  const db = getDb();
  const detail = getRunDetail(runId, now);
  if (!detail) throw new Error('That plan run no longer exists');

  const { run, analysis } = detail;
  const fired: AdvanceResult['fired'] = [];
  const stalled = analysis.stalled.map((view) => ({
    stepId: view.step.id,
    title: view.step.title,
    lateSec: view.lateSec,
  }));

  if (run.status !== 'running' || !options.fireStepId) {
    return { run: detail, fired, stalled };
  }

  const runStep = (stepId: string): void => {
    const stepView = analysis.steps.find((view) => view.step.id === stepId);
    if (!stepView) return;
    const step = stepView.step;
    const config = parseStepConfig(step.config_json);
    const lateSec = stepView.lateSec;

    // ── Do the step's work ─────────────────────────────────────────────────
    let outcome = '';
    if (step.kind === 'escalate') {
      const result = escalateRecipients(
        {
          recipientIds: detail.awaitingRecipientIds,
          dueInDays: config.dueInDays,
        },
        now,
      );
      outcome =
        result.created.length === 0
          ? 'Nobody needed chasing'
          : `Raised ${result.created.length} chase task${result.created.length === 1 ? '' : 's'}`;
    } else if (step.kind === 'task') {
      const task = createTask({
        title: config.title || step.title || 'Follow up',
        description: config.detail ?? '',
        priority: config.priority ?? 2,
        due_at:
          config.dueInDays === undefined
            ? null
            : now + Math.round(config.dueInDays * 86_400),
        project_id: run.project_id ?? undefined,
      });
      outcome = `Created task: ${task.title}`;
    } else if (step.kind === 'branch') {
      // A branch decides whether the plan continues. "Everything is settled" is the
      // only condition that stops it here; the other conditions are informational
      // and are recorded rather than acted on, because deciding what to do about a
      // partial reply is the user's call, not the runner's.
      const stillAwaiting = detail.awaitingRecipientIds.length;
      if (config.on === 'all_settled' && stillAwaiting > 0) {
        outcome = `${stillAwaiting} still awaiting a reply — continuing`;
      } else if (config.on === 'all_settled') {
        outcome = 'Everyone answered — nothing left to chase';
      } else {
        outcome = 'Branch recorded';
      }
    } else if (step.kind === 'wait') {
      outcome = `Waited ${config.days ?? 0} days`;
    } else {
      outcome = step.kind === 'stop' ? 'Plan complete' : 'Done';
    }

    db.prepare(
      `UPDATE sequence_step_runs
          SET status = 'fired', fired_at = ?, late_sec = ?, detail = ?,
              updated_at = unixepoch()
        WHERE run_id = ? AND step_id = ?`,
    ).run(now, lateSec, outcome, runId, stepId);

    fired.push({ stepId, kind: step.kind, detail: outcome, lateSec });

    // ── Move to the next step ──────────────────────────────────────────────
    const sequence = getSequence(run.sequence_id)!;
    const ordered = [...sequence.steps].sort((a, b) => a.position - b.position);
    const index = ordered.findIndex((candidate) => candidate.id === stepId);
    const next = index >= 0 ? (ordered[index + 1] ?? null) : null;

    if (step.kind === 'stop' || !next) {
      db.prepare(
        `UPDATE sequence_runs
            SET status = 'completed', current_step_id = NULL, finished_at = ?,
                updated_at = unixepoch()
          WHERE id = ?`,
      ).run(now, runId);
      return;
    }

    // The next step's clock starts now, because that is when it was reached.
    db.prepare(
      `UPDATE sequence_step_runs
          SET status = 'waiting', not_before = ?, updated_at = unixepoch()
        WHERE run_id = ? AND step_id = ?`,
    ).run(notBeforeFor(next, now), runId, next.id);

    db.prepare(
      `UPDATE sequence_runs
          SET current_step_id = ?, updated_at = unixepoch()
        WHERE id = ?`,
    ).run(next.id, runId);
  };

  // The named step must be the plan's next unfinished one. Anything else is a stale
  // click on a plan that has already moved, and is refused rather than applied out of
  // order — a follow-up fired before the wait it belongs to would corrupt the record.
  const nextUnfinished =
    analysis.steps.find((view) => view.outlook !== 'done') ?? null;
  if (!nextUnfinished || nextUnfinished.step.id !== options.fireStepId) {
    return { run: detail, fired, stalled };
  }

  runStep(nextUnfinished.step.id);

  db.prepare(
    'UPDATE sequence_runs SET last_seen_at = ?, updated_at = unixepoch() WHERE id = ?',
  ).run(now, runId);

  return { run: getRunDetail(runId, now)!, fired, stalled };
}

export function stopRun(runId: string, now = nowSeconds()): void {
  getDb()
    .prepare(
      `UPDATE sequence_runs
          SET status = 'stopped', finished_at = ?, updated_at = unixepoch()
        WHERE id = ?`,
    )
    .run(now, runId);
}

/**
 * Plans with a step that came due while the app was closed.
 *
 * Read at startup so a stalled plan is something the user is told about rather than
 * something they have to go looking for.
 */
export function stalledRuns(projectId?: string | null, now = nowSeconds()) {
  const db = getDb();
  const runs = (
    projectId
      ? db
          .prepare<[string], SequenceRun>(
            `SELECT * FROM sequence_runs
              WHERE status = 'running' AND project_id = ?`,
          )
          .all(projectId)
      : db
          .prepare<[], SequenceRun>(
            `SELECT * FROM sequence_runs WHERE status = 'running'`,
          )
          .all()
  ) as SequenceRun[];

  return runs
    .map((run) => getRunDetail(run.id, now))
    .filter((detail): detail is SequenceRunDetail => detail !== null)
    .filter((detail) => detail.analysis.stalled.length > 0);
}

/** Exposed for the board's badge; deliberately cheap. */
export function activeRunCount(projectId?: string | null): number {
  const row = projectId
    ? (getDb()
        .prepare<[string], { n: number }>(
          `SELECT COUNT(*) AS n FROM sequence_runs
            WHERE status = 'running' AND project_id = ?`,
        )
        .get(projectId) as { n: number } | undefined)
    : (getDb()
        .prepare<[], { n: number }>(
          `SELECT COUNT(*) AS n FROM sequence_runs WHERE status = 'running'`,
        )
        .get() as { n: number } | undefined);
  return row?.n ?? 0;
}

export type { SequenceRunStatus };
