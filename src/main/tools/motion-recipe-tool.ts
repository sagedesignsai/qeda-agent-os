/**
 * main/tools/motion-recipe-tool.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * applyMotionRecipe — senior-designer patterns as op batches.
 * Mirrors Trace applyRecipe: one call expands to many ops atomically.
 */

import { tool } from 'ai';
import { z } from 'zod';
import { planMotionCommand, describeMotionEngine } from '../../lib/motion/engine-contract.js';
import { expandMotionRecipe, listMotionRecipes } from '../../lib/motion/recipes';
import type { MotionToolContext } from './motion';

export function createMotionRecipeTool(context: MotionToolContext) {
  const applyMotionRecipe = tool({
    description:
      'Apply a senior-designer composition recipe as one atomic op batch. ' +
      'Recipes: product-hero (pedestal shot), stinger-3d (logo reveal stage), data-viz (chart trio). ' +
      'Prefer a recipe over hand-sequencing nodes when the brief matches one.',
    inputSchema: z.object({
      recipeId: z.enum(['product-hero', 'stinger-3d', 'data-viz']),
      productType: z.string().optional().describe('For product-hero: product.box|mug|bottle|can'),
      title: z.string().optional().describe('Hero/title label.'),
      sceneId: z.string().optional(),
      reason: z.string().max(500).optional(),
    }),
    execute: async ({ recipeId, productType, title, sceneId, reason }) => {
      try {
        const ops = expandMotionRecipe(recipeId, { productType, title });
        // sceneId override: expandMotionRecipe doesn't take it; ops target active scene by default.
        void sceneId;
        void reason;
        const document = context.getDocument();
        const plan = planMotionCommand(document, ops as never, { now: new Date().toISOString() });
        const applied = context.apply(plan);
        return {
          success: true,
          kind: 'motion-recipe' as const,
          recipeId,
          operationCount: plan.ops.length,
          recipes: listMotionRecipes().map((r) => r.id),
          manifest: describeMotionEngine(),
          ...applied,
        };
      } catch (error) {
        return {
          success: false,
          kind: 'motion-recipe' as const,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });

  return { applyMotionRecipe };
}

export type MotionRecipeTool = ReturnType<typeof createMotionRecipeTool>;
