/**
 * tools/policies/presence-copilot.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Capability classification for the Presence Copilot (createPresenceCopilotAgent).
 *
 * Philosophy: The copilot generates suggestions and manages batches, but never
 * posts on the user's behalf. All mutations require approval.
 *
 * Read tools are ungated so the copilot can ground suggestions in project
 * context, recent activity, and contacts. Network tools are gated by default
 * but allowed here since the copilot researches in service of suggestions.
 *
 * Update/delete tools are all destructive, requiring approval before mutation.
 * The approval policy is derived from this table by `createApprovalPolicy`, the
 * same machinery every other copilot uses — including its fail-closed behaviour
 * for a tool that is exposed but unclassified.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createApprovalPolicy, type ToolPolicyMap } from '../capability.js';

/** Shorthand so the table below reads as a classification, not as boilerplate. */
const t = (
  capability: ToolPolicyMap[string]['capability'],
): ToolPolicyMap[string] => ({
  capability,
});

export const presenceCopilotToolPolicies: ToolPolicyMap = {
  // ── Presence verbs ────────────────────────────────────────────────────────
  // Read tools
  getPresenceProfile: t('read'),
  getPresenceStreak: t('read'),
  listPresenceBatches: t('read'),
  getPresenceBatch: t('read'),
  listRecentPresenceItems: t('read'),
  getPresenceCounts: t('read'),

  // Create batch/item (additive, approved)
  createPresenceBatch: t('write-local'),
  createPresenceItem: t('write-local'),
  logPresencePost: t('write-local'),

  // Generate (backward compat, additive)
  generatePresenceBatch: t('write-local'),

  // Update/delete (destructive, requires approval)
  updatePresenceItem: t('destructive'),
  deletePresenceItem: t('destructive'),
  updatePresenceProfile: t('destructive'),

  // ── Planning (tools/plan.ts) ───────────────────────────────────────────────
  // The agent's instructions require it to declare and advance a plan.
  createPlan: t('write-local'),
  updatePlanItem: t('write-local'),

  // ── Grounding: context for suggestions ─────────────────────────────────────
  // Read tools
  findPages: t('read'),
  listPages: t('read'),
  getPage: t('read'),

  // Search
  searchDocs: t('read'),
  listIndexed: t('read'),

  // ── Research: network tools for trend/content ideas ────────────────────────
  webSearch: t('network'),
  fetchUrl: t('network'),
  libraryDocs: t('network'),
};

/**
 * The approval policy for the Presence Copilot.
 * Exported as `presenceCopilotApprovalPolicy` for use in the agent factory.
 */
export const presenceCopilotApprovalPolicy = createApprovalPolicy(
  presenceCopilotToolPolicies,
);
