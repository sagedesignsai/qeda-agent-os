import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  TraceProjectStore,
} from '@/main/trace/trace-project-store';
import { createBlankTraceProject } from '@/lib/trace/defaults';
import type { TraceElement } from '@/lib/trace/types';
import type {
  TraceProjectIndexRow,
} from '@/main/trace/trace-project-index';

class MemoryIndex {
  readonly rows = new Map<string, TraceProjectIndexRow>();

  list(): TraceProjectIndexRow[] {
    return [...this.rows.values()].sort((a, b) =>
      b.updated_at.localeCompare(a.updated_at),
    );
  }

  get(id: string): TraceProjectIndexRow | undefined {
    return this.rows.get(id);
  }

  upsert(row: TraceProjectIndexRow): void {
    this.rows.set(row.id, { ...row });
  }

  touch(id: string, openedAt: string): void {
    const row = this.rows.get(id);
    if (row) row.last_opened_at = openedAt;
  }

  markMissing(id: string, missing: boolean): void {
    const row = this.rows.get(id);
    if (row) row.missing = missing ? 1 : 0;
  }

  delete(id: string): void {
    this.rows.delete(id);
  }

  setThumbnail(id: string, thumbnailSvg: string | null): void {
    const row = this.rows.get(id);
    if (row) row.thumbnail_svg = thumbnailSvg;
  }
}

describe('TraceProjectStore', () => {
  let root: string;
  let index: MemoryIndex;
  let clock: Date;
  let sequence: number;
  let store: TraceProjectStore;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'qeda-trace-store-'));
    index = new MemoryIndex();
    clock = new Date('2026-01-01T00:00:00.000Z');
    sequence = 0;
    store = new TraceProjectStore(
      root,
      index as never,
      () => clock,
      () => `trc_test_${++sequence}`,
    );
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('creates a bundle and reports missing storyboard metadata truthfully', async () => {
    const created = await store.createProject({ name: 'One' });

    expect(created.id).toBe('trc_test_1');
    expect(created.name).toBe('One');
    expect(created.revision).toBe(0);
    expect(created.sceneCount).toBe(0);
    expect(index.get(created.id)?.path).toBe(store.projectPath(created.id));
  });

  it('preserves last_opened_at on save and invalidates the thumbnail', async () => {
    const created = await store.createProject({ name: 'One' });
    const opened = await store.openProject(created.id);

    clock = new Date('2026-01-02T00:00:00.000Z');
    await store.openProject(created.id);
    const touched = index.get(created.id)?.last_opened_at;
    expect(touched).toBe(clock.toISOString());

    store.saveThumbnail(created.id, '<svg />');
    expect(index.get(created.id)?.thumbnail_svg).toBe('<svg />');

    const saved = await store.saveProject(
      created.id,
      { ...opened.project, name: 'Renamed' },
      { expectedRevision: opened.revision },
    );

    expect(saved.revision).toBe(1);
    expect(index.get(created.id)?.last_opened_at).toBe(touched);
    expect(index.get(created.id)?.thumbnail_svg).toBeNull();
  });

  it('keeps a thumbnail across rescan while the revision is unchanged', async () => {
    const created = await store.createProject({ name: 'One' });
    store.saveThumbnail(created.id, '<svg />');

    await store.rescan();

    expect(index.get(created.id)?.thumbnail_svg).toBe('<svg />');
    expect(index.get(created.id)?.missing).toBe(0);
  });

  it('invalidates a thumbnail when the bundle revision changes on disk', async () => {
    const created = await store.createProject({ name: 'One' });
    store.saveThumbnail(created.id, '<svg />');

    const file = path.join(store.projectPath(created.id), 'project.json');
    const bundle = JSON.parse(await readFile(file, 'utf8'));
    bundle.revision += 1;
    bundle.savedAt = '2026-01-03T00:00:00.000Z';
    await writeFile(file, JSON.stringify(bundle, null, 2), 'utf8');

    await store.rescan();

    expect(index.get(created.id)?.thumbnail_svg).toBeNull();
    expect(index.get(created.id)?.revision).toBe(1);
  });

  it('rejects a stale revision instead of clobbering the document', async () => {
    const created = await store.createProject({ name: 'One' });
    const opened = await store.openProject(created.id);
    await store.saveProject(created.id, opened.project, {
      expectedRevision: opened.revision,
    });

    await expect(
      store.saveProject(created.id, opened.project, {
        expectedRevision: opened.revision,
      }),
    ).rejects.toMatchObject({
      code: 'TRACE_REVISION_CONFLICT',
    });
  });

  it('persists a legacy repair when the editor opens the project', async () => {
    const legacy = createBlankTraceProject('Legacy');
    const valueElement: TraceElement = {
      id: 'value',
      name: 'Counter Value',
      type: 'text',
      visible: true,
      locked: false,
      sceneId: null,
      origin: { x: 0, y: 0 },
      attributes: { x: 0, y: 0, text: '$0K', fontSize: 48 },
      tracks: [
        {
          id: 'value-text',
          property: 'text',
          label: 'Value',
          keyframes: ['$0K', '$68K', '$131K', '$238K', '$321K', '$428K'].map(
            (value, index) => ({
              id: `kf-${index}`,
              timeMs: index * 100,
              value,
              easing: 'linear',
            }),
          ),
        },
      ],
      parentId: null,
      childrenIds: [],
    };
    legacy.elements.value = valueElement;
    legacy.rootElementIds = ['value'];

    const created = await store.createProject({
      name: 'Legacy',
      project: legacy,
    });
    const opened = await store.openProject(created.id, { repair: true });

    expect(opened.revision).toBe(1);
    expect(opened.project.elements.value.tracks[0].discrete).toBe(true);
    expect(index.get(created.id)?.revision).toBe(1);

    // The repaired bundle is what a later ordinary open sees.
    const again = await store.openProject(created.id);
    expect(again.project.elements.value.tracks[0].discrete).toBe(true);
    expect(again.revision).toBe(1);
  });

  it('deletes an unindexed bundle directory as well as catalogued ones', async () => {
    const unindexed = store.projectPath('trc_unindexed');
    await mkdir(unindexed, { recursive: true });

    await expect(store.deleteProject('trc_unindexed')).resolves.toBe(true);
    await expect(store.deleteProject('trc_unindexed')).resolves.toBe(false);
  });

  it('refuses path traversal ids', async () => {
    await expect(store.deleteProject('../outside')).rejects.toMatchObject({
      code: 'TRACE_INVALID_ID',
    });
  });

  it('refuses a catalog row whose path escaped the projects directory', async () => {
    const created = await store.createProject({ name: 'One' });
    const opened = await store.openProject(created.id);
    const row = index.get(created.id)!;
    index.upsert({ ...row, path: path.join(root, 'outside') });

    await expect(store.openProject(created.id)).rejects.toMatchObject({
      code: 'TRACE_INVALID_PATH',
    });
    await expect(
      store.saveProject(created.id, opened.project, {
        expectedRevision: opened.revision,
      }),
    ).rejects.toMatchObject({ code: 'TRACE_INVALID_PATH' });
    await expect(store.deleteProject(created.id)).rejects.toMatchObject({
      code: 'TRACE_INVALID_PATH',
    });
  });
});