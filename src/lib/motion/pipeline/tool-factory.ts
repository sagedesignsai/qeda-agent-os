import { MotionPipeline, PipelineExecutionResult } from './types';
import { executePipeline } from './engine';
import { pipelineToMotionPlan } from './approval';
import { MotionDocument } from '../types';

/**
 * Tool parameter definition for agent tools
 */
export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required?: boolean;
  enum?: string[];
  default?: any;
}

/**
 * Generated tool definition for AI agents
 */
export interface GeneratedPipelineTool {
  name: string;
  description: string;
  parameters: ToolParameter[];
  category: string;
  risk: 'safe' | 'mutating' | 'destructive';
  requiresApproval: boolean;
  pipelineId: string;
  version: string;
}

/**
 * Tool invocation result
 */
export interface ToolInvocationResult {
  status: 'success' | 'error';
  pipelineId: string;
  executionResult?: PipelineExecutionResult;
  plan?: any;
  error?: string;
  requiresApproval?: boolean;
  approvalMetadata?: any;
}

/**
 * Generate a tool definition from a pipeline
 *
 * @param pipeline - Pipeline to generate tool from
 * @returns Tool definition ready for agent integration
 */
export function generateToolFromPipeline(pipeline: MotionPipeline): GeneratedPipelineTool {
  // Determine risk by analyzing steps
  const risk = estimatePipelineRisk(pipeline);

  // Create parameters from pipeline params
  const parameters: ToolParameter[] = (pipeline.params || []).map(param => ({
    name: param,
    type: 'string',
    description: `Parameter: ${param}`,
    required: true,
  }));

  // Add optional document parameter
  parameters.push({
    name: 'documentId',
    type: 'string',
    description: 'ID of the Motion document to apply pipeline to',
    required: false,
  });

  const tool: GeneratedPipelineTool = {
    name: `pipeline_${pipeline.id}`,
    description:
      pipeline.description ||
      `Execute pipeline: ${pipeline.name || pipeline.id}`,
    parameters,
    category: pipeline.tags?.[0] || 'pipeline',
    risk,
    requiresApproval: risk === 'destructive',
    pipelineId: pipeline.id,
    version: '1.0.0',
  };

  return tool;
}

/**
 * Estimate pipeline risk by analyzing steps
 *
 * @param pipeline - Pipeline to analyze
 * @returns Risk classification
 */
export function estimatePipelineRisk(
  pipeline: MotionPipeline
): 'safe' | 'mutating' | 'destructive' {
  // Check for destructive operations
  const hasDestructive = checkForDestructiveOps(pipeline);
  if (hasDestructive) return 'destructive';

  // Check for mutating operations
  const hasMutating = checkForMutatingOps(pipeline);
  if (hasMutating) return 'mutating';

  return 'safe';
}

/**
 * Check if pipeline contains destructive operations
 */
function checkForDestructiveOps(pipeline: MotionPipeline): boolean {
  const destructivePatterns = [
    'delete',
    'remove',
    'destroy',
    'clear',
    'reset',
    'drop',
  ];

  return pipeline.steps.some(step => {
    if (step.op === 'op') {
      const opType = (step as any).params?.op || '';
      return destructivePatterns.some(pattern =>
        opType.toLowerCase().includes(pattern)
      );
    }
    return false;
  });
}

/**
 * Check if pipeline contains mutating operations
 */
function checkForMutatingOps(pipeline: MotionPipeline): boolean {
  const mutatingPatterns = ['create', 'update', 'set', 'add', 'modify'];

  return pipeline.steps.some(step => {
    if (step.op === 'op') {
      const opType = (step as any).params?.op || '';
      return mutatingPatterns.some(pattern =>
        opType.toLowerCase().includes(pattern)
      );
    }
    return false;
  });
}

/**
 * Create tool definition for approval-gated pipeline execution
 *
 * @param pipeline - Pipeline to create tool for
 * @returns Tool definition for copilot integration
 */
export function createApprovalGatedTool(
  pipeline: MotionPipeline
): GeneratedPipelineTool {
  const tool = generateToolFromPipeline(pipeline);

  // Add approval metadata to description
  if (tool.requiresApproval) {
    tool.description += ' (⚠️ Requires user approval)';
  }

  return tool;
}

/**
 * Generate tool for direct pipeline execution (no approval)
 *
 * @param pipeline - Pipeline to create tool for
 * @returns Tool definition for safe pipelines
 */
export function createDirectExecutionTool(
  pipeline: MotionPipeline
): GeneratedPipelineTool {
  const tool = generateToolFromPipeline(pipeline);

  // Mark as direct execution
  tool.description += ' (✓ Safe to execute directly)';

  return tool;
}

/**
 * Generate multiple tools from a list of pipelines
 *
 * @param pipelines - Array of pipelines
 * @param approvalRequired - Whether to generate approval-gated versions
 * @returns Array of tool definitions
 */
export function generateToolsFromPipelines(
  pipelines: MotionPipeline[],
  approvalRequired: boolean = false
): GeneratedPipelineTool[] {
  return pipelines.map(pipeline => {
    if (approvalRequired) {
      return createApprovalGatedTool(pipeline);
    } else {
      return createDirectExecutionTool(pipeline);
    }
  });
}

/**
 * Create a callable tool function for agent execution
 *
 * @param pipeline - Pipeline definition
 * @param docProvider - Function to get the motion document
 * @returns Tool function that agents can call
 */
export function createToolFunction(
  pipeline: MotionPipeline,
  docProvider: () => MotionDocument
) {
  return async (params: Record<string, any>): Promise<ToolInvocationResult> => {
    try {
      const doc = docProvider();

      // Execute pipeline with parameters
      const executionResult = await executePipeline(pipeline, doc, params);

      if (executionResult.status !== 'success') {
        return {
          status: 'error',
          pipelineId: pipeline.id,
          error: `Execution failed: ${executionResult.errors?.[0]?.message || 'Unknown error'}`,
          executionResult,
        };
      }

      // Create approval plan
      const plan = pipelineToMotionPlan(executionResult, pipeline, doc);

      return {
        status: 'success',
        pipelineId: pipeline.id,
        executionResult,
        plan,
        requiresApproval: executionResult.requiresApproval,
        approvalMetadata: plan.metadata?.pipeline,
      };
    } catch (error) {
      return {
        status: 'error',
        pipelineId: pipeline.id,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  };
}

/**
 * Tool registry for managing available pipeline tools
 */
export class PipelineToolRegistry {
  private tools: Map<string, GeneratedPipelineTool> = new Map();
  private pipelines: Map<string, MotionPipeline> = new Map();

  /**
   * Register a pipeline as a tool
   */
  register(pipeline: MotionPipeline): GeneratedPipelineTool {
    const tool = generateToolFromPipeline(pipeline);
    this.tools.set(tool.name, tool);
    this.pipelines.set(pipeline.id, pipeline);
    return tool;
  }

  /**
   * Register multiple pipelines
   */
  registerMany(pipelines: MotionPipeline[]): GeneratedPipelineTool[] {
    return pipelines.map(p => this.register(p));
  }

  /**
   * Get tool by name
   */
  getTool(name: string): GeneratedPipelineTool | undefined {
    return this.tools.get(name);
  }

  /**
   * Get all tools
   */
  getAllTools(): GeneratedPipelineTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get tools by category
   */
  getToolsByCategory(category: string): GeneratedPipelineTool[] {
    return this.getAllTools().filter(t => t.category === category);
  }

  /**
   * Get tools by risk level
   */
  getToolsByRisk(risk: 'safe' | 'mutating' | 'destructive'): GeneratedPipelineTool[] {
    return this.getAllTools().filter(t => t.risk === risk);
  }

  /**
   * Get pipeline by ID
   */
  getPipeline(id: string): MotionPipeline | undefined {
    return this.pipelines.get(id);
  }

  /**
   * Unregister a pipeline
   */
  unregister(pipelineId: string): boolean {
    const pipeline = this.pipelines.get(pipelineId);
    if (!pipeline) return false;

    const tool = this.getTool(`pipeline_${pipelineId}`);
    if (tool) {
      this.tools.delete(tool.name);
    }
    this.pipelines.delete(pipelineId);
    return true;
  }

  /**
   * Clear all registered tools
   */
  clear(): void {
    this.tools.clear();
    this.pipelines.clear();
  }

  /**
   * Get registry statistics
   */
  getStats(): {
    totalTools: number;
    byRisk: Record<string, number>;
    byCategory: Record<string, number>;
  } {
    const tools = this.getAllTools();
    const byRisk: Record<string, number> = {
      safe: 0,
      mutating: 0,
      destructive: 0,
    };
    const byCategory: Record<string, number> = {};

    tools.forEach(tool => {
      byRisk[tool.risk]++;
      byCategory[tool.category] = (byCategory[tool.category] || 0) + 1;
    });

    return {
      totalTools: tools.length,
      byRisk,
      byCategory,
    };
  }
}

/**
 * Helper to convert tool to AI SDK format (for Vercel AI SDK)
 *
 * @param tool - Generated pipeline tool
 * @returns Tool definition in AI SDK format
 */
export function convertToAISDKTool(tool: GeneratedPipelineTool): Record<string, any> {
  return {
    name: tool.name,
    description: tool.description,
    parameters: {
      type: 'object',
      properties: Object.fromEntries(
        tool.parameters.map(param => [
          param.name,
          {
            type: param.type,
            description: param.description,
            enum: param.enum,
          },
        ])
      ),
      required: tool.parameters
        .filter(p => p.required)
        .map(p => p.name),
    },
  };
}

/**
 * Generate tool schema for documentation
 *
 * @param tool - Generated pipeline tool
 * @returns Markdown documentation
 */
export function generateToolDocumentation(tool: GeneratedPipelineTool): string {
  const lines: string[] = [];

  lines.push(`## \`${tool.name}\``);
  lines.push('');
  lines.push(tool.description);
  lines.push('');
  lines.push(`**Risk Level:** ${tool.risk.toUpperCase()}`);
  if (tool.requiresApproval) {
    lines.push('**Requires Approval:** Yes ⚠️');
  }
  lines.push(`**Category:** \`${tool.category}\``);
  lines.push('');

  if (tool.parameters.length > 0) {
    lines.push('### Parameters');
    lines.push('');
    tool.parameters.forEach(param => {
      const required = param.required ? ' (required)' : ' (optional)';
      const type = `\`${param.type}\``;
      lines.push(`- **${param.name}**${required}: ${type}`);
      lines.push(`  ${param.description}`);
      if (param.enum) {
        lines.push(`  Options: ${param.enum.map(e => `\`${e}\``).join(', ')}`);
      }
      if (param.default !== undefined) {
        lines.push(`  Default: \`${param.default}\``);
      }
      lines.push('');
    });
  }

  lines.push('### Example');
  lines.push('');
  lines.push('```json');
  const exampleParams: Record<string, any> = {};
  tool.parameters.forEach(param => {
    if (param.type === 'string') {
      exampleParams[param.name] = param.enum?.[0] || param.default || 'value';
    } else if (param.type === 'number') {
      exampleParams[param.name] = param.default || 0;
    } else if (param.type === 'boolean') {
      exampleParams[param.name] = param.default ?? true;
    }
  });
  lines.push(JSON.stringify(exampleParams, null, 2));
  lines.push('```');
  lines.push('');

  return lines.join('\n');
}
