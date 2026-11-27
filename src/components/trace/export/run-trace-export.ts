/**
 * components/trace/export/run-trace-export.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The render-window half of the Trace export pipeline: probe a codec, encode
 * the planned frames, mux the narration, and stream positioned chunks to main.
 *
 * `CanvasSource` reads the canvas at `add()` time, so the stage must finish
 * painting before the frame is added. The caller supplies that ordering; this
 * module never touches React.
 *
 * Every frame comes from `staticSvgMarkup(project, timeMs)` (called by the
 * stage) — the same serializer the editor preview and the SVG/GSAP exporters
 * use — so a frame cannot look one way on screen and another way in the file.
 * Narration audio is decoded from the shared `qeda-media://tts/<id>` host,
 * composed into one silence-padded buffer, and muxed as a single audio track.
 *
 * Mirrors `components/motion/export/run-motion-export.ts`.
 */

import {
  AudioBufferSource,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  Quality,
  StreamTarget,
  WebMOutputFormat,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
  type AudioCodec,
  type StreamTargetChunk,
  type VideoCodec,
} from 'mediabunny';

import type { TraceRenderJobPayload } from '@/lib/trace/export/protocol';
import { traceRenderFrames } from '@/lib/trace/export/render-plan';
import type { TraceNarrationLine, TraceProject } from '@/lib/trace/types';

export type TraceExportStage = {
  canvas: HTMLCanvasElement;
  /** Paint the composition at project time and resolve once pixels are readable. */
  renderFrame: (timeMs: number) => Promise<void>;
};

export type TraceExportTransport = {
  report: (
    phase: 'prepare' | 'render' | 'finalize',
    frame?: number,
  ) => Promise<void>;
  writeChunk: (data: Uint8Array, position: number) => Promise<void>;
  isCancelled: () => boolean;
};

export type TraceExportRunResult = {
  codec: VideoCodec;
  frames: number;
  cancelled: boolean;
  /** True when the narration audio track was muxed into the output. */
  audio: boolean;
};

export class TraceExportCodecError extends Error {
  constructor(readonly probed: readonly string[]) {
    super(
      `No supported video encoder found. Probed: ${probed.join(', ') || 'none'}.`,
    );
    this.name = 'TraceExportCodecError';
  }
}

const PROGRESS_INTERVAL_FRAMES = 10;
const NARRATION_SAMPLE_RATE = 48_000;

export async function runTraceExport(
  job: TraceRenderJobPayload,
  stage: TraceExportStage,
  transport: TraceExportTransport,
): Promise<TraceExportRunResult> {
  const { settings, project } = job;

  const codec = await getFirstEncodableVideoCodec(
    settings.codecs as VideoCodec[],
    {
      width: settings.width,
      height: settings.height,
      frameRate: settings.fps,
      bitrate: settings.bitrate,
    },
  );
  if (!codec) throw new TraceExportCodecError(settings.codecs);

  const format =
    settings.container === 'webm' ? new WebMOutputFormat() : new Mp4OutputFormat();
  const writable = new WritableStream<StreamTargetChunk>({
    write(chunk) {
      return transport.writeChunk(chunk.data, chunk.position);
    },
  });
  const target = new StreamTarget(writable, {
    chunked: true,
    chunkSize: 8 * 1024 * 1024,
  });
  const output = new Output({ format, target });
  const source = new CanvasSource(stage.canvas, {
    codec,
    bitrate: settings.bitrate,
    keyFrameInterval: 2,
  });
  output.addVideoTrack(source, { frameRate: settings.fps });

  // Narration audio: one composite buffer, one track. The buffer is built
  // before frames are paid for, so a voice-asset failure surfaces early.
  const narration = narrationLines(project);
  let audioSource: AudioBufferSource | null = null;
  let audioBuffer: AudioBuffer | null = null;
  if (narration.length > 0) {
    const audioCodec = await getFirstEncodableAudioCodec(
      settings.audioCodecs as AudioCodec[],
      {
        numberOfChannels: 2,
        sampleRate: NARRATION_SAMPLE_RATE,
        quality: new Quality('medium'),
      },
    );
    if (audioCodec) {
      audioSource = new AudioBufferSource({
        codec: audioCodec,
        quality: new Quality('medium'),
      });
      output.addAudioTrack(audioSource);
      audioBuffer = await buildNarrationAudioBuffer(
        project,
        project.durationMs / 1000,
      );
    }
  }

  await output.start();
  await transport.report('prepare', 0);

  let frames = 0;
  for (const frame of traceRenderFrames(project.durationMs, settings.fps)) {
    if (transport.isCancelled()) {
      await output.cancel();
      return { codec, frames, cancelled: true, audio: false };
    }
    await stage.renderFrame(frame.timeMs);
    await source.add(frame.timestamp, frame.duration);
    frames += 1;
    if (frames % PROGRESS_INTERVAL_FRAMES === 0) {
      await transport.report('render', frames);
    }
  }

  if (audioSource && audioBuffer) {
    await audioSource.add(audioBuffer);
  }

  await transport.report('finalize', job.frameCount);
  await output.finalize();
  return { codec, frames, cancelled: false, audio: audioBuffer !== null };
}

/** Narration lines that can actually be heard: measured and with an asset. */
function narrationLines(project: TraceProject): TraceNarrationLine[] {
  return (project.narration?.lines ?? []).filter(
    (line) =>
      Boolean(line.ttsAssetId) &&
      typeof line.startMs === 'number' &&
      typeof line.durationMs === 'number' &&
      line.durationMs > 0,
  );
}

/**
 * Compose the whole narration timeline into one stereo buffer: each decoded
 * line is mixed in at its measured offset, everything else is silence. The
 * AudioContext resamples each asset to its own rate, so the composite is
 * uniform.
 */
async function buildNarrationAudioBuffer(
  project: TraceProject,
  durationSec: number,
): Promise<AudioBuffer | null> {
  const lines = narrationLines(project);
  if (lines.length === 0) return null;
  const AudioContextCtor = (window as { AudioContext?: typeof AudioContext })
    .AudioContext;
  if (!AudioContextCtor) return null;

  const context = new AudioContextCtor();
  try {
    const decoded = await Promise.all(
      lines.map(async (line) => {
        const response = await fetch(`qeda-media://tts/${line.ttsAssetId}`);
        if (!response.ok) {
          throw new Error(
            `The voice asset for narration line "${line.id}" could not be loaded (${response.status}).`,
          );
        }
        const bytes = await response.arrayBuffer();
        return await context.decodeAudioData(bytes);
      }),
    );

    const sampleRate = context.sampleRate;
    const totalSamples = Math.max(1, Math.ceil(durationSec * sampleRate));
    const composite = context.createBuffer(2, totalSamples, sampleRate);

    lines.forEach((line, index) => {
      const buffer = decoded[index];
      const offset = Math.max(
        0,
        Math.round(((line.startMs ?? 0) / 1000) * sampleRate),
      );
      const count = Math.min(buffer.length, totalSamples - offset);
      if (count <= 0) return;

      // Mix (lines should not overlap; adding is the safe default).
      for (let channel = 0; channel < Math.min(2, buffer.numberOfChannels); channel += 1) {
        const from = buffer.getChannelData(channel);
        const to = composite.getChannelData(Math.min(channel, 1));
        for (let i = 0; i < count; i += 1) to[offset + i] += from[i];
      }
      // A mono asset is duplicated into the second channel.
      if (buffer.numberOfChannels === 1) {
        const from = buffer.getChannelData(0);
        const to = composite.getChannelData(1);
        for (let i = 0; i < count; i += 1) to[offset + i] += from[i];
      }
    });

    return composite;
  } finally {
    await context.close().catch(() => undefined);
  }
}