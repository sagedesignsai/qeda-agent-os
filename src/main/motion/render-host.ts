/**
 * main/motion/render-host.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Owns the hidden window that turns a Motion snapshot into encoded chunks.
 *
 * The window is deliberately not trusted: it receives only the snapshot DTO,
 * reports progress, and hands back positioned byte chunks. Every message is
 * checked against the window that owns the job, and only this module writes to
 * the final output path.
 */

import path from 'node:path';

import { BrowserWindow } from 'electron';

import type { MotionDocument } from '../../lib/motion/types';
import {
  resolveMotionExportSettings,
  type MotionExportSettings,
} from '../../lib/motion/export/presets';
import {
  MotionExportProtocolError,
  type MotionExportChunk,
  type MotionRenderJobPayload,
  type MotionExportProgressRequest,
} from '../../lib/motion/export/protocol';
import { preflightMotionExport, type MotionPreflightIssue } from '../../lib/motion/export/preflight.js';
import type { MotionRenderJob, MotionRenderJobs, MotionRenderProgress } from './render-jobs.js';
import type { MotionRenderRange } from '../../lib/motion/export/render-plan.js';
import { resolveHtmlPath } from '../util.js';

export type MotionExportStartRequest = {
  projectId: string;
  document: MotionDocument;
  presetId: string;
  range: MotionRenderRange;
  outputPath: string;
};

export type MotionExportStartResult = {
  jobId: string;
  outputPath: string;
  frameCount: number;
  settings: MotionExportSettings;
};

export class MotionExportHostError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly issues: MotionPreflightIssue[] = [],
  ) {
    super(message);
    this.name = 'MotionExportHostError';
  }
}

type RenderWindowFactory = (size: { width: number; height: number }) => BrowserWindow;

export type MotionRenderHostOptions = {
  jobs: MotionRenderJobs;
  /** Editor window that receives progress pushes; may be gone mid-render. */
  mainWindow: () => BrowserWindow | null;
  loadUrl?: (jobId: string) => string;
  createWindow?: RenderWindowFactory;
  /** Resolves which bundle assets actually exist on disk for preflight. */
  availableAssetIds?: (projectId: string) => Promise<ReadonlySet<string> | undefined>;
};

const DEFAULT_PRELOAD = path.join(__dirname, '../preload/preload.js');

function defaultLoadUrl(jobId: string): string {
  const base = resolveHtmlPath('motion-render.html');
  return `${base}${base.includes('?') ? '&' : '?'}job=${encodeURIComponent(jobId)}`;
}

/** The render window is sandboxed and never gets Node or the editor shell. */
function defaultCreateWindow({ width, height }: { width: number; height: number }): BrowserWindow {
  return new BrowserWindow({
    show: false,
    width,
    height,
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

export class MotionRenderHost {
  private readonly windows = new Map<string, BrowserWindow>();
  private readonly options: Required<Pick<MotionRenderHostOptions, 'jobs' | 'mainWindow'>> &
    Omit<MotionRenderHostOptions, 'jobs' | 'mainWindow'>;
  private loadUrl: (jobId: string) => string;
  private createWindow: RenderWindowFactory;

  constructor(options: MotionRenderHostOptions) {
    this.options = options;
    this.loadUrl = options.loadUrl ?? defaultLoadUrl;
    this.createWindow = options.createWindow ?? defaultCreateWindow;
  }

  get activeJobId(): string | null {
    for (const jobId of this.windows.keys()) return jobId;
    return null;
  }

  async start(request: MotionExportStartRequest): Promise<MotionExportStartResult> {
    const settings = resolveMotionExportSettings(request.presetId, request.document.meta.output);
    if (path.extname(request.outputPath).toLowerCase() !== settings.extension) {
      throw new MotionExportHostError(
        `This preset writes a ${settings.extension} file.`,
        'MOTION_EXPORT_EXTENSION_MISMATCH',
      );
    }
    const availableAssetIds = await this.options.availableAssetIds?.(request.projectId);
    const issues = preflightMotionExport(request.document, {
      range: request.range,
      container: settings.container,
      ...(availableAssetIds ? { availableAssetIds } : {}),
    });
    const blocking = issues.filter((issue) => issue.severity === 'blocking');
    if (blocking.length > 0) {
      throw new MotionExportHostError(blocking[0].message, blocking[0].code, issues);
    }

    const job = await this.options.jobs.begin({
      projectId: request.projectId,
      document: request.document,
      outputPath: request.outputPath,
      range: request.range,
      fps: settings.fps,
      presetId: settings.presetId,
    });

    let window: BrowserWindow | undefined;
    try {
      window = this.createWindow({ width: settings.width, height: settings.height });
      this.windows.set(job.id, window);
      this.attachWindow(job.id, window);
      await window.loadURL(this.loadUrl(job.id));
    } catch (error) {
      await this.options.jobs.fail(job.id, error).catch(() => undefined);
      window?.destroy();
      this.windows.delete(job.id);
      throw new MotionExportHostError(
        `Could not start the export renderer: ${error instanceof Error ? error.message : String(error)}`,
        'MOTION_EXPORT_WINDOW_FAILED',
        issues,
      );
    }

    this.publish(this.options.jobs.progress(job.id, 'prepare', 0));
    return { jobId: job.id, outputPath: job.outputPath, frameCount: job.frameCount, settings };
  }

  async payload(jobId: string, senderId: number): Promise<MotionRenderJobPayload> {
    const job = this.requireSender(jobId, senderId);
    const snapshot = JSON.parse(await this.options.jobs.getSnapshot(jobId)) as MotionDocument;
    const settings = resolveMotionExportSettings(job.presetId ?? 'launch-1080p', snapshot.meta.output);
    return {
      jobId,
      document: snapshot,
      settings: {
        width: settings.width,
        height: settings.height,
        fps: settings.fps,
        bitrate: settings.bitrate,
        extension: settings.extension,
        container: settings.container,
        codecs: settings.codecs,
      },
      range: job.range,
      frameCount: job.frameCount,
    };
  }

  async writeChunk(chunk: MotionExportChunk, senderId: number): Promise<void> {
    this.requireSender(chunk.jobId, senderId);
    await this.options.jobs.writeChunk(chunk.jobId, chunk.data, chunk.position);
  }

  reportProgress(request: MotionExportProgressRequest, senderId: number): MotionRenderProgress {
    this.requireSender(request.jobId, senderId);
    const progress = this.options.jobs.progress(request.jobId, request.phase, request.frame ?? 0);
    this.publish(progress);
    return progress;
  }

  async complete(jobId: string, senderId: number): Promise<MotionRenderJob> {
    const job = this.requireSender(jobId, senderId);
    const completed = await this.options.jobs.complete(jobId);
    this.destroyWindow(jobId);
    this.publish({ jobId, phase: 'done', frame: job.frameCount, frameCount: job.frameCount, fraction: 1 });
    return completed;
  }

  async fail(jobId: string, message: string, senderId?: number): Promise<MotionRenderJob | undefined> {
    if (senderId !== undefined) this.requireSender(jobId, senderId);
    const failed = await this.options.jobs.fail(jobId, new Error(message)).catch(() => undefined);
    this.destroyWindow(jobId);
    if (failed) {
      this.publish({ jobId, phase: 'failed', frame: failed.frame, frameCount: failed.frameCount, fraction: failed.frameCount ? failed.frame / failed.frameCount : 0, error: failed.error });
    }
    return failed;
  }

  /** Editor-initiated cancel; the renderer sees the flag and exits on its own. */
  async cancel(jobId: string): Promise<MotionRenderJob | undefined> {
    const job = this.options.jobs.get(jobId);
    if (!job || ['done', 'failed', 'cancelled'].includes(job.phase)) return undefined;
    this.windows.get(jobId)?.webContents.send('motion:export-cancel-requested', { jobId });
    const cancelled = await this.options.jobs.cancel(jobId).catch(() => undefined);
    this.destroyWindow(jobId);
    if (cancelled) {
      this.publish({ jobId, phase: 'cancelled', frame: cancelled.frame, frameCount: cancelled.frameCount, fraction: cancelled.frameCount ? cancelled.frame / cancelled.frameCount : 0 });
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
        void this.options.jobs.fail(jobId, new Error('The export window closed before the render completed.')).then((failed) => {
          this.publish({ jobId, phase: 'failed', frame: failed.frame, frameCount: failed.frameCount, fraction: 0, ...(failed.error ? { error: failed.error } : {}) });
        });
      }
    });
    window.webContents.on('render-process-gone', (_event, details) => {
      void this.fail(jobId, `The export renderer stopped (${details.reason}).`).catch(() => undefined);
    });
  }

  private requireSender(jobId: string, senderId: number): MotionRenderJob {
    const job = this.options.jobs.get(jobId);
    if (!job) {
      throw new MotionExportHostError('The export job no longer exists.', 'MOTION_EXPORT_JOB_NOT_FOUND');
    }
    const window = this.windows.get(jobId);
    if (!window || window.isDestroyed() || window.webContents.id !== senderId) {
      throw new MotionExportHostError('This window does not own the export job.', 'MOTION_EXPORT_SENDER_REJECTED');
    }
    return job;
  }

  private destroyWindow(jobId: string): void {
    const window = this.windows.get(jobId);
    this.windows.delete(jobId);
    if (window && !window.isDestroyed()) window.destroy();
  }

  private publish(progress: MotionRenderProgress): void {
    const target = this.options.mainWindow();
    if (target && !target.isDestroyed()) target.webContents.send('motion:export-progress', progress);
  }
}

export function toMotionExportError(error: unknown): { code: string; message: string; issues?: MotionPreflightIssue[] } {
  if (error instanceof MotionExportHostError) {
    return { code: error.code, message: error.message, ...(error.issues.length ? { issues: error.issues } : {}) };
  }
  if (error instanceof MotionExportProtocolError) return { code: error.code, message: error.message };
  return { code: 'MOTION_EXPORT_FAILED', message: error instanceof Error ? error.message : String(error) };
}
