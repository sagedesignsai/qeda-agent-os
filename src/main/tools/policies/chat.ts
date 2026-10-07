/**
 * tools/policies/chat.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Capability classification for the chat agent (createDesktopAgent).
 *
 * The chat agent is the general surface: it gets every registered tool group
 * via `allTools`. This map MUST therefore stay in exact sync with `allTools`
 * — `__tests__/agent-capabilities.test.ts` fails the build if it drifts.
 *
 * Four of these entries carry overrides, and the reasons are load-bearing:
 *
 *  • writeFile / writeClipboard are stricter than the default table. Writing to
 *    the user's disk or clipboard is not something an agent should do silently
 *    just because "write-local" normally implies reversible local state.
 *
 *  • The `cost` tools are LOOSER than the default table. Cost derives to
 *    `user-approval` because an unattended agent can burn a quota, but the chat
 *    agent is a direct, user-initiated surface where the user has already opted
 *    in by configuring the provider and service keys. Gating every image or
 *    speech call there would be noise, not safety. The copilot — which runs
 *    more autonomously, on background intent — keeps the strict default.
 *
 * See docs/agent-tooling-spec.md §4 (overrides) and §5 (declarations).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { ToolPolicyMap } from '../capability';

/** Shorthand so the table below reads as a classification, not as boilerplate. */
const t = (
  capability: ToolPolicyMap[string]['capability'],
  approval?: ToolPolicyMap[string]['approval'],
  reason?: string,
): ToolPolicyMap[string] =>
  approval ? { capability, approval, reason } : { capability };

export const chatToolPolicies: ToolPolicyMap = {
  // ── Clipboard ──────────────────────────────────────────────────────────────
  readClipboard: t('read'),
  writeClipboard: t(
    'write-local',
    'user-approval',
    'Reaching the user clipboard is visible and disruptive; keep the pre-existing guardrail.',
  ),

  // ── Filesystem ─────────────────────────────────────────────────────────────
  readFile: t('read'),
  listDir: t('read'),
  writeFile: t(
    'write-local',
    'user-approval',
    'Pre-existing guardrail: writing to disk is not silently reversible for the user.',
  ),
  deleteFile: t('destructive'),

  // ── Shell ──────────────────────────────────────────────────────────────────
  // `destructive` already derives to `user-approval`, matching the previous
  // explicit `runShell: 'user-approval'` entry. Listed for visibility.
  runShell: t('destructive'),

  // ── RAG / embeddings ───────────────────────────────────────────────────────
  searchDocs: t('read'),
  listIndexed: t('read'),
  indexFile: t(
    'cost',
    'not-applicable',
    'Chat is a direct, user-initiated surface; embedding spend is already bounded by the user configuring a provider.',
  ),
  indexPage: t('cost', 'not-applicable', 'Same rationale as indexFile.'),
  removeFromIndex: t('destructive'),

  // ── Web / services ─────────────────────────────────────────────────────────
  webSearch: t('network'),
  fetchUrl: t('network'),
  advancedSearch: t('network'),
  scrapePage: t('network'),
  libraryDocs: t('network'),
  findImages: t(
    'cost',
    'not-applicable',
    'Image generation is metered; in a direct chat the user is present for the call.',
  ),
  textToSpeech: t('cost', 'not-applicable', 'Same rationale as findImages.'),
  transcribeAudio: t('cost', 'not-applicable', 'Same rationale as findImages.'),

  // ── Resources (Serper images / scholar / patents & downloader) ──────────────
  searchImages: t('network'),
  searchScholar: t('network'),
  searchPatents: t('network'),
  downloadResource: t(
    'write-local',
    'not-applicable',
    'Auto-approved when downloading non-executable media/assets into the project directory.',
  ),

  // ── Workspace ──────────────────────────────────────────────────────────────
  listPages: t('read'),
  getPage: t('read'),
  findPages: t('read'),
  relatedPages: t('read'),
  createNotebook: t('write-local'),
  writeNotebook: t('write-local'),
  writePage: t('write-local'),
  appendToPage: t('write-local'),
  startResearchRun: t('write-local'),
  recordSource: t('write-local'),
  recordEvidence: t('write-local'),
  completeResearchRun: t('write-local'),

  // ── Repository (tools/repo.ts) ─────────────────────────────────────────────
  gitStatus: t('read'),
  gitLog: t('read'),
  gitDiffStat: t('read'),
  grepSearch: t('read'),

  // ── Task management (tools/tasks.ts) ───────────────────────────────────────
  // The chat agent can now read tasks and create / complete them so it can
  // turn research findings into actionable tasks in one turn. Risky mutations
  // (delete, reassign) are classed destructive → user-approval, matching the
  // copilot policy. `handToTerminal` is write-local (creates a DB row only).
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
  updateTask: t('destructive'),
  completeTask: t('destructive'),
  deleteTask: t('destructive'),
  assignTaskToProject: t('destructive'),
  moveBlock: t('destructive'),
  deleteBlock: t('destructive'),
};
