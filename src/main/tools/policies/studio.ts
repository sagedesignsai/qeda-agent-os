/**
 * tools/policies/studio.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Capability classification for the Studio Copilot (createStudioCopilotAgent).
 *
 * The Studio Copilot is the one copilot surface where the user IS present —
 * they watch the Studio panel while the agent edits, records, and drives the
 * desktop. That is why it is the only copilot given browser-use and
 * computer-use tools: the Showcase Studio demo recording workflow was designed
 * around this exact capability (agent records → drives the app → marks
 * highlights → saves the take).
 *
 * Safety model:
 *   - Computer-use input tools are already gated by settings.computerUse
 *     (enabled + window allowlist) inside the service layer. The policy layer
 *     here adds a second gate: `write-local` derives to `not-applicable`
 *     (auto-approved) because the user is present and watching, matching the
 *     chat agent's treatment of these same tools.
 *   - Browser-use tools follow the same pattern as the chat agent: network
 *     tools for open/navigate, write-local for DOM interaction, read for
 *     screenshots.
 *   - Studio editing tools are all `write-local`: they rewrite one take's own
 *     arrays, which the user can see and undo in the Studio timeline.
 *
 * See docs/agent-tooling-spec.md §4 (overrides) and §5 (declarations).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { ToolPolicyMap } from '../capability';

/** Shorthand so the table below reads as a classification, not as boilerplate. */
const t = (
  capability: ToolPolicyMap[string]['capability'],
): ToolPolicyMap[string] => ({
  capability,
});

export const studioToolPolicies: ToolPolicyMap = {
  // ── Showcase Studio editing (tools/studio.ts) ──────────────────────────────
  // All write-local: these rewrite one take's own arrays, which the user can
  // see and undo in the Studio timeline. Nothing here reaches outside the take
  // or spends money — generateSocialKit only stores a kit the agent already wrote.
  getTakeDetails: t('read'),
  getMouseTelemetry: t('read'),
  addKineticZoom: t('write-local'),
  removeKineticZoom: t('write-local'),
  addCanvasEffect: t('write-local'),
  removeCanvasEffect: t('write-local'),
  cutSilenceOrRange: t('write-local'),
  setCaptions: t('write-local'),
  updateStyling: t('write-local'),
  generateSocialKit: t('write-local'),

  // ── Capability discovery ───────────────────────────────────────────────────
  getStudioCapability: t('read'),

  // ── Computer Use (tools/computer-use.ts) ────────────────────────────────────
  // Observation tools — read-only, no approval needed.
  listWindows: t('read'),
  captureScreenshot: t('read'),
  getActiveWindow: t('read'),
  getCursorPosition: t('read'),
  wait: t('read'),

  // Input tools — write-local, auto-approved because the user is present and
  // watching the Studio panel. The service layer still enforces the
  // settings.computerUse allowlist per action.
  moveMouse: t('write-local'),
  click: t('write-local'),
  doubleClick: t('write-local'),
  typeText: t('write-local'),
  pressKey: t('write-local'),
  scroll: t('write-local'),

  // ── Professional demo recording (tools/computer-use.ts → studio-recorder) ───
  // The agent records its own demo: start, mark highlights as it goes, stop.
  // Recording the screen is not an input action, but it is still gated inside
  // the recorder on Computer Use being enabled — that toggle is the user's
  // opt-in for an agent watching the screen at all.
  startDemoRecording: t('write-local'),
  markHighlight: t('write-local'),
  stopDemoRecording: t('write-local'),

  // ── Browser Use (tools/browser-use.ts) ──────────────────────────────────────
  // Network tools for navigation, write-local for DOM interaction.
  // The user is present, so these are auto-approved like in the chat agent.
  openBrowser: t('network'),
  navigateBrowser: t('network'),
  clickSelector: t('write-local'),
  typeSelector: t('write-local'),
  evaluateBrowser: t('write-local'),
  screenshotBrowser: t('read'),
  closeBrowser: t('write-local'),

  // ── Planning (tools/plan.ts) ───────────────────────────────────────────────
  createPlan: t('write-local'),
  updatePlanItem: t('write-local'),
};
