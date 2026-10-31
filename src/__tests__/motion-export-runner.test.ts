/**
 * __tests__/motion-export-runner.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The encode loop is the last seam between the frame plan and the file: frame
 * times, progress cadence, chunk transfer, and cancellation. Mediabunny is
 * mocked because jsdom has no WebCodecs, but the real StreamTarget writable is
 * used so the transport call is exercised.
 */

import { WritableStream as NodeWritableStream } from 'node:stream/web';

import { runMotionExport, MotionExportCodecError } from '@/components/motion/export/run-motion-export';
import { createStarterMotionDocument } from '@/lib/motion/defaults';
import { motionRenderFrameCount } from '@/lib/motion/export/render-plan';
import type { MotionRenderJobPayload } from '@/lib/motion/export/protocol';

// The runner and the test must share one mock instance, so require the file directly.
const mediabunnyMock = require('../../.erb/mocks/mediabunnyMock.js') as {
  __calls: {
    probes: Array<{ codecs: readonly string[] }>;
    added: Array<{ timestamp: number; duration: number }>;
    formats: string[];
    started: number;
    finalized: number;
    cancelled: number;
  };
  __setCodec(codec: string | null): void;
  __reset(): void;
};

const BASE_SETTINGS = {
  width: 320,
  height: 180,
  fps: 30,
  bitrate: 1_000_000,
  extension: '.mp4' as const,
  container: 'mp4' as const,
  codecs: ['avc'] as const,
};

function job(overrides: Partial<MotionRenderJobPayload> = {}): MotionRenderJobPayload {
  return {
    jobId: 'rnd_test',
    document: createStarterMotionDocument('2026-01-01T00:00:00.000Z'),
    settings: BASE_SETTINGS,
    range: { start: 0.5, end: 0.9 },
    frameCount: 12,
    ...overrides,
  };
}

function stage() {
  const renders: number[] = [];
  return {
    renders,
    canvas: {} as HTMLCanvasElement,
    async renderFrame(time: number) {
      renders.push(time);
    },
  };
}

function transport() {
  const reports: Array<{ phase: string; frame?: number }> = [];
  const chunks: Array<{ position: number; bytes: number[] }> = [];
  let cancelled = false;
  return {
    reports,
    chunks,
    cancel: () => {
      cancelled = true;
    },
    async report(phase: 'prepare' | 'render' | 'finalize', frame?: number) {
      reports.push({ phase, ...(frame === undefined ? {} : { frame }) });
    },
    async writeChunk(data: Uint8Array, position: number) {
      chunks.push({ position, bytes: [...data] });
    },
    isCancelled: () => cancelled,
  };
}

describe('runMotionExport', () => {
  beforeAll(() => {
    // jsdom does not expose Streams, but the runner uses the standard API.
    Object.defineProperty(globalThis, 'WritableStream', {
      configurable: true,
      value: NodeWritableStream,
    });
  });

  beforeEach(() => {
    mediabunnyMock.__reset();
  });

  it('encodes one frame per planned step and reports progress before finalizing', async () => {
    const sink = transport();
    const view = stage();
    const payload = job();

    const result = await runMotionExport(payload, view, sink);

    const frames = motionRenderFrameCount(payload.range, payload.settings.fps);
    expect(result).toEqual({ codec: 'avc', frames, cancelled: false });
    expect(view.renders).toHaveLength(frames);
    expect(view.renders[0]).toBeCloseTo(0.5);
    expect(mediabunnyMock.__calls.added).toHaveLength(frames);
    expect(mediabunnyMock.__calls.added[1].timestamp).toBeCloseTo(1 / 30, 9);
    expect(mediabunnyMock.__calls.formats).toEqual(['mp4']);
    expect(mediabunnyMock.__calls.finalized).toBe(1);
    expect(sink.reports).toEqual([
      { phase: 'prepare', frame: 0 },
      { phase: 'render', frame: 10 },
      { phase: 'finalize', frame: payload.frameCount },
    ]);
    expect(sink.chunks).toEqual([{ position: 0, bytes: [1, 2, 3, 4] }]);
  });

  it('uses the WebM container when the preset asks for it', async () => {
    const sink = transport();
    await runMotionExport(
      job({
        settings: { ...BASE_SETTINGS, container: 'webm', extension: '.webm' },
      }),
      stage(),
      sink,
    );
    expect(mediabunnyMock.__calls.formats).toEqual(['webm']);
  });

  it('stops before rendering more frames when cancelled', async () => {
    const sink = transport();
    const renders: number[] = [];
    const view = {
      canvas: {} as HTMLCanvasElement,
      async renderFrame(time: number) {
        renders.push(time);
        if (renders.length === 3) sink.cancel();
      },
    };

    const result = await runMotionExport(job(), view, sink);

    expect(result.cancelled).toBe(true);
    expect(result.frames).toBe(3);
    expect(mediabunnyMock.__calls.cancelled).toBe(1);
    expect(mediabunnyMock.__calls.finalized).toBe(0);
  });

  it('fails loudly when no encoder exists instead of writing an empty file', async () => {
    mediabunnyMock.__setCodec(null);
    const sink = transport();
    await expect(runMotionExport(job(), stage(), sink)).rejects.toBeInstanceOf(
      MotionExportCodecError,
    );
    expect(mediabunnyMock.__calls.started).toBe(0);
    expect(mediabunnyMock.__calls.probes[0].codecs).toEqual(['avc']);
  });
});
