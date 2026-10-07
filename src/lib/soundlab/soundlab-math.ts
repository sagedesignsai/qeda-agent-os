/**
 * lib/soundlab/soundlab-math.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure mathematical and musical conversion utilities for SoundLab:
 *   - MIDI pitch to frequency (Hz)
 *   - Musical beats to/from wall-clock seconds
 *   - Linear automation interpolation
 *   - Safe gain, pan, and amplitude envelope calculations
 * ─────────────────────────────────────────────────────────────────────────────
 */

export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function beatToSeconds(beat: number, bpm: number): number {
  return beat * (60 / bpm);
}

export function secondsToBeat(sec: number, bpm: number): number {
  return sec / (60 / bpm);
}

/** Linear interpolation between two automation points. */
export function interpolateAutomation(
  points: Array<{ beat: number; value: number }>,
  beat: number,
): number | null {
  if (!points.length) return null;
  if (beat <= points[0].beat) return points[0].value;
  if (beat >= points[points.length - 1].beat)
    return points[points.length - 1].value;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (beat >= a.beat && beat <= b.beat) {
      const t = (beat - a.beat) / (b.beat - a.beat);
      return a.value + (b.value - a.value) * t;
    }
  }
  return null;
}

export function clamp(v: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, v));
}

export function getTrackOutputGain(
  volume: number,
  muted: boolean,
  solo: boolean,
  hasAudibleSolo: boolean,
): number {
  return muted || (hasAudibleSolo && !solo) ? 0 : clamp(volume);
}

/** Unipolar AM envelope coefficients; resulting gain stays in [1-depth, 1]. */
export function getAmEnvelope(depth: number): {
  offset: number;
  amplitude: number;
} {
  const safeDepth = clamp(depth);
  return { offset: 1 - safeDepth / 2, amplitude: safeDepth / 2 };
}

type AudioCtor = typeof AudioContext;

export function getAudioCtorSafe(): AudioCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    AudioContext?: AudioCtor;
    webkitAudioContext?: AudioCtor;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}
