/**
 * lib/studio/styling.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Global take styling defaults and duration sanitization.
 *
 * Kept separate from `types.ts` so both the main process (which writes the
 * default into a fresh row) and the renderer (which reads it for previews) can
 * import a value without pulling in timeline or render code.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { StudioStyling } from './types';

export const DEFAULT_STUDIO_STYLING: StudioStyling = {
  background: 'linear-gradient(135deg, #1e1b4b 0%, #0f172a 50%, #020617 100%)',
  borderRadius: 16,
  padding: 44,
  shadow: '0 25px 50px -12px rgba(0, 0, 0, 0.75)',
  aspectRatio: '16:9',
  zoomIntensity: 1.5,
  cameraEasing: 'smooth',
  showCaptions: true,
  captionStyle: 'karaoke',
  deviceFrame: {
    type: 'none',
    title: 'Showcase Demo',
    url: 'https://qeda.app',
    theme: 'dark',
    showControls: true,
  },
  introCard: {
    enabled: false,
    title: 'Product Walkthrough',
    subtitle: 'Built with Qeda Studio',
    badge: 'NEW RELEASE',
    durationMs: 3000,
    preset: 'minimal',
  },
  outroCard: {
    enabled: false,
    title: 'Try Qeda Today',
    subtitle: 'qeda.app • Open Source Agent OS',
    badge: 'GET STARTED',
    durationMs: 3000,
    preset: 'gradient',
  },
};

/**
 * True when a duration reported by a media element (in seconds) is usable for
 * seeking.
 *
 * Screen recordings come out of `MediaRecorder`, and its webm output carries no
 * duration in the container header — Chromium therefore reports
 * `video.duration === Infinity`. A truthiness guard passes that value happily
 * and the element then throws "provided double value is non-finite" the moment
 * `currentTime` is assigned, so `Infinity` must be rejected explicitly.
 */
export function isFiniteDurationSeconds(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * Coerces an untrusted duration into a finite, positive number of milliseconds.
 *
 * The take's own recorded duration is authoritative — it comes from the recorder
 * or a previously measured media length — whereas `HTMLMediaElement.duration` is
 * `Infinity` for headerless webm. Anything non-numeric, non-finite or
 * non-positive falls back, and the fallback is sanitized in turn so this can
 * never hand back `NaN`, `Infinity` or a negative length.
 */
export function safeDurationMs(value: unknown, fallbackMs: number): number {
  if (isFiniteDurationSeconds(value)) return value;
  return isFiniteDurationSeconds(fallbackMs) ? fallbackMs : 0;
}
