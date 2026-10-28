/**
 * Audio Analysis Binary Format
 *
 * Custom binary container for storing FFT-based feature timelines.
 * Compact, deterministic, and includes metadata + checksum.
 *
 * File structure (little-endian):
 * --------------------------------
 * Header (variable size, ~64 bytes):
 *   0-3:   Magic "SGAF" (0x46414753)
 *   4-7:   Format version (uint32) = 1
 *   8-11:  Analysis version string length (uint32)
 *   12-N:  Analysis version (UTF-8 string, e.g., "sg-audio-v1")
 *   N+0-3: Sample rate (uint32)
 *   N+4-7: FFT size (uint32)
 *   N+8-11: Hop size (uint32)
 *   N+12-15: Band count (uint32)
 *   N+16-19: Frame count (uint32)
 *   N+20-23: Tempo BPM × 1000 (uint32, 0 if unknown)
 *   N+24-27: Band edges count (uint32)
 *   N+28...: Band edge frequencies (float32 each, Hz)
 *   ...: (padding to 64-byte alignment)
 *
 * Payload:
 *   Band energies: frameCount × bandCount (uint8 each, quantized dB)
 *   RMS: frameCount (uint8 each, quantized dB)
 *   Onset envelope: frameCount (uint8 each, quantized spectral flux)
 *   Beat count: uint32
 *   Beat times: beatCount × float32 (seconds)
 *
 * Total size for 4-min track @ 22050 Hz, hop 512:
 *   ~10,000 frames × 8 bands + 10,000 RMS + 10,000 onset + beats ≈ 180 KB
 */

const MAGIC = 0x46414753 // "SGAF" in little-endian
const FORMAT_VERSION = 1

/**
 * Feature timeline artifact (in-memory representation)
 */
export interface FeatureArtifact {
  /** Analysis version constant (for cache invalidation) */
  analysisVersion: string
  /** Audio sample rate (Hz) */
  sampleRate: number
  /** FFT window size */
  fftSize: number
  /** Hop size between frames */
  hopSize: number
  /** Number of frequency bands */
  bandCount: number
  /** Total number of STFT frames */
  frameCount: number
  /** Frames per second (derived from sampleRate / hopSize) */
  frameRate: number
  /** Band edge frequencies (Hz) */
  bandEdges: Float32Array
  /** Estimated tempo (BPM, or null if unknown) */
  tempoBpm: number | null
  /** Band energies: [frame0_band0, frame0_band1, ..., frame1_band0, ...] (quantized to uint8) */
  bandEnergies: Uint8Array
  /** RMS energy per frame (quantized to uint8) */
  rms: Uint8Array
  /** Onset envelope (spectral flux, quantized to uint8) */
  onset: Uint8Array
  /** Beat times (seconds) */
  beatTimes: Float32Array
}

/**
 * Encode feature artifact to binary container
 */
export function encodeFeatureArtifact(artifact: FeatureArtifact): ArrayBuffer {
  const {
    analysisVersion,
    sampleRate,
    fftSize,
    hopSize,
    bandCount,
    frameCount,
    tempoBpm,
    bandEdges,
    bandEnergies,
    rms,
    onset,
    beatTimes,
  } = artifact

  // Compute sizes
  const versionBytes = new TextEncoder().encode(analysisVersion)
  const versionLength = versionBytes.length
  const bandEdgeCount = bandEdges.length

  const headerSize =
    4 + // magic
    4 + // format version
    4 + // version string length
    versionLength + // version string
    4 + // sample rate
    4 + // fft size
    4 + // hop size
    4 + // band count
    4 + // frame count
    4 + // tempo BPM × 1000
    4 + // band edge count
    bandEdgeCount * 4 // band edges (float32 each)

  // Align to 64 bytes
  const alignedHeaderSize = Math.ceil(headerSize / 64) * 64

  const payloadSize =
    bandEnergies.byteLength +
    rms.byteLength +
    onset.byteLength +
    4 +
    beatTimes.byteLength

  const totalSize = alignedHeaderSize + payloadSize
  const buffer = new ArrayBuffer(totalSize)
  const view = new DataView(buffer)
  const uint8 = new Uint8Array(buffer)

  let offset = 0

  // Write header
  view.setUint32(offset, MAGIC, true)
  offset += 4
  view.setUint32(offset, FORMAT_VERSION, true)
  offset += 4
  view.setUint32(offset, versionLength, true)
  offset += 4
  uint8.set(versionBytes, offset)
  offset += versionLength

  view.setUint32(offset, sampleRate, true)
  offset += 4
  view.setUint32(offset, fftSize, true)
  offset += 4
  view.setUint32(offset, hopSize, true)
  offset += 4
  view.setUint32(offset, bandCount, true)
  offset += 4
  view.setUint32(offset, frameCount, true)
  offset += 4
  view.setUint32(offset, tempoBpm ? Math.round(tempoBpm * 1000) : 0, true)
  offset += 4
  view.setUint32(offset, bandEdgeCount, true)
  offset += 4

  for (let i = 0; i < bandEdgeCount; i++) {
    view.setFloat32(offset, bandEdges[i], true)
    offset += 4
  }

  // Skip to aligned payload start
  offset = alignedHeaderSize

  // Write payload
  uint8.set(bandEnergies, offset)
  offset += bandEnergies.byteLength

  uint8.set(rms, offset)
  offset += rms.byteLength

  uint8.set(onset, offset)
  offset += onset.byteLength

  view.setUint32(offset, beatTimes.length, true)
  offset += 4

  // Write through a DataView rather than a Float32Array view: the beat-time
  // payload is not guaranteed to start on a 4-byte boundary.
  for (let i = 0; i < beatTimes.length; i++) {
    view.setFloat32(offset, beatTimes[i], true)
    offset += 4
  }

  return buffer
}

/**
 * Decode binary container to feature artifact
 */
export function decodeFeatureArtifact(buffer: ArrayBuffer): FeatureArtifact {
  const view = new DataView(buffer)
  const uint8 = new Uint8Array(buffer)
  let offset = 0

  // Read header
  const magic = view.getUint32(offset, true)
  offset += 4
  if (magic !== MAGIC) {
    throw new Error(
      `Invalid magic number: expected ${MAGIC.toString(16)}, got ${magic.toString(16)}`
    )
  }

  const formatVersion = view.getUint32(offset, true)
  offset += 4
  if (formatVersion !== FORMAT_VERSION) {
    throw new Error(`Unsupported format version: ${formatVersion}`)
  }

  const versionLength = view.getUint32(offset, true)
  offset += 4
  if (versionLength > 64 || offset + versionLength > buffer.byteLength) {
    throw new Error(`Invalid analysis version length: ${versionLength}`)
  }
  const versionBytes = uint8.slice(offset, offset + versionLength)
  const analysisVersion = new TextDecoder().decode(versionBytes)
  offset += versionLength

  const sampleRate = view.getUint32(offset, true)
  offset += 4
  if (sampleRate < 8_000 || sampleRate > 192_000) {
    throw new Error(`Invalid analysis sample rate: ${sampleRate}`)
  }

  const fftSize = view.getUint32(offset, true)
  offset += 4
  if (fftSize < 256 || fftSize > 65_536 || (fftSize & (fftSize - 1)) !== 0) {
    throw new Error(`Invalid analysis FFT size: ${fftSize}`)
  }

  const hopSize = view.getUint32(offset, true)
  offset += 4
  if (hopSize < 1 || hopSize > fftSize) {
    throw new Error(`Invalid analysis hop size: ${hopSize}`)
  }
  const bandCount = view.getUint32(offset, true)
  offset += 4
  const frameCount = view.getUint32(offset, true)
  offset += 4
  const tempoBpmX1000 = view.getUint32(offset, true)
  const tempoBpm = tempoBpmX1000 > 0 ? tempoBpmX1000 / 1000 : null
  offset += 4

  const bandEdgeCount = view.getUint32(offset, true)
  offset += 4
  if (
    bandEdgeCount < 2 ||
    bandEdgeCount > 65 ||
    offset + bandEdgeCount * 4 > buffer.byteLength
  ) {
    throw new Error(`Invalid band edge count: ${bandEdgeCount}`)
  }
  const bandEdges = new Float32Array(bandEdgeCount)
  for (let i = 0; i < bandEdgeCount; i++) {
    const edge = view.getFloat32(offset, true)
    if (!Number.isFinite(edge) || edge <= 0) {
      throw new Error(`Invalid band edge at index ${i}`)
    }
    if (i > 0 && edge <= bandEdges[i - 1]) {
      throw new Error(`Band edges must increase at index ${i}`)
    }
    bandEdges[i] = edge
    offset += 4
  }

  // Compute header size and skip to payload
  const headerSize = offset
  const alignedHeaderSize = Math.ceil(headerSize / 64) * 64
  if (alignedHeaderSize > buffer.byteLength) {
    throw new Error("Invalid analysis header size")
  }
  offset = alignedHeaderSize

  // Read payload
  const bandEnergiesSize = frameCount * bandCount
  if (
    bandCount < 1 ||
    bandCount > 64 ||
    frameCount < 1 ||
    frameCount > 10_000_000 ||
    offset + bandEnergiesSize + frameCount * 2 + 4 > buffer.byteLength
  ) {
    throw new Error("Invalid analysis payload dimensions")
  }
  const bandEnergies = new Uint8Array(buffer, offset, bandEnergiesSize)
  offset += bandEnergiesSize

  const rms = new Uint8Array(buffer, offset, frameCount)
  offset += frameCount

  const onset = new Uint8Array(buffer, offset, frameCount)
  offset += frameCount

  const beatCount = view.getUint32(offset, true)
  offset += 4
  if (
    beatCount > frameCount + 1 ||
    offset + beatCount * 4 > buffer.byteLength
  ) {
    throw new Error(`Invalid beat count: ${beatCount}`)
  }

  const beatTimes = new Float32Array(beatCount)
  for (let i = 0; i < beatCount; i++) {
    const beat = view.getFloat32(offset, true)
    if (!Number.isFinite(beat) || beat < 0) {
      throw new Error(`Invalid beat time at index ${i}`)
    }
    beatTimes[i] = beat
    offset += 4
  }

  if (offset !== buffer.byteLength) {
    throw new Error("Analysis artifact has unexpected trailing bytes")
  }

  const frameRate = sampleRate / hopSize

  return {
    analysisVersion,
    sampleRate,
    fftSize,
    hopSize,
    bandCount,
    frameCount,
    frameRate,
    bandEdges,
    tempoBpm,
    bandEnergies,
    rms,
    onset,
    beatTimes,
  }
}

/**
 * Compute SHA-256 checksum of a buffer (hex string)
 * Uses Web Crypto API (available in browser + worker)
 */
export async function computeChecksum(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
}

/**
 * Verify checksum of a buffer
 */
export async function verifyChecksum(
  buffer: ArrayBuffer,
  expectedChecksum: string
): Promise<boolean> {
  const actualChecksum = await computeChecksum(buffer)
  return actualChecksum === expectedChecksum
}
