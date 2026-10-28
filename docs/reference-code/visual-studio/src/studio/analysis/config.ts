/**
 * Audio Analysis Configuration
 *
 * Fixed configuration for v1 audio analysis pipeline.
 * Any change to these values bumps ANALYSIS_VERSION and invalidates prior artifacts.
 */

/**
 * Analysis version constant
 * Bump this when any analysis parameter changes to invalidate cached analyses.
 */
export const ANALYSIS_VERSION = "sg-audio-v2" as const

/**
 * Target sample rate for analysis (Hz)
 * 22050 Hz is sufficient for music (Nyquist = 11025 Hz covers most musical content)
 * and keeps file sizes reasonable.
 */
export const TARGET_SAMPLE_RATE = 22050

/**
 * FFT window size (must be power of 2)
 * 2048 samples @ 22050 Hz ≈ 93 ms window → good time/frequency resolution for music
 */
export const FFT_SIZE = 2048

/**
 * Hop size (samples between consecutive frames)
 * 512 samples @ 22050 Hz ≈ 23 ms → ~43 frames/second
 */
export const HOP_SIZE = 512

/**
 * Window function type
 */
export const WINDOW_TYPE = "hann" as const

/**
 * Number of log-spaced frequency bands
 */
export const BAND_COUNT = 8

/**
 * Band edge frequencies (Hz)
 * Log-spaced from 40 Hz (sub-bass) to 16000 Hz (high treble)
 *
 * Bands:
 * 0: Bass (40-120 Hz) - kick drum, bass guitar fundamental
 * 1: Low-mid (120-250 Hz) - low toms, male vocals fundamental
 * 2: Mid (250-500 Hz) - snare, female vocals fundamental
 * 3: Upper-mid (500-1000 Hz) - guitars, brass
 * 4: Presence (1000-2000 Hz) - vocals presence, guitars
 * 5: Brilliance (2000-4000 Hz) - cymbals attack, sibilance
 * 6: Air (4000-8000 Hz) - hi-hats, breath
 * 7: Ultra (8000-16000 Hz) - shimmer, extreme highs
 */
export const BAND_EDGES_HZ = [
  40, 120, 250, 500, 1000, 2000, 4000, 8000, 16000,
] as const

/**
 * Band labels (for UI display)
 */
export const BAND_LABELS = [
  "bass",
  "lowMid",
  "mid",
  "highMid",
  "high",
  "presence",
  "brilliance",
  "air",
] as const

/**
 * dB range for quantization
 */
export const MIN_DB = -90
export const MAX_DB = 0

/**
 * Onset detection parameters
 */
export const ONSET_THRESHOLD = 0.3 // Spectral flux threshold (0-1)
export const ONSET_SMOOTHING = 3 // Frames to smooth onset envelope

/**
 * Tempo estimation parameters
 */
export const MIN_BPM = 60
export const MAX_BPM = 180
export const TEMPO_WINDOW_SECONDS = 4.0 // Autocorrelation window

/**
 * Analysis configuration object (for runtime use)
 */
export interface AnalysisConfig {
  targetSampleRate: number
  fftSize: number
  hopSize: number
  windowType: "hann" | "hamming" | "blackman"
  bandCount: number
  bandEdgesHz: readonly number[]
  minDb: number
  maxDb: number
  onsetThreshold: number
  onsetSmoothing: number
  minBpm: number
  maxBpm: number
  tempoWindowSeconds: number
}

/**
 * Default analysis configuration
 */
export const DEFAULT_ANALYSIS_CONFIG: AnalysisConfig = {
  targetSampleRate: TARGET_SAMPLE_RATE,
  fftSize: FFT_SIZE,
  hopSize: HOP_SIZE,
  windowType: WINDOW_TYPE,
  bandCount: BAND_COUNT,
  bandEdgesHz: BAND_EDGES_HZ,
  minDb: MIN_DB,
  maxDb: MAX_DB,
  onsetThreshold: ONSET_THRESHOLD,
  onsetSmoothing: ONSET_SMOOTHING,
  minBpm: MIN_BPM,
  maxBpm: MAX_BPM,
  tempoWindowSeconds: TEMPO_WINDOW_SECONDS,
}

/**
 * Analysis metadata (returned to API)
 */
export interface AnalysisMeta {
  analysisVersion: string
  durationSeconds: number
  sampleRate: number
  fftSize: number
  hopSize: number
  bandCount: number
  frameCount: number
  frameRate: number
  bandEdges: Array<{ lo: number; hi: number; label: string }>
  tempoBpm: number | null
  featuresBytes: number
  featuresChecksum: string
}

/**
 * Convert raw band edges to structured format
 */
export function formatBandEdges(): Array<{
  lo: number
  hi: number
  label: string
}> {
  return BAND_LABELS.map((label, i) => ({
    lo: BAND_EDGES_HZ[i],
    hi: BAND_EDGES_HZ[i + 1],
    label,
  }))
}

/**
 * Compute frame rate
 */
export function computeFrameRate(sampleRate: number, hopSize: number): number {
  return sampleRate / hopSize
}

/**
 * Compute expected frame count for a duration
 */
export function computeFrameCount(
  durationSeconds: number,
  frameRate: number
): number {
  return Math.ceil(durationSeconds * frameRate)
}
