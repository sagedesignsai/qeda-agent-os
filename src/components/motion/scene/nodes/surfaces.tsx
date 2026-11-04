/**
 * components/motion/scene/nodes/surfaces.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Image screen binding. Resolves the node's asset to a texture, honours `fit`
 * (contain resizes the mesh, cover crops through UV repeat), applies `tint`, and
 * offers a relink action when the bundled media is gone.
 */

import { useEffect, useMemo, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import {
  CanvasTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  SRGBColorSpace,
  TextureLoader,
} from 'three';

import { createMotionScreenArtwork } from '@/components/motion/scene/create-motion-screen-artwork';
import { motionStore } from '@/hooks/use-motion-store';
import { motionAssetUrl } from '@/lib/motion/assets';
import type { MotionDocument, MotionNode } from '@/lib/motion/types';

import { numberProp, stringProp, surfaceCoverUv, surfacePlaneSize, textureAspect } from './helpers';

async function relinkScreenAsset(projectId: string, assetId: string): Promise<void> {
  const result = await window.electron.ipc.invoke<{
    assetId: string; path: string; hash: string; byteSize: number; mimeType: string; matches: boolean;
  } | null>('motion:relink-asset', { projectId, assetId });
  if (!result) return;
  const { matches: _matches, ...relink } = result;
  motionStore.commit('Relink Motion asset', [{ op: 'asset.relink', ...relink }]);
}

export function ImageScreenRenderer({
  node,
  document,
}: {
  node: MotionNode;
  document: MotionDocument;
}) {
  const gl = useThree((state) => state.gl);
  const [failedSource, setFailedSource] = useState<string | null>(null);
  // A loaded image fills in asynchronously; re-render so `fit` can measure it.
  const [, setTextureLoaded] = useState(false);
  const width = numberProp(node, 'width', 3.46);
  const height = numberProp(node, 'height', 1.947);
  const fit = stringProp(node, 'fit', 'contain');
  const tint = stringProp(node, 'tint', '#ffffff');
  const projectId = document.meta.id;
  // `assetId` is the v4 field; `source` only survives on un-migrated in-memory nodes.
  const assetId = stringProp(node, 'assetId', stringProp(node, 'source', ''));
  const asset = document.assets.find((item) => item.id === assetId);
  const mediaSource = asset && asset.hash !== 'builtin'
    ? motionAssetUrl(projectId, asset.id)
    : assetId;
  const loadFailed = failedSource === mediaSource;
  const texture = useMemo(() => {
    if (mediaSource === 'starter-dashboard' || mediaSource === 'builtin:starter-dashboard') {
      const next = new CanvasTexture(createMotionScreenArtwork());
      next.colorSpace = SRGBColorSpace;
      next.magFilter = LinearFilter;
      next.minFilter = LinearMipmapLinearFilter;
      next.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
      return next;
    }

    if (!mediaSource) return null;

    const next = new TextureLoader().load(
      mediaSource,
      () => setTextureLoaded(true),
      undefined,
      () => setFailedSource(mediaSource),
    );
    next.colorSpace = SRGBColorSpace;
    next.magFilter = LinearFilter;
    next.minFilter = LinearMipmapLinearFilter;
    next.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
    return next;
  }, [gl, mediaSource]);

  const aspect = textureAspect(texture);
  const planeAspect = width / height;
  // `contain` resizes the mesh so the image keeps its aspect, `cover` keeps the
  // mesh and crops through UV repeat, `stretch` leaves both untouched.
  const plane = surfacePlaneSize(width, height, fit, aspect);

  useEffect(() => () => texture?.dispose(), [texture]);

  useEffect(() => {
    if (!texture) return;
    const uv = fit === 'cover' ? surfaceCoverUv(aspect, planeAspect) : null;
    const [repeatX, repeatY] = uv ? uv.repeat : [1, 1];
    const [offsetX, offsetY] = uv ? uv.offset : [0, 0];
    texture.repeat.set(repeatX, repeatY);
    texture.offset.set(offsetX, offsetY);
  }, [aspect, fit, planeAspect, texture]);

  return (
    <mesh>
      <planeGeometry args={[plane.width, plane.height]} />
      {texture ? (
        <meshBasicMaterial
          map={loadFailed ? null : texture}
          color={loadFailed ? '#ff00aa' : tint}
          toneMapped={false}
        />
      ) : (
        <meshStandardMaterial color="#202633" roughness={0.7} />
      )}
      {loadFailed && (
        <Html center distanceFactor={5}>
          <div className="min-w-40 rounded border border-fuchsia-400 bg-background/95 p-2 text-center text-xs shadow-lg">
            <p className="font-medium text-fuchsia-600">Missing: {(asset?.name ?? assetId) || 'image'}</p>
            {asset && <button type="button" className="mt-1 text-primary underline" onClick={() => void relinkScreenAsset(projectId, asset.id)}>Relink</button>}
          </div>
        </Html>
      )}
    </mesh>
  );
}
