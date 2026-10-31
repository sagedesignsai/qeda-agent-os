/**
 * components/motion/scene/motion-frame-clock.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Bridges the deterministic playback clock to R3F's demand-render invalidation.
 */

export function subscribeMotionFrameClock(
  clock: { subscribe(listener: () => void): () => void },
  invalidate: () => void,
): () => void {
  const unsubscribe = clock.subscribe(invalidate);
  // Demand mode otherwise waits for a playhead change and can show only a blank
  // clear color immediately after opening a document.
  invalidate();
  return unsubscribe;
}
