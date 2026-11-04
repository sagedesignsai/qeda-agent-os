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

export const stagePedestal: MotionNodeTypeDefinition = {
  id: 'stage.pedestal',
  label: 'Pedestal',
  category: 'stage',
  description: 'A display plinth whose top surface sits on the node origin.',
  propsSchema: z.object({
    radius: z.number().positive(),
    height: z.number().positive(),
    color: z.string().min(1),
    accentColor: z.string().min(1),
    roughness: z.number().min(0).max(1),
    metalness: z.number().min(0).max(1),
    opacity: z.number().min(0).max(1),
  }),
  defaultProps: {
    radius: 1.4,
    height: 0.5,
    color: '#1b212c',
    accentColor: '#5885f7',
    roughness: 0.32,
    metalness: 0.18,
    opacity: 1,
  },
  animatableProperties: { opacity: { description: 'Pedestal opacity.' } },
  defaultName: 'Pedestal',
  propertyHints: {
    radius: { label: 'Radius', control: 'number', min: 0.1, step: 0.01, group: 'Dimensions' },
    height: { label: 'Height', control: 'number', min: 0.05, step: 0.01, group: 'Dimensions' },
    color: { label: 'Body color', control: 'color', group: 'Material' },
    accentColor: { label: 'Edge accent', control: 'color', group: 'Material' },
    roughness: { label: 'Roughness', control: 'slider', min: 0, max: 1, step: 0.01, group: 'Material' },
    metalness: { label: 'Metalness', control: 'slider', min: 0, max: 1, step: 0.01, group: 'Material' },
    opacity: { label: 'Opacity', control: 'slider', min: 0, max: 1, step: 0.01, group: 'Appearance' },
  },
};

export const stageBackdrop: MotionNodeTypeDefinition = {
  id: 'stage.backdrop',
  label: 'Gradient backdrop',
  category: 'stage',
  description: 'A full-frame vertical gradient wall for product and UI scenes.',
  propsSchema: z.object({
    width: z.number().positive(),
    height: z.number().positive(),
    topColor: z.string().min(1),
    bottomColor: z.string().min(1),
  }),
  defaultProps: {
    width: 26,
    height: 15,
    topColor: '#1b2440',
    bottomColor: '#070a12',
  },
  animatableProperties: {},
  defaultName: 'Backdrop',
  defaultTransform: { position: [0, 0, -3] },
  propertyHints: {
    width: { label: 'Width', control: 'number', min: 1, step: 0.5, group: 'Dimensions' },
    height: { label: 'Height', control: 'number', min: 1, step: 0.5, group: 'Dimensions' },
    topColor: { label: 'Top color', control: 'color', group: 'Surface' },
    bottomColor: { label: 'Bottom color', control: 'color', group: 'Surface' },
  },
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
