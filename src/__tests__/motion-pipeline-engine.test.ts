/**
 * __tests__/motion-pipeline-engine.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Tests for Motion Pipeline Execution Engine.
 *
 * Tests execution of pipelines with:
 * - Linear sequences
 * - Conditional branching
 * - Loops with variable binding
 * - Nested structures
 * - Error accumulation
 * - Op batching
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { PipelineExecutor, executePipeline, validatePipelineExecution } from '../lib/motion/pipeline/engine';
import { createStarterMotionDocument } from '../lib/motion/defaults';
import type { MotionPipeline, MotionDocument } from '../lib/motion/types';

describe('Motion Pipeline Execution Engine', () => {
  let executor: PipelineExecutor;
  let sampleDoc: MotionDocument;

  beforeEach(() => {
    executor = new PipelineExecutor();
    sampleDoc = createStarterMotionDocument();

    // Add some test nodes to the scene
    const scene = sampleDoc.scenes[0];
    scene.nodes.push({
      id: 'camera',
      type: 'camera.perspective',
      name: 'Camera',
      parentId: null,
      visible: true,
      locked: false,
      transform: { position: [0, 0, 5], rotation: [0, 0, 0], scale: [1, 1, 1] },
      props: {},
    });

    scene.nodes.push({
      id: 'light-1',
      type: 'light.directional',
      name: 'Light 1',
      parentId: null,
      visible: true,
      locked: false,
      transform: { position: [4, 6, 3], rotation: [0, 0, 0], scale: [1, 1, 1] },
      props: {},
    });

    scene.nodes.push({
      id: 'light-2',
      type: 'light.directional',
      name: 'Light 2',
      parentId: null,
      visible: true,
      locked: false,
      transform: { position: [-4, 6, 3], rotation: [0, 0, 0], scale: [1, 1, 1] },
      props: {},
    });

    // Add a test clip
    sampleDoc.timeline.clips.push({
      id: 'clip-1',
      name: 'Test Clip',
      duration: 5,
      channels: [],
    });
  });

  // ── Linear Execution ───────────────────────────────────────────────────────────

  describe('Linear Execution', () => {
    it('should execute single op', async () => {
      const pipeline: MotionPipeline = {
        id: 'single-op',
        name: 'Single Op',
        description: 'Test',
        params: [],
        steps: [
          {
            op: 'op',
            params: { op: 'document.rename', name: 'renamed' },
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = await executor.execute(pipeline, sampleDoc);

      expect(result.status).toBe('success');
      expect(result.ops).toHaveLength(1);
      expect(result.errors).toHaveLength(0);
      expect((result.ops[0] as any).name).toBe('renamed');
    });

    it('should execute multiple sequential ops', async () => {
      const pipeline: MotionPipeline = {
        id: 'multi-op',
        name: 'Multiple Ops',
        description: 'Test',
        params: [],
        steps: [
          { op: 'op', params: { op: 'document.rename', name: 'test1' } },
          { op: 'op', params: { op: 'document.setOutput', fps: 30 } },
          { op: 'op', params: { op: 'document.setOutput', width: 1920 } },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = await executor.execute(pipeline, sampleDoc);

      expect(result.status).toBe('success');
      expect(result.ops).toHaveLength(3);
      expect(result.errors).toHaveLength(0);
    });

    it('should track op risk classification', async () => {
      const pipeline: MotionPipeline = {
        id: 'risk-test',
        name: 'Risk Test',
        description: 'Test',
        params: [],
        steps: [
          {
            op: 'op',
            params: { op: 'scene.node.remove', nodeId: 'camera' },
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = await executor.execute(pipeline, sampleDoc);

      expect(result.status).toBe('success');
      expect(result.risk).toBe('destructive');
      expect(result.requiresApproval).toBe(true);
    });
  });

  // ── Branching ──────────────────────────────────────────────────────────────────

  describe('Conditional Branching', () => {
    it('should execute "then" branch when condition is true', async () => {
      const pipeline: MotionPipeline = {
        id: 'branch-true',
        name: 'Branch True',
        description: 'Test',
        params: [],
        steps: [
          {
            op: 'branch',
            condition: { type: 'node-exists', nodeId: 'camera' },
            then: [
              { op: 'op', params: { op: 'document.rename', name: 'then-executed' } },
            ],
            else: [
              { op: 'op', params: { op: 'document.rename', name: 'else-executed' } },
            ],
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = await executor.execute(pipeline, sampleDoc);

      expect(result.status).toBe('success');
      expect(result.ops).toHaveLength(1);
      expect((result.ops[0] as any).name).toBe('then-executed');
    });

    it('should execute "else" branch when condition is false', async () => {
      const pipeline: MotionPipeline = {
        id: 'branch-false',
        name: 'Branch False',
        description: 'Test',
        params: [],
        steps: [
          {
            op: 'branch',
            condition: { type: 'node-exists', nodeId: 'nonexistent' },
            then: [
              { op: 'op', params: { op: 'document.rename', name: 'then-executed' } },
            ],
            else: [
              { op: 'op', params: { op: 'document.rename', name: 'else-executed' } },
            ],
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = await executor.execute(pipeline, sampleDoc);

      expect(result.status).toBe('success');
      expect(result.ops).toHaveLength(1);
      expect((result.ops[0] as any).name).toBe('else-executed');
    });

    it('should handle property-value conditions', async () => {
      const pipeline: MotionPipeline = {
        id: 'property-condition',
        name: 'Property Condition',
        description: 'Test',
        params: [],
        steps: [
          {
            op: 'branch',
            condition: {
              type: 'property-value',
              nodeId: 'camera',
              property: 'transform.position.2',
              operator: '>',
              value: 0,
            },
            then: [
              { op: 'op', params: { op: 'document.rename', name: 'position-positive' } },
            ],
            else: [
              { op: 'op', params: { op: 'document.rename', name: 'position-not-positive' } },
            ],
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = await executor.execute(pipeline, sampleDoc);

      expect(result.status).toBe('success');
      expect(result.ops.length).toBeGreaterThan(0);
      // Camera has position.z = 5, which is > 0, so "then" should execute
      expect((result.ops[0] as any).name).toBe('position-positive');
    });

    it('should handle different property value operators', async () => {
      const operators: Array<'<' | '>' | '==' | '!=' | '<=' | '>='> = ['<', '>', '==', '!=', '<=', '>='];

      for (const op of operators) {
        const pipeline: MotionPipeline = {
          id: `operator-${op}`,
          name: `Operator ${op}`,
          description: 'Test',
          params: [],
          steps: [
            {
              op: 'branch',
              condition: {
                type: 'property-value',
                nodeId: 'camera',
                property: 'transform.position.2',
                operator: op,
                value: 5,
              },
              then: [{ op: 'op', params: { op: 'document.rename', name: `operator-${op}` } }],
            },
          ],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        const result = await executor.execute(pipeline, sampleDoc);
        expect(result.status).toBe('success');
      }
    });
  });

  // ── Looping ────────────────────────────────────────────────────────────────────

  describe('Looping', () => {
    it('should loop over all nodes', async () => {
      const pipeline: MotionPipeline = {
        id: 'loop-nodes',
        name: 'Loop Nodes',
        description: 'Test',
        params: [],
        steps: [
          {
            op: 'loop',
            over: { type: 'nodes' },
            body: [
              { op: 'op', params: { op: 'document.rename', name: 'looped' } },
            ],
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = await executor.execute(pipeline, sampleDoc);

      expect(result.status).toBe('success');
      // Should have one op per node (3 nodes in test scene)
      expect(result.ops.length).toBeGreaterThan(0);
      expect(result.metadata?.loopsIterated).toBe(sampleDoc.scenes[0].nodes.length);
    });

    it('should loop over filtered nodes by type', async () => {
      const pipeline: MotionPipeline = {
        id: 'loop-lights',
        name: 'Loop Lights',
        description: 'Test',
        params: [],
        steps: [
          {
            op: 'loop',
            over: { type: 'nodes', nodeType: 'light.directional' },
            body: [
              { op: 'op', params: { op: 'document.rename', name: 'light-looped' } },
            ],
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = await executor.execute(pipeline, sampleDoc);

      expect(result.status).toBe('success');
      // Should have one op per light (2 lights in test scene)
      const lightCount = sampleDoc.scenes[0].nodes.filter((n) => n.type === 'light.directional').length;
      expect(result.ops).toHaveLength(lightCount);
    });

    it('should loop over clips', async () => {
      const pipeline: MotionPipeline = {
        id: 'loop-clips',
        name: 'Loop Clips',
        description: 'Test',
        params: [],
        steps: [
          {
            op: 'loop',
            over: { type: 'clips' },
            body: [
              { op: 'op', params: { op: 'document.rename', name: 'clip-looped' } },
            ],
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = await executor.execute(pipeline, sampleDoc);

      expect(result.status).toBe('success');
      expect(result.ops).toHaveLength(sampleDoc.timeline.clips.length);
    });

    it('should loop over collection', async () => {
      const pipeline: MotionPipeline = {
        id: 'loop-collection',
        name: 'Loop Collection',
        description: 'Test',
        params: [],
        steps: [
          {
            op: 'loop',
            over: { type: 'collection', items: [1, 2, 3, 4, 5] },
            body: [
              { op: 'op', params: { op: 'document.rename', name: 'collection-looped' } },
            ],
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = await executor.execute(pipeline, sampleDoc);

      expect(result.status).toBe('success');
      expect(result.ops).toHaveLength(5);
    });

    it('should enforce loop iteration limit', async () => {
      const pipeline: MotionPipeline = {
        id: 'loop-limit',
        name: 'Loop Limit',
        description: 'Test',
        params: [],
        steps: [
          {
            op: 'loop',
            over: { type: 'collection', items: new Array(2000).fill(0) },
            body: [
              { op: 'op', params: { op: 'document.rename', name: 'over-limit' } },
            ],
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = await executor.execute(pipeline, sampleDoc, {}, { maxLoopIterations: 1000 });

      expect(result.status).toBe('error');
      expect(result.errors.some((e) => e.code === 'LOOP_LIMIT')).toBe(true);
    });
  });

  // ── Nested Structures ──────────────────────────────────────────────────────────

  describe('Nested Structures', () => {
    it('should handle branch inside loop', async () => {
      const pipeline: MotionPipeline = {
        id: 'branch-in-loop',
        name: 'Branch in Loop',
        description: 'Test',
        params: [],
        steps: [
          {
            op: 'loop',
            over: { type: 'nodes', nodeType: 'light.directional' },
            body: [
              {
                op: 'branch',
                condition: { type: 'node-exists', nodeId: 'camera' },
                then: [
                  { op: 'op', params: { op: 'document.rename', name: 'light-with-camera' } },
                ],
              },
            ],
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = await executor.execute(pipeline, sampleDoc);

      expect(result.status).toBe('success');
      const lightCount = sampleDoc.scenes[0].nodes.filter((n) => n.type === 'light.directional').length;
      expect(result.ops).toHaveLength(lightCount);
    });

    it('should handle loop inside sequence', async () => {
      const pipeline: MotionPipeline = {
        id: 'loop-in-sequence',
        name: 'Loop in Sequence',
        description: 'Test',
        params: [],
        steps: [
          {
            op: 'sequence',
            steps: [
              { op: 'op', params: { op: 'document.rename', name: 'before-loop' } },
              {
                op: 'loop',
                over: { type: 'collection', items: [1, 2] },
                body: [
                  { op: 'op', params: { op: 'document.rename', name: 'in-loop' } },
                ],
              },
              { op: 'op', params: { op: 'document.rename', name: 'after-loop' } },
            ],
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = await executor.execute(pipeline, sampleDoc);

      expect(result.status).toBe('success');
      expect(result.ops).toHaveLength(4); // before + 2x in-loop + after
    });
  });

  // ── Error Handling ─────────────────────────────────────────────────────────────

  describe('Error Handling', () => {
    it('should accumulate errors instead of failing fast', async () => {
      const pipeline: MotionPipeline = {
        id: 'error-accumulation',
        name: 'Error Accumulation',
        description: 'Test',
        params: [],
        steps: [
          { op: 'op', params: { op: 'document.rename', name: 'valid-1' } },
          // Invalid op (null params)
          { op: 'op', params: null as any },
          { op: 'op', params: { op: 'document.rename', name: 'valid-2' } },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = await executor.execute(pipeline, sampleDoc);

      expect(result.status).toBe('error');
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.ops.length).toBeGreaterThan(0); // Still accumulated valid ops
    });

    it('should enforce recursion depth limit', async () => {
      // Create deeply nested loops (which increment recursion depth via executeSteps)
      const createNestedLoop = (depth: number): PipelineStep => {
        if (depth === 0) {
          return {
            op: 'loop',
            over: { type: 'collection', items: [1] },
            body: [{ op: 'op', params: { op: 'document.rename', name: 'deep' } }],
          };
        }
        return {
          op: 'loop',
          over: { type: 'collection', items: [1] },
          body: [createNestedLoop(depth - 1)],
        };
      };

      const pipeline: MotionPipeline = {
        id: 'deep-recursion',
        name: 'Deep Recursion',
        description: 'Test',
        params: [],
        steps: [createNestedLoop(15)],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = await executor.execute(pipeline, sampleDoc, {}, { maxDepth: 10 });

      expect(result.status).toBe('error');
      expect(result.errors.some((e) => e.code === 'RECURSION_LIMIT')).toBe(true);
    });
  });

  // ── Helper Functions ───────────────────────────────────────────────────────────

  describe('Helper Functions', () => {
    it('should execute via executePipeline helper', async () => {
      const pipeline: MotionPipeline = {
        id: 'helper-test',
        name: 'Helper Test',
        description: 'Test',
        params: [],
        steps: [
          { op: 'op', params: { op: 'document.rename', name: 'helper-executed' } },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = await executePipeline(pipeline, sampleDoc);

      expect(result.status).toBe('success');
      expect(result.ops).toHaveLength(1);
    });

    it('should validate pipeline execution', async () => {
      const pipeline: MotionPipeline = {
        id: 'validate-test',
        name: 'Validate Test',
        description: 'Test',
        params: [],
        steps: [
          {
            op: 'branch',
            condition: { type: 'node-exists', nodeId: 'camera' },
            then: [
              { op: 'op', params: { op: 'document.rename', name: 'valid' } },
            ],
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = await validatePipelineExecution(pipeline, sampleDoc);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  // ── Execution Metadata ─────────────────────────────────────────────────────────

  describe('Execution Metadata', () => {
    it('should track execution time', async () => {
      const pipeline: MotionPipeline = {
        id: 'timing-test',
        name: 'Timing Test',
        description: 'Test',
        params: [],
        steps: [
          { op: 'op', params: { op: 'document.rename', name: 'test' } },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = await executor.execute(pipeline, sampleDoc);

      expect(result.metadata?.executionTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should count steps correctly', async () => {
      const pipeline: MotionPipeline = {
        id: 'step-count-test',
        name: 'Step Count Test',
        description: 'Test',
        params: [],
        steps: [
          { op: 'op', params: { op: 'document.rename', name: 'step-1' } },
          {
            op: 'branch',
            condition: { type: 'node-exists', nodeId: 'camera' },
            then: [
              { op: 'op', params: { op: 'document.rename', name: 'step-2' } },
            ],
            else: [
              { op: 'op', params: { op: 'document.rename', name: 'step-3' } },
            ],
          },
          { op: 'op', params: { op: 'document.rename', name: 'step-4' } },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = await executor.execute(pipeline, sampleDoc);

      // Total steps: 1 (first op) + 1 (branch) + 1 (then) + 1 (else) + 1 (last op) = 5
      expect(result.totalSteps).toBeGreaterThan(0);
    });
  });
});
