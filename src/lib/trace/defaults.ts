/**
 * lib/trace/defaults.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The smallest valid Trace document. Deliberately not a template library: this
 * is only what "New document" needs, so project creation never depends on a
 * preset the user did not ask for.
 */

import { TRACE_DEFAULT_ANIMATION_ID, TRACE_DEFAULT_ARTBOARD_ID } from './schema';
import type { TraceStage } from './types';

export const TRACE_DEFAULT_WIDTH = 1920;
export const TRACE_DEFAULT_HEIGHT = 1080;
export const TRACE_DEFAULT_DURATION_MS = 6000;
export const TRACE_DEFAULT_FPS = 60;

/** A blank editing stage: one empty artboard, one empty animation. */
export function createBlankTraceStage(
  name = 'Untitled Trace',
  overrides: Partial<TraceStage> = {},
): TraceStage {
  return {
    artboardId: TRACE_DEFAULT_ARTBOARD_ID,
    animationId: TRACE_DEFAULT_ANIMATION_ID,
    name,
    width: TRACE_DEFAULT_WIDTH,
    height: TRACE_DEFAULT_HEIGHT,
    durationMs: TRACE_DEFAULT_DURATION_MS,
    fps: TRACE_DEFAULT_FPS,
    elements: {},
    rootElementIds: [],
    ...overrides,
  };
}
