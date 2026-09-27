/**
 * tools/policies/copilot.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Capability classification for the Focus copilot (createTaskCopilotAgent).
 *
 * Unlike the chat policy, this map has NO overrides. That is the point of the
 * capability model: the copilot's previous policy was a hand-maintained
 * `RISKY_TASK_TOOLS` set of six names, and the default derivation table happens
 * to classify exactly those six as `destructive`. The hand-maintained list is
 * therefore replaced by derivation rather than translated, which is the only way
 * it can be guaranteed not to drift.
 *
 * The copilot is the more autonomous of the two surfaces — it runs on background
 * intent ("plan my day", "break this down") rather than a direct instruction —
 * so it keeps the strict default for `cost`. Indexing therefore prompts the
 * user, which is exactly the intended behaviour (spec §6.2).
 *
 * Deliberately ABSENT: `removeFromIndex`. It is `destructive`, and giving the
 * copilot a delete capability over the shared RAG index has no corresponding
 * user-facing affordance (spec §6.2).
 *
 * Also absent: `runShell`. The copilot reaches the shell through
 * `handToTerminal`, which hands the work to the agentic terminal where the user
 * already approves each command (spec §6.1).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { ToolPolicyMap } from '../capability';

/** Shorthand so the table below reads as a classification, not as boilerplate. */
const t = (capability: ToolPolicyMap[string]['capability']): ToolPolicyMap[string] => ({
  capability,
});

export const copilotToolPolicies: ToolPolicyMap = {
  // ── Task verbs ─────────────────────────────────────────────────────────────
  listTasks: t('read'),
  listProjects: t('read'),
  getTask: t('read'),
  getFocusStats: t('read'),
  listBlocks: t('read'),
  createTask: t('write-local'),
  createTasks: t('write-local'),
  createProject: t('write-local'),
  addSteps: t('write-local'),
  scheduleBlock: t('write-local'),
  handToTerminal: t('write-local'),
  // These six are exactly the old RISKY_TASK_TOOLS set, now derived.
  updateTask: t('destructive'),
  completeTask: t('destructive'),
  deleteTask: t('destructive'),
  assignTaskToProject: t('destructive'),
  moveBlock: t('destructive'),
  deleteBlock: t('destructive'),

  // ── Grounding: the outside world ───────────────────────────────────────────
  webSearch: t('network'),
  fetchUrl: t('network'),
  libraryDocs: t('network'),

  // ── Grounding: the user's own material ─────────────────────────────────────
  findPages: t('read'),
  listPages: t('read'),
  getPage: t('read'),
  relatedPages: t('read'),
  searchDocs: t('read'),
  listIndexed: t('read'),
  readFile: t('read'),
  listDir: t('read'),

  // ── Repository (tools/repo.ts) ─────────────────────────────────────────────
  // Read-only by construction: these tools cannot mutate a working tree. See
  // spec §6.1 for why this is acceptable despite `readFile` already being
  // ungated over arbitrary paths.
  gitStatus: t('read'),
  gitLog: t('read'),
  gitDiffStat: t('read'),
  grepSearch: t('read'),

  // ── Indexing the vector store ──────────────────────────────────────────────
  // `cost` derives to `user-approval`: embedding calls are billable and mutate
  // a store shared with the chat agent.
  indexFile: t('cost'),
  indexPage: t('cost'),
};
