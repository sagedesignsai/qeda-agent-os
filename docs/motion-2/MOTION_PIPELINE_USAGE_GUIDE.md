# Motion Pipeline System - Complete Usage Guide

A comprehensive framework for orchestrating complex Motion operations through declarative pipelines and fluent APIs.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Core Concepts](#core-concepts)
3. [DSL Format](#dsl-format)
4. [Fluent Builder API](#fluent-builder-api)
5. [Execution & Approval](#execution--approval)
6. [Built-in Pipelines](#built-in-pipelines)
7. [Advanced Patterns](#advanced-patterns)
8. [Best Practices](#best-practices)
9. [API Reference](#api-reference)

---

## Quick Start

### 1. Using Built-in Pipelines

```typescript
import { pipelineLibrary } from '@/lib/motion/pipeline/integration';
import { executePipeline } from '@/lib/motion/pipeline/engine';
import { pipelineToMotionPlan } from '@/lib/motion/pipeline/approval';

// Get a built-in pipeline
const pipeline = pipelineLibrary.getPipeline('setup-camera');

// Execute with parameters
const result = await executePipeline(pipeline, motionDocument, {
  positionX: 0,
  positionY: 10,
  positionZ: 20,
  fov: 45,
});

// Create approval plan
const plan = pipelineToMotionPlan(result, pipeline, motionDocument);

// User approves and applies
if (userApproved) {
  applyMotionCommand(motionDocument, planMotionCommand(plan));
}
```

### 2. Using Fluent Builder

```typescript
import { createPipeline } from '@/lib/motion/pipeline/builder';

const pipeline = createPipeline('my-lighting-setup')
  .name('My Lighting Setup')
  .param('intensity')
  .param('color')
  .op('node.create', { nodeId: 'light-1', type: 'light.directional' })
  .op('node.update', { nodeId: 'light-1', intensity: '{{intensity}}' })
  .build();

// Execute and apply
const result = await executePipeline(pipeline, doc, {
  intensity: 1.5,
  color: '#ffffff',
});
```

### 3. Parsing DSL

```typescript
import { compilePipelineDSL } from '@/lib/motion/pipeline/parser';

const dslText = `
name: Setup Lights
params:
  - intensity
steps:
  - op: node.create
    params:
      nodeId: light-1
      type: light.directional
  - op: node.update
    params:
      nodeId: light-1
      intensity: "{{intensity}}"
`;

const { pipeline, errors } = compilePipelineDSL(dslText);

if (!errors.length) {
  const result = await executePipeline(pipeline, doc, { intensity: 1.5 });
}
```

---

## Core Concepts

### Pipelines

A pipeline is a sequence of operations to execute on a Motion document.

```typescript
interface MotionPipeline {
  id: string;                    // Unique identifier
  name: string;                  // User-friendly name
  description?: string;          // What it does
  params?: string[];            // Input parameters
  steps: PipelineStep[];        // Operations to execute
  category?: string;            // For organization
  tags?: string[];              // Classification
  version?: string;             // Semantic version
  createdAt: string;            // ISO timestamp
  updatedAt: string;            // ISO timestamp
}
```

### Steps

Five types of steps can be executed:

#### 1. Op Step - Execute a Motion operation

```typescript
{
  op: 'op',
  params: {
    op: 'node.create',
    nodeId: 'light-1',
    type: 'light.directional'
  }
}
```

#### 2. Branch Step - Conditional execution

```typescript
{
  op: 'branch',
  condition: { type: 'node-exists', nodeId: 'camera' },
  then: [...steps],
  else: [...steps]
}
```

#### 3. Loop Step - Iterate over items

```typescript
{
  op: 'loop',
  over: { type: 'nodes' },
  body: [...steps],
  variable: 'item'
}
```

#### 4. Sequence Step - Group steps

```typescript
{
  op: 'sequence',
  steps: [...steps]
}
```

#### 5. Call Step - Call another pipeline

```typescript
{
  op: 'call',
  pipelineId: 'other-pipeline',
  params: { intensity: 1.5 }
}
```

### Conditions

Five condition types support branching:

```typescript
// Node exists
{ type: 'node-exists', nodeId: 'camera' }

// Clip exists
{ type: 'clip-exists', clipId: 'intro' }

// Track exists
{ type: 'track-exists', trackId: 'animation' }

// Asset exists
{ type: 'asset-exists', assetId: 'model-1' }

// Property value comparison
{
  type: 'property-value',
  nodeId: 'camera',
  property: 'transform.position.z',
  operator: '>' | '<' | '==' | '!=' | '<=' | '>=',
  value: 10
}
```

### Loop Sources

Five loop source types for iteration:

```typescript
// All nodes
{ type: 'nodes' }

// Nodes of specific type
{ type: 'nodes', nodeType: 'light.directional' }

// All clips
{ type: 'clips' }

// All tracks
{ type: 'tracks' }

// All assets of kind
{ type: 'assets' }
{ type: 'assets', kind: 'model' }

// Explicit collection
{ type: 'collection', items: ['id1', 'id2', 'id3'] }
```

---

## DSL Format

### YAML Example

```yaml
id: scene-setup
name: Scene Setup
description: Initialize scene with lights and camera
category: setup
tags: [lighting, procedural]
version: 1.0.0
params:
  - lightIntensity
  - cameraDistance

steps:
  # Create directional light
  - op: node.create
    params:
      nodeId: sun
      type: light.directional
      intensity: '{{lightIntensity}}'

  # Setup camera if missing
  - op: branch
    condition:
      type: node-exists
      nodeId: camera
    then:
      - op: node.update
        params:
          nodeId: camera
          position: [0, 5, '{{cameraDistance}}']
    else:
      - op: node.create
        params:
          nodeId: camera
          type: camera
          position: [0, 5, '{{cameraDistance}}']

  # Animate all meshes
  - op: loop
    over:
      type: nodes
      nodeType: mesh
    variable: mesh
    body:
      - op: keyframe.add
        params:
          nodeId: '{{mesh.id}}'
          time: 0
          value: 0
      - op: keyframe.add
        params:
          nodeId: '{{mesh.id}}'
          time: 5
          value: 1
```

### JSON Example

```json
{
  "id": "scene-setup",
  "name": "Scene Setup",
  "params": ["lightIntensity", "cameraDistance"],
  "steps": [
    {
      "op": "op",
      "params": {
        "op": "node.create",
        "nodeId": "sun",
        "type": "light.directional",
        "intensity": "{{lightIntensity}}"
      }
    },
    {
      "op": "branch",
      "condition": {
        "type": "node-exists",
        "nodeId": "camera"
      },
      "then": [
        {
          "op": "op",
          "params": {
            "op": "node.update",
            "nodeId": "camera",
            "position": [0, 5, "{{cameraDistance}}"]
          }
        }
      ]
    }
  ],
  "createdAt": "2026-11-21T02:00:00Z",
  "updatedAt": "2026-11-21T02:00:00Z"
}
```

### Parameter Interpolation

Use `{{paramName}}` to reference parameters:

```yaml
steps:
  - op: node.update
    params:
      nodeId: light-1
      intensity: '{{intensity}}'           # String interpolation
      visible: '{{isVisible}}'             # Boolean interpolation
      count: '{{nodeCount}}'               # Number interpolation
```

All interpolation types are supported: strings, numbers, booleans, objects, and arrays.

---

## Fluent Builder API

### Basic Pipeline

```typescript
import { createPipeline } from '@/lib/motion/pipeline/builder';

const pipeline = createPipeline('my-pipeline')
  .name('My Pipeline')
  .description('Does something useful')
  .param('param1')
  .param('param2')
  .tag('example')
  .op('node.create', { nodeId: 'n1', type: 'mesh' })
  .op('node.update', { nodeId: 'n1', intensity: 1.5 })
  .build();
```

### Conditional Branching

```typescript
const pipeline = createPipeline('conditional')
  .if(c => c.nodeExists('camera'))
    .then(s => s.op('node.update', { nodeId: 'camera' }))
    .else(s => s.op('node.create', { nodeId: 'camera', type: 'camera' }))
    .end()
  .build();
```

All condition types:

```typescript
c.nodeExists('nodeId')
c.clipExists('clipId')
c.trackExists('trackId')
c.assetExists('assetId')
c.property('nodeId', 'property.path', '>', 5)
```

### Loops

```typescript
const pipeline = createPipeline('looping')
  // Loop all nodes
  .loop(l => l.allNodes())
    .do(s => s.op('node.update', { nodeId: '{{item.id}}' }))
    .end()
  
  // Loop filtered nodes
  .loop(l => l.allNodes('light.directional'))
    .as('light')
    .do(s => s.op('node.update', { nodeId: '{{light.id}}', intensity: 2 }))
    .end()
  
  // Loop clips
  .loop(l => l.allClips())
    .do(s => s.op('clip.update', { clipId: '{{item.id}}' }))
    .end()
  
  // Loop collection
  .loop(l => l.collection(['id1', 'id2', 'id3']))
    .do(s => s.op('node.update', { nodeId: '{{item}}' }))
    .end()
  
  .build();
```

### Complex Nesting

```typescript
const pipeline = createPipeline('complex')
  .loop(l => l.allNodes())
    .as('node')
    .do(s =>
      s.if(c => c.property('{{node.id}}', 'type', '==', 'light.directional'))
        .then(s2 => s2.op('node.update', { nodeId: '{{node.id}}' }))
        .end()
    )
    .end()
  .build();
```

---

## Execution & Approval

### Execute Pipeline

```typescript
import { executePipeline } from '@/lib/motion/pipeline/engine';

const result = await executePipeline(pipeline, doc, {
  param1: 'value1',
  param2: 42,
});

// Result contains:
{
  status: 'success' | 'error',
  ops: [...],                    // Operations to apply
  risk: 'safe' | 'mutating' | 'destructive',
  requiresApproval: boolean,
  errors: [...],
  executedSteps: number,
  totalSteps: number,
  metadata: {
    executionTimeMs: number,
    opsGenerated: number,
    branchesEvaluated: number,
    loopsIterated: number
  }
}
```

### Create Approval Plan

```typescript
import { pipelineToMotionPlan } from '@/lib/motion/pipeline/approval';

const plan = pipelineToMotionPlan(result, pipeline, doc);

// Plan contains:
{
  id: string,
  name: string,
  description: string,
  ops: [...],
  risk: 'safe' | 'mutating' | 'destructive',
  requiresApproval: boolean,
  metadata: {
    pipeline: {
      approvalLevel: 'auto-approve' | 'requires-review' | 'requires-approval',
      changeDescription: string,
      changedAssets: {
        createdNodes: [...],
        modifiedNodes: [...],
        deletedNodes: [...]
      },
      opsPreview: [...]
    }
  }
}
```

### Apply Operations

```typescript
import { planMotionCommand } from '@/lib/motion/plan';
import { applyMotionCommand } from '@/lib/motion/store';

if (plan.requiresApproval) {
  // Show approval card to user
  showApprovalCard(plan);
} else {
  // Auto-apply safe operations
  const command = planMotionCommand(plan);
  applyMotionCommand(doc, command);
}
```

---

## Built-in Pipelines

### 1. Setup Directional Lights

Configure scene lighting.

```typescript
const pipeline = pipelineLibrary.getPipeline('setup-directional-lights');

const result = await executePipeline(pipeline, doc, {
  intensity: 1.5,
  color: '#ffffff'
});
```

### 2. Setup Keyframe Animation

Create animations on all nodes.

```typescript
const pipeline = pipelineLibrary.getPipeline('setup-keyframe-animation');

const result = await executePipeline(pipeline, doc, {
  duration: 5,
  startValue: 0,
  endValue: 1
});
```

### 3. Optimize Scene

Remove invisible objects.

```typescript
const pipeline = pipelineLibrary.getPipeline('optimize-scene');
const result = await executePipeline(pipeline, doc, {});
```

### 4. Setup Camera

Create or update main camera.

```typescript
const pipeline = pipelineLibrary.getPipeline('setup-camera');

const result = await executePipeline(pipeline, doc, {
  positionX: 0,
  positionY: 10,
  positionZ: 20,
  fov: 45
});
```

### 5. Update Materials

Modify material properties on all meshes.

```typescript
const pipeline = pipelineLibrary.getPipeline('update-materials');

const result = await executePipeline(pipeline, doc, {
  roughness: 0.5,
  metallic: 0.8
});
```

### 6. Setup Environment

Configure environment.

```typescript
const pipeline = pipelineLibrary.getPipeline('setup-environment');

const result = await executePipeline(pipeline, doc, {
  skyboxUrl: 'https://example.com/skybox.hdr',
  ambientIntensity: 0.5
});
```

---

## Advanced Patterns

### Pattern 1: Conditional Setup

```typescript
const pipeline = createPipeline('smart-setup')
  .name('Smart Scene Setup')
  .if(c => c.nodeExists('camera'))
    .then(s => s.op('node.update', { nodeId: 'camera' }))
    .else(s => s.op('node.create', { nodeId: 'camera', type: 'camera' }))
    .end()
  .if(c => c.nodeExists('lighting'))
    .then(s => s.op('node.delete', { nodeId: 'old-light' }))
    .end()
  .build();
```

### Pattern 2: Batch Operations

```typescript
const pipeline = createPipeline('batch-update')
  .loop(l => l.allNodes('mesh'))
    .as('mesh')
    .do(s =>
      s.op('material.update', {
        nodeId: '{{mesh.id}}',
        roughness: 0.5
      })
        .op('material.update', {
          nodeId: '{{mesh.id}}',
          metallic: 0.8
        })
    )
    .end()
  .build();
```

### Pattern 3: Selective Processing

```typescript
const pipeline = createPipeline('selective')
  .loop(l => l.allNodes())
    .as('node')
    .do(s =>
      s.if(c => c.property('{{node.id}}', 'intensity', '>', 0))
        .then(s2 => s2.op('node.update', { nodeId: '{{node.id}}' }))
        .else(s2 => s2.op('node.delete', { nodeId: '{{node.id}}' }))
        .end()
    )
    .end()
  .build();
```

### Pattern 4: Nested Sequences

```typescript
const pipeline = createPipeline('nested')
  .sequence(s => {
    s.op('node.create', { nodeId: 'group', type: 'group' })
      .loop(l => l.allNodes('mesh'))
        .do(s2 =>
          s2.op('node.reparent', {
            nodeId: '{{item.id}}',
            parentId: 'group'
          })
        )
        .end();
  })
  .build();
```

### Pattern 5: Parameter-Driven

```typescript
const pipeline = createPipeline('parameterized')
  .param('nodeType')
  .param('propertyName')
  .param('propertyValue')
  .loop(l => l.allNodes('{{nodeType}}'))
    .do(s =>
      s.op('node.update', {
        nodeId: '{{item.id}}',
        ['{{propertyName}}']: '{{propertyValue}}'
      })
    )
    .end()
  .build();
```

---

## Best Practices

### 1. Use Meaningful IDs

```typescript
// ✅ Good
.param('cameraDistance')
.op('node.create', { nodeId: 'camera-main' })

// ❌ Avoid
.op('node.create', { nodeId: 'c1' })
```

### 2. Parametrize Reusable Values

```typescript
// ✅ Good
.param('intensity')
.param('color')
.op('node.update', {
  nodeId: 'light',
  intensity: '{{intensity}}',
  color: '{{color}}'
})

// ❌ Avoid
.op('node.update', {
  nodeId: 'light',
  intensity: 1.5,
  color: '#ffffff'
})
```

### 3. Use Descriptive Names

```typescript
// ✅ Good
createPipeline('setup-scene-lighting')
  .name('Setup Scene Lighting')
  .description('Configure lights for optimal scene illumination')

// ❌ Avoid
createPipeline('setup')
```

### 4. Handle Edge Cases

```typescript
// ✅ Good - Check before updating
.if(c => c.nodeExists('camera'))
  .then(s => s.op('node.update', { nodeId: 'camera' }))
  .else(s => s.op('node.create', { nodeId: 'camera', type: 'camera' }))
  .end()

// ❌ Avoid - Assumes camera exists
.op('node.update', { nodeId: 'camera' })
```

### 5. Use Tags for Organization

```typescript
// ✅ Good
createPipeline('my-pipeline')
  .tag('lighting')
  .tag('setup')
  .tag('procedural')

// ❌ Avoid - No tags for discovery
```

### 6. Validate Before Execution

```typescript
// ✅ Good
const { pipeline, errors } = compilePipelineDSL(dsl);
if (errors.length) {
  console.error('Validation errors:', errors);
  return;
}

// ❌ Avoid - No error checking
const result = await executePipeline(pipeline, doc);
```

### 7. Handle Approval Properly

```typescript
// ✅ Good
const result = await executePipeline(pipeline, doc, params);
if (result.requiresApproval) {
  const plan = pipelineToMotionPlan(result, pipeline, doc);
  showApprovalCard(plan);
} else {
  applyMotionCommand(doc, planMotionCommand(plan));
}

// ❌ Avoid - Ignoring approval requirements
applyMotionCommand(doc, result.ops);
```

---

## API Reference

### Parser

```typescript
parsePipelineDSL(input: string)
  → { pipeline: MotionPipeline | null, errors: PipelineError[] }

compilePipelineDSL(input: string, options?: CompileOptions)
  → { pipeline: MotionPipeline | null, errors: PipelineError[], warnings: string[] }

interpolatePipelineParams(pipeline: MotionPipeline, params: Record<string, any>)
  → { pipeline: MotionPipeline, errors: PipelineError[] }

pipelineToYAML(pipeline: MotionPipeline)
  → string

pipelineToJSON(pipeline: MotionPipeline)
  → string
```

### Engine

```typescript
executePipeline(pipeline: MotionPipeline, doc: MotionDocument, params?: Record<string, any>, options?: ExecutionOptions)
  → Promise<PipelineExecutionResult>

validatePipelineExecution(pipeline: MotionPipeline, doc: MotionDocument, params?: Record<string, any>)
  → { valid: boolean, errors: PipelineError[] }
```

### Approval

```typescript
pipelineToMotionPlan(result: PipelineExecutionResult, pipeline: MotionPipeline, doc: MotionDocument)
  → MotionPlan

estimatePipelineRisk(pipeline: MotionPipeline)
  → 'safe' | 'mutating' | 'destructive'

describePipelineChanges(result: PipelineExecutionResult, changed: ChangedAssets)
  → string
```

### Builder

```typescript
createPipeline(id: string)
  → PipelineBuilder

new PipelineBuilder(id: string)
  .name(value: string) → PipelineBuilder
  .description(value: string) → PipelineBuilder
  .param(name: string) → PipelineBuilder
  .params(...names: string[]) → PipelineBuilder
  .tag(value: string) → PipelineBuilder
  .op(type: string, params: Record<string, any>) → PipelineBuilder
  .if(conditionFn: (c: ConditionBuilder) => Condition) → BranchBuilder
  .loop(sourceFn: (l: LoopSourceBuilder) => LoopSource) → LoopBuilder
  .sequence(stepsFn: (s: SequenceBuilder) => void) → PipelineBuilder
  .build() → MotionPipeline
```

### Tool Factory

```typescript
generateToolFromPipeline(pipeline: MotionPipeline)
  → GeneratedPipelineTool

estimatePipelineRisk(pipeline: MotionPipeline)
  → 'safe' | 'mutating' | 'destructive'

new PipelineToolRegistry()
  .register(pipeline: MotionPipeline) → GeneratedPipelineTool
  .registerMany(pipelines: MotionPipeline[]) → GeneratedPipelineTool[]
  .getTool(name: string) → GeneratedPipelineTool | undefined
  .getAllTools() → GeneratedPipelineTool[]
  .getToolsByCategory(category: string) → GeneratedPipelineTool[]
  .getToolsByRisk(risk: string) → GeneratedPipelineTool[]
  .getStats() → RegistryStats

convertToAISDKTool(tool: GeneratedPipelineTool)
  → Record<string, any>

generateToolDocumentation(tool: GeneratedPipelineTool)
  → string
```

### Integration

```typescript
pipelineLibrary: BuiltInPipelineLibrary
  .getPipeline(id: string) → MotionPipeline | undefined
  .getAllPipelines() → MotionPipeline[]
  .getPipelinesByCategory(category: string) → MotionPipeline[]
  .getPipelinesByTag(tag: string) → MotionPipeline[]
  .searchPipelines(query: string) → MotionPipeline[]
  .getCategories() → string[]
  .getAllTags() → string[]
  .getStats() → LibraryStats

pipelineIntegration: PipelineIntegrationManager
  .registerBuiltins() → void
  .registerCustom(pipelines: MotionPipeline[]) → void
  .getRegistry() → PipelineToolRegistry
  .getLibrary() → BuiltInPipelineLibrary
  .getStatistics() → CombinedStats
  .getDiscoveryInterface() → DiscoveryInterface
```

---

## Examples

See `/docs/motion-2/examples/` for complete working examples.

