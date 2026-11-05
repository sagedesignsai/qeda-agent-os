/**
 * main/media/motion.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Motion model assets: committed assets, frames, glTF sidecars, and the
 * short-lived staging host used while an import is being finalised.
 *
 * Resolution is entirely through the motion asset store, so only indexed assets
 * (or an active staged import) are reachable. Byte serving is shared with the
 * other hosts; only the cache/ETag policy differs.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { getMotionAssetStore } from '../motion/service.js';
import { serveFileRequest } from './http.js';

export async function serveMotionMedia(
  request: Request,
  assetStore: Pick<
    ReturnType<typeof getMotionAssetStore>,
    'resolveAsset' | 'resolveAssetFile' | 'resolveAssetFrame' | 'resolveStaged'
  > = getMotionAssetStore(),
): Promise<Response> {
  const url = new URL(request.url);
  const staging = url.hostname === 'motion-staging';
  if (!staging && url.hostname !== 'motion') {
    return new Response(null, { status: 404 });
  }

  let segments: string[];
  try {
    segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  } catch {
    return new Response(null, { status: 400 });
  }

  let media: { path: string; mimeType: string; hash?: string } | null = null;
  if (staging && segments.length === 1) {
    media = await assetStore.resolveStaged(segments[0]);
  } else if (!staging && segments.length === 2) {
    media = await assetStore.resolveAsset(segments[0], segments[1]);
  } else if (!staging && segments.length === 3 && /^\d+$/.test(segments[2])) {
    media = await assetStore.resolveAssetFrame(
      segments[0],
      segments[1],
      Number(segments[2]),
    );
  } else if (!staging && segments.length > 2) {
    // glTF sidecars: GLTFLoader resolves buffer/texture URIs relative to the
    // model URL, so `scene.bin` and friends arrive as extra path segments.
    media = await assetStore.resolveAssetFile(
      segments[0],
      segments[1],
      segments.slice(2).join('/'),
    );
  }
  if (!media) return new Response(null, { status: 404 });

  return serveFileRequest(request, media.path, {
    contentType: media.mimeType,
    cacheControl: 'no-cache',
    etag: media.hash ? `"${media.hash}"` : undefined,
  });
}
