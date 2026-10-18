/**
 * __tests__/correspondence-clocks.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The clock model decides when the app is allowed to say a deadline was missed, and
 * it is the one part of this system where being wrong costs a user a legal right.
 * So it is pure, and these tests fix the boundaries rather than the happy path:
 * midnight edges, a reply that arrives after the date, a sent item with no date at
 * all, and the ranking rule that a late statutory clock outranks everything else.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  DUE_SOON_DAYS,
  SECONDS_PER_DAY,
  addDays,
  attentionQueue,
  clockStateFor,
  daysBetween,
  dueFrom,
  type ClockedRecipient,
} from '../lib/correspondence';

/** A fixed instant, so these tests never depend on when they run. */
const NOW = 1_800_000_000;

function recipient(
  overrides: Partial<ClockedRecipient> = {},
): ClockedRecipient {
  return {
    id: 'r1',
    deadline_class: 'statutory',
    dispatch_state: 'sent',
    reply_state: 'awaiting',
    sent_at: NOW - 5 * SECONDS_PER_DAY,
    response_due_at: addDays(NOW, 9),
    ...overrides,
  };
}

describe('clock arithmetic', () => {
  it('stores deadlines as absolute timestamps', () => {
    expect(addDays(NOW, 14)).toBe(NOW + 14 * SECONDS_PER_DAY);
    // A window is a duration only at the moment it is applied; what is stored is a date.
    expect(dueFrom(NOW, 'statutory', 14)).toBe(NOW + 14 * SECONDS_PER_DAY);
    expect(dueFrom(NOW, 'tactical', 7)).toBe(NOW + 7 * SECONDS_PER_DAY);
  });

  it('counts whole days, signed', () => {
    expect(daysBetween(NOW, addDays(NOW, 3))).toBe(3);
    expect(daysBetween(NOW, addDays(NOW, -3))).toBe(-3);
  });
});

describe('clockStateFor', () => {
  it('is waiting while there is time to spare', () => {
    expect(clockStateFor(recipient(), NOW)).toBe('waiting');
  });

  it('becomes due soon inside the warning window', () => {
    expect(
      clockStateFor(recipient({ response_due_at: addDays(NOW, DUE_SOON_DAYS) }), NOW),
    ).toBe('due-soon');
    expect(clockStateFor(recipient({ response_due_at: NOW }), NOW)).toBe('due-soon');
  });

  it('is overdue the moment the date is in the past', () => {
    expect(
      clockStateFor(recipient({ response_due_at: addDays(NOW, -1) }), NOW),
    ).toBe('overdue');
  });

  it('stops being overdue once they answer, whatever the date says', () => {
    expect(
      clockStateFor(
        recipient({ reply_state: 'replied', response_due_at: addDays(NOW, -30) }),
        NOW,
      ),
    ).toBe('settled');
  });

  it('treats a filing as settled rather than as an unanswered letter', () => {
    expect(
      clockStateFor(
        recipient({ reply_state: 'not_expected', response_due_at: null }),
        NOW,
      ),
    ).toBe('settled');
  });

  it('has no clock before dispatch and nothing to watch after it', () => {
    expect(
      clockStateFor(
        recipient({ dispatch_state: 'queued', response_due_at: null }),
        NOW,
      ),
    ).toBe('settled');
  });

  it('reports a sent item with no date as its own defect state', () => {
    // This is the failure this system exists to prevent: something went out and
    // nothing will ever remind anyone about it.
    expect(clockStateFor(recipient({ response_due_at: null }), NOW)).toBe('no-clock');
  });

  it('does not let the deadline class change when a clock is late', () => {
    const tactical = recipient({
      deadline_class: 'tactical',
      response_due_at: addDays(NOW, -2),
    });
    expect(clockStateFor(tactical, NOW)).toBe('overdue');
  });
});

describe('attentionQueue', () => {
  it('excludes anything settled or comfortably waiting', () => {
    const queue = attentionQueue(
      [
        recipient({ id: 'waiting' }),
        recipient({ id: 'replied', reply_state: 'replied' }),
      ],
      NOW,
    );
    expect(queue).toHaveLength(0);
  });

  it('leads with a late statutory clock', () => {
    const queue = attentionQueue(
      [
        recipient({
          id: 'late-tactical',
          deadline_class: 'tactical',
          response_due_at: addDays(NOW, -20),
        }),
        recipient({
          id: 'late-statutory',
          deadline_class: 'statutory',
          response_due_at: addDays(NOW, -2),
        }),
      ],
      NOW,
    );

    expect(queue[0].recipient.id).toBe('late-statutory');
    expect(queue[0].reason).toContain('Statutory window closed 2 days ago');
  });

  it('orders late items by how late they are', () => {
    const queue = attentionQueue(
      [
        recipient({ id: 'a', deadline_class: 'tactical', response_due_at: addDays(NOW, -1) }),
        recipient({ id: 'b', deadline_class: 'tactical', response_due_at: addDays(NOW, -9) }),
      ],
      NOW,
    );
    expect(queue.map((item) => item.recipient.id)).toEqual(['b', 'a']);
  });

  it('puts the soonest deadline first among due-soon items', () => {
    const queue = attentionQueue(
      [
        recipient({ id: 'later', response_due_at: addDays(NOW, 3) }),
        recipient({ id: 'soon', response_due_at: addDays(NOW, 1) }),
      ],
      NOW,
    );
    expect(queue.map((item) => item.recipient.id)).toEqual(['soon', 'later']);
    expect(queue[0].reason).toBe('Due in 1 day');
  });

  it('surfaces a sent item with no deadline after real deadlines', () => {
    const queue = attentionQueue(
      [
        recipient({ id: 'no-clock', response_due_at: null }),
        recipient({ id: 'due', response_due_at: addDays(NOW, 2) }),
      ],
      NOW,
    );

    expect(queue.map((item) => item.recipient.id)).toEqual(['due', 'no-clock']);
    expect(queue[1].reason).toContain('no deadline set');
  });

  it('says due today rather than in zero days', () => {
    const queue = attentionQueue([recipient({ response_due_at: NOW })], NOW);
    expect(queue[0].reason).toBe('Due today');
  });
});
