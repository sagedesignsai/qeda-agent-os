/**
 * lib/studio/render/prng.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Deterministic pseudo-random numbers for render passes.
 *
 * Canvas effect passes that use noise must not call `Math.random()`: preview and
 * export would then disagree, and two exports of the same project would produce
 * different pixels. Every noisy pass is parameterised by an explicit seed
 * instead.
 *
 * `mulberry32` is a small, fast, well-distributed 32-bit generator — plenty for
 * a grain tile, and stable across V8 versions because it is pure integer math.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** A deterministic `[0, 1)` generator. Same seed always yields the same run. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seed used to build the cached film-grain tile. Constant by design. */
export const GRAIN_TILE_SEED = 0x6d2b79f5;

/**
 * Animation seed for a frame. ~60 steps per second, so grain re-rolls at
 * roughly frame rate while remaining a pure function of composition time.
 */
export function effectSeedForTime(timeMs: number): number {
  return Math.floor(Math.max(0, timeMs) * 0.06) >>> 0;
}

/**
 * Deterministic grain stamp offset for a moment in composition time.
 *
 * Pure: the same timestamp always produces the same offset, which is what makes
 * the exported frame match the previewed frame.
 */
export function filmGrainOffset(
  timeMs: number,
  tileSize: number,
): { x: number; y: number } {
  const next = mulberry32(effectSeedForTime(timeMs));
  return { x: next() * tileSize, y: next() * tileSize };
}
