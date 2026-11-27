/**
 * main/trace/render-jobs.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Main-process owner of Trace export snapshots and output files. The hidden
 * renderer supplies encoded chunks by position; only this module touches output
 * paths. Adapted from `main/motion/render-jobs.ts`, which proved the protocol.
 */

import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import type { FileHandle } from 'node:fs/promises';
import path from 'node:path';

import type { TraceProject } from '../../lib/trace/types';
import type {
  TraceRenderPhase,
  TraceRenderProgress,
} from '../../lib/trace/export/protocol.js';
import { traceRenderFrameCount } from '../../lib/trace/export/render-plan.js';

export type { TraceRenderPhase, TraceRenderProgress } from '../../lib/trace/export/protocol.js';

export type TraceRenderJob = {
  id: string;
  projectId: string;
  outputPath: string;
  partPath: string;
  snapshotPath: string;
  fps: number;
  frameCount: number;
  presetId: string;
  phase: TraceRenderPhase;
  frame: number;
  error?: string;
};

export class TraceRenderJobError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'TraceRenderJobError';
  }
}

export class TraceRenderJobs {
  private readonly jobs = new Map<string, TraceRenderJob>();
  private readonly handles = new Map<string, FileHandle>();
  private starting = false;

  constructor(
    private readonly jobsDirectory: string,
    private readonly createId: () => string = () =>
      `trc_${randomBytes(12).toString('hex')}`,
  ) {}

  async begin(options: {
    projectId: string;
    project: TraceProject;
    outputPath: string;
    /** Export fps may differ from the project's editing rate. */
    fps: number;
    presetId: string;
  }): Promise<TraceRenderJob> {
    if (
      this.starting ||
      [...this.jobs.values()].some(
        (job) => !['done', 'failed', 'cancelled'].includes(job.phase),
      )
    ) {
      throw new TraceRenderJobError(
        'A Trace export is already running.',
        'TRACE_EXPORT_BUSY',
      );
    }
    this.starting = true;
    try {
      if (options.project.id !== options.projectId) {
        throw new TraceRenderJobError(
          'The export snapshot does not match the selected project.',
          'TRACE_EXPORT_PROJECT_MISMATCH',
        );
      }
      const frameCount = traceRenderFrameCount(
        options.project.durationMs,
        options.fps,
      );
      const outputPath = path.resolve(options.outputPath);
      if (!path.extname(outputPath)) {
        throw new TraceRenderJobError(
          'The output file must have an extension.',
          'TRACE_EXPORT_PATH_INVALID',
        );
      }

      const id = this.createId();
      if (this.jobs.has(id)) {
        throw new TraceRenderJobError(
          `Render job id collision: ${id}`,
          'TRACE_EXPORT_ID_COLLISION',
        );
      }
      const jobDirectory = path.join(this.jobsDirectory, id);
      const snapshotPath = path.join(jobDirectory, 'project.json');
      const partPath = `${outputPath}.part`;
      let handle: FileHandle | undefined;
      let createdJobDirectory = false;
      try {
        await fs.mkdir(this.jobsDirectory, { recursive: true });
        await fs.mkdir(jobDirectory);
        createdJobDirectory = true;
        await fs.writeFile(
          snapshotPath,
          JSON.stringify(options.project, null, 2),
          { flag: 'wx' },
        );
        handle = await fs.open(partPath, 'wx');
      } catch (error) {
        await handle?.close().catch(() => undefined);
        if (createdJobDirectory) {
          await fs
            .rm(jobDirectory, { recursive: true, force: true })
            .catch(() => undefined);
        }
        throw new TraceRenderJobError(
          error instanceof Error ? error.message : String(error),
          'TRACE_EXPORT_OUTPUT_OPEN_FAILED',
        );
      }

      const job: TraceRenderJob = {
        id,
        projectId: options.projectId,
        outputPath,
        partPath,
        snapshotPath,
        fps: options.fps,
        frameCount,
        presetId: options.presetId,
        phase: 'prepare',
        frame: 0,
      };
      this.jobs.set(id, job);
      this.handles.set(id, handle);
      return { ...job };
    } finally {
      this.starting = false;
    }
  }

  get(jobId: string): TraceRenderJob | undefined {
    const job = this.jobs.get(jobId);
    return job ? { ...job } : undefined;
  }

  getSnapshot(jobId: string): Promise<string> {
    const job = this.requireJob(jobId);
    return fs.readFile(job.snapshotPath, 'utf8');
  }

  progress(
    jobId: string,
    phase: 'prepare' | 'render' | 'finalize',
    frame = 0,
  ): TraceRenderProgress {
    const job = this.requireActiveJob(jobId);
    if (
      frame < job.frame ||
      frame > job.frameCount ||
      !Number.isInteger(frame)
    ) {
      throw new TraceRenderJobError(
        'Render progress must be an integer frame within the job range and may not move backward.',
        'TRACE_EXPORT_PROGRESS_INVALID',
      );
    }
    job.phase = phase;
    job.frame = frame;
    return this.toProgress(job);
  }

  async writeChunk(
    jobId: string,
    data: Uint8Array,
    position: number,
  ): Promise<void> {
    this.requireActiveJob(jobId);
    const handle = this.handles.get(jobId);
    if (!handle) {
      throw new TraceRenderJobError(
        'The render output is no longer writable.',
        'TRACE_EXPORT_OUTPUT_CLOSED',
      );
    }
    if (!Number.isSafeInteger(position) || position < 0) {
      throw new TraceRenderJobError(
        'Render output chunk position is invalid.',
        'TRACE_EXPORT_CHUNK_INVALID',
      );
    }
    let offset = 0;
    while (offset < data.byteLength) {
      const { bytesWritten } = await handle.write(
        data,
        offset,
        data.byteLength - offset,
        position + offset,
      );
      if (bytesWritten <= 0) {
        throw new TraceRenderJobError(
          'Failed to write an encoded output chunk.',
          'TRACE_EXPORT_WRITE_FAILED',
        );
      }
      offset += bytesWritten;
    }
  }

  async complete(jobId: string): Promise<TraceRenderJob> {
    const job = this.requireActiveJob(jobId);
    if (job.frame !== job.frameCount) {
      throw new TraceRenderJobError(
        'The render cannot complete before all frames are reported.',
        'TRACE_EXPORT_INCOMPLETE',
      );
    }
    const handle = this.handles.get(jobId);
    if (!handle) {
      throw new TraceRenderJobError(
        'The render output is no longer writable.',
        'TRACE_EXPORT_OUTPUT_CLOSED',
      );
    }
    await handle.sync();
    await handle.close();
    this.handles.delete(jobId);
    await fs.rename(job.partPath, job.outputPath);
    job.phase = 'done';
    return { ...job };
  }

  async cancel(jobId: string): Promise<TraceRenderJob> {
    const job = this.requireActiveJob(jobId);
    const handle = this.handles.get(jobId);
    if (handle) {
      await handle.close();
      this.handles.delete(jobId);
    }
    await fs.rm(job.partPath, { force: true });
    job.phase = 'cancelled';
    return { ...job };
  }

  async fail(jobId: string, error: unknown): Promise<TraceRenderJob> {
    const job = this.requireActiveJob(jobId);
    const handle = this.handles.get(jobId);
    if (handle) {
      await handle.close();
      this.handles.delete(jobId);
    }
    job.phase = 'failed';
    job.error = error instanceof Error ? error.message : String(error);
    // Keep the .part file for diagnostics; it never gets the final extension
    // unless `complete` reaches its atomic rename.
    return { ...job };
  }

  private requireJob(jobId: string): TraceRenderJob {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new TraceRenderJobError(
        `Render job "${jobId}" does not exist.`,
        'TRACE_EXPORT_JOB_NOT_FOUND',
      );
    }
    return job;
  }

  private requireActiveJob(jobId: string): TraceRenderJob {
    const job = this.requireJob(jobId);
    if (['done', 'failed', 'cancelled'].includes(job.phase)) {
      throw new TraceRenderJobError(
        `Render job "${jobId}" is already ${job.phase}.`,
        'TRACE_EXPORT_JOB_CLOSED',
      );
    }
    return job;
  }

  private toProgress(job: TraceRenderJob): TraceRenderProgress {
    return {
      jobId: job.id,
      phase: job.phase,
      frame: job.frame,
      frameCount: job.frameCount,
      fraction: job.frameCount ? job.frame / job.frameCount : 0,
      ...(job.error ? { error: job.error } : {}),
    };
  }
}