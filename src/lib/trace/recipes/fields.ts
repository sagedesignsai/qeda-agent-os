/**
 * lib/trace/recipes/fields.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The small set of options each recipe actually honours, and the defaults its
 * compiler already assumes.
 *
 * Recipes used to be inserted at their defaults from the Add menu, while the
 * copilot could pass arbitrary options — so every human insert looked the same
 * and the only way to change a caption was to dig through the expanded group.
 * This module is the single description of "what can you tell this recipe",
 * used by the setup dialog to build its form and to sanitize what comes back.
 *
 * Rules for adding a field here:
 *  - only list a key the compiler reads (a dead control is worse than none);
 *  - defaults must match the compiler's own `options.x ?? …` fallbacks, so a
 *    dialog opened and confirmed unchanged produces exactly today's result.
 */

import type { RecipeId } from './types';

export interface RecipeBar {
  label: string;
  value: number;
  color?: string;
}

export type RecipeFieldSpec =
  | { key: string; label: string; kind: 'text'; placeholder?: string; maxLength?: number }
  | {
      key: string;
      label: string;
      kind: 'number';
      min: number;
      max: number;
      step?: number;
      suffix?: string;
    }
  | { key: string; label: string; kind: 'color'; hint?: string }
  | {
      key: string;
      label: string;
      kind: 'select';
      options: ReadonlyArray<{ value: string; label: string }>;
    }
  | { key: string; label: string; kind: 'bars' };

export interface RecipeSetup {
  title: string;
  /** One line about the motion this recipe builds, shown above the fields. */
  summary: string;
  fields: readonly RecipeFieldSpec[];
  defaults: Record<string, unknown>;
}

/** Bar colours cycle through the accent palette in document order. */
export const RECIPE_BAR_COLORS = [
  '#38bdf8',
  '#22d3ee',
  '#818cf8',
  '#c084fc',
] as const;

const DEFAULT_BARS: RecipeBar[] = [
  { label: 'Q1', value: 45, color: RECIPE_BAR_COLORS[0] },
  { label: 'Q2', value: 78, color: RECIPE_BAR_COLORS[1] },
  { label: 'Q3', value: 62, color: RECIPE_BAR_COLORS[2] },
  { label: 'Q4', value: 95, color: RECIPE_BAR_COLORS[3] },
];

export const RECIPE_SETUPS: Record<RecipeId, RecipeSetup> = {
  counter: {
    title: 'KPI Counter',
    summary: 'A number that rolls up to a target, with an optional caption.',
    fields: [
      { key: 'endVal', label: 'Counts to', kind: 'number', min: 0, max: 1000000, step: 1 },
      { key: 'prefix', label: 'Prefix', kind: 'text', placeholder: '$', maxLength: 8 },
      { key: 'suffix', label: 'Suffix', kind: 'text', placeholder: '%', maxLength: 8 },
      { key: 'caption', label: 'Caption', kind: 'text', placeholder: 'Optional label' },
      { key: 'decimals', label: 'Decimals', kind: 'number', min: 0, max: 3, step: 1 },
      { key: 'fill', label: 'Colour', kind: 'color' },
      {
        key: 'durationMs',
        label: 'Roll for',
        kind: 'number',
        min: 200,
        max: 8000,
        step: 100,
        suffix: 'ms',
      },
    ],
    defaults: {
      endVal: 100,
      prefix: '',
      suffix: '',
      caption: '',
      decimals: 0,
      fill: '#f8fafc',
      durationMs: 1800,
    },
  },

  'progress-ring': {
    title: 'Progress Ring',
    summary: 'A gauge that sweeps from empty to a target percentage.',
    fields: [
      {
        key: 'progress',
        label: 'Progress',
        kind: 'number',
        min: 0,
        max: 100,
        step: 1,
        suffix: '%',
      },
      { key: 'radius', label: 'Radius', kind: 'number', min: 16, max: 200, step: 1, suffix: 'px' },
      { key: 'thickness', label: 'Stroke', kind: 'number', min: 2, max: 40, step: 1, suffix: 'px' },
      { key: 'progressColor', label: 'Indicator', kind: 'color' },
      { key: 'trackColor', label: 'Track', kind: 'color' },
    ],
    defaults: {
      progress: 75,
      radius: 50,
      thickness: 8,
      progressColor: '#38bdf8',
      trackColor: '#1e293b',
    },
  },

  'bar-chart': {
    title: 'Bar Chart',
    summary: 'Bars that grow in from the baseline, one per row of data.',
    fields: [
      { key: 'bars', label: 'Data', kind: 'bars' },
      {
        key: 'orientation',
        label: 'Direction',
        kind: 'select',
        options: [
          { value: 'vertical', label: 'Vertical' },
          { value: 'horizontal', label: 'Horizontal' },
        ],
      },
    ],
    defaults: {
      bars: DEFAULT_BARS,
      orientation: 'vertical',
    },
  },

  'kinetic-text': {
    title: 'Kinetic Text',
    summary: 'A headline revealed word by word, each word its own layer.',
    fields: [
      { key: 'text', label: 'Headline', kind: 'text', placeholder: 'Kinetic typography' },
      { key: 'fontSize', label: 'Size', kind: 'number', min: 12, max: 240, step: 1, suffix: 'px' },
      { key: 'fill', label: 'Colour', kind: 'color' },
      {
        key: 'staggerMs',
        label: 'Stagger',
        kind: 'number',
        min: 0,
        max: 600,
        step: 10,
        suffix: 'ms',
      },
    ],
    defaults: {
      text: 'KINETIC TYPOGRAPHY',
      fontSize: 48,
      fill: '#f8fafc',
      staggerMs: 90,
    },
  },

  'lower-third': {
    title: 'Lower Third',
    summary: 'A broadcast speaker card with an accent reveal.',
    fields: [
      { key: 'title', label: 'Name', kind: 'text', placeholder: 'Speaker name' },
      { key: 'subtitle', label: 'Role', kind: 'text', placeholder: 'Role — Organisation' },
      { key: 'accentColor', label: 'Accent', kind: 'color' },
    ],
    defaults: {
      title: 'Speaker Name',
      subtitle: 'Role — Organisation',
      accentColor: '#38bdf8',
    },
  },
};

export function getRecipeSetup(recipeId: RecipeId): RecipeSetup {
  return RECIPE_SETUPS[recipeId];
}

/** Fresh defaults, safe to mutate in form state (deep enough for bar rows). */
export function recipeDefaults(recipeId: RecipeId): Record<string, unknown> {
  const { defaults } = RECIPE_SETUPS[recipeId];
  const copy: Record<string, unknown> = { ...defaults };
  if (Array.isArray(defaults.bars)) {
    copy.bars = (defaults.bars as RecipeBar[]).map((bar) => ({ ...bar }));
  }
  return copy;
}

function clampNumber(
  value: unknown,
  field: Extract<RecipeFieldSpec, { kind: 'number' }>,
  fallback: number,
): number {
  if (value === '' || value === null || value === undefined) return fallback;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const stepped = field.step === 1 ? Math.round(parsed) : parsed;
  return Math.min(field.max, Math.max(field.min, stepped));
}

function sanitizeBars(value: unknown, fallback: RecipeBar[]): RecipeBar[] {
  if (!Array.isArray(value)) return fallback;
  const rows = value
    .filter((row): row is Record<string, unknown> => !!row && typeof row === 'object')
    .map((row) => ({
      label: String(row.label ?? '').trim().slice(0, 12),
      value:
        typeof row.value === 'number' && Number.isFinite(row.value)
          ? Math.min(1000, Math.max(0, Math.round(row.value)))
          : 0,
    }))
    // A blank row the user never filled is not data; keep anything with either.
    .filter((row) => row.label.length > 0 || row.value > 0)
    .slice(0, 8);

  if (rows.length === 0) return fallback;
  return rows.map((row, index) => ({
    label: row.label || `Item ${index + 1}`,
    value: row.value,
    color: RECIPE_BAR_COLORS[index % RECIPE_BAR_COLORS.length],
  }));
}

/**
 * Turn whatever the dialog collected into the option record the recipe compiler
 * expects, dropping unknown keys and clamping everything into a sane range.
 */
export function sanitizeRecipeOptions(
  recipeId: RecipeId,
  values: Record<string, unknown>,
): Record<string, unknown> {
  const setup = RECIPE_SETUPS[recipeId];
  const options: Record<string, unknown> = {};

  for (const field of setup.fields) {
    const fallback = setup.defaults[field.key];
    const raw = values[field.key];

    switch (field.kind) {
      case 'text': {
        const text = String(raw ?? fallback ?? '').trim();
        options[field.key] = text.slice(0, field.maxLength ?? 120);
        break;
      }
      case 'number': {
        options[field.key] = clampNumber(
          raw,
          field,
          typeof fallback === 'number' ? fallback : field.min,
        );
        break;
      }
      case 'color': {
        const color = String(raw ?? fallback ?? '').trim();
        options[field.key] = color.length > 0 ? color : fallback;
        break;
      }
      case 'select': {
        const value = String(raw ?? fallback ?? '');
        options[field.key] = field.options.some((option) => option.value === value)
          ? value
          : fallback;
        break;
      }
      case 'bars': {
        options[field.key] = sanitizeBars(raw, (fallback as RecipeBar[]) ?? DEFAULT_BARS);
        break;
      }
    }
  }

  return options;
}
