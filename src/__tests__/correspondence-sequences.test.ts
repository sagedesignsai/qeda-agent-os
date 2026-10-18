/**
 * __tests__/correspondence-sequences.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The plan runner, and the single rule that makes it trustworthy:
 *
 *   **No step fires unattended.** Not while the app is closed, not while it is open,
 *   not on a timer. A step that is due — late or exactly on time — fires only when a
 *   caller names it.
 *
 * An earlier design tried to detect "the window elapsed while the app was closed" and
 * fire automatically otherwise. It was replaced because there is no honest way to make
 * that distinction, and because the guard it produced was weaker: the failure it must
 * prevent is an app deciding on its own that a legal deadline had passed. Removing the
 * autonomy removes the failure. These tests fix that property, plus the lateness the
 * record keeps when a step is fired after its date.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import Database from 'better-sqlite3';
import { useTestDatabase } from '../main/db/client';
import { applyMigrations } from '../main/db/schema';
import { createProject } from '../main/db/projects';
import { saveChannel, saveContact } from '../main/db/correspondence';
import {
  dispatchMessage,
  saveMessage,
  setMessageRecipients,
} from '../main/db/messages';
import {
  advanceRun,
  createSequence,
  getRunDetail,
  listRunsForMessage,
  startRun,
  stalledRuns,
  stopRun,
} from '../main/db/sequences';
import { listTasks } from '../main/db/tasks';
import {
  DEMAND_THEN_ESCALATE,
  LATE_TOLERANCE_SEC,
  analyzeRun,
  stepIsLate,
  type SequenceStep,
  type SequenceStepRun,
} from '../lib/sequence';
import { SECONDS_PER_DAY, addDays } from '../lib/correspondence';

const T0 = 1_800_000_000;

function step(overrides: Partial<SequenceStep> = {}): SequenceStep {
  return {
    id: 's1',
    sequence_id: 'seq',
    position: 0,
    kind: 'wait',
    title: 'Wait',
    config_json: '{"days":14}',
    ...overrides,
  };
}

function stepRun(overrides: Partial<SequenceStepRun> = {}): SequenceStepRun {
  return {
    id: 'sr1',
    run_id: 'run',
    step_id: 's1',
    status: 'waiting',
    not_before: addDays(T0, 14),
    fired_at: null,
    late_sec: null,
    detail: '',
    ...overrides,
  };
}

describe('lateness', () => {
  it('is not late before its date', () => {
    expect(stepIsLate(stepRun(), addDays(T0, 3))).toBe(false);
  });

  it('tolerates the seconds a step spends being reached', () => {
    // Every step is stamped with `not_before = now` when reached, so a plan's own
    // first step must not report itself as late.
    expect(stepIsLate({ not_before: T0 }, T0 + LATE_TOLERANCE_SEC - 1)).toBe(false);
  });

  it('is late once its window has genuinely closed', () => {
    expect(stepIsLate(stepRun(), addDays(T0, 20))).toBe(true);
  });

  it('is never late when it has no clock', () => {
    expect(stepIsLate({ not_before: null }, addDays(T0, 90))).toBe(false);
  });
});

describe('analyzeRun', () => {
  it('marks a fresh run\u2019s first step as ready', () => {
    const analysis = analyzeRun({
      run: { current_step_id: null, status: 'running' },
      steps: [step()],
      stepRuns: [],
      now: T0,
    });

    expect(analysis.steps[0].outlook).toBe('due');
    expect(analysis.actionable?.step.id).toBe('s1');
  });

  it('reports a waiting step with the date it waits for', () => {
    const analysis = analyzeRun({
      run: { current_step_id: 's1', status: 'running' },
      steps: [step()],
      stepRuns: [stepRun()],
      now: T0,
    });

    expect(analysis.steps[0].outlook).toBe('waiting');
    expect(analysis.waitingUntil).toBe(addDays(T0, 14));
  });

  it('reports a step past its date as needing a decision, and says how late', () => {
    const analysis = analyzeRun({
      run: { current_step_id: 's1', status: 'running' },
      steps: [step()],
      stepRuns: [stepRun()],
      now: addDays(T0, 20),
    });

    expect(analysis.steps[0].outlook).toBe('stalled');
    expect(analysis.stalled).toHaveLength(1);
    expect(analysis.steps[0].detail).toBe('Its window closed 6 days ago');
    // Note what is NOT implied: `actionable` is still a preview, never a trigger.
    expect(analysis.actionable?.step.id).toBe('s1');
  });

  it('is complete once every step has fired', () => {
    const analysis = analyzeRun({
      run: { current_step_id: null, status: 'running' },
      steps: [step()],
      stepRuns: [stepRun({ status: 'fired', fired_at: T0, late_sec: 0 })],
      now: T0,
    });

    expect(analysis.complete).toBe(true);
  });
});

describe('sequence runs', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyMigrations(db);
    useTestDatabase(db);
  });

  afterEach(() => {
    useTestDatabase(null as unknown as Database.Database);
    db.close();
  });

  /** A dispatched message with one awaiting recipient, ready for a plan. */
  function dispatched() {
    const project = createProject({ name: 'Dispute' });
    const contact = saveContact({ projectId: project.id, name: 'De Beers Group' });
    const channel = saveChannel({
      contactId: contact.id,
      kind: 'email',
      value: 'hr@debeers.example',
    });
    const message = saveMessage({
      projectId: project.id,
      subject: 'Letter of demand',
    });
    setMessageRecipients(message.id, [
      { contactId: contact.id, channelId: channel.id, channelKind: 'email' },
    ]);
    dispatchMessage({
      messageId: message.id,
      sentAt: T0,
      deadlineClass: 'statutory',
      windowDays: 14,
    });
    return { project, message };
  }

  function quickPlan(projectId: string | null, days = 14) {
    return createSequence({
      projectId,
      name: 'Quick',
      steps: [
        { kind: 'wait', title: `Wait ${days} days`, config: { days } },
        { kind: 'stop', title: 'Done', config: {} },
      ],
    });
  }

  it('materialises every step of a plan up front', () => {
    const { project, message } = dispatched();
    const plan = createSequence({
      projectId: project.id,
      name: 'Demand → escalation',
      steps: DEMAND_THEN_ESCALATE.map((entry) => ({
        kind: entry.kind,
        title: entry.title,
        config: entry.config,
      })),
    });
    expect(plan.steps).toHaveLength(DEMAND_THEN_ESCALATE.length);

    const run = startRun({
      sequenceId: plan.id,
      messageId: message.id,
      projectId: project.id,
      startedAt: T0,
    });

    expect(run.analysis.steps).toHaveLength(plan.steps.length);
    // Only the first step has a clock; the rest get one when they are reached.
    expect(run.analysis.steps[0].notBefore).toBe(addDays(T0, 14));
    expect(run.analysis.steps[1].notBefore).toBeNull();
    expect(run.run.status).toBe('running');
  });

  it('fires nothing when asked only where the plan stands', () => {
    const { message } = dispatched();
    const plan = quickPlan(null);
    const run = startRun({
      sequenceId: plan.id,
      messageId: message.id,
      startedAt: T0,
    });

    // Long past the date — and still nothing happens on its own.
    const preview = advanceRun(run.run.id, {}, addDays(T0, 40));

    expect(preview.fired).toHaveLength(0);
    expect(preview.run.run.status).toBe('running');
    expect(preview.stalled).toHaveLength(1);
    expect(preview.stalled[0].lateSec).toBe(26 * SECONDS_PER_DAY);
  });

  it('fires the named step and records how late it was', () => {
    const { message } = dispatched();
    const plan = quickPlan(null);
    const run = startRun({
      sequenceId: plan.id,
      messageId: message.id,
      startedAt: T0,
    });

    const result = advanceRun(
      run.run.id,
      { fireStepId: run.analysis.steps[0].step.id },
      addDays(T0, 20),
    );

    expect(result.fired).toHaveLength(1);
    expect(result.fired[0].lateSec).toBe(6 * SECONDS_PER_DAY);
    expect(result.fired[0].kind).toBe('wait');
  });

  it('fires an on-time step with zero lateness', () => {
    const { message } = dispatched();
    const plan = quickPlan(null);
    const run = startRun({
      sequenceId: plan.id,
      messageId: message.id,
      startedAt: T0,
    });

    const result = advanceRun(
      run.run.id,
      { fireStepId: run.analysis.steps[0].step.id },
      addDays(T0, 14),
    );

    expect(result.fired).toHaveLength(1);
    expect(result.fired[0].lateSec).toBe(0);
    // The plan's only remaining step is `stop`, which was not fired in the same call.
    expect(result.run.run.status).toBe('running');
  });

  it('refuses a step that is not the plan\u2019s next one', () => {
    const { message } = dispatched();
    const plan = quickPlan(null);
    const run = startRun({
      sequenceId: plan.id,
      messageId: message.id,
      startedAt: T0,
    });
    const notYet = run.analysis.steps[1].step.id;

    // Firing the last step first would leave the wait unrecorded.
    const result = advanceRun(run.run.id, { fireStepId: notYet }, T0);

    expect(result.fired).toHaveLength(0);
    expect(result.run.run.current_step_id).toBe(run.analysis.steps[0].step.id);
  });

  it('raises chase tasks when an escalate step fires', () => {
    const { project, message } = dispatched();
    const plan = createSequence({
      projectId: project.id,
      name: 'Chase now',
      steps: [
        {
          kind: 'escalate',
          title: 'Chase whoever stayed quiet',
          config: { dueInDays: 3 },
        },
        { kind: 'stop', title: 'Done', config: {} },
      ],
    });
    const run = startRun({
      sequenceId: plan.id,
      messageId: message.id,
      projectId: project.id,
      startedAt: T0,
    });

    const result = advanceRun(
      run.run.id,
      { fireStepId: run.analysis.steps[0].step.id },
      T0,
    );

    expect(result.fired).toHaveLength(1);
    expect(result.fired[0].detail).toContain('Raised 1 chase task');
    expect(listTasks({ projectId: project.id })).toHaveLength(1);
  });

  it('stops advancing once stopped', () => {
    const { message } = dispatched();
    const plan = quickPlan(null, 1);
    const run = startRun({
      sequenceId: plan.id,
      messageId: message.id,
      startedAt: T0,
    });
    stopRun(run.run.id, T0);

    const result = advanceRun(
      run.run.id,
      { fireStepId: run.analysis.steps[0].step.id },
      addDays(T0, 30),
    );

    expect(result.fired).toHaveLength(0);
    expect(result.run.run.status).toBe('stopped');
  });

  it('surfaces a plan waiting on a decision', () => {
    const { project, message } = dispatched();
    const plan = quickPlan(project.id);
    startRun({
      sequenceId: plan.id,
      messageId: message.id,
      projectId: project.id,
      startedAt: T0,
    });

    expect(stalledRuns(project.id, T0)).toHaveLength(0);
    expect(stalledRuns(project.id, addDays(T0, 20))).toHaveLength(1);
    expect(stalledRuns(project.id, addDays(T0, 20))[0].analysis.stalled[0].lateSec).toBe(
      6 * SECONDS_PER_DAY,
    );
  });

  it('reads the runs attached to a message without changing them', () => {
    const { message } = dispatched();
    const plan = quickPlan(null, 1);
    const run = startRun({
      sequenceId: plan.id,
      messageId: message.id,
      startedAt: T0,
    });

    expect(listRunsForMessage(message.id, addDays(T0, 30))).toHaveLength(1);
    void run;
    // Reading is not advancing: the plan is still where it was.
    const afterReading = getRunDetail(run.run.id, addDays(T0, 30));
    expect(afterReading?.run.status).toBe('running');
    expect(afterReading?.analysis.steps[0].outlook).toBe('stalled');
    expect(getRunDetail('missing-run', T0)).toBeNull();
  });
});
