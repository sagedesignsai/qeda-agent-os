/**
 * lib/motion/nodes/camera.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Camera primitives. The lens is described by its own props rather than by the
 * node transform, so the viewport and the export renderer can share one frame
 * binding (`motion-frame-binding.ts`) and stay frame-exact.
 */

import { z } from 'zod';

import type { MotionNodeTypeDefinition, MotionPropertyHint } from './definition';

const hints: Record<string, MotionPropertyHint> = {
  fov: { label: 'Field of view', control: 'slider', min: 1, max: 179, step: 1, group: 'Lens' },
  near: { label: 'Near clip', control: 'number', min: 0.001, step: 0.01, group: 'Lens' },
  far: { label: 'Far clip', control: 'number', min: 0.01, step: 1, group: 'Lens' },
  zoom: { label: 'Zoom', control: 'slider', min: 0.1, max: 4, step: 0.01, group: 'Lens' },
};

export const cameraPerspective: MotionNodeTypeDefinition = {
  id: 'camera.perspective',
  label: 'Perspective camera',
  category: 'camera',
  description: 'A perspective camera that frames the scene.',
  propsSchema: z.object({
    fov: z.number().min(1).max(179),
    near: z.number().positive(),
    far: z.number().positive(),
    zoom: z.number().positive().default(1),
  }),
  defaultProps: { fov: 34, near: 0.1, far: 60, zoom: 1 },
  defaultTransform: { position: [3.7, 2.7, 5.1] },
  animatableProperties: {
    fov: { description: 'Vertical field of view in degrees.' },
    zoom: { description: 'Camera zoom multiplier applied on top of the lens.' },
  },
  defaultName: 'Camera',
  propertyHints: hints,
};
