/**
 * lib/motion/nodes/lighting.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Light primitives. Each kind exposes exactly the controls its Three.js light
 * supports (shadow map for the key light, attenuation for the point light) so
 * no hint advertises behaviour the renderer cannot produce.
 */

import { z } from 'zod';

import type { MotionNodeTypeDefinition, MotionPropertyHint } from './definition';

const lightHints: Record<string, MotionPropertyHint> = {
  intensity: { label: 'Intensity', control: 'slider', min: 0, max: 10, step: 0.1, group: 'Light' },
  color: { label: 'Color', control: 'color', group: 'Light' },
};

export const lightAmbient: MotionNodeTypeDefinition = {
  id: 'light.ambient',
  label: 'Ambient light',
  category: 'lighting',
  description: 'Uniform non-directional scene illumination.',
  propsSchema: z.object({ intensity: z.number().min(0), color: z.string().min(1) }),
  defaultProps: { intensity: 1.2, color: '#ffffff' },
  animatableProperties: { intensity: { description: 'Light intensity.' } },
  defaultName: 'Ambient light',
  propertyHints: lightHints,
};

export const lightDirectional: MotionNodeTypeDefinition = {
  id: 'light.directional',
  label: 'Directional light',
  category: 'lighting',
  description: 'A directional key light for device shading and shadows.',
  propsSchema: z.object({
    intensity: z.number().min(0),
    color: z.string().min(1),
    castShadow: z.boolean(),
    shadowMapSize: z.number().int().min(256).max(4096).default(1024),
  }),
  defaultProps: { intensity: 2.2, color: '#ffffff', castShadow: true, shadowMapSize: 1024 },
  defaultTransform: { position: [-3.5, 5, 5] },
  animatableProperties: { intensity: { description: 'Light intensity.' } },
  defaultName: 'Key light',
  propertyHints: {
    ...lightHints,
    castShadow: { label: 'Cast shadows', control: 'toggle', group: 'Shadow' },
    shadowMapSize: {
      label: 'Shadow map size',
      control: 'slider',
      min: 256,
      max: 4096,
      step: 256,
      group: 'Shadow',
    },
  },
};

export const lightPoint: MotionNodeTypeDefinition = {
  id: 'light.point',
  label: 'Point light',
  category: 'lighting',
  description: 'An omnidirectional accent light placed in the scene.',
  propsSchema: z.object({
    intensity: z.number().min(0),
    color: z.string().min(1),
    distance: z.number().nonnegative().default(0),
    decay: z.number().min(0).max(4).default(2),
  }),
  defaultProps: { intensity: 2, color: '#6b8fff', distance: 0, decay: 2 },
  defaultTransform: { position: [4, 1.5, -2] },
  animatableProperties: { intensity: { description: 'Light intensity.' } },
  defaultName: 'Accent light',
  propertyHints: {
    ...lightHints,
    distance: { label: 'Range', control: 'number', min: 0, step: 0.5, group: 'Attenuation' },
    decay: { label: 'Falloff', control: 'slider', min: 0, max: 4, step: 0.1, group: 'Attenuation' },
  },
};
