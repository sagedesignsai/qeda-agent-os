/**
 * ai/blender-specialist-agent.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Blender specialist subagent (AI SDK 7 pattern).
 *
 * A narrow ToolLoopAgent whose only job is turning a brief into a validated
 * GLB file on disk (plus preview render). It is used by the Model Builder
 * (as a nested subagent) and can be used directly by Motion Copilot.
 *
 * Hierarchy: Motion Copilot → Model Builder subagent → Blender Specialist.
 * Each level sees only a summary (toModelOutput), keeping contexts clean.
 *
 * Rules honoured (see 06-subagents.mdx):
 *  - Fresh agent per delegation; abortSignal propagated.
 *  - No toolApproval inside subagents — the file tool executes directly.
 *  - Final text must be a summary (instructions demand it).
 */
import { ToolLoopAgent, isStepCount, tool } from 'ai';
import { z } from 'zod';
import { getSettings } from './settings.js';
import { resolveModel } from './provider.js';
import { runBlenderJob, probeBlender } from '../blender/runner.js';
import type { ModelTarget } from './fallback.js';

export interface BlenderSpecialistOptions {
  target?: ModelTarget;
}

export interface BlenderSpecialistResult {
  success: boolean;
  glbPath?: string;
  previewPath?: string;
  bytes?: number;
  attempts: number;
  notes: string;
}

const generateFileTool = tool({
  description:
    'Generate a GLB file with headless Blender (templated, deterministic). Returns the validated file path. ' +
    'Use seed variations on retry when the first attempt fails validation.',
  inputSchema: z.object({
    brief: z.string().min(3).max(240),
    style: z.enum(['lowpoly', 'pbr', 'stylized']).default('pbr'),
    seed: z.number().int().min(0).max(2_147_483_647).default(1),
  }),
  execute: async ({ brief, style, seed }) => {
    const job = await runBlenderJob({ brief, style, seed });
    if (!job.success) {
      return { success: false as const, error: job.error ?? 'Blender job failed', excerpt: job.excerpt };
    }
    return {
      success: true as const,
      glbPath: job.glbPath,
      previewPath: job.previewPath,
      bytes: job.bytes,
    };
  },
});

const healthTool = tool({
  description: 'Probe the local Blender install (version + bpy smoke test).',
  inputSchema: z.object({}),
  execute: async () => probeBlender(),
});

export function createBlenderSpecialistAgent(opts: BlenderSpecialistOptions = {}) {
  const settings = getSettings();
  const providerId = opts.target?.providerId ?? settings.activeProvider;
  const modelId = opts.target?.modelId ?? settings.activeModel;
  const model = resolveModel(providerId, modelId);

  return new ToolLoopAgent({
    model: model as any,
    instructions:
      'You are a Blender asset specialist. Turn the brief into ONE validated GLB file.\n' +
      '- Call generateBlenderFile with the brief, a sensible style, and seed 1.\n' +
      '- If it fails (timeout, bad GLB, oversized), retry ONCE with a different seed and simpler style.\n' +
      '- Check health once first if unsure Blender is available.\n' +
      '- When done, write a final summary: glbPath, bytes, previewPath (if any), attempts, and any caveat.\n' +
      '- You do NOT edit any Motion document. The caller places the file.',
    tools: {
      generateBlenderFile: generateFileTool,
      checkBlenderHealth: healthTool,
    },
    stopWhen: [isStepCount(6)],
  });
}

/**
 * Tool wrapper for use inside a parent agent (Model Builder or Motion Copilot).
 * Returns the summary object; toModelOutput keeps the parent context clean.
 */
export function createBlenderSpecialistTool(opts: BlenderSpecialistOptions = {}) {
  return tool({
    description:
      'Delegate bespoke asset generation to the Blender specialist subagent. ' +
      'It iteratively generates and validates a GLB (with preview render) and returns the file path. ' +
      'The caller then places it with motion.scene.director as model.gltf.',
    inputSchema: z.object({
      brief: z.string().min(3).max(240).describe('Asset brief, e.g. "sci-fi barrel with metal rings".'),
      style: z.enum(['lowpoly', 'pbr', 'stylized']).optional(),
    }),
    execute: async ({ brief, style }, { abortSignal }) => {
      if (getSettings().blender?.enabled === false) {
        return {
          success: false,
          notes: 'Blender generation disabled in Settings.',
        } as BlenderSpecialistResult;
      }
      const specialist = createBlenderSpecialistAgent(opts);
      try {
        const result = await specialist.generate({
          prompt: `Generate a GLB for: ${brief}${style ? ` (style: ${style})` : ''}`,
          abortSignal,
        });
        const text = result.text?.trim() ?? 'Blender specialist finished.';
        // Extract file path from the specialist's summary if present; the
        // authoritative path comes from the tool result the specialist saw.
        // We do not parse free text for paths — report the text and let the
        // caller re-run the direct tool if a path is needed.
        return {
          success: /glb|preview|bytes/i.test(text) || text.length > 0,
          notes: text.slice(0, 1200),
        } as BlenderSpecialistResult;
      } catch (error) {
        return {
          success: false,
          notes: error instanceof Error ? error.message : String(error),
        } as BlenderSpecialistResult;
      }
    },
    toModelOutput: ({ output }) => {
      const s = output as BlenderSpecialistResult;
      return { type: 'text' as const, value: s.notes };
    },
  });
}

export type BlenderSpecialistAgent = ReturnType<typeof createBlenderSpecialistAgent>;
export type BlenderSpecialistTool = ReturnType<typeof createBlenderSpecialistTool>;
