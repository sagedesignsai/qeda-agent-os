/**
 * lib/motion/nodes/shapes.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Solid surfaces. Both kinds share one renderer; the ellipse simply ignores
 * `cornerRadius`, which is why that control is not hinted for it.
 */

import { z } from 'zod';

import type { MotionNodeTypeDefinition, MotionPropertyHint } from './definition';

const shapeSchema = z.object({
  width: z.number().positive(),
  height: z.number().positive(),
  color: z.string().min(1),
  cornerRadius: z.number().nonnegative(),
  opacity: z.number().min(0).max(1),
});

const baseHints: Record<string, MotionPropertyHint> = {
  width: { label: 'Width', control: 'number', min: 0.01, step: 0.01, group: 'Dimensions' },
  height: { label: 'Height', control: 'number', min: 0.01, step: 0.01, group: 'Dimensions' },
  color: { label: 'Color', control: 'color', group: 'Appearance' },
  opacity: { label: 'Opacity', control: 'slider', min: 0, max: 1, step: 0.01, group: 'Appearance' },
};

const animatableProperties = { opacity: { description: 'Shape opacity.' } };

export const shapeRect: MotionNodeTypeDefinition = {
  id: 'shape.rect',
  label: 'Rectangle',
  category: 'surface',
  description: 'A solid rectangle surface.',
  propsSchema: shapeSchema,
  defaultProps: { width: 1, height: 1, color: '#5885f7', cornerRadius: 0.06, opacity: 1 },
  animatableProperties,
  defaultName: 'Rectangle',
  propertyHints: {
    ...baseHints,
    cornerRadius: { label: 'Corner radius', control: 'number', min: 0, step: 0.01, group: 'Appearance' },
  },
};

export const shapeEllipse: MotionNodeTypeDefinition = {
  id: 'shape.ellipse',
  label: 'Ellipse',
  category: 'surface',
  description: 'A solid ellipse surface.',
  propsSchema: shapeSchema,
  defaultProps: { width: 1, height: 1, color: '#5885f7', cornerRadius: 1, opacity: 1 },
  animatableProperties,
  defaultName: 'Ellipse',
  propertyHints: baseHints,
};
