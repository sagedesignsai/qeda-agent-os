/**
 * main/tools/motion-capability-tool.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * getMotionCapability — the queryable capability surface over the Motion
 * engine (Trace getTraceCapability equivalent). Derived from the live
 * registry; never hand-written prose.
 */

import { tool } from 'ai';
import { z } from 'zod';
import { discoverMotionCapability } from '../ai/motion-capability';

export function createMotionCapabilityTool() {
  return tool({
    description:
      'Ask what the Motion system can do before building. Returns grounded guidance: ' +
      'suggested composition patterns, matching node types, available recipes, and design practices. ' +
      'Call this FIRST for complex briefs ("How do I build a product hero?", "What primitives express a chart?") ' +
      'to ground output in real system capabilities. For simple tweaks, skip it and use motion.scene.director directly.',
    inputSchema: z.object({
      query: z.string().min(3).max(500).describe('What you want to build or know, e.g. "How do I build a product hero shot?"'),
    }),
    execute: async ({ query }) => discoverMotionCapability(query),
  });
}

export type MotionCapabilityTool = ReturnType<typeof createMotionCapabilityTool>;
