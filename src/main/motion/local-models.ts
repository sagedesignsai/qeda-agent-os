/**
 * main/motion/local-models.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pre-installed 3D model library. The catalog.json is generated at build time
 * by scripts/build-model-catalog.ts using @gltf-transform/core (NodeIO).
 * Each entry describes a GLB file in assets/models/ with rich metadata:
 * named nodes, materials, animations, skins, cameras, and more.
 *
 * Models are served from the app.asar bundle and staged into projects via
 * the standard asset pipeline — no network required.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { app } from 'electron';

export type MotionLocalModelEntry = {
  id: string;
  name: string;
  source: string;
  relativePath: string;
  byteSize: number;
  hasAnimations: boolean;
  animationCount: number;
  animationNames: string[];
  hasSkin: boolean;
  skinCount: number;
  boneCount: number;
  nodeCount: number;
  nodeNames: string[];
  meshCount: number;
  materialCount: number;
  materialNames: string[];
  cameraCount: number;
  textureCount: number;
  generator?: string;
  /** Scene AABB in model space (catalog builder), for fit-baking at staging. */
  boundsMin?: [number, number, number];
  boundsMax?: [number, number, number];
};

let _catalog: MotionLocalModelEntry[] | null = null;
let _modelsDirectory: string | null | undefined;

/**
 * Directory holding `catalog.json` and the GLB files next to it.
 *
 * Packaged: electron-builder copies `assets/**` into the app's resources folder.
 * Dev: the main bundle lives in `release/app/dist/main`, so the bundle directory
 * says nothing about where the repo root is — Electron's app path is the repo
 * root under electron-vite, with the process cwd as a last resort.
 */
function modelsDirectory(): string | null {
  if (_modelsDirectory !== undefined) return _modelsDirectory;

  const candidates: string[] = [];
  if (app?.isPackaged) candidates.push(join(process.resourcesPath, 'assets', 'models'));
  try {
    const appPath = app?.getAppPath?.();
    if (appPath) candidates.push(join(appPath, 'assets', 'models'));
  } catch {
    // Some Electron test doubles do not implement getAppPath().
  }
  candidates.push(join(process.cwd(), 'assets', 'models'));

  for (const directory of candidates) {
    if (existsSync(join(directory, 'catalog.json'))) return (_modelsDirectory = directory);
  }
  return (_modelsDirectory = null);
}

function loadCatalog(): MotionLocalModelEntry[] {
  if (_catalog) return _catalog;
  const directory = modelsDirectory();
  if (!directory) return (_catalog = []);

  try {
    const raw = readFileSync(join(directory, 'catalog.json'), 'utf8');
    const parsed = JSON.parse(raw) as { models: MotionLocalModelEntry[] };
    return (_catalog = parsed.models ?? []);
  } catch {
    return (_catalog = []);
  }
}

/** Return all pre-installed models, optionally filtered by query. */
export function listLocalModels(query?: string): MotionLocalModelEntry[] {
  const models = loadCatalog();
  if (!query) return models;
  const q = query.trim().toLowerCase();
  return models.filter(
    (m) => m.name.toLowerCase().includes(q) || m.source.toLowerCase().includes(q),
  );
}

/** Resolve a model id to its absolute path on disk. */
export function resolveLocalModelPath(modelId: string): string | null {
  const model = loadCatalog().find((m) => m.id === modelId);
  if (!model) return null;

  const directory = modelsDirectory();
  if (!directory) return null;

  const modelPath = join(directory, model.relativePath);
  try {
    // Preview requests hit this per range request, so stat instead of reading
    // the whole GLB just to prove it exists.
    if (!statSync(modelPath).isFile()) return null;
  } catch {
    return null;
  }
  return modelPath;
}
