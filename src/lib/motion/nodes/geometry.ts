/**
 * lib/motion/nodes/geometry.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Device frames. All four kinds share one shell schema and one renderer, and
 * differ only in their default dimensions — a phone is not a special code path.
 */

import { z } from 'zod';

import type { MotionNodeTypeDefinition, MotionPropertyHint } from './definition';

const deviceSchema = z.object({
  width: z.number().positive(),
  height: z.number().positive(),
  depth: z.number().positive(),
  bezel: z.number().nonnegative(),
  opacity: z.number().min(0).max(1),
  // Shell material: previously hardcoded in the renderer.
  color: z.string().min(1).default('#252a34'),
  metalness: z.number().min(0).max(1).default(0.82),
  roughness: z.number().min(0).max(1).default(0.24),
  powerRing: z.boolean().default(true),
});

const deviceHints: Record<string, MotionPropertyHint> = {
  width: { label: 'Width', control: 'number', min: 0.1, step: 0.01, group: 'Dimensions' },
  height: { label: 'Height', control: 'number', min: 0.1, step: 0.01, group: 'Dimensions' },
  depth: { label: 'Depth', control: 'number', min: 0.01, step: 0.01, group: 'Dimensions' },
  bezel: { label: 'Bezel', control: 'number', min: 0, step: 0.01, group: 'Dimensions' },
  color: { label: 'Shell color', control: 'color', group: 'Material' },
  metalness: { label: 'Metalness', control: 'slider', min: 0, max: 1, step: 0.01, group: 'Material' },
  roughness: { label: 'Roughness', control: 'slider', min: 0, max: 1, step: 0.01, group: 'Material' },
  powerRing: { label: 'Power ring', control: 'toggle', group: 'Appearance' },
  opacity: { label: 'Opacity', control: 'slider', min: 0, max: 1, step: 0.01, group: 'Appearance' },
};

const DEVICES = [
  { id: 'device.tablet', label: 'Tablet', size: { width: 3.82, height: 2.42, depth: 0.15, bezel: 0.18 } },
  { id: 'device.phone', label: 'Phone', size: { width: 1.25, height: 2.55, depth: 0.11, bezel: 0.09 } },
  { id: 'device.laptop', label: 'Laptop', size: { width: 3.3, height: 2.1, depth: 0.16, bezel: 0.12 } },
  { id: 'device.monitor', label: 'Monitor', size: { width: 3.7, height: 2.3, depth: 0.13, bezel: 0.1 } },
] as const;

export const deviceNodes: readonly MotionNodeTypeDefinition[] = DEVICES.map((device) => ({
  id: device.id,
  label: device.label,
  category: 'geometry',
  description: `A ${device.label.toLowerCase()} frame for a product scene.`,
  propsSchema: deviceSchema,
  defaultProps: { ...device.size, opacity: 1, color: '#252a34', metalness: 0.82, roughness: 0.24, powerRing: true },
  animatableProperties: { opacity: { description: 'Device opacity.' } },
  defaultName: device.label,
  propertyHints: deviceHints,
}));
