/**
 * __tests__/motion-pipeline-parser.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Tests for Motion Pipeline DSL Parser and Compiler.
 *
 * Tests parsing, validation, interpolation, and serialization of pipelines.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  parsePipelineDSL,
  compilePipelineDSL,
  interpolatePipelineParams,
  interpolateString,
  pipelineToYAML,
  pipelineToJSON,
  parseYAML,
} from '../lib/motion/pipeline/parser';
import type { MotionPipeline } from '../lib/motion/pipeline/types';

describe('Motion Pipeline Parser', () => {
  // ── YAML Parsing ───────────────────────────────────────────────────────────────

  describe('YAML Parsing', () => {
    it('should parse JSON as YAML', () => {
      const json = JSON.stringify({
        id: 'test-pipeline',
        name: 'Test',
        description: 'Test pipeline',
        params: [],
        steps: [{ op: 'op', params: {} }],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const result = parseYAML(json);
      expect(result).toBeDefined();
      expect((result as any).id).toBe('test-pipeline');
    });

    it('should parse JSON with nested objects', () => {
      const json = JSON.stringify({
        id: 'nested-pipeline',
        name: 'Nested',
        description: 'Pipeline with nested steps',
        params: [
          {
            name: 'productType',
            type: 'string',
            defaultValue: 'box',
          },
        ],
        steps: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const result = parseYAML(json);
      expect((result as any).params).toBeInstanceOf(Array);
      expect((result as any).params[0].name).toBe('productType');
    });

    it('should handle complex nested JSON', () => {
      const json = JSON.stringify({
        id: 'complex',
        name: 'Complex',
        description: 'Complex pipeline',
        params: [
          { name: 'p1', type: 'string' },
          { name: 'p2', type: 'number' },
        ],
        steps: [
          {
            op: 'branch',
            condition: { type: 'node-exists', nodeId: 'camera' },
            then: [{ op: 'op', params: {} }],
            else: [{ op: 'op', params: {} }],
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const result = parseYAML(json);
      expect((result as any).params).toHaveLength(2);
      expect((result as any).steps).toHaveLength(1);
    });
  });

  // ── DSL Parsing ────────────────────────────────────────────────────────────────

  describe('DSL Parsing', () => {
    it('should parse a valid JSON pipeline', () => {
      const dsl = JSON.stringify({
        id: 'json-pipeline',
        name: 'JSON Pipeline',
        description: 'Parsed from JSON',
        params: [],
        steps: [{ op: 'op', params: { op: 'document.rename', name: 'test' } }],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const result = parsePipelineDSL(dsl);
      expect(result.errors).toHaveLength(0);
      expect(result.pipeline).toBeDefined();
      expect(result.pipeline?.id).toBe('json-pipeline');
    });

    it('should reject invalid JSON', () => {
      const dsl = '{ invalid json }';

      const result = parsePipelineDSL(dsl);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.pipeline).toBeNull();
    });

    it('should reject pipeline with missing required fields', () => {
      const dsl = JSON.stringify({
        // Missing 'id'
        name: 'No ID',
        description: 'Missing id field',
        params: [],
        steps: [{ op: 'op', params: {} }],
      });

      const result = parsePipelineDSL(dsl);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  // ── DSL Compilation ────────────────────────────────────────────────────────────

  describe('DSL Compilation', () => {
    it('should compile a simple pipeline', () => {
      const dsl = JSON.stringify({
        id: 'simple',
        name: 'Simple',
        description: 'Simple pipeline',
        params: [],
        steps: [{ op: 'op', params: {} }],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const result = compilePipelineDSL(dsl);
      expect(result.errors).toHaveLength(0);
      expect(result.pipeline).toBeDefined();
    });

    it('should warn about unused parameters', () => {
      const dsl = JSON.stringify({
        id: 'unused-param',
        name: 'Unused Param',
        description: 'Pipeline with unused parameter',
        params: [
          { name: 'unused', type: 'string' },
          { name: 'used', type: 'string' },
        ],
        steps: [
          {
            op: 'op',
            params: { op: 'document.rename', name: '{{used}}' },
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const result = compilePipelineDSL(dsl);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('unused');
    });

    it('should error on undefined parameter references', () => {
      const dsl = JSON.stringify({
        id: 'undefined-param',
        name: 'Undefined Param',
        description: 'Pipeline with undefined parameter',
        params: [{ name: 'defined', type: 'string' }],
        steps: [
          {
            op: 'op',
            params: { op: 'document.rename', name: '{{undefined}}' },
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const result = compilePipelineDSL(dsl);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  // ── Parameter Interpolation ────────────────────────────────────────────────────

  describe('Parameter Interpolation', () => {
    it('should interpolate simple string parameters', () => {
      const result = interpolateString('Product: {{productType}}', { productType: 'box' });
      expect(result).toBe('Product: box');
    });

    it('should interpolate multiple parameters', () => {
      const result = interpolateString('{{type}}: {{value}}', {
        type: 'position',
        value: '5',
      });
      expect(result).toBe('position: 5');
    });

    it('should handle numeric parameter interpolation', () => {
      const result = interpolateString('Duration: {{duration}} seconds', { duration: 5 });
      expect(result).toBe('Duration: 5 seconds');
    });

    it('should handle boolean parameter interpolation', () => {
      const result = interpolateString('Visible: {{visible}}', { visible: true });
      expect(result).toBe('Visible: true');
    });

    it('should leave unmatched parameters as-is', () => {
      const result = interpolateString('Value: {{missing}}', {});
      expect(result).toBe('Value: {{missing}}');
    });

    it('should interpolate parameters in full pipeline', () => {
      const pipeline: MotionPipeline = {
        id: 'param-test',
        name: 'Param Test',
        description: 'Test',
        params: [
          { name: 'nodeId', type: 'string', defaultValue: 'default-node' },
          { name: 'duration', type: 'number', defaultValue: 5 },
        ],
        steps: [
          {
            op: 'call',
            pipelineId: '{{nodeId}}-animation',
            params: { duration: '{{duration}}' },
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = interpolatePipelineParams(pipeline, {
        nodeId: 'my-node',
        duration: 10,
      });

      expect(result.errors).toHaveLength(0);
      const step = result.pipeline.steps[0];
      expect(step.op).toBe('call');
      if (step.op === 'call') {
        expect(step.pipelineId).toBe('my-node-animation');
      }
    });

    it('should use default parameters when not provided', () => {
      const pipeline: MotionPipeline = {
        id: 'defaults-test',
        name: 'Defaults Test',
        description: 'Test',
        params: [
          { name: 'duration', type: 'number', defaultValue: 5 },
          { name: 'type', type: 'string', defaultValue: 'animation' },
        ],
        steps: [
          {
            op: 'op',
            params: { op: 'document.rename', name: '{{type}}-{{duration}}' },
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = interpolatePipelineParams(pipeline, {});

      expect(result.errors).toHaveLength(0);
      const step = result.pipeline.steps[0];
      expect(step.op).toBe('op');
      if (step.op === 'op') {
        const name = (step.params as any).name;
        expect(name).toBe('animation-5');
      }
    });

    it('should error on missing required parameters', () => {
      const pipeline: MotionPipeline = {
        id: 'required-test',
        name: 'Required Test',
        description: 'Test',
        params: [{ name: 'required', type: 'string', required: true }],
        steps: [
          {
            op: 'op',
            params: { op: 'document.rename', name: '{{required}}' },
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = interpolatePipelineParams(pipeline, {});

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].code).toBe('INVALID_PARAM');
    });
  });

  // ── Serialization ──────────────────────────────────────────────────────────────

  describe('Serialization', () => {
    const pipeline: MotionPipeline = {
      id: 'test-pipeline',
      name: 'Test Pipeline',
      description: 'A test pipeline',
      params: [{ name: 'duration', type: 'number', defaultValue: 5 }],
      steps: [
        {
          op: 'op',
          params: { op: 'document.rename', name: 'Test' },
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    it('should serialize to YAML', () => {
      const yaml = pipelineToYAML(pipeline);
      expect(yaml).toContain('id: test-pipeline');
      expect(yaml).toContain('name: Test Pipeline');
    });

    it('should serialize to JSON', () => {
      const json = pipelineToJSON(pipeline);
      const parsed = JSON.parse(json);
      expect(parsed.id).toBe('test-pipeline');
      expect(parsed.name).toBe('Test Pipeline');
    });

    it('should round-trip YAML (parse -> serialize)', () => {
      const yaml1 = pipelineToYAML(pipeline);
      const parsed = parsePipelineDSL(yaml1);

      if (parsed.pipeline) {
        const yaml2 = pipelineToYAML(parsed.pipeline);
        expect(yaml2).toContain('test-pipeline');
      }
    });

    it('should round-trip JSON (parse -> serialize)', () => {
      const json1 = pipelineToJSON(pipeline);
      const parsed = parsePipelineDSL(json1);

      if (parsed.pipeline) {
        const json2 = pipelineToJSON(parsed.pipeline);
        const obj1 = JSON.parse(json1);
        const obj2 = JSON.parse(json2);
        expect(obj2.id).toBe(obj1.id);
      }
    });
  });

  // ── Complex Scenarios ──────────────────────────────────────────────────────────

  describe('Complex Scenarios', () => {
    it('should parse pipeline with branching', () => {
      const dsl = JSON.stringify({
        id: 'branching-test',
        name: 'Branching Test',
        description: 'Test',
        params: [],
        steps: [
          {
            op: 'branch',
            condition: { type: 'node-exists', nodeId: 'camera' },
            then: [{ op: 'op', params: {} }],
            else: [{ op: 'op', params: {} }],
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const result = parsePipelineDSL(dsl);
      expect(result.errors).toHaveLength(0);
      expect(result.pipeline).toBeDefined();
    });

    it('should parse pipeline with loops', () => {
      const dsl = JSON.stringify({
        id: 'loop-test',
        name: 'Loop Test',
        description: 'Test',
        params: [],
        steps: [
          {
            op: 'loop',
            over: { type: 'nodes', nodeType: 'light.directional' },
            body: [{ op: 'op', params: {} }],
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const result = parsePipelineDSL(dsl);
      expect(result.errors).toHaveLength(0);
    });

    it('should parse pipeline with pipeline calls', () => {
      const dsl = JSON.stringify({
        id: 'call-test',
        name: 'Call Test',
        description: 'Test',
        params: [{ name: 'type', type: 'string' }],
        steps: [
          {
            op: 'call',
            pipelineId: 'product-hero-template',
            params: { productType: '{{type}}' },
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const result = compilePipelineDSL(dsl);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('should parse pipeline with nested branches and loops', () => {
      const dsl = JSON.stringify({
        id: 'complex-test',
        name: 'Complex Test',
        description: 'Test',
        params: [],
        steps: [
          {
            op: 'branch',
            condition: { type: 'node-exists', nodeId: 'camera' },
            then: [
              {
                op: 'loop',
                over: { type: 'nodes' },
                body: [{ op: 'op', params: {} }],
              },
            ],
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const result = parsePipelineDSL(dsl);
      expect(result.errors).toHaveLength(0);
    });
  });
});
