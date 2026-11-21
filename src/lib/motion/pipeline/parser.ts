/**
 * lib/motion/pipeline/parser.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * DSL Parser and Compiler for Motion pipelines.
 *
 * Converts declarative YAML/JSON DSL into executable MotionPipeline objects.
 * Handles:
 *   - YAML/JSON parsing
 *   - Parameter interpolation ({{param}})
 *   - Nested pipeline call expansion
 *   - Validation and error reporting
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  validatePipelineSchema,
  extractParameterNames,
  isParameterReference,
  motionPipelineSchema,
} from './schema';
import type {
  MotionPipeline,
  PipelineStep,
  PipelineParameter,
  PipelineValidationError,
  PipelineError,
} from './types';

// ── YAML Parser (Simple, no external dependency) ────────────────────────────────

/**
 * Very basic YAML parser for pipeline DSL.
 * Handles the subset of YAML used in pipelines (no anchors, aliases, complex structures).
 * For production, consider using a full YAML library.
 */
export function parseYAML(input: string): unknown {
  try {
    // Try JSON first (YAML is a superset of JSON)
    return JSON.parse(input);
  } catch {
    // Fall back to simple YAML parsing
    return parseSimpleYAML(input);
  }
}

/**
 * Simple YAML parser for basic use cases.
 * Converts YAML strings to objects for pipeline definitions.
 */
function parseSimpleYAML(input: string): unknown {
  const lines = input.split('\n');
  const result: Record<string, unknown> = {};
  const stack: Array<{ depth: number; key: string; value: Record<string, unknown> | unknown[] }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Calculate indentation
    const depth = line.search(/\S/);

    // Parse key: value pairs
    if (trimmed.includes(':')) {
      const [keyPart, valuePart] = trimmed.split(':').map((s) => s.trim());

      // Pop stack to find current parent
      while (stack.length > 0 && stack[stack.length - 1].depth >= depth) {
        stack.pop();
      }

      // Parse value
      let value: unknown = parseYAMLValue(valuePart || '');

      // Add to current context
      if (stack.length === 0) {
        result[keyPart] = value;
      } else {
        const parent = stack[stack.length - 1];
        if (Array.isArray(parent.value)) {
          parent.value.push({ [keyPart]: value });
        } else if (typeof parent.value === 'object' && parent.value !== null) {
          (parent.value as Record<string, unknown>)[keyPart] = value;
        }
      }

      // Track for nested structures
      if (valuePart === '' || valuePart === '[]' || valuePart === '{}') {
        const newValue = valuePart === '[]' ? [] : {};
        stack.push({ depth, key: keyPart, value: newValue });

        if (stack.length === 1) {
          result[keyPart] = newValue;
        } else {
          const parent = stack[stack.length - 2];
          if (Array.isArray(parent.value)) {
            parent.value.push({ [keyPart]: newValue });
          } else if (typeof parent.value === 'object') {
            (parent.value as Record<string, unknown>)[keyPart] = newValue;
          }
        }
      }
    }
    // Parse array items (- item)
    else if (trimmed.startsWith('-')) {
      const itemValue = trimmed.slice(1).trim();

      while (stack.length > 0 && stack[stack.length - 1].depth >= depth) {
        stack.pop();
      }

      if (stack.length > 0 && Array.isArray(stack[stack.length - 1].value)) {
        const arr = stack[stack.length - 1].value as unknown[];
        if (itemValue.startsWith('{') || itemValue.includes(':')) {
          arr.push(parseYAMLValue(itemValue));
        } else {
          arr.push(itemValue);
        }
      }
    }
  }

  return result;
}

/**
 * Parse a YAML value (string, number, boolean, null, or object).
 */
function parseYAMLValue(value: string): unknown {
  const trimmed = value.trim();

  if (trimmed === '' || trimmed === 'null') return null;
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (!isNaN(Number(trimmed))) return Number(trimmed);
  if (trimmed.startsWith('"') || trimmed.startsWith("'")) {
    return trimmed.slice(1, -1);
  }
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    return JSON.parse(trimmed);
  }

  return trimmed;
}

// ── DSL Compiler ───────────────────────────────────────────────────────────────

/**
 * Parse a DSL string (YAML or JSON) into a MotionPipeline.
 */
export function parsePipelineDSL(input: string): {
  pipeline: MotionPipeline | null;
  errors: PipelineValidationError[];
} {
  try {
    const parsed = parseYAML(input);

    // Validate against schema
    const result = validatePipelineSchema(parsed);
    if (!result.valid) {
      return { pipeline: null, errors: result.errors };
    }

    return { pipeline: parsed as MotionPipeline, errors: [] };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown parsing error';
    return {
      pipeline: null,
      errors: [
        {
          path: 'root',
          message: `Failed to parse DSL: ${message}`,
          code: 'INVALID_VALUE',
        },
      ],
    };
  }
}

/**
 * Compile a pipeline DSL into normalized form with validation.
 * Performs:
 *   - Parameter extraction
 *   - Step validation
 *   - Reference checking
 */
export function compilePipelineDSL(
  input: string,
  options: { validateReferences?: boolean } = {},
): {
  pipeline: MotionPipeline | null;
  errors: PipelineValidationError[];
  warnings: string[];
} {
  const parseResult = parsePipelineDSL(input);
  if (!parseResult.pipeline) {
    return { pipeline: null, errors: parseResult.errors, warnings: [] };
  }

  const pipeline = parseResult.pipeline;
  const errors: PipelineValidationError[] = [];
  const warnings: string[] = [];

  // Extract all parameter references from steps
  const paramReferences = new Set<string>();
  extractStepParameterReferences(pipeline.steps, paramReferences);

  // Warn about unused parameters
  const declaredParams = new Set(pipeline.params.map((p) => p.name));
  for (const ref of paramReferences) {
    if (!declaredParams.has(ref)) {
      errors.push({
        path: `steps`,
        message: `Parameter "${ref}" is used but not declared in params`,
        code: 'INVALID_REFERENCE',
      });
    }
  }

  // Warn about unused declared parameters
  for (const param of pipeline.params) {
    if (!paramReferences.has(param.name)) {
      warnings.push(`Parameter "${param.name}" is declared but never used`);
    }
  }

  if (errors.length > 0) {
    return { pipeline: null, errors, warnings };
  }

  return { pipeline, errors: [], warnings };
}

/**
 * Extract all parameter references from a step and its children.
 */
function extractStepParameterReferences(steps: PipelineStep[], refs: Set<string>): void {
  for (const step of steps) {
    if (step.op === 'op') {
      extractObjectParameterReferences(step.params, refs);
    } else if (step.op === 'call') {
      if (step.params) {
        extractObjectParameterReferences(step.params, refs);
      }
    } else if (step.op === 'branch') {
      extractStepParameterReferences(step.then, refs);
      if (step.else) {
        extractStepParameterReferences(step.else, refs);
      }
    } else if (step.op === 'loop') {
      extractObjectParameterReferences(step.over, refs);
      extractStepParameterReferences(step.body, refs);
    } else if (step.op === 'sequence') {
      extractStepParameterReferences(step.steps, refs);
    }
  }
}

/**
 * Recursively extract parameter references from an object.
 */
function extractObjectParameterReferences(obj: unknown, refs: Set<string>): void {
  if (typeof obj === 'string' && isParameterReference(obj)) {
    const matches = obj.match(/\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g);
    if (matches) {
      for (const match of matches) {
        const paramName = match.slice(2, -2);
        refs.add(paramName);
      }
    }
  } else if (typeof obj === 'object' && obj !== null) {
    if (Array.isArray(obj)) {
      for (const item of obj) {
        extractObjectParameterReferences(item, refs);
      }
    } else {
      for (const value of Object.values(obj)) {
        extractObjectParameterReferences(value, refs);
      }
    }
  }
}

// ── Interpolation ──────────────────────────────────────────────────────────────

/**
 * Interpolate parameter values into a pipeline.
 * Replaces all {{paramName}} with provided values.
 */
export function interpolatePipelineParams(
  pipeline: MotionPipeline,
  params: Record<string, unknown>,
): {
  pipeline: MotionPipeline;
  errors: PipelineError[];
} {
  const errors: PipelineError[] = [];

  // Validate all required parameters are provided
  for (const param of pipeline.params) {
    if (param.required && !(param.name in params)) {
      errors.push({
        message: `Required parameter "${param.name}" is not provided`,
        code: 'INVALID_PARAM',
        context: { paramName: param.name },
      });
    }
  }

  if (errors.length > 0) {
    return { pipeline, errors };
  }

  // Use defaults for missing parameters
  const mergedParams = { ...params };
  for (const param of pipeline.params) {
    if (!(param.name in mergedParams) && param.defaultValue !== undefined) {
      mergedParams[param.name] = param.defaultValue;
    }
  }

  // Interpolate all steps
  const interpolated = interpolateSteps(pipeline.steps, mergedParams);

  return {
    pipeline: {
      ...pipeline,
      steps: interpolated,
    },
    errors,
  };
}

/**
 * Recursively interpolate steps with parameter values.
 */
function interpolateSteps(steps: PipelineStep[], params: Record<string, unknown>): PipelineStep[] {
  return steps.map((step) => interpolateStep(step, params));
}

/**
 * Interpolate a single step.
 */
function interpolateStep(step: PipelineStep, params: Record<string, unknown>): PipelineStep {
  if (step.op === 'op') {
    return {
      op: 'op',
      params: interpolateObject(step.params, params) as typeof step.params,
    };
  } else if (step.op === 'call') {
    return {
      op: 'call',
      pipelineId: interpolateString(step.pipelineId, params),
      params: step.params ? (interpolateObject(step.params, params) as typeof step.params) : undefined,
    };
  } else if (step.op === 'branch') {
    return {
      op: 'branch',
      condition: interpolateCondition(step.condition, params),
      then: interpolateSteps(step.then, params),
      else: step.else ? interpolateSteps(step.else, params) : undefined,
    };
  } else if (step.op === 'loop') {
    return {
      op: 'loop',
      over: interpolateObject(step.over, params) as typeof step.over,
      body: interpolateSteps(step.body, params),
    };
  } else if (step.op === 'sequence') {
    return {
      op: 'sequence',
      steps: interpolateSteps(step.steps, params),
    };
  }

  return step;
}

/**
 * Interpolate a condition by replacing parameter references.
 */
function interpolateCondition(condition: any, params: Record<string, unknown>): any {
  if (condition.type === 'property-value') {
    return {
      ...condition,
      nodeId: interpolateString(condition.nodeId, params),
      property: interpolateString(condition.property, params),
    };
  } else if (condition.type === 'node-exists' || condition.type === 'clip-exists') {
    const idKey = condition.type === 'node-exists' ? 'nodeId' : 'clipId';
    return {
      ...condition,
      [idKey]: interpolateString(condition[idKey], params),
    };
  }

  return condition;
}

/**
 * Interpolate an object by replacing all parameter references in values.
 */
function interpolateObject(obj: unknown, params: Record<string, unknown>): unknown {
  if (typeof obj === 'string') {
    return interpolateString(obj, params);
  } else if (typeof obj === 'object' && obj !== null) {
    if (Array.isArray(obj)) {
      return obj.map((item) => interpolateObject(item, params));
    } else {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = interpolateObject(value, params);
      }
      return result;
    }
  }

  return obj;
}

/**
 * Interpolate a string by replacing {{paramName}} with values.
 */
export function interpolateString(str: string, params: Record<string, unknown>): string {
  return str.replace(/\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g, (match, paramName) => {
    const value = params[paramName];
    if (value === undefined) {
      return match; // Leave unreplaced if param not found
    }
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    return JSON.stringify(value);
  });
}

// ── Serialization ──────────────────────────────────────────────────────────────

/**
 * Convert a pipeline to YAML string.
 */
export function pipelineToYAML(pipeline: MotionPipeline): string {
  return pipelineToYAMLInternal(pipeline, 0);
}

function pipelineToYAMLInternal(obj: any, indent: number = 0): string {
  const spaces = ' '.repeat(indent);
  const lines: string[] = [];

  if (typeof obj !== 'object' || obj === null) {
    return String(obj);
  }

  if (Array.isArray(obj)) {
    for (const item of obj) {
      if (typeof item === 'object' && item !== null) {
        lines.push(`${spaces}-`);
        const itemStr = pipelineToYAMLInternal(item, indent + 2);
        lines.push(itemStr);
      } else {
        lines.push(`${spaces}- ${item}`);
      }
    }
  } else {
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'object' && value !== null) {
        lines.push(`${spaces}${key}:`);
        const valueStr = pipelineToYAMLInternal(value, indent + 2);
        lines.push(valueStr);
      } else if (typeof value === 'string' && (value.includes('\n') || value.includes(':'))) {
        lines.push(`${spaces}${key}: "${value}"`);
      } else {
        lines.push(`${spaces}${key}: ${value}`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Convert a pipeline to JSON string.
 */
export function pipelineToJSON(pipeline: MotionPipeline): string {
  return JSON.stringify(pipeline, null, 2);
}
