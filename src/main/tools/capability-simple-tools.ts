/**
 * main/tools/capability-simple-tools.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Thin getXCapability tools for Studio/Music/Correspondence (Phase D).
 * Same Trace/Motion/Document shape: query → grounded patterns + practices.
 */

import { tool } from 'ai';
import { z } from 'zod';
import { discoverStudioCapability } from '../ai/studio-capability';
import { discoverMusicCapability } from '../ai/music-capability';
import { discoverCorrespondenceCapability } from '../ai/correspondence-capability';

const makeTool = (label: string, discover: (q: string) => unknown) =>
  tool({
    description: `Ask what the ${label} system can do before acting. Returns composition patterns and design practices derived from the system itself. Call FIRST for non-trivial requests.`,
    inputSchema: z.object({
      query: z.string().min(3).max(500).describe(`What you want to know, e.g. "How do I ${label === 'Studio' ? 'edit this take' : label === 'Music' ? 'build a focus set' : 'draft a reply'}?"`),
    }),
    execute: async ({ query }) => discover(query),
  });

export const getStudioCapability = makeTool('Studio', discoverStudioCapability);
export const getMusicCapability = makeTool('Music', discoverMusicCapability);
export const getCorrespondenceCapability = makeTool('Correspondence', discoverCorrespondenceCapability);
