/**
 * __tests__/builder-types.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Guards the Builder's explicit OpenCode v2 compatibility boundary.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { isSupportedOpenCodeVersion } from '@/lib/builder-types';
import {
  DEFAULT_BUILDER_MAX_STEPS,
  MAX_BUILDER_MAX_STEPS,
  normalizeBuilderMaxSteps,
} from '@/lib/builder-engine';

describe('isSupportedOpenCodeVersion', () => {
  it.each(['2.0.18', '2.0.24', '2.1.0'])('accepts OpenCode %s', (version) => {
    expect(isSupportedOpenCodeVersion(version)).toBe(true);
  });

  it.each(['1.9.9', '3.0.0', 'unknown', ''])(
    'rejects OpenCode %s',
    (version) => {
      expect(isSupportedOpenCodeVersion(version)).toBe(false);
    },
  );
});

describe('normalizeBuilderMaxSteps', () => {
  it('defaults a missing or malformed budget instead of disabling the cap', () => {
    expect(normalizeBuilderMaxSteps(undefined)).toBe(DEFAULT_BUILDER_MAX_STEPS);
    expect(normalizeBuilderMaxSteps('not a number')).toBe(
      DEFAULT_BUILDER_MAX_STEPS,
    );
    expect(normalizeBuilderMaxSteps(Number.NaN)).toBe(
      DEFAULT_BUILDER_MAX_STEPS,
    );
  });

  it('clamps to the supported range', () => {
    expect(normalizeBuilderMaxSteps(1)).toBe(10);
    expect(normalizeBuilderMaxSteps(0)).toBe(10);
    expect(normalizeBuilderMaxSteps(1_000_000)).toBe(MAX_BUILDER_MAX_STEPS);
    expect(normalizeBuilderMaxSteps(250)).toBe(250);
    expect(normalizeBuilderMaxSteps('250')).toBe(250);
    expect(normalizeBuilderMaxSteps(250.9)).toBe(250);
  });
});
