/**
 * sampling.ts — Feature store and frame-accurate sampling.
 *
 * Pure functions only — no side effects, fully unit-testable.
 * Designed to run inside the render worker on every animation frame.
 */

import type { FeatureArtifact } from "../analysis/format"
import type { FeatureName } from "./types"

// ---------------------------------------------------------------------------
// FeatureStore — flattened, worker-ready representation of a FeatureArtifact
// ---------------------------------------------------------------------------

export type FeatureStore = {
  /** Frames per second (derived from sampleRate / hopSize) */
  frameRate: number
  /** Total number of analysis frames */
  frameCount: number
  /** Duration in seconds */
  duration: number
  /** Number of frequency bands */
  bandCount: number
  /** Band energies: frameCount × bandCount, uint8 quantized */
  bands: Uint8Array
  /** RMS energy per frame, uint8 quantized */
  rms: Uint8Array
  /** Onset envelope per frame, uint8 quantized */
  onset: Uint8Array
  /** Beat times in seconds */
  beatTimes: Float32Array
  /** Estimated tempo in BPM */
  tempoBpm: number
}

// ---------------------------------------------------------------------------
// buildFeatureStore
// ---------------------------------------------------------------------------

/**
 * Convert a decoded FeatureArtifact into the flat FeatureStore used by the worker.
 */
export function buildFeatureStore(artifact: FeatureArtifact): FeatureStore {
  const duration =
    artifact.frameCount > 0 ? artifact.frameCount / artifact.frameRate : 0

  return {
    frameRate: artifact.frameRate,
    frameCount: artifact.frameCount,
    duration,
    bandCount: artifact.bandCount,
    bands: artifact.bandEnergies,
    rms: artifact.rms,
    onset: artifact.onset,
    beatTimes: artifact.beatTimes,
    tempoBpm: artifact.tempoBpm ?? 0,
  }
}

// ---------------------------------------------------------------------------
// sampleAt — linear interpolation between adjacent frames
// ---------------------------------------------------------------------------

/**
 * Sample all audio features at time `t` (seconds).
 * Returns a record mapping every FeatureName to a value in [0, 1].
 *
 * Algorithm:
 *  i = floor(t * frameRate), clamped to [0, frameCount-2]
 *  f = fractional part for lerp
 *  Each band: lerp(bands[i*bc+b], bands[(i+1)*bc+b], f) / 255
 *  rms / onset: same lerp pattern
 *  beat: 1 if any beatTime is within 80 ms of t, else 0
 *  tempo: tempoBpm / 180 (normalised, capped at 1)
 */
export function sampleAt(
  store: FeatureStore,
  t: number
): Record<FeatureName, number> {
  const { frameRate, frameCount, bandCount, bands, rms, onset } = store

  // Guard: empty store
  if (frameCount === 0 || frameRate === 0) {
    return emptyFeatureRecord()
  }

  // Frame index & fractional offset. With a single frame there is no next
  // frame to interpolate towards, so repeat frame zero. Clamp to the final
  // frame rather than extrapolating past the end of the timeline.
  const raw = Math.min(Math.max(0, t) * frameRate, Math.max(0, frameCount - 1))
  const lastIndex = Math.max(0, frameCount - 1)
  const i = Math.min(Math.floor(raw), lastIndex)
  const f = i < lastIndex ? raw - i : 0
  const next = Math.min(i + 1, lastIndex)

  // Lerp helper
  const lerp = (a: number, b: number) => a * (1 - f) + b * f

  // Band values (8 named bands, mapped to band indices 0..bandCount-1)
  // We always expose 8 named bands; if artifact has fewer, clamp to last band.
  const bc = bandCount
  const bandSample = (b: number): number => {
    const bClamped = Math.min(b, bc - 1)
    const a0 = bands[i * bc + bClamped]
    const a1 = bands[next * bc + bClamped]
    return lerp(a0, a1) / 255
  }

  // RMS
  const rmsVal = lerp(rms[i], rms[next]) / 255

  // Onset
  const onsetVal = lerp(onset[i], onset[next]) / 255

  // Beat — 1 if within 80 ms window
  const beatVal = sampleBeat(store, t, 0)

  // Tempo — normalised against 180 BPM
  const tempoVal = Math.min(store.tempoBpm / 180, 1)

  return {
    bass: bandSample(0),
    lowMid: bandSample(1),
    mid: bandSample(2),
    highMid: bandSample(3),
    high: bandSample(4),
    presence: bandSample(5),
    brilliance: bandSample(6),
    air: bandSample(7),
    rms: rmsVal,
    onset: onsetVal,
    beat: beatVal,
    tempo: tempoVal,
  }
}

// ---------------------------------------------------------------------------
// updateEnvelope — one-pole IIR envelope follower
// ---------------------------------------------------------------------------

/**
 * One-pole envelope follower.
 *
 * Uses separate attack / release time constants (in seconds).
 * Updates `state.value` in-place and returns the new value.
 *
 * @param state   Mutable envelope state (holds the current output level)
 * @param input   New input sample [0, 1]
 * @param smoothing  Combined smoothing coefficient [0, 1]; used when not differentiating A/R.
 *                   Here we interpret it as the release coefficient and use smoothing*0.5 for attack.
 * @param dt      Time step in seconds (typically 1/fps)
 */
export type EnvelopeState = { value: number }

export function updateEnvelope(
  state: EnvelopeState,
  input: number,
  smoothing: number,
  dt: number
): number {
  // smoothing=0 → near-instant; smoothing=1 → a 0.5 s time constant.
  // α = 1 - exp(-dt / τ), the standard one-pole coefficient.
  const tau = Math.max(0.001, smoothing * 0.5)
  const alpha = 1 - Math.exp(-Math.max(0, dt) / tau)
  state.value += (input - state.value) * alpha
  return state.value
}

// ---------------------------------------------------------------------------
// sampleBeat — detect beat proximity
// ---------------------------------------------------------------------------

/** Window (seconds) within which a beat is considered "active" */
const BEAT_WINDOW_S = 0.08 // 80 ms

/**
 * Returns 1 if time `t` is within 80 ms of any beat time, otherwise 0.
 *
 * The `dt` parameter is accepted for future 1-frame-decay logic but
 * the simple proximity check is sufficient for the worker's use case
 * (the render loop calls this every frame, so the beat is live for
 * exactly as many frames as fall within the 80 ms window).
 */
export function sampleBeat(
  store: FeatureStore,
  t: number,
  _dt: number
): number {
  const { beatTimes } = store
  if (beatTimes.length === 0) return 0

  // Beat times are sorted; binary-search for the nearest candidate.
  let lo = 0
  let hi = beatTimes.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const value = beatTimes[mid]
    if (Math.abs(value - t) <= BEAT_WINDOW_S) return 1
    if (value < t) lo = mid + 1
    else hi = mid - 1
  }
  return 0
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function emptyFeatureRecord(): Record<FeatureName, number> {
  return {
    bass: 0,
    lowMid: 0,
    mid: 0,
    highMid: 0,
    high: 0,
    presence: 0,
    brilliance: 0,
    air: 0,
    rms: 0,
    onset: 0,
    beat: 0,
    tempo: 0,
  }
}
