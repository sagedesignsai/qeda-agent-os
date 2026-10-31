/**
 * scripts/export-smoke/harness.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Browser-side half of the opt-in export smoke. It runs the *real* encode loop
 * (`runMotionExport`) against real WebCodecs, then reads the bytes back with
 * Mediabunny's own demuxer.
 *
 * This is deliberately not a unit test: jest has no `VideoEncoder`, so the only
 * way to prove a preset produces a playable file is inside Electron. The canvas
 * paint here is synthetic — it proves the encoder, muxer, chunk contract and
 * duration, not scene rendering (that is `motion-scene-canvas.test.tsx`).
 */

import { ALL_FORMATS, BufferSource, Input, VideoSampleSink } from 'mediabunny';

import { runMotionExport } from '@/components/motion/export/run-motion-export';
import { createStarterMotionDocument } from '@/lib/motion/defaults';
import {
  resolveMotionExportSettings,
  type MotionExportPresetId,
  type MotionExportSettings,
} from '@/lib/motion/export/presets';
import { motionRenderFrameCount } from '@/lib/motion/export/render-plan';
import type { MotionRenderJobPayload } from '@/lib/motion/export/protocol';

const FRAME_COUNT = 12;
const OUTPUT = { width: 1920, height: 1080, fps: 30 };

export type ExportSmokeReport = {
  presetId: MotionExportPresetId;
  container: string;
  codec: string;
  frames: number;
  bytes: number;
  chunks: number;
  contiguous: boolean;
  format: string;
  duration: number;
  expectedDuration: number;
  durationDelta: number;
  trackCodec: string | null;
  /** Decoder config codec string, e.g. `avc1.42c01f` — shows the real profile. */
  codecString: string | null;
  width: number;
  height: number;
  decodedFrame: boolean;
};

type Chunk = { position: number; data: Uint8Array };

/** Mirrors main's positional writes and proves they can be reassembled. */
function assembleChunks(chunks: readonly Chunk[]): { bytes: Uint8Array; contiguous: boolean } {
  const size = chunks.reduce((max, chunk) => Math.max(max, chunk.position + chunk.data.byteLength), 0);
  const bytes = new Uint8Array(size);
  const written = new Uint8Array(size);
  for (const chunk of chunks) {
    bytes.set(chunk.data, chunk.position);
    written.fill(1, chunk.position, chunk.position + chunk.data.byteLength);
  }
  return { bytes, contiguous: written.every((value) => value === 1) };
}

function paintFrame(
  ctx: CanvasRenderingContext2D,
  settings: MotionExportSettings,
  index: number,
): void {
  const gradient = ctx.createLinearGradient(0, 0, settings.width, settings.height);
  gradient.addColorStop(0, `hsl(${(index * 24) % 360} 80% 45%)`);
  gradient.addColorStop(1, 'hsl(210 90% 12%)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, settings.width, settings.height);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.font = `bold ${Math.round(settings.height * 0.12)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`frame ${index}`, settings.width / 2, settings.height / 2);
}

async function verify(
  bytes: Uint8Array,
  settings: MotionExportSettings,
  expectedDuration: number,
): Promise<Omit<ExportSmokeReport, 'presetId' | 'container' | 'codec' | 'frames' | 'bytes' | 'chunks' | 'contiguous'>> {
  const input = new Input({ source: new BufferSource(bytes), formats: ALL_FORMATS });
  if (!(await input.canRead())) throw new Error(`${settings.presetId}: demuxer could not read the encoded file.`);

  const format = await input.getFormat();
  const duration = await input.computeDuration();
  const track = await input.getPrimaryVideoTrack();
  if (!track) throw new Error(`${settings.presetId}: encoded file has no video track.`);

  const sink = new VideoSampleSink(track);
  const sample = await sink.getSample(duration / 2);
  const decoded = Boolean(sample);
  sample?.close();
  const decoderConfig = await track.getDecoderConfig();
  input.dispose();

  return {
    format: format.name,
    duration,
    expectedDuration,
    durationDelta: Math.abs(duration - expectedDuration),
    trackCodec: track.codec,
    codecString: decoderConfig?.codec ?? null,
    width: track.displayWidth,
    height: track.displayHeight,
    decodedFrame: decoded,
  };
}

async function runPreset(presetId: MotionExportPresetId): Promise<ExportSmokeReport> {
  const settings = resolveMotionExportSettings(presetId, OUTPUT);
  const canvas = document.createElement('canvas');
  canvas.width = settings.width;
  canvas.height = settings.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context is unavailable.');

  const range = { start: 0, end: FRAME_COUNT / settings.fps };
  const payload: MotionRenderJobPayload = {
    jobId: `smo_${presetId}`,
    document: createStarterMotionDocument(),
    settings,
    range,
    frameCount: motionRenderFrameCount(range, settings.fps),
  };

  const chunks: Chunk[] = [];
  const result = await runMotionExport(
    payload,
    {
      canvas: canvas as unknown as HTMLCanvasElement,
      async renderFrame(sceneTime) {
        paintFrame(ctx, settings, Math.round(sceneTime * settings.fps));
        // CanvasSource reads at add() time; make that read explicit.
        await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      },
    },
    {
      async report() {},
      async writeChunk(data, position) {
        chunks.push({ position, data: data.slice() });
      },
      isCancelled: () => false,
    },
  );

  const { bytes, contiguous } = assembleChunks(chunks);
  const expectedDuration = (FRAME_COUNT / settings.fps);
  const verified = await verify(bytes, settings, expectedDuration);

  const report: ExportSmokeReport = {
    presetId,
    container: settings.container,
    codec: result.codec,
    frames: result.frames,
    bytes: bytes.byteLength,
    chunks: chunks.length,
    contiguous,
    ...verified,
  };

  // Fail here, where the numbers are still in scope.
  if (result.frames !== FRAME_COUNT) throw new Error(`${presetId}: encoded ${result.frames}/${FRAME_COUNT} frames.`);
  if (!contiguous) throw new Error(`${presetId}: chunk positions leave a gap in the file.`);
  if (!verified.decodedFrame) throw new Error(`${presetId}: the muxed file did not decode a frame.`);
  if (verified.width !== settings.width || verified.height !== settings.height) {
    throw new Error(`${presetId}: got ${verified.width}x${verified.height}, expected ${settings.width}x${settings.height}.`);
  }
  if (verified.durationDelta > 1 / settings.fps) {
    throw new Error(`${presetId}: duration ${verified.duration}s drifts from ${expectedDuration}s by more than one frame.`);
  }
  return report;
}

declare global {
  interface Window {
    __exportSmoke?: () => Promise<ExportSmokeReport[]>;
  }
}

window.__exportSmoke = async () => {
  const reports: ExportSmokeReport[] = [];
  // H.264/MP4 is the primary path; VP9/WebM is the documented fallback.
  for (const presetId of ['launch-1080p', 'webm-vp9'] as const) {
    reports.push(await runPreset(presetId));
  }
  return reports;
};
