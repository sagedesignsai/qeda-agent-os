/**
 * __tests__/motion-render-host.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Exercises the hidden-window boundary: preflight blocks before any file exists,
 * only the owning window may stream chunks, and completion/cancel own the output.
 */

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { BrowserWindow } from 'electron';

import { createStarterMotionDocument } from '@/lib/motion/defaults';
import { createMotionTemplate } from '@/lib/motion/templates';
import { MotionRenderHost, MotionExportHostError } from '@/main/motion/render-host';
import { MotionRenderJobs } from '@/main/motion/render-jobs';

class FakeWebContents {
  readonly send = jest.fn();
  readonly on = jest.fn();
  constructor(readonly id: number) {}
}

class FakeWindow {
  readonly webContents: FakeWebContents;
  readonly loadURL = jest.fn(async () => undefined);
  readonly destroy = jest.fn(() => {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const listener of this.closed) listener();
  });
  private closed: Array<() => void> = [];
  private destroyed = false;

  constructor(id: number) {
    this.webContents = new FakeWebContents(id);
  }

  on(event: string, listener: () => void): void {
    if (event === 'closed') this.closed.push(listener);
  }

  isDestroyed(): boolean {
    return this.destroyed;
  }
}

describe('MotionRenderHost', () => {
  let root: string;
  let outputPath: string;
  let jobs: MotionRenderJobs;
  let windows: FakeWindow[];
  let editor: { isDestroyed: () => boolean; webContents: { send: jest.Mock } };

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'motion-render-host-'));
    outputPath = path.join(root, 'launch.mp4');
    jobs = new MotionRenderJobs(path.join(root, 'jobs'));
    windows = [];
    editor = { isDestroyed: () => false, webContents: { send: jest.fn() } };
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  function host(): MotionRenderHost {
    return new MotionRenderHost({
      jobs,
      mainWindow: () => editor as unknown as BrowserWindow,
      loadUrl: (jobId) => `app://motion-render?job=${jobId}`,
      createWindow: () => {
        const window = new FakeWindow(100 + windows.length);
        windows.push(window);
        return window as unknown as BrowserWindow;
      },
    });
  }

  function document(projectId = 'prj_export') {
    const doc = createStarterMotionDocument('2026-01-01T00:00:00.000Z');
    doc.meta.id = projectId;
    return doc;
  }

  it('refuses to start when preflight finds a blocking issue, before opening output', async () => {
    const render = host();
    const template = createMotionTemplate('model-reveal');
    template.meta.id = 'prj_export';
    await expect(render.start({
      projectId: 'prj_export', document: template, presetId: 'launch-1080p', range: { start: 0, end: 4 }, outputPath,
    })).rejects.toMatchObject({ code: 'MOTION_ASSET_MISSING' });
    expect(windows).toHaveLength(0);
    await expect(fs.access(`${outputPath}.part`)).rejects.toThrow();
    await expect(render.start({
      projectId: 'prj_export', document: template, presetId: 'launch-1080p', range: { start: 0, end: 4 }, outputPath: `${outputPath}.webm`,
    })).rejects.toBeInstanceOf(MotionExportHostError);
  });

  it('opens a window at preset size and serves the snapshot only to that window', async () => {
    const render = host();
    const started = await render.start({
      projectId: 'prj_export', document: document(), presetId: 'social-square', range: { start: 0, end: 1 }, outputPath,
    });

    expect(windows).toHaveLength(1);
    expect(windows[0].loadURL).toHaveBeenCalledWith(`app://motion-render?job=${started.jobId}`);
    expect(started.settings).toMatchObject({ width: 1080, height: 1080, container: 'mp4' });
    expect(editor.webContents.send).toHaveBeenCalledWith('motion:export-progress', expect.objectContaining({ phase: 'prepare' }));

    const payload = await render.payload(started.jobId, windows[0].webContents.id);
    expect(payload.document.meta.name).toBe('Launch hero');
    expect(payload.settings).toMatchObject({ width: 1080, height: 1080, fps: 30, extension: '.mp4' });
    await expect(render.payload(started.jobId, 999)).rejects.toMatchObject({ code: 'MOTION_EXPORT_SENDER_REJECTED' });
    await expect(render.payload(started.jobId, windows[0].webContents.id)).resolves.toBeDefined();
    await render.cancel(started.jobId);
  });

  it('streams chunks, publishes progress, and atomically commits the output', async () => {
    const render = host();
    const started = await render.start({
      projectId: 'prj_export', document: document(), presetId: 'launch-1080p', range: { start: 0, end: 1 }, outputPath,
    });
    const sender = windows[0].webContents.id;

    await render.writeChunk({ jobId: started.jobId, data: new Uint8Array([9, 8]), position: 0 }, sender);
    render.reportProgress({ jobId: started.jobId, phase: 'render', frame: 30 }, sender);
    expect(editor.webContents.send).toHaveBeenLastCalledWith('motion:export-progress', expect.objectContaining({ phase: 'render', fraction: 1 }));

    const completed = await render.complete(started.jobId, sender);
    expect(completed.outputPath).toBe(outputPath);
    expect([...await fs.readFile(outputPath)]).toEqual([9, 8]);
    expect(windows[0].destroy).toHaveBeenCalled();
    await expect(render.payload(started.jobId, sender)).rejects.toMatchObject({ code: 'MOTION_EXPORT_SENDER_REJECTED' });
  });

  it('cancels by asking the window, removing the partial file, and publishing the state', async () => {
    const render = host();
    const started = await render.start({
      projectId: 'prj_export', document: document(), presetId: 'launch-1080p', range: { start: 0, end: 1 }, outputPath,
    });
    const sender = windows[0].webContents.id;
    await render.writeChunk({ jobId: started.jobId, data: new Uint8Array([1]), position: 0 }, sender);

    await render.cancel(started.jobId);
    expect(windows[0].webContents.send).toHaveBeenCalledWith('motion:export-cancel-requested', { jobId: started.jobId });
    await expect(fs.access(`${outputPath}.part`)).rejects.toThrow();
    expect(editor.webContents.send).toHaveBeenLastCalledWith('motion:export-progress', expect.objectContaining({ phase: 'cancelled' }));
    expect(await render.cancel(started.jobId)).toBeUndefined();
  });
});
