/**
 * tools/policies/trace.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Capability classification for the NovaTrace copilot (createTraceCopilotAgent).
 *
 * The trace copilot creates and animates 2D vector motion compositions. Most
 * operations are additive (creating elements, setting tracks, applying
 * recipes) and run freely. Only `deleteElements` is destructive — it removes
 * elements irrecoverably, so the user is asked to approve.
 *
 * Deliberately ABSENT (the real safety boundary — same pattern as the drafter):
 *   - No shell, filesystem-write, or clipboard tool
 *   - No network tool (no web search, no URL fetch)
 *   - No task or project management tools
 *   - No email or correspondence tool
 *   - The only mutation surface is the trace project store
 *
 * `exportSvg` is read-only — it generates output without mutating the project.
 * `getTraceCapability` is read-only — it loads documentation.
 * `dispatchOps` is `write-local` — it applies ops (which may include deletes),
 *   but the ops engine is atomic, and the destructive sub-ops within a batch
 *   are rare. The copilot instructions steer toward specific tools, and
 *   `dispatchOps` is the escape hatch for complex atomic mutations.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { ToolPolicyMap } from '../capability';

/** Shorthand so the table reads as a classification, not boilerplate. */
const t = (
  capability: ToolPolicyMap[string]['capability'],
): ToolPolicyMap[string] => ({
  capability,
});

export const traceToolPolicies: ToolPolicyMap = {
  // ── Project management (read + write-local) ────────────────────────────────
  getProject: t('read'),
  createProject: t('write-local'),
  lintProject: t('read'),

  // ── Element creation (additive) ────────────────────────────────────────────
  addElements: t('write-local'),
  updateElements: t('write-local'),
  setCanvas: t('write-local'),

  // ── Animation (additive — tracks are set, not destroyed) ──────────────────
  setTracks: t('write-local'),

  // ── Hierarchy (additive grouping) ─────────────────────────────────────────
  groupElements: t('write-local'),

  // ── Deletion (irreversible — gated) ───────────────────────────────────────
  deleteElements: t('destructive'),

  // ── Defs / gradients (additive) ──────────────────────────────────────────
  setDefs: t('write-local'),

  // ── Recipes (additive — instantiates new elements) ────────────────────────
  applyRecipe: t('write-local'),

  // ── Storyboard (additive scene planning) ──────────────────────────────────
  addScene: t('write-local'),

  // ── Export (read-only — generates output, does not mutate) ────────────────
  exportSvg: t('read'),

  // ── Capability discovery (read-only — loads docs) ──────────────────────────
  getTraceCapability: t('read'),

  // ── Raw ops (write-local — applies atomic ops batch) ───────────────────────
  // Could contain deleteElement ops, but the ops engine is atomic and the
  // copilot instructions favor specific tools. Classify as write-local because
  // the primary use is complex multi-element creation in one batch.
  dispatchOps: t('write-local'),

  // ── Subagent delegation (additive composition) ─────────────────────────────
  buildComposition: t('write-local'),

  // ── Planning (tools/plan.ts) ───────────────────────────────────────────────
  createPlan: t('write-local'),
  updatePlanItem: t('write-local'),
};
