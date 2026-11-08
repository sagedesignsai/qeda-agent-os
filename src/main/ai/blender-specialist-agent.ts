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
import { ToolLoopAgent, isStepCount, tool, generateText } from 'ai';
import { z } from 'zod';
import fs from 'node:fs/promises';
import { getSettings } from './settings.js';
import { resolveModel } from './provider.js';
import { runAuthoredBlenderJob, probeBlender } from '../blender/runner.js';
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

const generateAuthoredAssetTool = tool({
  description:
    'Run an AI-authored Blender PART (mesh-building bpy code) in the sandboxed harness. ' +
    'Returns the validation report (tri counts, part inventory) or the PART\'s own error so the code can be refined.',
  inputSchema: z.object({
    brief: z.string().min(3).max(240),
    part: z
      .string()
      .min(1)
      .max(32_000)
      .describe(
        'Mesh-building bpy code. Create mesh objects and assign materials via the harness helpers (`mat`, `link`, `primitive`). ' +
          'No os/subprocess/socket imports, no file/export ops, no `while` loops — the harness owns those.',
      ),
    style: z.enum(['lowpoly', 'pbr', 'stylized']).default('pbr'),
    seed: z.number().int().min(0).max(2_147_483_647).default(1),
  }),
  execute: async ({ brief, part, style, seed }) => {
    const job = await runAuthoredBlenderJob({ part, brief, style, seed });
    if (!job.success) {
      return {
        success: false as const,
        error: job.error ?? 'Authored Blender job failed',
        report: job.report,
        excerpt: job.excerpt,
      };
    }
    return {
      success: true as const,
      glbPath: job.glbPath,
      previewPath: job.previewPath,
      bytes: job.bytes,
      report: job.report,
    };
  },
});

const healthTool = tool({
  description: 'Probe the local Blender install (version + bpy smoke test).',
  inputSchema: z.object({}),
  execute: async () => probeBlender(),
});

/**
 * T2 visual verification: score a preview render against the brief using a
 * vision model. Returns a match score (0–1) and targeted issue descriptions
 * the authoring agent can use to refine the PART. Skips cleanly when no
 * visionModel is configured (T1-only pipeline).
 */
const scoreRenderTool = tool({
  description:
    'Score a Blender preview render against the asset brief using a vision model. ' +
    'Returns a match score (0–1) and specific issues to fix. ' +
    'Only available when a vision model is configured in Settings.',
  inputSchema: z.object({
    previewPath: z.string().min(1).describe('Absolute path to the preview PNG.'),
    brief: z.string().min(3).max(240).describe('The asset brief text.'),
  }),
  execute: async ({ previewPath, brief }) => {
    const visionModelSpec = getSettings().blender?.visionModel;
    if (!visionModelSpec) {
      return {
        skipped: true as const,
        reason: 'No visionModel configured in Settings → Blender → visionModel. T2 verification is disabled.',
      };
    }

    // Parse "providerId/modelId" format
    const slashIdx = visionModelSpec.indexOf('/');
    if (slashIdx < 0) {
      return {
        skipped: true as const,
        reason: `visionModel format must be "providerId/modelId" (got: ${visionModelSpec}).`,
      };
    }
    const providerId = visionModelSpec.slice(0, slashIdx);
    const modelId = visionModelSpec.slice(slashIdx + 1);

    try {
      const imageBuffer = await fs.readFile(previewPath);
      const model = resolveModel(providerId, modelId);

      const result = await generateText({
        model: model as any,
        system: `
You are a 3D asset visual quality evaluator. You will see a preview render of a 3D model
and the text brief it was supposed to match. Evaluate how well the rendered geometry
matches the brief.

Respond with valid JSON only, matching this schema:
{
  "match": number,       // 0.0 (no match) to 1.0 (perfect match)
  "issues": [string]     // specific, actionable issues (e.g. "backrest is too short", "missing legs")
}

Focus on: part count, proportions, landmarks mentioned in the brief, material appearance.
If the geometry roughly matches but has minor issues, score 0.6–0.8.
If major parts are missing or proportions are wrong, score < 0.5.
        `.trim(),
        prompt: [
          {
            role: 'user',
            content: [
              { type: 'image' as const, image: new Uint8Array(imageBuffer) },
              { type: 'text' as const, text: `Brief: ${brief}` },
            ],
          },
        ],
      });

      // Parse the structured output
      const text = result.text?.trim() ?? '{}';
      const json = JSON.parse(text) as { match?: number; issues?: string[] };
      return {
        skipped: false as const,
        match: typeof json.match === 'number' ? Math.max(0, Math.min(1, json.match)) : 0,
        issues: Array.isArray(json.issues) ? json.issues : [],
      };
    } catch (error) {
      return {
        skipped: false as const,
        match: 0,
        issues: [`T2 scoring failed: ${error instanceof Error ? error.message : String(error)}`],
      };
    }
  },
});

export function createBlenderSpecialistAgent(opts: BlenderSpecialistOptions = {}) {
  const settings = getSettings();
  const providerId = opts.target?.providerId ?? settings.activeProvider;
  const modelId = opts.target?.modelId ?? settings.activeModel;
  const model = resolveModel(providerId, modelId);

  return new ToolLoopAgent({
    model: model as any,
    instructions:
      'You are a Blender asset specialist. Turn the brief into ONE validated GLB file whose geometry matches the brief.\n' +
      '- Author a `part`: mesh-building bpy code that builds the model from primitives/bmesh with the harness helpers (`mat`, `link`, `primitive`). ' +
      'Match the brief: correct part count, proportions, landmarks, and materials. Keep it simple and readable; scale in meters.\n' +
      '- Call generateAuthoredAsset with the part. On success check the report: part_count and part shapes should make sense; if the geometry is wrong or the job failed, REFINE the part code and retry.\n' +
      '- If a preview was generated, call scoreRender to get a visual quality score. If match < 0.6, use the issues list to refine the part and retry.\n' +
      '- Errors are specific: use the returned exception/report (e.g. triangle budget exceeded, parts missing, part failed) to change the code — do not just change the seed.\n' +
      '- At most 3 generation attempts total, then stop and summarize the best result or the failure.\n' +
      '- Check health once first if unsure Blender is available.\n' +
      '- When done, write a final summary: glbPath, bytes, part inventory (names + tri counts), attempts, and any caveat.\n' +
      '- You do NOT edit any Motion document. The caller places the file.',
    tools: {
      generateAuthoredAsset: generateAuthoredAssetTool,
      checkBlenderHealth: healthTool,
      scoreRender: scoreRenderTool,
    },
    stopWhen: [isStepCount(8)],
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
      'The caller then places it with blender.asset.import (which stages the file into the project bundle) as model.gltf.',
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
        const text = result.text?.trim() ?? '';
        // The authoritative GLB path comes from the specialist's own tool
        // results, not its free-text summary — an empty or path-less summary
        // must not turn a successful generation into `success: false` with
        // no way for the caller to place the file.
        type GenerationOutput = {
          success?: boolean;
          glbPath?: string;
          previewPath?: string;
          bytes?: number;
          error?: string;
        };
        const toolResults = (await result.toolResults) as Array<{
          toolName: string;
          output: GenerationOutput;
        }>;
        const generations = toolResults.filter(
          (entry) => entry.toolName === 'generateAuthoredAsset',
        );
        const succeeded = generations.filter((entry) => entry.output?.success && entry.output.glbPath);
        const latest = succeeded[succeeded.length - 1]?.output;
        const lastError = generations[generations.length - 1]?.output?.error;
        if (latest?.glbPath) {
          return {
            success: true,
            glbPath: latest.glbPath,
            previewPath: latest.previewPath,
            bytes: latest.bytes,
            attempts: generations.length,
            notes:
              text.slice(0, 1200) ||
              `Generated GLB at ${latest.glbPath} (${latest.bytes ?? 0} bytes) in ${generations.length} attempt(s).`,
          } as BlenderSpecialistResult;
        }
        return {
          success: false,
          attempts: generations.length,
          notes: (text || lastError || 'Blender specialist finished without producing a GLB.').slice(0, 1200),
        } as BlenderSpecialistResult;
      } catch (error) {
        return {
          success: false,
          attempts: 0,
          notes: error instanceof Error ? error.message : String(error),
        } as BlenderSpecialistResult;
      }
    },
    toModelOutput: ({ output }) => {
      const s = output as BlenderSpecialistResult;
      const lines = [s.notes];
      if (s.glbPath) lines.push(`glbPath: ${s.glbPath}`);
      if (s.previewPath) lines.push(`previewPath: ${s.previewPath}`);
      if (s.bytes != null) lines.push(`bytes: ${s.bytes}`);
      lines.push(`attempts: ${s.attempts}`);
      return { type: 'text' as const, value: lines.join('\n') };
    },
  });
}

export type BlenderSpecialistAgent = ReturnType<typeof createBlenderSpecialistAgent>;
export type BlenderSpecialistTool = ReturnType<typeof createBlenderSpecialistTool>;
