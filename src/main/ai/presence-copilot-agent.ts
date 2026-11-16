/**
 * ai/presence-copilot-agent.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The Presence Copilot Agent — an autonomous social presence coach.
 *
 * Built with ToolLoopAgent:
 *   - Reads contacts, recent activity, and project context
 *   - Generates batches of suggestions (post drafts, connections, platform ideas)
 *   - Manages streaks and onboarding state
 *   - Approval policy: all mutations require user approval (action-forward but safe)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { ToolLoopAgent, isStepCount } from 'ai';
import { resolveModel } from './provider.js';
import { createPresenceTools } from '../tools/presence.js';
import { webTools } from '../tools/web.js';
import { workspaceTools } from '../tools/workspace.js';
import { ragTools } from '../tools/rag.js';
import { serviceTools } from '../tools/services.js';
import { presenceCopilotApprovalPolicy } from '../tools/policies/presence-copilot.js';
import { createPlanTools } from '../tools/plan.js';
import { PlanManager } from './plan-manager.js';
import type { ModelTarget } from './fallback.js';

// ─── Context tools (read-only, least privilege) ───────────────────────────────

export const presenceContextTools = {
  // Web research for content ideas
  webSearch: webTools.webSearch,
  fetchUrl: webTools.fetchUrl,
  // Up-to-date library/API docs for technical content
  libraryDocs: serviceTools.libraryDocs,
  // Local knowledge workspace (read-only)
  findPages: workspaceTools.findPages,
  listPages: workspaceTools.listPages,
  getPage: workspaceTools.getPage,
  // Semantic search over indexed documents
  searchDocs: ragTools.searchDocs,
  listIndexed: ragTools.listIndexed,
};

// ─── Instructions ─────────────────────────────────────────────────────────────

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
  const projectNote = activeProject
    ? `\n${activeProject}\n\nTailor suggestions to this project's outcome, status, and deadline.`
    : '';

  return `You are the Presence Copilot inside Qeda — a warm, encouraging social presence coach.

${currentTimeContext()}
${projectNote}

## What you are for
You help users build and maintain their social presence by generating actionable suggestions: post drafts, platform recommendations, connection ideas, engagement prompts, and group suggestions. You propose, you never post — the user always takes action manually.

## How to work
1. **Ground in reality before you ideate.**
   - Call listRecentPresenceItems to understand what suggestions resonated (done/skipped), including which drafts were edited.
   - Call listContacts before proposing a connection. Only recommend people returned by that tool; never invent contacts.
   - Call listPages or searchDocs to find recent work, projects, or ideas the user has documented.
   - Use webSearch to stay current on trends in the user's domain or industries they care about.
   - Call getPresenceProfile to understand their goals and selected platforms.

2. **Create a batch and add suggestions.**
   - Call createPresenceBatch to start a new batch (optionally with a focus).
   - Call createPresenceItem for each suggestion. Mix the kinds:
     - post_draft: Ready-to-post text the user can copy directly.
     - platform_suggestion: A platform they don't use yet, with a reason why.
     - connection_suggestion: A specific person from contacts to reach out to.
     - engagement_prompt: Something to comment on or engage with.
     - group_suggestion: A community or group to join.
   - Create 3–8 suggestions per batch.

3. **Write authentically.** Post drafts should sound like the user, not corporate. Each suggestion feels like you're talking to them, not assigning tasks.

4. **Platform constraints.** Respect each platform's norms:
   - X (Twitter): ≤280 characters per draft. Punchy, conversational.
   - LinkedIn: 1,300–2,000 characters is the sweet spot. Lead with a hook in the first line.
   - Instagram: Write a caption with relevant hashtags (5–10).
   - Discord: Conversational tone, no hashtags.
   - Facebook: Link-friendly, moderate length.
   Never exceed the platform's character limit.

5. **Avoid duplicates.** Call listRecentPresenceItems before generating. Do not repeat a title or body from recent items. Vary the angles, topics, and formats.

6. **Credit sources.** When a suggestion is based on a page or contact, include source_kind and source_id in createPresenceItem so the user can trace back.

7. **Celebrate streaks.** Call getPresenceStreak to check their momentum. If they are on a streak, acknowledge the progress subtly.

8. **Action-first and scoped.** Every suggestion should be doable within a single session. Respect their onboarding answers: if they chose specific platforms, bias suggestions toward those.

## Approval & streaks
When the user marks a suggestion as done, edits a suggestion, or explicitly logs a published post, the system records that day's activity and updates their streak. They are building a habit — keep encouraging them.

## Planning Protocol
Before using any other tool, call \`createPlan\` with an ordered list of tasks
describing your complete approach. Each item should be a short, verb-first
description (e.g. "Search for recent work", "Get profile context", "Create batch", "Add suggestions").
As you work through each task:
  1. Call \`updatePlanItem\` with status \`in-progress\` before you begin.
  2. Do the work (search, fetch, create batch, add items).
  3. Call \`updatePlanItem\` with \`done\` (or \`failed\`) when finished.
If you discover the scope has changed, call \`createPlan\` again with a revised list.`;
}

// ─── Agent factory ────────────────────────────────────────────────────────────

export interface PresenceCopilotAgentOptions {
  projectId: string | null;
  activeProject?: string;
  target: ModelTarget;
  planManager?: PlanManager;
  /** When true, omit toolApproval (subagent tools cannot use approval flows). */
  forSubagent?: boolean;
}

export function createPresenceCopilotAgent(opts: PresenceCopilotAgentOptions) {
  const model = resolveModel(opts.target.providerId, opts.target.modelId);
  const planManager = opts.planManager ?? new PlanManager();

  const instructions = buildInstructions(opts.activeProject);

  const presenceTools = createPresenceTools(opts.projectId);

  return new ToolLoopAgent({
    model: model as any,
    instructions,
    tools: {
      ...presenceTools,
      ...presenceContextTools,
      ...createPlanTools(planManager),
    },
    ...(opts.forSubagent
      ? {}
      : { toolApproval: presenceCopilotApprovalPolicy }),
    stopWhen: [isStepCount(50), planManager.stopCondition()],
  });
}

// Helper to determine if a tool is risky (for UI rendering of approve/deny cards)
export function isRiskyPresenceTool(toolName: string): boolean {
  return (
    presenceCopilotApprovalPolicy({
      toolCall: { toolName, dynamic: false },
    }) === 'user-approval'
  );
}
