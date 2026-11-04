/**
 * lib/motion/nodes/product.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Merchandise primitives. These are procedural rather than imported models so a
 * merch scene is editable the moment it is created: dimensions, materials and a
 * printable logo all come from props. `imageAssetId` is deliberately the same
 * field name preflight already scans, so a missing print is reported like any
 * other missing media instead of silently rendering bare product.
 */

import { z } from 'zod';

import type { MotionNodeTypeDefinition, MotionPropertyHint } from './definition';

const logoHint: MotionPropertyHint = {
  label: 'Print / logo',
  control: 'asset',
  assetKind: 'image',
  group: 'Branding',
  optional: true,
};

const brandingHints: Record<string, MotionPropertyHint> = {
  imageAssetId: logoHint,
  logoScale: { label: 'Print size', control: 'number', min: 0.05, max: 1, step: 0.01, group: 'Branding' },
};

const surfaceHints: Record<string, MotionPropertyHint> = {
  color: { label: 'Body color', control: 'color', group: 'Material' },
  roughness: { label: 'Roughness', control: 'slider', min: 0, max: 1, step: 0.01, group: 'Material' },
  metalness: { label: 'Metalness', control: 'slider', min: 0, max: 1, step: 0.01, group: 'Material' },
  opacity: { label: 'Opacity', control: 'slider', min: 0, max: 1, step: 0.01, group: 'Appearance' },
};

const animatableProperties = { opacity: { description: 'Product opacity.' } };

export const productMug: MotionNodeTypeDefinition = {
  id: 'product.mug',
  label: 'Mug',
  category: 'product',
  description: 'A ceramic mug with an optional handle and printable front panel.',
  propsSchema: z.object({
    height: z.number().positive(),
    radius: z.number().positive(),
    handle: z.boolean(),
    color: z.string().min(1),
    accentColor: z.string().min(1),
    imageAssetId: z.string().min(1).optional(),
    logoScale: z.number().positive(),
    roughness: z.number().min(0).max(1),
    metalness: z.number().min(0).max(1),
    opacity: z.number().min(0).max(1),
  }),
  defaultProps: {
    height: 0.95,
    radius: 0.42,
    handle: true,
    color: '#fdfcf8',
    accentColor: '#e4e0d6',
    logoScale: 0.5,
    roughness: 0.36,
    metalness: 0,
    opacity: 1,
  },
  animatableProperties,
  defaultName: 'Mug',
  propertyHints: {
    height: { label: 'Height', control: 'number', min: 0.1, step: 0.01, group: 'Dimensions' },
    radius: { label: 'Radius', control: 'number', min: 0.05, step: 0.01, group: 'Dimensions' },
    handle: { label: 'Handle', control: 'toggle', group: 'Dimensions' },
    accentColor: { label: 'Rim & handle', control: 'color', group: 'Material' },
    ...brandingHints,
    ...surfaceHints,
  },
};

export const productBottle: MotionNodeTypeDefinition = {
  id: 'product.bottle',
  label: 'Bottle',
  category: 'product',
  description: 'A lathed bottle with a label band, cap and printable label.',
  propsSchema: z.object({
    height: z.number().positive(),
    radius: z.number().positive(),
    color: z.string().min(1),
    capColor: z.string().min(1),
    labelColor: z.string().min(1),
    imageAssetId: z.string().min(1).optional(),
    logoScale: z.number().positive(),
    roughness: z.number().min(0).max(1),
    metalness: z.number().min(0).max(1),
    opacity: z.number().min(0).max(1),
  }),
  defaultProps: {
    height: 1.7,
    radius: 0.3,
    color: '#5f7d6d',
    capColor: '#e9e4d8',
    labelColor: '#f4f0e6',
    logoScale: 0.45,
    roughness: 0.24,
    metalness: 0.08,
    opacity: 1,
  },
  animatableProperties,
  defaultName: 'Bottle',
  propertyHints: {
    height: { label: 'Height', control: 'number', min: 0.1, step: 0.01, group: 'Dimensions' },
    radius: { label: 'Radius', control: 'number', min: 0.05, step: 0.01, group: 'Dimensions' },
    capColor: { label: 'Cap', control: 'color', group: 'Material' },
    labelColor: { label: 'Label band', control: 'color', group: 'Material' },
    ...brandingHints,
    ...surfaceHints,
  },
};

export const productApparel: MotionNodeTypeDefinition = {
  id: 'product.apparel',
  label: 'Apparel',
  category: 'product',
  description: 'A flat-lay t-shirt with collar trim and a printable chest area.',
  propsSchema: z.object({
    width: z.number().positive(),
    height: z.number().positive(),
    depth: z.number().positive(),
    color: z.string().min(1),
    trimColor: z.string().min(1),
    imageAssetId: z.string().min(1).optional(),
    logoScale: z.number().positive(),
    roughness: z.number().min(0).max(1),
    metalness: z.number().min(0).max(1),
    opacity: z.number().min(0).max(1),
  }),
  defaultProps: {
    width: 2.4,
    height: 2.8,
    depth: 0.07,
    color: '#202836',
    trimColor: '#33405a',
    logoScale: 0.42,
    roughness: 0.88,
    metalness: 0,
    opacity: 1,
  },
  animatableProperties,
  defaultName: 'Apparel',
  propertyHints: {
    width: { label: 'Width', control: 'number', min: 0.1, step: 0.01, group: 'Dimensions' },
    height: { label: 'Height', control: 'number', min: 0.1, step: 0.01, group: 'Dimensions' },
    depth: { label: 'Depth', control: 'number', min: 0.01, step: 0.01, group: 'Dimensions' },
    trimColor: { label: 'Collar & cuffs', control: 'color', group: 'Material' },
    ...brandingHints,
    ...surfaceHints,
  },
};

export const productBox: MotionNodeTypeDefinition = {
  id: 'product.box',
  label: 'Packaging box',
  category: 'product',
  description: 'A rigid packaging box with a front label panel and print area.',
  propsSchema: z.object({
    width: z.number().positive(),
    height: z.number().positive(),
    depth: z.number().positive(),
    color: z.string().min(1),
    accentColor: z.string().min(1),
    imageAssetId: z.string().min(1).optional(),
    logoScale: z.number().positive(),
    roughness: z.number().min(0).max(1),
    metalness: z.number().min(0).max(1),
    opacity: z.number().min(0).max(1),
  }),
  defaultProps: {
    width: 0.9,
    height: 0.9,
    depth: 0.6,
    color: '#e8e3d7',
    accentColor: '#2b3242',
    logoScale: 0.55,
    roughness: 0.62,
    metalness: 0.02,
    opacity: 1,
  },
  animatableProperties,
  defaultName: 'Packaging box',
  propertyHints: {
    width: { label: 'Width', control: 'number', min: 0.05, step: 0.01, group: 'Dimensions' },
    height: { label: 'Height', control: 'number', min: 0.05, step: 0.01, group: 'Dimensions' },
    depth: { label: 'Depth', control: 'number', min: 0.05, step: 0.01, group: 'Dimensions' },
    accentColor: { label: 'Label panel', control: 'color', group: 'Material' },
    ...brandingHints,
    ...surfaceHints,
  },
};

export const productNodes: readonly MotionNodeTypeDefinition[] = [
  productMug,
  productBottle,
  productApparel,
  productBox,
];
