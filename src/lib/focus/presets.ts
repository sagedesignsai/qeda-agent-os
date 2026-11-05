/**
 * lib/focus/presets.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Focus block lengths. Shared by the Tasks modal and the global dock so the
 * preset labels cannot drift between the two surfaces.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface FocusPreset {
  label: string;
  work: number;
  break: number;
}

export const DURATION_PRESETS: readonly FocusPreset[] = [
  { label: '25 / 5', work: 25, break: 5 },
  { label: '50 / 10', work: 50, break: 10 },
] as const;

export function presetAt(index: number): FocusPreset {
  return DURATION_PRESETS[index] ?? DURATION_PRESETS[0];
}
