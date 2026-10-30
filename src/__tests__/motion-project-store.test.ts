import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createStarterMotionDocument } from '@/lib/motion/defaults';
import { parseMotionDocument, serializeMotionDocument } from '@/lib/motion/schema';
import { MotionProjectStore } from '@/main/motion/project-store';
import type { MotionProjectIndexRow } from '@/main/motion/project-index';

class MemoryIndex {
  rows = new Map<string, MotionProjectIndexRow>();
  list() { return [...this.rows.values()]; }
  get(id: string) { return this.rows.get(id); }
  upsert(row: MotionProjectIndexRow) { this.rows.set(row.id, row); }
  markMissing(id: string, missing: boolean) {
    const row = this.rows.get(id);
    if (row) this.rows.set(id, { ...row, missing: missing ? 1 : 0 });
  }
  delete(id: string) { this.rows.delete(id); }
}

describe('MotionProjectStore', () => {
  let root: string;
  let index: MemoryIndex;
  let store: MotionProjectStore;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'motion-project-store-'));
    index = new MemoryIndex();
    store = new MotionProjectStore(root, index, () => new Date('2026-01-01T00:00:00.000Z'), () => 'prj_test123456');
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('creates a v4 bundle and writes a deterministic canonical document', async () => {
    const project = await store.createProject({ name: 'Launch film' });
    const canonical = await fs.readFile(path.join(project.path, 'project.json'), 'utf8');
    expect(JSON.parse(canonical)).not.toHaveProperty('scene');
    expect(JSON.parse(canonical).schemaVersion).toBe(4);
    expect(parseMotionDocument(JSON.parse(canonical)).meta.id).toBe(project.id);
    expect(serializeMotionDocument(parseMotionDocument(JSON.parse(canonical)))).toBe(canonical);
    expect(await fs.access(path.join(project.path, 'project.autosave.json')).then(() => true, () => false)).toBe(false);
    expect(store.listProjects()).toHaveLength(1);
  });

  it('offers a newer sidecar for recovery and commits it at a new revision', async () => {
    const project = await store.createProject({ name: 'Recover me' });
    const canonicalPath = path.join(project.path, 'project.json');
    const canonical = parseMotionDocument(JSON.parse(await fs.readFile(canonicalPath, 'utf8')));
    const candidate = {
      ...canonical,
      revision: canonical.revision + 2,
      meta: { ...canonical.meta, name: 'Recovered edit' },
    };
    const serialized = serializeMotionDocument(candidate);
    const sidecar = {
      format: 1,
      revision: candidate.revision,
      savedAt: '2026-01-02T12:00:00.000Z',
      sha256: createHash('sha256').update(serialized, 'utf8').digest('hex'),
      document: JSON.parse(serialized),
    };
    await fs.writeFile(path.join(project.path, 'project.autosave.json'), JSON.stringify(sidecar));

    const opened = await store.openProject(project.id);
    expect(opened.recovery?.revision).toBe(candidate.revision);
    const recovered = await store.resolveRecovery(project.id, 'recover');
    expect(recovered.document.meta.name).toBe('Recovered edit');
    expect(recovered.document.revision).toBe(candidate.revision + 1);
    expect((await store.openProject(project.id)).recovery).toBeNull();
  });

  it('serializes concurrent saves without interleaving canonical writes', async () => {
    const project = await store.createProject({ name: 'Queue' });
    const original = parseMotionDocument(JSON.parse(await fs.readFile(path.join(project.path, 'project.json'), 'utf8')));
    const first = { ...original, revision: 1, meta: { ...original.meta, name: 'First' } };
    const second = { ...original, revision: 2, meta: { ...original.meta, name: 'Second' } };
    await Promise.all([store.saveProject(project.id, first), store.saveProject(project.id, second)]);
    const final = parseMotionDocument(JSON.parse(await fs.readFile(path.join(project.path, 'project.json'), 'utf8')));
    expect(final.meta.name).toBe('Second');
    expect(final.revision).toBe(2);
  });

  it('backs up the original v3 bytes before saving the migrated document', async () => {
    const project = await store.createProject({ name: 'Legacy' });
    const canonicalPath = path.join(project.path, 'project.json');
    const v3 = { ...createStarterMotionDocument('2025-12-31T00:00:00.000Z'), schemaVersion: 3 };
    const original = `${JSON.stringify(v3, null, 2)}\n`;
    await fs.writeFile(canonicalPath, original);

    const opened = await store.openProject(project.id);
    expect(opened.dirty).toBe(true);
    await store.saveProject(project.id, opened.document, { forceBackup: opened.dirty });

    expect(await fs.readFile(path.join(project.path, 'backups', 'project-0.json'), 'utf8')).toBe(original);
    expect(JSON.parse(await fs.readFile(canonicalPath, 'utf8')).schemaVersion).toBe(4);
  });

  it('refuses a newer schema without changing the canonical or recovery files', async () => {
    const project = await store.createProject({ name: 'Future' });
    const canonicalPath = path.join(project.path, 'project.json');
    const future = `${JSON.stringify({ ...createStarterMotionDocument(), schemaVersion: 5 }, null, 2)}\n`;
    const sidecarPath = path.join(project.path, 'project.autosave.json');
    await fs.writeFile(canonicalPath, future);
    await fs.writeFile(sidecarPath, 'inspection copy');

    await expect(store.openProject(project.id)).rejects.toMatchObject({ code: 'MOTION_PROJECT_NEWER_SCHEMA' });
    expect(await fs.readFile(canonicalPath, 'utf8')).toBe(future);
    expect(await fs.readFile(sidecarPath, 'utf8')).toBe('inspection copy');
  });

  it('preserves an invalid sidecar and reports it without overwriting the canonical', async () => {
    const project = await store.createProject({ name: 'Invalid recovery' });
    const canonicalPath = path.join(project.path, 'project.json');
    const sidecarPath = path.join(project.path, 'project.autosave.json');
    const canonical = await fs.readFile(canonicalPath, 'utf8');
    const invalid = '{not json';
    await fs.writeFile(sidecarPath, invalid);

    const opened = await store.openProject(project.id);
    expect(opened.recovery).toBeNull();
    expect(opened.warnings).toContain('An autosave recovery file is invalid and was preserved for inspection.');
    expect(await fs.readFile(canonicalPath, 'utf8')).toBe(canonical);
    expect(await fs.readFile(sidecarPath, 'utf8')).toBe(invalid);
  });

  it('rebuilds an empty index from canonical bundle folders', async () => {
    const project = await store.createProject({ name: 'Reindexed' });
    const rebuiltIndex = new MemoryIndex();
    const rebuiltStore = new MotionProjectStore(root, rebuiltIndex);

    const projects = await rebuiltStore.rescan(true);

    expect(projects).toEqual([expect.objectContaining({ id: project.id, name: 'Reindexed', missing: false })]);
    expect(rebuiltIndex.get(project.id)?.path).toBe(project.path);
  });

  it('keeps a missing bundle visible in the index for later relocation', async () => {
    const project = await store.createProject({ name: 'Moved' });
    await fs.rename(project.path, path.join(root, 'outside-bundle'));

    const projects = await store.rescan(true);

    expect(projects).toEqual([expect.objectContaining({ id: project.id, name: 'Moved', missing: true })]);
  });

  it('keeps corrupt bundles discoverable when rebuilding an empty index', async () => {
    const corruptId = 'prj_corrupt1234';
    const corruptPath = path.join(root, 'projects', corruptId);
    await fs.mkdir(corruptPath, { recursive: true });
    await fs.writeFile(path.join(corruptPath, 'project.json'), '{broken');
    const rebuilt = new MotionProjectStore(root, new MemoryIndex());

    const projects = await rebuilt.rescan(true);

    expect(projects).toEqual([expect.objectContaining({ id: corruptId, missing: false })]);
    await expect(rebuilt.openProject(corruptId)).rejects.toMatchObject({ code: 'MOTION_PROJECT_INVALID' });
    expect(await fs.readFile(path.join(corruptPath, 'project.json'), 'utf8')).toBe('{broken');
  });

  it('lists and restores only validated project backups', async () => {
    const project = await store.createProject({ name: 'Backup restore' });
    const canonicalPath = path.join(project.path, 'project.json');
    const original = parseMotionDocument(JSON.parse(await fs.readFile(canonicalPath, 'utf8')));
    const edit = { ...original, revision: 1, meta: { ...original.meta, name: 'Later edit' } };
    await store.saveProject(project.id, edit, { forceBackup: true });

    expect(await store.listBackups(project.id)).toEqual([
      expect.objectContaining({ revision: 0, bytes: expect.any(Number), modifiedAt: expect.any(String) }),
    ]);
    const corruptBytes = '{corrupt';
    await fs.writeFile(canonicalPath, corruptBytes);
    const restored = await store.restoreBackup(project.id, 0);

    expect(restored.document.meta.name).toBe('Backup restore');
    expect(restored.document.revision).toBe(1);
    expect(JSON.parse(await fs.readFile(canonicalPath, 'utf8')).meta.name).toBe('Backup restore');
    expect(await fs.readFile(path.join(project.path, 'project.corrupt-1767225600000.json'), 'utf8')).toBe(corruptBytes);
  });

  it('preserves invalid autosave bytes in a separate inspection file', async () => {
    const project = await store.createProject({ name: 'Inspection copy' });
    const invalid = Buffer.from([0x7b, 0x00, 0xff, 0x7d]);
    await fs.writeFile(path.join(project.path, 'project.autosave.json'), invalid);

    const copyPath = await store.preserveInvalidRecoveryCopy(project.id);

    expect(path.basename(copyPath)).toMatch(/^project\.autosave\.inspection-\d+\.json$/);
    expect(await fs.readFile(copyPath)).toEqual(invalid);
    expect(await fs.readFile(path.join(project.path, 'project.autosave.json'))).toEqual(invalid);
  });

  it('duplicates assets into a fresh repair bundle without changing the corrupt source', async () => {
    const project = await store.createProject({ name: 'Needs repair' });
    const assetDirectory = path.join(project.path, 'assets', 'asset_keep');
    await fs.mkdir(assetDirectory, { recursive: true });
    await fs.writeFile(path.join(assetDirectory, 'source.png'), 'asset bytes');
    const canonicalPath = path.join(project.path, 'project.json');
    const original = '{damaged source document';
    await fs.writeFile(canonicalPath, original);
    const repairStore = new MotionProjectStore(root, index, () => new Date('2026-01-02T00:00:00.000Z'), () => 'prj_repair12345');

    const repair = await repairStore.duplicateForRepair(project.id);

    expect(repair.id).toBe('prj_repair12345');
    expect(JSON.parse(await fs.readFile(path.join(repair.path, 'project.json'), 'utf8')).schemaVersion).toBe(4);
    expect(await fs.readFile(path.join(repair.path, 'assets', 'asset_keep', 'source.png'), 'utf8')).toBe('asset bytes');
    expect(await fs.readFile(canonicalPath, 'utf8')).toBe(original);
  });

  it('prunes backup history to ten files after a successful save', async () => {
    const project = await store.createProject({ name: 'Retention' });
    const backupsPath = path.join(project.path, 'backups');
    await Promise.all(Array.from({ length: 12 }, (_, revision) =>
      fs.writeFile(path.join(backupsPath, `project-${revision + 1}.json`), '{}'),
    ));
    const document = parseMotionDocument(JSON.parse(await fs.readFile(path.join(project.path, 'project.json'), 'utf8')));
    await store.saveProject(project.id, { ...document, revision: 1 }, { forceBackup: false });

    const files = await fs.readdir(backupsPath);
    expect(files).toHaveLength(10);
    expect(files).toContain('project-12.json');
    expect(files).not.toContain('project-1.json');
  });

  it('expires old staging and trash entries during rescan but preserves recent files', async () => {
    const project = await store.createProject({ name: 'Cleanup' });
    const stagingPath = path.join(project.path, '.staging');
    const trashPath = path.join(project.path, '.trash');
    const expiredStage = path.join(stagingPath, 'expired');
    const recentStage = path.join(stagingPath, 'recent');
    const expiredTrash = path.join(trashPath, 'expired');
    await Promise.all([expiredStage, recentStage, expiredTrash].map((file) => fs.writeFile(file, 'payload')));
    const old = new Date('2025-01-01T00:00:00.000Z');
    const recent = new Date('2025-12-31T23:00:00.000Z');
    await Promise.all([
      fs.utimes(expiredStage, old, old),
      fs.utimes(expiredTrash, old, old),
      fs.utimes(recentStage, recent, recent),
    ]);

    await store.rescan(true);

    await expect(fs.access(expiredStage)).rejects.toThrow();
    await expect(fs.access(expiredTrash)).rejects.toThrow();
    await expect(fs.access(recentStage)).resolves.toBeUndefined();
  });

  it('saves a failed project to a new bundle in the local projects root', async () => {
    const source = await store.createProject({ name: 'Offline location' });
    const sourcePath = source.path;
    const movedPath = path.join(root, 'external-location', source.id);
    await fs.mkdir(path.dirname(movedPath), { recursive: true });
    await fs.rename(sourcePath, movedPath);
    await store.locateProject(source.id, movedPath);
    const document = (await store.openProject(source.id)).document;
    const copyStore = new MotionProjectStore(root, index, () => new Date('2026-01-03T00:00:00.000Z'), () => 'prj_localcopy123');

    const copy = await copyStore.saveCopy(document, 'Offline location copy');

    expect(copy.path).toBe(path.join(root, 'projects', copy.id));
    expect(copy.id).not.toBe(source.id);
    expect(parseMotionDocument(JSON.parse(await fs.readFile(path.join(copy.path, 'project.json'), 'utf8'))).meta.name).toBe('Offline location copy');
    expect(await fs.access(path.join(movedPath, 'project.json')).then(() => true)).toBe(true);
  });

  it('round-trips bounded editor state without changing the document', async () => {
    const project = await store.createProject({ name: 'Editor state' });
    const state = { version: 1, view: { pxPerSecond: 120, scrollSeconds: 3 }, selection: null };
    await store.writeEditorState(project.id, state);

    expect(await store.readEditorState(project.id)).toEqual(state);
    await expect(store.writeEditorState(project.id, { text: 'x'.repeat(256 * 1024) })).rejects.toMatchObject({ code: 'MOTION_EDITOR_STATE_TOO_LARGE' });
    expect(parseMotionDocument(JSON.parse(await fs.readFile(path.join(project.path, 'project.json'), 'utf8'))).meta.name).toBe('Editor state');
  });
});
