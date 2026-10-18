/**
 * tools/index.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Central tool registry — assembles every tool group, and owns the ONE derived
 * answer to "does this tool need user approval?".
 *
 * That single-answer property is the whole point. Before capabilities, the
 * approval question was asked in two places with two hand-maintained lists:
 * the agent's `toolApproval` map and the Tools page's `name in policy` check.
 * They could disagree, and the Tools page executing a tool the agent would
 * have gated was an approval bypass. Both now call the same derived policy.
 *
 * See docs/agent-tooling-spec.md §4 (derivation) and §5 (declarations).
 * ─────────────────────────────────────────────────────────────────────────────
 */

export { filesystemTools } from './filesystem.js';
export { shellTools } from './shell.js';
export { clipboardTools } from './clipboard.js';
export { ragTools } from './rag.js';
export { webTools } from './web.js';
export { workspaceTools } from './workspace.js';
export { repoTools } from './repo.js';
export { indexPageTool } from './workspace-rag.js';
export { serviceTools } from './services.js';
export { resourceTools } from './resources.js';
export { taskTools } from './tasks.js';
export { documentDrafterTools } from './documents-drafter.js';

export {
  createApprovalPolicy,
  deriveApproval,
  defaultApprovalFor,
  policyDrift,
  type Capability,
  type ToolPolicy,
  type ToolPolicyMap,
  type ApprovalStatus,
} from './capability.js';

export { chatToolPolicies } from './policies/chat.js';
export { correspondenceToolPolicies } from './policies/correspondence.js';
export { createPlanTools } from './plan.js';

import { filesystemTools } from './filesystem.js';
import { shellTools } from './shell.js';
import { clipboardTools } from './clipboard.js';
import { ragTools } from './rag.js';
import { webTools } from './web.js';
import { workspaceTools } from './workspace.js';
import { repoTools } from './repo.js';
import { indexPageTool } from './workspace-rag.js';
import { serviceTools } from './services.js';
import { resourceTools } from './resources.js';
import { taskTools } from './tasks.js';
import { documentDrafterTools } from './documents-drafter.js';
import { createPlanTools } from './plan.js';
import { PlanManager } from '../ai/plan-manager.js';

import { createApprovalPolicy } from './capability.js';
import { chatToolPolicies } from './policies/chat.js';
import { correspondenceToolPolicies } from './policies/correspondence.js';

export { createPlanTools } from './plan.js';

/** Every tool available to the chat agent. The copilot picks a subset. */
export const allTools = {
  ...filesystemTools,
  ...shellTools,
  ...clipboardTools,
  ...ragTools,
  ...webTools,
  ...workspaceTools,
  ...serviceTools,
  ...repoTools,
  ...resourceTools,
  ...taskTools,
  ...documentDrafterTools,
  ...createPlanTools(new PlanManager()),
  indexPage: indexPageTool,
};


/**
 * The chat agent's approval gate, derived from `chatToolPolicies`.
 *
 * Pass directly as `ToolLoopAgent`'s `toolApproval`. Also used by the Tools
 * page (ipc/handlers/tools.ts) so manual execution cannot bypass it.
 */
export const chatApprovalPolicy = createApprovalPolicy(chatToolPolicies);

/**
 * The correspondence copilot's approval gate, derived from
 * `correspondenceToolPolicies`.
 *
 * Used by the correspondence copilot agent's `toolApproval`. Mirrors the chat and
 * copilot policies exactly — same derived-approval machinery, same fail-closed-on-
 * unknown-tool behaviour.
 */
export const correspondenceCopilotApprovalPolicy = createApprovalPolicy(
  correspondenceToolPolicies,
);
