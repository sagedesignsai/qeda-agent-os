/**
 * components/motion/scene/MotionWorldBinding.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Applies the scene's world to the Three.js scene: the visible backdrop, the
 * clear alpha, and — for an HDRI — image-based lighting through a PMREM.
 *
 * This is the only place the editor viewport and the export window can disagree,
 * so both go through `resolveSceneWorld` and then through this component. The
 * exported frames are therefore lit by the same world the user approved.
 *
 * Two effects on purpose: changing intensity/blur/orientation must not reload a
 * multi-megabyte HDRI and re-convolve it.
 */

import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import {
  Color,
  EquirectangularReflectionMapping,
  PMREMGenerator,
  type Texture,
  type WebGLRenderTarget,
} from 'three';
import type { MotionResolvedWorld } from '@/lib/motion/environment';

/** The slice of three's data-texture loaders this module needs. */
type EnvironmentLoader = { loadAsync(url: string): Promise<Texture> };

/**
 * One decode per HDRI per window. Deliberately unbounded: an entry can still be
 * the live `scene.background` of another mounted canvas, and disposing a
 * texture that is still referenced renders black rather than re-loading.
 */
const environmentTextures = new Map<string, Promise<Texture>>();

/**
 * Imported lazily: three's example loaders ship as ESM, so a static import
 * makes every jsdom test that mounts the canvas fail to parse this module.
 */
async function createLoader(format: 'hdr' | 'exr'): Promise<EnvironmentLoader> {
  if (format === 'exr') {
    const { EXRLoader } = await import('three/examples/jsm/loaders/EXRLoader.js');
    return new EXRLoader();
  }
  const { RGBELoader } = await import('three/examples/jsm/loaders/RGBELoader.js');
  return new RGBELoader();
}

function loadEnvironmentTexture(url: string, format: 'hdr' | 'exr'): Promise<Texture> {
  const cached = environmentTextures.get(url);
  if (cached) return cached;
  const pending = createLoader(format)
    .then((loader) => loader.loadAsync(url))
    .then((texture) => {
      texture.mapping = EquirectangularReflectionMapping;
      return texture;
    });
  environmentTextures.set(url, pending);
  // A failed load must not poison the cache for a later relink.
  pending.catch(() => environmentTextures.delete(url));
  return pending;
}

export type MotionWorldBindingProps = {
  world: MotionResolvedWorld | null;
  /** Editor stage tone, used only when the document declares no world. */
  fallbackColor: string;
};

export function MotionWorldBinding({ world, fallbackColor }: MotionWorldBindingProps) {
  const scene = useThree((state) => state.scene);
  const gl = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);
  const environmentTarget = useRef<WebGLRenderTarget | null>(null);

  const kind = world?.kind ?? 'none';
  const color = world?.kind === 'color' ? world.color : null;
  const url = world?.kind === 'environment' ? world.url : null;
  const format = world?.kind === 'environment' ? world.format : null;
  const intensity = world?.kind === 'environment' ? world.intensity : 1;
  const blur = world?.kind === 'environment' ? world.blur : 0;
  const rotation = world?.kind === 'environment' ? world.rotation : 0;
  // Read at load time without making the loader depend on tuning values: a
  // slider drag must never re-download or re-convolve the HDRI.
  const tuning = useRef({ intensity, blur, rotation });
  tuning.current = { intensity, blur, rotation };

  useEffect(() => {
    let cancelled = false;
    const releaseEnvironment = () => {
      environmentTarget.current?.dispose();
      environmentTarget.current = null;
    };
    const opaque = (next: Color) => {
      releaseEnvironment();
      scene.background = next;
      scene.environment = null;
      scene.backgroundBlurriness = 0;
      scene.backgroundIntensity = 1;
      gl.setClearAlpha(1);
      invalidate();
    };

    if (kind === 'transparent') {
      releaseEnvironment();
      scene.background = null;
      scene.environment = null;
      scene.backgroundBlurriness = 0;
      scene.backgroundIntensity = 1;
      gl.setClearAlpha(0);
      invalidate();
      return () => {
        cancelled = true;
      };
    }

    if (kind !== 'environment' || !url || !format) {
      // No world at all falls back to editor tone; an unresolved environment is
      // missing media, and painting the fallback is the honest result.
      opaque(new Color(color ?? fallbackColor));
      return () => {
        cancelled = true;
      };
    }

    gl.setClearAlpha(1);
    const pmrem = new PMREMGenerator(gl);
    loadEnvironmentTexture(url, format)
      .then((texture) => {
        if (cancelled) return;
        releaseEnvironment();
        environmentTarget.current = pmrem.fromEquirectangular(texture);
        const applied = tuning.current;
        scene.environment = environmentTarget.current.texture;
        scene.environmentIntensity = applied.intensity;
        scene.environmentRotation.set(0, applied.rotation, 0);
        scene.background = texture;
        scene.backgroundBlurriness = applied.blur;
        scene.backgroundIntensity = Math.max(0, applied.intensity);
        scene.backgroundRotation.set(0, applied.rotation, 0);
        invalidate();
      })
      .catch(() => {
        if (cancelled) return;
        // A missing or unreadable HDRI renders the fallback, never a black void.
        scene.background = new Color(fallbackColor);
        scene.environment = null;
        scene.backgroundBlurriness = 0;
        scene.backgroundIntensity = 1;
        invalidate();
      })
      .finally(() => pmrem.dispose());

    return () => {
      cancelled = true;
      releaseEnvironment();
    };
    // Deliberately excludes intensity/blur/rotation: those are applied by the
    // tuning effect below, so dragging a slider never touches the loader.
  }, [color, fallbackColor, format, gl, invalidate, kind, scene, url]);

  // Live tuning without a re-decode.
  useEffect(() => {
    if (kind !== 'environment') return;
    scene.environmentIntensity = intensity;
    scene.environmentRotation.set(0, rotation, 0);
    scene.backgroundBlurriness = blur;
    scene.backgroundIntensity = Math.max(0, intensity);
    scene.backgroundRotation.set(0, rotation, 0);
    invalidate();
  }, [blur, intensity, invalidate, kind, rotation, scene]);

  return null;
}
