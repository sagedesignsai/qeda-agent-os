/**
 * lib/studio/render/audio-reactive.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure audio FFT frequency-band extraction and shader parameter modulation.
 *
 * Keeps audio analysis decoupled from WebGL rendering so both `shader-background`
 * and clip effects can react to `bass` / `mid` / `high` / `energy` uniformly.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { PlasmaShaderParams } from './shader-background';

export interface AudioReactiveBands {
  /** 0..1 low-frequency energy. */
  bass: number;
  /** 0..1 mid-range energy. */
  mid: number;
  /** 0..1 high-frequency energy. */
  high: number;
  /** 0..1 overall RMS-like energy. */
  energy: number;
}

function avgNormalized(bins: Uint8Array, start: number, end: number): number {
  if (end <= start || bins.length === 0) return 0;
  let sum = 0;
  const clampedEnd = Math.min(bins.length, end);
  for (let i = Math.max(0, start); i < clampedEnd; i++) {
    sum += bins[i];
  }
  const count = clampedEnd - Math.max(0, start);
  return count > 0 ? Math.max(0, Math.min(1, sum / (count * 255))) : 0;
}

/**
 * Split byte-valued FFT frequency bins (0..255) into normalized `bass`, `mid`,
 * `high`, and overall `energy` bands.
 */
export function extractAudioBands(bins: Uint8Array): AudioReactiveBands {
  if (bins.length === 0) {
    return { bass: 0, mid: 0, high: 0, energy: 0 };
  }
  const bassEnd = Math.max(1, Math.floor(bins.length * 0.12));
  const midEnd = Math.max(bassEnd + 1, Math.floor(bins.length * 0.45));

  const bass = avgNormalized(bins, 0, bassEnd);
  const mid = avgNormalized(bins, bassEnd, midEnd);
  const high = avgNormalized(bins, midEnd, bins.length);
  const energy = Math.max(0, Math.min(1, bass * 0.5 + mid * 0.35 + high * 0.15));

  return { bass, mid, high, energy };
}

/**
 * Modulate `PlasmaShaderParams` warp & line density using extracted audio bands.
 */
export function modulatePlasmaWithAudio(
  base: PlasmaShaderParams,
  bands: AudioReactiveBands,
  amount = 1,
): PlasmaShaderParams {
  const k = Math.max(0, Math.min(2, amount));
  return {
    ...base,
    warp: base.warp + bands.bass * 1.4 * k,
    lineCount: Math.max(1, Math.round(base.lineCount + bands.mid * 6 * k)),
  };
}
