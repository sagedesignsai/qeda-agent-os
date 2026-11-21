/**
 * lib/motion/pipeline/schema.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Zod schemas for validating pipeline definitions and DSL input.
 *
 * Ensures pipelines conform to the type system and can be safely executed.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { z } from 'zod';
import type {
  MotionPipeline,
  PipelineStep,
  StepCondition,
  LoopSource,
  PipelineParameter,
  PipelineValidationResult,
  PipelineValidationError,
} from './types';

// ── Condition Schema ───────────────────────────────────────────────────────────

export const stepConditionSchema: z.ZodType<StepCondition> = z.discriminatedUnion(
  'type',
  [
    z.object({
      type: z.literal('node-exists'),
      nodeId: z.string().min(1),
    }),
    z.object({
      type: z.literal('property-value'),
      nodeId: z.string().min(1),
      property: z.string().min(1),
      operator: z.enum(['<', '>', '==', '!=', '<=', '>=']),
      value: z.number().finite(),
    }),
    z.object({
      type: z.literal('clip-exists'),
      clipId: z.string().min(1),
    }),
    z.object({
      type: z.literal('track-exists'),
      trackId: z.string().min(1),
    }),
    z.object({
      type: z.literal('asset-exists'),
      assetId: z.string().min(1),
    }),
  ],
);

// ── Loop Source Schema ─────────────────────────────────────────────────────────

export const loopSourceSchema: z.ZodType<LoopSource> = z.discriminatedUnion(
  'type',
  [
    z.object({
      type: z.literal('nodes'),
      nodeType: z.string().min(1).optional(),
    }),
    z.object({
      type: z.literal('clips'),
    }),
    z.object({
      type: z.literal('tracks'),
    }),
    z.object({
      type: z.literal('assets'),
      kind: z.enum(['image', 'image-sequence', 'video', 'audio', 'font', 'model', 'environment']).optional(),
    }),
    z.object({
      type: z.literal('collection'),
      items: z.array(z.unknown()),
    }),
  ],
);

// ── Pipeline Step Schema (Lazy to avoid circular references) ──────────────────

export const pipelineStepSchema: z.ZodType<PipelineStep> = z.lazy(() =>
  z.discriminatedUnion('op', [
    z.object({
      op: z.literal('op'),
      params: z.record(z.string(), z.unknown()), // MotionOpRequest validation deferred
    }),
    z.object({
      op: z.literal('call'),
      pipelineId: z.string().min(1),
      params: z.record(z.string(), z.unknown()).optional(),
    }),
    z.object({
      op: z.literal('branch'),
      condition: stepConditionSchema,
      then: z.array(pipelineStepSchema),
      else: z.array(pipelineStepSchema).optional(),
    }),
    z.object({
      op: z.literal('loop'),
      over: loopSourceSchema,
      body: z.array(pipelineStepSchema),
    }),
    z.object({
      op: z.literal('sequence'),
      steps: z.array(pipelineStepSchema),
    }),
  ]),
);

// ── Parameter Schema ───────────────────────────────────────────────────────────

export const pipelineParameterSchema = z.object({
  name: z.string().min(1).regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, 'Parameter name must be valid identifier'),
  type: z.enum(['string', 'number', 'boolean', 'node-id', 'asset-id', 'clip-id']),
  defaultValue: z.unknown().optional(),
  description: z.string().optional(),
  required: z.boolean().optional(),
}) satisfies z.ZodType<PipelineParameter>;

// ── Pipeline Schema ───────────────────────────────────────────────────────────

export const motionPipelineSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9-]+$/, 'Pipeline ID must be lowercase alphanumeric with hyphens'),
  name: z.string().min(1),
  description: z.string().min(1),
  params: z.array(pipelineParameterSchema).default([]),
  steps: z.array(pipelineStepSchema).min(1, 'Pipeline must have at least one step'),
  category: z.enum(['template', 'recipe', 'composite', 'custom']).optional(),
  tags: z.array(z.string()).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  version: z.number().int().positive().optional(),
  notes: z.string().optional(),
}) satisfies z.ZodType<MotionPipeline>;

// ── Validation Functions ───────────────────────────────────────────────────────

/**
 * Validate a pipeline definition.
 */
export function validatePipelineSchema(pipeline: unknown): PipelineValidationResult {
  try {
    const parsed = motionPipelineSchema.parse(pipeline);
    // Additional semantic validations
    const semanticErrors = validatePipelineSemantics(parsed);
    if (semanticErrors.length > 0) {
      return { valid: false, errors: semanticErrors };
    }
    return { valid: true, errors: [] };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors: PipelineValidationError[] = error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
        code: 'INVALID_TYPE' as const,
      }));
      return { valid: false, errors };
    }
    return {
      valid: false,
      errors: [
        {
          path: 'root',
          message: error instanceof Error ? error.message : 'Unknown validation error',
          code: 'INVALID_TYPE',
        },
      ],
    };
  }
}

/**
 * Additional semantic validations beyond schema structure.
 */
function validatePipelineSemantics(pipeline: MotionPipeline): PipelineValidationError[] {
  const errors: PipelineValidationError[] = [];
  const seenIds = new Set<string>();

  // Check for duplicate parameter names
  const paramNames = new Set<string>();
  for (const param of pipeline.params) {
    if (paramNames.has(param.name)) {
      errors.push({
        path: `params[${pipeline.params.indexOf(param)}].name`,
        message: `Duplicate parameter name: ${param.name}`,
        code: 'DUPLICATE_ID',
      });
    }
    paramNames.add(param.name);
  }

  // Validate step references (deferred to execution time since we don't have doc)
  // But we can check for obvious issues like empty loops
  validateSteps(pipeline.steps, errors, '');

  return errors;
}

/**
 * Recursively validate steps for structural issues.
 */
function validateSteps(
  steps: PipelineStep[],
  errors: PipelineValidationError[],
  path: string,
): void {
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const stepPath = `${path}steps[${i}]`;

    switch (step.op) {
      case 'op': {
        // Op validation deferred to execution time
        break;
      }
      case 'call': {
        if (!step.pipelineId) {
          errors.push({
            path: `${stepPath}.pipelineId`,
            message: 'Pipeline ID is required',
            code: 'MISSING_REQUIRED',
          });
        }
        break;
      }
      case 'branch': {
        if (step.then.length === 0) {
          errors.push({
            path: `${stepPath}.then`,
            message: 'Branch "then" body must not be empty',
            code: 'INVALID_VALUE',
          });
        }
        validateSteps(step.then, errors, `${stepPath}.then.`);
        if (step.else) {
          validateSteps(step.else, errors, `${stepPath}.else.`);
        }
        break;
      }
      case 'loop': {
        if (step.body.length === 0) {
          errors.push({
            path: `${stepPath}.body`,
            message: 'Loop body must not be empty',
            code: 'INVALID_VALUE',
          });
        }
        validateSteps(step.body, errors, `${stepPath}.body.`);
        break;
      }
      case 'sequence': {
        if (step.steps.length === 0) {
          errors.push({
            path: `${stepPath}.steps`,
            message: 'Sequence must contain at least one step',
            code: 'INVALID_VALUE',
          });
        }
        validateSteps(step.steps, errors, `${stepPath}.steps.`);
        break;
      }
    }
  }
}

/**
 * Validate parameter interpolation syntax.
 */
export function validateParameterSyntax(text: string): PipelineValidationError[] {
  const errors: PipelineValidationError[] = [];
  const paramRegex = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;
  let match;

  while ((match = paramRegex.exec(text)) !== null) {
    const paramName = match[1];
    if (!paramName) {
      errors.push({
        path: text,
        message: `Invalid parameter syntax at position ${match.index}`,
        code: 'INTERPOLATION_ERROR',
      });
    }
  }

  return errors;
}

/**
 * Check if a string is a valid parameter reference pattern.
 */
export function isParameterReference(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  return /\{\{[a-zA-Z_][a-zA-Z0-9_]*\}\}/.test(value);
}

/**
 * Extract parameter names from a string.
 */
export function extractParameterNames(text: string): string[] {
  const paramRegex = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;
  const names = new Set<string>();
  let match;

  while ((match = paramRegex.exec(text)) !== null) {
    names.add(match[1]);
  }

  return Array.from(names);
}
