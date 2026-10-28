/**
 * Audio Analysis Web Worker
 *
 * Entry point for the Sonic Genius Studio analysis pipeline.
 * Runs entirely inside a Web Worker so heavy FFT work never blocks the main thread.
 *
 * Message protocol (all transfers use structured clone / ArrayBuffer transfer):
 *
 *   ← { type: 'analyze', pcm, sampleRate, config }
 *   → { type: 'progress', percent }          (0–100, multiple messages)
 *   → { type: 'result', artifact, meta, checksum, buffer }
 *   → { type: 'error', message }             (on failure)
 *
 * The result `buffer` (the encoded binary artifact) is transferred rather than
 * copied, so ownership moves to the main thread and no data is duplicated.
 */

import { extractFeatures } from "./features"
import { encodeFeatureArtifact, computeChecksum } from "./format"
import { ANALYSIS_VERSION, formatBandEdges, computeFrameRate } from "./config"
import type { FeatureArtifact } from "./format"
import type { AnalysisConfig, AnalysisMeta } from "./config"

// ---------------------------------------------------------------------------
// Message types
// ---------------------------------------------------------------------------

/** Messages received by the worker from the main thread */
type InboundMsg = {
  type: "analyze"
  pcm: Float32Array
  sampleRate: number
  config: AnalysisConfig
}

/** Messages sent by the worker to the main thread */
type OutboundMsg =
  | { type: "progress"; percent: number }
  | {
      type: "result"
      artifact: FeatureArtifact
      meta: AnalysisMeta
      checksum: string
      buffer: ArrayBuffer
    }
  | { type: "error"; message: string }

// ---------------------------------------------------------------------------
// Worker message handler
// ---------------------------------------------------------------------------

self.onmessage = async (event: MessageEvent<InboundMsg>) => {
  const msg = event.data

  if (msg.type !== "analyze") {
    // Unknown message type — ignore
    return
  }

  const { pcm, sampleRate, config } = msg

  try {
    // ---- Step 1: Extract features ----
    // Progress is forwarded to the main thread as it arrives.
    const artifact = await extractFeatures(
      pcm,
      sampleRate,
      config,
      (percent) => {
        const outMsg: OutboundMsg = { type: "progress", percent }
        self.postMessage(outMsg)
      }
    )

    // ---- Step 2: Encode to binary ----
    const buffer = encodeFeatureArtifact(artifact)

    // ---- Step 3: SHA-256 checksum ----
    const checksum = await computeChecksum(buffer)

    // ---- Step 4: Build AnalysisMeta ----
    const durationSeconds = pcm.length / sampleRate
    const frameRate = computeFrameRate(sampleRate, config.hopSize)

    const meta: AnalysisMeta = {
      analysisVersion: ANALYSIS_VERSION,
      durationSeconds,
      sampleRate,
      fftSize: config.fftSize,
      hopSize: config.hopSize,
      bandCount: artifact.bandCount,
      frameCount: artifact.frameCount,
      frameRate,
      // formatBandEdges() uses the module-level BAND_EDGES_HZ + BAND_LABELS;
      // if config carries custom edges you would build this array manually.
      bandEdges: formatBandEdges(),
      tempoBpm: artifact.tempoBpm,
      featuresBytes: buffer.byteLength,
      featuresChecksum: checksum,
    }

    // ---- Step 5: Post result, transferring the buffer ----
    const resultMsg: OutboundMsg = {
      type: "result",
      artifact,
      meta,
      checksum,
      buffer,
    }
    // Transfer ownership of the ArrayBuffer to the main thread (zero-copy).
    ;(
      self as unknown as {
        postMessage: (message: unknown, transfer?: Transferable[]) => void
      }
    ).postMessage(resultMsg, [buffer])
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const errorMsg: OutboundMsg = { type: "error", message }
    self.postMessage(errorMsg)
  }
}
