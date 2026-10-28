/**
 * lib/studio/timeline/ripple.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The two time axes of a Studio take, and the mapping between them.
 *
 * SOURCE time is what the recording file contains: `0 … take.durationMs`. Every
 * persisted element (cuts, zooms, captions, effects, overlays) is authored in
 * source time, so the database never has to be rewritten when an edit is
 * applied.
 *
 * COMPOSITION time is what the viewer sees: the source with every cut excised,
 * `0 … compositionDurationMs`. The timeline ruler, the playhead, the exported
 * file length and the total shown in the UI are all composition time.
 *
 * A cut is a *punch-out*: source `[startMs, endMs)` never reaches the output, and
 * everything after it moves earlier by the removed amount. That makes the
 * mapping piecewise-linear:
 *
 *     comp(source) = source − removedBefore(source)
 *
 * It is not invertible at a cut (the whole cut collapses to one comp instant),
 * so `sourceFromComp` resolves a seam to the end of the cut — i.e. seeking to a
 * removed region lands on the first frame that still exists.
 *
 * This module is pure and UI-free: the preview, the exporter and the timeline
 * projection all share it so the three can never disagree again.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** The minimal shape of a cut: the rest (id, reason) is carried through. */
export interface RippleCut {
  startMs: number;
  endMs: number;
}

export interface TimeRange {
  startMs: number;
  endMs: number;
}

/**
 * Sort, clamp and merge a cut list so it satisfies the invariants every other
 * function here relies on: ordered, non-overlapping, inside `[0, sourceDuration]`,
 * never zero-length. Idempotent.
 */
export function normalizeCuts<T extends RippleCut>(
  cuts: readonly T[] | undefined,
  sourceDurationMs: number,
): T[] {
  if (!cuts || cuts.length === 0) return [];

  const limit = Number.isFinite(sourceDurationMs)
    ? Math.max(0, sourceDurationMs)
    : 0;

  const clamped: T[] = [];
  for (const cut of cuts) {
    if (!cut) continue;
    const startMs = Math.max(0, Math.min(limit, cut.startMs));
    const endMs = Math.max(0, Math.min(limit, cut.endMs));
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) continue;
    if (endMs - startMs <= 0) continue;
    clamped.push({ ...cut, startMs, endMs });
  }

  clamped.sort((a, b) => a.startMs - b.startMs);

  const merged: T[] = [];
  for (const cut of clamped) {
    const previous = merged[merged.length - 1];
    if (previous && cut.startMs <= previous.endMs) {
      previous.endMs = Math.max(previous.endMs, cut.endMs);
      continue;
    }
    merged.push({ ...cut });
  }

  return merged;
}

/** Total source time removed by the cuts. */
export function removedDurationMs(cuts: readonly RippleCut[]): number {
  let total = 0;
  for (const cut of cuts) total += cut.endMs - cut.startMs;
  return total;
}

/** Source time removed strictly before `sourceMs`. */
export function removedMsBefore(
  sourceMs: number,
  cuts: readonly RippleCut[],
): number {
  let removed = 0;
  for (const cut of cuts) {
    if (sourceMs <= cut.startMs) break;
    removed += Math.min(sourceMs, cut.endMs) - cut.startMs;
  }
  return removed;
}

/** Map a source instant to composition time. Values inside a cut collapse to the seam. */
export function compFromSource(
  sourceMs: number,
  cuts: readonly RippleCut[],
): number {
  return sourceMs - removedMsBefore(sourceMs, cuts);
}

/**
 * Map a composition instant back to source time.
 *
 * A composition instant that sits on a cut seam resolves to the *end* of the
 * cut, so a seek can never land on a frame that has been removed.
 */
export function sourceFromComp(
  compMs: number,
  cuts: readonly RippleCut[],
): number {
  let removed = 0;
  for (const cut of cuts) {
    // `compMs === seam` is the instant the cut was excised from, so it must
    // resolve past the cut — landing on a removed frame would show a still.
    const seam = cut.startMs - removed;
    if (compMs < seam) break;
    removed += cut.endMs - cut.startMs;
  }
  return compMs + removed;
}

/** Output length of a take once every cut has been excised. */
export function compositionDurationMs(
  sourceDurationMs: number,
  cuts: readonly RippleCut[],
): number {
  const duration = Number.isFinite(sourceDurationMs) ? sourceDurationMs : 0;
  return Math.max(0, duration - removedDurationMs(cuts));
}

/** The cut containing `sourceMs`, if any. */
export function cutAt<T extends RippleCut>(
  sourceMs: number,
  cuts: readonly T[],
): T | null {
  for (const cut of cuts) {
    if (sourceMs < cut.startMs) return null;
    if (sourceMs < cut.endMs) return cut;
  }
  return null;
}

/** Source spans that survive the cuts, in order. */
export function keptSegments(
  sourceDurationMs: number,
  cuts: readonly RippleCut[],
): TimeRange[] {
  const duration = Number.isFinite(sourceDurationMs)
    ? Math.max(0, sourceDurationMs)
    : 0;
  if (duration <= 0) return [];
  if (cuts.length === 0) return [{ startMs: 0, endMs: duration }];

  const segments: TimeRange[] = [];
  let cursor = 0;
  for (const cut of cuts) {
    if (cut.startMs > cursor) {
      segments.push({ startMs: cursor, endMs: cut.startMs });
    }
    cursor = Math.max(cursor, cut.endMs);
  }
  if (cursor < duration) {
    segments.push({ startMs: cursor, endMs: duration });
  }
  return segments;
}

/**
 * Project a source-time range onto composition time.
 *
 * Returns `null` when the range lies entirely inside a cut — callers drop those
 * elements rather than rendering a zero-length clip. A range that straddles a
 * cut keeps its surviving parts: start and end are mapped independently, so the
 * excised middle simply closes up.
 */
export function compRangeFromSource(
  range: TimeRange,
  cuts: readonly RippleCut[],
): TimeRange | null {
  const startMs = compFromSource(range.startMs, cuts);
  const endMs = compFromSource(range.endMs, cuts);
  if (endMs - startMs <= 0) return null;
  return { startMs, endMs };
}

/** Inverse of {@link compRangeFromSource}. */
export function sourceRangeFromComp(
  range: TimeRange,
  cuts: readonly RippleCut[],
): TimeRange {
  return {
    startMs: sourceFromComp(range.startMs, cuts),
    endMs: sourceFromComp(range.endMs, cuts),
  };
}
