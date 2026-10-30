import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { applyMotionOps } from '@/lib/motion/ops';
import { createStarterMotionDocument } from '@/lib/motion/defaults';
import { motionAssetFrameIndex, motionAssetFrameUrl } from '@/lib/motion/assets';
import type { MotionAsset } from '@/lib/motion/types';
import { MotionProjectStore } from '@/main/motion/project-store';
import type { MotionProjectIndexRow } from '@/main/motion/project-index';
import { MotionAssetStore } from '@/main/motion/asset-store';
import { probeMotionAsset } from '@/main/motion/asset-probe';

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

describe('Motion assets', () => {
  let root: string;
  let projects: MotionProjectStore;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'motion-assets-'));
    projects = new MotionProjectStore(root, new MemoryIndex(), () => new Date('2026-01-01T00:00:00.000Z'), () => 'prj_assetstest12');
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('stages, hashes, commits, and resolves an image without writing the document', async () => {
    const project = await projects.createProject({ name: 'Asset bundle' });
    const sourcePath = path.join(root, 'source.png');
    await fs.writeFile(sourcePath, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3ioAAAAASUVORK5CYII=', 'base64'));
    const assets = new MotionAssetStore(projects, () => new Date('2026-01-01T00:00:00.000Z'));

    const staged = await assets.stageAssets(project.id, [sourcePath]);
    expect(staged.errors).toEqual([]);
    expect(staged.items[0]).toMatchObject({ kind: 'image', width: 1, height: 1, byteSize: expect.any(Number) });
    expect(staged.items[0].probeUrl).toBe(`qeda-media://motion-staging/${staged.items[0].importId}`);
    const stagedMedia = await assets.resolveStaged(staged.items[0].importId);
    expect(stagedMedia?.mimeType).toBe('image/png');

    const committed = await assets.commitAssets(project.id, [{ importId: staged.items[0].importId, kind: 'image' }]);
    expect(committed.errors).toEqual([]);
    const asset = committed.assets[0];
    expect(asset).toMatchObject({ name: 'source', kind: 'image', frameCount: 1, width: 1, height: 1, byteSize: expect.any(Number) });
    expect(asset.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(await fs.readFile(path.join(project.path, asset.path))).toEqual(await fs.readFile(sourcePath));
    const beforeDocumentWrite = (await projects.openProject(project.id)).document;
    expect(beforeDocumentWrite.assets.some((item) => item.id === asset.id)).toBe(false);

    const withAsset = applyMotionOps(beforeDocumentWrite, [{ op: 'asset.add', ...asset }], { now: '2026-01-01T00:00:01.000Z' });
    await projects.saveProject(project.id, withAsset);
    expect(await assets.resolveAsset(project.id, asset.id)).toMatchObject({ path: path.join(project.path, asset.path), mimeType: 'image/png', hash: asset.hash });
    await fs.writeFile(path.join(project.path, asset.path), 'tampered');
    expect(await assets.resolveAsset(project.id, asset.id)).toBeNull();
    expect(await assets.inspectAssets(project.id)).toContainEqual({ assetId: asset.id, missing: true, hashMatches: false });
  });

  it('rejects unsupported inputs and path traversal asset descriptors', async () => {
    const project = await projects.createProject({ name: 'Validation' });
    const invalidPath = path.join(root, 'payload.exe');
    await fs.writeFile(invalidPath, 'not executable');
    const assets = new MotionAssetStore(projects);
    const staged = await assets.stageAssets(project.id, [invalidPath]);
    expect(staged.items).toEqual([]);
    expect(staged.errors[0]?.code).toBe('MOTION_IMPORT_UNSUPPORTED');
    expect(await assets.resolveAsset(project.id, '../secret')).toBeNull();
  });

  it('stages and resolves consecutive image sequences with frame-index URLs', async () => {
    const project = await projects.createProject({ name: 'Sequence' });
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3ioAAAAASUVORK5CYII=', 'base64');
    const firstPath = path.join(root, 'shot0001.png');
    const secondPath = path.join(root, 'shot0002.png');
    await fs.writeFile(firstPath, png);
    await fs.writeFile(secondPath, png);
    const assets = new MotionAssetStore(projects);
    const staged = await assets.stageAssets(project.id, [secondPath, firstPath]);
    expect(staged.errors).toEqual([]);
    expect(staged.items).toHaveLength(1);
    expect(staged.items[0]).toMatchObject({ kind: 'image-sequence', frameCount: 2, fps: 30 });
    const committed = await assets.commitAssets(project.id, [{
      importId: staged.items[0].importId, kind: 'image-sequence', frameCount: 2, fps: 24,
    }]);
    expect(committed.errors).toEqual([]);
    const sequence = committed.assets[0];
    expect(sequence).toMatchObject({ kind: 'image-sequence', frameCount: 2, fps: 24 });
    const opened = await projects.openProject(project.id);
    const withSequence = applyMotionOps(opened.document, [{ op: 'asset.add', ...sequence }]);
    await projects.saveProject(project.id, withSequence);
    expect(await assets.resolveAssetFrame(project.id, sequence.id, 0)).toMatchObject({ mimeType: 'image/png' });
    expect(await assets.resolveAssetFrame(project.id, sequence.id, 2)).toBeNull();
  });

  it('rejects sequence gaps and retains cancelled staging in project trash', async () => {
    const project = await projects.createProject({ name: 'Sequence gaps' });
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3ioAAAAASUVORK5CYII=', 'base64');
    const firstPath = path.join(root, 'frame0001.png');
    const thirdPath = path.join(root, 'frame0003.png');
    await fs.writeFile(firstPath, png);
    await fs.writeFile(thirdPath, png);
    const assets = new MotionAssetStore(projects);
    const gap = await assets.stageAssets(project.id, [firstPath, thirdPath]);
    expect(gap.items).toEqual([]);
    expect(gap.errors.map((error) => error.code)).toEqual(['MOTION_IMPORT_SEQUENCE_GAP', 'MOTION_IMPORT_SEQUENCE_GAP']);

    const single = await assets.stageAssets(project.id, [path.join(root, 'still.png')]);
    expect(single.errors).toHaveLength(1);
    await fs.writeFile(path.join(root, 'still.png'), png);
    const staged = await assets.stageAssets(project.id, [path.join(root, 'still.png')]);
    await assets.cancelImports(project.id, [staged.items[0].importId]);
    expect(await fs.readdir(path.join(project.path, '.trash'))).toHaveLength(1);
  });

  it('moves unreferenced asset folders to seven-day trash without touching renders', async () => {
    const project = await projects.createProject({ name: 'Garbage collection' });
    const orphan = path.join(project.path, 'assets', 'orphan-id');
    await fs.mkdir(orphan, { recursive: true });
    await fs.writeFile(path.join(orphan, 'source.bin'), Buffer.from([1, 2, 3]));
    await fs.mkdir(path.join(project.path, 'renders', 'keep'), { recursive: true });
    const assets = new MotionAssetStore(projects);
    expect(await assets.cleanUnusedFiles(project.id)).toEqual({ directories: 1, bytes: 3 });
    expect(await fs.readdir(path.join(project.path, 'assets'))).toEqual([]);
    expect(await fs.readdir(path.join(project.path, 'renders'))).toEqual(['keep']);
    expect(await fs.readdir(path.join(project.path, '.trash'))).toHaveLength(1);
  });

  it('probes environment headers instead of accepting arbitrary HDR/EXR bytes', async () => {
    const hdrPath = path.join(root, 'valid.hdr');
    await fs.writeFile(hdrPath, '#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 1 +X 2\n\0\0\0\0');
    await expect(probeMotionAsset(hdrPath)).resolves.toMatchObject({ kind: 'environment', width: 2, height: 1 });
    const invalidPath = path.join(root, 'invalid.hdr');
    await fs.writeFile(invalidPath, 'not an HDR image');
    await expect(probeMotionAsset(invalidPath)).rejects.toThrow(/HDR header is invalid/);
  });

  it('bundles relative glTF sidecars and resolves the complete asset hash', async () => {
    const project = await projects.createProject({ name: 'glTF sidecars' });
    const sourceDirectory = path.join(root, 'model-source');
    await fs.mkdir(path.join(sourceDirectory, 'data'), { recursive: true });
    await fs.writeFile(path.join(sourceDirectory, 'data', 'mesh.bin'), Buffer.from([1, 2, 3, 4]));
    const gltfPath = path.join(sourceDirectory, 'scene.gltf');
    await fs.writeFile(gltfPath, JSON.stringify({ asset: { version: '2.0' }, buffers: [{ uri: 'data/mesh.bin', byteLength: 4 }] }));
    const assets = new MotionAssetStore(projects);
    const staged = await assets.stageAssets(project.id, [gltfPath]);
    expect(staged.errors).toEqual([]);
    const committed = await assets.commitAssets(project.id, [{ importId: staged.items[0].importId, kind: 'model' }]);
    expect(committed.errors).toEqual([]);
    const model = committed.assets[0];
    const opened = await projects.openProject(project.id);
    const withModel = applyMotionOps(opened.document, [{ op: 'asset.add', ...model }]);
    await projects.saveProject(project.id, withModel);
    expect(await fs.readFile(path.join(project.path, 'assets', model.id, 'data', 'mesh.bin'))).toEqual(Buffer.from([1, 2, 3, 4]));
    expect(await assets.resolveAsset(project.id, model.id)).toMatchObject({ mimeType: 'model/gltf+json', hash: model.hash });
  });

  it('builds stable sequence frame indices and media URLs', () => {
    const asset = { id: 'asset_a', kind: 'image-sequence', frameCount: 5, fps: 2 } as MotionAsset;
    expect(motionAssetFrameIndex(asset, -1)).toBe(0);
    expect(motionAssetFrameIndex(asset, 1.4)).toBe(2);
    expect(motionAssetFrameIndex(asset, 30)).toBe(4);
    expect(motionAssetFrameUrl('project id', 'asset/id', 3)).toBe('qeda-media://motion/project%20id/asset%2Fid/3');
  });

  it('keeps asset identity on relink and refuses removal while referenced', () => {
    const asset: MotionAsset = {
      id: 'asset_relink', name: 'Screen', kind: 'image', mimeType: 'image/png',
      path: 'assets/asset_relink/source.png', hash: 'a'.repeat(64), byteSize: 20,
      frameCount: 1, createdAt: '2026-01-01T00:00:00.000Z',
    };
    const starter = createStarterMotionDocument('2026-01-01T00:00:00.000Z');
    const screen = starter.scene.nodes.find((node) => node.type === 'screen.image')!;
    const withAsset = applyMotionOps(starter, [
      { op: 'asset.add', ...asset },
      { op: 'scene.node.update', nodeId: screen.id, props: { source: asset.id, assetId: asset.id } },
    ]);
    expect(() => applyMotionOps(withAsset, [{ op: 'asset.remove', assetId: asset.id }])).toThrow(/still referenced/);
    const relinked = applyMotionOps(withAsset, [{
      op: 'asset.relink', assetId: asset.id, path: 'assets/asset_relink/relinked.png',
      hash: 'b'.repeat(64), byteSize: 25, mimeType: 'image/png',
    }]);
    expect(relinked.assets.find((item) => item.id === asset.id)).toMatchObject({
      id: asset.id, path: 'assets/asset_relink/relinked.png', hash: 'b'.repeat(64), byteSize: 25,
    });
    expect(relinked.scene.nodes.find((node) => node.id === screen.id)?.props.assetId).toBe(asset.id);
  });
});
