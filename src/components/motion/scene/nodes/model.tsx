/**
 * components/motion/scene/nodes/model.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * glTF/GLB binding. The loader is imported lazily so the renderer bundle does not
 * pay for it until a document actually references a model, and so jsdom-based
 * tests never load the loader's ESM-only internals.
 *
 * Each node clones the cached scene: two nodes pointing at one asset must not
 * share a transform. Skinned clones share the source skeleton, which is fine
 * because Motion does not play glTF animation clips yet.
 */

import { useEffect, useMemo, useState } from 'react';
import type { Object3D } from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { motionAssetUrl } from '@/lib/motion/assets';
import type { MotionDocument, MotionNode } from '@/lib/motion/types';

import { boolProp, stringProp } from './helpers';
import { MissingAssetRenderer } from './placeholders';

/** Assets are content-addressed, so a URL can be cached for the session. */
const modelCache = new Map<string, Promise<GLTF>>();

function loadMotionModel(url: string): Promise<GLTF> {
  const cached = modelCache.get(url);
  if (cached) return cached;
  const pending = import('three/examples/jsm/loaders/GLTFLoader.js').then(
    ({ GLTFLoader }) =>
      new Promise<GLTF>((resolve, reject) => {
        new GLTFLoader().load(url, resolve, undefined, (error) => {
          reject(error instanceof Error ? error : new Error(String(error)));
        });
      }),
  );
  modelCache.set(url, pending);
  // A failed load must not stay cached, or a relinked asset would never retry.
  pending.catch(() => modelCache.delete(url));
  return pending;
}

export function ModelRenderer({
  node,
  document,
}: {
  node: MotionNode;
  document: MotionDocument;
}) {
  const assetId = stringProp(node, 'assetId', '');
  const asset = document.assets.find((item) => item.id === assetId);
  const mediaSource = asset && asset.hash !== 'builtin'
    ? motionAssetUrl(document.meta.id, asset.id)
    : null;
  const castShadow = boolProp(node, 'castShadow', true);
  const receiveShadow = boolProp(node, 'receiveShadow', true);

  const [gltf, setGltf] = useState<GLTF | null>(null);
  const [failedSource, setFailedSource] = useState<string | null>(null);

  useEffect(() => {
    if (!mediaSource) return undefined;
    let cancelled = false;
    setFailedSource(null);
    loadMotionModel(mediaSource).then(
      (loaded) => {
        if (!cancelled) setGltf(loaded);
      },
      () => {
        if (!cancelled) setFailedSource(mediaSource);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [mediaSource]);

  const object = useMemo(() => {
    if (!gltf) return null;
    const clone = gltf.scene.clone(true);
    // Materials must be per-instance: the frame binding writes node opacity into
    // them, so two nodes sharing an asset would otherwise overwrite each other.
    clone.traverse((child) => {
      const mesh = child as Object3D & { isMesh?: boolean; material?: unknown };
      if (!mesh.isMesh || !mesh.material) return;
      const materials = Array.isArray(mesh.material)
        ? (mesh.material as Array<{ clone(): unknown }>)
        : [mesh.material as { clone(): unknown }];
      mesh.material = Array.isArray(mesh.material)
        ? materials.map((material) => material.clone())
        : materials[0].clone();
    });
    return clone;
  }, [gltf]);

  useEffect(() => {
    if (!object) return;
    object.traverse((child) => {
      const mesh = child as Object3D & { isMesh?: boolean };
      if (!mesh.isMesh) return;
      mesh.castShadow = castShadow;
      mesh.receiveShadow = receiveShadow;
    });
  }, [castShadow, object, receiveShadow]);

  if (!asset || !mediaSource || (failedSource !== null && failedSource === mediaSource)) {
    return <MissingAssetRenderer node={node} />;
  }
  // Nothing is drawn until the first parse completes; the frame binding still
  // applies the node transform to the surrounding group, so the scene is stable.
  if (!object) return null;
  return <primitive object={object} />;
}
