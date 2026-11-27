import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { TraceSurfaceStore } from '@/main/trace/trace-surface-store';
import type { SurfaceGenerationProposal } from '@/lib/trace/addons/surfaces/generation';

function proposal(summary: string): SurfaceGenerationProposal {
  return {
    summary,
    width: 320,
    height: 180,
    durationMs: 4000,
    loop: true,
    fragment: {
      width: 320,
      height: 180,
      elements: {
        base: {
          id: 'base',
          name: 'Base',
          type: 'rect',
          visible: true,
          locked: false,
          attributes: { x: 0, y: 0, width: 320, height: 180, fill: '#0b1120' },
          origin: { x: 160, y: 90 },
          tracks: [],
          parentId: null,
          childrenIds: [],
        },
      },
      rootElementIds: ['base'],
    },
    tracks: [
      {
        elementId: 'base',
        property: 'opacity',
        keyframes: [
          { timeMs: 0, value: 0.5, easing: 'ease-in-out' },
          { timeMs: 4000, value: 0.5, easing: 'ease-in-out' },
        ],
      },
    ],
    report: {
      width: 320,
      height: 180,
      elementCount: 1,
      droppedTags: {},
      droppedAttributes: {},
      expandedUses: 0,
      warnings: [],
    },
    warnings: [],
    previewSvg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
    previewTimeMs: 2200,
  };
}

describe('TraceSurfaceStore', () => {
  let root: string;
  let store: TraceSurfaceStore;
  let clock: Date;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'qeda-trace-surfaces-'));
    clock = new Date('2026-01-01T00:00:00.000Z');
    store = new TraceSurfaceStore(root, () => clock);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('saves, lists newest-first, loads and deletes surfaces', async () => {
    const first = await store.save({ prompt: 'aurora', proposal: proposal('Aurora') });
    clock = new Date('2026-01-02T00:00:00.000Z');
    const second = await store.save({ prompt: 'waves', proposal: proposal('Waves') });

    expect(first.id).toMatch(/^surf_[a-f0-9]{16}$/);
    const surfaces = await store.list();
    expect(surfaces.map((surface) => surface.summary)).toEqual([
      'Waves',
      'Aurora',
    ]);
    expect(surfaces[0].elementCount).toBe(1);
    expect(surfaces[0].trackCount).toBe(1);
    expect(surfaces[0].thumbnailSvg).toContain('<svg');

    const loaded = await store.load(second.id);
    expect(loaded?.proposal.summary).toBe('Waves');
    expect(loaded?.prompt).toBe('waves');

    expect(await store.delete(second.id)).toBe(true);
    expect(await store.load(second.id)).toBeNull();
    expect(await store.list()).toHaveLength(1);
  });

  it('caps the persisted history at forty records', async () => {
    for (let index = 0; index < 45; index += 1) {
      clock = new Date(2026, 0, 1, 0, 0, index);
      await store.save({ prompt: `brief ${index}`, proposal: proposal(`Surface ${index}`) });
    }
    const files = await readdir(root);
    expect(files).toHaveLength(40);
    const surfaces = await store.list(50);
    expect(surfaces[0].summary).toBe('Surface 44');
    expect(surfaces.at(-1)?.summary).toBe('Surface 5');
  });

  it('returns an empty list for a missing directory', async () => {
    const missing = new TraceSurfaceStore(
      path.join(root, 'does-not-exist'),
      () => clock,
    );
    expect(await missing.list()).toEqual([]);
    // Deletes are idempotent: a missing record is not an error.
    expect(await missing.delete('surf_0000000000000000')).toBe(true);
  });

  it('rejects unsafe ids', async () => {
    await expect(store.load('../outside')).rejects.toThrow(/Invalid surface id/);
  });
});