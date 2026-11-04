/**
 * components/motion/scene/nodes/asset-texture.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Loads one document asset as a colour-managed texture, for node renderers that
 * paint a print or decal. Content-addressed URLs make the per-URL cache safe for
 * the lifetime of the bundle; the hook still disposes the texture it owns so a
 * changing print does not leak GPU memory.
 */

import { useEffect, useState } from 'react';
import { SRGBColorSpace, TextureLoader, type Texture } from 'three';

import { motionAssetUrl } from '@/lib/motion/assets';
import type { MotionDocument } from '@/lib/motion/types';

export function useMotionAssetTexture(
  document: MotionDocument,
  assetId: string | undefined,
): Texture | null {
  const asset = assetId
    ? document.assets.find((candidate) => candidate.id === assetId)
    : undefined;
  const source = asset && asset.hash !== 'builtin'
    ? motionAssetUrl(document.meta.id, asset.id)
    : null;
  const [texture, setTexture] = useState<Texture | null>(null);

  useEffect(() => {
    if (!source) {
      setTexture(null);
      return undefined;
    }
    let cancelled = false;
    setTexture(null);
    const next = new TextureLoader().load(
      source,
      (loaded) => {
        if (!cancelled) setTexture(loaded);
      },
      undefined,
      () => {
        if (!cancelled) setTexture(null);
      },
    );
    next.colorSpace = SRGBColorSpace;
    return () => {
      cancelled = true;
      next.dispose();
    };
  }, [source]);

  return texture;
}
