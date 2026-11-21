import { describe, it, expect, beforeEach } from 'bun:test';
import { createPipeline } from '../lib/motion/pipeline/builder';
import { compilePipelineDSL } from '../lib/motion/pipeline/parser';
import { executePipeline } from '../lib/motion/pipeline/engine';
import { pipelineToMotionPlan } from '../lib/motion/pipeline/approval';
import { generateToolFromPipeline } from '../lib/motion/pipeline/tool-factory';
import { pipelineLibrary, pipelineIntegration } from '../lib/motion/pipeline/integration';
import { createStarterMotionDocument } from '../lib/motion/defaults';

describe('Motion Pipeline End-to-End Integration', () => {
  let doc: any;

  beforeEach(() => {
    doc = createStarterMotionDocument();
  });

  describe('E2E: Builder to Execution to Plan', () => {
    it('should build pipeline, execute, and create approval plan', async () => {
      const pipeline = createPipeline('e2e-complete')
        .name('E2E Complete Test')
        .param('newName')
        .op('document.rename', { name: '{{newName}}' })
        .build();

      const result = await executePipeline(pipeline, doc, { newName: 'Updated' });
      expect(result.status).toBe('success');
      expect(result.ops.length).toBe(1);

      const plan = pipelineToMotionPlan(result, pipeline, doc);
      expect(plan.name).toContain('E2E Complete');
      expect(plan.requiresApproval).toBe(false);
      expect(plan.metadata.pipeline?.approvalLevel).toBe('auto-approve');
    });
  });

  describe('E2E: DSL Compilation and Execution', () => {
    it('should parse DSL and execute', async () => {
      const dsl = `
id: dsl-e2e
name: DSL Test
params:
  - newDocName
steps:
  - op: document.rename
    params:
      name: "{{newDocName}}"
`;

      const { pipeline, errors } = compilePipelineDSL(dsl);
      expect(errors.length).toBe(0);

      const result = await executePipeline(pipeline!, doc, { newDocName: 'From DSL' });
      expect(result.status).toBe('success');
    });
  });

  describe('E2E: Tool Factory Integration', () => {
    it('should generate tool and register it', async () => {
      const pipeline = createPipeline('tool-e2e')
        .name('Tool E2E Test')
        .param('docName')
        .op('document.rename', { name: '{{docName}}' })
        .build();

      const tool = generateToolFromPipeline(pipeline);
      expect(tool.name).toContain('tool-e2e');
      expect(tool.risk).toBe('safe');
      expect(tool.parameters.some(p => p.name === 'docName')).toBe(true);

      pipelineIntegration.registerCustom([pipeline]);
      const registry = pipelineIntegration.getRegistry();
      const registered = registry.getTool(tool.name);
      expect(registered).toBeDefined();
    });
  });

  describe('E2E: Built-in Pipelines Execution', () => {
    it('should execute lighting setup pipeline', async () => {
      const pipeline = pipelineLibrary.getPipeline('setup-directional-lights');
      expect(pipeline).toBeDefined();

      const result = await executePipeline(pipeline!, doc, {
        intensity: 1.5,
        color: '#ffffff',
      });

      expect(result.status).toBe('success');
      expect(result.ops.length).toBeGreaterThan(0);
    });

    it('should execute camera setup pipeline', async () => {
      const pipeline = pipelineLibrary.getPipeline('setup-camera');
      expect(pipeline).toBeDefined();

      const result = await executePipeline(pipeline!, doc, {
        positionX: 0,
        positionY: 10,
        positionZ: 20,
        fov: 45,
      });

      expect(result.status).toBe('success');
    });

    it('should execute optimization pipeline', async () => {
      const pipeline = pipelineLibrary.getPipeline('optimize-scene');
      expect(pipeline).toBeDefined();

      const result = await executePipeline(pipeline!, doc, {});
      expect(result.status).toBe('success');
    });

    it('should execute keyframe animation pipeline', async () => {
      const pipeline = pipelineLibrary.getPipeline('setup-keyframe-animation');
      expect(pipeline).toBeDefined();

      const result = await executePipeline(pipeline!, doc, {
        duration: 5,
        startValue: 0,
        endValue: 1,
      });

      expect(result.status).toBe('success');
    });
  });

  describe('E2E: Discovery and Search', () => {
    it('should discover pipelines and provide statistics', () => {
      const discovery = pipelineIntegration.getDiscoveryInterface();

      expect(discovery.categories.length).toBeGreaterThan(0);
      expect(discovery.tags.length).toBeGreaterThan(0);
      expect(discovery.pipelines.length).toBeGreaterThan(0);

      const stats = pipelineIntegration.getStatistics();
      expect(stats.pipelines.total).toBeGreaterThan(0);
      expect(stats.tools.total).toBeGreaterThan(0);
    });

    it('should search pipelines by query', () => {
      const results = pipelineLibrary.searchPipelines('light');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name.toLowerCase()).toContain('light');
    });

    it('should filter pipelines by category', () => {
      const lighting = pipelineLibrary.getPipelinesByCategory('lighting');
      expect(lighting.length).toBeGreaterThan(0);
      expect(lighting.every(p => p.category === 'lighting')).toBe(true);
    });

    it('should filter pipelines by tag', () => {
      const procedural = pipelineLibrary.getPipelinesByTag('procedural');
      expect(procedural.length).toBeGreaterThan(0);
      expect(procedural.every(p => p.tags?.includes('procedural'))).toBe(true);
    });
  });

  describe('E2E: Approval Workflow', () => {
    it('should classify safe operations correctly', async () => {
      const pipeline = createPipeline('safe-ops')
        .op('document.rename', { name: 'Test' })
        .build();

      const result = await executePipeline(pipeline, doc, {});
      const plan = pipelineToMotionPlan(result, pipeline, doc);

      expect(plan.risk).toBe('safe');
      expect(plan.requiresApproval).toBe(false);
      expect(plan.metadata.pipeline?.approvalLevel).toBe('auto-approve');
    });

    it('should generate change descriptions', async () => {
      const pipeline = createPipeline('describe-changes')
        .op('document.rename', { name: 'Updated' })
        .build();

      const result = await executePipeline(pipeline, doc, {});
      const plan = pipelineToMotionPlan(result, pipeline, doc);

      expect(plan.metadata.pipeline?.changeDescription).toBeDefined();
      expect(plan.metadata.pipeline?.changeDescription.length).toBeGreaterThan(0);
    });
  });

  describe('E2E: Execution Metadata', () => {
    it('should track execution metrics', async () => {
      const pipeline = createPipeline('metrics')
        .op('document.rename', { name: 'T1' })
        .op('document.rename', { name: 'T2' })
        .op('document.rename', { name: 'T3' })
        .build();

      const result = await executePipeline(pipeline, doc, {});

      expect(result.metadata?.executionTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.metadata?.opsGenerated).toBe(3);
      expect(result.totalSteps).toBe(3);
      expect(result.executedSteps).toBeLessThanOrEqual(3);
    });
  });

  describe('E2E: Complex Pipelines', () => {
    it('should execute multi-operation pipeline', async () => {
      const pipeline = createPipeline('multi-op')
        .op('document.rename', { name: 'Step1' })
        .op('document.rename', { name: 'Step2' })
        .op('document.rename', { name: 'Step3' })
        .op('document.rename', { name: 'Step4' })
        .op('document.rename', { name: 'Step5' })
        .build();

      const result = await executePipeline(pipeline, doc, {});

      expect(result.status).toBe('success');
      expect(result.ops.length).toBe(5);
      expect(result.metadata?.opsGenerated).toBe(5);
    });
  });

  describe('E2E: Performance', () => {
    it('should execute pipelines efficiently', async () => {
      const pipeline = createPipeline('perf-test')
        .op('document.rename', { name: 'T1' })
        .op('document.rename', { name: 'T2' })
        .op('document.rename', { name: 'T3' })
        .op('document.rename', { name: 'T4' })
        .op('document.rename', { name: 'T5' })
        .build();

      const startTime = performance.now();
      const result = await executePipeline(pipeline, doc, {});
      const endTime = performance.now();

      expect(result.status).toBe('success');
      expect(endTime - startTime).toBeLessThan(1000);
      expect(result.metadata?.executionTimeMs).toBeLessThan(1000);
    });
  });

  describe('E2E: Full Integration', () => {
    it('should integrate all pipeline modules end-to-end', async () => {
      // 1. Build with builder
      const pipeline = createPipeline('full-integration')
        .name('Full Integration Test')
        .param('documentTitle')
        .op('document.rename', { name: '{{documentTitle}}' })
        .build();

      // 2. Execute engine
      const result = await executePipeline(pipeline, doc, {
        documentTitle: 'Integrated Pipeline',
      });
      expect(result.status).toBe('success');

      // 3. Create approval plan
      const plan = pipelineToMotionPlan(result, pipeline, doc);
      expect(plan.name).toBeDefined();
      expect(plan.ops.length).toBe(result.ops.length);

      // 4. Generate tool
      const tool = generateToolFromPipeline(pipeline);
      expect(tool.name).toContain('full-integration');

      // 5. Register and discover
      pipelineIntegration.registerCustom([pipeline]);
      const discovery = pipelineIntegration.getDiscoveryInterface();
      expect(discovery.pipelines.length).toBeGreaterThan(0);

      // 6. Verify statistics
      const stats = pipelineIntegration.getStatistics();
      expect(stats.pipelines.total).toBeGreaterThan(0);
      expect(stats.tools.total).toBeGreaterThan(0);
    });
  });
});
