/**
 * lib/motion/recipes.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Motion composition recipes — senior-designer patterns as op batches.
 * Each expands to existing ops only (no new mutation surface). Mirrors
 * Trace's recipes/ (compileXRecipe → ops) for consistency.
 */

import type { MotionOpRequest } from './ops';

export type MotionRecipeId = 'product-hero' | 'stinger-3d' | 'data-viz';
export type MotionRecipeParams = { productType?: string; title?: string; accent?: string };

/** Deterministic id from label. */
const nid = (base: string, suffix: string) => `${base}-${suffix}`;

export function listMotionRecipes(): Array<{
  id: MotionRecipeId;
  label: string;
  description: string;
  params: Record<string, unknown>;
}> {
  return [
    {
      id: 'product-hero',
      label: 'Product Hero',
      description: 'Pedestal product shot: ground, pedestal, hero product, key+rim light, camera.',
      params: { productType: 'product.box', title: 'Hero' },
    },
    {
      id: 'stinger-3d',
      label: '3D Logo Stinger',
      description: 'Dark stage + glow + centered title + accent bar, built for reveal animation.',
      params: { title: 'Logo' },
    },
    {
      id: 'data-viz',
      label: 'Data Viz',
      description: 'Grid floor + title + bar trio (geometry boxes) — a minimal chart scene.',
      params: { title: 'Metrics' },
    },
  ];
}

export function expandMotionRecipe(
  recipeId: MotionRecipeId | string,
  options: MotionRecipeParams = {},
  idFactory: (prefix: string) => string = (p) => `${p}-${Math.random().toString(36).slice(2, 8)}`,
): MotionOpRequest[] {
  switch (recipeId) {
    case 'product-hero': {
      const productType =
        options.productType && ['product.box', 'product.mug', 'product.bottle', 'product.can'].includes(options.productType)
          ? options.productType
          : 'product.box';
      const title = options.title ?? 'Hero';
      return [
        { op: 'scene.node.add', nodeId: idFactory('camera'), type: 'camera.perspective', name: 'Camera' } as never,
        { op: 'scene.node.add', nodeId: idFactory('ground'), type: 'stage.ground', name: 'Ground' } as never,
        { op: 'scene.node.add', nodeId: idFactory('pedestal'), type: 'stage.pedestal', name: 'Pedestal' } as never,
        {
          op: 'scene.node.add',
          nodeId: idFactory('hero'),
          type: productType,
          name: title,
          transform: { position: [0, 0.9, 0] },
        } as never,
        { op: 'scene.node.add', nodeId: idFactory('key'), type: 'light.directional', name: 'Key Light', transform: { position: [4, 6, 3] } } as never,
        { op: 'scene.node.add', nodeId: idFactory('rim'), type: 'light.point', name: 'Rim Light', transform: { position: [-4, 3, -3] } } as never,
      ];
    }
    case 'stinger-3d': {
      const title = options.title ?? 'Logo';
      return [
        { op: 'scene.node.add', nodeId: idFactory('backdrop'), type: 'stage.backdrop', name: 'Backdrop' } as never,
        { op: 'scene.node.add', nodeId: idFactory('glow'), type: 'stage.particles', name: 'Glow Accent' } as never,
        { op: 'scene.node.add', nodeId: nid(idFactory('title'), 't'), type: 'text.title', name: title } as never,
        { op: 'scene.node.add', nodeId: idFactory('ring'), type: 'geometry.ring', name: 'Accent Ring', transform: { position: [0, 0, 0] } } as never,
        { op: 'scene.node.add', nodeId: idFactory('camera'), type: 'camera.perspective', name: 'Camera' } as never,
        { op: 'scene.node.add', nodeId: idFactory('key'), type: 'light.directional', name: 'Key Light' } as never,
      ];
    }
    case 'data-viz': {
      const title = options.title ?? 'Metrics';
      return [
        { op: 'scene.node.add', nodeId: idFactory('grid'), type: 'stage.grid', name: 'Grid' } as never,
        { op: 'scene.node.add', nodeId: nid(idFactory('title'), 't'), type: 'text.title', name: title } as never,
        { op: 'scene.node.add', nodeId: idFactory('bar1'), type: 'geometry.box', name: 'Bar 1', transform: { position: [-1.2, 0.5, 0], scale: [0.5, 1.0, 0.5] } } as never,
        { op: 'scene.node.add', nodeId: idFactory('bar2'), type: 'geometry.box', name: 'Bar 2', transform: { position: [0, 0.8, 0], scale: [0.5, 1.6, 0.5] } } as never,
        { op: 'scene.node.add', nodeId: idFactory('bar3'), type: 'geometry.box', name: 'Bar 3', transform: { position: [1.2, 0.65, 0], scale: [0.5, 1.3, 0.5] } } as never,
        { op: 'scene.node.add', nodeId: idFactory('camera'), type: 'camera.perspective', name: 'Camera' } as never,
      ];
    }
    default:
      throw new Error(`Unknown motion recipe: "${recipeId}"`);
  }
}
