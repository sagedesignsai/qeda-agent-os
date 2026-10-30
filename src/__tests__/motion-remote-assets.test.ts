import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  assertAllowedRemoteUrl,
  MotionRemoteAssetClient,
  type MotionRemoteFetch,
  type MotionRemoteResponse,
} from '@/main/motion/remote-assets';

function response(
  status: number,
  body: string | Uint8Array,
  headers: Record<string, string> = {},
): MotionRemoteResponse {
  const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : body;
  let read = false;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers[name.toLowerCase()] ?? null },
    arrayBuffer: async () => bytes.slice().buffer,
    body: {
      getReader: () => ({
        read: async () => {
          if (read) return { done: true };
          read = true;
          return { done: false, value: bytes };
        },
      }),
    },
  };
}

describe('Motion remote asset client', () => {
  let tempRoot: string;
  const catalog = {
    potted_plant: { name: 'Potted Plant', authors: { 'Artist One': 'author' }, download_count: 20 },
    sunset: { name: 'Sunset', description: 'Sunset environment', download_count: 100 },
  };

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'motion-remote-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it('ranks locally and caches the catalog per client', async () => {
    let catalogRequests = 0;
    const fetch: MotionRemoteFetch = async (url) => {
      if (url.includes('/assets?type=models')) catalogRequests += 1;
      return response(200, JSON.stringify(catalog), { 'content-type': 'application/json' });
    };
    const client = new MotionRemoteAssetClient({ stageAssets: async () => ({ items: [], errors: [] }), cancelImports: async () => undefined }, { fetch, now: () => new Date('2026-10-30T12:00:00.000Z') });

    const plant = await client.search({ provider: 'polyhaven', query: 'plant', kind: 'model' });
    const empty = await client.search({ provider: 'polyhaven', query: '', kind: 'model' });
    expect(plant.hits.map((hit) => hit.id)).toEqual(['potted_plant']);
    expect(empty.hits[0].id).toBe('sunset');
    expect(catalogRequests).toBe(1);
  });

  it('downloads, packs, and sends a bundled model through the existing staging service', async () => {
    const modelJson = JSON.stringify({ asset: { version: '2.0' }, buffers: [{ uri: 'mesh.bin', byteLength: 4 }] });
    const packed = Buffer.from([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0, 12, 0, 0, 0]);
    const fetch: MotionRemoteFetch = async (url) => {
      if (url.includes('/assets?type=models')) return response(200, JSON.stringify({ potted_plant: catalog.potted_plant }), { 'content-type': 'application/json' });
      if (url.includes('/files/potted_plant')) return response(200, JSON.stringify({
        gltf: { '2k': { gltf: { url: 'https://dl.polyhaven.org/models/scene.gltf', size: modelJson.length, include: { 'mesh.bin': { url: 'https://dl.polyhaven.org/models/mesh.bin', size: 4 } } } } },
      }), { 'content-type': 'application/json' });
      if (url.endsWith('/scene.gltf')) return response(200, modelJson, { 'content-type': 'model/gltf+json' });
      if (url.endsWith('/mesh.bin')) return response(200, new Uint8Array([1, 2, 3, 4]), { 'content-type': 'application/octet-stream' });
      throw new Error(`Unexpected URL ${url}`);
    };
    let stagedBytes: Buffer | undefined;
    const client = new MotionRemoteAssetClient({
      stageAssets: async (_projectId, paths) => {
        expect(paths).toHaveLength(1);
        stagedBytes = await fs.readFile(paths[0]);
        return { items: [{
          importId: 'imp_test', name: 'Potted Plant', sourceName: 'Potted Plant.glb', probeUrl: 'qeda-media://motion-staging/imp_test',
          kind: 'model', mimeType: 'model/gltf-binary', byteSize: packed.length, warnings: [],
        }], errors: [] };
      },
      cancelImports: async () => undefined,
    }, {
      fetch,
      tempRoot,
      now: () => new Date('2026-10-30T12:00:00.000Z'),
      packGltf: async (entryPath, outputPath) => {
        expect(JSON.parse(await fs.readFile(entryPath, 'utf8'))).toMatchObject({ asset: { version: '2.0' } });
        expect(await fs.readFile(path.join(path.dirname(entryPath), 'mesh.bin'))).toEqual(Buffer.from([1, 2, 3, 4]));
        await fs.writeFile(outputPath, packed);
      },
    });

    const result = await client.import('prj_test', { provider: 'polyhaven', assetId: 'potted_plant', kind: 'model', variantId: '2k-glb', requestId: 'req-1' });
    expect(result.errors).toEqual([]);
    expect(stagedBytes).toEqual(packed);
    expect(result.provenance.imp_test).toMatchObject({
      source: 'polyhaven', sourceAssetId: 'potted_plant', license: 'CC0-1.0',
      providerCredit: 'Powered by Poly Haven', retrievedAt: '2026-10-30T12:00:00.000Z', variant: '2k-glb',
    });
    expect(await fs.readdir(tempRoot)).toEqual([]);
  });

  it('rejects URLs outside the provider allowlist and refuses unknown providers', async () => {
    expect(() => assertAllowedRemoteUrl('http://dl.polyhaven.org/file', ['dl.polyhaven.org'])).toThrow(/HTTPS/);
    expect(() => assertAllowedRemoteUrl('https://evil.example/file', ['dl.polyhaven.org'])).toThrow(/not allowed/);
    const client = new MotionRemoteAssetClient({ stageAssets: async () => ({ items: [], errors: [] }), cancelImports: async () => undefined }, { fetch: async () => response(200, '{}') });
    await expect(client.search({ provider: 'other' as 'polyhaven', query: '', kind: 'model' })).rejects.toThrow(/Unknown asset provider/);
  });

  it('rejects a catalog file URL on an unapproved host before downloading it', async () => {
    const fetch: MotionRemoteFetch = async (url) => {
      if (url.includes('/assets?type=models')) return response(200, JSON.stringify({ potted_plant: catalog.potted_plant }));
      if (url.includes('/files/potted_plant')) return response(200, JSON.stringify({ gltf: { '2k': { gltf: { url: 'https://evil.example/scene.gltf', size: 10 } } } }));
      throw new Error('An unapproved file host was contacted.');
    };
    const client = new MotionRemoteAssetClient({ stageAssets: async () => ({ items: [], errors: [] }), cancelImports: async () => undefined }, { fetch, tempRoot });
    const result = await client.import('prj_test', { provider: 'polyhaven', assetId: 'potted_plant', kind: 'model', variantId: '2k-glb' });
    expect(result.items).toEqual([]);
    expect(result.errors[0].message).toMatch(/not allowed/);
    expect(await fs.readdir(tempRoot)).toEqual([]);
  });

  it('cancels an active download and removes its temporary directory', async () => {
    let downloadStarted!: () => void;
    const started = new Promise<void>((resolve) => { downloadStarted = resolve; });
    const fetch: MotionRemoteFetch = async (url, init) => {
      if (url.includes('/assets?type=models')) return response(200, JSON.stringify({ potted_plant: catalog.potted_plant }));
      if (url.includes('/files/potted_plant')) return response(200, JSON.stringify({
        gltf: { '2k': { gltf: { url: 'https://dl.polyhaven.org/scene.gltf', size: 20 } } },
      }));
      downloadStarted();
      const signal = init?.signal;
      const cancelledResponse: MotionRemoteResponse = {
        ok: true,
        status: 200,
        headers: { get: (name) => name.toLowerCase() === 'content-type' ? 'model/gltf+json' : null },
        arrayBuffer: async () => new ArrayBuffer(0),
        body: { getReader: () => ({
          read: () => signal?.aborted
            ? Promise.reject(signal.reason)
            : new Promise((_resolve, reject) => signal?.addEventListener('abort', () => reject(signal.reason), { once: true })),
        }) },
      };
      return cancelledResponse;
    };
    const client = new MotionRemoteAssetClient({
      stageAssets: async () => { throw new Error('Cancelled imports must not stage.'); },
      cancelImports: async () => undefined,
    }, { fetch, tempRoot });
    const importing = client.import('prj_test', {
      provider: 'polyhaven', assetId: 'potted_plant', kind: 'model', variantId: '2k-glb', requestId: 'cancel-me',
    });
    await started;
    client.cancelImport('cancel-me');
    const result = await importing;
    expect(result.items).toEqual([]);
    expect(result.errors[0].message).toMatch(/cancel/i);
    expect(await fs.readdir(tempRoot)).toEqual([]);
  });

  it('revalidates redirect hosts and enforces stream size even when headers lie', async () => {
    let contactedOutsideHost = false;
    const redirectFetch: MotionRemoteFetch = async (url) => {
      if (url.includes('evil.example')) contactedOutsideHost = true;
      return response(302, '', { location: 'https://evil.example/catalog', 'content-type': 'text/plain' });
    };
    const redirectClient = new MotionRemoteAssetClient({ stageAssets: async () => ({ items: [], errors: [] }), cancelImports: async () => undefined }, { fetch: redirectFetch });
    await expect(redirectClient.search({ provider: 'polyhaven', query: '', kind: 'model' })).rejects.toThrow(/not allowed/);
    expect(contactedOutsideHost).toBe(false);

    const fetch: MotionRemoteFetch = async (url) => {
      if (url.includes('/assets?type=models')) return response(200, JSON.stringify({ potted_plant: catalog.potted_plant }));
      if (url.includes('/files/potted_plant')) return response(200, JSON.stringify({
        gltf: { '2k': { gltf: { url: 'https://dl.polyhaven.org/scene.gltf', size: 0 } } },
      }));
      return response(200, '123456', { 'content-length': '1', 'content-type': 'model/gltf+json' });
    };
    const cappedClient = new MotionRemoteAssetClient({
      stageAssets: async () => { throw new Error('Oversized content must not stage.'); },
      cancelImports: async () => undefined,
    }, { fetch, tempRoot, maxModelBytes: 5 });
    const result = await cappedClient.import('prj_test', {
      provider: 'polyhaven', assetId: 'potted_plant', kind: 'model', variantId: '2k-glb',
    });
    expect(result.errors[0].message).toMatch(/size limit/);
    expect(await fs.readdir(tempRoot)).toEqual([]);
  });
});
