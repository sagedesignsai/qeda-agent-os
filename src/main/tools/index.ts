/**
 * tools/index.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Central tool registry – exports all tools grouped by category.
 *
 * Import `allTools` to pass to ToolLoopAgent, or import individual tool groups
 * to compose purpose-specific agents.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export { filesystemTools } from './filesystem.js';
export { shellTools } from './shell.js';
export { clipboardTools } from './clipboard.js';
export { ragTools } from './rag.js';
export { webTools } from './web.js';
export { workspaceTools } from './workspace.js';
export { indexPageTool } from './workspace-rag.js';
export { serviceTools } from './services.js';

import { filesystemTools } from './filesystem.js';
import { shellTools } from './shell.js';
import { clipboardTools } from './clipboard.js';
import { ragTools } from './rag.js';
import { webTools } from './web.js';
import { workspaceTools } from './workspace.js';
import { indexPageTool } from './workspace-rag.js';
import { serviceTools } from './services.js';

/** Every tool available to the Vellum agent. */
export const allTools = {
  ...filesystemTools,
  ...shellTools,
  ...clipboardTools,
  ...ragTools,
  ...webTools,
  ...workspaceTools,
  ...serviceTools,
  indexPage: indexPageTool,
};

/**
 * Tools that ALWAYS require explicit user approval before execution.
 * This map is passed to ToolLoopAgent's `toolApproval` option.
 *
 * Web and workspace tools are read-only with respect to the local system and
 * only write through the audited workspace store, so they stay approval-free.
 */
export const toolApprovalPolicy = {
  writeFile: 'user-approval',
  deleteFile: 'user-approval',
  runShell: 'user-approval',
  writeClipboard: 'user-approval',
} as const;
