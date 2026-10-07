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
export { copilotToolPolicies } from './policies/copilot.js';

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

import { createApprovalPolicy } from './capability.js';
import { chatToolPolicies } from './policies/chat.js';

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
 * Does the Tools page need a native confirmation before running this tool?
 *
 * Mirrors the agent's gate exactly, including failing closed on an
 * unclassified tool — a tool nobody classified is one nobody has reasoned about,
 * so it is not one the user should be able to fire silently.
 */
export function requiresApproval(toolName: string): boolean {
  const decision = chatApprovalPolicy({
    toolCall: { toolName, dynamic: false },
  });
  return (
    decision === 'user-approval' ||
    (typeof decision === 'object' && decision.type === 'denied')
  );
}
