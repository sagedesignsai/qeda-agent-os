/**
 * lib/trace/addons/types.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Trace add-on contract.
 *
 * An add-on is a named content + capability pack. It contributes blocks to the
 * single searchable block registry and may expose a generative specialist tool
 * to the copilot. Add-ons never introduce a parallel insertion path: everything
 * they produce is a `TraceAssetFragment` that goes through `insertFragment`,
 * the fragment validator and the same undo history as hand-authored layers.
 */

import type { TraceBlockDefinition } from '../blocks/types';

export type TraceAddonId = 'surfaces' | 'typography';

export interface TraceAddonGenerator {
  /** Copilot tool name, e.g. `generateSurface`. */
  toolName: string;
  /** One sentence describing what the specialist can create. */
  description: string;
}

export interface TraceAddonDefinition {
  id: TraceAddonId;
  name: string;
  description: string;
  /** Primary block category this add-on enriches. */
  category: TraceBlockDefinition['category'];
  keywords: readonly string[];
  /** Prebuilt blocks contributed to the shared registry. */
  blocks: readonly TraceBlockDefinition[];
  /** Present when the add-on has a generative specialist. */
  generator?: TraceAddonGenerator;
  /** Concise guidance appended to the Trace copilot instructions. */
  guidance: string;
}