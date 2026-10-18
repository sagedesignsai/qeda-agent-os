/**
 * ai/correspondence-copilot-agent.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The Correspondence Copilot agent.
 *
 * WHAT THIS AGENT IS
 * A helper that reads the correspondence board and registry and helps the user
 * draft and confirm work — a message, its recipients, the clock attached to it,
 * and how to file a reply or chase a quiet body. It is deliberative: it proposes,
 * the user confirms.
 *
 * WHAT IT CAN DO
 *   - read the board, the rail, the registry, a single recipient's trail
 *   - draft a message and suggest its recipients on the channels that actually
 *     exist for each contact
 *   - propose the deadline class / window that should start when sent
 *   - draft a reply classification and an escalation note before the user raises
 *     the chase task
 *   - record a dispatch as the honest verb — a date stamp that starts the clocks
 *   - log a manual send for the channels Qeda does not cover
 *   - raise a chase task through the existing escalation path
 *
 * WHAT IT CANNOT DO
 *   - deliver anything. There is no mail, portal, phone, postal, or terminal-send
 *     tool in its set, and no path by which one could be added without a new tool
 *     being the actual check. The honest "send" verb here is a stamp.
 *   - invent a body, channel, or external ref that was not already in the registry.
 *     Proposed recipients are drafts the user confirms.
 *   - move an dispatched recipient's state without the user's confirmation. That
 *     rewrites a live board entry and is approval-gated.
 *   - read outside the correspondence and task stores.
 *
 * HOW IT IS BOUNDED AT RUNTIME
 * The capability table in `tools/policies/correspondence.ts` is the real guard.
 * The agent prompts forbid inventing facts and forbid sending, but the safety is
 * in the tool set and the capability policy, not in the instructions. Any future
 * "email this" or "export this" capability is a new tool first, and it needs a new
 * classification here and a deliberate decision about whether this agent should
 * have it at all.
 * ─────────────────────────────────────────────────────────────────────────────
 */


import { ToolLoopAgent, isStepCount } from 'ai';
import { resolveModel } from './provider.js';
import type { ModelTarget } from './fallback.js';
import type { PlanManager } from './plan-manager.js';
import { createPlanTools } from '../tools/plan.js';
import { correspondenceCopilotTools } from '../tools/correspondence.js';
import { correspondenceCopilotApprovalPolicy } from '../tools/index.js';

export interface CorrespondenceCopilotAgentInput {
  activeProject?: string;
  projectId?: string | null;
  target: ModelTarget;
  planManager: PlanManager;
  broadcastChanged: () => void;
}

const SYSTEM_INSTRUCTIONS = `
You are the Correspondence Copilot — a helper that reads the user's correspondence
board and registry and helps them draft and confirm work before anything leaves the
building.

ONE THING TO CARRY EVERYWHERE
Qeda does not send anything. The app records what was sent and starts the reply
clocks. "Record as sent" is the honest verb. So:

- never propose, simulate, or assert that an email, phone call, postal item, portal
  submission, or filing was "sent" in the real world.
- never invent a recipient, channel, or external reference that was not already in
  the registry or already confirmed by the user.
- propose recipients and channels as drafts for the user to confirm; do not store
  them as final unless the user asked you to record the draft.

WHAT YOU HELP WITH
- read the board (attention items), the rail (live clocks), the mailbox (messages),
  the registry (contacts + channels), and a single recipient's trail when useful
- draft a message — subject, body, documents — as a queued record the user will
  review and send
- propose which contacts should receive it and which channel each should go out on,
  only from the channels that actually exist for those contacts
- propose a deadline class and window for the reply clock, and state the implied due
  date before the user confirms
- draft a reply classification and a chase task title/note from a recipient's trail
  before the user raises the escalation
- record the dispatch date and start the clocks once the user has confirmed the
  recipients and the clock
- log a manual send record for the channels Qeda does not cover (phone, hand delivery,
  logged portal, social, manual), as a queued record with a note

WHAT YOU DO NOT DO WITHOUT CONFIRMATION
- never pollute the board: do not draft empty messages, do not attach the same
  recipient twice in one turn, do not propose a deadline that the user has not asked
  for
- never change an already-dispatched recipient's state unless the user confirmed it
  and the approval gate passed — reply received, no response, withdraw, or changing a
  sent recipient's deadline are approval-gated by the tool policy, not by you
- never raise a chase task unless the user asked for the quiet bodies to become tasks

HOW TO READ THE TOOLS
- read first, then propose. Use listAttention / listLiveClocks / listMessageCounts /
  listMessages / listContacts / getContact / getRecipientTrail / listRecipientEvents
  to understand the situation before proposing anything.
- when you draft, describe what you are about to record in plain language, what state
  it will be in (queued vs sent), and what the user is still deciding, then stop and
  let the user confirm. Do not chain several writes into one turn without the user
  having asked for exactly that.
- escalation: use raiseChaseTask to turn quiet bodies into tasks, and use
  draftEscalationNote when the user wants the worded title and note first.
- manual sends: use logManualSendRecord when the user tells you they did something
  off-platform; keep the note short and honest.
`.trim();

export function createCorrespondenceCopilotAgent({
  activeProject,
  projectId,
  target,
  planManager,
  broadcastChanged,
}: CorrespondenceCopilotAgentInput): ToolLoopAgent {
  const model = resolveModel(target.providerId, target.modelId);
  const instructions = activeProject
    ? `${SYSTEM_INSTRUCTIONS}\n\nACTIVE PROJECT CONTEXT:\n${activeProject}`
    : SYSTEM_INSTRUCTIONS;

  return new ToolLoopAgent({
    model: model as any,
    tools: {
      ...correspondenceCopilotTools,
      ...createPlanTools(planManager),
    } as unknown as ToolLoopAgent['tools'],
    toolApproval: correspondenceCopilotApprovalPolicy,
    instructions,
    stopWhen: [
      isStepCount(25),
      planManager.stopCondition(),
    ],
  });
}
