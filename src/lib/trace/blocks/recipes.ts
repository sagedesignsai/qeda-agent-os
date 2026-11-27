/**
 * lib/trace/blocks/recipes.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Recipe adapters. The five existing recipes are exposed as registry blocks so
 * the editor and the copilot have one searchable catalogue, without a second
 * implementation of the same geometry.
 *
 * Anchors are canvas-relative so a lower third sits in the lower third on 16:9,
 * 1:1 and 9:16 — the recipe compilers keep their own fixed local geometry.
 */

import { expandRecipe } from '../recipes';
import { RECIPE_SETUPS } from '../recipes/fields';
import type { RecipeId } from '../recipes/types';
import { fragmentFromExpanded, optionNumber } from './helpers';
import type { BlockCategory, TraceBlockDefinition } from './types';

interface RecipeBlockMeta {
  description: string;
  category: BlockCategory;
  tags: readonly string[];
  keywords?: readonly string[];
  /** Canvas-relative anchor for the recipe's x/y options. */
  anchorX: number;
  anchorY: number;
  size: { width: number; height: number };
  previewTimeMs?: number;
}

function recipeBlock(
  recipeId: RecipeId,
  meta: RecipeBlockMeta,
): TraceBlockDefinition {
  const setup = RECIPE_SETUPS[recipeId];
  return {
    id: recipeId,
    title: setup.title,
    description: meta.description,
    category: meta.category,
    tags: meta.tags,
    ...(meta.keywords ? { keywords: meta.keywords } : {}),
    fields: setup.fields,
    defaults: setup.defaults,
    size: meta.size,
    previewTimeMs: meta.previewTimeMs ?? 1600,
    previewDurationMs: 3600,
    build: ({ options, idFactory, canvas }) => {
      const x = optionNumber(options, 'x', canvas.width * meta.anchorX);
      const y = optionNumber(options, 'y', canvas.height * meta.anchorY);
      const expanded = expandRecipe(
        recipeId,
        { ...options, x, y },
        idFactory,
      );
      return fragmentFromExpanded(expanded, canvas.width, canvas.height);
    },
  };
}

export const lowerThirdBlock = recipeBlock('lower-third', {
  description:
    'Broadcast speaker card: accent bar grows, name slides in, role fades underneath.',
  category: 'Lower thirds',
  tags: ['lower third', 'speaker', 'name', 'broadcast'],
  keywords: ['name card', 'speaker card', 'caption bar', 'interview'],
  anchorX: 0.06,
  anchorY: 0.68,
  size: { width: 640, height: 360 },
});

export const counterBlock = recipeBlock('counter', {
  description:
    'A KPI number that steps up to its target with an optional label beneath.',
  category: 'Data',
  tags: ['counter', 'number', 'stat', 'kpi'],
  keywords: ['stat', 'metric', 'number roll', 'kpi', 'revenue'],
  anchorX: 0.08,
  anchorY: 0.24,
  size: { width: 640, height: 360 },
});

export const progressRingBlock = recipeBlock('progress-ring', {
  description:
    'A circular arc that draws to a target percentage, with an optional label.',
  category: 'Data',
  tags: ['ring', 'progress', 'percentage', 'gauge'],
  keywords: ['progress ring', 'donut', 'gauge', 'percentage', 'efficiency'],
  anchorX: 0.62,
  anchorY: 0.22,
  size: { width: 480, height: 480 },
});

export const barChartBlock = recipeBlock('bar-chart', {
  description:
    'Bars that grow from zero in sequence, each labelled — a quick quarterly or category chart.',
  category: 'Data',
  tags: ['chart', 'bars', 'data', 'comparison'],
  keywords: ['bar chart', 'graph', 'quarters', 'comparison', 'data viz'],
  anchorX: 0.52,
  anchorY: 0.34,
  size: { width: 640, height: 480 },
});

export const kineticTextBlock = recipeBlock('kinetic-text', {
  description:
    'A headline revealed word by word with a staggered slide-and-fade.',
  category: 'Titles',
  tags: ['kinetic', 'type', 'headline', 'words'],
  keywords: ['kinetic text', 'kinetic type', 'word reveal', 'headline', 'typography'],
  anchorX: 0.08,
  anchorY: 0.44,
  size: { width: 900, height: 300 },
});