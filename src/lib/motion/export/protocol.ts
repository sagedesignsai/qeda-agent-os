/**
 * lib/motion/export/protocol.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The wire contract between the main-process render host and the hidden render
 * window. It is pure data plus validators: the render window is a separate
 * process, so every chunk, progress report, and completion is re-checked in main
 * instead of trusting the sender.
 */

import type { MotionDocument } from '../types';
import type { MotionExportContainer, MotionExportSettings } from './presets';

export type MotionRenderPhase =
  | 'snapshot'
  | 'preflight'
  | 'prepare'
  | 'render'
  | 'finalize'
  | 'done'
  | 'failed'
  | 'cancelled';

export type MotionRenderProgress = {
  jobId: string;
  phase: MotionRenderPhase;
  frame: number;
  frameCount: number;
  fraction: number;
  error?: string;
};

export type MotionRenderJobPayload = {
  jobId: string;
  document: MotionDocument;
  settings: Pick<MotionExportSettings, 'width' | 'height' | 'fps' | 'bitrate' | 'extension'> & {
    container: MotionExportContainer;
    codecs: readonly string[];
  };
  range: { start: number; end: number };
  frameCount: number;
};

export type MotionExportChunk = { jobId: string; data: Uint8Array; position: number };
export type MotionExportProgressRequest = {
  jobId: string;
  phase: 'preflight' | 'prepare' | 'render' | 'finalize';
  frame?: number;
};
export type MotionExportJobRef = { jobId: string };

export class MotionExportProtocolError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'MotionExportProtocolError';
  }
}

function jobIdOf(value: unknown): string {
  if (!value || typeof value !== 'object') {
    throw new MotionExportProtocolError('Export message must be an object.', 'MOTION_EXPORT_MESSAGE_INVALID');
  }
  const jobId = (value as { jobId?: unknown }).jobId;
  if (typeof jobId !== 'string' || !/^rnd_[A-Za-z0-9]+$/.test(jobId)) {
    throw new MotionExportProtocolError('Export message has an invalid job id.', 'MOTION_EXPORT_JOB_ID_INVALID');
  }
  return jobId;
}

export function parseMotionExportJobRef(value: unknown): MotionExportJobRef {
  return { jobId: jobIdOf(value) };
}

export function parseMotionExportChunk(value: unknown): MotionExportChunk {
  const jobId = jobIdOf(value);
  const { data, position } = value as { data?: unknown; position?: unknown };
  if (!(data instanceof Uint8Array) || data.byteLength === 0) {
    throw new MotionExportProtocolError('Export chunk data must be a non-empty Uint8Array.', 'MOTION_EXPORT_CHUNK_INVALID');
  }
  if (!Number.isSafeInteger(position) || (position as number) < 0) {
    throw new MotionExportProtocolError('Export chunk position must be a non-negative integer.', 'MOTION_EXPORT_CHUNK_INVALID');
  }
  return { jobId, data, position: position as number };
}

export function parseMotionExportProgress(value: unknown): MotionExportProgressRequest {
  const jobId = jobIdOf(value);
  const { phase, frame } = value as { phase?: unknown; frame?: unknown };
  if (!['preflight', 'prepare', 'render', 'finalize'].includes(phase as string)) {
    throw new MotionExportProtocolError('Export progress phase is invalid.', 'MOTION_EXPORT_PROGRESS_INVALID');
  }
  if (frame !== undefined && (!Number.isInteger(frame) || (frame as number) < 0)) {
    throw new MotionExportProtocolError('Export progress frame must be a non-negative integer.', 'MOTION_EXPORT_PROGRESS_INVALID');
  }
  return { jobId, phase: phase as MotionExportProgressRequest['phase'], ...(frame === undefined ? {} : { frame: frame as number }) };
}

/** Render-window failures are strings across IPC; keep them user-presentable. */
export function parseMotionExportFailure(value: unknown): MotionExportJobRef & { message: string } {
  const jobId = jobIdOf(value);
  const message = (value as { message?: unknown }).message;
  const trimmed = typeof message === 'string' ? message.trim().slice(0, 2000) : '';
  return { jobId, message: trimmed || 'The export renderer failed.' };
}
