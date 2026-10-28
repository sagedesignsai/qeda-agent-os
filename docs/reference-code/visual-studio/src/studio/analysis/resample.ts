/**
 * Audio Resampler
 *
 * High-quality sample rate conversion using windowed-sinc interpolation
 * with a Kaiser window for anti-aliasing.
 *
 * Used to convert audio to the target analysis sample rate (22050 Hz)
 * before FFT processing.
 *
 * Algorithm: Time-domain sinc interpolation with Kaiser window
 * - Better quality than linear interpolation
 * - Deterministic (same input → same output)
 * - Computationally expensive (acceptable for offline analysis)
 *
 * References:
 * - Smith, J.O. "Digital Audio Resampling Home Page"
 * - https://ccrma.stanford.edu/~jos/resample/
 */

/**
 * Kaiser window Bessel function approximation (I₀)
 * Used for computing Kaiser window coefficients.
 */
function besselI0(x: number): number {
  let sum = 1.0
  let term = 1.0
  const xHalf = x / 2.0

  for (let i = 1; i <= 32; i++) {
    term *= (xHalf / i) ** 2
    sum += term
    if (term < 1e-12 * sum) break
  }

  return sum
}

/**
 * Generate Kaiser window coefficients
 *
 * @param size - Window size (must be odd)
 * @param beta - Shape parameter (controls trade-off between main lobe width and side lobe level)
 *               Typical values: 4-9. Higher = better stopband attenuation, wider transition.
 */
export function kaiserWindow(size: number, beta: number): Float32Array {
  const window = new Float32Array(size)
  const alpha = (size - 1) / 2
  const denom = besselI0(beta)

  for (let i = 0; i < size; i++) {
    const x = (i - alpha) / alpha
    window[i] = besselI0(beta * Math.sqrt(1 - x * x)) / denom
  }

  return window
}

/**
 * Windowed-sinc resampler configuration
 */
export interface ResampleConfig {
  /** Kaiser window beta parameter (default: 8.5 for good quality) */
  beta?: number
  /** Number of zero-crossings (filter length = 2 * zeros + 1) (default: 13) */
  zeros?: number
}

/**
 * Resample audio to a target sample rate
 *
 * @param input - Input audio samples (Float32Array)
 * @param inputSampleRate - Original sample rate (Hz)
 * @param outputSampleRate - Target sample rate (Hz)
 * @param config - Resampler configuration
 * @returns Resampled audio (Float32Array)
 */
export function resample(
  input: Float32Array,
  inputSampleRate: number,
  outputSampleRate: number,
  config: ResampleConfig = {}
): Float32Array {
  const { beta = 8.5, zeros = 13 } = config

  // No-op if sample rates match
  if (inputSampleRate === outputSampleRate) {
    return input.slice()
  }

  const ratio = outputSampleRate / inputSampleRate
  const outputLength = Math.floor(input.length * ratio)
  const output = new Float32Array(outputLength)
  if (outputLength === 0) return output

  // -------------------------------------------------------------------------
  // Polyphase windowed-sinc kernel
  //
  // Precomputing 256 fractional phases turns the inner loop into a plain
  // multiply-accumulate. Recomputing sin() per tap (the naive version) makes a
  // four-minute track take tens of seconds; this keeps resampling well inside
  // the analysis budget while remaining deterministic.
  // -------------------------------------------------------------------------
  const taps = zeros * 2
  const phases = 256
  const cutoff = Math.min(1, ratio) // anti-alias when downsampling
  const window = kaiserWindow(taps, beta)
  const kernels = new Float32Array(phases * taps)

  for (let p = 0; p < phases; p++) {
    const frac = p / phases
    let sum = 0

    for (let k = 0; k < taps; k++) {
      // Distance from the interpolation point to this source sample.
      const d = k - zeros + 1 - frac
      const x = d * cutoff
      const sinc =
        Math.abs(x) < 1e-9 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x)
      const value = sinc * window[k]
      kernels[p * taps + k] = value
      sum += value
    }

    // Normalise each phase so a DC signal passes at unity gain.
    if (Math.abs(sum) > 1e-12) {
      for (let k = 0; k < taps; k++) kernels[p * taps + k] /= sum
    }
  }

  const firstTapOffset = -zeros + 1

  for (let i = 0; i < outputLength; i++) {
    const inputPos = i / ratio
    const base = Math.floor(inputPos)
    const frac = inputPos - base
    const phase = Math.min(phases - 1, Math.round(frac * phases))
    const kernelOffset = phase * taps
    const sourceStart = base + firstTapOffset

    let sample = 0
    for (let k = 0; k < taps; k++) {
      const srcIndex = sourceStart + k
      if (srcIndex >= 0 && srcIndex < input.length) {
        sample += input[srcIndex] * kernels[kernelOffset + k]
      }
    }

    output[i] = sample
  }

  return output
}

/**
 * Mix down multi-channel audio to mono
 *
 * @param audioBuffer - Web Audio API AudioBuffer
 * @returns Mono Float32Array (average of all channels)
 */
export function mixToMono(audioBuffer: AudioBuffer): Float32Array {
  const numChannels = audioBuffer.numberOfChannels
  const length = audioBuffer.length
  const mono = new Float32Array(length)

  if (numChannels === 1) {
    // Already mono, just copy
    audioBuffer.copyFromChannel(mono, 0)
    return mono
  }

  // Average all channels
  const tempChannel = new Float32Array(length)
  for (let c = 0; c < numChannels; c++) {
    audioBuffer.copyFromChannel(tempChannel, c)
    for (let i = 0; i < length; i++) {
      mono[i] += tempChannel[i]
    }
  }

  for (let i = 0; i < length; i++) {
    mono[i] /= numChannels
  }

  return mono
}

/**
 * Fast linear resampling (lower quality, but very fast)
 * Use for preview/debug only. Production should use windowed-sinc.
 */
export function resampleLinear(
  input: Float32Array,
  inputSampleRate: number,
  outputSampleRate: number
): Float32Array {
  if (inputSampleRate === outputSampleRate) {
    return input.slice()
  }

  const ratio = outputSampleRate / inputSampleRate
  const outputLength = Math.floor(input.length * ratio)
  const output = new Float32Array(outputLength)

  for (let i = 0; i < outputLength; i++) {
    const inputPos = i / ratio
    const inputIndex = Math.floor(inputPos)
    const frac = inputPos - inputIndex

    const sample1 = input[inputIndex] || 0
    const sample2 = input[Math.min(inputIndex + 1, input.length - 1)] || 0

    output[i] = sample1 * (1 - frac) + sample2 * frac
  }

  return output
}
