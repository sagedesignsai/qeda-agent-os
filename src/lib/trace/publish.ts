/**
 * lib/trace/publish.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Produces the immutable document that gets published for Nova Trace.
 *
 * The editor snapshot wins when supplied (so publish is WYSIWYG even if the
 * debounced autosave has not fired yet). Record metadata is only a fallback for
 * legacy rows and missing fields.
 *
 * Adapted from sagedesigns-os lib/motion/publish.ts.
 */

import { documentFromStage, stageOf } from './document';
import { createBlankTraceStage } from './defaults';
import { migrateTraceDocument } from './migrate';
import { ensureStoryboard, getStoryboardDuration } from './storyboard';
import type { TraceDocument, TraceStage } from './types';

export interface TracePublishSourceRecord {
  id: string;
  name: string;
  width: number;
  height: number;
  durationMs: number;
  fps: number;
  data: unknown;
}

/**
 * Produces the immutable document that gets published.
 *
 * The editor snapshot wins when supplied (so publish is WYSIWYG even if the
 * debounced autosave has not fired yet). Record metadata is only a fallback for
 * legacy rows and missing fields.
 */
export function normalizeTraceDocumentForPublish(
  input: unknown,
  record: TracePublishSourceRecord,
): TraceDocument {
  let base: TraceStage;
  try {
    base = stageOf(migrateTraceDocument(input).project);
  } catch {
    base = stageOf(migrateTraceDocument(record.data).project);
  }

  const stage: TraceStage = {
    ...base,
    id: record.id,
    name: base.name?.trim() ? base.name.trim() : record.name,
    width: Math.max(1, Math.round(base.width || record.width || 1280)),
    height: Math.max(1, Math.round(base.height || record.height || 720)),
    durationMs: Math.max(
      1,
      Math.round(base.durationMs || record.durationMs || 4000),
    ),
    fps: Math.max(1, Math.round(base.fps || record.fps || 60)),
    elements: base.elements ?? {},
    rootElementIds: base.rootElementIds ?? [],
    audioTracks: base.audioTracks ?? [],
  };

  // Legacy projects and in-flight editor snapshots may not have a storyboard
  // yet. Normalise it before it becomes the immutable published snapshot.
  stage.storyboard = ensureStoryboard(stage);
  stage.durationMs = getStoryboardDuration(stage.storyboard) || stage.durationMs;

  return documentFromStage(stage);
}
