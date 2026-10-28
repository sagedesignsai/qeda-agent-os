/**
 * Audio Feature Extraction Pipeline
 *
 * Implements the full STFT-based feature extraction for Sonic Genius Studio.
 * Processes a mono Float32Array at the target sample rate and returns a
 * compact FeatureArtifact containing band energies, RMS, onset envelope,
 * beat times, and estimated tempo.
 *
 * Pipeline overview:
 * 1. STFT loop — hop through audio, apply Hann window, run FFT
 * 2. Per-frame — 8-band energy (quantized dB) + RMS dB
 * 3. Onset envelope — positive spectral flux, 3-frame moving average
 * 4. Beat detection — adaptive threshold peak-picking on onset envelope
 * 5. Tempo — autocorrelation of onset envelope over 4-second windows
 * 6. Assemble and return FeatureArtifact
 */

import {
  fft,
  hannWindow,
  applyWindow,
  powerSpectrum,
  powerToDb,
  frequencyBins,
} from "./fft"
import { ANALYSIS_VERSION } from "./config"
import type { FeatureArtifact } from "./format"
import type { AnalysisConfig } from "./config"

// ---------------------------------------------------------------------------
// Exported helper: RMS
// ---------------------------------------------------------------------------

/**
 * Compute the RMS energy of a PCM frame in decibels.
 *
 * RMS = sqrt(mean(x²))
 * dB  = 20 * log10(rms)   — amplitude decibels, clamped to [-90, 0]
 *
 * @param frame - Raw PCM samples (any length)
 * @returns dB value in the range [-90, 0]
 */
export function computeRms(frame: Float32Array): number {
  const n = frame.length
  if (n === 0) return -90

  let sumSq = 0
  for (let i = 0; i < n; i++) {
    sumSq += frame[i] * frame[i]
  }

  const rms = Math.sqrt(sumSq / n)
  if (rms <= 0) return -90

  // 20*log10 converts amplitude RMS to dBFS; clamp to [-90, 0]
  const db = 20 * Math.log10(rms)
  return Math.max(-90, Math.min(0, db))
}

// ---------------------------------------------------------------------------
// Exported helper: Band energies
// ---------------------------------------------------------------------------

/**
 * Compute quantized band energies for one STFT frame.
 *
 * For each of the N bands defined by `bandEdgesHz`:
 *   1. Sum |X[k]|² for all FFT bins whose centre frequency falls in [lo, hi)
 *   2. Normalize for the unscaled FFT, then convert power to dB (10*log10),
 *      clamped to [minDb, 0]
 *   3. Quantize to uint8: round((db - minDb) / (maxDb - minDb) * 255)
 *
 * @param power      - Power spectrum: |X[k]|² for k = 0 … fftSize/2 (inclusive)
 * @param freqBins   - Frequency of each bin (Hz), same length as `power`
 * @param bandEdgesHz - Band edge frequencies (Hz); length = bandCount + 1
 * @param minDb      - Lower dB clamp (typically -90)
 * @param maxDb      - Upper dB clamp (typically 0)
 * @returns Uint8Array of length bandCount
 */
export function extractBandEnergies(
  power: Float32Array,
  freqBins: Float32Array,
  bandEdgesHz: readonly number[],
  minDb: number,
  maxDb: number
): Uint8Array {
  const bandCount = bandEdgesHz.length - 1
  const result = new Uint8Array(bandCount)
  const dbRange = maxDb - minDb
  // fft() returns an unscaled transform, so raw power grows with N² and
  // otherwise clips nearly every non-silent band at maxDb. Normalize before
  // quantizing to preserve useful level variation across ordinary audio.
  const fftSize = (power.length - 1) * 2
  const powerScale = fftSize * fftSize

  for (let b = 0; b < bandCount; b++) {
    const lo = bandEdgesHz[b]
    const hi = bandEdgesHz[b + 1]

    // Sum power for all bins in [lo, hi)
    let bandPower = 0
    for (let k = 0; k < freqBins.length; k++) {
      const f = freqBins[k]
      if (f >= lo && f < hi) {
        bandPower += power[k]
      }
    }

    // Convert to dB, clamp to [minDb, maxDb]
    const db = Math.max(
      minDb,
      Math.min(maxDb, powerToDb(bandPower / powerScale, 1.0, minDb))
    )

    // Quantize to [0, 255]
    result[b] = Math.round(((db - minDb) / dbRange) * 255)
  }

  return result
}

// ---------------------------------------------------------------------------
// Exported helper: Tempo estimation
// ---------------------------------------------------------------------------

/**
 * Estimate the dominant tempo from an onset envelope via autocorrelation.
 *
 * Algorithm:
 * 1. Split `onset` into overlapping 4-second windows.
 * 2. For each window compute the normalised autocorrelation.
 * 3. Scan only lags that correspond to 60–180 BPM.
 * 4. Accumulate the autocorrelation across windows.
 * 5. The lag with the highest accumulated value → BPM.
 * 6. Return null when the peak is not confidently above the background.
 *
 * @param onset     - Quantized onset envelope (uint8-range values in a Float32Array)
 * @param frameRate - Frames per second (sampleRate / hopSize)
 * @param minBpm    - Minimum BPM to consider (typically 60)
 * @param maxBpm    - Maximum BPM to consider (typically 180)
 * @returns Estimated BPM (float) or null if no confident estimate
 */
export function estimateTempo(
  onset: Float32Array,
  frameRate: number,
  minBpm: number,
  maxBpm: number
): number | null {
  const windowFrames = Math.round(4.0 * frameRate) // 4-second window
  const totalFrames = onset.length

  if (totalFrames < windowFrames / 2) {
    // Too short for reliable autocorrelation
    return null
  }

  // Lag range corresponding to [minBpm, maxBpm]
  // lag = 60 / BPM * frameRate
  const lagMin = Math.ceil((60 / maxBpm) * frameRate)
  const lagMax = Math.floor((60 / minBpm) * frameRate)

  if (lagMin > lagMax || lagMin < 1) return null

  // Accumulate autocorrelation over windows
  const acf = new Float64Array(lagMax + 1)
  let windowCount = 0

  const stepFrames = Math.round(windowFrames / 2) // 50 % overlap

  for (
    let start = 0;
    start + windowFrames <= totalFrames;
    start += stepFrames
  ) {
    const win = onset.subarray(start, start + windowFrames)

    // Remove mean to get zero-centred signal
    let mean = 0
    for (let i = 0; i < win.length; i++) mean += win[i]
    mean /= win.length

    // Variance (energy at lag 0) for normalisation
    let energy = 0
    for (let i = 0; i < win.length; i++) {
      const v = win[i] - mean
      energy += v * v
    }
    if (energy < 1e-6) continue // silent window — skip

    // Compute autocorrelation for lags in our BPM range only
    for (let lag = lagMin; lag <= lagMax; lag++) {
      let sum = 0
      const len = win.length - lag
      for (let i = 0; i < len; i++) {
        sum += (win[i] - mean) * (win[i + lag] - mean)
      }
      // Normalise by energy so all windows contribute equally
      acf[lag] += sum / energy
    }

    windowCount++
  }

  if (windowCount === 0) return null

  // Find lag with highest accumulated ACF value
  let bestLag = lagMin
  let bestVal = acf[lagMin]
  for (let lag = lagMin + 1; lag <= lagMax; lag++) {
    if (acf[lag] > bestVal) {
      bestVal = acf[lag]
      bestLag = lag
    }
  }

  // Confidence check: peak must be > 0.2 of the maximum possible (= windowCount)
  const confidenceThreshold = 0.2 * windowCount
  if (bestVal < confidenceThreshold) return null

  // Convert lag to BPM
  const bpm = (60 * frameRate) / bestLag
  return bpm
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

/**
 * Run the full STFT feature extraction pipeline on a mono audio signal.
 *
 * @param mono        - Mono PCM samples at `sampleRate` Hz
 * @param sampleRate  - Sample rate of `mono` (must equal config.targetSampleRate)
 * @param config      - Analysis configuration
 * @param onProgress  - Optional callback receiving progress [0, 100]
 * @returns           FeatureArtifact ready to be encoded
 */
export async function extractFeatures(
  mono: Float32Array,
  sampleRate: number,
  config: AnalysisConfig,
  onProgress?: (percent: number) => void
): Promise<FeatureArtifact> {
  const { fftSize, hopSize, bandEdgesHz, minDb, maxDb } = config

  // Pre-compute reusable objects
  const window = hannWindow(fftSize)
  const freqBinsArray = frequencyBins(fftSize, sampleRate)
  const frameRate = sampleRate / hopSize

  // Total frame count (including partial last frame)
  const totalFrames =
    Math.ceil(Math.max(0, mono.length - fftSize) / hopSize) + 1
  const clampedFrames = Math.max(1, totalFrames)
  const bandCount = bandEdgesHz.length - 1

  // Pre-allocate output arrays
  const bandEnergies = new Uint8Array(clampedFrames * bandCount)
  const rms = new Uint8Array(clampedFrames)
  // Float64 accumulator for band energies per frame (reused across frames)
  const bandDbPerFrame = new Float32Array(clampedFrames * bandCount)

  // Working buffers for the FFT (reused each frame)
  const real = new Float32Array(fftSize)
  const imag = new Float32Array(fftSize)

  // ----- Phase 1: STFT loop + per-frame features -----

  // Progress reporting: one 10% checkpoint every 10% of frames
  const progressStep = Math.max(1, Math.floor(clampedFrames / 10))
  let lastProgressPct = -1

  for (let frame = 0; frame < clampedFrames; frame++) {
    const sampleStart = frame * hopSize

    // Extract frame samples into real[], zero-pad if near end
    real.fill(0)
    imag.fill(0)
    const available = Math.max(0, Math.min(fftSize, mono.length - sampleStart))
    if (available > 0) {
      real.set(mono.subarray(sampleStart, sampleStart + available))
    }

    // Apply Hann window (in-place on real)
    applyWindow(real, window)

    // FFT in-place
    fft(real, imag)

    // Power spectrum |X[k]|² for positive frequencies
    const power = powerSpectrum(real, imag)

    // Compute 8-band energies for this frame
    const bands = extractBandEnergies(
      power,
      freqBinsArray,
      bandEdgesHz,
      minDb,
      maxDb
    )
    bandEnergies.set(bands, frame * bandCount)

    // Store raw dB values for onset flux computation (before quantization)
    for (let b = 0; b < bandCount; b++) {
      // Convert back from quantized uint8 to dB for flux computation
      // This avoids a second pass; we store the quantized uint8 float equivalent
      bandDbPerFrame[frame * bandCount + b] = bands[b]
    }

    // RMS dB of the raw (un-windowed) frame PCM
    const rawFrame = mono.subarray(sampleStart, sampleStart + available)
    const rmsDb = computeRms(rawFrame)
    // Quantize RMS dB to uint8 using the same [minDb, maxDb] scale
    rms[frame] = Math.round(
      ((Math.max(minDb, Math.min(maxDb, rmsDb)) - minDb) / (maxDb - minDb)) *
        255
    )

    // Progress every 10% of frames
    if (frame % progressStep === 0) {
      const pct = Math.min(90, Math.round((frame / clampedFrames) * 90))
      if (pct !== lastProgressPct) {
        lastProgressPct = pct
        onProgress?.(pct)
      }
    }
  }

  // Yield to the event loop so the worker doesn't block during progress reporting
  await yieldToEventLoop()

  // ----- Phase 2: Onset envelope (positive spectral flux) -----

  const onsetFloat = new Float32Array(clampedFrames)

  for (let frame = 1; frame < clampedFrames; frame++) {
    let flux = 0
    for (let b = 0; b < bandCount; b++) {
      const diff =
        bandDbPerFrame[frame * bandCount + b] -
        bandDbPerFrame[(frame - 1) * bandCount + b]
      if (diff > 0) flux += diff
    }
    onsetFloat[frame] = flux
  }
  // frame 0 = 0 (no previous frame)

  // 3-frame moving average smoothing
  const onsetSmoothed = new Float32Array(clampedFrames)
  for (let frame = 0; frame < clampedFrames; frame++) {
    let sum = onsetFloat[frame]
    let count = 1
    if (frame > 0) {
      sum += onsetFloat[frame - 1]
      count++
    }
    if (frame < clampedFrames - 1) {
      sum += onsetFloat[frame + 1]
      count++
    }
    onsetSmoothed[frame] = sum / count
  }

  // Quantize onset to uint8
  const onsetMax = onsetSmoothed.reduce((m, v) => Math.max(m, v), 1e-6)
  const onset = new Uint8Array(clampedFrames)
  for (let frame = 0; frame < clampedFrames; frame++) {
    onset[frame] = Math.round((onsetSmoothed[frame] / onsetMax) * 255)
  }

  // ----- Phase 3: Beat detection (adaptive threshold peak-picking) -----

  const windowFrames4s = Math.round(4.0 * frameRate)
  const halfWin = Math.floor(windowFrames4s / 2)
  const beatFrames: number[] = []

  // We need a minimum spacing between beats to avoid double-detections.
  // At 60 BPM, the slowest beat spacing is 1 second = frameRate frames.
  const minBeatSpacingFrames = Math.round(frameRate * 0.25) // allow up to 240 BPM
  let lastBeatFrame = -minBeatSpacingFrames

  for (let frame = 0; frame < clampedFrames; frame++) {
    // Sliding window: [frame - halfWin, frame + halfWin]
    const lo = Math.max(0, frame - halfWin)
    const hi = Math.min(clampedFrames, frame + halfWin + 1)

    // Compute mean and std of onset in the window
    let mean = 0
    const winLen = hi - lo
    for (let i = lo; i < hi; i++) mean += onsetSmoothed[i]
    mean /= winLen

    let variance = 0
    for (let i = lo; i < hi; i++) {
      const d = onsetSmoothed[i] - mean
      variance += d * d
    }
    const std = Math.sqrt(variance / winLen)

    const threshold = mean + 0.3 * std

    // Peak: current value is a local maximum and exceeds the adaptive threshold
    const curr = onsetSmoothed[frame]
    const prev = frame > 0 ? onsetSmoothed[frame - 1] : 0
    const next = frame < clampedFrames - 1 ? onsetSmoothed[frame + 1] : 0

    if (
      curr > threshold &&
      curr >= prev &&
      curr >= next &&
      frame - lastBeatFrame >= minBeatSpacingFrames
    ) {
      beatFrames.push(frame)
      lastBeatFrame = frame
    }
  }

  // Convert beat frames to seconds
  const beatTimes = new Float32Array(beatFrames.length)
  for (let i = 0; i < beatFrames.length; i++) {
    beatTimes[i] = beatFrames[i] / frameRate
  }

  // ----- Phase 4: Tempo estimation -----

  const tempoBpm = estimateTempo(
    onsetSmoothed,
    frameRate,
    config.minBpm,
    config.maxBpm
  )

  // Final progress
  onProgress?.(100)

  // ----- Assemble FeatureArtifact -----

  const bandEdgesArray = new Float32Array(bandEdgesHz.length)
  for (let i = 0; i < bandEdgesHz.length; i++) {
    bandEdgesArray[i] = bandEdgesHz[i]
  }

  return {
    analysisVersion: ANALYSIS_VERSION,
    sampleRate,
    fftSize,
    hopSize,
    bandCount,
    frameCount: clampedFrames,
    frameRate,
    bandEdges: bandEdgesArray,
    tempoBpm,
    bandEnergies,
    rms,
    onset,
    beatTimes,
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Yield execution to the event loop.
 * In a Web Worker this allows progress messages to be flushed between phases.
 */
function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}
