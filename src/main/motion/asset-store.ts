/**
 * main/motion/asset-store.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Main-process owner of Motion asset bytes. Import paths are copied into a
 * bounded staging area, hashed, then committed independently of project.json;
 * the renderer remains the sole document writer.
 */

import { createHash, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { nativeImage } from 'electron';

import type { MotionAsset, MotionAssetKind } from '../../lib/motion/types';
import type { MotionProjectStore } from './project-store.js';
import { classifyMotionAsset, probeMotionAsset, type MotionAssetProbe } from './asset-probe.js';

const MAX_ASSET_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_ASSETS_PER_PROJECT = 500;
const WARN_ASSETS_PER_PROJECT = 400;
const IMPORT_TTL_MS = 10 * 60 * 1000;

export type MotionStagedAsset = {
  importId: string;
  name: string;
  sourceName: string;
  probeUrl: string;
  kind: MotionAssetKind | 'unknown';
  mimeType: string;
  byteSize: number;
  width?: number;
  height?: number;
  frameCount?: number;
  fps?: number;
  warnings: string[];
};

export type MotionImportError = {
  name: string;
  code:
    | 'MOTION_IMPORT_UNSUPPORTED'
    | 'MOTION_IMPORT_TOO_LARGE'
    | 'MOTION_IMPORT_UNREADABLE'
    | 'MOTION_IMPORT_PROBE_FAILED'
    | 'MOTION_IMPORT_SEQUENCE_GAP'
    | 'MOTION_IMPORT_LIMIT';
  message: string;
};

export type MotionAssetCommit = {
  importId: string;
  kind: MotionAssetKind;
  fps?: number;
  frameCount?: number;
  metadata?: Record<string, unknown>;
};

type StagedRecord = {
  projectId: string;
  importId: string;
  path: string;
  sourceName: string;
  extension: string;
  byteSize: number;
  hash: string;
  probe: MotionAssetProbe;
  framePaths?: string[];
  stagingDirectory: string;
  bundleDirectory?: string;
  expiresAt: number;
};

const stagedImports = new Map<string, StagedRecord>();
const verifiedAssetHashes = new Map<string, { mtimeMs: number; size: number; hash: string }>();

export class MotionAssetError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = 'MotionAssetError';
  }
}

export class MotionAssetStore {
  constructor(
    private readonly projects: Pick<MotionProjectStore, 'getProjectDirectory' | 'openProject'>,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async stageAssets(projectId: string, paths: string[]): Promise<{ items: MotionStagedAsset[]; errors: MotionImportError[] }> {
    const opened = await this.projects.openProject(projectId);
    await this.cleanupTemporaryData(projectId);
    const { document } = opened;
    const items: MotionStagedAsset[] = [];
    const errors: MotionImportError[] = [];
    if (document.assets.length >= MAX_ASSETS_PER_PROJECT) {
      return {
        items,
        errors: paths.map((filePath) => importError(path.basename(filePath), 'MOTION_IMPORT_LIMIT', 'This project already has the maximum of 500 assets.')),
      };
    }
    const remaining = MAX_ASSETS_PER_PROJECT - document.assets.length;
    const eligiblePaths = paths.slice(0, remaining);
    const sequences = findSequenceGroups(eligiblePaths);
    const sequencePaths = new Set<string>();
    for (const group of sequences.groups) {
      group.paths.forEach((filePath) => sequencePaths.add(filePath));
      try {
        items.push(await this.stageSequence(projectId, group));
      } catch (error) {
        const typed = error instanceof MotionAssetError ? error : new MotionAssetError(error instanceof Error ? error.message : String(error), 'MOTION_IMPORT_UNREADABLE');
        errors.push(importError(path.basename(group.paths[0]), importCode(typed.code), typed.message));
      }
    }
    for (const gap of sequences.gaps) {
      sequencePaths.add(gap);
      errors.push(importError(path.basename(gap), 'MOTION_IMPORT_SEQUENCE_GAP', 'The selected image sequence has missing frame numbers.'));
    }
    for (const requestedPath of eligiblePaths.filter((filePath) => !sequencePaths.has(filePath))) {
      const sourceName = path.basename(requestedPath || 'unknown file');
      try {
        if (!path.isAbsolute(requestedPath) || requestedPath.includes('\0')) {
          throw new MotionAssetError('Choose a local file using the file picker or drag-and-drop.', 'MOTION_IMPORT_UNREADABLE');
        }
        const realPath = await fs.realpath(requestedPath);
        const stat = await fs.stat(realPath);
        if (!stat.isFile()) throw new MotionAssetError('The selected item is not a regular file.', 'MOTION_IMPORT_UNREADABLE');
        if (stat.size > MAX_ASSET_BYTES) throw new MotionAssetError('Files larger than 2 GB cannot be imported.', 'MOTION_IMPORT_TOO_LARGE');
        const detectedType = classifyMotionAsset(realPath);
        if (!detectedType) throw new MotionAssetError(`Unsupported file type: ${path.extname(sourceName) || '(no extension)'}.`, 'MOTION_IMPORT_UNSUPPORTED');
        if (detectedType.kind === 'image' && path.extname(sourceName).toLowerCase() === '.svg') {
          throw new MotionAssetError('SVG imports are not available until the sanitizer/rasterizer is enabled.', 'MOTION_IMPORT_UNSUPPORTED');
        }
        if (path.extname(realPath).toLowerCase() === '.gltf') {
          items.push(await this.stageGltf(projectId, realPath, sourceName));
          continue;
        }

        const importId = `imp_${randomBytes(12).toString('hex')}`;
        const extension = path.extname(realPath).toLowerCase();
        const projectRoot = this.projects.getProjectDirectory(projectId);
        const stagingDirectory = path.join(projectRoot, '.staging', importId);
        await fs.mkdir(stagingDirectory, { recursive: true });
        const stagedPath = path.join(stagingDirectory, `source${extension}`);
        let hash: string;
        try {
          hash = await copyAndHash(realPath, stagedPath, MAX_ASSET_BYTES);
        } catch (error) {
          await fs.rm(stagingDirectory, { recursive: true, force: true });
          throw error;
        }
        let probe: MotionAssetProbe;
        try {
          probe = await probeMotionAsset(stagedPath);
        } catch (error) {
          await fs.rm(stagingDirectory, { recursive: true, force: true });
          throw new MotionAssetError(error instanceof Error ? error.message : String(error), 'MOTION_IMPORT_PROBE_FAILED');
        }
        const record: StagedRecord = {
          projectId,
          importId,
          path: stagedPath,
          sourceName,
          extension,
          byteSize: stat.size,
          hash,
          probe,
          stagingDirectory,
          expiresAt: this.now().getTime() + IMPORT_TTL_MS,
        };
        stagedImports.set(importId, record);
        items.push({
          importId,
          name: path.basename(sourceName, path.extname(sourceName)),
          sourceName,
          probeUrl: `qeda-media://motion-staging/${encodeURIComponent(importId)}`,
          kind: probe.kind,
          mimeType: probe.mimeType,
          byteSize: stat.size,
          ...(probe.width ? { width: probe.width } : {}),
          ...(probe.height ? { height: probe.height } : {}),
          warnings: [
            ...probe.warnings,
            ...(document.assets.length + items.length >= WARN_ASSETS_PER_PROJECT ? ['This project is approaching the 500 asset limit.'] : []),
          ],
        });
      } catch (error) {
        const typed = error instanceof MotionAssetError ? error : new MotionAssetError(error instanceof Error ? error.message : String(error), 'MOTION_IMPORT_UNREADABLE');
        errors.push(importError(sourceName, importCode(typed.code), typed.message));
      }
    }
    for (const extra of paths.slice(remaining)) errors.push(importError(path.basename(extra), 'MOTION_IMPORT_LIMIT', 'This project already has the maximum of 500 assets.'));
    return { items, errors };
  }

  private async stageSequence(projectId: string, group: { name: string; paths: string[] }): Promise<MotionStagedAsset> {
    const firstRealPath = await fs.realpath(group.paths[0]);
    const firstType = classifyMotionAsset(firstRealPath);
    if (!firstType || firstType.kind !== 'image') throw new MotionAssetError('Image sequences must contain supported image files.', 'MOTION_IMPORT_UNSUPPORTED');
    const importId = `imp_${randomBytes(12).toString('hex')}`;
    const stagingDirectory = path.join(this.projects.getProjectDirectory(projectId), '.staging', importId);
    const framesDirectory = path.join(stagingDirectory, 'frames');
    await fs.mkdir(framesDirectory, { recursive: true });
    const framePaths: string[] = [];
    const aggregateHash = createHash('sha256');
    let byteSize = 0;
    try {
      for (let index = 0; index < group.paths.length; index += 1) {
        const realPath = await fs.realpath(group.paths[index]);
        const stat = await fs.stat(realPath);
        if (!stat.isFile()) throw new MotionAssetError('A selected sequence frame is not a file.', 'MOTION_IMPORT_UNREADABLE');
        byteSize += stat.size;
        if (byteSize > MAX_ASSET_BYTES) throw new MotionAssetError('Image sequences larger than 2 GB cannot be imported.', 'MOTION_IMPORT_TOO_LARGE');
        const extension = path.extname(realPath).toLowerCase();
        if (classifyMotionAsset(realPath)?.kind !== 'image') throw new MotionAssetError('Image sequences must use one supported image type.', 'MOTION_IMPORT_UNSUPPORTED');
        const destination = path.join(framesDirectory, `frame-${String(index + 1).padStart(6, '0')}${extension}`);
        const hash = await copyAndHash(realPath, destination, MAX_ASSET_BYTES);
        aggregateHash.update(hash);
        framePaths.push(destination);
      }
      const probe = await probeMotionAsset(framePaths[0]);
      const sourceName = path.basename(group.paths[0]);
      const record: StagedRecord = {
        projectId, importId, path: framePaths[0], sourceName, extension: path.extname(framePaths[0]).toLowerCase(),
        byteSize, hash: aggregateHash.digest('hex'), probe, framePaths, stagingDirectory,
        expiresAt: this.now().getTime() + IMPORT_TTL_MS,
      };
      stagedImports.set(importId, record);
      return {
        importId, name: group.name, sourceName, probeUrl: `qeda-media://motion-staging/${encodeURIComponent(importId)}`,
        kind: 'image-sequence', mimeType: probe.mimeType, byteSize, frameCount: framePaths.length, fps: 30,
        ...(probe.width ? { width: probe.width } : {}), ...(probe.height ? { height: probe.height } : {}),
        warnings: ['Image sequence defaults to 30 fps; edit the rate after import.'],
      };
    } catch (error) {
      await fs.rm(stagingDirectory, { recursive: true, force: true });
      throw error;
    }
  }

  private async stageGltf(projectId: string, sourcePath: string, sourceName: string): Promise<MotionStagedAsset> {
    const json = JSON.parse(await fs.readFile(sourcePath, 'utf8')) as {
      buffers?: Array<{ uri?: string }>;
      images?: Array<{ uri?: string }>;
    };
    const uris = [...(json.buffers ?? []), ...(json.images ?? [])]
      .map((entry) => entry.uri)
      .filter((uri): uri is string => !!uri && !uri.startsWith('data:'));
    const importId = `imp_${randomBytes(12).toString('hex')}`;
    const stagingDirectory = path.join(this.projects.getProjectDirectory(projectId), '.staging', importId);
    const bundleDirectory = path.join(stagingDirectory, 'bundle');
    await fs.mkdir(bundleDirectory, { recursive: true });
    const stagedModel = path.join(bundleDirectory, 'scene.gltf');
    const aggregateHash = createHash('sha256');
    let byteSize = 0;
    try {
      const modelHash = await copyAndHash(sourcePath, stagedModel, MAX_ASSET_BYTES);
      byteSize += (await fs.stat(sourcePath)).size;
      aggregateHash.update('scene.gltf');
      aggregateHash.update(modelHash);
      const sourceDirectory = path.dirname(sourcePath);
      for (const uri of [...new Set(uris)]) {
        let decodedUri: string;
        try { decodedUri = decodeURIComponent(uri); } catch { throw new MotionAssetError('glTF sidecar URI is malformed.', 'MOTION_IMPORT_PROBE_FAILED'); }
        const relative = path.posix.normalize(decodedUri);
        if (relative === '.' || relative.startsWith('../') || path.posix.isAbsolute(relative) || /^[a-z][a-z\d+.-]*:/i.test(uri)) {
          throw new MotionAssetError('glTF sidecar path escapes the source folder.', 'MOTION_IMPORT_PROBE_FAILED');
        }
        const sourceSidecar = path.resolve(sourceDirectory, ...relative.split('/'));
        const sidecarRealPath = await fs.realpath(sourceSidecar);
        if (!isInside(sourceDirectory, sidecarRealPath)) throw new MotionAssetError('glTF sidecar symlink escapes the source folder.', 'MOTION_IMPORT_UNREADABLE');
        const stat = await fs.stat(sidecarRealPath);
        if (!stat.isFile() || byteSize + stat.size > MAX_ASSET_BYTES) throw new MotionAssetError('glTF bundle must contain regular files and stay under 2 GB.', 'MOTION_IMPORT_TOO_LARGE');
        const destination = path.resolve(bundleDirectory, ...relative.split('/'));
        if (!isInside(bundleDirectory, destination)) throw new MotionAssetError('glTF sidecar path escapes the bundle.', 'MOTION_IMPORT_PROBE_FAILED');
        await fs.mkdir(path.dirname(destination), { recursive: true });
        const hash = await copyAndHash(sidecarRealPath, destination, MAX_ASSET_BYTES - byteSize);
        byteSize += stat.size;
        aggregateHash.update(relative);
        aggregateHash.update(hash);
      }
      const probe = await probeMotionAsset(stagedModel);
      const record: StagedRecord = {
        projectId, importId, path: stagedModel, sourceName, extension: '.gltf', byteSize,
        hash: aggregateHash.digest('hex'), probe, stagingDirectory, bundleDirectory,
        expiresAt: this.now().getTime() + IMPORT_TTL_MS,
      };
      stagedImports.set(importId, record);
      return {
        importId, name: path.basename(sourceName, path.extname(sourceName)), sourceName,
        probeUrl: `qeda-media://motion-staging/${encodeURIComponent(importId)}`,
        kind: probe.kind, mimeType: probe.mimeType, byteSize, warnings: probe.warnings,
      };
    } catch (error) {
      await fs.rm(stagingDirectory, { recursive: true, force: true });
      throw error;
    }
  }

  async commitAssets(projectId: string, commits: MotionAssetCommit[]): Promise<{ assets: MotionAsset[]; errors: MotionImportError[] }> {
    const opened = await this.projects.openProject(projectId);
    const assets: MotionAsset[] = [];
    const errors: MotionImportError[] = [];
    for (const commit of commits) {
      const record = stagedImports.get(commit.importId);
      try {
        if (!record || record.projectId !== projectId || record.expiresAt <= this.now().getTime()) {
          throw new MotionAssetError('This staged import expired or belongs to another project. Import the file again.', 'MOTION_IMPORT_UNREADABLE');
        }
        const stagedKind = record.framePaths ? 'image-sequence' : record.probe.kind;
        if (stagedKind !== commit.kind) throw new MotionAssetError('The selected asset kind does not match the staged file.', 'MOTION_IMPORT_UNSUPPORTED');
        if (opened.document.assets.length + assets.length >= MAX_ASSETS_PER_PROJECT) throw new MotionAssetError('This project already has the maximum of 500 assets.', 'MOTION_IMPORT_LIMIT');
        if (commit.kind === 'image-sequence' && !record.framePaths) throw new MotionAssetError('The staged import is not an image sequence.', 'MOTION_IMPORT_UNSUPPORTED');

        const assetId = `asset_${randomBytes(10).toString('hex')}`;
        const deduplicated = [...opened.document.assets, ...assets].find((asset) => asset.hash === record.hash && asset.path && asset.hash !== 'builtin');
        const assetPath = deduplicated?.path ?? (commit.kind === 'image-sequence'
          ? `assets/${assetId}/frames`
          : record.bundleDirectory ? `assets/${assetId}/scene.gltf` : `assets/${assetId}/source${record.extension}`);
        const metadata = isRecord(commit.metadata) ? commit.metadata : {};
        const width = finitePositive(metadata.width) ?? record.probe.width;
        const height = finitePositive(metadata.height) ?? record.probe.height;
        const duration = finitePositive(metadata.duration);
        const frameCount = commit.kind === 'image' ? 1 : commit.frameCount ?? record.framePaths?.length ?? finitePositive(metadata.frameCount);
        const fps = commit.kind === 'image-sequence' ? commit.fps ?? finitePositive(metadata.fps) ?? 30 : commit.fps ?? finitePositive(metadata.fps);
        if (commit.kind === 'video' && (!duration || !width || !height)) throw new MotionAssetError('Video import needs duration and dimensions from the renderer probe.', 'MOTION_IMPORT_PROBE_FAILED');
        if (commit.kind === 'audio' && !duration) throw new MotionAssetError('Audio import needs duration from the renderer probe.', 'MOTION_IMPORT_PROBE_FAILED');
        if (!deduplicated) {
          const projectRoot = this.projects.getProjectDirectory(projectId);
          if (record.bundleDirectory) {
            const destination = path.join(projectRoot, 'assets', assetId);
            await fs.mkdir(path.dirname(destination), { recursive: true });
            await fs.rename(record.bundleDirectory, destination);
          } else if (commit.kind === 'image-sequence') {
            const destination = path.join(projectRoot, 'assets', assetId);
            await fs.mkdir(path.dirname(destination), { recursive: true });
            await fs.rename(record.stagingDirectory, destination);
          } else {
            const destination = path.join(projectRoot, ...assetPath.split('/'));
            await fs.mkdir(path.dirname(destination), { recursive: true });
            await fs.rename(record.path, destination);
            if (commit.kind === 'image') await this.writeImageThumbnail(projectId, assetId, destination).catch(() => undefined);
          }
        }
        const asset: MotionAsset = {
          id: assetId,
          name: path.basename(record.sourceName, path.extname(record.sourceName)),
          sourceName: record.sourceName,
          kind: commit.kind,
          mimeType: record.probe.mimeType,
          path: assetPath,
          hash: record.hash,
          byteSize: record.byteSize,
          ...(width ? { width } : {}),
          ...(height ? { height } : {}),
          ...(frameCount ? { frameCount } : {}),
          ...(fps ? { fps } : {}),
          ...(duration ? { duration } : {}),
          createdAt: this.now().toISOString(),
          ...(Object.keys(metadata).length ? { metadata } : {}),
        };
        assets.push(asset);
        await fs.rm(record.stagingDirectory, { recursive: true, force: true });
        stagedImports.delete(record.importId);
      } catch (error) {
        const typed = error instanceof MotionAssetError ? error : new MotionAssetError(error instanceof Error ? error.message : String(error), 'MOTION_IMPORT_UNREADABLE');
        errors.push(importError(record?.sourceName ?? commit.importId, importCode(typed.code), typed.message));
      }
    }
    return { assets, errors };
  }

  async cancelImports(projectId: string, importIds: string[]): Promise<void> {
    for (const importId of importIds) {
      const record = stagedImports.get(importId);
      if (!record || record.projectId !== projectId) continue;
      const sourceDirectory = record.stagingDirectory;
      const trashDirectory = path.join(this.projects.getProjectDirectory(projectId), '.trash', `import-${importId}-${this.now().getTime()}`);
      await fs.rename(sourceDirectory, trashDirectory).catch(async () => {
        await fs.rm(sourceDirectory, { recursive: true, force: true });
      });
      stagedImports.delete(importId);
    }
  }

  async resolveAsset(projectId: string, assetId: string): Promise<{ path: string; mimeType: string; hash: string } | null> {
    const opened = await this.projects.openProject(projectId);
    const asset = opened.document.assets.find((item) => item.id === assetId);
    if (!asset || asset.kind === 'image-sequence' || asset.hash === 'builtin' || !asset.path || !asset.path.startsWith('assets/') || !isSafeRelativeAssetPath(asset.path)) return null;
    const root = await fs.realpath(this.projects.getProjectDirectory(projectId));
    const requestedPath = path.resolve(root, ...asset.path.split('/'));
    if (!isInside(root, requestedPath)) return null;
    try {
      const resolvedPath = await fs.realpath(requestedPath);
      if (!isInside(root, resolvedPath) || !(await fs.stat(resolvedPath)).isFile()) return null;
      if (asset.kind === 'model' && path.extname(resolvedPath).toLowerCase() === '.gltf') {
        const bundleHash = await hashGltfBundle(resolvedPath);
        if (bundleHash !== asset.hash) return null;
        return { path: resolvedPath, mimeType: asset.mimeType, hash: asset.hash };
      }
      const stat = await fs.stat(resolvedPath);
      let verified = verifiedAssetHashes.get(resolvedPath);
      if (!verified || verified.mtimeMs !== stat.mtimeMs || verified.size !== stat.size) {
        verified = { mtimeMs: stat.mtimeMs, size: stat.size, hash: await hashFile(resolvedPath) };
        verifiedAssetHashes.set(resolvedPath, verified);
      }
      if (verified.hash !== asset.hash) return null;
      return { path: resolvedPath, mimeType: asset.mimeType, hash: asset.hash };
    } catch {
      return null;
    }
  }

  async resolveAssetFrame(projectId: string, assetId: string, frameIndex: number): Promise<{ path: string; mimeType: string; hash: string } | null> {
    if (!Number.isInteger(frameIndex) || frameIndex < 0) return null;
    const opened = await this.projects.openProject(projectId);
    const asset = opened.document.assets.find((item) => item.id === assetId);
    if (!asset || asset.kind !== 'image-sequence' || !asset.frameCount || frameIndex >= asset.frameCount || !asset.path || !isSafeRelativeAssetPath(asset.path)) return null;
    const root = await fs.realpath(this.projects.getProjectDirectory(projectId));
    const extension = path.extname(asset.sourceName ?? '') || path.extname(asset.path);
    const requestedPath = path.resolve(root, ...asset.path.split('/'), `frame-${String(frameIndex + 1).padStart(6, '0')}${extension}`);
    if (!isInside(root, requestedPath)) return null;
    try {
      const resolvedPath = await fs.realpath(requestedPath);
      if (!isInside(root, resolvedPath) || !(await fs.stat(resolvedPath)).isFile()) return null;
      return { path: resolvedPath, mimeType: asset.mimeType, hash: asset.hash };
    } catch { return null; }
  }

  async inspectAssets(projectId: string): Promise<Array<{ assetId: string; missing: boolean; hashMatches: boolean }>> {
    const opened = await this.projects.openProject(projectId);
    return Promise.all(opened.document.assets.map(async (asset) => {
      if (asset.hash === 'builtin') return { assetId: asset.id, missing: false, hashMatches: true };
      if (asset.kind === 'image-sequence') {
        try {
          const root = await fs.realpath(this.projects.getProjectDirectory(projectId));
          const framesDirectory = path.resolve(root, ...asset.path.split('/'));
          if (!isInside(root, framesDirectory) || !asset.frameCount) return { assetId: asset.id, missing: true, hashMatches: false };
          const extension = path.extname(asset.sourceName ?? '');
          const aggregate = createHash('sha256');
          for (let index = 0; index < asset.frameCount; index += 1) {
            const framePath = await fs.realpath(path.join(framesDirectory, `frame-${String(index + 1).padStart(6, '0')}${extension}`));
            if (!isInside(root, framePath)) throw new Error('Frame escaped project bundle.');
            aggregate.update(await hashFile(framePath));
          }
          return { assetId: asset.id, missing: false, hashMatches: aggregate.digest('hex') === asset.hash };
        } catch {
          return { assetId: asset.id, missing: true, hashMatches: false };
        }
      }
      const resolved = await this.resolveAsset(projectId, asset.id);
      if (!resolved) return { assetId: asset.id, missing: true, hashMatches: false };
      try {
        const actualHash = await hashFile(resolved.path);
        return { assetId: asset.id, missing: false, hashMatches: actualHash === asset.hash };
      } catch {
        return { assetId: asset.id, missing: true, hashMatches: false };
      }
    }));
  }

  async relinkAsset(projectId: string, assetId: string, sourcePath: string, allowDifferentHash = false): Promise<{ path: string; hash: string; byteSize: number; mimeType: string; matches: boolean }> {
    const opened = await this.projects.openProject(projectId);
    const asset = opened.document.assets.find((item) => item.id === assetId);
    if (!asset || asset.hash === 'builtin') throw new MotionAssetError('This asset cannot be relinked.', 'MOTION_ASSET_NOT_FOUND');
    if (asset.kind === 'image-sequence') throw new MotionAssetError('Relinking an image sequence requires selecting its complete frame set.', 'MOTION_IMPORT_UNSUPPORTED');
    if (!path.isAbsolute(sourcePath)) throw new MotionAssetError('Select a local file.', 'MOTION_IMPORT_UNREADABLE');
    const realPath = await fs.realpath(sourcePath);
    const stat = await fs.stat(realPath);
    if (!stat.isFile()) throw new MotionAssetError('The selected item is not a regular file.', 'MOTION_IMPORT_UNREADABLE');
    if (stat.size > MAX_ASSET_BYTES) throw new MotionAssetError('Files larger than 2 GB cannot be imported.', 'MOTION_IMPORT_TOO_LARGE');
    if (asset.kind === 'model' && path.extname(realPath).toLowerCase() === '.gltf') {
      const staged = await this.stageGltf(projectId, realPath, path.basename(realPath));
      const record = stagedImports.get(staged.importId)!;
      const matches = record.hash === asset.hash;
      if (!matches && !allowDifferentHash) {
        await fs.rm(record.stagingDirectory, { recursive: true, force: true });
        stagedImports.delete(record.importId);
        return { path: asset.path, hash: record.hash, byteSize: record.byteSize, mimeType: record.probe.mimeType, matches };
      }
      const projectRoot = await fs.realpath(this.projects.getProjectDirectory(projectId));
      const directoryName = `${asset.id}-relink-${randomBytes(4).toString('hex')}`;
      const relativePath = `assets/${directoryName}/scene.gltf`;
      const destination = path.join(projectRoot, 'assets', directoryName);
      const previousPath = asset.path && isSafeRelativeAssetPath(asset.path) ? path.resolve(projectRoot, ...asset.path.split('/')) : '';
      const oldDirectory = previousPath ? path.dirname(previousPath) : '';
      const shared = opened.document.assets.some((candidate) => candidate.id !== assetId && candidate.path === asset.path);
      if (!shared && oldDirectory && isInside(projectRoot, oldDirectory)) {
        const trashPath = path.join(projectRoot, '.trash', `relink-${asset.id}-${this.now().getTime()}`);
        await fs.mkdir(path.dirname(trashPath), { recursive: true });
        await fs.rename(oldDirectory, trashPath).catch(() => undefined);
      }
      await fs.rename(record.bundleDirectory!, destination);
      await fs.rm(record.stagingDirectory, { recursive: true, force: true });
      stagedImports.delete(record.importId);
      return { path: relativePath, hash: record.hash, byteSize: record.byteSize, mimeType: record.probe.mimeType, matches };
    }
    const probe = await probeMotionAsset(realPath);
    if (probe.kind !== asset.kind) throw new MotionAssetError(`Expected ${asset.kind}, but selected ${probe.kind}.`, 'MOTION_IMPORT_UNSUPPORTED');
    const hash = await hashFile(realPath);
    const matches = hash === asset.hash;
    if (!matches && !allowDifferentHash) return { path: asset.path, hash, byteSize: stat.size, mimeType: probe.mimeType, matches };

    const extension = path.extname(realPath).toLowerCase();
    const relativePath = `assets/${asset.id}/source-${randomBytes(4).toString('hex')}${extension}`;
    const projectRoot = await fs.realpath(this.projects.getProjectDirectory(projectId));
    const destination = path.join(projectRoot, ...relativePath.split('/'));
    const temporary = `${destination}.relink-${randomBytes(5).toString('hex')}`;
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await copyAndHash(realPath, temporary, MAX_ASSET_BYTES);
    const previousPath = asset.path && isSafeRelativeAssetPath(asset.path)
      ? path.resolve(projectRoot, ...asset.path.split('/'))
      : '';
    if (previousPath && isInside(projectRoot, previousPath)) {
      const shared = opened.document.assets.some((candidate) => candidate.id !== assetId && candidate.path === asset.path);
      if (!shared) {
        const trashPath = path.join(projectRoot, '.trash', `relink-${asset.id}-${this.now().getTime()}${path.extname(previousPath)}`);
        await fs.mkdir(path.dirname(trashPath), { recursive: true });
        await fs.rename(previousPath, trashPath).catch(() => undefined);
      }
    }
    await fs.rename(temporary, destination);
    return { path: relativePath, hash, byteSize: stat.size, mimeType: probe.mimeType, matches };
  }

  async revealAsset(projectId: string, assetId: string): Promise<string | null> {
    return (await this.resolveAsset(projectId, assetId))?.path ?? null;
  }

  private async writeImageThumbnail(projectId: string, assetId: string, sourcePath: string): Promise<void> {
    const image = nativeImage.createFromPath(sourcePath);
    if (image.isEmpty()) throw new MotionAssetError('Image thumbnail could not be decoded.', 'MOTION_IMPORT_PROBE_FAILED');
    const thumbnail = image.resize({ width: 320, height: 320, quality: 'good' }).toPNG();
    const directory = path.join(this.projects.getProjectDirectory(projectId), 'thumbnails');
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, `${assetId}.png`), thumbnail);
  }

  /** Drops crash-left staging data and expires trash after the documented seven-day undo window. */
  async cleanupTemporaryData(projectId: string): Promise<void> {
    const root = this.projects.getProjectDirectory(projectId);
    const stagingRoot = path.join(root, '.staging');
    const trashRoot = path.join(root, '.trash');
    const now = this.now().getTime();
    for (const [importId, record] of stagedImports) {
      if (record.projectId !== projectId || record.expiresAt > now) continue;
      await fs.rm(record.stagingDirectory, { recursive: true, force: true });
      stagedImports.delete(importId);
    }
    const staged = await fs.readdir(stagingRoot, { withFileTypes: true }).catch(() => []);
    await Promise.all(staged
      .filter((entry) => entry.isDirectory() && !stagedImports.has(entry.name))
      .map((entry) => fs.rm(path.join(stagingRoot, entry.name), { recursive: true, force: true })));
    const trashed = await fs.readdir(trashRoot, { withFileTypes: true }).catch(() => []);
    const expiry = now - 7 * 24 * 60 * 60 * 1000;
    await Promise.all(trashed.map(async (entry) => {
      const entryPath = path.join(trashRoot, entry.name);
      const stat = await fs.stat(entryPath).catch(() => null);
      if (stat && stat.mtimeMs < expiry) await fs.rm(entryPath, { recursive: true, force: true });
    }));
  }

  async cleanUnusedFiles(projectId: string): Promise<{ directories: number; bytes: number }> {
    const opened = await this.projects.openProject(projectId);
    const projectRoot = await fs.realpath(this.projects.getProjectDirectory(projectId));
    const assetRoot = path.join(projectRoot, 'assets');
    const referencedRoots = new Set(opened.document.assets
      .filter((asset) => asset.hash !== 'builtin' && isSafeRelativeAssetPath(asset.path))
      .map((asset) => asset.path.split('/').slice(0, 2).join('/')));
    const entries = await fs.readdir(assetRoot, { withFileTypes: true }).catch(() => []);
    let directories = 0;
    let bytes = 0;
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const relativeRoot = `assets/${entry.name}`;
      if (referencedRoots.has(relativeRoot)) continue;
      const candidate = path.join(assetRoot, entry.name);
      const realCandidate = await fs.realpath(candidate).catch(() => null);
      if (!realCandidate || !isInside(projectRoot, realCandidate)) continue;
      const size = await directorySize(realCandidate, projectRoot);
      const destination = path.join(projectRoot, '.trash', `unused-${entry.name}-${this.now().getTime()}`);
      await fs.rename(realCandidate, destination);
      await fs.rm(path.join(projectRoot, 'thumbnails', `${entry.name}.png`), { force: true }).catch(() => undefined);
      directories += 1;
      bytes += size;
    }
    return { directories, bytes };
  }

  async resolveStaged(importId: string): Promise<{ path: string; mimeType: string } | null> {
    const record = stagedImports.get(importId);
    if (!record || record.expiresAt <= this.now().getTime()) {
      if (record) {
        stagedImports.delete(importId);
        await fs.rm(record.stagingDirectory, { recursive: true, force: true }).catch(() => undefined);
      }
      return null;
    }
    try {
      const projectRoot = await fs.realpath(this.projects.getProjectDirectory(record.projectId));
      const stagedPath = await fs.realpath(record.path);
      if (!isInside(projectRoot, stagedPath) || !(await fs.stat(stagedPath)).isFile()) return null;
      return { path: stagedPath, mimeType: record.probe.mimeType };
    } catch {
      return null;
    }
  }
}

async function copyAndHash(sourcePath: string, destinationPath: string, maxBytes: number): Promise<string> {
  const hash = createHash('sha256');
  let bytes = 0;
  const digest = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        callback(new MotionAssetError('Files larger than 2 GB cannot be imported.', 'MOTION_IMPORT_TOO_LARGE'));
        return;
      }
      hash.update(chunk);
      callback(null, chunk);
    },
  });
  try {
    await pipeline(createReadStream(sourcePath), digest, createWriteStream(destinationPath, { flags: 'wx' }));
    return hash.digest('hex');
  } catch (error) {
    await fs.rm(destinationPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function hashFile(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

async function directorySize(directory: string, root: string): Promise<number> {
  let size = 0;
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name);
    if (!isInside(root, filePath) || entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) size += await directorySize(filePath, root);
    else if (entry.isFile()) size += (await fs.stat(filePath)).size;
  }
  return size;
}

async function hashGltfBundle(modelPath: string): Promise<string> {
  const json = JSON.parse(await fs.readFile(modelPath, 'utf8')) as {
    buffers?: Array<{ uri?: string }>;
    images?: Array<{ uri?: string }>;
  };
  const aggregate = createHash('sha256');
  const modelHash = await hashFile(modelPath);
  aggregate.update(path.basename(modelPath));
  aggregate.update(modelHash);
  const modelDirectory = path.dirname(modelPath);
  const root = await fs.realpath(modelDirectory);
  const uris = [...new Set([...(json.buffers ?? []), ...(json.images ?? [])]
    .map((entry) => entry.uri)
    .filter((uri): uri is string => !!uri && !uri.startsWith('data:'))
    .map((uri) => decodeURIComponent(uri)))];
  for (const uri of uris) {
    const relative = path.posix.normalize(uri);
    if (relative.startsWith('../') || path.posix.isAbsolute(relative) || /^[a-z][a-z\d+.-]*:/i.test(uri) || uri.includes('\\')) throw new Error('Invalid glTF sidecar path.');
    const resolved = await fs.realpath(path.resolve(root, ...relative.split('/')));
    if (!isInside(root, resolved) || !(await fs.stat(resolved)).isFile()) throw new Error('Invalid glTF sidecar file.');
    aggregate.update(relative);
    aggregate.update(await hashFile(resolved));
  }
  return aggregate.digest('hex');
}

function importError(name: string, code: MotionImportError['code'], message: string): MotionImportError {
  return { name, code, message };
}

function importCode(code: string): MotionImportError['code'] {
  if (code === 'MOTION_IMPORT_TOO_LARGE' || code === 'MOTION_IMPORT_LIMIT' || code === 'MOTION_IMPORT_PROBE_FAILED' || code === 'MOTION_IMPORT_SEQUENCE_GAP') return code;
  if (code === 'MOTION_IMPORT_UNSUPPORTED') return code;
  return 'MOTION_IMPORT_UNREADABLE';
}

function finitePositive(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isSafeRelativeAssetPath(value: string): boolean {
  return !value.startsWith('/') && !value.includes('\\') && !/^[a-z]+:/i.test(value) && !value.split('/').some((part) => !part || part === '.' || part === '..');
}

function isInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function findSequenceGroups(paths: string[]): { groups: Array<{ name: string; paths: string[] }>; gaps: string[] } {
  const candidates = new Map<string, Array<{ path: string; number: number; name: string }>>();
  for (const filePath of paths) {
    const extension = path.extname(filePath).toLowerCase();
    if (classifyMotionAsset(filePath)?.kind !== 'image') continue;
    const basename = path.basename(filePath);
    const match = /^(.*?)(\d+)(\.[^.]+)$/.exec(basename);
    if (!match || !match[1]) continue;
    const key = `${path.dirname(filePath)}\0${match[1]}\0${extension}`;
    const items = candidates.get(key) ?? [];
    items.push({ path: filePath, number: Number(match[2]), name: match[1].replace(/[._ -]+$/, '') || match[1] });
    candidates.set(key, items);
  }
  const groups: Array<{ name: string; paths: string[] }> = [];
  const gaps: string[] = [];
  for (const items of candidates.values()) {
    if (items.length < 2) continue;
    items.sort((left, right) => left.number - right.number);
    const consecutive = items.every((item, index) => index === 0 || item.number === items[index - 1].number + 1);
    if (consecutive) groups.push({ name: items[0].name, paths: items.map((item) => item.path) });
    else gaps.push(...items.map((item) => item.path));
  }
  return { groups, gaps };
}
