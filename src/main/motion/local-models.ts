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

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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

function loadCatalog(): MotionLocalModelEntry[] {
  if (_catalog) return _catalog;

  // In production, assets/ is bundled in the app.asar.
  // In dev, resolve relative to the source root.
  let catalogPath: string | null = null;

  // Try the release path first (production)
  try {
    catalogPath = join(process.resourcesPath, 'assets', 'models', 'catalog.json');
    readFileSync(catalogPath, 'utf8');
  } catch {
    // Fall back to dev path
    try {
      catalogPath = join(__dirname, '..', '..', '..', 'assets', 'models', 'catalog.json');
      readFileSync(catalogPath, 'utf8');
    } catch {
      // If neither works, return empty
      return (_catalog = []);
    }
  }

  try {
    const raw = readFileSync(catalogPath!, 'utf8');
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

  let basePath: string | null = null;
  try {
    basePath = join(process.resourcesPath, 'assets', 'models');
    readFileSync(join(basePath, model.relativePath));
  } catch {
    try {
      basePath = join(__dirname, '..', '..', '..', 'assets', 'models');
      readFileSync(join(basePath, model.relativePath));
    } catch {
      return null;
    }
  }

  return join(basePath!, model.relativePath);
}
