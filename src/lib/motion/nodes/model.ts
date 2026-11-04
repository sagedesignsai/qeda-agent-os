/**
 * lib/motion/nodes/model.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Imported 3D models. The prop set is what the renderer binds: `assetId` picks
 * the bundle, `castShadow`/`receiveShadow` walk the loaded meshes, and `opacity`
 * is applied by the frame binding. Export preflight blocks a missing bundle.
 */

import { z } from 'zod';

import type { MotionNodeTypeDefinition, MotionPropertyHint } from './definition';

const hints: Record<string, MotionPropertyHint> = {
  assetId: { label: 'Model', control: 'asset', assetKind: 'model', group: 'Content' },
  opacity: { label: 'Opacity', control: 'slider', min: 0, max: 1, step: 0.01, group: 'Appearance' },
  castShadow: { label: 'Cast shadows', control: 'toggle', group: 'Shading' },
  receiveShadow: { label: 'Receive shadows', control: 'toggle', group: 'Shading' },
};

export const modelGltf: MotionNodeTypeDefinition = {
  id: 'model.gltf',
  label: '3D model',
  category: 'model',
  description: 'A bundled glTF or GLB model.',
  propsSchema: z.object({
    assetId: z.string().min(1),
    missingAsset: z.boolean().optional(),
    opacity: z.number().min(0).max(1),
    castShadow: z.boolean(),
    receiveShadow: z.boolean(),
  }),
  defaultProps: { assetId: 'missing:model', missingAsset: true, opacity: 1, castShadow: true, receiveShadow: true },
  animatableProperties: { opacity: { description: 'Model opacity.' } },
  defaultName: '3D model',
  propertyHints: hints,
};
