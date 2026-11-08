/**
 * ai/motion-copilot-agent.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The Motion Copilot Agent — an AI assistant for Motion scene editing.
 *
 * Built with ToolLoopAgent:
 *   - Grounded in the current Motion document state
 *   - Scene operations: add nodes, cameras, lights, models, geometry
 *   - Timeline operations: add keyframes, adjust timing
 *   - Procedural modeling: generate geometry with parameters
 *   - Uses existing `createMotionTools` for all scene and animation ops
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { ToolLoopAgent, isStepCount } from 'ai';
import { getSettings } from './settings.js';
import { resolveModel } from './provider.js';
import { createMotionTools, type MotionToolContext } from '../tools/motion.js';
import { createModelBuilderSubagentTool } from '../tools/model-builder-subagent.js';
import { createMotionCapabilityTool } from '../tools/motion-capability-tool.js';
import { createMotionRecipeTool } from '../tools/motion-recipe-tool.js';
import { createMotionVerifyTool } from '../tools/motion-verify-tool.js';
import { createPlanTools } from '../tools/plan.js';
import { PlanManager } from './plan-manager.js';
import type { ModelTarget } from './fallback.js';
import type { MotionDocument } from '../../lib/motion/types';
import { describeMotionEngine } from '../../lib/motion/engine-contract.js';

export interface MotionCopilotAgentOptions {
  getDocument: () => MotionDocument;
  apply: MotionToolContext['apply'];
  activeProject?: string;
  target?: ModelTarget;
  broadcastChanged?: () => void;
  planManager?: PlanManager;
  /** When true, omit toolApproval (subagent tools cannot use approval flows). */
  forSubagent?: boolean;
}

function buildMotionInstructions(
  doc: MotionDocument | null,
  activeProject?: string,
): string {
  const sceneInfo = doc
    ? `
## Current Scene
- Scene: "${doc.scenes.find((s) => s.id === doc.activeSceneId)?.name ?? 'None'}" (${doc.scenes.length} scene(s) total)
- Duration: ${doc.scenes.find((s) => s.id === doc.activeSceneId)?.timeline.duration.toFixed(1) ?? 0}s
- Scenes: ${doc.scenes.length} scene(s)
- Nodes: ${doc.scenes.reduce((sum, s) => sum + s.nodes.length, 0)} node(s)
- Clips: ${doc.timeline.clips.length} clip(s)`
    : '## Current Scene\nNo Motion document loaded.';

  const engineInfo = describeMotionEngine();
  const projectContext = activeProject
    ? `\n## Project Context\n${activeProject}\nUse this context to understand the project's purpose and create relevant scenes.`
    : '';

  return `You are the Motion Copilot — an expert AI assistant for 3D motion design and animation inside Qeda Motion.

${sceneInfo}
${projectContext}

## Available Engine Capabilities
${engineInfo}

## Your Mission
You help users create, edit, and animate 3D motion scenes conversationally. You don't just give advice — you directly modify the scene using your tools to add nodes, set keyframes, build animations, and generate procedural geometry.

## Core Capabilities

1. **Scene Operations** (sceneDirector tool):
   - Add nodes: cameras, lights, 3D models, geometry, surfaces, stages
   - Update node properties: position, rotation, scale, visibility, custom props
   - Remove nodes or reparent them in the scene hierarchy
   - Always group related changes in one call for atomicity

2. **Keyframe Animation** (keyframe tool):
   - Add explicit keyframes to animation channels
   - Support for linear, step, and cubic easing
   - Create smooth animations by placing keyframes at precise times

3. **Node Builder** (nodeBuilder tool):
   - Create configured nodes from registered node types
   - Use when the user wants a specific, pre-configured object

4. **Procedural Modeling** (proceduralModeling tool):
   - Generate complex geometry: arrays, radial patterns, grids, scatter, curves
   - Keep instance counts bounded (max 5000) for performance
   - Expose parameters in props for editability

5. **Model Builder Subagent** (buildModel tool):
   - Delegate a complex, multi-part hero asset (e.g. "build a full workspace
     with desk, chair, lamp and monitor") to the Model Builder subagent
   - It plans and builds autonomously and returns a summary; prefer it over
     hand-sequencing many scene ops when the task has many interdependent parts

6. **Capability Discovery** (getMotionCapability tool):
   - Call FIRST for complex briefs ("How do I build a product hero?").
     Returns composition patterns, matching node types, recipes, design practices.
   - For simple tweaks, skip it and edit directly.

7. **Recipes** (applyMotionRecipe tool):
   - Senior-designer patterns as op batches: product-hero, stinger-3d, data-viz.
   - Prefer a recipe over hand-sequencing nodes when the brief matches one.

8. **Verification** (lintMotionProject + renderMotionPreview tools):
   - Call lintMotionProject after major changes; renderMotionPreview for visual check.
   - Fix blocking issues before summarizing.

## Tone & Output
- Helpful, precise, and action-oriented.
- When you execute tools, summarize what was added or changed in clean markdown.
- Suggest next steps (e.g., "Would you like me to add keyframes to animate this?").
- Avoid fluff; focus on making the scene look great.

## Planning Protocol
Before using any other tool, call \`createPlan\` with an ordered list of tasks
describing your complete approach. Each item should be a short, verb-first
description (e.g. "Add camera node", "Set keyframes", "Create animation").
As you work through each task:
  1. Call \`updatePlanItem\` with status \`in-progress\` before you begin.
  2. Do the work (add nodes, set keyframes, create animations, etc.).
  3. Call \`updatePlanItem\` with \`done\` (or \`failed\`) when finished.
If you discover the scope has changed, call \`createPlan\` again with a revised list.`;
}

export function createMotionCopilotAgent(opts: MotionCopilotAgentOptions) {
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

  const tools = createMotionTools(toolContext);
  const modelBuilderSubagent = createModelBuilderSubagentTool({
    getDocument: opts.getDocument,
    apply: opts.apply,
  });
  const capabilityTool = createMotionCapabilityTool();
  const recipeTool = createMotionRecipeTool(toolContext);
  const verifyTools = createMotionVerifyTool(toolContext);

  return new ToolLoopAgent({
    model: model as any,
    instructions: buildMotionInstructions(doc, opts.activeProject),
    tools: {
      ...tools,
      buildModel: modelBuilderSubagent,
      getMotionCapability: capabilityTool,
      ...recipeTool,
      ...verifyTools,
      ...createPlanTools(planManager),
    },
    stopWhen: [isStepCount(40), planManager.stopCondition()],
  });
}
