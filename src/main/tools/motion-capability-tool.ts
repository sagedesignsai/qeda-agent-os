/**
 * main/tools/motion-capability-tool.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * getMotionCapability — the queryable capability surface over the Motion
 * engine (Trace getTraceCapability equivalent). Derived from the live
 * registry; never hand-written prose.
 *
 * Also serves the NORMATIVE copilot contract from `docs/motion-2/`. The
 * contract is loaded from disk on every call (not baked into the prompt) so a
 * docs edit changes agent behavior without a rebuild — the same
 * "current documentation over memorized API" rule the Remotion skills use.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { app } from 'electron';
import { tool } from 'ai';
import { z } from 'zod';
import { discoverMotionCapability } from '../ai/motion-capability';
import { describeMotionEngine } from '../../lib/motion/engine-contract';

/** Read the copilot contract from the app bundle, falling back to the source tree. */
async function readMotionContract(): Promise<string | null> {
  const candidates = [
    // Packaged app: extraResources land beside app.asar, not inside it.
    ...(typeof process.resourcesPath === 'string'
      ? [path.join(process.resourcesPath, 'docs', 'motion-2', 'copilot-contract.md')]
      : []),
    path.join(app.getAppPath(), 'docs', 'motion-2', 'copilot-contract.md'),
    path.join(process.cwd(), 'docs', 'motion-2', 'copilot-contract.md'),
  ];
  for (const candidate of candidates) {
    try {
      return await readFile(candidate, 'utf-8');
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

export function createMotionCapabilityTool() {
  return tool({
    description:
      'Load the Motion copilot contract and grounded capability guidance. Returns the NORMATIVE contract ' +
      '(mutation rules, hard rules, budgets, verification commands, "done means") plus suggested composition ' +
      'patterns, matching node types, available recipes, and design practices. ' +
      'Call this FIRST for any new scene or multi-node change ("How do I build a product hero?") ' +
      'to ground output in real system capabilities. For simple single-node tweaks, skip it.',
    inputSchema: z.object({
      query: z.string().min(3).max(500).describe('What you want to build or know, e.g. "How do I build a product hero shot?"'),
    }),
    execute: async ({ query }) => {
      const capability = discoverMotionCapability(query);
      const contract = await readMotionContract();
      // This is the one tool that deliberately returns the full manifest. It is
      // ~200 KB; returning it from every scene operation would consume the
      // context budget before the agent did any work.
      return { ...capability, manifest: describeMotionEngine(), contract };
    },
  });
}

export type MotionCapabilityTool = ReturnType<typeof createMotionCapabilityTool>;