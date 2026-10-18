/**
 * lib/correspondence.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The shared vocabulary of the Correspondence system: what a channel is, what it
 * means to be verified, and how two spellings of the same address collapse into
 * one.
 *
 * WHY THIS IS HERE RATHER THAN IN THE DB LAYER
 * Everything in this file is pure and UI-free, and all three consumers need it:
 * the extractor decides what kind of thing it found, the store normalises before
 * writing, and the renderer labels and tints the result. Putting it in `db/`
 * would force the renderer to reach into the database layer for a type, which is
 * exactly what `ipc/channels.ts` exists to prevent; putting it in the extractor
 * would make the store depend on the extractor.
 *
 * The normalisation rules are the load-bearing part. A contact registry whose
 * duplicate detection depends on how someone happened to type an address is worse
 * than no registry, because it silently shows the same body twice and the user
 * stops trusting the list.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** The ways a contact can be reached, including the ways that have no address. */
export type ContactChannelKind =
  | 'email'
  | 'phone'
  | 'portal'
  | 'postal'
  | 'social'
  /** Something that happened off-machine and is only being logged. */
  | 'manual';

export const CONTACT_CHANNEL_KINDS: readonly ContactChannelKind[] = [
  'email',
  'phone',
  'portal',
  'postal',
  'social',
  'manual',
];

/** Human labels. Kept here so main and renderer cannot disagree about wording. */
export const CHANNEL_LABELS: Readonly<Record<ContactChannelKind, string>> = {
  email: 'Email',
  phone: 'Phone',
  portal: 'Portal',
  postal: 'Postal',
  social: 'Social',
  manual: 'Logged',
};

/** Per-channel verification state — never per contact. */
export type ChannelVerification = 'unverified' | 'verified' | 'bounced';

export const VERIFICATION_LABELS: Readonly<Record<ChannelVerification, string>> =
  {
    unverified: 'Unverified',
    verified: 'Verified',
    bounced: 'Bounced',
  };

/** How a contact or channel got here. `harvest` means a user reviewed an extraction. */
export type ContactSource = 'manual' | 'harvest' | 'import';

/** A contact is either an institution or a person inside one. */
export type ContactKind = 'organisation' | 'person';

/**
 * Collapse a value to the form used for storage and duplicate detection.
 *
 * Deliberately conservative: it lowercases only what is genuinely
 * case-insensitive (an email's domain and local part are both matched
 * case-insensitively in practice), reduces a phone number to `+` and digits, and
 * otherwise only trims. It never rewrites a postal address or a portal URL into
 * something the user did not type, because those are shown back to them as
 * evidence of where something was sent.
 */
export function canonicalChannelValue(
  kind: ContactChannelKind,
  value: string,
): string {
  const trimmed = value.trim();
  switch (kind) {
    case 'email':
      return trimmed.toLowerCase();
    case 'phone': {
      // Drop a bracketed trunk zero first: "+27 (0)11 646 0335" and
      // "+27 11 646 0335" are the same South African number written two ways, and
      // only the first form survives naive digit-stripping as a different value.
      const withoutTrunk = trimmed.replace(/\(\s*0\s*\)/g, '');
      // Keep a leading + and the digits; drop spaces, dashes and brackets, so
      // "+27 11 646-0335" and "+27116460335" agree.
      const digits = withoutTrunk.replace(/[^\d+]/g, '');
      return digits.startsWith('+')
        ? `+${digits.slice(1).replace(/\+/g, '')}`
        : digits.replace(/\+/g, '');
    }
    case 'portal':
    case 'social':
      // A trailing slash is the same page; the rest of the URL is meaningful.
      return trimmed.replace(/\/+$/, '');
    default:
      return trimmed.replace(/\s+/g, ' ');
  }
}

/**
 * The key two channels share when they identify the same way of reaching the same
 * body. Used to merge duplicates instead of showing them twice.
 */
export function channelDedupeKey(
  kind: ContactChannelKind,
  value: string,
): string {
  return `${kind}:${canonicalChannelValue(kind, value)}`;
}

/**
 * A name reduced to what a human would call "the same organisation".
 *
 * Drops leading list numbering, bracketed acronyms and the articles that people
 * include or omit at random, because "3. Commission for Conciliation, Mediation
 * and Arbitration" and "Commission for Conciliation Mediation Arbitration" are
 * one body and a registry that lists them twice is not trusted for long.
 */
export function contactNameDedupeKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/^\s*\d+\s*[.)]\s*/, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\b(the|and|for|of|a|an)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Whether a channel requires an address at all. Manual/portal-logged entries may not. */
export function channelNeedsValue(kind: ContactChannelKind): boolean {
  return kind !== 'manual';
}

// ─── Clocks ───────────────────────────────────────────────────────────────────
//
// Everything below is about one recipient of one message: whether their clock is
// still running, how late it is, and whether that lateness is the kind you can
// shrug off. It is pure and lives here so the board, the rail and the eventual
// background runner cannot disagree about what "overdue" means — a disagreement of
// one day between two surfaces is enough to destroy trust in a deadline.

/**
 * How much a missed deadline costs.
 *
 * The distinction is the whole reason this system is worth building: a blown
 * 14-day statutory window can end a claim, while a missed "call them back Tuesday"
 * is nothing at all. They must never share one visual treatment, and they must
 * never share one sort order.
 */
export type DeadlineClass = 'statutory' | 'contractual' | 'tactical';

export const DEADLINE_CLASSES: readonly DeadlineClass[] = [
  'statutory',
  'contractual',
  'tactical',
];

export const DEADLINE_LABELS: Readonly<Record<DeadlineClass, string>> = {
  statutory: 'Statutory',
  contractual: 'Contractual',
  tactical: 'Tactical',
};

/**
 * What each class means, in the user's terms — shown in the composer so choosing
 * one is a decision rather than a field.
 */
export const DEADLINE_DESCRIPTIONS: Readonly<Record<DeadlineClass, string>> = {
  statutory:
    'A deadline set by law or a tribunal. Missing it can end the claim outright.',
  contractual: 'A deadline the other side set — a notice period or an SLA.',
  tactical: 'Your own follow-up timing. Missing it costs nothing but momentum.',
};

/**
 * Suggested response windows, in days.
 *
 * These are defaults for a form field, NOT legal advice and not a jurisdiction
 * rulebook — the plan explicitly defers jurisdiction content (decision D1), so
 * nothing here is derived from a statute. The user sets the real date, and a
 * statutory clock is never inferred from a template.
 */
export const DEFAULT_RESPONSE_DAYS: Readonly<Record<DeadlineClass, number>> = {
  statutory: 14,
  contractual: 14,
  tactical: 7,
};

/** A clock within this many days of its date is "due soon" rather than "waiting". */
export const DUE_SOON_DAYS = 3;

export type DispatchState = 'queued' | 'sent' | 'failed' | 'withdrawn';
export type ReplyState = 'awaiting' | 'replied' | 'no_response' | 'not_expected';

export const DISPATCH_LABELS: Readonly<Record<DispatchState, string>> = {
  queued: 'Queued',
  sent: 'Sent',
  failed: 'Failed',
  withdrawn: 'Withdrawn',
};

export const REPLY_LABELS: Readonly<Record<ReplyState, string>> = {
  awaiting: 'Awaiting reply',
  replied: 'Replied',
  no_response: 'No response',
  not_expected: 'No reply expected',
};

export const SECONDS_PER_DAY = 86_400;

export function addDays(epochSeconds: number, days: number): number {
  return epochSeconds + Math.round(days * SECONDS_PER_DAY);
}

/**
 * The due date a dispatch creates. Returns an absolute timestamp, never a duration:
 * a clock has to mean the same thing whether or not the app was open in between.
 */
export function dueFrom(
  dispatchedAt: number,
  deadlineClass: DeadlineClass,
  windowDays = DEFAULT_RESPONSE_DAYS[deadlineClass],
): number {
  return addDays(dispatchedAt, windowDays);
}

/** Whole days from `from` to `to`; negative when `to` is in the past. */
export function daysBetween(from: number, to: number): number {
  return Math.round((to - from) / SECONDS_PER_DAY);
}

/** How a recipient's clock reads right now. */
export type ClockState =
  /** Answered, or not expecting an answer. Nothing to watch. */
  | 'settled'
  /** Past its date. */
  | 'overdue'
  /** Inside the warning window. */
  | 'due-soon'
  /** Running, with time to spare. */
  | 'waiting'
  /** Sent, awaiting a reply, and no date was ever set — a defect, surfaced. */
  | 'no-clock';

/**
 * A recipient as the database spells it.
 *
 * The fields are the persisted column names on purpose: this model is read straight off
 * `message_recipients` rows, and a camelCase copy here meant every caller had to
 * translate — with one caller that forgot, which is how every clock silently read as
 * `settled`. The rest of the runner's types take the same approach (`SequenceStepRun`
 * carries `not_before`), so this matches the codebase rather than the other way round.
 */
export interface ClockedRecipient {
  id: string;
  deadline_class: DeadlineClass;
  dispatch_state: DispatchState;
  reply_state: ReplyState;
  sent_at: number | null;
  response_due_at: number | null;
}

/**
 * Read one clock.
 *
 * Order matters: a settled recipient is never overdue even if its old due date is
 * in the past (the date stopped mattering the moment they answered), and something
 * still queued has no clock at all yet because nothing has been sent.
 */
export function clockStateFor(
  recipient: Pick<
    ClockedRecipient,
    'deadline_class' | 'dispatch_state' | 'reply_state' | 'response_due_at'
  >,
  now: number,
): ClockState {
  if (
    recipient.reply_state === 'replied' ||
    recipient.reply_state === 'not_expected'
  ) {
    return 'settled';
  }
  if (recipient.dispatch_state !== 'sent') return 'settled';
  if (recipient.response_due_at === null) return 'no-clock';

  const days = daysBetween(now, recipient.response_due_at);
  if (days < 0) return 'overdue';
  if (days <= DUE_SOON_DAYS) return 'due-soon';
  return 'waiting';
}

export interface AttentionItem<T extends ClockedRecipient = ClockedRecipient> {
  recipient: T;
  state: ClockState;
  /**
   * Sort key: days late (positive) or days remaining (negative). Larger sorts
   * first, so the most-late statutory clock leads the board.
   */
  offsetDays: number;
  /** One sentence, already written for the user. */
  reason: string;
}

/**
 * Everything that needs the user's attention, most urgent first.
 *
 * Ordering is statutory-late, then everything else late, then due-soon (soonest
 * first), then clocks that were never set — and that last group is deliberately
 * *after* real deadlines but not hidden, because a sent item with no clock is how a
 * deadline gets forgotten silently.
 */
export function attentionQueue<T extends ClockedRecipient>(
  recipients: T[],
  now: number,
): AttentionItem<T>[] {
  const items: AttentionItem<T>[] = [];

  for (const recipient of recipients) {
    const state = clockStateFor(recipient, now);
    if (state === 'settled' || state === 'waiting') continue;

    if (state === 'overdue') {
      const late = Math.abs(
        daysBetween(now, recipient.response_due_at as number),
      );
      items.push({
        recipient,
        state,
        offsetDays: late,
        reason: `${DEADLINE_LABELS[recipient.deadline_class]} window closed ${late} day${late === 1 ? '' : 's'} ago`,
      });
      continue;
    }

    if (state === 'due-soon') {
      const remaining = daysBetween(now, recipient.response_due_at as number);
      items.push({
        recipient,
        state,
        offsetDays: -Math.max(remaining, 0),
        reason:
          remaining === 0
            ? 'Due today'
            : `Due in ${remaining} day${remaining === 1 ? '' : 's'}`,
      });
      continue;
    }

    const silentDays =
      recipient.sent_at === null
        ? 0
        : Math.max(daysBetween(recipient.sent_at, now), 0);
    items.push({
      recipient,
      state,
      offsetDays: -Infinity,
      reason:
        silentDays > 0
          ? `Sent ${silentDays} day${silentDays === 1 ? '' : 's'} ago with no deadline set`
          : 'Sent with no deadline set',
    });
  }

  const rank = (item: AttentionItem<T>): number => {
    if (item.state === 'overdue') {
      // A late statutory clock always outranks a late anything else.
      return item.recipient.deadline_class === 'statutory' ? 1_000_000 : 100_000;
    }
    if (item.state === 'due-soon') return 1_000;
    return 0;
  };

  return items.sort((a, b) => {
    const byClass = rank(b) - rank(a);
    if (byClass !== 0) return byClass;
    if (a.state === 'no-clock' && b.state === 'no-clock') return 0;
    return b.offsetDays - a.offsetDays;
  });
}
