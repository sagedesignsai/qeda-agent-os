/**
 * __tests__/project-health.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The thresholds behind the project health badge. Pure and deterministic, so
 * each precedence rule is pinned individually.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { projectHealth } from '../lib/projects';
import type { Project, ProjectRollup } from '../main/ipc/channels';

const NOW = 1_700_000_000;
const DAY = 86_400;

function makeRollup(
  project: Partial<Project> = {},
  rollup: Partial<ProjectRollup> = {},
): ProjectRollup {
  return {
    project: {
      id: 'p',
      name: 'Project',
      description: '',
      status: 'active',
      color: '',
      icon: 'folder',
      deadline: null,
      repo_path: null,
      notebook_id: null,
      sort_order: 0,
      created_at: 0,
      updated_at: 0,
      ...project,
    },
    taskTotal: 0,
    taskDone: 0,
    taskActive: 0,
    taskBacklog: 0,
    overdue: 0,
    focusSecToday: 0,
    focusSecTotal: 0,
    blocksToday: 0,
    lastActivityAt: null,
    nextDueAt: null,
    ...rollup,
  };
}

describe('projectHealth', () => {
  it('classifies a plain open project as on-track', () => {
    expect(projectHealth(makeRollup(), NOW)).toBe('on-track');
  });

  it('lets archived and done win over every risk signal', () => {
    const urgent = { overdue: 3, nextDueAt: NOW - DAY, taskActive: 2 };
    expect(projectHealth(makeRollup({ status: 'archived' }, urgent), NOW)).toBe(
      'archived',
    );
    expect(projectHealth(makeRollup({ status: 'done' }, urgent), NOW)).toBe(
      'done',
    );
  });

  it('flags overdue tasks before anything else', () => {
    expect(projectHealth(makeRollup({}, { overdue: 1 }), NOW)).toBe('overdue');
  });

  it('is at risk when the soonest open task is due within the window', () => {
    expect(
      projectHealth(
        makeRollup({}, { nextDueAt: NOW + 3 * DAY, taskActive: 1 }),
        NOW,
      ),
    ).toBe('at-risk');
  });

  it('is not at risk when the next task is further out or nothing is open', () => {
    // Due outside the window.
    expect(
      projectHealth(
        makeRollup({}, { nextDueAt: NOW + 30 * DAY, taskActive: 1 }),
        NOW,
      ),
    ).toBe('on-track');
    // Due soon, but no open work left to do.
    expect(
      projectHealth(
        makeRollup({}, { nextDueAt: NOW + 3 * DAY, taskActive: 0 }),
        NOW,
      ),
    ).toBe('on-track');
  });

  it('marks open projects with no activity in two weeks as stale', () => {
    expect(
      projectHealth(
        makeRollup({}, { taskActive: 2, lastActivityAt: NOW - 20 * DAY }),
        NOW,
      ),
    ).toBe('stale');
    // A never-touched project (null) is new, not stale.
    expect(
      projectHealth(
        makeRollup({}, { taskActive: 2, lastActivityAt: null }),
        NOW,
      ),
    ).toBe('on-track');
    // A finished-but-untouched project has nothing left to do.
    expect(
      projectHealth(
        makeRollup({}, { taskActive: 0, lastActivityAt: NOW - 20 * DAY }),
        NOW,
      ),
    ).toBe('on-track');
  });

  it('does not let an imminent due date mask overdue work', () => {
    expect(
      projectHealth(
        makeRollup({}, { overdue: 2, nextDueAt: NOW + DAY, taskActive: 1 }),
        NOW,
      ),
    ).toBe('overdue');
  });
});
