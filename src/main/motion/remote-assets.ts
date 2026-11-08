/**
 * main/motion/remote-assets.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Downloads public catalog assets into Motion's existing staging pipeline.
 * Provider identity — never a renderer-supplied URL — decides which hosts may be
 * contacted. A downloaded asset becomes an ordinary bundle file at commit time,
 * so opening a project never requires the network.
 *
 * Models arrive from Poly Haven as `.gltf` + `.bin` + textures and are packed to
 * a single GLB before staging: `stageAssets()` only accepts regular files and
 * the GLB probe already rejects sidecar-dependent glTF.
 */

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { MotionAssetStore, MotionImportError, MotionStagedAsset } from './asset-store.js';

export type MotionRemoteProviderId = 'polyhaven' | 'sketchfab';
export type MotionRemoteAssetKind = 'model' | 'environment';

export type MotionRemoteAssetHit = {
  provider: MotionRemoteProviderId;
  id: string;
  name: string;
  kind: MotionRemoteAssetKind;
  creator?: string;
  license: string;
  attribution?: string;
  thumbnailUrl?: string;
  pageUrl: string;
  description?: string;
  popularity?: number;
};

export type MotionRemoteVariant = {
  id: string;
  label: string;
  format: 'hdr' | 'exr' | 'glb';
  byteSize?: number;
  resolution?: number;
};

export type MotionRemoteProvenance = {
  source: MotionRemoteProviderId;
  sourceAssetId: string;
  sourceUrl: string;
  license: string;
  creator?: string;
  attribution?: string;
  providerCredit: string;
  retrievedAt: string;
  variant: string;
  upstreamUrl: string;
};

export type MotionRemoteProgress = {
  requestId?: string;
  assetId: string;
  receivedBytes: number;
  totalBytes?: number;
};

export type MotionRemoteImportResult = {
  items: MotionStagedAsset[];
  errors: MotionImportError[];
  provenance: Record<string, MotionRemoteProvenance>;
};

export type MotionRemoteResponse = {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  arrayBuffer(): Promise<ArrayBuffer>;
  body?: { getReader(): { read(): Promise<{ done: boolean; value?: Uint8Array }>; cancel?(reason?: unknown): Promise<void> } } | null;
};

export type MotionRemoteFetch = (
  url: string,
  init?: {
    headers?: Record<string, string>;
    signal?: AbortSignal;
    redirect?: 'follow' | 'manual';
  },
) => Promise<MotionRemoteResponse>;

type ResolvedDownload = {
  files: Array<{ url: string; relativePath: string }>;
  entry: string;
  pack: 'none' | 'gltf-to-glb';
  stagedName: string;
  expectedBytes: number;
  kind: MotionRemoteAssetKind;
  license: string;
  attribution?: string;
  creator?: string;
  pageUrl: string;
};

export type MotionRemoteClientOptions = {
  fetch?: MotionRemoteFetch;
  now?: () => Date;
  tempRoot?: string;
  catalogTtlMs?: number;
  filesTtlMs?: number;
  userAgent?: string;
  maxModelBytes?: number;
  maxEnvironmentBytes?: number;
  requestTimeoutMs?: number;
  maxRedirects?: number;
  onProgress?: (progress: MotionRemoteProgress) => void;
  /** Injectable so tests never need a real glTF pipeline. */
  packGltf?: (entryPath: string, outputPath: string) => Promise<void>;
};

export class MotionRemoteAssetError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'MOTION_REMOTE_UNKNOWN_PROVIDER'
      | 'MOTION_REMOTE_NOT_FOUND'
      | 'MOTION_REMOTE_VARIANT_INVALID'
      | 'MOTION_REMOTE_HOST_REJECTED'
      | 'MOTION_REMOTE_TOO_LARGE'
      | 'MOTION_REMOTE_HTTP'
      | 'MOTION_REMOTE_CONTENT'
      | 'MOTION_REMOTE_PACK_FAILED'
      | 'MOTION_REMOTE_TIMEOUT',
  ) {
    super(message);
    this.name = 'MotionRemoteAssetError';
  }
}

const POLYHAVEN_API = 'https://api.polyhaven.com';
const POLYHAVEN_HOSTS = ['api.polyhaven.com', 'dl.polyhaven.org'];
const POLYHAVEN_CREDIT = 'Powered by Poly Haven';
const POLYHAVEN_LICENSE = 'CC0-1.0';
const SKETCHFAB_API = 'https://sketchfab.com';
const SKETCHFAB_HOSTS = ['sketchfab.com', 'cdn.sketchfab.com', 'download.sketchfab.com'];
const SKETCHFAB_CREDIT = 'Powered by Sketchfab';
const SKETCHFAB_API_KEY = '5fdc660e8bf84e058ceed08029fa09e2';
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const FIRST_BYTE_TIMEOUT_MS = 30 * 1000;
const DEFAULT_MAX_MODEL_BYTES = 200 * 1024 * 1024;
const DEFAULT_MAX_ENVIRONMENT_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_CONCURRENT_IMPORTS = 2;
let activeImports = 0;
const importQueue: Array<() => void> = [];

type PolyHavenCatalogItem = {
  slug: string;
  name?: string;
  type?: number;
  categories?: string[];
  category?: string;
  tags?: string[];
  description?: string;
  authors?: Record<string, string>;
  thumbnail_url?: string;
  download_count?: number;
};

type PolyHavenFile = { url?: string; size?: number; include?: Record<string, PolyHavenFile> };
type PolyHavenFiles = {
  hdri?: Record<string, Record<string, PolyHavenFile>>;
  gltf?: Record<string, Record<string, PolyHavenFile>>;
};

type SketchfabModel = {
  uid: string;
  uid_original?: string;
  name?: string;
  description?: string;
  user?: {
    username?: string;
    displayName?: string;
  };
  license?: {
    slug: string;
    label: string;
    full_name?: string;
    attribution_required?: boolean;
  };
  thumbnails?: Array<{ url: string; width: number; height: number }>;
  thumbnail?: { url: string; width: number; height: number };
  tags?: string[];
  categories?: Array<{ slug: string; name: string }>;
  isDownloadable?: boolean;
  is_age_restricted?: boolean;
  animationCount?: number;
  vertex_count?: number;
  face_count?: number;
  view_count?: number;
  like_count?: number;
  comment_count?: number;
  published_at?: string;
  viewerUrl?: string;
  archives?: Record<string, SketchfabArchive>;
};

type SketchfabArchive = {
  format: string;
  size_bytes?: number;
  face_count?: number;
  vertex_count?: number;
};

type SketchfabDownloadResponse = {
  gltf?: { url: string; size: number; expires: number };
  usdz?: { url: string; size: number; expires: number };
};

type SketchfabModelCache = {
  fetchedAt: number;
  models: Map<string, SketchfabModel>;
};

export class MotionRemoteAssetClient {
  private readonly catalogCache = new Map<string, { fetchedAt: number; order: string[]; items: Map<string, PolyHavenCatalogItem> }>();
  private readonly fileCache = new Map<string, { fetchedAt: number; files: PolyHavenFiles }>();
  private readonly sketchfabCache: SketchfabModelCache = { fetchedAt: 0, models: new Map() };
  private readonly sketchfabModelCache = new Map<string, { fetchedAt: number; model: SketchfabModel }>();
  private readonly activeDownloads = new Map<string, AbortController>();

  constructor(
    private readonly assets: Pick<MotionAssetStore, 'stageAssets' | 'cancelImports'>,
    private readonly options: MotionRemoteClientOptions = {},
  ) {}

  async search(request: {
    provider: MotionRemoteProviderId;
    query: string;
    kind: MotionRemoteAssetKind;
    limit?: number;
  }): Promise<{ hits: MotionRemoteAssetHit[]; total: number; providerCredit: string }> {
    this.assertProvider(request.provider);
    if (request.provider === 'sketchfab') {
      return this.searchSketchfab({ ...request, provider: 'sketchfab' });
    }
    const limit = Math.min(Math.max(Math.trunc(request.limit ?? 24), 1), 60);
    const catalog = await this.loadCatalog(request.kind);
    const ranked = rankCatalog(catalog, request.query, limit);
    return {
      hits: ranked.matches.map((item) => toHit(item, request.kind)),
      total: ranked.total,
      providerCredit: POLYHAVEN_CREDIT,
    };
  }

  async variants(request: {
    provider: MotionRemoteProviderId;
    assetId: string;
    kind: MotionRemoteAssetKind;
  }): Promise<{
    variants: MotionRemoteVariant[];
    license: string;
    attribution?: string;
    pageUrl: string;
    providerCredit: string;
  }> {
    this.assertProvider(request.provider);
    if (request.provider === 'sketchfab') {
      return this.variantsSketchfab({ ...request, provider: 'sketchfab' });
    }
    const files = await this.loadFiles(request.assetId);
    const variants = request.kind === 'environment' ? hdriVariants(files) : modelVariants(files);
    return {
      variants,
      license: POLYHAVEN_LICENSE,
      pageUrl: pageUrlFor(request.assetId),
      providerCredit: POLYHAVEN_CREDIT,
    };
  }

  async import(
    projectId: string,
    request: {
      provider: MotionRemoteProviderId;
      assetId: string;
      kind: MotionRemoteAssetKind;
      variantId: string;
      requestId?: string;
    },
  ): Promise<MotionRemoteImportResult> {
    this.assertProvider(request.provider);
    if (request.provider === 'sketchfab') {
      return this.importSketchfab(projectId, { ...request, provider: 'sketchfab' });
    }
    assertSafeId(request.assetId);
    const controller = new AbortController();
    if (request.requestId) this.activeDownloads.set(request.requestId, controller);
    let catalog: { items: Map<string, PolyHavenCatalogItem>; order: string[] };
    try {
      catalog = await this.loadCatalog(request.kind, controller.signal);
    } catch (error) {
      if (request.requestId) this.activeDownloads.delete(request.requestId);
      return this.failed(request.assetId, error instanceof Error ? error.message : String(error), 'MOTION_IMPORT_UNREADABLE');
    }
    const item = catalog.items.get(request.assetId);
    if (!item) {
      if (request.requestId) this.activeDownloads.delete(request.requestId);
      return this.failed(request.assetId, 'The asset is no longer in the catalog. Search again.', 'MOTION_IMPORT_UNREADABLE');
    }

    let resolved: ResolvedDownload;
    try {
      resolved = await this.resolve(item, request.kind, request.variantId, controller.signal);
    } catch (error) {
      if (request.requestId) this.activeDownloads.delete(request.requestId);
      return this.failed(item.name ?? request.assetId, error instanceof Error ? error.message : String(error), 'MOTION_IMPORT_UNREADABLE');
    }
    if (controller.signal.aborted) {
      if (request.requestId) this.activeDownloads.delete(request.requestId);
      return this.failed(item.name ?? request.assetId, 'Import cancelled.', 'MOTION_IMPORT_UNREADABLE');
    }

    const limit = request.kind === 'model'
      ? this.options.maxModelBytes ?? DEFAULT_MAX_MODEL_BYTES
      : this.options.maxEnvironmentBytes ?? DEFAULT_MAX_ENVIRONMENT_BYTES;
    if (resolved.expectedBytes > limit) {
      if (request.requestId) this.activeDownloads.delete(request.requestId);
      return this.failed(item.name ?? request.assetId, `This asset is too large to import (${formatBytes(resolved.expectedBytes)}).`, 'MOTION_IMPORT_TOO_LARGE');
    }

    const releaseSlot = await acquireImportSlot();
    let tempDirectory: string | undefined;
    try {
      tempDirectory = await fs.mkdtemp(path.join(this.options.tempRoot ?? os.tmpdir(), 'qeda-motion-'));
      let received = 0;
      for (const file of resolved.files) {
        const destination = path.join(tempDirectory, ...file.relativePath.split('/'));
        received += await this.download(file.url, destination, {
          maxBytes: limit - received,
          signal: controller.signal,
          onProgress: (bytes) => this.options.onProgress?.({
            requestId: request.requestId,
            assetId: request.assetId,
            receivedBytes: received + bytes,
            totalBytes: resolved.expectedBytes,
          }),
        });
      }

      let stagedPath = path.join(tempDirectory, ...resolved.entry.split('/'));
      if (resolved.pack === 'gltf-to-glb') {
        const packedPath = path.join(tempDirectory, resolved.stagedName);
        try {
          await (this.options.packGltf ?? packGltfToGlb)(stagedPath, packedPath);
        } catch (error) {
          return this.failed(item.name ?? request.assetId, `The model could not be converted to GLB: ${error instanceof Error ? error.message : String(error)}`, 'MOTION_IMPORT_PROBE_FAILED');
        }
        stagedPath = packedPath;
      }

      const staged = await this.assets.stageAssets(projectId, [stagedPath]);
      if (controller.signal.aborted) {
        await this.assets.cancelImports(projectId, staged.items.map((entry) => entry.importId));
        return this.failed(item.name ?? request.assetId, 'Import cancelled.', 'MOTION_IMPORT_UNREADABLE');
      }
      const provenance: Record<string, MotionRemoteProvenance> = {};
      for (const stagedItem of staged.items) {
        provenance[stagedItem.importId] = {
          source: request.provider,
          sourceAssetId: request.assetId,
          sourceUrl: resolved.pageUrl,
          license: resolved.license,
          ...(resolved.creator ? { creator: resolved.creator } : {}),
          ...(resolved.attribution ? { attribution: resolved.attribution } : {}),
          providerCredit: POLYHAVEN_CREDIT,
          retrievedAt: (this.options.now ?? (() => new Date()))().toISOString(),
          variant: request.variantId,
          upstreamUrl: resolved.files[0]?.url ?? '',
        };
      }
      return { items: staged.items, errors: staged.errors, provenance };
    } catch (error) {
      return this.failed(item.name ?? request.assetId, error instanceof Error ? error.message : String(error), 'MOTION_IMPORT_UNREADABLE');
    } finally {
      if (tempDirectory) await fs.rm(tempDirectory, { recursive: true, force: true }).catch(() => undefined);
      if (request.requestId && this.activeDownloads.get(request.requestId) === controller) this.activeDownloads.delete(request.requestId);
      releaseSlot();
    }
  }

  private async searchSketchfab(request: {
    provider: 'sketchfab';
    query: string;
    kind: MotionRemoteAssetKind;
    limit?: number;
  }): Promise<{ hits: MotionRemoteAssetHit[]; total: number; providerCredit: string }> {
    const limit = Math.min(Math.max(Math.trunc(request.limit ?? 24), 1), 60);
    const params = new URLSearchParams();
    params.set('downloadable', 'true');
    params.set('count', String(limit));
    if (request.query.trim()) {
      params.set('q', request.query.trim());
    }
    params.set('sort_by', '-likeCount');
    const url = `${SKETCHFAB_API}/v3/models?${params.toString()}`;
    const models = await this.sketchfabRequest<SketchfabModel[]>(url);
    if (!Array.isArray(models)) {
      return { hits: [], total: 0, providerCredit: SKETCHFAB_CREDIT };
    }
    const hits: MotionRemoteAssetHit[] = [];
    for (const model of models) {
      if (!model.uid) continue;
      const hit = sketchfabModelToHit(model, request.kind);
      if (hit) hits.push(hit);
    }
    return { hits, total: hits.length, providerCredit: SKETCHFAB_CREDIT };
  }

  private async variantsSketchfab(request: {
    provider: 'sketchfab';
    assetId: string;
    kind: MotionRemoteAssetKind;
  }): Promise<{
    variants: MotionRemoteVariant[];
    license: string;
    attribution?: string;
    pageUrl: string;
    providerCredit: string;
  }> {
    const model = await this.loadSketchfabModel(request.assetId);
    const pageUrl = `https://sketchfab.com/3d-models/${model.uid}`;
    const license = model.license?.label ?? 'Unknown';
    const attribution = model.user?.displayName ?? model.user?.username;
    const variants: MotionRemoteVariant[] = [];
    if (model.archives) {
      for (const [key, archive] of Object.entries(model.archives)) {
        if (archive.format === 'gltf' || archive.format === 'glTF') {
          variants.push({
            id: 'gltf',
            label: 'glTF Archive',
            format: 'glb',
            byteSize: archive.size_bytes,
          });
        }
      }
    }
    if (variants.length === 0) {
      variants.push({
        id: 'gltf',
        label: 'glTF Archive',
        format: 'glb',
      });
    }
    return { variants, license, attribution, pageUrl, providerCredit: SKETCHFAB_CREDIT };
  }

  private async importSketchfab(
    projectId: string,
    request: {
      provider: 'sketchfab';
      assetId: string;
      kind: MotionRemoteAssetKind;
      variantId: string;
      requestId?: string;
    },
  ): Promise<MotionRemoteImportResult> {
    const controller = new AbortController();
    if (request.requestId) this.activeDownloads.set(request.requestId, controller);
    try {
      const model = await this.loadSketchfabModel(request.assetId, controller.signal);
      if (!model.isDownloadable) {
        if (request.requestId) this.activeDownloads.delete(request.requestId);
        return this.failed(model.name ?? request.assetId, 'This model is not available for download.', 'MOTION_IMPORT_UNREADABLE');
      }

      const downloadUrl = `${SKETCHFAB_API}/v3/models/${encodeURIComponent(request.assetId)}/download`;
      const downloadResp = await this.sketchfabRequestJson<SketchfabDownloadResponse>(
        downloadUrl,
        SKETCHFAB_HOSTS,
        controller.signal,
        { 'Authorization': `Bearer ${SKETCHFAB_API_KEY}` }
      );
      const gltfDownload = downloadResp?.gltf;
      if (!gltfDownload?.url) {
        if (request.requestId) this.activeDownloads.delete(request.requestId);
        return this.failed(model.name ?? request.assetId, 'No glTF download available for this model.', 'MOTION_IMPORT_UNREADABLE');
      }

      const limit = this.options.maxModelBytes ?? DEFAULT_MAX_MODEL_BYTES;
      if (gltfDownload.size > limit) {
        if (request.requestId) this.activeDownloads.delete(request.requestId);
        return this.failed(model.name ?? request.assetId, `This asset is too large to import (${formatBytes(gltfDownload.size)}).`, 'MOTION_IMPORT_TOO_LARGE');
      }

      const releaseSlot = await acquireImportSlot();
      let tempDirectory: string | undefined;
      try {
        tempDirectory = await fs.mkdtemp(path.join(this.options.tempRoot ?? os.tmpdir(), 'qeda-motion-'));
        const zipPath = path.join(tempDirectory, 'model.zip');
        await this.download(gltfDownload.url, zipPath, {
          maxBytes: limit,
          signal: controller.signal,
          onProgress: (bytes) => this.options.onProgress?.({
            requestId: request.requestId,
            assetId: request.assetId,
            receivedBytes: bytes,
            totalBytes: gltfDownload.size,
          }),
        });

        if (controller.signal.aborted) {
          if (request.requestId) this.activeDownloads.delete(request.requestId);
          return this.failed(model.name ?? request.assetId, 'Import cancelled.', 'MOTION_IMPORT_UNREADABLE');
        }

        const extractedDir = path.join(tempDirectory, 'extracted');
        await fs.mkdir(extractedDir, { recursive: true });
        await extractZip(zipPath, extractedDir);

        const gltfFile = await findGltfFile(extractedDir);
        if (!gltfFile) {
          if (request.requestId) this.activeDownloads.delete(request.requestId);
          return this.failed(model.name ?? request.assetId, 'No glTF file found in the downloaded archive.', 'MOTION_IMPORT_UNREADABLE');
        }

        const stagedName = `${safeFileName(model.name ?? request.assetId)}.glb`;
        const packedPath = path.join(tempDirectory, stagedName);
        try {
          await (this.options.packGltf ?? packGltfToGlb)(gltfFile, packedPath);
        } catch (error) {
          if (request.requestId) this.activeDownloads.delete(request.requestId);
          return this.failed(model.name ?? request.assetId, `The model could not be converted to GLB: ${error instanceof Error ? error.message : String(error)}`, 'MOTION_IMPORT_PROBE_FAILED');
        }

        if (controller.signal.aborted) {
          await this.assets.cancelImports(projectId, []);
          if (request.requestId) this.activeDownloads.delete(request.requestId);
          return this.failed(model.name ?? request.assetId, 'Import cancelled.', 'MOTION_IMPORT_UNREADABLE');
        }

        const staged = await this.assets.stageAssets(projectId, [packedPath]);
        if (controller.signal.aborted) {
          await this.assets.cancelImports(projectId, staged.items.map((entry) => entry.importId));
          if (request.requestId) this.activeDownloads.delete(request.requestId);
          return this.failed(model.name ?? request.assetId, 'Import cancelled.', 'MOTION_IMPORT_UNREADABLE');
        }

        const pageUrl = `https://sketchfab.com/3d-models/${model.uid}`;
        const license = model.license?.label ?? 'Unknown';
        const creator = model.user?.displayName ?? model.user?.username;
        const provenance: Record<string, MotionRemoteProvenance> = {};
        for (const stagedItem of staged.items) {
          provenance[stagedItem.importId] = {
            source: 'sketchfab',
            sourceAssetId: request.assetId,
            sourceUrl: pageUrl,
            license,
            ...(creator ? { creator } : {}),
            providerCredit: SKETCHFAB_CREDIT,
            retrievedAt: (this.options.now ?? (() => new Date()))().toISOString(),
            variant: request.variantId,
            upstreamUrl: gltfDownload.url,
          };
        }
        return { items: staged.items, errors: staged.errors, provenance };
      } catch (error) {
        return this.failed(model.name ?? request.assetId, error instanceof Error ? error.message : String(error), 'MOTION_IMPORT_UNREADABLE');
      } finally {
        if (tempDirectory) await fs.rm(tempDirectory, { recursive: true, force: true }).catch(() => undefined);
        if (request.requestId && this.activeDownloads.get(request.requestId) === controller) this.activeDownloads.delete(request.requestId);
        releaseSlot();
      }
    } catch (error) {
      if (request.requestId) this.activeDownloads.delete(request.requestId);
      return this.failed(request.assetId, error instanceof Error ? error.message : String(error), 'MOTION_IMPORT_UNREADABLE');
    }
  }

  private async loadSketchfabModel(uid: string, signal?: AbortSignal): Promise<SketchfabModel> {
    const ttl = this.options.filesTtlMs ?? 10 * 60 * 1000;
    const cached = this.sketchfabModelCache.get(uid);
    if (cached && this.now() - cached.fetchedAt < ttl) return cached.model;
    const url = `${SKETCHFAB_API}/v3/models/${encodeURIComponent(uid)}`;
    const model = await this.sketchfabRequest<SketchfabModel>(url, signal);
    if (!model || typeof model !== 'object') {
      throw new MotionRemoteAssetError('Model not found on Sketchfab.', 'MOTION_REMOTE_NOT_FOUND');
    }
    this.sketchfabModelCache.set(uid, { fetchedAt: this.now(), model });
    return model;
  }

  private async sketchfabRequest<T>(url: string, signal?: AbortSignal): Promise<T> {
    const response = await this.open(url, SKETCHFAB_HOSTS, signal, { 'Authorization': `Bearer ${SKETCHFAB_API_KEY}` });
    try {
      const text = new TextDecoder().decode(await response.arrayBuffer());
      return JSON.parse(text) as T;
    } catch (error) {
      throw new MotionRemoteAssetError(`The provider returned unreadable JSON: ${error instanceof Error ? error.message : String(error)}`, 'MOTION_REMOTE_CONTENT');
    }
  }

  private async sketchfabRequestJson<T>(url: string, hosts: string[], signal?: AbortSignal, extraHeaders?: Record<string, string>): Promise<T> {
    const response = await this.open(url, hosts, signal, extraHeaders);
    try {
      const text = new TextDecoder().decode(await response.arrayBuffer());
      return JSON.parse(text) as T;
    } catch (error) {
      throw new MotionRemoteAssetError(`The provider returned unreadable JSON: ${error instanceof Error ? error.message : String(error)}`, 'MOTION_REMOTE_CONTENT');
    }
  }

  cancelImport(requestId: string): void {
    this.activeDownloads.get(requestId)?.abort(new DOMException('Import cancelled.', 'AbortError'));
  }

  private failed(name: string, message: string, code: MotionImportError['code']): MotionRemoteImportResult {
    return { items: [], errors: [{ name, code, message }], provenance: {} };
  }

  private assertProvider(provider: string): asserts provider is MotionRemoteProviderId {
    if (provider !== 'polyhaven' && provider !== 'sketchfab') {
      throw new MotionRemoteAssetError(`Unknown asset provider "${provider}".`, 'MOTION_REMOTE_UNKNOWN_PROVIDER');
    }
  }

  private async loadCatalog(kind: MotionRemoteAssetKind, signal?: AbortSignal): Promise<{ items: Map<string, PolyHavenCatalogItem>; order: string[] }> {
    const type = kind === 'environment' ? 'hdris' : 'models';
    const ttl = this.options.catalogTtlMs ?? 30 * 60 * 1000;
    const cached = this.catalogCache.get(type);
    if (cached && this.now() - cached.fetchedAt < ttl) return cached;
    const payload = await this.requestJson<Record<string, PolyHavenCatalogItem>>(`${POLYHAVEN_API}/assets?type=${type}`, POLYHAVEN_HOSTS, signal);
    const items = new Map<string, PolyHavenCatalogItem>();
    for (const [slug, item] of Object.entries(payload ?? {})) {
      if (item && typeof item === 'object') items.set(slug, { ...item, slug });
    }
    const entry = { fetchedAt: this.now(), items, order: [...items.keys()] };
    this.catalogCache.set(type, entry);
    return entry;
  }

  private async loadFiles(assetId: string, signal?: AbortSignal): Promise<PolyHavenFiles> {
    assertSafeId(assetId);
    const ttl = this.options.filesTtlMs ?? 10 * 60 * 1000;
    const cached = this.fileCache.get(assetId);
    if (cached && this.now() - cached.fetchedAt < ttl) return cached.files;
    const files = await this.requestJson<PolyHavenFiles>(`${POLYHAVEN_API}/files/${encodeURIComponent(assetId)}`, POLYHAVEN_HOSTS, signal);
    if (!files || typeof files !== 'object') throw new MotionRemoteAssetError('The provider returned no file list.', 'MOTION_REMOTE_NOT_FOUND');
    this.fileCache.set(assetId, { fetchedAt: this.now(), files });
    return files;
  }

  private now(): number {
    return (this.options.now ?? (() => new Date()))().getTime();
  }

  private async resolve(item: PolyHavenCatalogItem, kind: MotionRemoteAssetKind, variantId: string, signal?: AbortSignal): Promise<ResolvedDownload> {
    const files = await this.loadFiles(item.slug, signal);
    const stagedName = `${safeFileName(item.name ?? item.slug)}${kind === 'model' ? '.glb' : ''}`;
    const base = {
      kind,
      license: POLYHAVEN_LICENSE,
      creator: authorsOf(item),
      pageUrl: pageUrlFor(item.slug),
    } as const;

    if (kind === 'environment') {
      const match = /^(\d+)k-(hdr|exr)$/.exec(variantId);
      if (!match) throw new MotionRemoteAssetError('Choose a valid resolution and format.', 'MOTION_REMOTE_VARIANT_INVALID');
      const resolution = `${match[1]}k`;
      const format = match[2] as 'hdr' | 'exr';
      const file = files.hdri?.[resolution]?.[format];
      if (!file?.url) throw new MotionRemoteAssetError(`The ${resolution.toUpperCase()} ${format.toUpperCase()} file is not available.`, 'MOTION_REMOTE_NOT_FOUND');
      const fileName = `${safeFileName(item.name ?? item.slug)}.${format}`;
      return {
        ...base,
        files: [{ url: file.url, relativePath: fileName }],
        entry: fileName,
        stagedName: fileName,
        pack: 'none',
        expectedBytes: file.size ?? 0,
      };
    }

    const match = /^(\d+)k-glb$/.exec(variantId);
    if (!match) throw new MotionRemoteAssetError('Choose a valid model resolution.', 'MOTION_REMOTE_VARIANT_INVALID');
    const resolution = `${match[1]}k`;
    const model = files.gltf?.[resolution]?.gltf;
    if (!model?.url) throw new MotionRemoteAssetError(`The ${resolution.toUpperCase()} model is not available.`, 'MOTION_REMOTE_NOT_FOUND');
    const entry = path.basename(new URL(model.url).pathname);
    if (!safeRelativePath(entry)) throw new MotionRemoteAssetError('The provider returned an unsafe model filename.', 'MOTION_REMOTE_CONTENT');
    const downloads: Array<{ url: string; relativePath: string }> = [{ url: model.url, relativePath: entry }];
    let expectedBytes = model.size ?? 0;
    for (const [relativePath, dependency] of Object.entries(model.include ?? {})) {
      const safe = safeRelativePath(relativePath);
      if (!safe) throw new MotionRemoteAssetError('The provider returned an unsafe resource path.', 'MOTION_REMOTE_CONTENT');
      if (!dependency?.url) continue;
      downloads.push({ url: dependency.url, relativePath: safe });
      expectedBytes += dependency.size ?? 0;
    }
    return {
      ...base,
      files: downloads,
      entry,
      stagedName,
      pack: 'gltf-to-glb',
      expectedBytes,
    };
  }

  private async requestJson<T>(url: string, hosts: string[], signal?: AbortSignal): Promise<T> {
    const response = await this.open(url, hosts, signal);
    try {
      const text = new TextDecoder().decode(await response.arrayBuffer());
      return JSON.parse(text) as T;
    } catch (error) {
      throw new MotionRemoteAssetError(`The provider returned unreadable JSON: ${error instanceof Error ? error.message : String(error)}`, 'MOTION_REMOTE_CONTENT');
    }
  }

  private async open(url: string, hosts: string[], signal?: AbortSignal, extraHeaders?: Record<string, string>): Promise<MotionRemoteResponse> {
    const fetchImpl = this.options.fetch ?? ((input, init) => globalThis.fetch(input, init));
    const maxRedirects = this.options.maxRedirects ?? 3;
    let current = assertAllowedRemoteUrl(url, hosts).toString();
    for (let hop = 0; hop <= maxRedirects; hop += 1) {
      let response: MotionRemoteResponse;
      const controller = new AbortController();
      const timeoutSignal = AbortSignal.timeout(this.options.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS);
      const timeout = setTimeout(
        () => controller.abort(new DOMException('The provider took too long to respond.', 'TimeoutError')),
        Math.min(FIRST_BYTE_TIMEOUT_MS, this.options.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS),
      );
      try {
        response = await fetchImpl(current, {
          headers: {
            'User-Agent': this.options.userAgent ?? 'Qeda Motion Asset Browser/1.0',
            ...(extraHeaders ?? {}),
          },
          redirect: 'manual',
          signal: AbortSignal.any([controller.signal, timeoutSignal, ...(signal ? [signal] : [])]),
        });
      } catch (error) {
        if (controller.signal.aborted || (error instanceof Error && error.name === 'TimeoutError')) {
          throw new MotionRemoteAssetError('The provider took too long to respond.', 'MOTION_REMOTE_TIMEOUT');
        }
        throw new MotionRemoteAssetError(`Could not reach the provider: ${error instanceof Error ? error.message : String(error)}`, 'MOTION_REMOTE_HTTP');
      } finally {
        clearTimeout(timeout);
      }
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) throw new MotionRemoteAssetError('The provider returned a redirect without a location.', 'MOTION_REMOTE_HTTP');
        current = assertAllowedRemoteUrl(new URL(location, current).toString(), hosts).toString();
        continue;
      }
      if (response.status === 429) {
        const retry = response.headers.get('retry-after');
        throw new MotionRemoteAssetError(`The provider is rate limiting requests.${retry ? ` Try again in ${retry}s.` : ''}`, 'MOTION_REMOTE_HTTP');
      }
      if (!response.ok) throw new MotionRemoteAssetError(`The provider returned HTTP ${response.status}.`, 'MOTION_REMOTE_HTTP');
      const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
      if (contentType.includes('text/html')) {
        throw new MotionRemoteAssetError('The provider returned an HTML page instead of an asset file.', 'MOTION_REMOTE_CONTENT');
      }
      return response;
    }
    throw new MotionRemoteAssetError('The provider redirected too many times.', 'MOTION_REMOTE_HTTP');
  }

  private async download(
    url: string,
    destination: string,
    options: { maxBytes: number; signal?: AbortSignal; onProgress?: (bytes: number) => void },
  ): Promise<number> {
    if (options.maxBytes <= 0) throw new MotionRemoteAssetError('This asset exceeds the import size limit.', 'MOTION_REMOTE_TOO_LARGE');
    const response = await this.open(url, POLYHAVEN_HOSTS, options.signal);
    const contentType = (response.headers.get('content-type') ?? '').split(';', 1)[0].trim().toLowerCase();
    if (!isAllowedAssetContentType(path.extname(destination).toLowerCase(), contentType)) {
      throw new MotionRemoteAssetError(`The provider returned an unexpected content type for ${path.basename(destination)}.`, 'MOTION_REMOTE_CONTENT');
    }
    const declared = Number(response.headers.get('content-length') ?? '0');
    if (Number.isFinite(declared) && declared > options.maxBytes) {
      throw new MotionRemoteAssetError('This asset exceeds the import size limit.', 'MOTION_REMOTE_TOO_LARGE');
    }
    await fs.mkdir(path.dirname(destination), { recursive: true });
    const partial = `${destination}.part`;
    const handle = await fs.open(partial, 'w');
    let received = 0;
    let reader: ReturnType<NonNullable<MotionRemoteResponse['body']>['getReader']> | undefined;
    try {
      reader = response.body?.getReader();
      if (reader) {
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          const value = chunk.value;
          if (!value?.length) continue;
          received += value.length;
          if (received > options.maxBytes) throw new MotionRemoteAssetError('This asset exceeds the import size limit.', 'MOTION_REMOTE_TOO_LARGE');
          await handle.write(value);
          options.onProgress?.(received);
        }
      } else {
        const bytes = new Uint8Array(await response.arrayBuffer());
        received = bytes.length;
        if (received > options.maxBytes) throw new MotionRemoteAssetError('This asset exceeds the import size limit.', 'MOTION_REMOTE_TOO_LARGE');
        await handle.write(bytes);
        options.onProgress?.(received);
      }
    } catch (error) {
      await reader?.cancel?.(error).catch(() => undefined);
      await handle.close().catch(() => undefined);
      await fs.rm(partial, { force: true }).catch(() => undefined);
      throw error;
    }
    await handle.close();
    await fs.rename(partial, destination);
    return received;
  }
}

/** Rejects anything the provider table did not authorise. */
export function assertAllowedRemoteUrl(raw: string, hosts: string[]): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new MotionRemoteAssetError(`Invalid asset URL "${raw}".`, 'MOTION_REMOTE_HOST_REJECTED');
  }
  if (url.protocol !== 'https:') throw new MotionRemoteAssetError('Asset downloads must use HTTPS.', 'MOTION_REMOTE_HOST_REJECTED');
  if (url.username || url.password) throw new MotionRemoteAssetError('Asset URLs may not contain credentials.', 'MOTION_REMOTE_HOST_REJECTED');
  if (url.port && url.port !== '443') throw new MotionRemoteAssetError('Asset URLs may not use a custom port.', 'MOTION_REMOTE_HOST_REJECTED');
  const host = url.hostname.toLowerCase();
  if (!hosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) {
    throw new MotionRemoteAssetError(`Asset host "${host}" is not allowed.`, 'MOTION_REMOTE_HOST_REJECTED');
  }
  return url;
}

export function safeRelativePath(value: string): string | null {
  const normalized = value.replace(/\\/g, '/');
  if (!normalized || normalized.startsWith('/') || normalized.includes('\0')) return null;
  const segments = normalized.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..' || segment.includes(':'))) return null;
  return normalized;
}

function assertSafeId(value: string): void {
  if (!/^[a-z0-9][a-z0-9_-]{0,120}$/i.test(value)) {
    throw new MotionRemoteAssetError('The provider returned an invalid asset id.', 'MOTION_REMOTE_NOT_FOUND');
  }
}

function pageUrlFor(assetId: string): string {
  return `https://polyhaven.com/a/${assetId}`;
}

function authorsOf(item: PolyHavenCatalogItem): string | undefined {
  const names = Object.keys(item.authors ?? {});
  return names.length ? names.join(', ') : undefined;
}

function safeFileName(value: string): string {
  const cleaned = value
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, 80)
    .trim();
  return cleaned || 'asset';
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function resolutionOf(key: string): number {
  const parsed = Number.parseInt(key, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function hdriVariants(files: PolyHavenFiles): MotionRemoteVariant[] {
  const variants: MotionRemoteVariant[] = [];
  for (const [resolutionKey, formats] of Object.entries(files.hdri ?? {})) {
    for (const [format, file] of Object.entries(formats ?? {})) {
      if (format !== 'hdr' && format !== 'exr') continue;
      if (!file?.url) continue;
      variants.push({
        id: `${resolutionKey}-${format}`,
        label: `${resolutionKey.toUpperCase()} · ${format.toUpperCase()}`,
        format,
        byteSize: file.size,
        resolution: resolutionOf(resolutionKey),
      });
    }
  }
  return variants.sort((a, b) => (a.resolution ?? 0) - (b.resolution ?? 0) || a.format.localeCompare(b.format));
}

function modelVariants(files: PolyHavenFiles): MotionRemoteVariant[] {
  const variants: MotionRemoteVariant[] = [];
  for (const [resolutionKey, formats] of Object.entries(files.gltf ?? {})) {
    const model = formats?.gltf;
    if (!model?.url) continue;
    const dependencies = Object.values(model.include ?? {});
    variants.push({
      id: `${resolutionKey}-glb`,
      label: `${resolutionKey.toUpperCase()} · GLB`,
      format: 'glb',
      byteSize: (model.size ?? 0) + dependencies.reduce((total, file) => total + (file.size ?? 0), 0),
      resolution: resolutionOf(resolutionKey),
    });
  }
  return variants.sort((a, b) => (a.resolution ?? 0) - (b.resolution ?? 0));
}

function rankCatalog(
  catalog: { items: Map<string, PolyHavenCatalogItem>; order: string[] },
  query: string,
  limit: number,
): { matches: PolyHavenCatalogItem[]; total: number } {
  const tokens = tokenize(query);
  const items = catalog.order
    .map((slug) => catalog.items.get(slug))
    .filter((item): item is PolyHavenCatalogItem => Boolean(item));

  if (!tokens.length) {
    const sorted = items.sort((a, b) => (b.download_count ?? 0) - (a.download_count ?? 0));
    return { matches: sorted.slice(0, limit), total: sorted.length };
  }

  const scored: Array<{ item: PolyHavenCatalogItem; score: number }> = [];
  for (const item of items) {
    const score = scoreItem(item, tokens);
    if (score > 0) scored.push({ item, score });
  }
  scored.sort((a, b) => b.score - a.score || (b.item.download_count ?? 0) - (a.item.download_count ?? 0) || (a.item.name ?? '').localeCompare(b.item.name ?? ''));
  return { matches: scored.slice(0, limit).map((entry) => entry.item), total: scored.length };
}

function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1);
}

function scoreItem(item: PolyHavenCatalogItem, tokens: string[]): number {
  const name = (item.name ?? '').toLowerCase();
  const slug = item.slug.replace(/[_-]+/g, ' ').toLowerCase();
  const tags = (item.tags ?? []).map((tag) => tag.toLowerCase());
  const categories = [item.category ?? '', ...(item.categories ?? [])].join(' ').toLowerCase();
  const description = (item.description ?? '').toLowerCase();
  let score = 0;
  for (const token of tokens) {
    if (name.includes(token)) score += 6;
    else if (slug.includes(token)) score += 5;
    else if (tags.some((tag) => tag === token)) score += 4;
    else if (tags.some((tag) => tag.includes(token))) score += 3;
    else if (categories.includes(token)) score += 2;
    else if (description.includes(token)) score += 1;
    else return 0;
  }
  return score;
}

function toHit(item: PolyHavenCatalogItem, kind: MotionRemoteAssetKind): MotionRemoteAssetHit {
  return {
    provider: 'polyhaven',
    id: item.slug,
    name: item.name ?? item.slug,
    kind,
    ...(authorsOf(item) ? { creator: authorsOf(item) } : {}),
    license: POLYHAVEN_LICENSE,
    ...(item.thumbnail_url ? { thumbnailUrl: item.thumbnail_url } : {}),
    pageUrl: pageUrlFor(item.slug),
    ...(item.description ? { description: item.description } : {}),
    ...(item.download_count ? { popularity: item.download_count } : {}),
  };
}

function sketchfabModelToHit(model: SketchfabModel, kind: MotionRemoteAssetKind): MotionRemoteAssetHit | null {
  if (!model.uid) return null;
  const thumbnail = model.thumbnails?.[0]?.url ?? model.thumbnail?.url;
  const creator = model.user?.displayName ?? model.user?.username;
  const license = model.license?.label ?? 'Unknown';
  return {
    provider: 'sketchfab',
    id: model.uid,
    name: model.name ?? model.uid,
    kind,
    ...(creator ? { creator } : {}),
    license,
    ...(thumbnail ? { thumbnailUrl: thumbnail } : {}),
    pageUrl: `https://sketchfab.com/3d-models/${model.uid}`,
    ...(model.description ? { description: model.description } : {}),
    ...(model.like_count ? { popularity: model.like_count } : {}),
  };
}

async function extractZip(zipPath: string, destDir: string): Promise<void> {
  const { execFile } = await import('node:child_process');
  // Try system unzip first
  const hasUnzip = await new Promise<boolean>((resolve) => {
    execFile('sh', ['-c', 'which unzip'], { timeout: 5000 }, (err) => resolve(!err));
  });
  if (hasUnzip) {
    await new Promise<void>((resolve, reject) => {
      execFile('unzip', ['-o', zipPath, '-d', destDir], { timeout: 60_000 }, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
    return;
  }
  // Fallback: use adm-zip if available
  try {
    const { default: AdmZip } = await import('adm-zip');
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(destDir, true);
    return;
  } catch {
    // Continue to manual extraction
  }
  // Last resort: use Node.js built-in decompression for simple ZIP files
  const raw = await fs.readFile(zipPath);
  await extractZipManual(raw, destDir);
}

async function extractZipManual(raw: Buffer, destDir: string): Promise<void> {
  // Minimal ZIP central directory parser for common cases
  let offset = raw.length - 22;
  while (offset >= 0) {
    if (raw.readUInt32LE(offset) === 0x06054b50) {
      const centralDirOffset = raw.readUInt32LE(offset + 16);
      const centralDirEntries = raw.readUInt16LE(offset + 10);
      let pos = centralDirOffset;
      for (let i = 0; i < centralDirEntries; i++) {
        if (pos + 46 > raw.length) break;
        if (raw.readUInt32LE(pos) !== 0x02014b50) break;
        const compressionMethod = raw.readUInt16LE(pos + 10);
        const compressedSize = raw.readUInt32LE(pos + 20);
        const fileNameLength = raw.readUInt16LE(pos + 28);
        const extraFieldLength = raw.readUInt16LE(pos + 30);
        const fileCommentLength = raw.readUInt16LE(pos + 32);
        const localHeaderOffset = raw.readUInt32LE(pos + 42);
        pos += 46 + fileNameLength + extraFieldLength + fileCommentLength;
        if (localHeaderOffset + 30 > raw.length) continue;
        const localFileNameLength = raw.readUInt16LE(localHeaderOffset + 26);
        const localExtraLength = raw.readUInt16LE(localHeaderOffset + 28);
        const localDataOffset = localHeaderOffset + 30 + localFileNameLength + localExtraLength;
        const fileName = raw.toString('utf8', localHeaderOffset + 30, localHeaderOffset + 30 + localFileNameLength);
        if (fileName.includes('/')) continue; // skip directories
        if (localDataOffset + compressedSize > raw.length) continue;
        const relativePath = safeRelativePath(fileName);
        if (!relativePath) continue;
        const destPath = path.join(destDir, relativePath);
        await fs.mkdir(path.dirname(destPath), { recursive: true });
        if (compressionMethod === 0) {
          await fs.writeFile(destPath, raw.subarray(localDataOffset, localDataOffset + compressedSize));
        } else if (compressionMethod === 8) {
          const zlib = await import('node:zlib');
          const decompressed = zlib.unzipSync(raw.subarray(localDataOffset, localDataOffset + compressedSize));
          await fs.writeFile(destPath, decompressed);
        }
      }
      break;
    }
    offset -= 1;
  }
}

async function findGltfFile(dir: string): Promise<string | null> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const result = await findGltfFile(fullPath);
      if (result) return result;
    }
    if (entry.isFile()) {
      const lower = entry.name.toLowerCase();
      if (lower.endsWith('.gltf') || lower.endsWith('.glb')) {
        return fullPath;
      }
    }
  }
  return null;
}

async function packGltfToGlb(entryPath: string, outputPath: string): Promise<void> {
  const { NodeIO } = await import('@gltf-transform/core');
  const { ALL_EXTENSIONS } = await import('@gltf-transform/extensions');
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const document = await io.read(entryPath);
  const binary = await io.writeBinary(document);
  await fs.writeFile(outputPath, Buffer.from(binary));
}

function isAllowedAssetContentType(extension: string, contentType: string): boolean {
  if (contentType === 'application/octet-stream') return true;
  const expected: Record<string, string[]> = {
    '.hdr': ['image/vnd.radiance', 'image/hdr'],
    '.exr': ['image/x-exr', 'image/exr'],
    '.glb': ['model/gltf-binary'],
    '.gltf': ['model/gltf+json', 'application/json'],
    '.bin': ['application/gltf-buffer'],
    '.png': ['image/png'],
    '.jpg': ['image/jpeg'],
    '.jpeg': ['image/jpeg'],
    '.webp': ['image/webp'],
    '.ktx2': ['image/ktx2', 'application/octet-stream'],
  };
  return !!contentType && (expected[extension] ?? []).includes(contentType);
}

async function acquireImportSlot(): Promise<() => void> {
  if (activeImports >= MAX_CONCURRENT_IMPORTS) await new Promise<void>((resolve) => importQueue.push(resolve));
  activeImports += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeImports -= 1;
    importQueue.shift()?.();
  };
}
