/**
 * lib/trace/lint/types.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Machine-readable diagnostics for Nova Trace projects.
 *
 * These codes are part of the agent-facing contract: an agent should be able to
 * fix a problem from the code and `fix` hint alone, without re-reading the whole
 * document. Keep codes stable once published.
 *
 * Adapted from sagedesigns-os lib/motion/lint/types.ts.
 */

export type DiagnosticSeverity = 'error' | 'warning' | 'info';

export type DiagnosticCode =
  // Operations
  | 'OP_INVALID'
  | 'OP_UNSUPPORTED'
  | 'OP_EXECUTION_ERROR'
  | 'UNKNOWN_OP_TYPE'
  // Element graph
  | 'ELEMENT_NOT_FOUND'
  | 'ELEMENT_CREATE_FAILED'
  | 'ELEMENT_ID_DUPLICATE'
  | 'ORPHAN_ELEMENT'
  | 'ELEMENT_PARENT_MISSING'
  | 'ELEMENT_CHILD_MISSING'
  | 'ELEMENT_ROOT_MISSING'
  | 'ELEMENT_SCENE_MISSING'
  | 'CYCLE_DETECTED'
  | 'ELEMENT_OUT_OF_BOUNDS'
  // Tracks
  | 'TRACK_UNKNOWN_PROPERTY'
  | 'TRACK_TOO_FEW_KEYFRAMES'
  | 'TRACK_INVALID_VALUE'
  | 'KEYFRAME_INVALID_TIME'
  | 'KEYFRAME_OUT_OF_BOUNDS'
  | 'KEYFRAME_OUT_OF_ORDER'
  | 'DUPLICATE_KEYFRAME_TIME'
  // Paint references
  | 'DEF_REF_MISSING'
  // Scenes
  | 'SCENE_NOT_FOUND'
  | 'SCENE_EMPTY'
  // Content
  | 'TEXT_OVERFLOW'
  | 'AUDIO_UNRESOLVED';

export interface Diagnostic {
  code: DiagnosticCode;
  severity: DiagnosticSeverity;
  message: string;
  elementId?: string;
  sceneId?: string;
  timeMs?: number;
  /** Short, actionable hint for an agent or a human. */
  fix?: string;
}

export interface LintResult {
  ok: boolean;
  diagnostics: Diagnostic[];
  errorCount: number;
  warningCount: number;
}

export interface LintOptions {
  /**
   * Check that the first and last keyframe of every track match. Only
   * meaningful for seamless loops; callers pass the project's loop mode.
   */
  loop?: boolean;
}
