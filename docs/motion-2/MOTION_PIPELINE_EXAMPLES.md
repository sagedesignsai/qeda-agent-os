# Motion Pipeline Examples

Complete, working examples for common scenarios.

## Example 1: Scene Setup Pipeline

A comprehensive scene setup combining lighting, camera, and environment.

```typescript
import { createPipeline } from '@/lib/motion/pipeline/builder';
import { executePipeline } from '@/lib/motion/pipeline/engine';
import { pipelineToMotionPlan } from '@/lib/motion/pipeline/approval';
import { planMotionCommand, applyMotionCommand } from '@/lib/motion';

// Build pipeline
const pipeline = createPipeline('complete-scene-setup')
  .name('Complete Scene Setup')
  .description('Setup lights, camera, and environment for rendering')
  .param('lightIntensity')
  .param('cameraDistance')
  .param('skyboxUrl')
  .tag('setup')
  .tag('lighting')

  // Setup main light
  .op('node.create', {
    nodeId: 'light-sun',
    type: 'light.directional',
    intensity: '{{lightIntensity}}'
  })

  // Setup camera (create or update)
  .if(c => c.nodeExists('camera-main'))
    .then(s => s.op('node.update', {
      nodeId: 'camera-main',
      position: [0, 10, '{{cameraDistance}}']
    }))
    .else(s => s.op('node.create', {
      nodeId: 'camera-main',
      type: 'camera',
      position: [0, 10, '{{cameraDistance}}']
    }))
    .end()

  // Setup environment
  .op('environment.set-skybox', {
    url: '{{skyboxUrl}}'
  })

  .build();

// Execute
const motionDocument = createStarterMotionDocument();
const result = await executePipeline(pipeline, motionDocument, {
  lightIntensity: 1.5,
  cameraDistance: 20,
  skyboxUrl: 'https://example.com/skybox.hdr'
});

// Get approval plan
const plan = pipelineToMotionPlan(result, pipeline, motionDocument);

// Apply if approved
if (plan.requiresApproval) {
  const userApproved = await showApprovalDialog(plan);
  if (userApproved) {
    applyMotionCommand(motionDocument, planMotionCommand(plan));
  }
} else {
  // Auto-apply safe operations
  applyMotionCommand(motionDocument, planMotionCommand(plan));
}
```

---

## Example 2: Batch Material Update

Update materials on multiple meshes based on conditions.

```typescript
import { createPipeline } from '@/lib/motion/pipeline/builder';

const pipeline = createPipeline('batch-material-update')
  .name('Batch Material Update')
  .description('Update materials on meshes based on intensity')
  .param('roughness')
  .param('metallic')
  .tag('materials')

  .loop(l => l.allNodes('mesh'))
    .as('mesh')
    .do(s =>
      s.if(c => c.property('{{mesh.id}}', 'visible', '==', true))
        .then(s2 =>
          s2.op('material.update', {
            nodeId: '{{mesh.id}}',
            roughness: '{{roughness}}',
            metallic: '{{metallic}}'
          })
        )
        .end()
    )
    .end()

  .build();
```

---

## Example 3: Animation Setup

Create keyframe animations on selected nodes.

```typescript
import { createPipeline } from '@/lib/motion/pipeline/builder';

const pipeline = createPipeline('animation-setup')
  .name('Keyframe Animation Setup')
  .description('Animate all lights in the scene')
  .param('duration')
  .param('startIntensity')
  .param('endIntensity')
  .tag('animation')
  .tag('procedural')

  .loop(l => l.allNodes('light.directional'))
    .as('light')
    .do(s =>
      s.op('keyframe.add', {
        nodeId: '{{light.id}}',
        property: 'intensity',
        time: 0,
        value: '{{startIntensity}}'
      })
        .op('keyframe.add', {
          nodeId: '{{light.id}}',
          property: 'intensity',
          time: '{{duration}}',
          value: '{{endIntensity}}'
        })
    )
    .end()

  .build();
```

---

## Example 4: Scene Optimization

Remove unused and invisible objects.

```typescript
import { createPipeline } from '@/lib/motion/pipeline/builder';

const pipeline = createPipeline('scene-optimization')
  .name('Optimize Scene')
  .description('Remove invisible nodes and clean up')
  .tag('optimization')
  .tag('cleanup')

  .loop(l => l.allNodes())
    .do(s =>
      s.if(c => c.property('{{item.id}}', 'visible', '==', false))
        .then(s2 => s2.op('node.delete', {
          nodeId: '{{item.id}}'
        }))
        .end()
    )
    .end()

  .build();
```

---

## Example 5: Conditional Import

Import assets based on scene requirements.

```typescript
import { createPipeline } from '@/lib/motion/pipeline/builder';

const pipeline = createPipeline('conditional-import')
  .name('Conditional Asset Import')
  .description('Import assets if not already present')
  .param('modelUrl')
  .param('modelId')
  .tag('import')

  .if(c => c.assetExists('{{modelId}}'))
    .then(s => s.op('node.create', {
      nodeId: 'imported-model',
      type: 'model',
      assetId: '{{modelId}}'
    }))
    .else(s =>
      s.op('asset.import', {
        assetId: '{{modelId}}',
        url: '{{modelUrl}}'
      })
        .op('node.create', {
          nodeId: 'imported-model',
          type: 'model',
          assetId: '{{modelId}}'
        })
    )
    .end()

  .build();
```

---

## Example 6: Nested Organization

Organize scene hierarchy automatically.

```typescript
import { createPipeline } from '@/lib/motion/pipeline/builder';

const pipeline = createPipeline('scene-organization')
  .name('Organize Scene Hierarchy')
  .description('Group nodes by type into parent groups')
  .tag('organization')

  // Create groups
  .op('node.create', {
    nodeId: 'lights-group',
    type: 'group',
    name: 'Lights'
  })

  .op('node.create', {
    nodeId: 'models-group',
    type: 'group',
    name: 'Models'
  })

  // Move lights to lights group
  .loop(l => l.allNodes('light.directional'))
    .do(s => s.op('node.reparent', {
      nodeId: '{{item.id}}',
      parentId: 'lights-group'
    }))
    .end()

  // Move meshes to models group
  .loop(l => l.allNodes('mesh'))
    .do(s => s.op('node.reparent', {
      nodeId: '{{item.id}}',
      parentId: 'models-group'
    }))
    .end()

  .build();
```

---

## Example 7: Using DSL

Define pipeline using YAML DSL.

```yaml
id: render-prep
name: Prepare Scene for Rendering
description: Setup scene for optimal rendering
category: rendering
tags: [setup, optimization, rendering]
version: 1.0.0

params:
  - renderQuality
  - lightCount

steps:
  # Setup lighting
  - op: loop
    over:
      type: collection
      items:
        - light-1
        - light-2
        - light-3
    variable: light
    body:
      - op: op
        params:
          op: node.create
          nodeId: '{{light}}'
          type: light.directional
          intensity: '{{renderQuality}}'

  # Optimize scene
  - op: loop
    over:
      type: nodes
    variable: node
    body:
      - op: branch
        condition:
          type: property-value
          nodeId: '{{node.id}}'
          property: lodLevel
          operator: '>'
          value: 2
        then:
          - op: op
            params:
              op: node.delete
              nodeId: '{{node.id}}'
        else: []

  # Final settings
  - op: op
    params:
      op: environment.set-quality
      level: '{{renderQuality}}'
```

---

## Example 8: Agent-Driven Pipeline

Use with Motion Copilot for AI-driven setup.

```typescript
import { pipelineIntegration } from '@/lib/motion/pipeline/integration';
import { generateToolsFromPipelines } from '@/lib/motion/pipeline/tool-factory';

// Get all built-in pipelines
const library = pipelineIntegration.getLibrary();
const allPipelines = library.getAllPipelines();

// Generate tools for agent
const tools = generateToolsFromPipelines(allPipelines);

// Convert to AI SDK format
const aiTools = tools.map(tool => {
  return {
    name: tool.name,
    description: tool.description,
    parameters: {
      type: 'object',
      properties: Object.fromEntries(
        tool.parameters.map(p => [
          p.name,
          {
            type: p.type,
            description: p.description
          }
        ])
      ),
      required: tool.parameters
        .filter(p => p.required)
        .map(p => p.name)
    }
  };
});

// Add to agent system prompt
const systemPrompt = `
You have access to these pipelines:
${allPipelines.map(p => `- ${p.name} (${p.id}): ${p.description}`).join('\n')}

Use these tools to setup Motion scenes.
`;

// When agent calls a tool
async function handlePipelineTool(toolName: string, params: Record<string, any>) {
  const pipelineId = toolName.replace('pipeline_', '');
  const pipeline = library.getPipeline(pipelineId);
  
  if (!pipeline) {
    throw new Error(`Unknown pipeline: ${pipelineId}`);
  }

  const result = await executePipeline(pipeline, currentDocument, params);
  const plan = pipelineToMotionPlan(result, pipeline, currentDocument);

  // Show approval if needed
  if (plan.requiresApproval) {
    const approved = await userApproval(plan);
    if (approved) {
      applyMotionCommand(currentDocument, planMotionCommand(plan));
    }
  } else {
    applyMotionCommand(currentDocument, planMotionCommand(plan));
  }

  return {
    status: result.status,
    opsGenerated: result.ops.length,
    risk: result.risk,
    changes: plan.metadata.pipeline?.changeDescription
  };
}
```

---

## Example 9: Custom Built-in Pipeline

Add custom pipelines to registry.

```typescript
import { pipelineIntegration } from '@/lib/motion/pipeline/integration';

// Create custom pipeline
const myPipeline: MotionPipeline = {
  id: 'my-custom-setup',
  name: 'My Custom Setup',
  description: 'My organization-specific setup',
  category: 'custom',
  tags: ['custom', 'organization'],
  params: ['intensity'],
  steps: [
    {
      op: 'op',
      params: {
        op: 'node.create',
        nodeId: 'custom-light',
        type: 'light.directional',
        intensity: '{{intensity}}'
      }
    }
  ],
  version: '1.0.0',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

// Register with system
pipelineIntegration.registerCustom([myPipeline]);

// Now available through discovery
const discovery = pipelineIntegration.getDiscoveryInterface();
console.log(discovery.pipelines); // Includes myPipeline
```

---

## Example 10: Pipeline Discovery & Filtering

Discover and filter pipelines for UI.

```typescript
import { pipelineIntegration } from '@/lib/motion/pipeline/integration';

// Get discovery data for UI
const discovery = pipelineIntegration.getDiscoveryInterface();

// Group by category
const byCategory = {};
discovery.categories.forEach(cat => {
  byCategory[cat] = discovery.pipelines.filter(p => p.category === cat);
});

// Filter by tags
const lightingPipelines = discovery.pipelines.filter(p =>
  p.tags?.includes('lighting')
);

// Search
const results = pipelineLibrary.searchPipelines('material');

// Get statistics
const stats = pipelineIntegration.getStatistics();
console.log(`Total pipelines: ${stats.pipelines.total}`);
console.log(`Distribution:`, stats.pipelines.byCategory);
```

---

## Running Examples

All examples are production-ready. To use:

```typescript
import { executePipeline } from '@/lib/motion/pipeline/engine';
import { pipelineToMotionPlan } from '@/lib/motion/pipeline/approval';
import { planMotionCommand, applyMotionCommand } from '@/lib/motion';

// 1. Build pipeline
const pipeline = createPipeline('my-pipeline')
  // ... steps ...
  .build();

// 2. Execute
const result = await executePipeline(pipeline, doc, params);

// 3. Create plan
const plan = pipelineToMotionPlan(result, pipeline, doc);

// 4. Get approval if needed
if (plan.requiresApproval) {
  await showApprovalDialog(plan);
}

// 5. Apply
applyMotionCommand(doc, planMotionCommand(plan));
```

