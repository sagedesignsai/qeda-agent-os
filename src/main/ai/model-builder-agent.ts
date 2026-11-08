/**
 * ai/model-builder-agent.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The Model Builder Agent — an AI assistant for 3D model creation.
 *
 * Built with ToolLoopAgent:
 *   - Grounded in an ephemeral Motion document
 *   - Blender-first: bespoke assets are generated with headless Blender and
 *     fall back to procedural modeling only when Blender is unavailable,
 *     disabled, or the job fails
 *   - Procedural modeling: generate geometry with parameters
 *   - Optional MCP tools (e.g. MCP-for-Blender live session) are merged in
 *     from the configured `mcpServers`; first-party tools win name collisions
 *   - No timeline/keyframe focus — pure geometry and scene composition
 *   - Reuses `createMotionTools` for all scene ops (excludes keyframe tool)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { ToolLoopAgent, isStepCount, type Tool } from 'ai';
import { getSettings } from './settings.js';
import { resolveModel } from './provider.js';
import { createMotionTools, type MotionToolContext } from '../tools/motion.js';
import { createBlenderTools } from '../tools/blender.js';
import { createBlenderSpecialistTool } from './blender-specialist-agent.js';
import { createMotionCapabilityTool } from '../tools/motion-capability-tool.js';
import { createPlanTools } from '../tools/plan.js';
import { PlanManager } from './plan-manager.js';
import { mcpManager } from './mcp/manager.js';
import type { ModelTarget } from './fallback.js';
import type { MotionDocument } from '../../lib/motion/types';
import { describeMotionEngine } from '../../lib/motion/engine-contract.js';

export interface ModelBuilderAgentOptions {
  getDocument: () => MotionDocument;
  apply: MotionToolContext['apply'];
  target?: ModelTarget;
  planManager?: PlanManager;
  /** Real project id for staging generated GLBs into the project bundle. */
  projectId?: string;
}

function buildModelBuilderInstructions(
  doc: MotionDocument,
  mcpToolSummary?: string,
): string {
  const scene = doc.scenes.find((s) => s.id === doc.activeSceneId);
  const nodeCount = doc.scenes.reduce((sum, s) => sum + s.nodes.length, 0);

  const blenderAvailable = getSettings().blender?.enabled !== false;
  const blenderStatus = blenderAvailable
    ? 'available (headless Blender, templated jobs)'
    : 'disabled in Settings — go straight to procedural fallback';

  const sceneInfo = doc
    ? `
## Current Scene
- Scene: "${scene?.name ?? 'None'}" (${doc.scenes.length} scene(s) total)
- Nodes: ${nodeCount} node(s)
- Output: ${doc.meta.output.width}x${doc.meta.output.height} at ${doc.meta.output.fps}fps
- Blender: ${blenderStatus}`
    : `## Current Scene
No document loaded.
- Blender: ${blenderStatus}`;

  const engineInfo = describeMotionEngine();

  return `You are the Model Builder — an expert AI assistant for creating 3D models and scenes inside Qeda Motion.

${sceneInfo}

## Available Engine Capabilities
${engineInfo}

## Your Mission
You help users create 3D models from natural language descriptions. You don't just give advice — you directly build the scene using your tools. Blender is your primary modeling engine. Procedural nodes and primitives are a last-resort fallback.

## Modeling Strategy — Blender First, Procedural as Last Resort

1. **Blender Asset Generation — FIRST CHOICE for every real model/asset**:
   - \`blender.asset.generate\` is the default entry point: it generates and validates a GLB with headless Blender AND places it as \`model.gltf\` automatically.
   - For complex briefs likely to need retries, delegate once to \`blenderSpecialist.buildAsset\` (a subagent that iterates generate→validate), then place the returned file yourself with \`blender.asset.import\` (it stages the GLB into the project bundle and places it as \`model.gltf\`).
   - Call it EARLY — right after capability discovery/plan creation, before adding any other geometry.
   - Author a \`part\` (mesh-building bpy code using the \`mat\`/\`link\`/\`primitive\` helpers) that matches the brief: correct part count, proportions, landmarks, materials.
   - On failure, the tool returns the PART's own exception and a validation report (triangle counts per part, part inventory). Debug the CODE and refine the part — do not merely retry with a new seed. At most 3 authored attempts before considering the fallback ladder.
   - Never write raw Blender Python outside the \`part\` parameter — scene setup, grounding, export, and preview are harness-owned.

2. **Scene Staging** (motion.scene.director tool):
   - Lights, cameras, ground/stage, transforms, visibility, hierarchy, reparenting, node removal.
   - These are composition, not modeling — use them freely to arrange and present what Blender produced.
   - Never use primitive nodes to approximate bespoke geometry Blender could produce.

3. **Procedural Modeling — FALLBACK ONLY** (motion.procedural.model tool, and motion.node.builder for registered node types):
   - Reach for procedural nodes and config-driven node geometry only when:
     a. Blender is unavailable or disabled in Settings, or
     b. Blender jobs keep failing after the one retry, or
     c. The brief is dominated by repeated elements (large arrays, grids, scatter fields) — many near-identical Blender jobs would be wasteful there.
   - Keep instance counts bounded (max 5000) for performance; expose parameters in props so the result remains editable.

0. **Capability Discovery** (getMotionCapability tool):
   - Call FIRST for complex briefs. Returns patterns, node types, recipes, design practices.${
     mcpToolSummary
       ? `

## Live Blender MCP Tools (advanced, optional)
Configured MCP servers expose these live-Blender tool namespaces:
${mcpToolSummary}
- These tools drive a live Blender session (host/port configured in Settings → Builder & MCP) — use them for operations the templated headless pipeline cannot express: interactive scripting, live scene inspection, or screenshots to verify your work.
- They CANNOT touch the Motion document. When you produce geometry through MCP:
  1. export it from the live session as GLB (e.g. \`bpy.ops.export_scene.gltf\` via the MCP scripting tool, to an absolute workspace path), then
  2. place it in the scene with \`blender.asset.import\` (takes the exported file path).
- Keep MCP usage scoped: heavy per-vertex sculpting belongs in the MCP session; everything that lands in the document still goes through \`blender.asset.import\` or \`motion.scene.director\`.`
       : ''
   }

## Model Building Guidelines
- Generate the hero asset with Blender FIRST, then light and compose around it
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
describing your complete approach. Model geometry tasks come FIRST and are
expressed in Blender terms (e.g. "Generate hero chair with Blender", "Retry
Blender asset with new seed", "Stage lighting and camera"). Only include a
procedural task when Blender is unavailable or as an explicit contingency
item (e.g. "If Blender fails, model procedurally").
As you work through each task:
  1. Call \`updatePlanItem\` with status \`in-progress\` before you begin.
  2. Do the work (generate the asset, stage lights, arrange the scene, etc.).
  3. Call \`updatePlanItem\` with \`done\` (or \`failed\`) when finished.
If you discover the scope has changed, call \`createPlan\` again with a revised list.`;
}

/**
 * Load enabled MCP server tools (e.g. MCP-for-Blender) for the agent.
 * Failures are isolated inside the manager; a connect failure just means
 * the MCP section is omitted and the agent falls back to its own tools.
 */
async function loadMcpTools(): Promise<{
  tools: Record<string, Tool>;
  toolSummary?: string;
}> {
  try {
    const { tools, summaries } = await mcpManager.loadToolsForEnabledServers();
    const toolSummary = summaries
      .map(
        (server) =>
          `- ${server.serverName}: ${server.tools.map((t) => t.name).join(', ') || 'no tools'}`,
      )
      .join('\n');
    return { tools, toolSummary: toolSummary || undefined };
  } catch (error) {
    console.warn(
      '[model-builder] MCP tool loading failed:',
      error instanceof Error ? error.message : String(error),
    );
    return { tools: {} };
  }
}

export async function createModelBuilderAgent(opts: ModelBuilderAgentOptions) {
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

  const motionTools = createMotionTools(toolContext);
  // Static-geometry surface: keyframes are out of scope for the Model Builder.
  const { 'motion.scene.keyframe': _keyframe, ...sceneTools } = motionTools;
  void _keyframe;
  const blenderTools = createBlenderTools(toolContext);
  const blenderSpecialist = createBlenderSpecialistTool({
    target: opts.target,
  });
  const capabilityTool = createMotionCapabilityTool();

  const { tools: mcpTools, toolSummary: mcpToolSummary } = await loadMcpTools();

  return new ToolLoopAgent({
    model: model as any,
    instructions: buildModelBuilderInstructions(doc, mcpToolSummary),
    tools: {
      // MCP tools first: our first-party tools below win on any name
      // collision, while MCP tools additionally stay reachable under their
      // namespaced `mcp_<server>_<tool>` keys.
      ...mcpTools,
      getMotionCapability: capabilityTool,
      ...sceneTools,
      ...blenderTools,
      'blenderSpecialist.buildAsset': blenderSpecialist,
      ...createPlanTools(planManager),
    },
    stopWhen: [isStepCount(25), planManager.stopCondition()],
  });
}
