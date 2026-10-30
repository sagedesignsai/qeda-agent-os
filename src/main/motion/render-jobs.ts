/**
 * main/motion/render-jobs.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Main-process owner of export snapshots and output files. The hidden renderer
 * supplies encoded chunks by position; only this module touches output paths.
 */

import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import type { FileHandle } from 'node:fs/promises';
import path from 'node:path';

import { serializeMotionDocument } from '../../lib/motion/schema';
import type { MotionDocument } from '../../lib/motion/types';
import { motionRenderFrameCount, type MotionRenderRange } from './render-plan.js';

export type MotionRenderPhase = 'snapshot' | 'preflight' | 'prepare' | 'render' | 'finalize' | 'done' | 'failed' | 'cancelled';
export type MotionRenderProgress = {
  jobId: string;
  phase: MotionRenderPhase;
  frame: number;
  frameCount: number;
  fraction: number;
  error?: string;
};

export type MotionRenderJob = {
  id: string;
  projectId: string;
  revision: number;
  outputPath: string;
  partPath: string;
  snapshotPath: string;
  range: MotionRenderRange;
  fps: number;
  frameCount: number;
  phase: MotionRenderPhase;
  frame: number;
  error?: string;
};

export class MotionRenderJobError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = 'MotionRenderJobError';
  }
}

export class MotionRenderJobs {
  private readonly jobs = new Map<string, MotionRenderJob>();
  private readonly handles = new Map<string, FileHandle>();
  private starting = false;

  constructor(
    private readonly jobsDirectory: string,
    private readonly createId: () => string = () => `rnd_${randomBytes(12).toString('hex')}`,
  ) {}

  async begin(options: {
    projectId: string;
    document: MotionDocument;
    outputPath: string;
    range: MotionRenderRange;
  }): Promise<MotionRenderJob> {
    if (this.starting || [...this.jobs.values()].some((job) => !['done', 'failed', 'cancelled'].includes(job.phase))) {
      throw new MotionRenderJobError('A Motion export is already running.', 'MOTION_EXPORT_BUSY');
    }
    this.starting = true;
    try {
    if (options.document.meta.id !== options.projectId) {
      throw new MotionRenderJobError('The export snapshot does not match the selected project.', 'MOTION_EXPORT_PROJECT_MISMATCH');
    }
    const fps = options.document.meta.output.fps;
    const frameCount = motionRenderFrameCount(options.range, fps);
    const outputPath = path.resolve(options.outputPath);
    if (!path.extname(outputPath)) throw new MotionRenderJobError('The output file must have an extension.', 'MOTION_EXPORT_PATH_INVALID');

    const id = this.createId();
    if (this.jobs.has(id)) throw new MotionRenderJobError(`Render job id collision: ${id}`, 'MOTION_EXPORT_ID_COLLISION');
    const jobDirectory = path.join(this.jobsDirectory, id);
    const snapshotPath = path.join(jobDirectory, 'project.json');
    const partPath = `${outputPath}.part`;
    let handle: FileHandle | undefined;
    let createdJobDirectory = false;
    try {
      await fs.mkdir(this.jobsDirectory, { recursive: true });
      await fs.mkdir(jobDirectory);
      createdJobDirectory = true;
      await fs.writeFile(snapshotPath, serializeMotionDocument(options.document), { flag: 'wx' });
      handle = await fs.open(partPath, 'wx');
    } catch (error) {
      await handle?.close().catch(() => undefined);
      if (createdJobDirectory) await fs.rm(jobDirectory, { recursive: true, force: true }).catch(() => undefined);
      throw new MotionRenderJobError(
        error instanceof Error ? error.message : String(error),
        'MOTION_EXPORT_OUTPUT_OPEN_FAILED',
      );
    }

    const job: MotionRenderJob = {
      id,
      projectId: options.projectId,
      revision: options.document.revision,
      outputPath,
      partPath,
      snapshotPath,
      range: { ...options.range },
      fps,
      frameCount,
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

  get(jobId: string): MotionRenderJob | undefined {
    const job = this.jobs.get(jobId);
    return job ? { ...job } : undefined;
  }

  getSnapshot(jobId: string): Promise<string> {
    const job = this.requireJob(jobId);
    return fs.readFile(job.snapshotPath, 'utf8');
  }

  progress(jobId: string, phase: 'preflight' | 'prepare' | 'render' | 'finalize', frame = 0): MotionRenderProgress {
    const job = this.requireActiveJob(jobId);
    if (frame < job.frame || frame > job.frameCount || !Number.isInteger(frame)) {
      throw new MotionRenderJobError('Render progress must be an integer frame within the job range and may not move backward.', 'MOTION_EXPORT_PROGRESS_INVALID');
    }
    job.phase = phase;
    job.frame = frame;
    return this.toProgress(job);
  }

  async writeChunk(jobId: string, data: Uint8Array, position: number): Promise<void> {
    this.requireActiveJob(jobId);
    const handle = this.handles.get(jobId);
    if (!handle) throw new MotionRenderJobError('The render output is no longer writable.', 'MOTION_EXPORT_OUTPUT_CLOSED');
    if (!Number.isSafeInteger(position) || position < 0) {
      throw new MotionRenderJobError('Render output chunk position is invalid.', 'MOTION_EXPORT_CHUNK_INVALID');
    }
    let offset = 0;
    while (offset < data.byteLength) {
      const { bytesWritten } = await handle.write(data, offset, data.byteLength - offset, position + offset);
      if (bytesWritten <= 0) throw new MotionRenderJobError('Failed to write an encoded output chunk.', 'MOTION_EXPORT_WRITE_FAILED');
      offset += bytesWritten;
    }
  }

  async complete(jobId: string): Promise<MotionRenderJob> {
    const job = this.requireActiveJob(jobId);
    if (job.frame !== job.frameCount) {
      throw new MotionRenderJobError('The render cannot complete before all frames are reported.', 'MOTION_EXPORT_INCOMPLETE');
    }
    const handle = this.handles.get(jobId);
    if (!handle) throw new MotionRenderJobError('The render output is no longer writable.', 'MOTION_EXPORT_OUTPUT_CLOSED');
    await handle.sync();
    await handle.close();
    this.handles.delete(jobId);
    await fs.rename(job.partPath, job.outputPath);
    job.phase = 'done';
    return { ...job };
  }

  async cancel(jobId: string): Promise<MotionRenderJob> {
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

  async fail(jobId: string, error: unknown): Promise<MotionRenderJob> {
    const job = this.requireActiveJob(jobId);
    const handle = this.handles.get(jobId);
    if (handle) {
      await handle.close();
      this.handles.delete(jobId);
    }
    job.phase = 'failed';
    job.error = error instanceof Error ? error.message : String(error);
    // Keep the .part file for diagnostics/recovery; it is never given the final
    // extension unless `complete` reaches its atomic rename.
    return { ...job };
  }

  private requireJob(jobId: string): MotionRenderJob {
    const job = this.jobs.get(jobId);
    if (!job) throw new MotionRenderJobError(`Render job "${jobId}" does not exist.`, 'MOTION_EXPORT_JOB_NOT_FOUND');
    return job;
  }

  private requireActiveJob(jobId: string): MotionRenderJob {
    const job = this.requireJob(jobId);
    if (['done', 'failed', 'cancelled'].includes(job.phase)) {
      throw new MotionRenderJobError(`Render job "${jobId}" is already ${job.phase}.`, 'MOTION_EXPORT_JOB_CLOSED');
    }
    return job;
  }

  private toProgress(job: MotionRenderJob): MotionRenderProgress {
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
