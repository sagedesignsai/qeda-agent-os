/**
 * lib/motion/nodes/definition.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The contract every node primitive implements: one Zod prop schema, defaults,
 * animatable paths, and inspector hints.
 *
 * This lives apart from `node-registry.ts` so that the per-category definition
 * modules in `nodes/*` can be imported by the registry without a cycle: the
 * registry imports definitions, definitions import only this file.
 */

import { z } from 'zod';

import type { MotionAssetKind, MotionNodeTransform } from '../types';

export const motionVector3Schema = z.tuple([z.number(), z.number(), z.number()]);

export type MotionNodeCategory =
  | 'scene'
  | 'camera'
  | 'geometry'
  | 'product'
  | 'surface'
  | 'ui'
  | 'lighting'
  | 'model'
  | 'stage';

/**
 * Declarative inspector metadata. The inspector renders `propertyHints` in
 * `group` order and derives each control from `control`; a prop without a hint
 * is deliberately not editable, so every user-facing prop must carry one.
 */
export type MotionPropertyHint = {
  label?: string;
  control?: 'text' | 'textarea' | 'number' | 'slider' | 'color' | 'vector3' | 'asset' | 'select' | 'segmented' | 'toggle';
  min?: number;
  max?: number;
  step?: number;
  group?: string;
  assetKind?: MotionAssetKind;
  /** The prop may be absent, so the asset picker offers an explicit "No asset". */
  optional?: boolean;
  options?: Array<{ value: string; label: string }>;
};

export type MotionNodeTypeDefinition = {
  id: string;
  label: string;
  category: MotionNodeCategory;
  description: string;
  propsSchema: z.ZodType<Record<string, unknown>>;
  defaultProps: Record<string, unknown>;
  animatableProperties: Readonly<Record<string, { description: string }>>;
  defaultTransform?: Partial<MotionNodeTransform>;
  defaultName: string;
  allowedParents?: readonly string[];
  propertyHints?: Readonly<Record<string, MotionPropertyHint>>;
};

export type MotionNodeTypeDescription = Pick<
  MotionNodeTypeDefinition,
  'id' | 'label' | 'category' | 'description' | 'animatableProperties'
> & {
  defaultProps: Record<string, unknown>;
  defaultTransform?: Partial<MotionNodeTransform>;
  properties: Record<string, unknown>;
  allowedParents?: readonly string[];
  propertyHints?: Readonly<Record<string, MotionPropertyHint>>;
};
