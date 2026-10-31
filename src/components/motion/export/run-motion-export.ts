/**
 * components/motion/export/run-motion-export.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The render-window half of the export pipeline: probe a codec, encode the
 * planned frames, and stream positioned chunks back to main.
 *
 * `CanvasSource` reads the canvas at `add()` time, so the stage must finish
 * painting before the frame is added. The caller supplies that ordering; this
 * module never touches React.
 */

import {
  CanvasSource,
  Mp4OutputFormat,
  Output,
  StreamTarget,
  WebMOutputFormat,
  getFirstEncodableVideoCodec,
  type StreamTargetChunk,
  type VideoCodec,
} from 'mediabunny';

import type { MotionRenderJobPayload } from '@/lib/motion/export/protocol';
import { motionRenderFrames } from '@/lib/motion/export/render-plan';

export type MotionExportStage = {
  canvas: HTMLCanvasElement;
  /** Paint the document at scene time and resolve once pixels are readable. */
  renderFrame: (sceneTime: number) => Promise<void>;
};

export type MotionExportTransport = {
  report: (phase: 'prepare' | 'render' | 'finalize', frame?: number) => Promise<void>;
  writeChunk: (data: Uint8Array, position: number) => Promise<void>;
  isCancelled: () => boolean;
};

export type MotionExportRunResult = {
  codec: VideoCodec;
  frames: number;
  cancelled: boolean;
};

export class MotionExportCodecError extends Error {
  constructor(readonly probed: readonly string[]) {
    super(`No supported video encoder found. Probed: ${probed.join(', ') || 'none'}.`);
    this.name = 'MotionExportCodecError';
  }
}

const PROGRESS_INTERVAL_FRAMES = 10;

export async function runMotionExport(
  job: MotionRenderJobPayload,
  stage: MotionExportStage,
  transport: MotionExportTransport,
): Promise<MotionExportRunResult> {
  const { settings, range } = job;
  const codec = await getFirstEncodableVideoCodec(settings.codecs as VideoCodec[], {
    width: settings.width,
    height: settings.height,
    frameRate: settings.fps,
    bitrate: settings.bitrate,
  });
  if (!codec) throw new MotionExportCodecError(settings.codecs);

  const format = settings.container === 'webm' ? new WebMOutputFormat() : new Mp4OutputFormat();
  const writable = new WritableStream<StreamTargetChunk>({
    write(chunk) {
      return transport.writeChunk(chunk.data, chunk.position);
    },
  });
  const target = new StreamTarget(writable, { chunked: true, chunkSize: 8 * 1024 * 1024 });
  const output = new Output({ format, target });
  const source = new CanvasSource(stage.canvas, {
    codec,
    bitrate: settings.bitrate,
    keyFrameInterval: 2,
  });
  output.addVideoTrack(source, { frameRate: settings.fps });

  await output.start();
  await transport.report('prepare', 0);

  let frames = 0;
  for (const frame of motionRenderFrames(range, settings.fps)) {
    if (transport.isCancelled()) {
      await output.cancel();
      return { codec, frames, cancelled: true };
    }
    await stage.renderFrame(frame.sceneTime);
    await source.add(frame.timestamp, frame.duration);
    frames += 1;
    if (frames % PROGRESS_INTERVAL_FRAMES === 0) await transport.report('render', frames);
  }

  await transport.report('finalize', job.frameCount);
  await output.finalize();
  return { codec, frames, cancelled: false };
}
