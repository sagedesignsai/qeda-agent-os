/**
 * FFT (Fast Fourier Transform) Implementation
 *
 * Cooley-Tukey radix-2 decimation-in-time (DIT) FFT algorithm.
 * Requires power-of-two input size.
 *
 * Used for offline audio analysis — not real-time.
 * Deterministic: same input → same output (bit-for-bit within a browser).
 *
 * References:
 * - Cooley & Tukey (1965): "An Algorithm for the Machine Calculation of Complex Fourier Series"
 * - https://en.wikipedia.org/wiki/Cooley%E2%80%93Tukey_FFT_algorithm
 */

/**
 * Complex number representation
 */
export interface Complex {
  real: number
  imag: number
}

/**
 * Compute magnitude (absolute value) of a complex number
 */
export function magnitude(c: Complex): number {
  return Math.sqrt(c.real * c.real + c.imag * c.imag)
}

/**
 * Compute magnitude squared (avoids sqrt for performance)
 */
export function magnitudeSquared(c: Complex): number {
  return c.real * c.real + c.imag * c.imag
}

/**
 * Compute phase angle of a complex number
 */
export function phase(c: Complex): number {
  return Math.atan2(c.imag, c.real)
}

/**
 * In-place Cooley-Tukey radix-2 DIT FFT
 *
 * @param real - Real components (modified in-place)
 * @param imag - Imaginary components (modified in-place)
 * @throws If input size is not a power of two
 */
export function fft(real: Float32Array, imag: Float32Array): void {
  const n = real.length

  if (n !== imag.length) {
    throw new Error("FFT: real and imag arrays must have the same length")
  }

  if (!isPowerOfTwo(n)) {
    throw new Error(`FFT: input size must be a power of two, got ${n}`)
  }

  if (n < 2) return

  // Bit-reversal permutation
  bitReversePermute(real, imag)

  // Cooley-Tukey decimation-in-time
  for (let size = 2; size <= n; size *= 2) {
    const halfSize = size / 2
    const tableStep = n / size

    for (let i = 0; i < n; i += size) {
      for (let j = i, k = 0; j < i + halfSize; j++, k += tableStep) {
        // Twiddle factor: W_n^k = e^(-2πi * k / n)
        const angle = (-2 * Math.PI * k) / n
        const twiddleReal = Math.cos(angle)
        const twiddleImag = Math.sin(angle)

        const tReal =
          twiddleReal * real[j + halfSize] - twiddleImag * imag[j + halfSize]
        const tImag =
          twiddleReal * imag[j + halfSize] + twiddleImag * real[j + halfSize]

        real[j + halfSize] = real[j] - tReal
        imag[j + halfSize] = imag[j] - tImag
        real[j] += tReal
        imag[j] += tImag
      }
    }
  }
}

/**
 * In-place inverse FFT
 */
export function ifft(real: Float32Array, imag: Float32Array): void {
  const n = real.length

  // Conjugate input
  for (let i = 0; i < n; i++) {
    imag[i] = -imag[i]
  }

  // Forward FFT
  fft(real, imag)

  // Conjugate output and scale
  for (let i = 0; i < n; i++) {
    real[i] /= n
    imag[i] = -imag[i] / n
  }
}

/**
 * Bit-reversal permutation (in-place)
 */
function bitReversePermute(real: Float32Array, imag: Float32Array): void {
  const n = real.length
  const bits = Math.log2(n)

  for (let i = 0; i < n; i++) {
    const j = reverseBits(i, bits)
    if (j > i) {
      // Swap real
      const tempR = real[i]
      real[i] = real[j]
      real[j] = tempR

      // Swap imag
      const tempI = imag[i]
      imag[i] = imag[j]
      imag[j] = tempI
    }
  }
}

/**
 * Reverse the bits of an integer
 */
function reverseBits(x: number, bits: number): number {
  let result = 0
  for (let i = 0; i < bits; i++) {
    result = (result << 1) | (x & 1)
    x >>= 1
  }
  return result
}

/**
 * Check if a number is a power of two
 */
function isPowerOfTwo(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0
}

/**
 * Window functions for spectral analysis
 */

/**
 * Hann window (raised cosine)
 * Recommended for general-purpose spectral analysis.
 */
export function hannWindow(size: number): Float32Array {
  const window = new Float32Array(size)
  for (let i = 0; i < size; i++) {
    window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)))
  }
  return window
}

/**
 * Hamming window
 */
export function hammingWindow(size: number): Float32Array {
  const window = new Float32Array(size)
  for (let i = 0; i < size; i++) {
    window[i] = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (size - 1))
  }
  return window
}

/**
 * Blackman window (better frequency resolution, higher sidelobe suppression)
 */
export function blackmanWindow(size: number): Float32Array {
  const window = new Float32Array(size)
  const alpha = 0.16
  const a0 = (1 - alpha) / 2
  const a1 = 0.5
  const a2 = alpha / 2

  for (let i = 0; i < size; i++) {
    const x = (2 * Math.PI * i) / (size - 1)
    window[i] = a0 - a1 * Math.cos(x) + a2 * Math.cos(2 * x)
  }
  return window
}

/**
 * Apply window function to a signal (in-place)
 */
export function applyWindow(signal: Float32Array, window: Float32Array): void {
  const n = Math.min(signal.length, window.length)
  for (let i = 0; i < n; i++) {
    signal[i] *= window[i]
  }
}

/**
 * Compute power spectrum (|X[k]|²) from FFT output
 */
export function powerSpectrum(
  real: Float32Array,
  imag: Float32Array
): Float32Array {
  const n = real.length
  const power = new Float32Array(n / 2 + 1) // Only positive frequencies + DC + Nyquist

  for (let i = 0; i <= n / 2; i++) {
    power[i] = real[i] * real[i] + imag[i] * imag[i]
  }

  return power
}

/**
 * Convert power to decibels (dB)
 * dB = 10 * log10(power / reference)
 */
export function powerToDb(power: number, reference = 1.0, minDb = -90): number {
  if (power <= 0) return minDb
  const db = 10 * Math.log10(power / reference)
  return Math.max(db, minDb)
}

/**
 * Compute frequency bin centers for a given FFT size and sample rate
 */
export function frequencyBins(
  fftSize: number,
  sampleRate: number
): Float32Array {
  const bins = new Float32Array(fftSize / 2 + 1)
  for (let i = 0; i <= fftSize / 2; i++) {
    bins[i] = (i * sampleRate) / fftSize
  }
  return bins
}
