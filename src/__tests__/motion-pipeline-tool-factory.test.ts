import { describe, it, expect, beforeEach } from 'bun:test';
import {
  generateToolFromPipeline,
  estimatePipelineRisk,
  createApprovalGatedTool,
  createDirectExecutionTool,
  generateToolsFromPipelines,
  createToolFunction,
  PipelineToolRegistry,
  convertToAISDKTool,
  generateToolDocumentation,
} from '../lib/motion/pipeline/tool-factory';
import { MotionPipeline } from '../lib/motion/pipeline/types';
import { createStarterMotionDocument } from '../lib/motion/defaults';

describe('Pipeline Tool Factory', () => {
  let safePipeline: MotionPipeline;
  let mutatingPipeline: MotionPipeline;
  let destructivePipeline: MotionPipeline;

  beforeEach(() => {
    const now = new Date().toISOString();

    safePipeline = {
      id: 'safe-pipe',
      name: 'Safe Pipeline',
      description: 'A safe pipeline with no mutations',
      params: [],
      steps: [
        {
          op: 'op',
          params: { op: 'document.rename', name: 'Test' },
        },
      ],
      createdAt: now,
      updatedAt: now,
    };

    mutatingPipeline = {
      id: 'mutating-pipe',
      name: 'Mutating Pipeline',
      description: 'Creates nodes',
      params: ['nodeType'],
      steps: [
        {
          op: 'op',
          params: { op: 'node.create', nodeId: 'new-node', type: '{{nodeType}}' },
        },
      ],
      tags: ['lighting'],
      createdAt: now,
      updatedAt: now,
    };

    destructivePipeline = {
      id: 'destructive-pipe',
      name: 'Destructive Pipeline',
      description: 'Deletes nodes',
      params: [],
      steps: [
        {
          op: 'op',
          params: { op: 'node.delete', nodeId: 'camera' },
        },
      ],
      createdAt: now,
      updatedAt: now,
    };
  });

  describe('generateToolFromPipeline', () => {
    it('should generate tool from safe pipeline', () => {
      const tool = generateToolFromPipeline(safePipeline);

      expect(tool.name).toBe('pipeline_safe-pipe');
      // Description uses pipeline description, not name
      expect(tool.description).toContain(safePipeline.description);
      expect(tool.pipelineId).toBe('safe-pipe');
      expect(tool.risk).toBe('safe');
      expect(tool.requiresApproval).toBe(false);
      // Tool should have parameters (including documentId)
      expect(tool.parameters.length).toBeGreaterThan(0);
    });

    it('should generate tool from mutating pipeline', () => {
      const tool = generateToolFromPipeline(mutatingPipeline);

      expect(tool.name).toBe('pipeline_mutating-pipe');
      expect(tool.risk).toBe('mutating');
      expect(tool.requiresApproval).toBe(false);
      expect(tool.parameters.length).toBeGreaterThan(0);
    });

    it('should generate tool from destructive pipeline', () => {
      const tool = generateToolFromPipeline(destructivePipeline);

      expect(tool.name).toBe('pipeline_destructive-pipe');
      expect(tool.risk).toBe('destructive');
      expect(tool.requiresApproval).toBe(true);
    });

    it('should include parameters from pipeline', () => {
      const tool = generateToolFromPipeline(mutatingPipeline);

      const nodeTypeParam = tool.parameters.find(p => p.name === 'nodeType');
      expect(nodeTypeParam).toBeDefined();
      expect(nodeTypeParam?.required).toBe(true);
    });

    it('should always include documentId parameter', () => {
      const tool = generateToolFromPipeline(safePipeline);

      const docParam = tool.parameters.find(p => p.name === 'documentId');
      expect(docParam).toBeDefined();
      expect(docParam?.required).toBe(false);
    });

    it('should use tags as category', () => {
      const tool = generateToolFromPipeline(mutatingPipeline);

      expect(tool.category).toBe('lighting');
    });

    it('should default category to "pipeline"', () => {
      const tool = generateToolFromPipeline(safePipeline);

      expect(tool.category).toBe('pipeline');
    });
  });

  describe('estimatePipelineRisk', () => {
    it('should classify safe pipeline', () => {
      expect(estimatePipelineRisk(safePipeline)).toBe('safe');
    });

    it('should classify mutating pipeline', () => {
      expect(estimatePipelineRisk(mutatingPipeline)).toBe('mutating');
    });

    it('should classify destructive pipeline', () => {
      expect(estimatePipelineRisk(destructivePipeline)).toBe('destructive');
    });

    it('should detect destructive operations', () => {
      const pipeline: MotionPipeline = {
        id: 'test',
        name: 'Test',
        description: '',
        params: [],
        steps: [
          { op: 'op', params: { op: 'node.delete', nodeId: 'x' } },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      expect(estimatePipelineRisk(pipeline)).toBe('destructive');
    });

    it('should detect mutating operations', () => {
      const pipeline: MotionPipeline = {
        id: 'test',
        name: 'Test',
        description: '',
        params: [],
        steps: [
          { op: 'op', params: { op: 'node.update', nodeId: 'x' } },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      expect(estimatePipelineRisk(pipeline)).toBe('mutating');
    });
  });

  describe('createApprovalGatedTool', () => {
    it('should add warning to description for destructive tools', () => {
      const tool = createApprovalGatedTool(destructivePipeline);

      expect(tool.description).toContain('⚠️');
      expect(tool.description).toContain('Requires user approval');
    });

    it('should not add warning to safe tools', () => {
      const tool = createApprovalGatedTool(safePipeline);

      expect(tool.description).not.toContain('⚠️');
    });
  });

  describe('createDirectExecutionTool', () => {
    it('should add safe marker to description', () => {
      const tool = createDirectExecutionTool(safePipeline);

      expect(tool.description).toContain('✓');
      expect(tool.description).toContain('Safe to execute');
    });

    it('should add marker even to non-safe tools', () => {
      const tool = createDirectExecutionTool(mutatingPipeline);

      expect(tool.description).toContain('✓');
    });
  });

  describe('generateToolsFromPipelines', () => {
    it('should generate multiple tools', () => {
      const pipelines = [safePipeline, mutatingPipeline, destructivePipeline];
      const tools = generateToolsFromPipelines(pipelines);

      expect(tools.length).toBe(3);
    });

    it('should generate approval-gated tools when flag is set', () => {
      const pipelines = [destructivePipeline];
      const tools = generateToolsFromPipelines(pipelines, true);

      expect(tools[0].description).toContain('⚠️');
    });

    it('should generate direct execution tools by default', () => {
      const pipelines = [safePipeline];
      const tools = generateToolsFromPipelines(pipelines, false);

      expect(tools[0].description).toContain('✓');
    });
  });

  describe('createToolFunction', () => {
    it('should create callable tool function', async () => {
      const doc = createStarterMotionDocument();
      const toolFn = createToolFunction(safePipeline, () => doc);

      expect(typeof toolFn).toBe('function');
    });

    it('should execute pipeline and return result', async () => {
      const doc = createStarterMotionDocument();
      const toolFn = createToolFunction(safePipeline, () => doc);
      const result = await toolFn({});

      expect(result.status).toBe('success');
      expect(result.pipelineId).toBe('safe-pipe');
      expect(result.executionResult).toBeDefined();
    });

    it('should include plan in result', async () => {
      const doc = createStarterMotionDocument();
      const toolFn = createToolFunction(safePipeline, () => doc);
      const result = await toolFn({});

      expect(result.plan).toBeDefined();
      expect(result.approvalMetadata).toBeDefined();
    });

    it('should handle errors gracefully', async () => {
      const errorPipeline: MotionPipeline = {
        id: 'error-pipe',
        name: 'Error Pipeline',
        description: '',
        params: ['missing'],
        steps: [
          { op: 'op', params: { op: 'node.create', nodeId: '{{missing}}' } },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const doc = createStarterMotionDocument();
      const toolFn = createToolFunction(errorPipeline, () => doc);
      const result = await toolFn({});

      expect(result.status).toBe('error');
      expect(result.error).toBeDefined();
    });
  });

  describe('PipelineToolRegistry', () => {
    it('should register a pipeline', () => {
      const registry = new PipelineToolRegistry();
      const tool = registry.register(safePipeline);

      expect(tool.name).toBe('pipeline_safe-pipe');
      expect(registry.getAllTools().length).toBe(1);
    });

    it('should register multiple pipelines', () => {
      const registry = new PipelineToolRegistry();
      const pipelines = [safePipeline, mutatingPipeline, destructivePipeline];
      const tools = registry.registerMany(pipelines);

      expect(tools.length).toBe(3);
      expect(registry.getAllTools().length).toBe(3);
    });

    it('should retrieve tool by name', () => {
      const registry = new PipelineToolRegistry();
      registry.register(safePipeline);
      const tool = registry.getTool('pipeline_safe-pipe');

      expect(tool).toBeDefined();
      expect(tool?.name).toBe('pipeline_safe-pipe');
    });

    it('should retrieve pipeline by id', () => {
      const registry = new PipelineToolRegistry();
      registry.register(safePipeline);
      const pipeline = registry.getPipeline('safe-pipe');

      expect(pipeline).toBeDefined();
      expect(pipeline?.id).toBe('safe-pipe');
    });

    it('should filter tools by category', () => {
      const registry = new PipelineToolRegistry();
      registry.registerMany([safePipeline, mutatingPipeline]);
      const lightingTools = registry.getToolsByCategory('lighting');

      expect(lightingTools.length).toBe(1);
      expect(lightingTools[0].pipelineId).toBe('mutating-pipe');
    });

    it('should filter tools by risk', () => {
      const registry = new PipelineToolRegistry();
      registry.registerMany([safePipeline, mutatingPipeline, destructivePipeline]);

      const safe = registry.getToolsByRisk('safe');
      const mutating = registry.getToolsByRisk('mutating');
      const destructive = registry.getToolsByRisk('destructive');

      expect(safe.length).toBe(1);
      expect(mutating.length).toBe(1);
      expect(destructive.length).toBe(1);
    });

    it('should unregister a pipeline', () => {
      const registry = new PipelineToolRegistry();
      registry.register(safePipeline);
      expect(registry.getAllTools().length).toBe(1);

      const unregistered = registry.unregister('safe-pipe');
      expect(unregistered).toBe(true);
      expect(registry.getAllTools().length).toBe(0);
    });

    it('should return false when unregistering non-existent pipeline', () => {
      const registry = new PipelineToolRegistry();
      const unregistered = registry.unregister('non-existent');

      expect(unregistered).toBe(false);
    });

    it('should clear all tools', () => {
      const registry = new PipelineToolRegistry();
      registry.registerMany([safePipeline, mutatingPipeline]);
      expect(registry.getAllTools().length).toBe(2);

      registry.clear();
      expect(registry.getAllTools().length).toBe(0);
    });

    it('should provide registry statistics', () => {
      const registry = new PipelineToolRegistry();
      registry.registerMany([safePipeline, mutatingPipeline, destructivePipeline]);

      const stats = registry.getStats();

      expect(stats.totalTools).toBe(3);
      expect(stats.byRisk.safe).toBe(1);
      expect(stats.byRisk.mutating).toBe(1);
      expect(stats.byRisk.destructive).toBe(1);
    });
  });

  describe('convertToAISDKTool', () => {
    it('should convert to AI SDK format', () => {
      const tool = generateToolFromPipeline(mutatingPipeline);
      const aiTool = convertToAISDKTool(tool);

      expect(aiTool.name).toBe(tool.name);
      expect(aiTool.description).toBe(tool.description);
      expect(aiTool.parameters).toBeDefined();
      expect(aiTool.parameters.type).toBe('object');
      expect(aiTool.parameters.properties).toBeDefined();
      expect(aiTool.parameters.required).toBeDefined();
    });

    it('should include required parameters', () => {
      const tool = generateToolFromPipeline(mutatingPipeline);
      const aiTool = convertToAISDKTool(tool);

      expect(aiTool.parameters.required.length).toBeGreaterThan(0);
      expect(aiTool.parameters.required).toContain('nodeType');
    });

    it('should map parameter types correctly', () => {
      const tool = generateToolFromPipeline(mutatingPipeline);
      const aiTool = convertToAISDKTool(tool);

      const nodeTypeProp = aiTool.parameters.properties.nodeType;
      expect(nodeTypeProp.type).toBe('string');
    });
  });

  describe('generateToolDocumentation', () => {
    it('should generate markdown documentation', () => {
      const tool = generateToolFromPipeline(mutatingPipeline);
      const doc = generateToolDocumentation(tool);

      expect(doc).toContain('## `pipeline_mutating-pipe`');
      expect(doc).toContain(mutatingPipeline.description);
      expect(doc).toContain('Risk Level:**');
      expect(doc).toContain('MUTATING');
      expect(doc).toContain('**Category:**');
      expect(doc).toContain('lighting');
    });

    it('should include parameters section', () => {
      const tool = generateToolFromPipeline(mutatingPipeline);
      const doc = generateToolDocumentation(tool);

      expect(doc).toContain('Parameters');
      expect(doc).toContain('nodeType');
      expect(doc).toContain('(required)');
    });

    it('should include approval warning for destructive tools', () => {
      const tool = generateToolFromPipeline(destructivePipeline);
      const doc = generateToolDocumentation(tool);

      expect(doc).toContain('Requires Approval:**');
      expect(doc).toContain('Yes');
      expect(doc).toContain('⚠️');
    });

    it('should include example JSON', () => {
      const tool = generateToolFromPipeline(mutatingPipeline);
      const doc = generateToolDocumentation(tool);

      expect(doc).toContain('Example');
      expect(doc).toContain('```json');
      expect(doc).toContain('nodeType');
    });
  });
});
