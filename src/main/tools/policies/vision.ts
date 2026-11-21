/**
 * tools/policies/vision.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Approval policy for vision tools.
 *
 * All vision tools are read-only inspection operations:
 * - They never modify state
 * - They never trigger side effects
 * - They only analyze and return data
 *
 * Therefore: NO approval needed for any vision tool.
 */

import { createApprovalPolicy, type ToolPolicy } from '../capability.js';

export const visionToolPolicies = createApprovalPolicy({
  analyzeViewport: {
    capability: 'read',
    description: 'Read-only: inspect editor viewport',
  } as ToolPolicy,

  scorePreview: {
    capability: 'read',
    description: 'Read-only: analyze preview render',
  } as ToolPolicy,

  validateComposition: {
    capability: 'read',
    description: 'Read-only: validate layout',
  } as ToolPolicy,

  checkConsistency: {
    capability: 'read',
    description: 'Read-only: compare visual states',
  } as ToolPolicy,
});
