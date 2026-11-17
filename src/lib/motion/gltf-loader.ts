import type { DRACOLoader as DRACOLoaderType } from 'three/examples/jsm/loaders/DRACOLoader.js';
import type { GLTFLoader as GLTFLoaderType } from 'three/examples/jsm/loaders/GLTFLoader.js';

let dracoLoaderPromise: Promise<DRACOLoaderType> | null = null;

function getDracoLoader(): Promise<DRACOLoaderType> {
  dracoLoaderPromise ??= import('three/examples/jsm/loaders/DRACOLoader.js').then(({ DRACOLoader }) => {
    const loader = new DRACOLoader();
    loader.setDecoderPath(new URL('./draco/', window.location.href).toString());
    loader.setWorkerLimit(2);
    return loader;
  });
  return dracoLoaderPromise;
}

/** Create a GLTFLoader with the local Draco decoder used by bundled models. */
export async function createMotionGltfLoader(): Promise<GLTFLoaderType> {
  const [{ GLTFLoader }, dracoLoader] = await Promise.all([
    import('three/examples/jsm/loaders/GLTFLoader.js'),
    getDracoLoader(),
  ]);
  const loader = new GLTFLoader();
  loader.setDRACOLoader(dracoLoader);
  return loader;
}
