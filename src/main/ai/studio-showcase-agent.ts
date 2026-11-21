/**
 * ai/studio-showcase-agent.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Studio Showcase Agent — the multi-track project builder.
 *
 * A thin wrapper over `createStudioCopilotAgent` in `mode: 'showcase'`: the same
 * verified toolset and approval policy, but with the project workflow prompt and
 * a 40-step budget for import → tracks → clips → effects → verification.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  createStudioCopilotAgent,
  type StudioCopilotAgentOptions,
} from './studio-copilot-agent.js';

export type StudioShowcaseAgentOptions = Omit<StudioCopilotAgentOptions, 'mode'>;

export function createStudioShowcaseAgent(opts: StudioShowcaseAgentOptions) {
  return createStudioCopilotAgent({ ...opts, mode: 'showcase' });
}
