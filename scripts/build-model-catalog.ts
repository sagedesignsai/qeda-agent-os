/**
 * scripts/build-model-catalog.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Scans assets/models/ for GLB files and extracts rich metadata using
 * @gltf-transform/core (NodeIO). Each entry describes a GLB file with:
 * — Named nodes, materials, animations, cameras
 * — Skin/bone count, mesh count, texture count
 * — glTF generator and version info
 *
 * Uses @gltf-transform/core instead of manual GLB binary parsing or
 * gltfjsx's GLTFStructureLoader (which is incompatible with Three.js 0.186).
 *
 * Run: bun run scripts/build-model-catalog.ts
 */

import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, basename, relative } from 'node:path';

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

// Always run from the project root: `bun run scripts/build-model-catalog.ts`
const MODELS_DIR = join(process.cwd(), 'assets', 'models');
const OUTPUT = join(MODELS_DIR, 'catalog.json');

type ModelEntry = {
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
};

async function extractMetadata(path: string): Promise<Omit<ModelEntry, 'id' | 'name' | 'source' | 'relativePath' | 'byteSize'> & { error?: string }> {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  await io.init();

  try {
    const document = await io.read(path);
    const root = document.getRoot();

    const scenes = root.listScenes();
    const defaultScene = root.getDefaultScene();
    const animations = root.listAnimations();
    const skins = root.listSkins();
    const nodes = root.listNodes();
    const meshes = root.listMeshes();
    const materials = root.listMaterials();
    const cameras = root.listCameras();
    const textures = root.listTextures();
    const asset = root.getAsset();

    // Collect bone (joint) names from skins
    const boneNames = new Set<string>();
    for (const skin of skins) {
      for (const joint of skin.listJoints()) {
        const name = joint.getName();
        if (name) boneNames.add(name);
      }
    }

    // Collect named nodes (limit to first 50 to keep catalog size reasonable)
    const nodeNames: string[] = [];
    for (const node of nodes) {
      const name = node.getName();
      if (name) nodeNames.push(name);
      if (nodeNames.length >= 50) break;
    }

    // Collect named materials
    const materialNames: string[] = [];
    for (const mat of materials) {
      const name = mat.getName();
      if (name) materialNames.push(name);
    }

    // Collect named animations
    const animationNames: string[] = [];
    for (const anim of animations) {
      const name = anim.getName();
      if (name) animationNames.push(name);
    }

    return {
      hasAnimations: animations.length > 0,
      animationCount: animations.length,
      animationNames,
      hasSkin: skins.length > 0,
      skinCount: skins.length,
      boneCount: boneNames.size,
      nodeCount: nodes.length,
      nodeNames,
      meshCount: meshes.length,
      materialCount: materials.length,
      materialNames,
      cameraCount: cameras.length,
      textureCount: textures.length,
      generator: asset.generator || undefined,
    };
  } catch (error: any) {
    return {
      hasAnimations: false,
      animationCount: 0,
      animationNames: [],
      hasSkin: false,
      skinCount: 0,
      boneCount: 0,
      nodeCount: 0,
      nodeNames: [],
      meshCount: 0,
      materialCount: 0,
      materialNames: [],
      cameraCount: 0,
      textureCount: 0,
      error: error.message,
    };
  }
}

async function scanDirectory(dir: string, sourcePrefix: string): Promise<ModelEntry[]> {
  const entries: ModelEntry[] = [];
  const items = readdirSync(dir, { withFileTypes: true });

  for (const item of items) {
    const fullPath = join(dir, item.name);
    if (item.isDirectory()) {
      entries.push(...await scanDirectory(fullPath, sourcePrefix));
      continue;
    }
    if (!item.name.toLowerCase().endsWith('.glb')) continue;

    const stat = statSync(fullPath);
    const nameWithoutExt = basename(item.name, '.glb');
    const relativePath = relative(MODELS_DIR, fullPath);

    const meta = await extractMetadata(fullPath);

    entries.push({
      id: `local:${sourcePrefix}/${nameWithoutExt}`,
      name: nameWithoutExt,
      source: sourcePrefix,
      relativePath,
      byteSize: stat.size,
      ...meta,
    });
  }

  return entries;
}

// ── Main ──

async function main() {
  const models: ModelEntry[] = [];

  const items = readdirSync(MODELS_DIR, { withFileTypes: true });
  const hasDirs = items.some((e) => e.isDirectory());

  if (hasDirs) {
    const dirs = items.filter((e) => e.isDirectory());
    for (const dir of dirs) {
      models.push(...await scanDirectory(join(MODELS_DIR, dir.name), dir.name));
    }
  } else {
    models.push(...await scanDirectory(MODELS_DIR, 'local'));
  }

  // Sort by name for consistent output
  models.sort((a, b) => a.name.localeCompare(b.name));

  const catalog = {
    version: 2,
    generatedAt: new Date().toISOString(),
    count: models.length,
    models,
  };

  writeFileSync(OUTPUT, JSON.stringify(catalog, null, 2) + '\n');
  console.log(`✓ Wrote ${models.length} models to ${OUTPUT}`);
  console.log(`  Animated: ${models.filter((m) => m.hasAnimations).length}`);
  console.log(`  Skinned: ${models.filter((m) => m.hasSkin).length}`);
  console.log(`  With cameras: ${models.filter((m) => m.cameraCount > 0).length}`);
  const errors = models.filter((m) => (m as any).error);
  if (errors.length) {
    console.log(`  Errors: ${errors.length}`);
    for (const e of errors) {
      console.log(`    - ${e.name}: ${(e as any).error}`);
    }
  }
}

main().catch((err) => {
  console.error('Failed to build catalog:', err);
  process.exit(1);
});
