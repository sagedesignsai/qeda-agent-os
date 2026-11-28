/**
 * lib/motion/nodes/procedural.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Procedural generators. All matrices are derived deterministically from
 * `seed` so a saved document renders identically on every machine.
 */

import { z } from 'zod';

import type { MotionNodeTypeDefinition, MotionPropertyHint } from './definition';
import { mulberry32 } from '../random';

const geometryEnum = z.enum(['box', 'sphere', 'cylinder', 'torus', 'cone']);
const opacityHint = { control: 'slider' as const, min: 0, max: 1, step: 0.01, group: 'Appearance' as const };

const baseProps = {
  primitive: geometryEnum,
  color: z.string().min(1),
  roughness: z.number().min(0).max(1),
  metalness: z.number().min(0).max(1),
  size: z.number().positive(),
  opacity: z.number().min(0).max(1),
  seed: z.number().int().min(0),
};

export const proceduralArray: MotionNodeTypeDefinition = {
  id: 'procedural.array',
  label: 'Procedural array',
  category: 'procedural',
  description: 'A linear row of instanced primitives.',
  propsSchema: z.object({ ...baseProps, count: z.number().int().min(1).max(5000), spacing: z.number().positive() }),
  defaultProps: { primitive: 'box', color: '#5885f7', roughness: 0.5, metalness: 0, size: 0.3, opacity: 1, seed: 1, count: 8, spacing: 0.8 },
  animatableProperties: { opacity: { description: 'Opacity.' } },
  defaultName: 'Procedural array',
  propertyHints: {
    primitive: { label: 'Primitive', control: 'select', group: 'Geometry', options: [{ value: 'box', label: 'Box' }, { value: 'sphere', label: 'Sphere' }, { value: 'cylinder', label: 'Cylinder' }, { value: 'torus', label: 'Torus' }, { value: 'cone', label: 'Cone' }] },
    count: { label: 'Count', control: 'number', min: 1, max: 5000, step: 1, group: 'Layout' },
    spacing: { label: 'Spacing', control: 'number', min: 0.1, step: 0.1, group: 'Layout' },
    size: { label: 'Size', control: 'number', min: 0.05, step: 0.05, group: 'Geometry' },
    color: { label: 'Color', control: 'color', group: 'Appearance' },
    roughness: { label: 'Roughness', control: 'slider', min: 0, max: 1, step: 0.01, group: 'Material' },
    metalness: { label: 'Metalness', control: 'slider', min: 0, max: 1, step: 0.01, group: 'Material' },
    opacity: { label: 'Opacity', ...opacityHint },
    seed: { label: 'Seed', control: 'number', min: 0, step: 1, group: 'Generation' },
  },
};

export const proceduralRadial: MotionNodeTypeDefinition = {
  id: 'procedural.radial',
  label: 'Procedural radial',
  category: 'procedural',
  description: 'Primitives arranged in a ring.',
  propsSchema: z.object({ ...baseProps, count: z.number().int().min(1).max(5000), radius: z.number().positive(), turns: z.number().min(0.5).max(10) }),
  defaultProps: { primitive: 'box', color: '#5885f7', roughness: 0.5, metalness: 0, size: 0.3, opacity: 1, seed: 1, count: 12, radius: 1.5, turns: 1 },
  animatableProperties: { opacity: { description: 'Opacity.' } },
  defaultName: 'Procedural radial',
  propertyHints: {
    primitive: { label: 'Primitive', control: 'select', group: 'Geometry', options: [{ value: 'box', label: 'Box' }, { value: 'sphere', label: 'Sphere' }, { value: 'cylinder', label: 'Cylinder' }, { value: 'torus', label: 'Torus' }, { value: 'cone', label: 'Cone' }] },
    count: { label: 'Count', control: 'number', min: 1, max: 5000, step: 1, group: 'Layout' },
    radius: { label: 'Radius', control: 'number', min: 0.2, step: 0.1, group: 'Layout' },
    turns: { label: 'Turns', control: 'number', min: 0.5, max: 10, step: 0.5, group: 'Layout' },
    size: { label: 'Size', control: 'number', min: 0.05, step: 0.05, group: 'Geometry' },
    color: { label: 'Color', control: 'color', group: 'Appearance' },
    roughness: { label: 'Roughness', control: 'slider', min: 0, max: 1, step: 0.01, group: 'Material' },
    metalness: { label: 'Metalness', control: 'slider', min: 0, max: 1, step: 0.01, group: 'Material' },
    opacity: { label: 'Opacity', ...opacityHint },
    seed: { label: 'Seed', control: 'number', min: 0, step: 1, group: 'Generation' },
  },
};

export const proceduralGrid: MotionNodeTypeDefinition = {
  id: 'procedural.grid',
  label: 'Procedural grid',
  category: 'procedural',
  description: 'A rows × columns grid of primitives.',
  propsSchema: z.object({ ...baseProps, rows: z.number().int().min(1).max(100), columns: z.number().int().min(1).max(100), spacing: z.number().positive() }),
  defaultProps: { primitive: 'box', color: '#5885f7', roughness: 0.5, metalness: 0, size: 0.3, opacity: 1, seed: 1, rows: 5, columns: 5, spacing: 0.8 },
  animatableProperties: { opacity: { description: 'Opacity.' } },
  defaultName: 'Procedural grid',
  propertyHints: {
    primitive: { label: 'Primitive', control: 'select', group: 'Geometry', options: [{ value: 'box', label: 'Box' }, { value: 'sphere', label: 'Sphere' }, { value: 'cylinder', label: 'Cylinder' }, { value: 'torus', label: 'Torus' }, { value: 'cone', label: 'Cone' }] },
    rows: { label: 'Rows', control: 'number', min: 1, max: 100, step: 1, group: 'Layout' },
    columns: { label: 'Columns', control: 'number', min: 1, max: 100, step: 1, group: 'Layout' },
    spacing: { label: 'Spacing', control: 'number', min: 0.1, step: 0.1, group: 'Layout' },
    size: { label: 'Size', control: 'number', min: 0.05, step: 0.05, group: 'Geometry' },
    color: { label: 'Color', control: 'color', group: 'Appearance' },
    roughness: { label: 'Roughness', control: 'slider', min: 0, max: 1, step: 0.01, group: 'Material' },
    metalness: { label: 'Metalness', control: 'slider', min: 0, max: 1, step: 0.01, group: 'Material' },
    opacity: { label: 'Opacity', ...opacityHint },
    seed: { label: 'Seed', control: 'number', min: 0, step: 1, group: 'Generation' },
  },
};

export const proceduralScatter: MotionNodeTypeDefinition = {
  id: 'procedural.scatter',
  label: 'Procedural scatter',
  category: 'procedural',
  description: 'Seeded random scatter in a box.',
  propsSchema: z.object({ ...baseProps, count: z.number().int().min(1).max(5000), spread: z.number().positive(), jitter: z.number().min(0).max(1) }),
  defaultProps: { primitive: 'sphere', color: '#5885f7', roughness: 0.5, metalness: 0, size: 0.15, opacity: 1, seed: 1, count: 120, spread: 3, jitter: 0.6 },
  animatableProperties: { opacity: { description: 'Opacity.' } },
  defaultName: 'Procedural scatter',
  propertyHints: {
    primitive: { label: 'Primitive', control: 'select', group: 'Geometry', options: [{ value: 'box', label: 'Box' }, { value: 'sphere', label: 'Sphere' }, { value: 'cylinder', label: 'Cylinder' }, { value: 'torus', label: 'Torus' }, { value: 'cone', label: 'Cone' }] },
    count: { label: 'Count', control: 'number', min: 1, max: 5000, step: 1, group: 'Layout' },
    spread: { label: 'Spread', control: 'number', min: 0.1, step: 0.1, group: 'Layout' },
    jitter: { label: 'Jitter', control: 'slider', min: 0, max: 1, step: 0.01, group: 'Layout' },
    size: { label: 'Size', control: 'number', min: 0.05, step: 0.05, group: 'Geometry' },
    color: { label: 'Color', control: 'color', group: 'Appearance' },
    roughness: { label: 'Roughness', control: 'slider', min: 0, max: 1, step: 0.01, group: 'Material' },
    metalness: { label: 'Metalness', control: 'slider', min: 0, max: 1, step: 0.01, group: 'Material' },
    opacity: { label: 'Opacity', ...opacityHint },
    seed: { label: 'Seed', control: 'number', min: 0, step: 1, group: 'Generation' },
  },
};

export const proceduralCurve: MotionNodeTypeDefinition = {
  id: 'procedural.curve',
  label: 'Procedural curve',
  category: 'procedural',
  description: 'Primitives placed along a curve.',
  propsSchema: z.object({ ...baseProps, count: z.number().int().min(1).max(5000), curve: z.enum(['helix', 'arc', 'sine']), radius: z.number().positive(), height: z.number().nonnegative(), turns: z.number().min(0.5).max(10) }),
  defaultProps: { primitive: 'sphere', color: '#5885f7', roughness: 0.5, metalness: 0, size: 0.15, opacity: 1, seed: 1, count: 60, curve: 'helix', radius: 1.4, height: 2, turns: 3 },
  animatableProperties: { opacity: { description: 'Opacity.' } },
  defaultName: 'Procedural curve',
  propertyHints: {
    primitive: { label: 'Primitive', control: 'select', group: 'Geometry', options: [{ value: 'box', label: 'Box' }, { value: 'sphere', label: 'Sphere' }, { value: 'cylinder', label: 'Cylinder' }, { value: 'torus', label: 'Torus' }, { value: 'cone', label: 'Cone' }] },
    curve: { label: 'Curve', control: 'select', group: 'Layout', options: [{ value: 'helix', label: 'Helix' }, { value: 'arc', label: 'Arc' }, { value: 'sine', label: 'Sine' }] },
    count: { label: 'Count', control: 'number', min: 1, max: 5000, step: 1, group: 'Layout' },
    radius: { label: 'Radius', control: 'number', min: 0.1, step: 0.1, group: 'Layout' },
    height: { label: 'Height', control: 'number', min: 0, step: 0.1, group: 'Layout' },
    turns: { label: 'Turns', control: 'number', min: 0.5, max: 10, step: 0.5, group: 'Layout' },
    size: { label: 'Size', control: 'number', min: 0.05, step: 0.05, group: 'Geometry' },
    color: { label: 'Color', control: 'color', group: 'Appearance' },
    roughness: { label: 'Roughness', control: 'slider', min: 0, max: 1, step: 0.01, group: 'Material' },
    metalness: { label: 'Metalness', control: 'slider', min: 0, max: 1, step: 0.01, group: 'Material' },
    opacity: { label: 'Opacity', ...opacityHint },
    seed: { label: 'Seed', control: 'number', min: 0, step: 1, group: 'Generation' },
  },
};

export const proceduralGalaxy: MotionNodeTypeDefinition = {
  id: 'procedural.galaxy',
  label: 'Galaxy',
  category: 'procedural',
  description:
    'A GPU particle galaxy with differential rotation — the core laps the rim and the arms wind up over time.',
  propsSchema: z.object({
    count: z.number().int().min(100).max(200_000),
    radius: z.number().positive(),
    branches: z.number().int().min(2).max(8),
    spin: z.number().min(-10).max(10),
    rate: z.number().min(-5).max(5),
    size: z.number().positive(),
    coreColor: z.string().min(1),
    rimColor: z.string().min(1),
    glow: z.number().min(0).max(3),
    opacity: z.number().min(0).max(1),
    seed: z.number().int().min(0),
  }),
  defaultProps: {
    count: 12_000,
    radius: 4,
    branches: 3,
    spin: 0.8,
    rate: 0.15,
    size: 2,
    coreColor: '#ffd9a0',
    rimColor: '#6aa8ff',
    glow: 1.2,
    opacity: 0.95,
    seed: 7,
  },
  animatableProperties: { opacity: { description: 'Galaxy opacity.' } },
  defaultName: 'Galaxy',
  propertyHints: {
    count: { label: 'Stars', control: 'number', min: 100, max: 200_000, step: 100, group: 'Field' },
    radius: { label: 'Radius', control: 'number', min: 0.5, step: 0.1, group: 'Field' },
    branches: { label: 'Arms', control: 'number', min: 2, max: 8, step: 1, group: 'Field' },
    spin: { label: 'Arm twist', control: 'slider', min: -10, max: 10, step: 0.1, group: 'Motion' },
    rate: { label: 'Winding speed', control: 'slider', min: -5, max: 5, step: 0.01, group: 'Motion' },
    size: { label: 'Star size', control: 'slider', min: 0.2, max: 20, step: 0.1, group: 'Appearance' },
    coreColor: { label: 'Core color', control: 'color', group: 'Appearance' },
    rimColor: { label: 'Rim color', control: 'color', group: 'Appearance' },
    glow: { label: 'Glow', control: 'slider', min: 0, max: 3, step: 0.01, group: 'Appearance' },
    opacity: { label: 'Opacity', ...opacityHint },
    seed: { label: 'Seed', control: 'number', min: 0, step: 1, group: 'Generation' },
  },
};

export const proceduralNodes = [proceduralArray, proceduralRadial, proceduralGrid, proceduralScatter, proceduralCurve, proceduralGalaxy];