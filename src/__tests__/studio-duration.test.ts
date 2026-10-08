/**
 * __tests__/studio-duration.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Unit tests for Studio duration sanitization:
 *   - `MediaRecorder` webm reports `duration === Infinity` in Chromium, which
 *     passes a truthiness guard and then throws on `currentTime` assignment
 *   - the take's recorded duration must win over that non-finite value
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { isFiniteDurationSeconds, safeDurationMs } from '../lib/studio-types';

describe('isFiniteDurationSeconds', () => {
  it('accepts a positive finite duration in seconds', () => {
    expect(isFiniteDurationSeconds(12.5)).toBe(true);
  });

  it('rejects Infinity, NaN, zero, negatives and non-numbers', () => {
    expect(isFiniteDurationSeconds(Infinity)).toBe(false);
    expect(isFiniteDurationSeconds(-Infinity)).toBe(false);
    expect(isFiniteDurationSeconds(NaN)).toBe(false);
    expect(isFiniteDurationSeconds(0)).toBe(false);
    expect(isFiniteDurationSeconds(-1)).toBe(false);
    expect(isFiniteDurationSeconds('12')).toBe(false);
    expect(isFiniteDurationSeconds(null)).toBe(false);
    expect(isFiniteDurationSeconds(undefined)).toBe(false);
  });
});

describe('safeDurationMs', () => {
  it('returns a valid finite duration unchanged', () => {
    expect(safeDurationMs(4200, 10000)).toBe(4200);
    expect(safeDurationMs(1, 10000)).toBe(1);
  });

  it('falls back for Infinity, the webm duration case', () => {
    expect(safeDurationMs(Infinity, 8400)).toBe(8400);
    expect(safeDurationMs(-Infinity, 8400)).toBe(8400);
  });

  it('falls back for NaN', () => {
    expect(safeDurationMs(NaN, 8400)).toBe(8400);
  });

  it('falls back for zero and negative durations', () => {
    expect(safeDurationMs(0, 8400)).toBe(8400);
    expect(safeDurationMs(-250, 8400)).toBe(8400);
  });

  it('falls back for non-numeric input', () => {
    expect(safeDurationMs(undefined, 8400)).toBe(8400);
    expect(safeDurationMs(null, 8400)).toBe(8400);
    expect(safeDurationMs('8400', 8400)).toBe(8400);
    expect(safeDurationMs({}, 8400)).toBe(8400);
  });

  it('sanitizes the fallback too, returning 0 when both are unusable', () => {
    expect(safeDurationMs(Infinity, Infinity)).toBe(0);
    expect(safeDurationMs(Infinity, NaN)).toBe(0);
    expect(safeDurationMs(Infinity, 0)).toBe(0);
    expect(safeDurationMs(Infinity, -1)).toBe(0);
    expect(safeDurationMs(NaN, undefined as unknown as number)).toBe(0);
  });

  it('never returns a non-finite or non-positive value', () => {
    const hostile = [Infinity, -Infinity, NaN, 0, -1, undefined, null, 'x'];
    for (const value of hostile) {
      const result = safeDurationMs(value, 5000);
      expect(Number.isFinite(result)).toBe(true);
      expect(result).toBeGreaterThan(0);
    }
  });
});
