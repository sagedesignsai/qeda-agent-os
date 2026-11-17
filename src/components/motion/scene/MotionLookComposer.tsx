/**
 * components/motion/scene/MotionLookComposer.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The look pipeline's renderer side.
 *
 * Document → `resolveLookStack` → one `EffectPass`. The stack is authored as
 * scene nodes, so this component is pure plumbing: it keeps effect instances
 * alive while their node ids stay stable, syncs uniforms every frame, and calls
 * `composer.render()` because R3F stops auto-rendering once any `useFrame` has
 * priority > 0.
 *
 * One composer serves preview and export. Both mount this same component through
 * `MotionSceneCanvas`, so "what you approved" is literally the same pass chain.
 */

import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  DepthOfFieldEffect,
  EffectComposer,
  EffectPass,
  RenderPass,
} from 'postprocessing';
import { HalfFloatType, Vector2 } from 'three';

import {
  createLookEffect,
  type LookEffectInstance,
} from '@/components/motion/scene/motion-look-effects';
import type { MotionCameraRigSnapshot } from '@/components/motion/scene/camera-pose';
import { lookStackKey, resolveLookStack } from '@/lib/motion/look';
import type { MotionDocument } from '@/lib/motion/types';
import type { PlaybackClock } from '@/lib/timeline/clock';

type ComposerBundle = {
  key: string;
  composer: EffectComposer;
  instances: LookEffectInstance[];
  dof: DepthOfFieldEffect | null;
};

function disposeBundle({ composer }: ComposerBundle): void {
  // The composer owns its passes, and each EffectPass owns its effects.
  composer.dispose();
}

function rigOf(camera: unknown): MotionCameraRigSnapshot | null {
  if (!camera || typeof camera !== 'object') return null;
  const snapshot = (camera as { userData?: { motionRig?: MotionCameraRigSnapshot } }).userData
    ?.motionRig;
  return snapshot ?? null;
}

function bokehScaleForAperture(aperture: unknown): number {
  const value = typeof aperture === 'number' && Number.isFinite(aperture) ? aperture : 2.8;
  return Math.min(4, Math.max(0.5, 6 / Math.max(0.5, value)));
}

function numberProp(
  node: MotionCameraRigSnapshot['node'],
  key: string,
  fallback: number,
): number {
  const value = node?.props[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function MotionLookComposer({
  doc,
  clock,
}: {
  doc: MotionDocument;
  clock: PlaybackClock;
}) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const bundle = useRef<ComposerBundle | null>(null);
  const drawingSize = useRef(new Vector2());
  const logicalSize = useRef(new Vector2());
  const lastSize = useRef({ width: 0, height: 0 });

  useEffect(
    () => () => {
      if (bundle.current) {
        disposeBundle(bundle.current);
        bundle.current = null;
      }
      // R3F's auto-renderer expects to clear; the composer disables it while it
      // owns the frame. Restoring the flag keeps the no-look path unchanged.
      gl.autoClear = true;
    },
    [gl],
  );

  useFrame((_state, delta) => {
    const time = clock.getTime();
    const activeScene =
      doc.scenes.find((candidate) => candidate.id === doc.activeSceneId) ?? doc.scenes[0];
    const looks = resolveLookStack(activeScene, time);
    const rig = rigOf(camera);
    const dofEnabled = Boolean(rig?.node && rig.node.props.dofEnabled);

    // EffectComposer allocates its render targets in drawing-buffer pixels in
    // its constructor, so do not create it while the canvas is still at 0×0.
    // Its setSize API takes logical renderer dimensions and applies the DPR
    // itself; passing getDrawingBufferSize() here would multiply the DPR twice.
    gl.getSize(logicalSize.current);
    const { width, height } = gl.getDrawingBufferSize(drawingSize.current);
    if (
      logicalSize.current.x <= 0 || logicalSize.current.y <= 0 ||
      width <= 0 || height <= 0
    ) return;

    // Structure, not parameters: adding/removing an effect or toggling DOF
    // recompiles the pass; animating intensity must not.
    const key = `${lookStackKey(looks)}::${dofEnabled ? rig?.node?.id ?? '' : ''}`;

    if (!bundle.current || bundle.current.key !== key) {
      if (bundle.current) disposeBundle(bundle.current);

      const composer = new EffectComposer(gl, {
        // Two samples in the offscreen target preserve edge quality without
        // the large memory and fill-rate cost of 4× MSAA at editor DPRs.
        multisampling: gl.capabilities.isWebGL2 ? 2 : 0,
        frameBufferType: HalfFloatType,
      });
      composer.addPass(new RenderPass(scene, camera));

      const instances = looks.map((look) => createLookEffect(look.kind));
      const dof = dofEnabled && rig?.node ? new DepthOfFieldEffect(camera) : null;

      // DOF first: it wants a pristine depth pass, and everything after it is a
      // colour operation. Bloom, grade, chroma, vignette, grain, letterbox keep
      // the fixed order `resolveLookStack` guarantees.
      const effects = [...(dof ? [dof] : []), ...instances.map((instance) => instance.effect)];
      if (effects.length > 0) composer.addPass(new EffectPass(camera, ...effects));

      lastSize.current = { width: 0, height: 0 };
      bundle.current = { key, composer, instances, dof };
    }

    const active = bundle.current;
    if (active && (width !== lastSize.current.width || height !== lastSize.current.height)) {
      // EffectComposer.setSize expects logical pixels; it queries the renderer
      // drawing buffer internally and applies its pixel ratio exactly once.
      active.composer.setSize(logicalSize.current.x, logicalSize.current.y);
      lastSize.current = { width, height };
    }
    if (!active) return;

    if (active.dof && rig?.node) {
      const focusRange = Math.max(0.05, numberProp(rig.node, 'focusRange', 2));
      active.dof.cocMaterial.focusDistance = Math.max(0.01, rig.focusDistance);
      active.dof.cocMaterial.focusRange = focusRange;
      active.dof.bokehScale = bokehScaleForAperture(rig.node.props.aperture);
    }

    const frame = { frameAspect: height > 0 ? width / height : 16 / 9 };
    for (let index = 0; index < active.instances.length; index += 1) {
      active.instances[index].sync(looks[index].params.props, frame);
    }

    // The composer is the only render call this frame: R3F sees a manual
    // priority and skips its own render, so this must run unconditionally.
    active.composer.render(delta);
  }, 1);

  return null;
}
