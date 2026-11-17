/**
 * components/motion/assets/MotionModelPreview.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Small R3F viewport for the asset dialog. It loads one GLB from a
 * `qeda-media://` URL, frames it with an orbit camera, and never touches the
 * document — previewing must stay free of project state.
 */

import { OrbitControls } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { useEffect, useState } from 'react';
import { Box3, PerspectiveCamera, Sphere, SRGBColorSpace, Vector3 } from 'three';
import type { Group, Object3D } from 'three';

function useGltfScene(url: string) {
  const [scene, setScene] = useState<Group | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setScene(null);
    setError(null);
    // Same loader the document renderer uses; the catalog ships uncompressed
    // GLBs, so no decoder wiring is needed here.
    void import('three/examples/jsm/loaders/GLTFLoader.js').then(({ GLTFLoader }) => {
      new GLTFLoader().load(
        url,
        (gltf) => {
          if (!cancelled) setScene(gltf.scene);
        },
        undefined,
        (cause) => {
          if (!cancelled) {
            setError(cause instanceof Error ? cause.message : 'The model could not be loaded.');
          }
        },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return { scene, error };
}

/** Frame the loaded model once, then hand the camera to OrbitControls. */
function FrameModel({ object }: { object: Object3D }) {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as
    | { target?: Vector3; update?: () => void }
    | null;

  useEffect(() => {
    if (!(camera instanceof PerspectiveCamera)) return;
    const bounds = new Box3().setFromObject(object);
    if (bounds.isEmpty()) return;
    const sphere = bounds.getBoundingSphere(new Sphere());
    const radius = Math.max(sphere.radius, 0.01);
    const halfFov = (camera.fov * Math.PI) / 360;
    const distance = (radius / Math.sin(halfFov)) * 1.05;
    const direction = new Vector3(0.9, 0.55, 1).normalize();

    camera.position.copy(sphere.center).addScaledVector(direction, distance);
    camera.near = Math.max(distance / 1000, 0.001);
    camera.far = distance + radius * 20;
    camera.updateProjectionMatrix();
    camera.lookAt(sphere.center);
    controls?.target?.copy(sphere.center);
    controls?.update?.();
  }, [camera, controls, object]);

  return null;
}

export function MotionModelPreview({ url, label }: { url: string; label?: string }) {
  const { scene, error } = useGltfScene(url);

  return (
    <div className="relative h-full w-full">
      <Canvas
        aria-label={label ? `${label} 3D preview` : 'Model preview'}
        camera={{ position: [2.6, 1.8, 3.2], fov: 42, near: 0.01, far: 500 }}
        dpr={1.75}
        gl={{ antialias: true, alpha: true }}
        onCreated={({ gl }) => {
          gl.outputColorSpace = SRGBColorSpace;
        }}
        fallback={
          <div className="flex h-full items-center justify-center px-6 text-center text-xs text-muted-foreground">
            WebGL is unavailable, so this model cannot be previewed.
          </div>
        }
      >
        <ambientLight intensity={1.3} />
        <hemisphereLight intensity={0.6} color="#e3ebff" groundColor="#10131b" />
        <directionalLight position={[4, 6, 3]} intensity={2.2} />
        <directionalLight position={[-4, 2, -4]} intensity={0.7} color="#8fb2ff" />
        {scene && (
          <>
            <primitive object={scene} />
            <FrameModel object={scene} />
          </>
        )}
        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.09}
          minDistance={0.02}
          maxDistance={400}
        />
      </Canvas>

      {error ? (
        <div className="absolute inset-0 flex items-center justify-center bg-background/60 px-6 text-center text-xs text-destructive">
          {error}
        </div>
      ) : !scene ? (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
          Loading model…
        </div>
      ) : null}
    </div>
  );
}
