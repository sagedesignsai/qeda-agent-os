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
 *
 * On first load, the parser extracts parts and materials and commits them to
 * asset metadata so the Inspector can show the Parts panel. Surface bindings,
 * material overrides, and part overrides are applied when cloning the scene.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box3,
  DoubleSide,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector3,
  type Object3D,
} from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { motionStore } from '@/hooks/use-motion-store';
import { motionAssetUrl } from '@/lib/motion/assets';
import { parseGltfStructure } from '@/lib/motion/gltf-structure';
import type { GltfAssetMetadata, MaterialOverride, MotionDocument, MotionNode, PartOverride, SurfaceBinding } from '@/lib/motion/types';

import { boolProp, stringProp, textureAspect } from './helpers';
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

// ── Helpers ──────────────────────────────────────────────────────────────────

function getSurfaceBindings(node: MotionNode): Record<string, SurfaceBinding> {
  const val = node.props.surfaceBindings;
  if (val && typeof val === 'object' && !Array.isArray(val)) return val as Record<string, SurfaceBinding>;
  return {};
}

function getMaterialOverrides(node: MotionNode): Record<string, MaterialOverride> {
  const val = node.props.materialOverrides;
  if (val && typeof val === 'object' && !Array.isArray(val)) return val as Record<string, MaterialOverride>;
  return {};
}

function getPartOverrides(node: MotionNode): Record<string, PartOverride> {
  const val = node.props.partOverrides;
  if (val && typeof val === 'object' && !Array.isArray(val)) return val as Record<string, PartOverride>;
  return {};
}

// ── Decal component ──────────────────────────────────────────────────────────

function PartDecal({
  assetId,
  document,
  position,
  size,
}: {
  assetId: string;
  document: MotionDocument;
  position: [number, number, number];
  size: number;
}) {
  const asset = document.assets.find((a) => a.id === assetId);
  const source = asset && asset.hash !== 'builtin'
    ? motionAssetUrl(document.meta.id, asset.id)
    : null;
  const [texture, setTexture] = useState<Texture | null>(null);

  useEffect(() => {
    if (!source) { setTexture(null); return undefined; }
    let cancelled = false;
    setTexture(null);
    const next = new TextureLoader().load(
      source,
      (loaded) => { if (!cancelled) setTexture(loaded); },
      undefined,
      () => { if (!cancelled) setTexture(null); },
    );
    next.colorSpace = SRGBColorSpace;
    return () => { cancelled = true; next.dispose(); };
  }, [source]);

  if (!texture) return null;
  const aspect = textureAspect(texture) ?? 1;
  return (
    <mesh position={position} rotation={[0, Math.PI, 0]}>
      <planeGeometry args={[size, size / aspect]} />
      <meshBasicMaterial map={texture} transparent alphaTest={0.35} toneMapped={false} side={DoubleSide} />
    </mesh>
  );
}

// ── Renderer ─────────────────────────────────────────────────────────────────

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
  const metadataCommitted = useRef(false);

  useEffect(() => {
    if (!mediaSource) return undefined;
    let cancelled = false;
    setFailedSource(null);
    loadMotionModel(mediaSource).then(
      (loaded) => {
        if (!cancelled) {
          setGltf(loaded);
          // Parse structure and commit metadata if not already done
          if (!metadataCommitted.current && asset && !asset.metadata?.parts) {
            metadataCommitted.current = true;
            const structure = parseGltfStructure(loaded);
            if (structure.parts.length > 0) {
              const meta: GltfAssetMetadata = structure;
              motionStore.commit('Parse model structure', [
                { op: 'asset.update-metadata', assetId: asset.id, metadata: meta },
              ]);
            }
          }
        }
      },
      () => {
        if (!cancelled) setFailedSource(mediaSource);
      },
    );
    return () => { cancelled = true; };
  }, [mediaSource, asset]);

  const surfaceBindings = useMemo(() => getSurfaceBindings(node), [node.props.surfaceBindings]);
  const materialOverrides = useMemo(() => getMaterialOverrides(node), [node.props.materialOverrides]);
  const partOverrides = useMemo(() => getPartOverrides(node), [node.props.partOverrides]);

  // Collect replace-mode binding asset IDs so we can load their textures
  const replaceBindingAssetIds = useMemo(() => {
    const ids: string[] = [];
    for (const binding of Object.values(surfaceBindings)) {
      if (binding.mode === 'replace') ids.push(binding.assetId);
    }
    return ids;
  }, [surfaceBindings]);

  // Load textures for replace-mode bindings
  const replaceTextures = useMemo(() => {
    const map = new Map<string, string>();
    for (const assetId of replaceBindingAssetIds) {
      const a = document.assets.find((item) => item.id === assetId);
      if (a && a.hash !== 'builtin') {
        map.set(assetId, motionAssetUrl(document.meta.id, a.id));
      }
    }
    return map;
  }, [replaceBindingAssetIds, document]);

  const [loadedReplaceTextures, setLoadedReplaceTextures] = useState<Map<string, Texture>>(new Map());

  useEffect(() => {
    const entries = [...replaceTextures.entries()];
    if (entries.length === 0) { setLoadedReplaceTextures(new Map()); return; }
    const loaded = new Map<string, Texture>();
    let pending = entries.length;
    let cancelled = false;
    for (const [assetId, url] of entries) {
      const tex = new TextureLoader().load(
        url,
        (t) => {
          if (!cancelled) {
            loaded.set(assetId, t);
            pending--;
            if (pending === 0) setLoadedReplaceTextures(new Map(loaded));
          }
        },
        undefined,
        () => {
          if (!cancelled) {
            pending--;
            if (pending === 0) setLoadedReplaceTextures(new Map(loaded));
          }
        },
      );
      tex.colorSpace = SRGBColorSpace;
    }
    return () => {
      cancelled = true;
      loaded.forEach((t) => t.dispose());
    };
  }, [replaceTextures]);

  const object = useMemo(() => {
    if (!gltf) return null;
    const clone = gltf.scene.clone(true);
    // Materials must be per-instance
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

    // Apply surface bindings in replace mode
    clone.traverse((child) => {
      const mesh = child as Object3D & { isMesh?: boolean; name: string };
      if (!mesh.isMesh) return;
      const binding = surfaceBindings[mesh.name];
      if (!binding || binding.mode !== 'replace') return;
      const texture = loadedReplaceTextures.get(binding.assetId);
      if (!texture) return;
      const mat = new MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false });
      if (binding.tint) mat.color.set(binding.tint);
      if (Array.isArray(mesh.material)) {
        mesh.material = (mesh.material as unknown[]).map(() => mat.clone());
      } else {
        mesh.material = mat;
      }
    });

    // Apply material overrides
    clone.traverse((child) => {
      const mesh = child as Object3D & { isMesh?: boolean; material?: unknown };
      if (!mesh.isMesh || !mesh.material) return;
      const matName = typeof mesh.material === 'object' && mesh.material !== null
        ? (mesh.material as { name?: string }).name
        : undefined;
      if (!matName) return;
      const override = materialOverrides[matName];
      if (!override) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of materials) {
        if (!(mat instanceof MeshStandardMaterial)) continue;
        if (override.color) mat.color.set(override.color);
        if (override.roughness !== undefined) mat.roughness = override.roughness;
        if (override.metalness !== undefined) mat.metalness = override.metalness;
        if (override.emissive) mat.emissive.set(override.emissive);
        if (override.emissiveIntensity !== undefined) mat.emissiveIntensity = override.emissiveIntensity;
      }
    });

    // Apply part overrides (visibility, opacity, transform)
    clone.traverse((child) => {
      const mesh = child as Object3D & { isMesh?: boolean; name: string };
      if (!mesh.isMesh) return;
      const override = partOverrides[mesh.name];
      if (!override) return;
      if (override.visible !== undefined) mesh.visible = override.visible;
      if (override.position) {
        mesh.position.set(override.position[0], override.position[1], override.position[2]);
      }
      if (override.rotation) {
        mesh.rotation.set(override.rotation[0], override.rotation[1], override.rotation[2]);
      }
      if (override.scale !== undefined) {
        if (typeof override.scale === 'number') {
          mesh.scale.setScalar(override.scale);
        } else {
          mesh.scale.set(override.scale[0], override.scale[1], override.scale[2]);
        }
      }
    });

    return clone;
  }, [gltf, surfaceBindings, loadedReplaceTextures, materialOverrides, partOverrides]);

  // Apply shadow settings
  useEffect(() => {
    if (!object) return;
    object.traverse((child) => {
      const mesh = child as Object3D & { isMesh?: boolean };
      if (!mesh.isMesh) return;
      mesh.castShadow = castShadow;
      mesh.receiveShadow = receiveShadow;
    });
  }, [castShadow, object, receiveShadow]);

  // Build decal overlays for surface bindings in decal mode
  const decals = useMemo(() => {
    if (!gltf) return [];
    const decals: Array<{ key: string; assetId: string; position: [number, number, number]; size: number }> = [];
    const _center = new Vector3();
    const _size = new Vector3();
    gltf.scene.traverse((child) => {
      const mesh = child as Object3D & { isMesh?: boolean; name: string };
      if (!mesh.isMesh) return;
      const binding = surfaceBindings[mesh.name];
      if (!binding || binding.mode !== 'decal') return;
      const box = new Box3().setFromObject(mesh);
      box.getCenter(_center);
      box.getSize(_size);
      const decalSize = Math.max(_size.x, _size.y) * 0.9;
      decals.push({
        key: mesh.name,
        assetId: binding.assetId,
        position: [_center.x, _center.y, _center.z],
        size: decalSize,
      });
    });
    return decals;
  }, [gltf, surfaceBindings]);

  if (!asset || !mediaSource || (failedSource !== null && failedSource === mediaSource)) {
    return <MissingAssetRenderer node={node} />;
  }
  if (!object) return null;

  return (
    <>
      <primitive object={object} />
      {decals.map((decal) => (
        <PartDecal
          key={decal.key}
          assetId={decal.assetId}
          document={document}
          position={decal.position}
          size={decal.size}
        />
      ))}
    </>
  );
}
