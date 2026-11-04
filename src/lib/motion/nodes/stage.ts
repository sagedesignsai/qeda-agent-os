/**
 * lib/motion/nodes/stage.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Stage primitives. The ground is document content (it exports); the editor's
 * grid and floor chrome live in `MotionSceneCanvas` and never appear in output.
 */

import { z } from 'zod';

import type { MotionNodeTypeDefinition, MotionPropertyHint } from './definition';

const hints: Record<string, MotionPropertyHint> = {
  size: { label: 'Size', control: 'number', min: 1, step: 1, group: 'Surface' },
  color: { label: 'Color', control: 'color', group: 'Surface' },
  roughness: { label: 'Roughness', control: 'slider', min: 0, max: 1, step: 0.01, group: 'Material' },
  metalness: { label: 'Metalness', control: 'slider', min: 0, max: 1, step: 0.01, group: 'Material' },
  opacity: { label: 'Opacity', control: 'slider', min: 0, max: 1, step: 0.01, group: 'Material' },
  shadow: { label: 'Receive shadow', control: 'toggle', group: 'Material' },
};

export const stageGround: MotionNodeTypeDefinition = {
  id: 'stage.ground',
  label: 'Ground',
  category: 'stage',
  description: 'A renderable ground plane beneath scene content.',
  propsSchema: z.object({
    size: z.number().positive(),
    color: z.string().min(1),
    roughness: z.number().min(0).max(1),
    metalness: z.number().min(0).max(1),
    opacity: z.number().min(0).max(1),
    shadow: z.boolean(),
  }),
  defaultProps: { size: 20, color: '#171b24', roughness: 0.72, metalness: 0.08, opacity: 1, shadow: true },
  animatableProperties: {},
  defaultName: 'Ground',
  defaultTransform: { position: [0, -1.5, 0] },
  propertyHints: hints,
};
