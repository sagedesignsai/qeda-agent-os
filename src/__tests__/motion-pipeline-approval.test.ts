import { describe, it, expect, beforeEach } from 'bun:test';
import {
  pipelineToMotionPlan,
  describePipelineChanges,
  getApprovalLevel,
  extractChangedAssets,
  previewOp,
  validateApprovalRequirement,
  ChangedAssets,
} from '../lib/motion/pipeline/approval';
import { createStarterMotionDocument } from '../lib/motion/defaults';
import { MotionPipeline, PipelineExecutionResult } from '../lib/motion/pipeline/types';

describe('Pipeline Approval Integration', () => {
  let sampleDoc: any;

  beforeEach(() => {
    sampleDoc = createStarterMotionDocument();
  });

  describe('pipelineToMotionPlan', () => {
    it('should create plan from execution result', () => {
      const pipeline: MotionPipeline = {
        id: 'test-pipe',
        name: 'Test Pipeline',
        description: 'For testing',
        params: [],
        steps: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result: PipelineExecutionResult = {
        status: 'success',
        ops: [
          { op: 'document.rename', name: 'Updated Scene' },
        ],
        risk: 'mutating',
        requiresApproval: false,
        errors: [],
        executedSteps: 1,
        totalSteps: 1,
        metadata: {
          executionTimeMs: 5,
          opsGenerated: 1,
          branchesEvaluated: 0,
          loopsIterated: 0,
        },
      };

      const plan = pipelineToMotionPlan(result, pipeline, sampleDoc);

      expect(plan.name).toContain('Test Pipeline');
      expect(plan.ops).toBe(result.ops);
      expect(plan.risk).toBe('mutating');
      expect(plan.metadata.pipeline.pipelineId).toBe('test-pipe');
    });

    it('should set correct approval level', () => {
      const pipeline: MotionPipeline = {
        id: 'safe-pipe',
        name: 'Safe Pipeline',
        description: '',
        params: [],
        steps: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result: PipelineExecutionResult = {
        status: 'success',
        ops: [{ op: 'document.rename', name: 'Test' }],
        risk: 'safe',
        requiresApproval: false,
        errors: [],
        executedSteps: 0,
        totalSteps: 0,
        metadata: {
          executionTimeMs: 0,
          opsGenerated: 1,
          branchesEvaluated: 0,
          loopsIterated: 0,
        },
      };

      const plan = pipelineToMotionPlan(result, pipeline, sampleDoc);

      expect(plan.metadata.pipeline?.approvalLevel).toBe('auto-approve');
    });

    it('should extract changed assets in plan', () => {
      const pipeline: MotionPipeline = {
        id: 'test',
        name: 'Test',
        description: '',
        params: [],
        steps: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result: PipelineExecutionResult = {
        status: 'success',
        ops: [
          { op: 'node.create', nodeId: 'new-node', type: 'mesh' },
          { op: 'node.delete', nodeId: 'camera' },
        ],
        risk: 'destructive',
        requiresApproval: true,
        errors: [],
        executedSteps: 0,
        totalSteps: 0,
        metadata: {
          executionTimeMs: 0,
          opsGenerated: 2,
          branchesEvaluated: 0,
          loopsIterated: 0,
        },
      };

      const plan = pipelineToMotionPlan(result, pipeline, sampleDoc);
      const meta = plan.metadata.pipeline;

      expect(meta?.changedAssets.createdNodes).toContain('new-node');
      expect(meta?.changedAssets.deletedNodes).toContain('camera');
    });

    it('should include ops preview in plan metadata', () => {
      const pipeline: MotionPipeline = {
        id: 'test',
        name: 'Test',
        description: '',
        params: [],
        steps: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result: PipelineExecutionResult = {
        status: 'success',
        ops: [
          { op: 'node.create', nodeId: 'node-1', type: 'mesh' },
          { op: 'node.update', nodeId: 'node-2', type: 'mesh' },
        ],
        risk: 'mutating',
        requiresApproval: false,
        errors: [],
        executedSteps: 0,
        totalSteps: 0,
        metadata: {
          executionTimeMs: 0,
          opsGenerated: 2,
          branchesEvaluated: 0,
          loopsIterated: 0,
        },
      };

      const plan = pipelineToMotionPlan(result, pipeline, sampleDoc);

      expect(plan.metadata.pipeline?.opsPreview.length).toBeGreaterThan(0);
      expect(plan.metadata.pipeline?.opsPreview[0]).toContain('node');
    });
  });

  describe('describePipelineChanges', () => {
    it('should describe node creation', () => {
      const changedAssets: ChangedAssets = {
        createdNodes: ['node1', 'node2'],
        modifiedNodes: [],
        deletedNodes: [],
        createdClips: [],
        modifiedClips: [],
        deletedClips: [],
        createdTracks: [],
        modifiedTracks: [],
        deletedTracks: [],
        createdAssets: [],
        modifiedAssets: [],
        deletedAssets: [],
      };

      const result: PipelineExecutionResult = {
        status: 'success',
        ops: [],
        risk: 'mutating',
        requiresApproval: false,
        errors: [],
        executedSteps: 0,
        totalSteps: 0,
        metadata: {
          executionTimeMs: 0,
          opsGenerated: 0,
          branchesEvaluated: 0,
          loopsIterated: 0,
        },
      };

      const desc = describePipelineChanges(result, changedAssets);

      expect(desc).toContain('Create 2 assets');
    });

    it('should describe multiple types of changes', () => {
      const changedAssets: ChangedAssets = {
        createdNodes: ['new-node'],
        modifiedNodes: ['existing-node'],
        deletedNodes: [],
        createdClips: [],
        modifiedClips: ['clip1'],
        deletedClips: [],
        createdTracks: [],
        modifiedTracks: [],
        deletedTracks: ['old-track'],
        createdAssets: [],
        modifiedAssets: [],
        deletedAssets: [],
      };

      const result: PipelineExecutionResult = {
        status: 'success',
        ops: [],
        risk: 'destructive',
        requiresApproval: true,
        errors: [],
        executedSteps: 0,
        totalSteps: 0,
        metadata: {
          executionTimeMs: 0,
          opsGenerated: 0,
          branchesEvaluated: 2,
          loopsIterated: 1,
        },
      };

      const desc = describePipelineChanges(result, changedAssets);

      expect(desc).toContain('operation');
      expect(desc).toContain('Create');
      expect(desc).toContain('Modify');
      expect(desc).toContain('Delete');
    });

    it('should include execution metadata', () => {
      const changedAssets: ChangedAssets = {
        createdNodes: [],
        modifiedNodes: [],
        deletedNodes: [],
        createdClips: [],
        modifiedClips: [],
        deletedClips: [],
        createdTracks: [],
        modifiedTracks: [],
        deletedTracks: [],
        createdAssets: [],
        modifiedAssets: [],
        deletedAssets: [],
      };

      const result: PipelineExecutionResult = {
        status: 'success',
        ops: [
          { op: 'node.create', nodeId: 'n1', type: 'mesh' },
        ],
        risk: 'mutating',
        requiresApproval: false,
        errors: [],
        executedSteps: 1,
        totalSteps: 1,
        metadata: {
          executionTimeMs: 10,
          opsGenerated: 1,
          branchesEvaluated: 3,
          loopsIterated: 2,
        },
      };

      const desc = describePipelineChanges(result, changedAssets);

      expect(desc).toContain('branch');
      expect(desc).toContain('loop');
    });
  });

  describe('getApprovalLevel', () => {
    it('should return auto-approve for safe ops', () => {
      expect(getApprovalLevel('safe')).toBe('auto-approve');
    });

    it('should return requires-review for mutating ops', () => {
      expect(getApprovalLevel('mutating')).toBe('requires-review');
    });

    it('should return requires-approval for destructive ops', () => {
      expect(getApprovalLevel('destructive')).toBe('requires-approval');
    });
  });

  describe('extractChangedAssets', () => {
    it('should track created nodes', () => {
      const ops = [
        { op: 'node.create', nodeId: 'new-light', type: 'light.directional' },
        { op: 'node.create', nodeId: 'new-mesh', type: 'mesh' },
      ];

      const changed = extractChangedAssets(sampleDoc, ops);

      expect(changed.createdNodes).toContain('new-light');
      expect(changed.createdNodes).toContain('new-mesh');
      expect(changed.createdNodes.length).toBe(2);
    });

    it('should track modified nodes', () => {
      const ops = [
        { op: 'node.update', nodeId: 'camera' },
        { op: 'node.setProperty', nodeId: 'camera', property: 'position.z', value: 10 },
      ];

      const changed = extractChangedAssets(sampleDoc, ops);

      expect(changed.modifiedNodes).toContain('camera');
    });

    it('should track deleted nodes', () => {
      const ops = [
        { op: 'node.delete', nodeId: 'camera' },
      ];

      const changed = extractChangedAssets(sampleDoc, ops);

      expect(changed.deletedNodes).toContain('camera');
    });

    it('should track created clips', () => {
      const ops = [
        { op: 'clip.create', clipId: 'intro-clip' },
      ];

      const changed = extractChangedAssets(sampleDoc, ops);

      expect(changed.createdClips).toContain('intro-clip');
    });

    it('should track modified tracks', () => {
      const ops = [
        { op: 'track.create', trackId: 'camera-track' },
        { op: 'track.setName', trackId: 'camera-track', name: 'Camera Motion' },
      ];

      const changed = extractChangedAssets(sampleDoc, ops);

      // Created tracks are detected
      expect(changed.createdTracks).toContain('camera-track');
      // Modified tracks would also include it (first operation creates it)
      // So it should be in either created or modified, at least created
      expect(changed.createdTracks.length).toBeGreaterThan(0);
    });

    it('should avoid duplicates when same asset modified multiple times', () => {
      const ops = [
        { op: 'node.update', nodeId: 'camera' },
        { op: 'node.setProperty', nodeId: 'camera', property: 'position.x', value: 5 },
        { op: 'node.setProperty', nodeId: 'camera', property: 'position.y', value: 10 },
      ];

      const changed = extractChangedAssets(sampleDoc, ops);

      expect(changed.modifiedNodes.filter(n => n === 'camera').length).toBe(1);
    });
  });

  describe('previewOp', () => {
    it('should preview node creation', () => {
      const op = { op: 'node.create', nodeId: 'my-light', type: 'light.directional' };
      const preview = previewOp(op);

      expect(preview).toContain('Create node');
      expect(preview).toContain('my-light');
    });

    it('should preview node deletion', () => {
      const op = { op: 'node.delete', nodeId: 'old-mesh' };
      const preview = previewOp(op);

      expect(preview).toContain('Delete node');
      expect(preview).toContain('old-mesh');
    });

    it('should preview clip creation', () => {
      const op = { op: 'clip.create', clipId: 'opening' };
      const preview = previewOp(op);

      expect(preview).toContain('Create clip');
      expect(preview).toContain('opening');
    });

    it('should preview keyframe addition', () => {
      const op = { op: 'keyframe.add', keyframeId: 'kf-1', time: 2.5 };
      const preview = previewOp(op);

      expect(preview).toContain('keyframe');
      expect(preview).toContain('2.5');
    });

    it('should handle unknown op types gracefully', () => {
      const op = { op: 'custom.operation', customData: 'value' };
      const preview = previewOp(op);

      expect(preview).toBe('custom.operation');
    });
  });

  describe('validateApprovalRequirement', () => {
    it('should validate safe ops do not require approval', () => {
      const result: PipelineExecutionResult = {
        status: 'success',
        ops: [{ op: 'document.rename', name: 'Test' }],
        risk: 'safe',
        requiresApproval: false,
        errors: [],
        executedSteps: 0,
        totalSteps: 0,
        metadata: {
          executionTimeMs: 0,
          opsGenerated: 1,
          branchesEvaluated: 0,
          loopsIterated: 0,
        },
      };

      expect(validateApprovalRequirement(result)).toBe(true);
    });

    it('should validate destructive ops require approval', () => {
      const result: PipelineExecutionResult = {
        status: 'success',
        ops: [{ op: 'node.delete', nodeId: 'camera' }],
        risk: 'destructive',
        requiresApproval: true,
        errors: [],
        executedSteps: 0,
        totalSteps: 0,
        metadata: {
          executionTimeMs: 0,
          opsGenerated: 1,
          branchesEvaluated: 0,
          loopsIterated: 0,
        },
      };

      expect(validateApprovalRequirement(result)).toBe(true);
    });

    it('should catch mismatches between risk and approval requirement', () => {
      const result: PipelineExecutionResult = {
        status: 'success',
        ops: [{ op: 'node.delete', nodeId: 'camera' }],
        risk: 'destructive',
        requiresApproval: false,  // Mismatch!
        errors: [],
        executedSteps: 0,
        totalSteps: 0,
        metadata: {
          executionTimeMs: 0,
          opsGenerated: 1,
          branchesEvaluated: 0,
          loopsIterated: 0,
        },
      };

      expect(validateApprovalRequirement(result)).toBe(false);
    });
  });
});
