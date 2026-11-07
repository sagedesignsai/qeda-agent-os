/**
 * lib/trace/serialize/thumbnail.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Generates a static SVG thumbnail for a Trace project at a representative
 * time point. Used for project list cards and template previews.
 *
 * The thumbnail is a compact SVG string suitable for inline rendering via
 * dangerouslySetInnerHTML or as a data URI.
 */

import { migrateTraceProject } from '../migrate';
import { staticSvgMarkup } from './svg-markup';
import type { TraceProject } from '../types';

export interface ThumbnailOptions {
  /** Target width in CSS pixels for the preview container. */
  width?: number;
  /** Target height in CSS pixels for the preview container. */
  height?: number;
  /** Time in milliseconds to render the frame. Defaults to project midpoint. */
  timeMs?: number;
  /** Background color for the thumbnail. Defaults to dark slate. */
  background?: string;
}

/**
 * Generate a static SVG thumbnail for a Trace project.
 *
 * Renders the project at its midpoint (or a custom time) and returns a
 * compact SVG string with a viewBox matching the project canvas. The SVG
 * is self-contained with all gradients, filters, and defs inlined.
 */
export function generateProjectThumbnail(
  project: TraceProject,
  options: ThumbnailOptions = {},
): string {
  const migrated = migrateTraceProject(project);
  const {
    width,
    height,
    timeMs = Math.floor(migrated.durationMs / 2),
    background = '#0f172a',
  } = options;

  // Clamp time to project duration
  const clampedTime = Math.max(0, Math.min(timeMs, migrated.durationMs));

  // Generate the static SVG markup
  const svg = staticSvgMarkup(migrated, clampedTime, { background });

  // If target dimensions are provided, wrap in a container that scales the SVG
  if (width && height) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">${svg}</svg>`;
  }

  return svg;
}

/**
 * Generate a thumbnail for a template by instantiating it first.
 */
export function generateTemplateThumbnail(
  templateCreate: () => TraceProject,
  options: ThumbnailOptions = {},
): string {
  try {
    const project = templateCreate();
    return generateProjectThumbnail(project, options);
  } catch {
    // Return a minimal placeholder if template creation fails
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${options.width ?? 300}" height="${options.height ?? 169}" viewBox="0 0 ${options.width ?? 300} ${options.height ?? 169}"><rect width="100%" height="100%" fill="#0f172a"/></svg>`;
  }
}
