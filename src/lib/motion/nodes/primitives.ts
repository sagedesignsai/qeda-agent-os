/**
 * lib/motion/nodes/primitives.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Generic 3D geometry primitives. These are the building blocks for arbitrary
 * 3D models: box, sphere, cylinder, torus, cone, and capsule. Each primitive
 * carries a shared material schema (color, roughness, metalness, opacity) so
 * the Model Builder agent can compose real 3D solids rather than flat surfaces.
 */

import { z } from 'zod';

import type {
  MotionNodeTypeDefinition,
  MotionPropertyHint,
} from './definition';

// ── Shared material schema ───────────────────────────────────────────────────

const materialSchema = z.object({
  color: z.string().min(1),
  roughness: z.number().min(0).max(1),
  metalness: z.number().min(0).max(1),
  opacity: z.number().min(0).max(1),
});

const materialHints: Record<string, MotionPropertyHint> = {
  color: { label: 'Color', control: 'color', group: 'Material' },
  roughness: {
    label: 'Roughness',
    control: 'slider',
    min: 0,
    max: 1,
    step: 0.01,
    group: 'Material',
  },
  metalness: {
    label: 'Metalness',
    control: 'slider',
    min: 0,
    max: 1,
    step: 0.01,
    group: 'Material',
  },
  opacity: {
    label: 'Opacity',
    control: 'slider',
    min: 0,
    max: 1,
    step: 0.01,
    group: 'Appearance',
  },
};

const animatableProperties = { opacity: { description: 'Primitive opacity.' } };

// ── Box ──────────────────────────────────────────────────────────────────────

const boxSchema = z.object({
  width: z.number().positive(),
  height: z.number().positive(),
  depth: z.number().positive(),
  ...materialSchema.shape,
});

export const geometryBox: MotionNodeTypeDefinition = {
  id: 'geometry.box',
  label: 'Box',
  category: 'geometry',
  description:
    'A 3D box (rectangular cuboid) with configurable width, height, and depth.',
  propsSchema: boxSchema,
  defaultProps: {
    width: 1,
    height: 1,
    depth: 1,
    color: '#5885f7',
    roughness: 0.5,
    metalness: 0,
    opacity: 1,
  },
  animatableProperties,
  defaultName: 'Box',
  propertyHints: {
    width: {
      label: 'Width',
      control: 'number',
      min: 0.01,
      step: 0.01,
      group: 'Dimensions',
    },
    height: {
      label: 'Height',
      control: 'number',
      min: 0.01,
      step: 0.01,
      group: 'Dimensions',
    },
    depth: {
      label: 'Depth',
      control: 'number',
      min: 0.01,
      step: 0.01,
      group: 'Dimensions',
    },
    ...materialHints,
  },
};

// ── Sphere ───────────────────────────────────────────────────────────────────

const sphereSchema = z.object({
  radius: z.number().positive(),
  segments: z.number().int().min(4).max(64),
  ...materialSchema.shape,
});

export const geometrySphere: MotionNodeTypeDefinition = {
  id: 'geometry.sphere',
  label: 'Sphere',
  category: 'geometry',
  description: 'A 3D sphere with configurable radius and mesh segments.',
  propsSchema: sphereSchema,
  defaultProps: {
    radius: 0.5,
    segments: 32,
    color: '#5885f7',
    roughness: 0.5,
    metalness: 0,
    opacity: 1,
  },
  animatableProperties,
  defaultName: 'Sphere',
  propertyHints: {
    radius: {
      label: 'Radius',
      control: 'number',
      min: 0.01,
      step: 0.01,
      group: 'Dimensions',
    },
    segments: {
      label: 'Segments',
      control: 'slider',
      min: 4,
      max: 64,
      step: 1,
      group: 'Quality',
    },
    ...materialHints,
  },
};

// ── Cylinder ─────────────────────────────────────────────────────────────────

const cylinderSchema = z.object({
  radiusTop: z.number().nonnegative(),
  radiusBottom: z.number().nonnegative(),
  height: z.number().positive(),
  segments: z.number().int().min(4).max(64),
  ...materialSchema.shape,
});

export const geometryCylinder: MotionNodeTypeDefinition = {
  id: 'geometry.cylinder',
  label: 'Cylinder',
  category: 'geometry',
  description:
    'A 3D cylinder with configurable top and bottom radii, height, and segments. Set radiusTop to 0 for a cone.',
  propsSchema: cylinderSchema,
  defaultProps: {
    radiusTop: 0.5,
    radiusBottom: 0.5,
    height: 1,
    segments: 32,
    color: '#5885f7',
    roughness: 0.5,
    metalness: 0,
    opacity: 1,
  },
  animatableProperties,
  defaultName: 'Cylinder',
  propertyHints: {
    radiusTop: {
      label: 'Top radius',
      control: 'number',
      min: 0,
      step: 0.01,
      group: 'Dimensions',
    },
    radiusBottom: {
      label: 'Bottom radius',
      control: 'number',
      min: 0,
      step: 0.01,
      group: 'Dimensions',
    },
    height: {
      label: 'Height',
      control: 'number',
      min: 0.01,
      step: 0.01,
      group: 'Dimensions',
    },
    segments: {
      label: 'Segments',
      control: 'slider',
      min: 4,
      max: 64,
      step: 1,
      group: 'Quality',
    },
    ...materialHints,
  },
};

// ── Torus ────────────────────────────────────────────────────────────────────

const torusSchema = z.object({
  radius: z.number().positive(),
  tube: z.number().positive(),
  radialSegments: z.number().int().min(4).max(64),
  tubularSegments: z.number().int().min(4).max(128),
  ...materialSchema.shape,
});

export const geometryTorus: MotionNodeTypeDefinition = {
  id: 'geometry.torus',
  label: 'Torus',
  category: 'geometry',
  description:
    'A 3D torus (donut/ring shape) with configurable radius, tube thickness, and segment counts.',
  propsSchema: torusSchema,
  defaultProps: {
    radius: 0.5,
    tube: 0.2,
    radialSegments: 16,
    tubularSegments: 48,
    color: '#5885f7',
    roughness: 0.5,
    metalness: 0,
    opacity: 1,
  },
  animatableProperties,
  defaultName: 'Torus',
  propertyHints: {
    radius: {
      label: 'Radius',
      control: 'number',
      min: 0.01,
      step: 0.01,
      group: 'Dimensions',
    },
    tube: {
      label: 'Tube',
      control: 'number',
      min: 0.01,
      step: 0.01,
      group: 'Dimensions',
    },
    radialSegments: {
      label: 'Radial segs',
      control: 'slider',
      min: 4,
      max: 64,
      step: 1,
      group: 'Quality',
    },
    tubularSegments: {
      label: 'Tubular segs',
      control: 'slider',
      min: 4,
      max: 128,
      step: 1,
      group: 'Quality',
    },
    ...materialHints,
  },
};

// ── Cone ─────────────────────────────────────────────────────────────────────

const coneSchema = z.object({
  radius: z.number().positive(),
  height: z.number().positive(),
  segments: z.number().int().min(4).max(64),
  ...materialSchema.shape,
});

export const geometryCone: MotionNodeTypeDefinition = {
  id: 'geometry.cone',
  label: 'Cone',
  category: 'geometry',
  description:
    'A 3D cone with a circular base, configurable radius, height, and segments.',
  propsSchema: coneSchema,
  defaultProps: {
    radius: 0.5,
    height: 1,
    segments: 32,
    color: '#5885f7',
    roughness: 0.5,
    metalness: 0,
    opacity: 1,
  },
  animatableProperties,
  defaultName: 'Cone',
  propertyHints: {
    radius: {
      label: 'Radius',
      control: 'number',
      min: 0.01,
      step: 0.01,
      group: 'Dimensions',
    },
    height: {
      label: 'Height',
      control: 'number',
      min: 0.01,
      step: 0.01,
      group: 'Dimensions',
    },
    segments: {
      label: 'Segments',
      control: 'slider',
      min: 4,
      max: 64,
      step: 1,
      group: 'Quality',
    },
    ...materialHints,
  },
};

// ── Capsule ──────────────────────────────────────────────────────────────────

const capsuleSchema = z.object({
  radius: z.number().positive(),
  height: z.number().nonnegative(),
  capSegments: z.number().int().min(2).max(16),
  radialSegments: z.number().int().min(4).max(32),
  ...materialSchema.shape,
});

export const geometryCapsule: MotionNodeTypeDefinition = {
  id: 'geometry.capsule',
  label: 'Capsule',
  category: 'geometry',
  description:
    'A 3D capsule (cylinder with hemispherical caps) with configurable radius, height, and segment counts.',
  propsSchema: capsuleSchema,
  defaultProps: {
    radius: 0.5,
    height: 1,
    capSegments: 4,
    radialSegments: 16,
    color: '#5885f7',
    roughness: 0.5,
    metalness: 0,
    opacity: 1,
  },
  animatableProperties,
  defaultName: 'Capsule',
  propertyHints: {
    radius: {
      label: 'Radius',
      control: 'number',
      min: 0.01,
      step: 0.01,
      group: 'Dimensions',
    },
    height: {
      label: 'Height',
      control: 'number',
      min: 0,
      step: 0.01,
      group: 'Dimensions',
    },
    capSegments: {
      label: 'Cap segs',
      control: 'slider',
      min: 2,
      max: 16,
      step: 1,
      group: 'Quality',
    },
    radialSegments: {
      label: 'Radial segs',
      control: 'slider',
      min: 4,
      max: 32,
      step: 1,
      group: 'Quality',
    },
    ...materialHints,
  },
};

export const geometryIcosahedron: MotionNodeTypeDefinition = {
  id: 'geometry.icosahedron',
  label: 'Icosahedron',
  category: 'geometry',
  description: 'An icosahedral primitive.',
  propsSchema: z.object({
    radius: z.number().positive(),
    detail: z.number().int().min(0).max(5),
    color: z.string().min(1),
    roughness: z.number().min(0).max(1),
    metalness: z.number().min(0).max(1),
    opacity: z.number().min(0).max(1),
  }),
  defaultProps: { radius: 0.6, detail: 0, color: '#5885f7', roughness: 0.5, metalness: 0, opacity: 1 },
  animatableProperties: { opacity: { description: 'Opacity.' } },
  defaultName: 'Icosahedron',
  propertyHints: {
    radius: { label: 'Radius', control: 'number', min: 0.1, step: 0.05, group: 'Dimensions' },
    detail: { label: 'Detail', control: 'number', min: 0, max: 5, step: 1, group: 'Dimensions' },
    color: { label: 'Color', control: 'color', group: 'Appearance' },
    roughness: { label: 'Roughness', control: 'slider', min: 0, max: 1, step: 0.01, group: 'Material' },
    metalness: { label: 'Metalness', control: 'slider', min: 0, max: 1, step: 0.01, group: 'Material' },
    opacity: { label: 'Opacity', control: 'slider', min: 0, max: 1, step: 0.01, group: 'Appearance' },
  },
};

export const geometryTorusKnot: MotionNodeTypeDefinition = {
  id: 'geometry.torus-knot',
  label: 'Torus knot',
  category: 'geometry',
  description: 'A torus knot primitive.',
  propsSchema: z.object({
    radius: z.number().positive(),
    tube: z.number().positive(),
    p: z.number().int().positive(),
    q: z.number().int().positive(),
    tubularSegments: z.number().int().min(3).max(256),
    radialSegments: z.number().int().min(3).max(64),
    color: z.string().min(1),
    roughness: z.number().min(0).max(1),
    metalness: z.number().min(0).max(1),
    opacity: z.number().min(0).max(1),
  }),
  defaultProps: { radius: 0.5, tube: 0.18, p: 2, q: 3, tubularSegments: 64, radialSegments: 8, color: '#a88cf7', roughness: 0.4, metalness: 0.1, opacity: 1 },
  animatableProperties: { opacity: { description: 'Opacity.' } },
  defaultName: 'Torus knot',
  propertyHints: {
    radius: { label: 'Radius', control: 'number', min: 0.1, step: 0.05, group: 'Dimensions' },
    tube: { label: 'Tube', control: 'number', min: 0.02, step: 0.01, group: 'Dimensions' },
    p: { label: 'P', control: 'number', min: 1, step: 1, group: 'Dimensions' },
    q: { label: 'Q', control: 'number', min: 1, step: 1, group: 'Dimensions' },
    tubularSegments: { label: 'Tubular segments', control: 'number', min: 3, max: 256, step: 1, group: 'Quality' },
    radialSegments: { label: 'Radial segments', control: 'number', min: 3, max: 64, step: 1, group: 'Quality' },
    color: { label: 'Color', control: 'color', group: 'Appearance' },
    roughness: { label: 'Roughness', control: 'slider', min: 0, max: 1, step: 0.01, group: 'Material' },
    metalness: { label: 'Metalness', control: 'slider', min: 0, max: 1, step: 0.01, group: 'Material' },
    opacity: { label: 'Opacity', control: 'slider', min: 0, max: 1, step: 0.01, group: 'Appearance' },
  },
};

export const geometryRing: MotionNodeTypeDefinition = {
  id: 'geometry.ring',
  label: 'Ring',
  category: 'geometry',
  description: 'A flat ring.',
  propsSchema: z.object({
    innerRadius: z.number().nonnegative(),
    outerRadius: z.number().positive(),
    thetaSegments: z.number().int().min(3).max(128),
    color: z.string().min(1),
    roughness: z.number().min(0).max(1),
    metalness: z.number().min(0).max(1),
    opacity: z.number().min(0).max(1),
  }),
  defaultProps: { innerRadius: 0.6, outerRadius: 1, thetaSegments: 48, color: '#5885f7', roughness: 0.5, metalness: 0, opacity: 1 },
  animatableProperties: { opacity: { description: 'Opacity.' } },
  defaultName: 'Ring',
  propertyHints: {
    innerRadius: { label: 'Inner radius', control: 'number', min: 0, step: 0.05, group: 'Dimensions' },
    outerRadius: { label: 'Outer radius', control: 'number', min: 0.1, step: 0.05, group: 'Dimensions' },
    thetaSegments: { label: 'Segments', control: 'number', min: 3, max: 128, step: 1, group: 'Quality' },
    color: { label: 'Color', control: 'color', group: 'Appearance' },
    roughness: { label: 'Roughness', control: 'slider', min: 0, max: 1, step: 0.01, group: 'Material' },
    metalness: { label: 'Metalness', control: 'slider', min: 0, max: 1, step: 0.01, group: 'Material' },
    opacity: { label: 'Opacity', control: 'slider', min: 0, max: 1, step: 0.01, group: 'Appearance' },
  },
};

export const geometryPlane: MotionNodeTypeDefinition = {
  id: 'geometry.plane',
  label: 'Plane',
  category: 'geometry',
  description: 'A flat plane.',
  propsSchema: z.object({
    width: z.number().positive(),
    height: z.number().positive(),
    color: z.string().min(1),
    roughness: z.number().min(0).max(1),
    metalness: z.number().min(0).max(1),
    opacity: z.number().min(0).max(1),
  }),
  defaultProps: { width: 2, height: 2, color: '#5885f7', roughness: 0.5, metalness: 0, opacity: 1 },
  animatableProperties: { opacity: { description: 'Opacity.' } },
  defaultName: 'Plane',
  propertyHints: {
    width: { label: 'Width', control: 'number', min: 0.1, step: 0.1, group: 'Dimensions' },
    height: { label: 'Height', control: 'number', min: 0.1, step: 0.1, group: 'Dimensions' },
    color: { label: 'Color', control: 'color', group: 'Appearance' },
    roughness: { label: 'Roughness', control: 'slider', min: 0, max: 1, step: 0.01, group: 'Material' },
    metalness: { label: 'Metalness', control: 'slider', min: 0, max: 1, step: 0.01, group: 'Material' },
    opacity: { label: 'Opacity', control: 'slider', min: 0, max: 1, step: 0.01, group: 'Appearance' },
  },
};

// ── Collection ───────────────────────────────────────────────────────────────

export const geometryPrimitives: readonly MotionNodeTypeDefinition[] = [
  geometryBox,
  geometrySphere,
  geometryCylinder,
  geometryTorus,
  geometryCone,
  geometryCapsule,
  geometryIcosahedron,
  geometryTorusKnot,
  geometryRing,
  geometryPlane,
];
