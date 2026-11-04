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

// ── Collection ───────────────────────────────────────────────────────────────

export const geometryPrimitives: readonly MotionNodeTypeDefinition[] = [
  geometryBox,
  geometrySphere,
  geometryCylinder,
  geometryTorus,
  geometryCone,
  geometryCapsule,
];
