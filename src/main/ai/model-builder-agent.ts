/**
 * ai/model-builder-agent.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The Model Builder Agent — an AI assistant for 3D model creation.
 *
 * Built with ToolLoopAgent:
 *   - Grounded in an ephemeral Motion document
 *   - Scene operations: add nodes, geometry, materials, lighting
 *   - Procedural modeling: generate geometry with parameters
 *   - No timeline/keyframe focus — pure geometry and scene composition
 *   - Reuses `createMotionTools` for all scene ops (excludes keyframe tool)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { ToolLoopAgent, isStepCount } from 'ai';
import { getSettings } from './settings.js';
import { resolveModel } from './provider.js';
import { createMotionTools, type MotionToolContext } from '../tools/motion.js';
import { createBlenderTools } from '../tools/blender.js';
import { createBlenderSpecialistTool } from './blender-specialist-agent.js';
import { createMotionCapabilityTool } from '../tools/motion-capability-tool.js';
import { createPlanTools } from '../tools/plan.js';
import { PlanManager } from './plan-manager.js';
import type { ModelTarget } from './fallback.js';
import type { MotionDocument } from '../../lib/motion/types';
import { describeMotionEngine } from '../../lib/motion/engine-contract.js';

export interface ModelBuilderAgentOptions {
  getDocument: () => MotionDocument;
  apply: MotionToolContext['apply'];
  target?: ModelTarget;
  planManager?: PlanManager;
}

function buildModelBuilderInstructions(doc: MotionDocument): string {
  const scene = doc.scenes.find((s) => s.id === doc.activeSceneId);
  const nodeCount = doc.scenes.reduce((sum, s) => sum + s.nodes.length, 0);

  const sceneInfo = doc
    ? `
## Current Scene
- Scene: "${scene?.name ?? 'None'}" (${doc.scenes.length} scene(s) total)
- Nodes: ${nodeCount} node(s)
- Output: ${doc.meta.output.width}x${doc.meta.output.height} at ${doc.meta.output.fps}fps`
    : '## Current Scene\nNo document loaded.';

  const engineInfo = describeMotionEngine();

  return `You are the Model Builder — an expert AI assistant for creating 3D models and scenes inside Qeda Motion.

${sceneInfo}

## Available Engine Capabilities
${engineInfo}

## Your Mission
You help users create 3D models from natural language descriptions. You don't just give advice — you directly build the scene using your tools to add geometry, materials, lighting, and composition.

## Core Capabilities

1. **Scene Operations** (motion.scene.director tool):
   - Add nodes: geometry primitives, 3D models, lights, cameras, surfaces, stages
   - Update node properties: position, rotation, scale, visibility, custom props
   - Remove nodes or reparent them in the scene hierarchy
   - Always group related changes in one call for atomicity

2. **Node Builder** (motion.node.builder tool):
   - Create configured nodes from registered node types
   - Use when the user wants a specific, pre-configured object

3. **Procedural Modeling** (motion.procedural.model tool):
   - Generate complex geometry: arrays, radial patterns, grids, scatter, curves
   - Keep instance counts bounded (max 5000) for performance
   - Expose parameters in props for editability

0. **Capability Discovery** (getMotionCapability tool):
   - Call FIRST for complex briefs. Returns patterns, node types, recipes, design practices.

4. **Blender Asset Generation** (blender.asset.generate tool, when available):
   - Generates a bespoke GLB with headless Blender and places it as model.gltf
   - Use for bespoke geometry/materials primitives cannot express; prefer it when Blender is enabled and the brief is a single hero asset
   - Never write raw Blender Python — this templated tool is the only Blender entry point
   - For complex briefs that may need retries, use blenderSpecialist.buildAsset
     (nested subagent that iterates generate→validate) instead

## Model Building Guidelines
- Start with the base geometry, then add details progressively
- Use appropriate lighting to showcase the model
- Position the camera for a good default view
- Group related nodes logically in the hierarchy
- Use meaningful node names for clarity
- Suggest iterative improvements ("Would you like me to add texture details?")

## Tone & Output
- Helpful, precise, and action-oriented.
- When you execute tools, summarize what was added or changed in clean markdown.
- Suggest next steps for refinement.
- Avoid fluff; focus on building a great 3D model.

## Planning Protocol
Before using any other tool, call \`createPlan\` with an ordered list of tasks
describing your complete approach. Each item should be a short, verb-first
description (e.g. "Add base geometry", "Apply materials", "Set up lighting").
As you work through each task:
  1. Call \`updatePlanItem\` with status \`in-progress\` before you begin.
  2. Do the work (add nodes, configure materials, set up lights, etc.).
  3. Call \`updatePlanItem\` with \`done\` (or \`failed\`) when finished.
If you discover the scope has changed, call \`createPlan\` again with a revised list.`;
}

export function createModelBuilderAgent(opts: ModelBuilderAgentOptions) {
  const settings = getSettings();
  const providerId = opts.target?.providerId ?? settings.activeProvider;
  const modelId = opts.target?.modelId ?? settings.activeModel;
  const model = resolveModel(providerId, modelId);

  const doc = opts.getDocument();
  const planManager = opts.planManager ?? new PlanManager();

  const toolContext: MotionToolContext = {
    getDocument: opts.getDocument,
    apply: opts.apply,
  };

  const motionTools = createMotionTools(toolContext);
  // Static-geometry surface: keyframes are out of scope for the Model Builder.
  const { 'motion.scene.keyframe': _keyframe, ...sceneTools } = motionTools;
  void _keyframe;
  const blenderTools = createBlenderTools(toolContext);
  const blenderSpecialist = createBlenderSpecialistTool({
    target: opts.target,
  });
  const capabilityTool = createMotionCapabilityTool();

  return new ToolLoopAgent({
    model: model as any,
    instructions: buildModelBuilderInstructions(doc),
    tools: {
      getMotionCapability: capabilityTool,
      ...sceneTools,
      ...blenderTools,
      'blenderSpecialist.buildAsset': blenderSpecialist,
      ...createPlanTools(planManager),
    },
    stopWhen: [isStepCount(25), planManager.stopCondition()],
  });
}
