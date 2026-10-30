/**
 * __tests__/motion-render-jobs.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Exercises snapshot isolation, output commit, cancellation, and failure recovery.
 */

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createStarterMotionDocument } from '@/lib/motion/defaults';
import { MotionRenderJobError, MotionRenderJobs } from '@/main/motion/render-jobs';

describe('MotionRenderJobs', () => {
  let root: string;
  let outputDirectory: string;
  let jobs: MotionRenderJobs;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'motion-render-jobs-'));
    outputDirectory = path.join(root, 'exports');
    await fs.mkdir(outputDirectory);
    jobs = new MotionRenderJobs(path.join(root, 'jobs'), () => 'rnd_test');
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  function document() {
    const doc = createStarterMotionDocument('2026-01-01T00:00:00.000Z');
    doc.meta.id = 'prj_render';
    doc.revision = 7;
    return doc;
  }

  it('writes an immutable snapshot and commits positioned chunks with an atomic rename', async () => {
    const doc = document();
    const outputPath = path.join(outputDirectory, 'launch.mp4');
    const job = await jobs.begin({ projectId: 'prj_render', document: doc, outputPath, range: { start: 1, end: 2 } });
    doc.meta.name = 'Edited after start';

    expect(JSON.parse(await jobs.getSnapshot(job.id)).meta.name).toBe('Launch hero');
    await expect(fs.access(outputPath)).rejects.toThrow();
    await jobs.writeChunk(job.id, new Uint8Array([4, 5]), 2);
    await jobs.writeChunk(job.id, new Uint8Array([1, 2]), 0);
    expect(jobs.progress(job.id, 'render', 30)).toMatchObject({ frame: 30, frameCount: 30, fraction: 1 });
    const completed = await jobs.complete(job.id);

    expect(completed).toMatchObject({ phase: 'done', revision: 7 });
    expect([...await fs.readFile(outputPath)]).toEqual([1, 2, 4, 5]);
    await expect(fs.access(`${outputPath}.part`)).rejects.toThrow();
  });

  it('allows one active job and removes partial output when cancelled', async () => {
    const outputPath = path.join(outputDirectory, 'cancel.mp4');
    const job = await jobs.begin({ projectId: 'prj_render', document: document(), outputPath, range: { start: 0, end: 1 } });
    await expect(jobs.begin({ projectId: 'prj_render', document: document(), outputPath: path.join(outputDirectory, 'other.mp4'), range: { start: 0, end: 1 } }))
      .rejects.toMatchObject({ code: 'MOTION_EXPORT_BUSY' });
    await jobs.writeChunk(job.id, new Uint8Array([8, 9]), 0);

    expect((await jobs.cancel(job.id)).phase).toBe('cancelled');
    await expect(fs.access(`${outputPath}.part`)).rejects.toThrow();
    expect(() => jobs.progress(job.id, 'render')).toThrow('already cancelled');
  });

  it('preserves partial output after failure and rejects an incomplete commit', async () => {
    const outputPath = path.join(outputDirectory, 'failed.mp4');
    const job = await jobs.begin({ projectId: 'prj_render', document: document(), outputPath, range: { start: 0, end: 1 } });
    await jobs.writeChunk(job.id, new Uint8Array([3]), 0);
    await expect(jobs.complete(job.id)).rejects.toMatchObject({ code: 'MOTION_EXPORT_INCOMPLETE' });
    expect((await jobs.fail(job.id, new Error('codec failed')))).toMatchObject({ phase: 'failed', error: 'codec failed' });
    expect([...await fs.readFile(`${outputPath}.part`)]).toEqual([3]);
    expect(await fs.access(outputPath).then(() => true, () => false)).toBe(false);
  });

  it('rejects a snapshot from another project and a pre-existing partial path', async () => {
    const wrong = document();
    wrong.meta.id = 'different-project';
    await expect(jobs.begin({ projectId: 'prj_render', document: wrong, outputPath: path.join(outputDirectory, 'wrong.mp4'), range: { start: 0, end: 1 } }))
      .rejects.toBeInstanceOf(MotionRenderJobError);
    await fs.writeFile(path.join(outputDirectory, 'occupied.mp4.part'), 'keep');
    await expect(jobs.begin({ projectId: 'prj_render', document: document(), outputPath: path.join(outputDirectory, 'occupied.mp4'), range: { start: 0, end: 1 } }))
      .rejects.toMatchObject({ code: 'MOTION_EXPORT_OUTPUT_OPEN_FAILED' });
    expect(await fs.readFile(path.join(outputDirectory, 'occupied.mp4.part'), 'utf8')).toBe('keep');
  });
});
