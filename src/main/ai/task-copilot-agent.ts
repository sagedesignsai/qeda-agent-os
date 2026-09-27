/**
 * ai/task-copilot-agent.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The Focus Copilot — a ToolLoopAgent that can actually change the task system.
 *
 * It composes three tool families:
 *   • task verbs            (tools/tasks.ts)          — read, create, schedule,
 *                                                        and (with approval) edit
 *   • context intelligence  (web / workspace / files / RAG) — so a task can be
 *                                                        made concrete and an
 *                                                        estimate grounded in
 *                                                        real material
 *   • research              (webSearch / fetchUrl / libraryDocs)
 *
 * Approval policy: "approve only risky actions". Additive tools (create task,
 * add steps, block time, hand to terminal) execute immediately; anything that
 * rewrites or removes existing work pauses as a `user-approval` request that the
 * UI renders as an Approve/Deny card.
 *
 * The agent is cheap to construct, so it is rebuilt per turn — that is what lets
 * the instructions carry the *current* local date and time, which the model needs
 * to schedule realistically.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { ToolLoopAgent, isStepCount } from 'ai';
import { getSettings } from './settings.js';
import { resolveModel } from './provider.js';
import { taskTools, RISKY_TASK_TOOLS } from '../tools/tasks.js';
import { webTools } from '../tools/web.js';
import { filesystemTools } from '../tools/filesystem.js';
import { workspaceTools } from '../tools/workspace.js';
import { ragTools } from '../tools/rag.js';
import { serviceTools } from '../tools/services.js';
import type { ModelTarget } from './fallback.js';

// ─── Context tools (read-only, least privilege) ───────────────────────────────

const contextTools = {
  // Web research
  webSearch: webTools.webSearch,
  fetchUrl: webTools.fetchUrl,
  // Up-to-date library/API docs
  libraryDocs: serviceTools.libraryDocs,
  // Local knowledge workspace (read-only)
  findPages: workspaceTools.findPages,
  listPages: workspaceTools.listPages,
  getPage: workspaceTools.getPage,
  relatedPages: workspaceTools.relatedPages,
  // Semantic search over indexed documents
  searchDocs: ragTools.searchDocs,
  // Filesystem (read-only)
  readFile: filesystemTools.readFile,
  listDir: filesystemTools.listDir,
};

export const copilotTools = { ...taskTools, ...contextTools };

// ─── Instructions ─────────────────────────────────────────────────────────────

/** Local, human-readable "right now" for the model's scheduling decisions. */
function currentTimeContext(): string {
  const now = new Date();
  const offsetMin = -now.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const hh = String(Math.floor(Math.abs(offsetMin) / 60)).padStart(2, '0');
  const mm = String(Math.abs(offsetMin) % 60).padStart(2, '0');
  return [
    `Current local time: ${now.toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })}`,
    `ISO: ${now.toISOString()}`,
    `UTC offset: ${sign}${hh}:${mm}`,
  ].join('\n');
}

function buildInstructions(activeProject?: string): string {
  // The shared block (ai/project-context.ts) describes the project; the
  // sentence below adds the copilot-specific filing behaviour on top of it.
  const projectNote = activeProject
    ? `
${activeProject}

Default new tasks into the active project (listProjects to get its id) unless they clearly belong elsewhere; still cross-check the whole board when planning a day.`
    : '';
  return `You are the Focus Copilot inside Qeda — a calm, practical productivity partner for someone with ADHD.

${currentTimeContext()}
${projectNote}

## What you are for
You help the user get unstuck and finish things: capture what's in their head, turn vague intentions into concrete next actions, decide what deserves attention now, and protect their time. You are an operator, not a commentator — when the user asks for something, do it with your tools.

## How to work
1. **Ground before you generate.** When a task is vague or an estimate is guesswork, gather context first — webSearch/fetchUrl for the outside world, libraryDocs for APIs and frameworks, findPages/getPage/searchDocs/readFile/listDir for the user's own material. Then write tasks that reference real specifics. Never invent APIs, versions, or facts.
2. **Check before you create.** Call listTasks before creating, so you merge duplicates instead of piling up near-identical cards.
3. **Small and concrete.** Every task title starts with a verb and fits a single sitting. If something is bigger than ~90 minutes, break it with addSteps rather than creating a mega-task.
4. **Break down on request (and when obviously needed).** Use addSteps to put 2–6 steps *inside* a task. The first step should be doable in under two minutes — the goal is to defeat activation friction.
5. **Time block realistically.** Call listBlocks before scheduleBlock so you never double-book. Leave 10–15 minutes of buffer between blocks. If getFocusStats shows a low streak, schedule fewer and easier blocks — do not design a heroic day the user will abandon.
6. **Prioritize by consequence, not volume.** Say out loud which one or two things actually matter today and why.

## Approval
Some tools modify or remove existing work and will pause for the user's approval. When a call is denied, do NOT retry it — accept the decision, adapt, and continue with what remains possible.

## Tone and format
- Warm, brief, and specific. No lecturing, no guilt, no productivity platitudes.
- Short markdown: a sentence of framing, then a tight list. Aim for something readable in ten seconds.
- Celebrate real progress plainly ("that's 90 minutes focused today") without over-praising.
- When you've made a change, say exactly what changed. When you're offering, use a question, not a command.`;
}

// ─── Approval policy ──────────────────────────────────────────────────────────

/**
 * "Approve only risky actions" as a single predicate.
 *
 * Additive tools (create a task, add steps, block time, hand to terminal) run
 * straight through; anything that rewrites or removes existing work pauses as a
 * `user-approval` request. Kept as a plain name predicate so it can be
 * unit-tested without constructing an agent or calling a model.
 */
export function isRiskyCopilotTool(toolName: string): boolean {
  return RISKY_TASK_TOOLS.has(toolName);
}

// ─── Agent factory ────────────────────────────────────────────────────────────

/**
 * Build a fresh copilot agent. Rebuilt per turn so the instructions always carry
 * the current local time.
 */
export function createTaskCopilotAgent(opts?: {
  activeProject?: string;
  target?: ModelTarget;
}) {
  const settings = getSettings();
  const providerId = opts?.target?.providerId ?? settings.activeProvider;
  const modelId = opts?.target?.modelId ?? settings.activeModel;
  const model = resolveModel(providerId, modelId);

  return new ToolLoopAgent({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    model: model as any,
    instructions: buildInstructions(opts?.activeProject),
    tools: copilotTools,
    toolApproval: ({ toolCall }) =>
      !toolCall.dynamic && isRiskyCopilotTool(toolCall.toolName)
        ? 'user-approval'
        : undefined,
    stopWhen: isStepCount(25),
  });
}
