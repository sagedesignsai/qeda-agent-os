/**
 * lib/trace/blocks/index.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The Trace block registry: one searchable catalogue of insertable, editable
 * fragments for the editor and the copilot.
 *
 * Registry entries are metadata + a pure builder. `insertBlock` writes the
 * resulting fragment through the ordinary `insertFragment` op, so a block has no
 * special editing behaviour after insertion — it is just layers and tracks.
 */

import { staticSvgMarkup } from '../serialize/svg-markup';
import { toTraceProject } from '../assets/types';
import {
  applyStyleToFragment,
  stylePalette,
  type TraceLookPalette,
} from '../look';
import type { RecipeFieldSpec } from '../recipes/fields';
import {
  backgroundTreatmentBlock,
  bulletListBlock,
  calloutBlock,
  deviceFrameBlock,
  logoEndCardBlock,
  quoteCardBlock,
  titleCardBlock,
} from './builders';
import { createBlockIdFactory } from './helpers';
import {
  barChartBlock,
  counterBlock,
  kineticTextBlock,
  lowerThirdBlock,
  progressRingBlock,
} from './recipes';
import type {
  BlockCategory,
  BlockSearchOptions,
  TraceBlockDefinition,
} from './types';
import type { TraceStyle } from '../types';
import { ADDON_BLOCKS, TRACE_ADDONS } from '../addons';

export type {
  BlockBuildContext,
  BlockCategory,
  BlockLayer,
  BlockSearchOptions,
  TraceBlockDefinition,
} from './types';

export { TRACE_ADDONS };
export { getTraceAddon } from '../addons';
export type {
  TraceAddonDefinition,
  TraceAddonGenerator,
  TraceAddonId,
} from '../addons';

export {
  backgroundTreatmentBlock,
  bulletListBlock,
  calloutBlock,
  deviceFrameBlock,
  logoEndCardBlock,
  quoteCardBlock,
  titleCardBlock,
  barChartBlock,
  counterBlock,
  kineticTextBlock,
  lowerThirdBlock,
  progressRingBlock,
};

/** Display order for the library and search grouping. */
export const BLOCK_CATEGORIES: readonly BlockCategory[] = [
  'Titles',
  'Lower thirds',
  'Data',
  'Callouts',
  'Social',
  'Backgrounds',
];

export const TRACE_BLOCKS: readonly TraceBlockDefinition[] = [
  titleCardBlock,
  kineticTextBlock,
  quoteCardBlock,
  bulletListBlock,
  lowerThirdBlock,
  counterBlock,
  progressRingBlock,
  barChartBlock,
  calloutBlock,
  deviceFrameBlock,
  logoEndCardBlock,
  backgroundTreatmentBlock,
  ...ADDON_BLOCKS,
];

const BLOCK_BY_ID = new Map(
  TRACE_BLOCKS.map((block) => [block.id, block] as const),
);

export function getBlock(id: string): TraceBlockDefinition | undefined {
  return BLOCK_BY_ID.get(id);
}

function cloneDefaults(
  defaults: Record<string, unknown>,
): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...defaults };
  if (Array.isArray(defaults.bars)) {
    copy.bars = (defaults.bars as Array<Record<string, unknown>>).map((bar) => ({
      ...bar,
    }));
  }
  return copy;
}

export function blockDefaults(
  block: TraceBlockDefinition,
): Record<string, unknown> {
  return cloneDefaults(block.defaults);
}

/* ── Search ────────────────────────────────────────────────────────────────── */

function normalized(value: string): string {
  return value.toLowerCase().replace(/[_-]+/g, ' ').trim();
}

function scoreBlock(
  block: TraceBlockDefinition,
  tokens: string[],
  query: string,
): number {
  const title = normalized(block.title);
  const id = normalized(block.id);
  const tags = block.tags.map(normalized);
  const keywords = (block.keywords ?? []).map(normalized);
  const category = normalized(block.category);
  const description = normalized(block.description);

  let score = 0;
  if (query === title || query === id) score += 120;

  for (const token of tokens) {
    if (title.includes(token)) score += 30;
    if (id.includes(token)) score += 26;
    if (tags.some((tag) => tag === token)) score += 24;
    else if (tags.some((tag) => tag.includes(token))) score += 16;
    if (keywords.some((keyword) => keyword.includes(token))) score += 14;
    if (category.includes(token)) score += 8;
    if (description.includes(token)) score += 5;
  }

  return score;
}

/**
 * Rank blocks against a free-text query. No query returns the catalogue in
 * display order (Titles first), which is what the library dialog shows.
 */
export function searchBlocks(
  query = '',
  options: BlockSearchOptions = {},
): TraceBlockDefinition[] {
  const limit = Math.max(1, Math.min(options.limit ?? 50, 100));
  const category = options.category
    ? normalized(options.category)
    : null;
  const candidates = TRACE_BLOCKS.filter(
    (block) => !category || normalized(block.category) === category,
  );

  const text = normalized(query);
  if (!text) return candidates.slice(0, limit);

  const tokens = text.split(/\s+/).filter(Boolean);
  return candidates
    .map((block) => ({ block, score: scoreBlock(block, tokens, text) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.block);
}

/* ── Options ───────────────────────────────────────────────────────────────── */

function isBars(value: unknown): value is Array<Record<string, unknown>> {
  return Array.isArray(value);
}

/**
 * Coerce form/tool input against the block's declared fields. Unknown keys are
 * dropped, numbers clamp, selects must match an option, and defaults fill gaps.
 * `x`/`y` are allowed through as placement overrides (they are not form fields).
 */
export function sanitizeBlockOptions(
  block: TraceBlockDefinition,
  values: Record<string, unknown> = {},
): Record<string, unknown> {
  const result = blockDefaults(block);

  for (const field of block.fields) {
    const raw = values[field.key];
    if (raw === undefined || raw === null) continue;

    if (field.kind === 'text') {
      let text = String(raw).trim();
      if (field.maxLength) text = text.slice(0, field.maxLength);
      if (text) result[field.key] = text;
      continue;
    }

    if (field.kind === 'number') {
      const number = Number(raw);
      if (!Number.isFinite(number)) continue;
      result[field.key] = Math.min(field.max, Math.max(field.min, number));
      continue;
    }

    if (field.kind === 'color') {
      const color = String(raw).trim();
      if (color) result[field.key] = color;
      continue;
    }

    if (field.kind === 'select') {
      const next = String(raw);
      if (field.options.some((option) => option.value === next)) {
        result[field.key] = next;
      }
      continue;
    }

    if (field.kind === 'bars') {
      if (!isBars(raw)) continue;
      const cleaned = raw
        .slice(0, 8)
        .map((bar, index) => {
          const value = Number(bar?.value);
          return {
            label: String(bar?.label ?? `Q${index + 1}`).slice(0, 24),
            value: Number.isFinite(value) ? value : 0,
            ...(typeof bar?.color === 'string' ? { color: bar.color } : {}),
          };
        });
      if (cleaned.length > 0) result[field.key] = cleaned;
    }
  }

  for (const key of ['x', 'y'] as const) {
    const number = Number(values[key]);
    if (Number.isFinite(number)) result[key] = number;
  }

  return result;
}

export interface BlockInstantiateContext {
  canvas: { width: number; height: number };
  idFactory?: (prefix: string) => string;
  /** Project look; fills colour options the caller did not specify. */
  style?: TraceStyle;
}

/**
 * Which palette role a colour field should inherit when the caller leaves it
 * unset. This is how a project look reaches blocks without every builder
 * learning about styles.
 */
const STYLE_ROLE_BY_FIELD: Record<string, keyof TraceLookPalette> = {
  accentColor: 'accent',
  progressColor: 'accent',
  glowColor: 'accent',
  textColor: 'text',
  fill: 'text',
  baseColor: 'background',
  cardBg: 'surface',
  frameColor: 'surface',
  trackColor: 'surface',
};

export function instantiateBlock(
  blockId: string,
  values: Record<string, unknown> = {},
  context: BlockInstantiateContext,
): {
  block: TraceBlockDefinition;
  options: Record<string, unknown>;
  fragment: ReturnType<TraceBlockDefinition['build']>;
} {
  const block = getBlock(blockId);
  if (!block) throw new Error(`Unknown block "${blockId}".`);

  const seeded: Record<string, unknown> = { ...values };
  if (context.style) {
    const palette = stylePalette(context.style);
    for (const field of block.fields) {
      if (seeded[field.key] !== undefined) continue;
      const role = STYLE_ROLE_BY_FIELD[field.key];
      if (role) seeded[field.key] = palette[role];
    }
  }

  const options = sanitizeBlockOptions(block, seeded);
  const fragment = block.build({
    options,
    idFactory: context.idFactory ?? createBlockIdFactory(),
    canvas: context.canvas,
    ...(context.style ? { style: context.style } : {}),
  });
  applyStyleToFragment(fragment, context.style);
  return { block, options, fragment };
}

/** Parameters the copilot needs in order to call `insertBlock` correctly. */
export interface BlockParameterSummary {
  key: string;
  label: string;
  kind: RecipeFieldSpec['kind'];
  default: unknown;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  maxLength?: number;
  multiline?: boolean;
  options?: ReadonlyArray<{ value: string; label: string }>;
}

export function describeBlockParameters(
  block: TraceBlockDefinition,
): BlockParameterSummary[] {
  return block.fields.map((field) => {
    const base: BlockParameterSummary = {
      key: field.key,
      label: field.label,
      kind: field.kind,
      default: block.defaults[field.key],
    };
    if (field.kind === 'number') {
      return {
        ...base,
        min: field.min,
        max: field.max,
        ...(field.step !== undefined ? { step: field.step } : {}),
        ...(field.suffix ? { suffix: field.suffix } : {}),
      };
    }
    if (field.kind === 'text') {
      return {
        ...base,
        ...(field.maxLength ? { maxLength: field.maxLength } : {}),
        ...(field.multiline ? { multiline: true } : {}),
      };
    }
    if (field.kind === 'select') {
      return { ...base, options: field.options };
    }
    return base;
  });
}

/* ── Previews ──────────────────────────────────────────────────────────────── */

export function blockPreviewProject(
  block: TraceBlockDefinition,
  values: Record<string, unknown> = {},
  style?: TraceStyle,
) {
  const { fragment } = instantiateBlock(block.id, values, {
    canvas: block.size,
    idFactory: createBlockIdFactory(),
    ...(style ? { style } : {}),
  });
  return toTraceProject(
    fragment,
    block.title,
    block.previewDurationMs ?? 3200,
  );
}

export function blockPreviewSvg(
  block: TraceBlockDefinition,
  values: Record<string, unknown> = {},
  timeMs = block.previewTimeMs ?? 1400,
  style?: TraceStyle,
): string {
  const project = blockPreviewProject(block, values, style);
  return staticSvgMarkup(project, timeMs, {
    size: false,
    scenePresentation: false,
    camera: false,
  });
}