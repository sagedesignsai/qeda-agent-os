/**
 * lib/motion/random.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Deterministic PRNG for Motion. Every procedural and seeded layout must derive
 * from `mulberry32` so two renders of the same document produce byte-identical
 * geometry, which is what makes export frame-exact and snapshots reproducible.
 */

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededRange(rng: () => number, min: number, max: number): number {
  return min + (max - min) * rng();
}

export function seededInt(rng: () => number, min: number, max: number): number {
  return Math.floor(seededRange(rng, min, max + 1));
}