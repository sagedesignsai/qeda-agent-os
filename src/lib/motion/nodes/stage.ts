/**
 * lib/motion/nodes/stage.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Stage primitives. The ground is document content (it exports); the editor's
 * grid and floor chrome live in `MotionSceneCanvas` and never appear in output.
 *
 * `stage.backdrop` carries three modes so one node covers the common looks:
 * a gradient sweep, a flat image wall, and a panoramic (equirectangular)
 * surround. The world-level HDRI lives on the scene instead (`scene.background`)
 * because a surround is not something you keyframe — see lib/motion/environment.
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
  label: 'Backdrop',
  category: 'stage',
  description:
    'A backdrop wall: a vertical gradient sweep, a flat image, or a panoramic surround.',
  propsSchema: z.object({
    mode: z.enum(['gradient', 'image', 'pano']),
    width: z.number().positive(),
    height: z.number().positive(),
    topColor: z.string().min(1),
    bottomColor: z.string().min(1),
    assetId: z.string().min(1).optional(),
    brightness: z.number().min(0).max(2),
    radius: z.number().positive(),
  }),
  defaultProps: {
    mode: 'gradient',
    width: 26,
    height: 15,
    topColor: '#1b2440',
    bottomColor: '#070a12',
    brightness: 1,
    radius: 18,
  },
  animatableProperties: {},
  defaultName: 'Backdrop',
  defaultTransform: { position: [0, 0, -3] },
  propertyHints: {
    mode: {
      label: 'Mode',
      control: 'segmented',
      group: 'Backdrop',
      options: [
        { value: 'gradient', label: 'Gradient' },
        { value: 'image', label: 'Image' },
        { value: 'pano', label: 'Panorama' },
      ],
    },
    assetId: {
      label: 'Backdrop media',
      control: 'asset',
      assetKind: 'image',
      optional: true,
      group: 'Backdrop',
    },
    brightness: { label: 'Brightness', control: 'slider', min: 0, max: 2, step: 0.05, group: 'Backdrop' },
    radius: { label: 'Surround radius', control: 'number', min: 2, step: 1, group: 'Backdrop' },
    width: { label: 'Width', control: 'number', min: 1, step: 0.5, group: 'Dimensions' },
    height: { label: 'Height', control: 'number', min: 1, step: 0.5, group: 'Dimensions' },
    topColor: { label: 'Top color', control: 'color', group: 'Surface' },
    bottomColor: { label: 'Bottom color', control: 'color', group: 'Surface' },
  },
};

export const stageCyclorama: MotionNodeTypeDefinition = {
  id: 'stage.cyclorama',
  label: 'Cyclorama',
  category: 'stage',
  description:
    'An infinite-sweep cove: floor curving into a back wall with no visible horizon line — the product-shot workhorse.',
  propsSchema: z.object({
    width: z.number().positive(),
    height: z.number().positive(),
    depth: z.number().positive(),
    radius: z.number().positive(),
    color: z.string().min(1),
    roughness: z.number().min(0).max(1),
    metalness: z.number().min(0).max(1),
    shadow: z.boolean(),
  }),
  defaultProps: {
    width: 22,
    height: 9,
    depth: 14,
    radius: 1.8,
    color: '#1a1f2a',
    roughness: 0.78,
    metalness: 0.04,
    shadow: true,
  },
  animatableProperties: {},
  defaultName: 'Cyclorama',
  defaultTransform: { position: [0, -1.5, 0] },
  propertyHints: {
    width: { label: 'Width', control: 'number', min: 2, step: 0.5, group: 'Dimensions' },
    height: { label: 'Wall height', control: 'number', min: 1, step: 0.5, group: 'Dimensions' },
    depth: { label: 'Floor depth', control: 'number', min: 2, step: 0.5, group: 'Dimensions' },
    radius: { label: 'Cove radius', control: 'slider', min: 0.2, max: 6, step: 0.05, group: 'Dimensions' },
    color: { label: 'Color', control: 'color', group: 'Surface' },
    roughness: hints.roughness,
    metalness: hints.metalness,
    shadow: hints.shadow,
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

export const stageGrid: MotionNodeTypeDefinition = {
  id: 'stage.grid',
  label: 'Grid',
  category: 'stage',
  description: 'A neon grid floor.',
  propsSchema: z.object({
    size: z.number().positive(),
    divisions: z.number().int().min(2).max(200),
    color: z.string().min(1),
    accentColor: z.string().min(1),
    opacity: z.number().min(0).max(1),
  }),
  defaultProps: { size: 20, divisions: 20, color: '#1b2230', accentColor: '#5885f7', opacity: 0.6 },
  animatableProperties: { opacity: { description: 'Grid opacity.' } },
  defaultName: 'Grid',
  defaultTransform: { position: [0, -1.5, 0] },
  propertyHints: {
    size: { label: 'Size', control: 'number', min: 1, step: 1, group: 'Surface' },
    divisions: { label: 'Divisions', control: 'number', min: 2, max: 200, step: 1, group: 'Surface' },
    color: { label: 'Color', control: 'color', group: 'Surface' },
    accentColor: { label: 'Accent', control: 'color', group: 'Surface' },
    opacity: { label: 'Opacity', control: 'slider', min: 0, max: 1, step: 0.01, group: 'Appearance' },
  },
};

export const stageParticles: MotionNodeTypeDefinition = {
  id: 'stage.particles',
  label: 'Particles',
  category: 'stage',
  description: 'A seeded particle field.',
  propsSchema: z.object({
    count: z.number().int().min(1).max(2000),
    radius: z.number().positive(),
    size: z.number().positive(),
    color: z.string().min(1),
    seed: z.number().int().min(0),
    opacity: z.number().min(0).max(1),
  }),
  defaultProps: { count: 400, radius: 4, size: 0.02, color: '#ffffff', seed: 1, opacity: 0.8 },
  animatableProperties: { opacity: { description: 'Particles opacity.' } },
  defaultName: 'Particles',
  propertyHints: {
    count: { label: 'Count', control: 'number', min: 1, max: 2000, step: 1, group: 'Field' },
    radius: { label: 'Radius', control: 'number', min: 0.5, step: 0.5, group: 'Field' },
    size: { label: 'Size', control: 'number', min: 0.005, step: 0.005, group: 'Field' },
    color: { label: 'Color', control: 'color', group: 'Appearance' },
    seed: { label: 'Seed', control: 'number', min: 0, step: 1, group: 'Field' },
    opacity: { label: 'Opacity', control: 'slider', min: 0, max: 1, step: 0.01, group: 'Appearance' },
  },
};

export const stageContactShadow: MotionNodeTypeDefinition = {
  id: 'stage.contact-shadow',
  label: 'Contact shadow',
  category: 'stage',
  description:
    'A baked elliptical shadow that grounds a product without shadow-map cost. Place it just above a floor or pedestal.',
  propsSchema: z.object({
    width: z.number().positive(),
    depth: z.number().positive(),
    color: z.string().min(1),
    opacity: z.number().min(0).max(1),
    softness: z.number().min(0).max(1),
  }),
  defaultProps: { width: 2.6, depth: 2.6, color: '#000000', opacity: 0.55, softness: 0.6 },
  animatableProperties: { opacity: { description: 'Shadow opacity.' } },
  defaultName: 'Contact shadow',
  defaultTransform: { position: [0, 0.002, 0] },
  propertyHints: {
    width: { label: 'Width', control: 'number', min: 0.1, step: 0.05, group: 'Shape' },
    depth: { label: 'Depth', control: 'number', min: 0.1, step: 0.05, group: 'Shape' },
    softness: { label: 'Softness', control: 'slider', min: 0, max: 1, step: 0.01, group: 'Shape' },
    color: { label: 'Color', control: 'color', group: 'Appearance' },
    opacity: { label: 'Opacity', control: 'slider', min: 0, max: 1, step: 0.01, group: 'Appearance' },
  },
};

export const stageFog: MotionNodeTypeDefinition = {
  id: 'stage.fog',
  label: 'Atmosphere',
  category: 'stage',
  description:
    'Linear distance fog. Renders nothing itself — it attenuates everything behind it, so a flat backdrop gains depth.',
  propsSchema: z.object({
    color: z.string().min(1),
    near: z.number().min(0),
    far: z.number().positive(),
  }),
  defaultProps: { color: '#c8d4e2', near: 12, far: 42 },
  animatableProperties: {},
  defaultName: 'Atmosphere',
  propertyHints: {
    color: { label: 'Fog color', control: 'color', group: 'Atmosphere' },
    near: { label: 'Near distance', control: 'number', min: 0, step: 0.5, group: 'Atmosphere' },
    far: { label: 'Far distance', control: 'number', min: 0.5, step: 0.5, group: 'Atmosphere' },
  },
};
