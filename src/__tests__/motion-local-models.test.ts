/**
 * @jest-environment node
 *
 * __tests__/motion-local-models.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The pre-installed library resolved `assets/models/catalog.json` from the main
 * bundle directory (`release/app/dist/main`), so the dialog listed zero models.
 * These assertions pin the catalog to the real repo assets, and cover the
 * `qeda-media://motion-library` host the dialog's preview loads from.
 *
 * Runs in the node environment: the media host answers with web `Response`s,
 * which jsdom does not provide.
 */

import { statSync } from 'node:fs';

import { localModelMediaUrl } from '@/lib/motion/local-library';
import { serveLocalModel } from '@/main/media/local-library';
import { listLocalModels, resolveLocalModelPath } from '@/main/motion/local-models';

/** The protocol handler only reads `url`, `method` and `headers`. */
const mediaRequest = (url: string): Request =>
  ({ url, method: 'GET', headers: new Headers() }) as unknown as Request;

describe('local model library', () => {
  it('loads the bundled catalog instead of an empty list', () => {
    const models = listLocalModels();
    expect(models.length).toBeGreaterThan(0);
    expect(models.some((model) => model.id.startsWith('local:'))).toBe(true);
  });

  it('resolves a catalog id to a bundled GLB on disk', () => {
    const [model] = listLocalModels();
    expect(model).toBeDefined();
    const modelPath = resolveLocalModelPath(model?.id ?? '');
    expect(modelPath).toMatch(/\.glb$/);
  });

  it('returns null for an unknown model id', () => {
    expect(resolveLocalModelPath('local:khronos/DoesNotExist')).toBeNull();
  });
});

describe('local model media host', () => {
  it('streams a catalog GLB with a model content type', async () => {
    const [model] = listLocalModels();
    expect(model).toBeDefined();
    const modelPath = resolveLocalModelPath(model?.id ?? '');
    const response = await serveLocalModel(mediaRequest(localModelMediaUrl(model?.id ?? '')));

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('model/gltf-binary');
    expect(Number(response.headers.get('content-length'))).toBe(statSync(modelPath!).size);
  });

  it('refuses an id that is not in the catalog', async () => {
    const response = await serveLocalModel(
      mediaRequest('qeda-media://motion-library/..%2F..%2Fetc%2Fpasswd'),
    );
    expect(response.status).toBe(404);
  });
});
