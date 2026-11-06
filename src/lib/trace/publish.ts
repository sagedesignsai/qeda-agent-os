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

import type { TraceProject } from './types';
import { ensureStoryboard, getStoryboardDuration } from './storyboard';

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
export function normalizeTraceProjectForPublish(
  input: unknown,
  record: TracePublishSourceRecord,
): TraceProject {
  const source =
    input && typeof input === 'object'
      ? (input as Partial<TraceProject>)
      : (record.data as TraceProject);

  const project: TraceProject = {
    ...(source as TraceProject),
    id: record.id,
    name:
      typeof source.name === 'string' && source.name.trim()
        ? source.name.trim()
        : record.name,
    width: Math.max(1, Math.round(source.width || record.width || 1280)),
    height: Math.max(1, Math.round(source.height || record.height || 720)),
    durationMs: Math.max(
      1,
      Math.round(source.durationMs || record.durationMs || 4000),
    ),
    fps: Math.max(1, Math.round(source.fps || record.fps || 60)),
    elements: source.elements || {},
    rootElementIds: source.rootElementIds || [],
    audioTracks: source.audioTracks || [],
  };

  // Legacy projects and in-flight editor snapshots may not have a storyboard
  // yet. Normalise it before it becomes the immutable published snapshot.
  project.storyboard = ensureStoryboard(project);
  project.durationMs =
    getStoryboardDuration(project.storyboard) || project.durationMs;

  return project;
}
