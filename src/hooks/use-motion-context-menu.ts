/**
 * hooks/use-motion-context-menu.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared context menu types for the Motion Editor. Each panel uses ShadCN
 * ContextMenu primitives directly and captures right‑click context via a
 * local ref, following the Studio timeline pattern.
 */

// ── Target types ─────────────────────────────────────────────────────────────

export type MotionContextTarget =
  | { type: 'scene-node'; nodeId: string }
  | { type: 'scene-track'; trackId: string }
  | { type: 'viewport'; nodeId?: string }
  | { type: 'timeline-key'; keyId: string; placementId: string; clipId: string; channelId: string }
  | { type: 'timeline-item'; itemId: string; rowId: string }
  | { type: 'timeline-row'; rowId: string }
  | { type: 'timeline-ruler' }
  | { type: 'empty' };
