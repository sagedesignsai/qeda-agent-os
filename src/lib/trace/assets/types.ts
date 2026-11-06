/**
 * lib/trace/assets/types.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Reusable asset fragments for Nova Trace.
 *
 * A fragment is a normalized, self-contained slice of a TraceProject: elements,
 * roots, defs and gradients with no database or renderer attached. Inserting a
 * fragment never needs a DOM parser, so it stays testable in Jest.
 *
 * Adapted from sagedesigns-os lib/motion/assets/types.ts. Character rig and
 * pose payloads are deliberately omitted — Trace v1 has no character system.
 */

import type { TraceElement, TraceGradient, TraceProject } from '../types';

export type TraceAssetKind = 'vector' | 'scene' | 'character' | 'part' | 'pose';

export type TraceAssetSource =
  'upload' | 'github' | 'r2' | 'ai' | 'library' | 'api';

export interface TraceAssetFragment {
  width: number;
  height: number;
  viewBox?: string;
  elements: Record<string, TraceElement>;
  rootElementIds: string[];
  defs?: string;
  gradients?: Record<string, TraceGradient>;
}

export interface TraceAssetMetadata {
  schemaVersion: number;
  tags: string[];
  layerCount: number;
  originalFilename?: string;
  palette?: Record<string, string>;
  [key: string]: unknown;
}

export const TRACE_ASSET_SCHEMA_VERSION = 1;

/** Wrap a fragment in a throwaway project so it can be previewed or linted. */
export function toTraceProject(
  fragment: TraceAssetFragment,
  name = 'Asset Preview',
  durationMs = 1000,
): TraceProject {
  return {
    id: `asset-preview-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    name,
    width: fragment.width,
    height: fragment.height,
    durationMs,
    fps: 60,
    elements: fragment.elements,
    rootElementIds: fragment.rootElementIds,
    defs: fragment.defs,
    gradients: fragment.gradients,
  };
}
