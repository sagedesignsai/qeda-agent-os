/**
 * lib/trace/addons/index.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The Trace add-on registry.
 *
 * Add-ons contribute blocks to one shared registry and may expose a generative
 * specialist. They are content packs, not a second editing system: insertion,
 * validation, undo and export remain the core Trace paths.
 */

import type { TraceAddonDefinition, TraceAddonId } from './types';
import { SURFACES_ADDON } from './surfaces';
import { TYPOGRAPHY_ADDON } from './typography';

export type {
  TraceAddonDefinition,
  TraceAddonGenerator,
  TraceAddonId,
} from './types';

export { SURFACES_ADDON, SURFACE_BLOCKS } from './surfaces';
export { TYPOGRAPHY_ADDON, TYPOGRAPHY_BLOCKS } from './typography';

export const TRACE_ADDONS: readonly TraceAddonDefinition[] = [
  SURFACES_ADDON,
  TYPOGRAPHY_ADDON,
];

const ADDON_BY_ID = new Map(
  TRACE_ADDONS.map((addon) => [addon.id, addon] as const),
);

export function getTraceAddon(id: TraceAddonId | string): TraceAddonDefinition | undefined {
  return ADDON_BY_ID.get(id as TraceAddonId);
}

/** Every block contributed by every add-on, in registry order. */
export const ADDON_BLOCKS = TRACE_ADDONS.flatMap((addon) => addon.blocks);

/** Add-on guidance for the copilot, omitted when no add-ons are installed. */
export function traceAddonGuidance(): string {
  return TRACE_ADDONS.map((addon) => addon.guidance).join('\n\n');
}