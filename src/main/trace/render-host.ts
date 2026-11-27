/**
 * main/trace/render-host.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Owns the hidden window that turns a Trace snapshot into an encoded video.
 *
 * The window is deliberately not trusted: it receives only the snapshot DTO,
 * reports progress, and hands back positioned byte chunks. Every message is
 * checked against the window that owns the job, and only this module writes to
 * the final output path. Adapted from `main/motion/render-host.ts`.
 */

import path from 'node:path';

import { BrowserWindow } from 'electron';

import type { TraceProject } from '../../lib/trace/types';
import {
  resolveTraceExportSettings,
  type TraceExportSettings,
} from '../../lib/trace/export/presets';
import { preflightTraceExport, type TracePreflightIssue } from '../../lib/trace/export/preflight';
import type {
  TraceExportChunk,
  TraceRenderJobPayload,
  TraceExportProgressRequest,
} from '../../lib/trace/export/protocol';
import type { TraceRenderJob, TraceRenderJobs, TraceRenderProgress } from './render-jobs';
import { resolveHtmlPath } from '../util.js';

export type TraceExportStartRequest = {
  projectId: string;
  project: TraceProject;
  presetId: string;
  outputPath: string;
};

export type TraceExportStartResult = {
  jobId: string;
  outputPath: string;
  frameCount: number;
  settings: TraceExportSettings;
};

export class TraceExportHostError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly issues: TracePreflightIssue[] = [],
  ) {
    super(message);
    this.name = 'TraceExportHostError';
  }
}

type RenderWindowFactory = (size: { width: number; height: number }) => BrowserWindow;

export type TraceRenderHostOptions = {
  jobs: TraceRenderJobs;
  /** Editor window that receives progress pushes; may be gone mid-render. */
  mainWindow: () => BrowserWindow | null;
  loadUrl?: (jobId: string) => string;
  createWindow?: RenderWindowFactory;
};

const DEFAULT_PRELOAD = path.join(__dirname, '../preload/preload.js');

function defaultLoadUrl(jobId: string): string {
  const base = resolveHtmlPath('trace-render.html');
  return `${base}${base.includes('?') ? '&' : '?'}job=${encodeURIComponent(jobId)}`;
}

/** The render window is sandboxed and never gets Node or the editor shell. */
function defaultCreateWindow({
  width,
  height,
}: {
  width: number;
  height: number;
}): BrowserWindow {
  return new BrowserWindow({
    show: false,
    width: Math.min(width, 1920),
    height: Math.min(height, 1080),
    useContentSize: true,
    frame: false,
    backgroundColor: '#000000',
    webPreferences: {
      preload: DEFAULT_PRELOAD,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
}

export class TraceRenderHost {
  private readonly windows = new Map<string, BrowserWindow>();
  private readonly options: Required<Pick<TraceRenderHostOptions, 'jobs' | 'mainWindow'>> &
    Omit<TraceRenderHostOptions, 'jobs' | 'mainWindow'>;
  private loadUrl: (jobId: string) => string;
  private createWindow: RenderWindowFactory;

  constructor(options: TraceRenderHostOptions) {
    this.options = options;
    this.loadUrl = options.loadUrl ?? defaultLoadUrl;
    this.createWindow = options.createWindow ?? defaultCreateWindow;
  }

  get activeJobId(): string | null {
    for (const jobId of this.windows.keys()) return jobId;
    return null;
  }

  async start(request: TraceExportStartRequest): Promise<TraceExportStartResult> {
    const settings = resolveTraceExportSettings(request.presetId, {
      width: request.project.width,
      height: request.project.height,
      fps: request.project.fps,
    });
    if (path.extname(request.outputPath).toLowerCase() !== settings.extension) {
      throw new TraceExportHostError(
        `This preset writes a ${settings.extension} file.`,
        'TRACE_EXPORT_EXTENSION_MISMATCH',
      );
    }

    const issues = preflightTraceExport(request.project, settings);
    const blocking = issues.filter((issue) => issue.severity === 'blocking');
    if (blocking.length > 0) {
      throw new TraceExportHostError(blocking[0].message, blocking[0].code, issues);
    }

    const job = await this.options.jobs.begin({
      projectId: request.projectId,
      project: request.project,
      outputPath: request.outputPath,
      fps: settings.fps,
      presetId: settings.presetId,
    });

    let window: BrowserWindow | undefined;
    try {
      window = this.createWindow({
        width: settings.width,
        height: settings.height,
      });
      this.windows.set(job.id, window);
      this.attachWindow(job.id, window);
      await window.loadURL(this.loadUrl(job.id));
    } catch (error) {
      await this.options.jobs.fail(job.id, error).catch(() => undefined);
      window?.destroy();
      this.windows.delete(job.id);
      throw new TraceExportHostError(
        `Could not start the export renderer: ${error instanceof Error ? error.message : String(error)}`,
        'TRACE_EXPORT_WINDOW_FAILED',
        issues,
      );
    }

    this.publish(this.options.jobs.progress(job.id, 'prepare', 0));
    return {
      jobId: job.id,
      outputPath: job.outputPath,
      frameCount: job.frameCount,
      settings,
    };
  }

  async payload(jobId: string, senderId: number): Promise<TraceRenderJobPayload> {
    const job = this.requireSender(jobId, senderId);
    const snapshot = JSON.parse(await this.options.jobs.getSnapshot(jobId)) as TraceProject;
    const settings = resolveTraceExportSettings(job.presetId, {
      width: snapshot.width,
      height: snapshot.height,
      fps: snapshot.fps,
    });
    return {
      jobId,
      project: snapshot,
      settings: {
        width: settings.width,
        height: settings.height,
        fps: settings.fps,
        bitrate: settings.bitrate,
        extension: settings.extension,
        container: settings.container,
        codecs: settings.codecs,
        audioCodecs: settings.audioCodecs,
      },
      frameCount: job.frameCount,
    };
  }

  async writeChunk(chunk: TraceExportChunk, senderId: number): Promise<void> {
    this.requireSender(chunk.jobId, senderId);
    await this.options.jobs.writeChunk(chunk.jobId, chunk.data, chunk.position);
  }

  reportProgress(
    request: TraceExportProgressRequest,
    senderId: number,
  ): TraceRenderProgress {
    this.requireSender(request.jobId, senderId);
    const progress = this.options.jobs.progress(
      request.jobId,
      request.phase,
      request.frame ?? 0,
    );
    this.publish(progress);
    return progress;
  }

  async complete(jobId: string, senderId: number): Promise<TraceRenderJob> {
    const job = this.requireSender(jobId, senderId);
    const completed = await this.options.jobs.complete(jobId);
    this.destroyWindow(jobId);
    this.publish({
      jobId,
      phase: 'done',
      frame: job.frameCount,
      frameCount: job.frameCount,
      fraction: 1,
    });
    return completed;
  }

  async fail(
    jobId: string,
    message: string,
    senderId?: number,
  ): Promise<TraceRenderJob | undefined> {
    if (senderId !== undefined) this.requireSender(jobId, senderId);
    const failed = await this.options.jobs
      .fail(jobId, new Error(message))
      .catch(() => undefined);
    this.destroyWindow(jobId);
    if (failed) {
      this.publish({
        jobId,
        phase: 'failed',
        frame: failed.frame,
        frameCount: failed.frameCount,
        fraction: failed.frameCount ? failed.frame / failed.frameCount : 0,
        error: failed.error,
      });
    }
    return failed;
  }

  /** Editor-initiated cancel; the renderer sees the flag and exits on its own. */
  async cancel(jobId: string): Promise<TraceRenderJob | undefined> {
    const job = this.options.jobs.get(jobId);
    if (!job || ['done', 'failed', 'cancelled'].includes(job.phase)) {
      return undefined;
    }
    this.windows
      .get(jobId)
      ?.webContents.send('trace:export-cancel-requested', { jobId });
    const cancelled = await this.options.jobs
      .cancel(jobId)
      .catch(() => undefined);
    this.destroyWindow(jobId);
    if (cancelled) {
      this.publish({
        jobId,
        phase: 'cancelled',
        frame: cancelled.frame,
        frameCount: cancelled.frameCount,
        fraction: cancelled.frameCount ? cancelled.frame / cancelled.frameCount : 0,
      });
    }
    return cancelled;
  }

  /** App shutdown: close windows without leaving a job appearing to run. */
  async dispose(): Promise<void> {
    const jobIds = [...this.windows.keys()];
    for (const jobId of jobIds) {
      await this.cancel(jobId);
    }
    for (const window of this.windows.values()) window.destroy();
    this.windows.clear();
  }

  private attachWindow(jobId: string, window: BrowserWindow): void {
    window.on('closed', () => {
      this.windows.delete(jobId);
      const job = this.options.jobs.get(jobId);
      if (job && !['done', 'failed', 'cancelled'].includes(job.phase)) {
        void this.options.jobs
          .fail(jobId, new Error('The export window closed before the render completed.'))
          .then((failed) => {
            this.publish({
              jobId,
              phase: 'failed',
              frame: failed.frame,
              frameCount: failed.frameCount,
              fraction: 0,
              ...(failed.error ? { error: failed.error } : {}),
            });
          });
      }
    });
    window.webContents.on('render-process-gone', (_event, details) => {
      void this.fail(jobId, `The export renderer stopped (${details.reason}).`).catch(
        () => undefined,
      );
    });
  }

  private requireSender(jobId: string, senderId: number): TraceRenderJob {
    const job = this.options.jobs.get(jobId);
    if (!job) {
      throw new TraceExportHostError(
        'The export job no longer exists.',
        'TRACE_EXPORT_JOB_NOT_FOUND',
      );
    }
    const window = this.windows.get(jobId);
    if (!window || window.isDestroyed() || window.webContents.id !== senderId) {
      throw new TraceExportHostError(
        'This window does not own the export job.',
        'TRACE_EXPORT_SENDER_REJECTED',
      );
    }
    return job;
  }

  private destroyWindow(jobId: string): void {
    const window = this.windows.get(jobId);
    this.windows.delete(jobId);
    if (window && !window.isDestroyed()) window.destroy();
  }

  private publish(progress: TraceRenderProgress): void {
    const target = this.options.mainWindow();
    if (target && !target.isDestroyed()) {
      target.webContents.send('trace:export-progress', progress);
    }
  }
}

export function toTraceExportError(
  error: unknown,
): { code: string; message: string; issues?: TracePreflightIssue[] } {
  if (error instanceof TraceExportHostError) {
    return {
      code: error.code,
      message: error.message,
      ...(error.issues.length ? { issues: error.issues } : {}),
    };
  }
  return {
    code: 'TRACE_EXPORT_FAILED',
    message: error instanceof Error ? error.message : String(error),
  };
}