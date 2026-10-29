/**
 * src/lib/studio/audio-peaks.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure logic for bucketing raw PCM audio samples into normalized peak amplitudes
 * (0..1) suitable for timeline waveform rendering.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const PEAKS_PER_SECOND = 80;
export const MAX_PEAKS = 8000;

export interface ComputePeaksOptions {
  sampleRate: number;
  peaksPerSecond?: number;
  maxPeaks?: number;
  amplitudeScale?: number;
}

/**
 * Buckets an array of mono PCM Float32 samples (-1.0 to 1.0) into waveform peak heights (0.0 to 1.0).
 */
export function computePeaksFromFloat32(
  samples: Float32Array,
  options: ComputePeaksOptions,
): Float32Array {
  const sampleRate = options.sampleRate || 48000;
  const peaksPerSecond = options.peaksPerSecond ?? PEAKS_PER_SECOND;
  const maxPeaks = options.maxPeaks ?? MAX_PEAKS;
  const scale = options.amplitudeScale ?? 2.5;

  const totalDurationSec = samples.length / sampleRate;
  if (totalDurationSec <= 0 || samples.length === 0) {
    return new Float32Array(0);
  }

  const totalPeaks = Math.max(
    1,
    Math.min(Math.ceil(totalDurationSec * peaksPerSecond), maxPeaks),
  );
  const result = new Float32Array(totalPeaks);
  const samplesPerBucket = samples.length / totalPeaks;

  for (let b = 0; b < totalPeaks; b++) {
    const startIdx = Math.floor(b * samplesPerBucket);
    const endIdx = Math.min(
      samples.length,
      Math.floor((b + 1) * samplesPerBucket),
    );
    let sum = 0;
    let count = 0;
    for (let i = startIdx; i < endIdx; i++) {
      sum += Math.abs(samples[i]);
      count++;
    }
    const avg = count > 0 ? sum / count : 0;
    result[b] = Math.min(1, avg * scale);
  }

  return result;
}
