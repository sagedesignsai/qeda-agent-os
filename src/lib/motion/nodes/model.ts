/**
 * lib/motion/nodes/model.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Imported 3D models. The prop set is what the renderer binds: `assetId` picks
 * the bundle, `castShadow`/`receiveShadow` walk the loaded meshes, and `opacity`
 * is applied by the frame binding. Surface bindings, material overrides, and
 * part overrides let users customize individual meshes inside the model.
 */

import { z } from 'zod';

import type { MotionNodeTypeDefinition, MotionPropertyHint } from './definition';

const surfaceBindingSchema = z.object({
  assetId: z.string().min(1),
  mode: z.enum(['replace', 'decal']),
  fit: z.enum(['contain', 'cover', 'stretch']).optional(),
  tint: z.string().optional(),
});

const materialOverrideSchema = z.object({
  color: z.string().optional(),
  roughness: z.number().min(0).max(1).optional(),
  metalness: z.number().min(0).max(1).optional(),
  emissive: z.string().optional(),
  emissiveIntensity: z.number().min(0).optional(),
});

const partOverrideSchema = z.object({
  visible: z.boolean().optional(),
  opacity: z.number().min(0).max(1).optional(),
  position: z.tuple([z.number(), z.number(), z.number()]).optional(),
  rotation: z.tuple([z.number(), z.number(), z.number()]).optional(),
  scale: z.union([z.number(), z.tuple([z.number(), z.number(), z.number()])]).optional(),
});

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
    surfaceBindings: z.record(z.string(), surfaceBindingSchema).optional(),
    materialOverrides: z.record(z.string(), materialOverrideSchema).optional(),
    partOverrides: z.record(z.string(), partOverrideSchema).optional(),
  }),
  defaultProps: {
    assetId: 'missing:model',
    missingAsset: true,
    opacity: 1,
    castShadow: true,
    receiveShadow: true,
    surfaceBindings: {},
    materialOverrides: {},
    partOverrides: {},
  },
  animatableProperties: { opacity: { description: 'Model opacity.' } },
  defaultName: '3D model',
  propertyHints: hints,
};
