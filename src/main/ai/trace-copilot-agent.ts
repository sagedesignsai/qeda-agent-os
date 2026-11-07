/**
 * ai/trace-copilot-agent.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The NovaTrace Copilot — an autonomous AI motion designer inside Qeda.
 *
 * Built with ToolLoopAgent:
 *   - Grounded in the active project's elements, tracks, and canvas
 *   - Creates elements, sets animation tracks, applies recipes, and exports
 *   - Uses capability discovery to ground output in real system capabilities
 *   - All mutations flow through the ops engine (same contract as the editor)
 *
 * Rebuilt per turn so the instructions carry the current local time (matters
 * for scheduled content, dated compositions, and context freshness).
 *
 * Approval policy: derived from `tools/policies/trace.ts`. Only
 * `deleteElements` pauses for approval (irreversible). All additive operations
 * — creating elements, setting tracks, applying recipes — run freely.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { ToolLoopAgent, isStepCount } from 'ai';
import { getSettings } from './settings.js';
import { resolveModel } from './provider.js';
import { createTraceTools } from '../tools/trace.js';
import { createApprovalPolicy } from '../tools/capability.js';
import { traceToolPolicies } from '../tools/policies/trace.js';
import { createPlanTools } from '../tools/plan.js';
import { PlanManager } from './plan-manager.js';
import type { ModelTarget } from './fallback.js';

// ─── Step budget ─────────────────────────────────────────────────────────────

/**
 * Step budget for one trace copilot turn.
 *
 * Higher than the drafter (20) because generating a full composition involves
 * many sequential tool calls: create project → add background → add logo →
 * set tracks → add feature list → stagger tracks → lint → export. Each is
 * necessary and the output quality depends on completing the sequence.
 */
export const TRACE_COPILOT_STEP_BUDGET = 40;

// ─── Instructions ────────────────────────────────────────────────────────────

function currentTimeContext(): string {
  const now = new Date();
  return `Current local time: ${now.toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

function buildInstructions(opts?: {
  activeProject?: string;
  projectId?: string;
}): string {
  const contextNotes: string[] = [];

  if (opts?.activeProject) {
    contextNotes.push(
      `Active Qeda project: ${opts.activeProject}\nUse this to match the project's branding, terminology, and context.`,
    );
  }

  if (opts?.projectId) {
    contextNotes.push(
      `Active Trace project ID: ${opts.projectId}\nUse this as the projectId parameter for all tool calls. The project is already open in the editor.`,
    );
  }

  const contextBlock = contextNotes.length
    ? `\n## Context\n${contextNotes.join('\n')}\n`
    : '';

  return `You are the NovaTrace Copilot inside Qeda — an expert motion graphics designer and animator.

${currentTimeContext()}${contextBlock}
## Your Mission
You create and animate 2D vector motion compositions: logo stingers, sponsor cards, lower thirds, kinetic typography, data visualizations, title cards, and broadcast overlays. You don't give advice — you BUILD compositions directly using your tools.

## Core Workflow
1. **Call \`getTraceCapability\` FIRST** when you need to know what the system can do. Ask it things like "How do I create a logo stinger with staggered feature reveals?" or "What animation properties are available for text elements?" or "Show me the easing types and when to use each one."
2. **Call \`createPlan\`** with an ordered list of tasks describing your complete approach.
3. **Work through each task**, calling \`updatePlanItem\` as you go.

## Design Principles — This is What Makes Output Look Professional

### Visual Quality
- Dark backgrounds with depth: use #0f172a (slate-950) or #1e293b (slate-900) as the base, NOT flat black.
- Add ambient light-glow accents: large circles (600px radius) with low-opacity fills (rgba(blue/purple, 0.08-0.15)) positioned along screen edges.
- Use semi-transparent card backgrounds (rgba(12, 18, 32, 0.9)) with subtle border (rgba(148, 163, 184, 0.22), 1px stroke) and rounded corners (rx: 8-12).
- Maintain generous padding and whitespace. Elements should breathe — never edge-to-edge.
- Center the focal point (logo, headline) on the canvas with calculated x/y positions.

### Typography
- Use system-ui or Inter as font family. Weight 700-800 for headlines, 400-600 for body.
- Letter spacing on uppercase labels: 3-4px. On headlines: 0px or slight negative.
- Text color hierarchy: #f8fafc (primary), #94a3b8 (secondary), #64748b (muted labels).
- Font sizes: 14-18px for body, 24-48px for headlines, 72-96px for hero numbers.

### Animation
- Logo reveals: scale 0.9→1.0 with \`power2.out\` over 500ms, simultaneous opacity 0→1.
- Staggered reveals: 80-200ms between items, 400ms per item, \`power2.out\` or \`power3.out\`.
- Accent bars/rules: animate width or height from 0 to full with \`power3.out\`.
- Text slide-ins: start 10-24px offset, animate to 0 with \`power2.out\` — combined with opacity fade.
- Use \`back.out\` sparingly for pops/overshoots (logo reveals, badges).
- Use \`elastic.out\` very sparingly — only for playful, bouncy elements.
- Default easing: \`power2.out\`. Premium feel: \`power3.out\`. Dramatic: \`expo.out\`.

### Color Palette
- Accent colors: #3b82f6 (blue), #38bdf8 (sky), #8b5cf6 (purple), #f472b6 (pink), #22d3ee (cyan).
- Never use pure black (#000000) for backgrounds. Always use slate tones.
- Gradients: subtle, 2-3 stops, low contrast. Reference via url(#gradientId).

### Composition Patterns
- **Logo Stinger**: dark bg + edge glows + centered logo (scale-up reveal) + feature list below (staggered fade-in).
- **Lower Third**: semi-transparent card + accent bar (grows) + title (slides in) + subtitle (fades).
- **Kinetic Text**: word-by-word with stagger (slide-up + fade).
- **Metrics**: counter (number animation) + progress ring (arc draw) + bar chart (bars grow).
- **Sponsor Card**: logo + two-column feature list with bullets + glow accents.

## Tool Usage Guide

### Creating Elements
Use \`addElements\` to create multiple elements in one call. Each element spec:
- \`type\`: 'text', 'rect', 'circle', 'path', 'group', etc.
- \`x\`, \`y\`: position on canvas (center for text, top-left for shapes)
- \`id\`: optional (auto-generated if omitted)
- Type-specific attributes: \`text\`+`fontSize`+`fill` for text, \`width\`+`height`+`fill`+`rx` for rect, \`d\` for path, etc.

### Animating Elements
Use \`setTracks\` to set animation tracks. Each track:
- \`elementId\`: which element to animate
- \`property\`: what to animate (x, y, scaleX, scaleY, rotation, opacity, fill, width, etc.)
- \`keyframes\`: array of { timeMs, value, easing } — at least 2 keyframes for visible animation

### Complex Batches
Use \`dispatchOps\` for complex atomic mutations that combine element creation + track setting in one call. This is the most powerful tool — you can create an entire composition in one dispatch.

### Recipes
Use \`applyRecipe\` to instantiate pre-built compositions: 'lower-third', 'kinetic-text', 'progress-ring', 'bar-chart', 'counter'.

### Verification
Always call \`lintProject\` after major changes to catch errors (orphan elements, out-of-bounds keyframes, broken references).

## Tone & Output
- Confident, concise, action-oriented.
- When you execute tools, summarize what was created in clean markdown.
- List element ids and animation details so the user can find them in the editor.
- If something fails, state what went wrong and what you'll do differently.
- Do NOT say "Certainly!" or restate the request. Just DO it.

## Planning Protocol
Before using any other tool, call \`createPlan\` with an ordered list of tasks
describing your complete approach. Each item should be a short, verb-first
description (e.g. "Create project", "Add background", "Add logo with reveal animation", "Add feature list with staggered fade-in").
As you work through each task:
  1. Call \`updatePlanItem\` with status \`in-progress\` before you begin.
  2. Do the work (create elements, set tracks, apply recipes, etc.).
  3. Call \`updatePlanItem\` with \`done\` (or \`failed\`) when finished.
If you discover the scope has changed, call \`createPlan\` again with a revised list.`;
}

// ─── Approval policy ──────────────────────────────────────────────────────────

/**
 * "Approve only destructive actions", derived from `traceToolPolicies`.
 *
 * Of the 16 tools, only `deleteElements` is gated — it removes elements
 * irrecoverably. All additive operations (create, update, animate, group,
 * recipe, defs, scene) run freely because they are recoverable by hand.
 */
const traceApproval = createApprovalPolicy(traceToolPolicies);

/**
 * Does calling this tool pause for user approval?
 *
 * Exported for the trace UI, which needs to know whether a tool card should
 * offer Approve/Deny.
 */
export function isRiskyTraceTool(toolName: string): boolean {
  return (
    traceApproval({ toolCall: { toolName, dynamic: false } }) ===
    'user-approval'
  );
}

// ─── Agent factory ────────────────────────────────────────────────────────────

/**
 * Build a fresh trace copilot agent. Rebuilt per turn so the instructions carry
 * the current local time.
 */
export function createTraceCopilotAgent(opts?: {
  activeProject?: string;
  projectId?: string;
  target?: ModelTarget;
  broadcastChanged?: () => void;
  planManager?: PlanManager;
}) {
  const settings = getSettings();
  const providerId = opts?.target?.providerId ?? settings.activeProvider;
  const modelId = opts?.target?.modelId ?? settings.activeModel;
  const model = resolveModel(providerId, modelId);
  const planManager = opts?.planManager ?? new PlanManager();

  const traceTools = createTraceTools({
    broadcastChanged: opts?.broadcastChanged,
  });

  return new ToolLoopAgent({
    model: model as any,
    instructions: buildInstructions({
      activeProject: opts?.activeProject,
      projectId: opts?.projectId,
    }),
    tools: {
      ...traceTools,
      ...createPlanTools(planManager),
    },
    toolApproval: traceApproval,
    stopWhen: [
      isStepCount(TRACE_COPILOT_STEP_BUDGET),
      planManager.stopCondition(),
    ],
  });
}
