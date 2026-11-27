/**
 * lib/trace/export/preflight.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Export preflight for Trace compositions: the blocking conditions a render
 * cannot recover from, and the warnings it can.
 *
 * Pure so the render host and tests share one definition.
 */

import type { TraceProject } from '../types';
import type { TraceExportSettings } from './presets';

export interface TracePreflightIssue {
  code: string;
  severity: 'blocking' | 'warning';
  message: string;
}

export function preflightTraceExport(
  project: TraceProject,
  settings: TraceExportSettings,
): TracePreflightIssue[] {
  const issues: TracePreflightIssue[] = [];

  if (project.durationMs <= 0) {
    issues.push({
      code: 'TRACE_EXPORT_NO_DURATION',
      severity: 'blocking',
      message: 'The composition has no duration to render.',
    });
  }
  if (project.width <= 0 || project.height <= 0) {
    issues.push({
      code: 'TRACE_EXPORT_NO_CANVAS',
      severity: 'blocking',
      message: 'The composition canvas has no size.',
    });
  }
  if (project.rootElementIds.length === 0) {
    issues.push({
      code: 'TRACE_EXPORT_EMPTY',
      severity: 'blocking',
      message: 'The composition has no elements to render.',
    });
  }

  const narrationLines = project.narration?.lines ?? [];
  if (narrationLines.length > 0) {
    const unmeasured = narrationLines.filter(
      (line) => typeof line.durationMs !== 'number' || line.durationMs <= 0,
    );
    if (unmeasured.length > 0) {
      issues.push({
        code: 'TRACE_EXPORT_NARRATION_UNMEASURED',
        severity: 'warning',
        message:
          `${unmeasured.length} narration line(s) have no generated audio; ` +
          'the exported video will be silent for them.',
      });
    }
    const missingAssets = narrationLines.filter(
      (line) =>
        typeof line.durationMs === 'number' &&
        line.durationMs > 0 &&
        !line.ttsAssetId,
    );
    if (missingAssets.length > 0) {
      issues.push({
        code: 'TRACE_EXPORT_NARRATION_MISSING_ASSET',
        severity: 'warning',
        message:
          `${missingAssets.length} measured narration line(s) have no voice asset; ` +
          'the exported video will be silent for them.',
      });
    }
  }

  return issues;
}