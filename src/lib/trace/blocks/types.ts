/**
 * lib/trace/blocks/types.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The Trace block registry contract.
 *
 * A block is a named, parameterised, insertable fragment: elements plus tracks
 * that become ordinary editable layers. Blocks are pure data builders (no React,
 * no DOM, no store), so the editor, the copilot and tests share one definition.
 *
 * Existing recipes are adapted into blocks rather than duplicated, so there is
 * one searchable surface for "what can I insert?".
 */

import type { TraceAssetFragment } from '../assets/types';
import type { RecipeFieldSpec } from '../recipes/fields';
import type { TraceStyle } from '../types';

export type BlockCategory =
  | 'Titles'
  | 'Lower thirds'
  | 'Data'
  | 'Social'
  | 'Backgrounds'
  | 'Callouts';

/** Blocks that paint the whole frame insert at the back of the stack. */
export type BlockLayer = 'foreground' | 'background';

export interface BlockBuildContext {
  /** Sanitised option values (defaults merged in). */
  options: Record<string, unknown>;
  /** Collision-resistant ids; `insertFragment` re-suffixes on insertion. */
  idFactory: (prefix: string) => string;
  /** Target canvas, so a block lands correctly on any aspect ratio. */
  canvas: { width: number; height: number };
  /** Project look tokens; palette/font defaults apply where options are unset. */
  style?: TraceStyle;
}

export interface TraceBlockDefinition {
  id: string;
  title: string;
  description: string;
  category: BlockCategory;
  tags: readonly string[];
  /** Extra search terms: synonyms a user or agent might type. */
  keywords?: readonly string[];
  /** Options the builder actually reads, with the same spec the recipe UI uses. */
  fields: readonly RecipeFieldSpec[];
  defaults: Record<string, unknown>;
  /** Approximate footprint, used for preview canvases. */
  size: { width: number; height: number };
  /** Default paint order on insertion. */
  layer?: BlockLayer;
  /** Frame used for the registry card preview. */
  previewTimeMs?: number;
  /** Length of the preview project; must cover the block's own tracks. */
  previewDurationMs?: number;
  build: (context: BlockBuildContext) => TraceAssetFragment;
}

export interface BlockSearchOptions {
  category?: string;
  limit?: number;
}