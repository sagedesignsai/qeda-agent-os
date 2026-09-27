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
import { taskTools } from '../tools/tasks.js';
import { webTools } from '../tools/web.js';
import { filesystemTools } from '../tools/filesystem.js';
import { workspaceTools } from '../tools/workspace.js';
import { ragTools } from '../tools/rag.js';
import { serviceTools } from '../tools/services.js';
import { repoTools } from '../tools/repo.js';
import { indexPageTool } from '../tools/workspace-rag.js';
import { createApprovalPolicy } from '../tools/capability.js';
import { copilotToolPolicies } from '../tools/policies/copilot.js';
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
  listIndexed: ragTools.listIndexed,
  // ── Indexing (approval-gated: `cost` capability) ─────────────────────────
  // The copilot could always SEARCH the index but never add to it, so grounding
  // a new task in a file the user just mentioned needed a manual round-trip
  // through the Workspace UI. These two are classed `cost` in
  // tools/policies/copilot.ts, so every call pauses for approval — embedding
  // calls are billable and mutate a store shared with the chat agent.
  indexFile: ragTools.indexFile,
  indexPage: indexPageTool,
  // Filesystem (read-only)
  readFile: filesystemTools.readFile,
  listDir: filesystemTools.listDir,
  // ── Repository awareness (read-only, no shell) ───────────────────────────
  // Orientation without mutation. The copilot reaches the shell through
  // handToTerminal, where the user approves each command; these only look.
  gitStatus: repoTools.gitStatus,
  gitLog: repoTools.gitLog,
  gitDiffStat: repoTools.gitDiffStat,
  grepSearch: repoTools.grepSearch,
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
1. **Ground before you generate.** When a task is vague or an estimate is guesswork, gather context first — webSearch/fetchUrl for the outside world, libraryDocs for APIs and frameworks, findPages/getPage/searchDocs/readFile/listDir for the user's own material. For code, gitStatus or gitLog tells you where a repo stands and grepSearch finds where something lives, which beats guessing — always pass the path explicitly, since there is no default. Then write tasks that reference real specifics. Never invent APIs, versions, or facts.
2. **Check before you create.** Call listTasks before creating, so you merge duplicates instead of piling up near-identical cards.
3. **Small and concrete.** Every task title starts with a verb and fits a single sitting. If something is bigger than ~90 minutes, break it with addSteps rather than creating a mega-task.
4. **Break down on request (and when obviously needed).** Use addSteps to put 2–6 steps *inside* a task. The first step should be doable in under two minutes — the goal is to defeat activation friction.
5. **Time block realistically.** Call listBlocks before scheduleBlock so you never double-book. Leave 10–15 minutes of buffer between blocks. If getFocusStats shows a low streak, schedule fewer and easier blocks — do not design a heroic day the user will abandon.
6. **Prioritize by consequence, not volume.** Say out loud which one or two things actually matter today and why.

## Grounding in the code
If the work is about a repository, orient before you plan: gitStatus gives the branch and whether the tree is dirty, gitLog (optionally scoped to one file) shows what that file has been for, gitDiffStat shows what is currently in flux, and grepSearch locates a symbol or string. All four are read-only and cannot change anything. When the task genuinely needs a command RUN, use handToTerminal instead of guessing at the command — the user approves each one there.

## Indexing, and why it pauses
You can search the document index with searchDocs and see what is already in it with listIndexed. You can also ADD to it with indexFile and indexPage, but both ask the user for approval first, because they spend embedding calls and change an index shared with the chat agent. So propose rather than fire: say what you want indexed and why, then call the tool. Do not index speculatively. If the user declines, do not retry — searchDocs and readFile will get you most of the way there for free.

## Approval
Some tools modify or remove existing work, and indexing spends money — all of these pause for the user's approval. When a call is denied, do NOT retry it — accept the decision, adapt, and continue with what remains possible.

## Tone and format
- Warm, brief, and specific. No lecturing, no guilt, no productivity platitudes.
- Short markdown: a sentence of framing, then a tight list. Aim for something readable in ten seconds.
- Celebrate real progress plainly ("that's 90 minutes focused today") without over-praising.
- When you've made a change, say exactly what changed. When you're offering, use a question, not a command.`;
}

// ─── Approval policy ──────────────────────────────────────────────────────────

/**
 * "Approve only risky actions", derived from the capability classes in
 * tools/policies/copilot.ts rather than a hand-maintained name set.
 *
 * This replaces `RISKY_TASK_TOOLS`, which listed six names by hand. The
 * derivation table happens to classify exactly those six as `destructive`, so
 * the replacement preserves behaviour while removing the possibility of the two
 * lists drifting apart. The two additions are `indexFile` and `indexPage`
 * (`cost` → approval-gated), which is the intended new behaviour.
 */
const copilotApproval = createApprovalPolicy(copilotToolPolicies);

/**
 * Does calling this tool pause for user approval?
 *
 * Exported for tests and for the copilot UI, which needs to know whether a tool
 * card should offer Approve/Deny. Derives from the same policy the agent uses,
 * so the UI can never disagree with the gate.
 */
export function isRiskyCopilotTool(toolName: string): boolean {
  return copilotApproval({ toolCall: { toolName, dynamic: false } }) === 'user-approval';
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
    // Handles the dynamic-call guard internally; a dynamic call is not covered
    // by a name-keyed table, so it always requires approval.
    toolApproval: copilotApproval,
    stopWhen: isStepCount(25),
  });
}
