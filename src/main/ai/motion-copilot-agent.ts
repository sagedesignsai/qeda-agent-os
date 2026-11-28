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
  /** Real project id for staging generated GLBs into the project bundle. */
  projectId?: string;
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

  const engine = describeMotionEngine();
  const categories = [...new Set(engine.nodes.map((node) => node.category))].join(', ');
  const engineInfo = [
    `${engine.nodes.length} node types across ${categories}`,
    `${engine.operations.length} operations`,
    `${engine.recipes.length} recipes`,
  ].join(' · ');
  const projectContext = activeProject
    ? `\n## Project Context\n${activeProject}\nUse this context to understand the project's purpose and create relevant scenes.`
    : '';

  return `You are the Motion Copilot — an expert AI assistant for 3D motion design and animation inside Qeda Motion.

${sceneInfo}
${projectContext}

## Contract — Normative
\`getMotionCapability\` returns the grounded capability guidance AND the binding copilot contract (\`docs/motion-2/copilot-contract.md\`). The contract wins where it disagrees with anything below: op-only mutations, seconds-not-frames, key lighting for 3D scenes, bounded procedural counts, clip re-use, explicit cameras/lights, render explicitness, and "done means". Load it before any new scene or multi-node change.

## Available Engine Capabilities
${engineInfo}

The full node/op manifest is intentionally not in this prompt. Call
\`getMotionCapability\` before building a new scene or a multi-node change; it
returns the live manifest, grounded patterns, recipes and the binding copilot
contract.

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
   - Call FIRST for complex briefs and any new scene. Returns composition
     patterns, matching node types, recipes, design practices, and the binding
     copilot contract.
   - For simple single-node tweaks, skip it and edit directly.

7. **Recipes** (applyMotionRecipe tool):
   - Senior-designer patterns as op batches: product-hero, stinger-3d, data-viz.
   - Prefer a recipe over hand-sequencing nodes when the brief matches one.

8. **Verification** (lintMotionProject tool):
   - Call lintMotionProject after major changes.
   - renderMotionPreview is unavailable in this build and never renders the
     document; do not claim visual verification from it.
   - Fix blocking issues before summarizing.

9. **Baked 3D motion** (motion.motion.bake):
   - When the user supplies sampled Blender camera/object curves, bake them with
     this tool instead of hand-writing hundreds of keyframes. Positions are
     converted from Blender's Z-up axes; rotations are Three axes.
   - The import extends the scene duration when needed and adds an editable
     track, so it can be retimed or removed like any other animation.

## Tone & Output
- Helpful, precise, and action-oriented.
- When you execute tools, summarize what was added or changed in clean markdown.
- Suggest next steps (e.g., "Would you like me to add keyframes to animate this?").
- Avoid fluff; focus on making the scene look great.
- **Completion contract:** never end a turn with a vague success. If the deliverable does not exist, state the exact blocker and what you need. If you could not check something (motion feel, timing rhythm, lighting taste, audio), say plainly that it was not checked.
- **Render explicitness:** call \`lintMotionProject\` after changes. A visual
  preview renderer is not available in this build: do not call
  \`renderMotionPreview\` and claim the frame looked right. If the user asked for
  something only visual inspection can confirm, say it was not visually checked.
  Only export video when the user explicitly asks; it is the most expensive
  operation in the product.
- **User edits win:** the renderer sends a document snapshot per turn. If saving back reports a conflict, the user's editor copy was kept. Tell the user and ask them to re-run — never retry blindly.

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
    projectId: opts.projectId,
  };

  const tools = createMotionTools(toolContext);
  const modelBuilderSubagent = createModelBuilderSubagentTool({
    getDocument: opts.getDocument,
    apply: opts.apply,
    projectId: opts.projectId,
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
