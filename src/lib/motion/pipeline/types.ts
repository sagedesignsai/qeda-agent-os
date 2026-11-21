/**
 * lib/motion/pipeline/types.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Core types for Motion System Programmable Usage Pipeline.
 *
 * Defines the declarative AST, execution context, and result types for
 * composing complex Motion workflows as reusable, versionable pipelines.
 *
 * Pipelines expand to Motion ops only (no new mutation surface) and inherit
 * Motion's risk classification, approval gating, and deterministic evaluation.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { MotionOpRequest, MotionOpRisk } from '../ops';
import type { MotionDocument } from '../types';
import type { MotionPlan } from '../plan';

// ── Step Conditions ────────────────────────────────────────────────────────────

/**
 * Condition for branching execution. Evaluated against the current document.
 */
export type StepCondition =
  | { type: 'node-exists'; nodeId: string }
  | {
      type: 'property-value';
      nodeId: string;
      property: string; // e.g., "position.x", "opacity", "material.emissive"
      operator: '<' | '>' | '==' | '!=' | '<=' | '>=';
      value: number;
    }
  | { type: 'clip-exists'; clipId: string }
  | { type: 'track-exists'; trackId: string }
  | { type: 'asset-exists'; assetId: string };

// ── Loop Sources ───────────────────────────────────────────────────────────────

/**
 * Defines what to iterate over in a loop step.
 */
export type LoopSource =
  | { type: 'nodes'; nodeType?: string } // All nodes (optionally filtered by type)
  | { type: 'clips' } // All clips in timeline
  | { type: 'tracks' } // All tracks in timeline
  | { type: 'assets'; kind?: string } // All assets (optionally filtered by kind)
  | { type: 'collection'; items: unknown[] }; // Explicit collection

// ── Pipeline Steps ────────────────────────────────────────────────────────────

/**
 * A single step in a pipeline. Steps are composable and can be:
 * - Direct Motion ops
 * - Calls to other pipelines
 * - Conditional branches
 * - Loops over collections
 * - Sequences of steps
 */
export type PipelineStep =
  | { op: 'op'; params: MotionOpRequest }
  | { op: 'call'; pipelineId: string; params?: Record<string, unknown> }
  | {
      op: 'branch';
      condition: StepCondition;
      then: PipelineStep[];
      else?: PipelineStep[];
    }
  | { op: 'loop'; over: LoopSource; body: PipelineStep[] }
  | { op: 'sequence'; steps: PipelineStep[] };

// ── Pipeline Parameters ────────────────────────────────────────────────────────

/**
 * Input parameter to a pipeline. Supports default values and templates.
 * Parameters are interpolated using {{paramName}} syntax in DSL.
 */
export interface PipelineParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'node-id' | 'asset-id' | 'clip-id';
  defaultValue?: unknown;
  description?: string;
  required?: boolean;
}

// ── Pipeline Definition ────────────────────────────────────────────────────────

/**
 * A reusable, versionable pipeline definition.
 * Pipelines are declarative workflows that expand to Motion ops.
 */
export interface MotionPipeline {
  /** Unique identifier (e.g., "product-hero", "build-hero-with-zoom") */
  id: string;

  /** Human-readable name */
  name: string;

  /** Description of what the pipeline does */
  description: string;

  /** Input parameters (can be interpolated in steps) */
  params: PipelineParameter[];

  /** Ordered sequence of execution steps */
  steps: PipelineStep[];

  /** Category for organizing pipelines */
  category?: 'template' | 'recipe' | 'composite' | 'custom';

  /** Tags for searching and filtering */
  tags?: string[];

  /** ISO 8601 timestamp when pipeline was created */
  createdAt: string;

  /** ISO 8601 timestamp when pipeline was last updated */
  updatedAt: string;

  /** Optional version number for tracking changes */
  version?: number;

  /** Optional notes for maintainers */
  notes?: string;
}

// ── Execution Context ──────────────────────────────────────────────────────────

/**
 * Context passed through pipeline execution. Threaded through all steps,
 * accumulating ops and maintaining execution state.
 */
export interface PipelineExecutionContext {
  /** Current Motion document (immutable, not mutated during execution) */
  doc: MotionDocument;

  /** Input parameters ({{param}} values interpolated from user input) */
  params: Record<string, unknown>;

  /** Variables bound during execution (loop iterations, intermediate values) */
  variables: Map<string, unknown>;

  /** Accumulated ops to be applied atomically */
  ops: MotionOpRequest[];

  /** Errors encountered during execution */
  errors: PipelineError[];

  /** Current step index (for error reporting) */
  stepIndex?: number;

  /** Maximum recursion depth (prevent infinite loops) */
  maxDepth?: number;

  /** Current recursion depth */
  currentDepth?: number;
}

// ── Pipeline Errors ───────────────────────────────────────────────────────────

/**
 * Error encountered during pipeline execution.
 * Accumulates errors instead of failing fast for better diagnostics.
 */
export interface PipelineError {
  /** Step index where error occurred */
  step?: number;

  /** Human-readable error message */
  message: string;

  /** Machine-readable error code */
  code:
    | 'INVALID_PARAM'
    | 'MISSING_NODE'
    | 'MISSING_CLIP'
    | 'MISSING_ASSET'
    | 'CONDITION_FAILED'
    | 'OP_ERROR'
    | 'RECURSION_LIMIT'
    | 'LOOP_LIMIT'
    | 'TYPE_MISMATCH'
    | 'INTERPOLATION_ERROR';

  /** Additional context (e.g., parameter name, node id) */
  context?: Record<string, unknown>;
}

// ── Execution Result ───────────────────────────────────────────────────────────

/**
 * Result of executing a pipeline.
 * Contains the ops to be applied, approval status, and diagnostic info.
 */
export interface PipelineResult {
  /** Execution status */
  status: 'success' | 'error' | 'pending-approval';

  /** Accumulated Motion ops (ready to apply to document) */
  ops: MotionOpRequest[];

  /** Motion plan (for approval gating, if destructive) */
  plan?: MotionPlan;

  /** Risk classification inherited from ops */
  risk?: MotionOpRisk;

  /** Whether execution requires user approval */
  requiresApproval?: boolean;

  /** Errors encountered during execution (if any) */
  errors: PipelineError[];

  /** Number of steps executed before stopping (success or error) */
  executedSteps: number;

  /** Total number of steps in pipeline */
  totalSteps: number;

  /** Diagnostic metadata */
  metadata?: {
    executionTimeMs: number;
    opsGenerated: number;
    branchesEvaluated: number;
    loopsIterated: number;
  };
}

// ── Execution Options ──────────────────────────────────────────────────────────

/**
 * Options controlling pipeline execution behavior.
 */
export interface PipelineExecutionOptions {
  /** If true, collect ops without applying them */
  dryRun?: boolean;

  /** Whether to gate execution behind user approval */
  requiresApproval?: boolean;

  /** Maximum recursion depth (prevent infinite loops) */
  maxDepth?: number;

  /** Maximum iterations per loop (prevent infinite loops) */
  maxLoopIterations?: number;

  /** ISO 8601 timestamp for deterministic evaluation */
  now?: string;

  /** Summary text for approval request */
  summary?: string;

  /** Reason for executing (logged and shown in approval UI) */
  reason?: string;
}

// ── Registry ───────────────────────────────────────────────────────────────────

/**
 * Registry interface for managing pipeline definitions.
 */
export interface PipelineRegistry {
  register(pipeline: MotionPipeline): void;
  unregister(pipelineId: string): void;
  get(pipelineId: string): MotionPipeline | undefined;
  list(category?: string): MotionPipeline[];
  search(query: string): MotionPipeline[];
}

// ── Validation Result ──────────────────────────────────────────────────────────

/**
 * Result of validating a pipeline definition.
 */
export interface PipelineValidationError {
  path: string; // e.g., "steps[0].params.nodeId"
  message: string;
  code:
    | 'INVALID_TYPE'
    | 'MISSING_REQUIRED'
    | 'INVALID_VALUE'
    | 'DUPLICATE_ID'
    | 'INVALID_REFERENCE';
}

export interface PipelineValidationResult {
  valid: boolean;
  errors: PipelineValidationError[];
}
