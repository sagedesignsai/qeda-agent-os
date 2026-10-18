/**
 * __tests__/harvest.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The extractor is the one place a wrong answer is expensive in both directions:
 * too eager and the user's registry fills with invented contacts, too shy and the
 * feature looks broken. So these tests are written against the *shape real research
 * output has* — a numbered heading per organisation, labelled lines beneath it,
 * structural sections interleaved — rather than against synthetic strings.
 *
 * Two properties are load-bearing and each gets its own case:
 *   • the scanner can only report what is literally in the text (no invented
 *     values, and a phone-like string that is really a date or an amount is not a
 *     phone number);
 *   • a model can add to a scan, never overwrite it.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  mergeAgentRows,
  mergeDuplicateRows,
  scanTextForContacts,
  type HarvestRowDraft,
} from '../lib/harvest';

/** Shaped like a real stakeholder page: numbered organisations, labelled fields. */
const STAKEHOLDER_PAGE = `# Stakeholders & Communication Plan

Overview of the parties, the channels they accept and what has been sent.

## 1. De Beers Group (Industrial Diamond Division)

**Role:** Former employer / respondent
**Email:** hr@debeers.example
**Phone:** +27 (0)11 374 7000
**Address:** 17 Charterhouse Street, Johannesburg

## 2. Anglo American Corporation Pension Fund Trustees

**Role:** Pension fund administrator
**Email:** trustees@anglo.example
**Form:** https://pensions.anglo.example/query-form

## 3. Commission for Conciliation, Mediation and Arbitration (CCMA)

**Role:** Dispute referral body
**Email:** info@ccma.example
**Phone:** +27 11 646 0335
**Address:** Suite 316, Killarney Mall, 60 Riviera Road, Johannesburg
**Process:** Submit Form 7.11 with supporting evidence

## Key Documents

- Source1: Sworn affidavit
- Source2: Letter of demand

## Next Steps

Phase 1: send the letter of demand to all parties within 7 days.
`;

function rowFor(name: string): HarvestRowDraft | undefined {
  return scanTextForContacts(STAKEHOLDER_PAGE).rows.find((row) =>
    row.name.includes(name),
  );
}

describe('scanTextForContacts', () => {
  it('reads one organisation per heading', () => {
    const { rows } = scanTextForContacts(STAKEHOLDER_PAGE);
    const names = rows.map((row) => row.name);

    expect(names).toEqual([
      'De Beers Group (Industrial Diamond Division)',
      'Anglo American Corporation Pension Fund Trustees',
      'Commission for Conciliation, Mediation and Arbitration (CCMA)',
    ]);
  });

  it('never turns a structural section into an organisation', () => {
    const { rows } = scanTextForContacts(STAKEHOLDER_PAGE);

    // "Key Documents" and "Next Steps" contain no way of reaching anyone, so
    // they are document structure, not counterparties.
    expect(rows.map((row) => row.name)).not.toContain('Key Documents');
    expect(rows.map((row) => row.name)).not.toContain('Next Steps');
  });

  it('files each labelled field on the right channel', () => {
    const ccma = rowFor('Commission for Conciliation');
    expect(ccma).toBeDefined();

    const kinds = ccma!.channels.map((channel) => channel.kind);
    expect(kinds).toContain('email');
    expect(kinds).toContain('phone');
    expect(kinds).toContain('postal');

    const email = ccma!.channels.find((channel) => channel.kind === 'email');
    expect(email?.value).toBe('info@ccma.example');
  });

  it('treats a labelled URL as a portal, not a bare value', () => {
    const anglo = rowFor('Anglo American');
    const portal = anglo!.channels.find((channel) => channel.kind === 'portal');

    expect(portal?.value).toBe('https://pensions.anglo.example/query-form');
    // Nothing in that section is an email or a phone number.
    expect(anglo!.channels.some((channel) => channel.kind === 'phone')).toBe(
      false,
    );
  });

  it('keeps a non-channel label as a note', () => {
    const ccma = rowFor('Commission for Conciliation');
    // "Process: Submit Form 7.11" is procedure, not a way of reaching anyone.
    expect(ccma!.channels.some((channel) => channel.value.includes('7.11'))).toBe(
      false,
    );
    expect(ccma!.notes).toContain('Form 7.11');
  });

  it('flags an organisation with a direct line as high confidence', () => {
    const ccma = rowFor('Commission for Conciliation');
    expect(ccma!.confidence).toBeGreaterThanOrEqual(0.9);
    expect(ccma!.nameOrigin).toBe('heading');
  });

  it('does not mistake dates or amounts for phone numbers', () => {
    const { rows } = scanTextForContacts(
      '## SARS\n\nThe IRP5 was issued on 2026-10-08 and the difference is R12,612.47.\n',
    );
    const sars = rows[0];

    expect(sars).toBeUndefined();
    expect(rows.length).toBe(0);
  });
});

describe('scanTextForContacts — looser inputs', () => {
  it('recognises numbered and bold-only organisation lines', () => {
    const { rows } = scanTextForContacts(
      [
        '1. Industrial Aid Society',
        'Email: help@ias.example',
        '',
        '**Black Sash**',
        'Phone: +27 11 000 1111',
      ].join('\n'),
    );

    expect(rows.map((row) => row.name)).toEqual([
      'Industrial Aid Society',
      'Black Sash',
    ]);
    // A bold-only name is a weaker signal than a heading, so it is marked as such.
    expect(rows[1].nameOrigin).toBe('bold-line');
  });

  it('keeps contact details that have no organisation above them', () => {
    const scan = scanTextForContacts(
      'Call the switchboard on +27 11 555 0000 or email switch@example.org\n',
    );

    expect(scan.rows).toHaveLength(0);
    expect(scan.looseChannels.map((channel) => channel.kind).sort()).toEqual([
      'email',
      'phone',
    ]);
  });

  it('counts what it read so the UI can show it', () => {
    const { stats } = scanTextForContacts(STAKEHOLDER_PAGE);
    expect(stats.emails).toBe(3);
    expect(stats.phones).toBe(2);
    expect(stats.sections).toBeGreaterThanOrEqual(3);
  });
});

describe('mergeDuplicateRows', () => {
  it('folds the same organisation mentioned twice into one row', () => {
    const rows: HarvestRowDraft[] = [
      {
        id: 'a',
        kind: 'organisation',
        name: '3. Commission for Conciliation, Mediation and Arbitration',
        role: '',
        notes: '',
        confidence: 0.9,
        nameOrigin: 'heading',
        inferred: false,
        channels: [
          {
            kind: 'email',
            value: 'info@ccma.example',
            label: 'Email',
            confidence: 0.95,
            inferred: false,
          },
        ],
      },
      {
        id: 'b',
        kind: 'organisation',
        name: 'Commission for Conciliation Mediation Arbitration (CCMA)',
        role: 'Dispute referral body',
        notes: '',
        confidence: 0.7,
        nameOrigin: 'bold-line',
        inferred: false,
        channels: [
          {
            kind: 'phone',
            value: '+27116460335',
            label: 'Phone',
            confidence: 0.95,
            inferred: false,
          },
        ],
      },
    ];

    const merged = mergeDuplicateRows(rows);
    expect(merged).toHaveLength(1);
    expect(merged[0].channels.map((c) => c.kind).sort()).toEqual([
      'email',
      'phone',
    ]);
    // The stronger name and the role survive the merge.
    expect(merged[0].name).toContain('3. Commission');
    expect(merged[0].role).toBe('Dispute referral body');
  });
});

describe('mergeAgentRows', () => {
  it('adds model values as inferred and never overwrites what the text said', () => {
    const scan = scanTextForContacts(
      '## De Beers Group\nEmail: hr@debeers.example\n',
    );

    const merged = mergeAgentRows(scan, [
      {
        name: 'De Beers Group',
        role: 'Respondent',
        channels: [
          // Same address, different spelling: the deterministic read wins.
          { kind: 'email', value: 'HR@DeBeers.example' },
          // Not in the text at all: added, and marked as a guess.
          { kind: 'phone', value: '+27 11 374 7000' },
        ],
      },
    ]);

    expect(merged.rows).toHaveLength(1);
    const email = merged.rows[0].channels.find((c) => c.kind === 'email');
    const phone = merged.rows[0].channels.find((c) => c.kind === 'phone');

    expect(email?.inferred).toBe(false);
    expect(email?.confidence).toBeCloseTo(0.95);
    expect(phone?.inferred).toBe(true);
    expect(merged.rows[0].role).toBe('Respondent');
  });

  it('appends an organisation the scanner missed, flagged as inferred', () => {
    const scan = scanTextForContacts('## De Beers Group\nEmail: hr@debeers.example\n');

    const merged = mergeAgentRows(scan, [
      { name: 'Industrial Aid Society', kind: 'organisation' },
    ]);

    expect(merged.rows).toHaveLength(2);
    const appended = merged.rows[1];
    expect(appended.name).toBe('Industrial Aid Society');
    expect(appended.inferred).toBe(true);
    expect(appended.nameOrigin).toBe('agent');
  });

  it('is a no-op for an empty model result', () => {
    const scan = scanTextForContacts('## De Beers Group\nEmail: hr@debeers.example\n');
    expect(mergeAgentRows(scan, []).rows).toEqual(scan.rows);
  });
});
