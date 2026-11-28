import {
  PipelineBuilder,
  BranchBuilder,
  LoopBuilder,
  ConditionBuilder,
  LoopSourceBuilder,
  SequenceBuilder,
  createPipeline,
} from '../lib/motion/pipeline/builder';
import { MotionPipeline, OpStep, ConditionalBranchStep, LoopStep } from '../lib/motion/pipeline/types';

describe('Pipeline Builder', () => {
  describe('PipelineBuilder', () => {
    it('should create basic pipeline with single op', () => {
      const pipeline = new PipelineBuilder('test-1')
        .name('Test Pipeline')
        .description('For testing')
        .op('node.create', { nodeId: 'light-1', type: 'light.directional' })
        .build();

      expect(pipeline.id).toBe('test-1');
      expect(pipeline.name).toBe('Test Pipeline');
      expect(pipeline.description).toBe('For testing');
      expect(pipeline.steps.length).toBe(1);
      expect((pipeline.steps[0] as OpStep).params.op).toBe('node.create');
    });

    it('should chain multiple ops', () => {
      const pipeline = new PipelineBuilder('multi-op')
        .op('node.create', { nodeId: 'light-1', type: 'light.directional' })
        .op('node.create', { nodeId: 'light-2', type: 'light.point' })
        .op('node.create', { nodeId: 'mesh-1', type: 'mesh' })
        .build();

      expect(pipeline.steps.length).toBe(3);
      expect((pipeline.steps[0] as OpStep).params.op).toBe('node.create');
      expect((pipeline.steps[1] as OpStep).params.op).toBe('node.create');
      expect((pipeline.steps[2] as OpStep).params.op).toBe('node.create');
    });

    it('should handle parameters', () => {
      const pipeline = new PipelineBuilder('params')
        .param('sceneId')
        .param('intensity')
        .params('color', 'rotation')
        .build();

      expect(pipeline.params.length).toBe(4);
      expect(pipeline.params).toContain('sceneId');
      expect(pipeline.params).toContain('intensity');
      expect(pipeline.params).toContain('color');
      expect(pipeline.params).toContain('rotation');
    });

    it('should handle tags', () => {
      const pipeline = new PipelineBuilder('tagged')
        .tag('lighting')
        .tag('setup')
        .tag('procedural')
        .build();

      expect(pipeline.tags?.length).toBe(3);
      expect(pipeline.tags).toContain('lighting');
      expect(pipeline.tags).toContain('setup');
    });

    it('should avoid duplicate tags', () => {
      const pipeline = new PipelineBuilder('no-dups')
        .tag('setup')
        .tag('setup')
        .tag('setup')
        .build();

      expect(pipeline.tags?.length).toBe(1);
    });

    it('should set timestamps on build', () => {
      const before = new Date().toISOString();
      const pipeline = new PipelineBuilder('timestamps').build();
      const after = new Date().toISOString();

      expect(pipeline.createdAt).toBeDefined();
      expect(pipeline.updatedAt).toBeDefined();
      expect(pipeline.createdAt >= before).toBe(true);
      expect(pipeline.createdAt <= after).toBe(true);
    });

    it('should return PipelineBuilder instance for chaining', () => {
      const builder = new PipelineBuilder('chain');
      const named = builder.name('Test');

      expect(named).toBe(builder);
    });
  });

  describe('Conditional Branches', () => {
    it('should create simple if-then branch', () => {
      const pipeline = new PipelineBuilder('branch-1')
        .if(c => c.nodeExists('camera'))
        .then(s => s.op('node.update', { nodeId: 'camera', position: [0, 5, 10] }))
        .end()
        .build();

      expect(pipeline.steps.length).toBe(1);
      const branchStep = pipeline.steps[0] as ConditionalBranchStep;
      expect(branchStep.op).toBe('branch');
      expect(branchStep.condition.type).toBe('node-exists');
      expect(branchStep.then.length).toBe(1);
      expect(branchStep.else).toBeUndefined();
    });

    it('should create if-then-else branch', () => {
      const pipeline = new PipelineBuilder('branch-2')
        .if(c => c.nodeExists('camera'))
        .then(s => s.op('node.update', { nodeId: 'camera' }))
        .else(s => s.op('node.create', { nodeId: 'camera', type: 'camera' }))
        .end()
        .build();

      const branchStep = pipeline.steps[0] as ConditionalBranchStep;
      expect(branchStep.then.length).toBe(1);
      expect(branchStep.else?.length).toBe(1);
    });

    it('should support property-value conditions', () => {
      const pipeline = new PipelineBuilder('prop-cond')
        .if(c => c.property('camera', 'transform.position.z', '>', 0))
        .then(s => s.op('node.update', { nodeId: 'camera' }))
        .end()
        .build();

      const branchStep = pipeline.steps[0] as ConditionalBranchStep;
      expect(branchStep.condition.type).toBe('property-value');
      expect((branchStep.condition as any).operator).toBe('>');
      expect((branchStep.condition as any).value).toBe(0);
    });

    it('should support nested branches in then', () => {
      const pipeline = new PipelineBuilder('nested-branch')
        .if(c => c.nodeExists('light'))
        .then(s =>
          s.if(c => c.property('light', 'intensity', '>', 0.5))
            .then(s2 => s2.op('node.update', { nodeId: 'light' }))
            .end()
        )
        .end()
        .build();

      expect(pipeline.steps.length).toBe(1);
      const outerBranch = pipeline.steps[0] as ConditionalBranchStep;
      expect(outerBranch.then.length).toBe(1);
      expect((outerBranch.then[0] as ConditionalBranchStep).op).toBe('branch');
    });
  });

  describe('Loops', () => {
    it('should create loop over all nodes', () => {
      const pipeline = new PipelineBuilder('loop-nodes')
        .loop(l => l.allNodes())
        .do(s => s.op('node.update', { nodeId: '{{item.id}}' }))
        .end()
        .build();

      expect(pipeline.steps.length).toBe(1);
      const loopStep = pipeline.steps[0] as LoopStep;
      expect(loopStep.op).toBe('loop');
      expect(loopStep.over.type).toBe('nodes');
      expect(loopStep.body.length).toBe(1);
    });

    it('should create loop with custom variable', () => {
      const pipeline = new PipelineBuilder('loop-var')
        .loop(l => l.allNodes())
        .as('node')
        .do(s => s.op('node.update', { nodeId: '{{node.id}}' }))
        .end()
        .build();

      const loopStep = pipeline.steps[0] as LoopStep;
      expect(loopStep.variable).toBe('node');
    });

    it('should create loop over filtered nodes', () => {
      const pipeline = new PipelineBuilder('loop-filtered')
        .loop(l => l.allNodes('light.directional'))
        .do(s => s.op('node.update', { nodeId: '{{item.id}}', intensity: 1.5 }))
        .end()
        .build();

      const loopStep = pipeline.steps[0] as LoopStep;
      expect((loopStep.over as any).nodeType).toBe('light.directional');
    });

    it('should create loop over clips', () => {
      const pipeline = new PipelineBuilder('loop-clips')
        .loop(l => l.allClips())
        .do(s => s.op('clip.update', { clipId: '{{item.id}}' }))
        .end()
        .build();

      const loopStep = pipeline.steps[0] as LoopStep;
      expect(loopStep.over.type).toBe('clips');
    });

    it('should create loop over collection', () => {
      const pipeline = new PipelineBuilder('loop-collection')
        .loop(l => l.collection(['id1', 'id2', 'id3']))
        .do(s => s.op('node.update', { nodeId: '{{item}}' }))
        .end()
        .build();

      const loopStep = pipeline.steps[0] as LoopStep;
      expect(loopStep.over.type).toBe('collection');
      expect((loopStep.over as any).items.length).toBe(3);
    });

    it('should support nested operations in loop body', () => {
      const pipeline = new PipelineBuilder('loop-complex')
        .loop(l => l.allNodes())
        .do(s =>
          s.op('node.update', { nodeId: '{{item.id}}' })
            .op('keyframe.add', { nodeId: '{{item.id}}', time: 0 })
            .op('keyframe.add', { nodeId: '{{item.id}}', time: 5 })
        )
        .end()
        .build();

      const loopStep = pipeline.steps[0] as LoopStep;
      expect(loopStep.body.length).toBe(3);
    });

    it('should support nested branch in loop', () => {
      const pipeline = new PipelineBuilder('loop-branch')
        .loop(l => l.allNodes())
        .do(s =>
          s.if(c => c.property('{{item.id}}', 'type', '==', 'light.directional'))
            .then(s2 => s2.op('node.update', { nodeId: '{{item.id}}', intensity: 2 }))
            .end()
        )
        .end()
        .build();

      const loopStep = pipeline.steps[0] as LoopStep;
      expect(loopStep.body.length).toBe(1);
      expect((loopStep.body[0] as ConditionalBranchStep).op).toBe('branch');
    });
  });

  describe('Sequences', () => {
    it('should create nested sequence', () => {
      const pipeline = new PipelineBuilder('sequence')
        .sequence(s => {
          s.op('node.create', { nodeId: 'light-1', type: 'light.directional' });
          s.op('node.create', { nodeId: 'light-2', type: 'light.point' });
        })
        .build();

      expect(pipeline.steps.length).toBe(1);
      const seqStep = pipeline.steps[0];
      expect(seqStep.op).toBe('sequence');
      expect((seqStep as any).steps.length).toBe(2);
    });

    it('should support branch in sequence', () => {
      const pipeline = new PipelineBuilder('seq-branch')
        .sequence(s => {
          s.if(c => c.nodeExists('camera'))
            .then(s2 => s2.op('node.update', { nodeId: 'camera' }))
            .end();
        })
        .build();

      const seqStep = pipeline.steps[0];
      expect((seqStep as any).steps.length).toBe(1);
      expect(((seqStep as any).steps[0] as ConditionalBranchStep).op).toBe('branch');
    });
  });

  describe('Condition Builders', () => {
    it('should create node-exists condition', () => {
      const cond = new ConditionBuilder().nodeExists('camera');
      expect(cond.type).toBe('node-exists');
      expect((cond as any).nodeId).toBe('camera');
    });

    it('should create clip-exists condition', () => {
      const cond = new ConditionBuilder().clipExists('intro');
      expect(cond.type).toBe('clip-exists');
      expect((cond as any).clipId).toBe('intro');
    });

    it('should create track-exists condition', () => {
      const cond = new ConditionBuilder().trackExists('camera-track');
      expect(cond.type).toBe('track-exists');
      expect((cond as any).trackId).toBe('camera-track');
    });

    it('should create asset-exists condition', () => {
      const cond = new ConditionBuilder().assetExists('model-1');
      expect(cond.type).toBe('asset-exists');
      expect((cond as any).assetId).toBe('model-1');
    });

    it('should create property-value conditions with all operators', () => {
      const cb = new ConditionBuilder();

      expect((cb.property('n', 'p', '<', 5) as any).operator).toBe('<');
      expect((cb.property('n', 'p', '>', 5) as any).operator).toBe('>');
      expect((cb.property('n', 'p', '==', 5) as any).operator).toBe('==');
      expect((cb.property('n', 'p', '!=', 5) as any).operator).toBe('!=');
      expect((cb.property('n', 'p', '<=', 5) as any).operator).toBe('<=');
      expect((cb.property('n', 'p', '>=', 5) as any).operator).toBe('>=');
    });
  });

  describe('Loop Source Builders', () => {
    it('should create all-nodes source', () => {
      const source = new LoopSourceBuilder().allNodes();
      expect(source.type).toBe('nodes');
      expect((source as any).nodeType).toBeUndefined();
    });

    it('should create filtered-nodes source', () => {
      const source = new LoopSourceBuilder().allNodes('light.directional');
      expect(source.type).toBe('nodes');
      expect((source as any).nodeType).toBe('light.directional');
    });

    it('should create all-clips source', () => {
      const source = new LoopSourceBuilder().allClips();
      expect(source.type).toBe('clips');
    });

    it('should create all-tracks source', () => {
      const source = new LoopSourceBuilder().allTracks();
      expect(source.type).toBe('tracks');
    });

    it('should create all-assets source', () => {
      const source = new LoopSourceBuilder().allAssets();
      expect(source.type).toBe('assets');
    });

    it('should create filtered-assets source', () => {
      const source = new LoopSourceBuilder().allAssets('model');
      expect(source.type).toBe('assets');
      expect((source as any).kind).toBe('model');
    });

    it('should create collection source', () => {
      const source = new LoopSourceBuilder().collection(['a', 'b', 'c']);
      expect(source.type).toBe('collection');
      expect((source as any).items.length).toBe(3);
    });
  });

  describe('Complex Pipelines', () => {
    it('should build scene setup pipeline', () => {
      const pipeline = new PipelineBuilder('scene-setup')
        .name('Scene Setup')
        .description('Initialize 3D scene with lights and camera')
        .param('intensity')
        .param('color')
        .tag('setup')
        .tag('lighting')
        // Create lights
        .loop(l => l.allNodes('light.directional'))
        .do(s => s.op('node.update', { nodeId: '{{item.id}}', intensity: '{{intensity}}' }))
        .end()
        // Check and update camera
        .if(c => c.nodeExists('camera'))
        .then(s => s.op('node.update', { nodeId: 'camera', position: [0, 10, 20] }))
        .else(s => s.op('node.create', { nodeId: 'camera', type: 'camera' }))
        .end()
        .build();

      expect(pipeline.name).toBe('Scene Setup');
      expect(pipeline.params.length).toBe(2);
      expect(pipeline.steps.length).toBe(2);
    });

    it('should build animation pipeline with branching', () => {
      const pipeline = new PipelineBuilder('animation')
        .name('Animation Setup')
        .loop(l => l.allClips())
        .as('clip')
        .do(s =>
          s.if(c => c.property('{{clip.id}}', 'duration', '>', 5))
            .then(s2 =>
              s2.op('keyframe.add', { clipId: '{{clip.id}}', time: 0 })
                .op('keyframe.add', { clipId: '{{clip.id}}', time: 5 })
            )
            .else(s2 =>
              s2.op('keyframe.add', { clipId: '{{clip.id}}', time: 0 })
            )
            .end()
        )
        .end()
        .build();

      expect(pipeline.steps.length).toBe(1);
      const loopStep = pipeline.steps[0] as LoopStep;
      expect(loopStep.variable).toBe('clip');
      expect((loopStep.body[0] as ConditionalBranchStep).op).toBe('branch');
    });
  });

  describe('Helper Functions', () => {
    it('should create builder via createPipeline helper', () => {
      const pipeline = createPipeline('test')
        .name('Test')
        .op('node.create', { nodeId: 'test', type: 'mesh' })
        .build();

      expect(pipeline.id).toBe('test');
      expect(pipeline.name).toBe('Test');
      expect(pipeline.steps.length).toBe(1);
    });
  });

  describe('Type Safety', () => {
    it('should produce valid pipeline structure', () => {
      const pipeline = new PipelineBuilder('valid')
        .name('Valid Pipeline')
        .op('node.create', { nodeId: 'n1', type: 'mesh' })
        .build();

      // Check it matches MotionPipeline shape
      expect(pipeline.id).toBeDefined();
      expect(pipeline.name).toBeDefined();
      expect(pipeline.description).toBeDefined();
      expect(pipeline.params).toBeDefined();
      expect(Array.isArray(pipeline.steps)).toBe(true);
      expect(pipeline.createdAt).toBeDefined();
      expect(pipeline.updatedAt).toBeDefined();
    });

    it('should support parameter interpolation syntax', () => {
      const pipeline = new PipelineBuilder('interp')
        .param('lightId')
        .param('intensity')
        .op('node.update', {
          nodeId: '{{lightId}}',
          intensity: '{{intensity}}',
        })
        .build();

      const opStep = pipeline.steps[0] as OpStep;
      expect((opStep.params as any).nodeId).toBe('{{lightId}}');
      expect((opStep.params as any).intensity).toBe('{{intensity}}');
    });
  });
});
