/**
 * __tests__/studio-ripple.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The source ↔ composition time mapping that dead-air cuts depend on.
 *
 * These are the invariants the preview, the exporter and the timeline
 * projection all trust; if they drift, the three disagree about video length.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  compFromSource,
  compRangeFromSource,
  compositionDurationMs,
  cutAt,
  keptSegments,
  normalizeCuts,
  removedDurationMs,
  sourceFromComp,
  sourceRangeFromComp,
} from '../lib/studio/timeline/ripple';

const cuts = normalizeCuts(
  [
    { id: 'a', startMs: 6000, endMs: 7500 },
    { id: 'b', startMs: 9000, endMs: 9500 },
  ],
  12000,
);

describe('normalizeCuts', () => {
  it('sorts, merges overlapping and adjacent cuts, and clamps to the take', () => {
    const normalized = normalizeCuts(
      [
        { id: 'b', startMs: 500, endMs: 900 },
        { id: 'a', startMs: 200, endMs: 500 },
        { id: 'c', startMs: 800, endMs: 1200 },
        { id: 'tail', startMs: 1800, endMs: 9999 },
        { id: 'zero', startMs: 1500, endMs: 1500 },
      ],
      2000,
    );

    expect(normalized.map((c) => [c.startMs, c.endMs])).toEqual([
      [200, 1200],
      [1800, 2000],
    ]);
  });

  it('is idempotent', () => {
    expect(normalizeCuts(cuts, 12000)).toEqual(cuts);
  });

  it('returns an empty list for no cuts', () => {
    expect(normalizeCuts(undefined, 12000)).toEqual([]);
    expect(normalizeCuts([], 12000)).toEqual([]);
  });
});

describe('time mapping', () => {
  it('removes the cut spans from the composition duration', () => {
    expect(removedDurationMs(cuts)).toBe(2000);
    expect(compositionDurationMs(12000, cuts)).toBe(10000);
    expect(compositionDurationMs(12000, [])).toBe(12000);
  });

  it('shifts everything after a cut earlier', () => {
    expect(compFromSource(0, cuts)).toBe(0);
    expect(compFromSource(6000, cuts)).toBe(6000);
    expect(compFromSource(7000, cuts)).toBe(6000); // inside the cut
    expect(compFromSource(7500, cuts)).toBe(6000);
    expect(compFromSource(8000, cuts)).toBe(6500);
    expect(compFromSource(9500, cuts)).toBe(7500);
    expect(compFromSource(12000, cuts)).toBe(10000);
  });

  it('round-trips source times that survive the cut', () => {
    for (const sourceMs of [0, 1, 5999, 7500, 8000, 12000]) {
      expect(sourceFromComp(compFromSource(sourceMs, cuts), cuts)).toBe(
        sourceMs,
      );
    }
  });

  it('resolves a cut seam to the first surviving frame', () => {
    expect(sourceFromComp(6000, cuts)).toBe(7500);
    expect(sourceFromComp(0, cuts)).toBe(0);
    expect(sourceFromComp(10000, cuts)).toBe(12000);
  });

  it('reports which cut a source instant falls inside', () => {
    expect(cutAt(7000, cuts)?.id).toBe('a');
    expect(cutAt(9200, cuts)?.id).toBe('b');
    // Half-open [start, end): the first removed frame is `start`, the first
    // surviving frame is `end`.
    expect(cutAt(6000, cuts)?.id).toBe('a');
    expect(cutAt(7500, cuts)).toBeNull();
    expect(cutAt(11000, cuts)).toBeNull();
  });

  it('lists the surviving source spans', () => {
    expect(keptSegments(12000, cuts)).toEqual([
      { startMs: 0, endMs: 6000 },
      { startMs: 7500, endMs: 9000 },
      { startMs: 9500, endMs: 12000 },
    ]);
    expect(keptSegments(12000, [])).toEqual([{ startMs: 0, endMs: 12000 }]);
    expect(keptSegments(0, [])).toEqual([]);
  });
});

describe('range projection', () => {
  it('projects a range that sits entirely before a cut unchanged', () => {
    expect(compRangeFromSource({ startMs: 1000, endMs: 4000 }, cuts)).toEqual({
      startMs: 1000,
      endMs: 4000,
    });
  });

  it('closes a range up across an excised middle', () => {
    // 5000 → 8000 spans the 6000-7500 cut.
    expect(compRangeFromSource({ startMs: 5000, endMs: 8000 }, cuts)).toEqual({
      startMs: 5000,
      endMs: 6500,
    });
  });

  it('drops a range that lives entirely inside a cut', () => {
    expect(
      compRangeFromSource({ startMs: 6200, endMs: 7000 }, cuts),
    ).toBeNull();
  });

  it('round-trips composition ranges back to source', () => {
    const projected = compRangeFromSource(
      { startMs: 5000, endMs: 8000 },
      cuts,
    )!;
    expect(sourceRangeFromComp(projected, cuts)).toEqual({
      startMs: 5000,
      endMs: 8000,
    });
  });
});
