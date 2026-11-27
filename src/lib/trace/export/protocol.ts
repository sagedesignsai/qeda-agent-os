/**
 * lib/trace/export/protocol.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The wire contract between the main-process render host and the hidden Trace
 * render window. Pure data plus validators: the render window is a separate
 * process, so every chunk, progress report, and completion is re-checked in
 * main instead of trusting the sender.
 *
 * Mirrors `lib/motion/export/protocol.ts` — the same trust boundary, smaller
 * payload: a Trace snapshot is plain JSON and its narration audio resolves
 * through the shared `qeda-media://tts/<assetId>` scheme, so the window needs
 * no extra asset list.
 */

import type { TraceProject } from '../types';
import type { TraceExportContainer, TraceExportSettings } from './presets';

export type TraceRenderPhase =
  | 'prepare'
  | 'render'
  | 'finalize'
  | 'done'
  | 'failed'
  | 'cancelled';

export type TraceRenderProgress = {
  jobId: string;
  phase: TraceRenderPhase;
  frame: number;
  frameCount: number;
  fraction: number;
  error?: string;
};

export type TraceRenderJobPayload = {
  jobId: string;
  project: TraceProject;
  settings: Pick<TraceExportSettings, 'width' | 'height' | 'fps' | 'bitrate' | 'extension'> & {
    container: TraceExportContainer;
    codecs: readonly string[];
    audioCodecs: readonly string[];
  };
  frameCount: number;
};

export type TraceExportChunk = {
  jobId: string;
  data: Uint8Array;
  position: number;
};

export type TraceExportProgressRequest = {
  jobId: string;
  phase: 'prepare' | 'render' | 'finalize';
  frame?: number;
};

export type TraceExportJobRef = { jobId: string };

export class TraceExportProtocolError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'TraceExportProtocolError';
  }
}

export function parseTraceExportJobRef(value: unknown): TraceExportJobRef {
  const jobId = (value as { jobId?: unknown } | null | undefined)?.jobId;
  if (typeof jobId !== 'string' || !jobId) {
    throw new TraceExportProtocolError('Export job reference is invalid.', 'TRACE_EXPORT_JOB_REF_INVALID');
  }
  return { jobId };
}

export function parseTraceExportChunk(value: unknown): TraceExportChunk {
  const chunk = value as { jobId?: unknown; data?: unknown; position?: unknown } | null | undefined;
  if (typeof chunk?.jobId !== 'string' || !chunk.jobId) {
    throw new TraceExportProtocolError('Export chunk job id is invalid.', 'TRACE_EXPORT_CHUNK_JOB_INVALID');
  }
  if (!(chunk.data instanceof Uint8Array) || chunk.data.byteLength === 0) {
    throw new TraceExportProtocolError('Export chunk data is invalid.', 'TRACE_EXPORT_CHUNK_DATA_INVALID');
  }
  if (!Number.isSafeInteger(chunk.position) || (chunk.position as number) < 0) {
    throw new TraceExportProtocolError('Export chunk position is invalid.', 'TRACE_EXPORT_CHUNK_POSITION_INVALID');
  }
  return { jobId: chunk.jobId, data: chunk.data, position: chunk.position as number };
}

export function parseTraceExportProgress(value: unknown): TraceExportProgressRequest {
  const request = value as { jobId?: unknown; phase?: unknown; frame?: unknown } | null | undefined;
  if (typeof request?.jobId !== 'string' || !request.jobId) {
    throw new TraceExportProtocolError('Progress job id is invalid.', 'TRACE_EXPORT_PROGRESS_JOB_INVALID');
  }
  const phase = request.phase;
  if (phase !== 'prepare' && phase !== 'render' && phase !== 'finalize') {
    throw new TraceExportProtocolError('Progress phase is invalid.', 'TRACE_EXPORT_PROGRESS_PHASE_INVALID');
  }
  const frame = request.frame;
  if (frame !== undefined && (!Number.isSafeInteger(frame) || frame < 0)) {
    throw new TraceExportProtocolError('Progress frame is invalid.', 'TRACE_EXPORT_PROGRESS_FRAME_INVALID');
  }
  return { jobId: request.jobId, phase, ...(frame !== undefined ? { frame } : {}) };
}

export function parseTraceExportFailure(value: unknown): { jobId: string; message: string } {
  const failure = value as { jobId?: unknown; message?: unknown } | null | undefined;
  if (typeof failure?.jobId !== 'string' || !failure.jobId) {
    throw new TraceExportProtocolError('Failure job id is invalid.', 'TRACE_EXPORT_FAILURE_JOB_INVALID');
  }
  const message =
    typeof failure.message === 'string' && failure.message.trim()
      ? failure.message
      : 'The Trace export renderer failed.';
  return { jobId: failure.jobId, message };
}