import {
  MotionPipeline,
  PipelineStep,
  StepCondition,
  LoopSource,
  PropertyValueCondition,
  ConditionalBranchStep,
  LoopStep,
  SequenceStep,
  OpStep,
} from './types';

/**
 * Fluent builder API for constructing pipelines programmatically
 *
 * Enables type-safe, chainable construction of complex Motion pipelines
 * without hand-writing YAML/JSON DSL.
 *
 * @example
 * const pipeline = new PipelineBuilder('scene-setup')
 *   .name('Scene Setup')
 *   .description('Initialize 3D scene')
 *   .op('node.create', { nodeId: 'light-1', type: 'light.directional' })
 *   .if(c => c.nodeExists('camera'))
 *     .then(s => s.op('node.update', { nodeId: 'camera', position: [0, 10, 20] }))
 *   .else(s => s.op('node.create', { nodeId: 'camera', type: 'camera' }))
 *   .build();
 */
export class PipelineBuilder {
  private id: string;
  private name_: string = '';
  private description_: string = '';
  private params_: string[] = [];
  private steps_: PipelineStep[] = [];
  private tags_: string[] = [];

  constructor(id: string) {
    this.id = id;
  }

  /**
   * Set pipeline name
   */
  name(value: string): this {
    this.name_ = value;
    return this;
  }

  /**
   * Set pipeline description
   */
  description(value: string): this {
    this.description_ = value;
    return this;
  }

  /**
   * Add parameter name
   */
  param(name: string): this {
    if (!this.params_.includes(name)) {
      this.params_.push(name);
    }
    return this;
  }

  /**
   * Add multiple parameters
   */
  params(...names: string[]): this {
    names.forEach(name => this.param(name));
    return this;
  }

  /**
   * Add tag for categorization
   */
  tag(value: string): this {
    if (!this.tags_.includes(value)) {
      this.tags_.push(value);
    }
    return this;
  }

  /**
   * Add a single op step
   */
  op(opType: string, params: Record<string, any>): this {
    const step: OpStep = {
      op: 'op',
      params: { op: opType, ...params },
    };
    this.steps_.push(step);
    return this;
  }

  /**
   * Add a conditional branch
   */
  if(conditionFn: (c: ConditionBuilder) => StepCondition): BranchBuilder {
    return new BranchBuilder(this, conditionFn);
  }

  /**
   * Add a loop
   */
  loop(sourceFn: (l: LoopSourceBuilder) => LoopSource): LoopBuilder {
    return new LoopBuilder(this, sourceFn);
  }

  /**
   * Add a nested sequence
   */
  sequence(stepsFn: (s: SequenceBuilder) => void): this {
    const seqBuilder = new SequenceBuilder();
    stepsFn(seqBuilder);
    const step: SequenceStep = {
      op: 'sequence',
      steps: seqBuilder.getSteps(),
    };
    this.steps_.push(step);
    return this;
  }

  /**
   * Add custom step directly
   */
  step(step: PipelineStep): this {
    this.steps_.push(step);
    return this;
  }

  /**
   * Build final pipeline
   */
  build(): MotionPipeline {
    const now = new Date().toISOString();
    return {
      id: this.id,
      name: this.name_,
      description: this.description_,
      params: this.params_,
      steps: this.steps_,
      tags: this.tags_.length > 0 ? this.tags_ : undefined,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Add step to builder (internal use)
   */
  addStep(step: PipelineStep): this {
    this.steps_.push(step);
    return this;
  }

  /**
   * Get current steps (internal use)
   */
  getSteps(): PipelineStep[] {
    return this.steps_;
  }
}

/**
 * Builder for conditional branches
 */
export class BranchBuilder {
  private parentBuilder: PipelineBuilder;
  private condition: StepCondition;
  private thenSteps: PipelineStep[] = [];
  private elseSteps: PipelineStep[] = [];

  constructor(
    parentBuilder: PipelineBuilder,
    conditionFn: (c: ConditionBuilder) => StepCondition
  ) {
    this.parentBuilder = parentBuilder;
    this.condition = conditionFn(new ConditionBuilder());
  }

  /**
   * Add steps for true branch
   */
  then(stepsFn: (s: SequenceBuilder) => void): this {
    const seqBuilder = new SequenceBuilder();
    stepsFn(seqBuilder);
    this.thenSteps = seqBuilder.getSteps();
    return this;
  }

  /**
   * Add steps for false branch
   */
  else(stepsFn: (s: SequenceBuilder) => void): this {
    const seqBuilder = new SequenceBuilder();
    stepsFn(seqBuilder);
    this.elseSteps = seqBuilder.getSteps();
    return this;
  }

  /**
   * Finish branch and return to parent
   */
  end(): PipelineBuilder {
    const branchStep: ConditionalBranchStep = {
      op: 'branch',
      condition: this.condition,
      then: this.thenSteps,
      else: this.elseSteps.length > 0 ? this.elseSteps : undefined,
    };
    this.parentBuilder.addStep(branchStep);
    return this.parentBuilder;
  }
}

/**
 * Builder for loops
 */
export class LoopBuilder {
  private parentBuilder: PipelineBuilder;
  private loopSource: LoopSource;
  private bodySteps: PipelineStep[] = [];
  private loopVar: string = 'item';

  constructor(
    parentBuilder: PipelineBuilder,
    sourceFn: (l: LoopSourceBuilder) => LoopSource
  ) {
    this.parentBuilder = parentBuilder;
    this.loopSource = sourceFn(new LoopSourceBuilder());
  }

  /**
   * Set loop variable name
   */
  as(varName: string): this {
    this.loopVar = varName;
    return this;
  }

  /**
   * Add body steps
   */
  do(stepsFn: (s: SequenceBuilder) => void): this {
    const seqBuilder = new SequenceBuilder();
    stepsFn(seqBuilder);
    this.bodySteps = seqBuilder.getSteps();
    return this;
  }

  /**
   * Finish loop and return to parent
   */
  end(): PipelineBuilder {
    const loopStep: LoopStep = {
      op: 'loop',
      over: this.loopSource,
      body: this.bodySteps,
      variable: this.loopVar,
    };
    this.parentBuilder.addStep(loopStep);
    return this.parentBuilder;
  }
}

/**
 * Builder for condition creation
 */
export class ConditionBuilder {
  /**
   * Create node-exists condition
   */
  nodeExists(nodeId: string): StepCondition {
    return {
      type: 'node-exists',
      nodeId,
    };
  }

  /**
   * Create clip-exists condition
   */
  clipExists(clipId: string): StepCondition {
    return {
      type: 'clip-exists',
      clipId,
    };
  }

  /**
   * Create track-exists condition
   */
  trackExists(trackId: string): StepCondition {
    return {
      type: 'track-exists',
      trackId,
    };
  }

  /**
   * Create asset-exists condition
   */
  assetExists(assetId: string): StepCondition {
    return {
      type: 'asset-exists',
      assetId,
    };
  }

  /**
   * Create property-value condition
   */
  property(
    nodeId: string,
    property: string,
    operator: '<' | '>' | '==' | '!=' | '<=' | '>=',
    value: any
  ): StepCondition {
    const condition: PropertyValueCondition = {
      type: 'property-value',
      nodeId,
      property,
      operator,
      value,
    };
    return condition;
  }
}

/**
 * Builder for loop source selection
 */
export class LoopSourceBuilder {
  /**
   * Loop over all nodes (optionally filtered by type)
   */
  allNodes(nodeType?: string): LoopSource {
    return {
      type: 'nodes',
      nodeType,
    };
  }

  /**
   * Loop over all clips
   */
  allClips(): LoopSource {
    return {
      type: 'clips',
    };
  }

  /**
   * Loop over all tracks
   */
  allTracks(): LoopSource {
    return {
      type: 'tracks',
    };
  }

  /**
   * Loop over all assets (optionally filtered by kind)
   */
  allAssets(kind?: string): LoopSource {
    return {
      type: 'assets',
      kind,
    };
  }

  /**
   * Loop over specific items
   */
  collection(items: string[]): LoopSource {
    return {
      type: 'collection',
      items,
    };
  }
}

/**
 * Builder for sequences (used within branches/loops)
 */
export class SequenceBuilder {
  private steps_: PipelineStep[] = [];

  /**
   * Add a single op
   */
  op(opType: string, params: Record<string, any>): this {
    const step: OpStep = {
      op: 'op',
      params: { op: opType, ...params },
    };
    this.steps_.push(step);
    return this;
  }

  /**
   * Add a branch
   */
  if(conditionFn: (c: ConditionBuilder) => StepCondition): SequenceBranchBuilder {
    return new SequenceBranchBuilder(this, conditionFn);
  }

  /**
   * Add a loop
   */
  loop(sourceFn: (l: LoopSourceBuilder) => LoopSource): SequenceLoopBuilder {
    return new SequenceLoopBuilder(this, sourceFn);
  }

  /**
   * Add custom step
   */
  step(step: PipelineStep): this {
    this.steps_.push(step);
    return this;
  }

  /**
   * Get steps (internal use)
   */
  getSteps(): PipelineStep[] {
    return this.steps_;
  }

  /**
   * Add step (internal use)
   */
  addStep(step: PipelineStep): this {
    this.steps_.push(step);
    return this;
  }
}

/**
 * Branch builder for use within sequences
 */
export class SequenceBranchBuilder {
  private sequenceBuilder: SequenceBuilder;
  private condition: StepCondition;
  private thenSteps: PipelineStep[] = [];
  private elseSteps: PipelineStep[] = [];

  constructor(
    sequenceBuilder: SequenceBuilder,
    conditionFn: (c: ConditionBuilder) => StepCondition
  ) {
    this.sequenceBuilder = sequenceBuilder;
    this.condition = conditionFn(new ConditionBuilder());
  }

  then(stepsFn: (s: SequenceBuilder) => void): this {
    const seqBuilder = new SequenceBuilder();
    stepsFn(seqBuilder);
    this.thenSteps = seqBuilder.getSteps();
    return this;
  }

  else(stepsFn: (s: SequenceBuilder) => void): this {
    const seqBuilder = new SequenceBuilder();
    stepsFn(seqBuilder);
    this.elseSteps = seqBuilder.getSteps();
    return this;
  }

  end(): SequenceBuilder {
    const branchStep: ConditionalBranchStep = {
      op: 'branch',
      condition: this.condition,
      then: this.thenSteps,
      else: this.elseSteps.length > 0 ? this.elseSteps : undefined,
    };
    this.sequenceBuilder.addStep(branchStep);
    return this.sequenceBuilder;
  }
}

/**
 * Loop builder for use within sequences
 */
export class SequenceLoopBuilder {
  private sequenceBuilder: SequenceBuilder;
  private loopSource: LoopSource;
  private bodySteps: PipelineStep[] = [];
  private loopVar: string = 'item';

  constructor(
    sequenceBuilder: SequenceBuilder,
    sourceFn: (l: LoopSourceBuilder) => LoopSource
  ) {
    this.sequenceBuilder = sequenceBuilder;
    this.loopSource = sourceFn(new LoopSourceBuilder());
  }

  as(varName: string): this {
    this.loopVar = varName;
    return this;
  }

  do(stepsFn: (s: SequenceBuilder) => void): this {
    const seqBuilder = new SequenceBuilder();
    stepsFn(seqBuilder);
    this.bodySteps = seqBuilder.getSteps();
    return this;
  }

  end(): SequenceBuilder {
    const loopStep: LoopStep = {
      op: 'loop',
      over: this.loopSource,
      body: this.bodySteps,
      variable: this.loopVar,
    };
    this.sequenceBuilder.addStep(loopStep);
    return this.sequenceBuilder;
  }
}

/**
 * Helper to create a pipeline builder
 */
export function createPipeline(id: string): PipelineBuilder {
  return new PipelineBuilder(id);
}
