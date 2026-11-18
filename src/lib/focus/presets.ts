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
  // Appended rather than prepended so the default block stays 25/5: the short
  // preset is the *entry* block, not a new default.
  { label: '10 / 5', work: 10, break: 5 },
] as const;

/**
 * The length of the first sitting after a plan has been made. The barrier is
 * starting, not working, so ignition promises ten minutes rather than a full
 * block — the user can always extend once the clock is running.
 */
export const IGNITION_PRESET_MINUTES = 10;

export function presetAt(index: number): FocusPreset {
  return DURATION_PRESETS[index] ?? DURATION_PRESETS[0];
}

/** Index of the preset with this many work minutes, or `fallback`. */
export function presetIndexForWorkMinutes(
  minutes: number,
  fallback = 0,
): number {
  const index = DURATION_PRESETS.findIndex((p) => p.work === minutes);
  return index === -1 ? fallback : index;
}

export const IGNITION_PRESET_INDEX = presetIndexForWorkMinutes(
  IGNITION_PRESET_MINUTES,
);
