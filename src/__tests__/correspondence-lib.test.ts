/**
 * __tests__/correspondence-lib.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The normalisation rules decide whether the registry deduplicates correctly, and
 * a registry that shows the same body twice stops being trusted. Every case here is
 * a pair of spellings a real user or a real research page produces.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  canonicalChannelValue,
  channelDedupeKey,
  contactNameDedupeKey,
  channelNeedsValue,
} from '../lib/correspondence';

describe('canonicalChannelValue', () => {
  it('lowercases emails', () => {
    expect(canonicalChannelValue('email', '  HR@DeBeers.Example ')).toBe(
      'hr@debeers.example',
    );
  });

  it('reduces phone numbers to digits and a leading +', () => {
    expect(canonicalChannelValue('phone', '+27 11 646-0335')).toBe('+27116460335');
    expect(canonicalChannelValue('phone', '(011) 646 0335')).toBe('0116460335');
  });

  it('treats a South African number written with a bracketed trunk zero as one value', () => {
    expect(canonicalChannelValue('phone', '+27 (0)11 374 7000')).toBe(
      canonicalChannelValue('phone', '+27 11 374 7000'),
    );
  });

  it('ignores a trailing slash on a URL', () => {
    expect(canonicalChannelValue('portal', 'https://example.org/form/')).toBe(
      'https://example.org/form',
    );
  });

  it('leaves a postal address alone apart from whitespace', () => {
    // An address is shown back to the user as evidence of where something went, so
    // it is never rewritten into a form they did not type.
    expect(
      canonicalChannelValue('postal', 'Suite 316,  Killarney Mall,\nRiviera Road'),
    ).toBe('Suite 316, Killarney Mall, Riviera Road');
  });
});

describe('channelDedupeKey', () => {
  it('is equal for two spellings of the same channel', () => {
    expect(channelDedupeKey('email', 'Info@CCMA.example')).toBe(
      channelDedupeKey('email', 'info@ccma.example'),
    );
  });

  it('differs across channel kinds with the same value', () => {
    expect(channelDedupeKey('portal', 'example.org/form')).not.toBe(
      channelDedupeKey('social', 'example.org/form'),
    );
  });
});

describe('contactNameDedupeKey', () => {
  it('collapses list numbering, bracketed acronyms and articles', () => {
    const a = contactNameDedupeKey(
      '3. Commission for Conciliation, Mediation and Arbitration (CCMA)',
    );
    const b = contactNameDedupeKey(
      'Commission for Conciliation Mediation Arbitration',
    );

    expect(a).toBe(b);
  });

  it('keeps two genuinely different bodies apart', () => {
    expect(contactNameDedupeKey('De Beers Group')).not.toBe(
      contactNameDedupeKey('Anglo American Pension Fund'),
    );
  });
});

describe('channelNeedsValue', () => {
  it('only exempts a logged channel from carrying an address', () => {
    expect(channelNeedsValue('email')).toBe(true);
    expect(channelNeedsValue('manual')).toBe(false);
  });
});
