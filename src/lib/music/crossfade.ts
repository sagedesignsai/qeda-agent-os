/**
 * lib/music/crossfade.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Gain curves for track transitions. Equal-power (sin/cos) rather than linear:
 * two linear ramps sum to a −3 dB dip in the middle of the fade, which is
 * audible as a hole in continuous mixes.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface FadeGains {
  /** Gain for the outgoing element, 0–1. */
  out: number;
  /** Gain for the incoming element, 0–1. */
  in: number;
}

/** `progress` is 0 → 1 through the fade. */
export function equalPowerFade(progress: number): FadeGains {
  const t = Math.min(1, Math.max(0, progress));
  const angle = (t * Math.PI) / 2;
  return { out: Math.cos(angle), in: Math.sin(angle) };
}

/** Seconds of fade actually used, capped by both the setting and the track. */
export function fadeSeconds(
  configured: number,
  durationMs: number,
  hasNext: boolean,
): number {
  if (!hasNext || configured <= 0) return 0;
  const durationSec = Math.max(0, durationMs / 1000);
  // Never consume more than a third of a short track.
  return Math.min(configured, durationSec / 3);
}

/** True when the active element is inside the fade window. */
export function shouldStartFade(
  positionMs: number,
  durationMs: number,
  fadeSec: number,
): boolean {
  if (fadeSec <= 0 || durationMs <= 0) return false;
  return positionMs >= durationMs - fadeSec * 1000;
}
