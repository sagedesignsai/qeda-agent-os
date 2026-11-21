/**
 * lib/motion/pipeline/engine.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pipeline Execution Engine with state management, branching, and loops.
 *
 * Executes MotionPipeline definitions step-by-step, handling:
 *   - Linear sequences (ops, calls)
 *   - Conditional branches (if-then-else)
 *   - Loops with variable binding (over nodes, clips, collections)
 *   - Nested structures (recursive execution)
 *   - Error accumulation (don't fail fast)
 *   - Op batching (all ops accumulated for atomic application)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { batchRisk, type MotionOpRequest } from '../ops';
import type {
  MotionDocument,
  MotionNode,
  MotionClip,
  MotionTrack,
  MotionAsset,
} from '../types';
import type {
  MotionPipeline,
  PipelineStep,
  StepCondition,
  LoopSource,
  PipelineExecutionContext,
  PipelineError,
  PipelineResult,
  PipelineExecutionOptions,
} from './types';

// ── Execution Engine ───────────────────────────────────────────────────────────

const DEFAULT_MAX_DEPTH = 10;
const DEFAULT_MAX_LOOP_ITERATIONS = 1000;

export class PipelineExecutor {
  /**
   * Execute a pipeline against a Motion document.
   * Returns accumulated ops, errors, and execution metadata.
   */
  async execute(
    pipeline: MotionPipeline,
    doc: MotionDocument,
    providedParams: Record<string, unknown> = {},
    options: PipelineExecutionOptions = {},
  ): Promise<PipelineResult> {
    const startTime = Date.now();

    // Initialize execution context
    const context: PipelineExecutionContext = {
      doc,
      params: providedParams,
      variables: new Map(),
      ops: [],
      errors: [],
      stepIndex: 0,
      maxDepth: options.maxDepth ?? DEFAULT_MAX_DEPTH,
      currentDepth: 0,
    };

    // Execute all steps
    try {
      await this.executeSteps(pipeline.steps, context, options);
    } catch (error) {
      if (error instanceof Error) {
        context.errors.push({
          message: `Unexpected error during execution: ${error.message}`,
          code: 'OP_ERROR',
        });
      }
    }

    // Classify risk based on ops
    const risk = context.ops.length > 0 ? batchRisk(context.ops) : 'safe';
    const requiresApproval = risk === 'destructive';

    return {
      status: context.errors.length > 0 ? 'error' : 'success',
      ops: context.ops,
      risk,
      requiresApproval,
      errors: context.errors,
      executedSteps: context.stepIndex,
      totalSteps: this.countSteps(pipeline.steps),
      metadata: {
        executionTimeMs: Date.now() - startTime,
        opsGenerated: context.ops.length,
        branchesEvaluated: context.variables.get('_branchCount') as number | undefined,
        loopsIterated: context.variables.get('_loopCount') as number | undefined,
      },
    };
  }

  /**
   * Recursively execute a sequence of steps.
   */
  private async executeSteps(
    steps: PipelineStep[],
    context: PipelineExecutionContext,
    options: PipelineExecutionOptions,
  ): Promise<void> {
    for (let i = 0; i < steps.length; i++) {
      context.stepIndex = i;
      await this.executeStep(steps[i], context, options);

      // Stop on critical errors
      if (context.errors.some((e) => e.code === 'RECURSION_LIMIT')) {
        break;
      }
    }
  }

  /**
   * Execute a single step.
   */
  private async executeStep(
    step: PipelineStep,
    context: PipelineExecutionContext,
    options: PipelineExecutionOptions,
  ): Promise<void> {
    switch (step.op) {
      case 'op':
        this.executeOp(step.params, context);
        break;

      case 'call':
        // Pipeline calls are deferred to execution time
        // For now, we log an error (would be resolved by caller)
        context.errors.push({
          step: context.stepIndex,
          message: `Pipeline calls not yet supported in execution engine (call to "${step.pipelineId}")`,
          code: 'OP_ERROR',
        });
        break;

      case 'branch':
        await this.executeBranch(step, context, options);
        break;

      case 'loop':
        await this.executeLoop(step, context, options);
        break;

      case 'sequence':
        await this.executeSteps(step.steps, context, options);
        break;
    }
  }

  /**
   * Execute a Motion op by adding it to the accumulated list.
   */
  private executeOp(params: MotionOpRequest, context: PipelineExecutionContext): void {
    // Validate op structure (basic check)
    if (!params || typeof params !== 'object') {
      context.errors.push({
        step: context.stepIndex,
        message: 'Invalid op: must be an object',
        code: 'OP_ERROR',
        context: { op: params },
      });
      return;
    }

    // Accumulate op for later application
    context.ops.push(params);
  }

  /**
   * Execute a conditional branch.
   */
  private async executeBranch(
    branch: PipelineStep & { op: 'branch' },
    context: PipelineExecutionContext,
    options: PipelineExecutionOptions,
  ): Promise<void> {
    const branchCount = (context.variables.get('_branchCount') as number | undefined) ?? 0;
    context.variables.set('_branchCount', branchCount + 1);

    // Evaluate condition
    const conditionMet = this.evaluateCondition(branch.condition, context);

    // Execute appropriate branch
    if (conditionMet) {
      await this.executeSteps(branch.then, context, options);
    } else if (branch.else) {
      await this.executeSteps(branch.else, context, options);
    }
  }

  /**
   * Evaluate a condition against the current document.
   */
  private evaluateCondition(condition: StepCondition, context: PipelineExecutionContext): boolean {
    switch (condition.type) {
      case 'node-exists': {
        const nodeExists = context.doc.scenes.some((scene) =>
          scene.nodes.some((node) => node.id === condition.nodeId),
        );
        return nodeExists;
      }

      case 'clip-exists': {
        const clipExists = context.doc.timeline.clips.some((clip) => clip.id === condition.clipId);
        return clipExists;
      }

      case 'track-exists': {
        const trackExists = context.doc.timeline.tracks.some((track) => track.id === condition.trackId);
        return trackExists;
      }

      case 'asset-exists': {
        const assetExists = context.doc.assets.some((asset) => asset.id === condition.assetId);
        return assetExists;
      }

      case 'property-value': {
        return this.evaluatePropertyCondition(condition, context);
      }

      default:
        return false;
    }
  }

  /**
   * Evaluate a property-value condition.
   */
  private evaluatePropertyCondition(
    condition: Extract<StepCondition, { type: 'property-value' }>,
    context: PipelineExecutionContext,
  ): boolean {
    // Find the node
    let node: MotionNode | undefined;
    for (const scene of context.doc.scenes) {
      node = scene.nodes.find((n) => n.id === condition.nodeId);
      if (node) break;
    }

    if (!node) {
      return false;
    }

    // Get property value
    const value = this.getNodeProperty(node, condition.property);
    if (value === undefined) {
      return false;
    }

    // Evaluate comparison
    const numValue = typeof value === 'number' ? value : Number(value);
    const threshold = condition.value;

    switch (condition.operator) {
      case '<':
        return numValue < threshold;
      case '>':
        return numValue > threshold;
      case '==':
        return numValue === threshold;
      case '!=':
        return numValue !== threshold;
      case '<=':
        return numValue <= threshold;
      case '>=':
        return numValue >= threshold;
      default:
        return false;
    }
  }

  /**
   * Get a property value from a node (supports dot notation like "position.x").
   */
  private getNodeProperty(node: MotionNode, property: string): unknown {
    const parts = property.split('.');
    let current: any = node;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = current[part];
    }

    return current;
  }

  /**
   * Execute a loop over a collection.
   */
  private async executeLoop(
    loop: PipelineStep & { op: 'loop' },
    context: PipelineExecutionContext,
    options: PipelineExecutionOptions,
  ): Promise<void> {
    // Check recursion depth
    const currentDepth = (context.currentDepth ?? 0) + 1;
    if (currentDepth > (context.maxDepth ?? DEFAULT_MAX_DEPTH)) {
      context.errors.push({
        step: context.stepIndex,
        message: `Maximum recursion depth (${context.maxDepth}) exceeded`,
        code: 'RECURSION_LIMIT',
      });
      return;
    }

    // Get items to iterate over
    const items = this.resolveLoopSource(loop.over, context);
    if (!items) {
      return; // No items to iterate
    }

    const maxIterations = options.maxLoopIterations ?? DEFAULT_MAX_LOOP_ITERATIONS;
    if (items.length > maxIterations) {
      context.errors.push({
        step: context.stepIndex,
        message: `Loop iteration count (${items.length}) exceeds maximum (${maxIterations})`,
        code: 'LOOP_LIMIT',
      });
      return;
    }

    // Execute loop body for each item
    const loopCount = (context.variables.get('_loopCount') as number | undefined) ?? 0;
    context.variables.set('_loopCount', loopCount + items.length);

    for (const item of items) {
      // Bind loop variable
      const prevLoopVar = context.variables.get('loopVar');
      context.variables.set('loopVar', item);

      // Execute body
      const prevDepth = context.currentDepth;
      context.currentDepth = currentDepth;

      await this.executeSteps(loop.body, context, options);

      // Restore state
      context.currentDepth = prevDepth;
      if (prevLoopVar === undefined) {
        context.variables.delete('loopVar');
      } else {
        context.variables.set('loopVar', prevLoopVar);
      }
    }
  }

  /**
   * Resolve a loop source into an array of items.
   */
  private resolveLoopSource(source: LoopSource, context: PipelineExecutionContext): any[] | null {
    switch (source.type) {
      case 'nodes': {
        let nodes: MotionNode[] = [];
        for (const scene of context.doc.scenes) {
          nodes = nodes.concat(scene.nodes);
        }

        // Filter by type if specified
        if (source.nodeType) {
          nodes = nodes.filter((n) => n.type === source.nodeType);
        }

        return nodes;
      }

      case 'clips': {
        return context.doc.timeline.clips;
      }

      case 'tracks': {
        return context.doc.timeline.tracks;
      }

      case 'assets': {
        let assets = context.doc.assets;

        // Filter by kind if specified
        if (source.kind) {
          assets = assets.filter((a) => a.kind === source.kind);
        }

        return assets;
      }

      case 'collection': {
        return source.items;
      }

      default:
        return null;
    }
  }

  /**
   * Count total steps in a pipeline (for progress reporting).
   */
  private countSteps(steps: PipelineStep[]): number {
    let count = 0;

    for (const step of steps) {
      count += 1; // Count the step itself

      if (step.op === 'branch') {
        count += this.countSteps(step.then);
        if (step.else) {
          count += this.countSteps(step.else);
        }
      } else if (step.op === 'loop') {
        // Assume at least 1 iteration for counting
        count += this.countSteps(step.body);
      } else if (step.op === 'sequence') {
        count += this.countSteps(step.steps);
      }
    }

    return count;
  }
}

// ── Helper Functions ───────────────────────────────────────────────────────────

/**
 * Create and execute a pipeline in one call.
 */
export async function executePipeline(
  pipeline: MotionPipeline,
  doc: MotionDocument,
  params: Record<string, unknown> = {},
  options: PipelineExecutionOptions = {},
): Promise<PipelineResult> {
  const executor = new PipelineExecutor();
  return executor.execute(pipeline, doc, params, options);
}

/**
 * Validate a pipeline can execute without errors (dry run).
 */
export async function validatePipelineExecution(
  pipeline: MotionPipeline,
  doc: MotionDocument,
  params: Record<string, unknown> = {},
): Promise<{
  valid: boolean;
  errors: PipelineError[];
}> {
  const result = await executePipeline(pipeline, doc, params, { dryRun: true });

  return {
    valid: result.status === 'success',
    errors: result.errors,
  };
}
