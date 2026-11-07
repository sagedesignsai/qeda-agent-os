/**
 * main/tools/blender.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * `generateBlenderAsset` — the Model Builder's only Blender entry point.
 * Deterministic template path (no LLM-authored bpy). On success it registers
 * a Motion asset + places it as `model.gltf` via the existing ops pipeline,
 * so the renderer, inspector, animation, and export all work unchanged.
 */

import { tool } from 'ai';
import { z } from 'zod';
import type { MotionToolContext } from './motion';
import { planMotionCommand } from '../../lib/motion/engine-contract.js';
import { describeMotionEngine } from '../../lib/motion/engine-contract.js';
import { getSettings } from '../ai/settings';
import { runBlenderJob } from '../blender/runner';

export function createBlenderTools(context: MotionToolContext) {
  const generateBlenderAsset = tool({
    description:
      'Generate a bespoke 3D asset with headless Blender (5.2 LTS, templated, deterministic) and place it in the scene. ' +
      'Use when the model needs bespoke geometry or materials that primitives/procedural cannot express (e.g. a "sci-fi barrel with metal rings"). ' +
      'After generating, place it with motion.scene.director as model.gltf using the returned assetId.',
    inputSchema: z.object({
      brief: z.string().min(3).max(240).describe('Short noun-phrase brief, e.g. "sci-fi barrel with metal rings".'),
      style: z.enum(['lowpoly', 'pbr', 'stylized']).default('pbr').describe('Material style.'),
      seed: z.number().int().min(0).max(2_147_483_647).default(1).describe('Seed for reproducible output.'),
      name: z.string().min(1).max(80).optional().describe('Node name (defaults to brief).'),
      nodeId: z.string().min(1).describe('Node id for the placed model.gltf node.'),
      transform: z
        .object({
          position: z.tuple([z.number(), z.number(), z.number()]).optional(),
          rotation: z.tuple([z.number(), z.number(), z.number()]).optional(),
          scale: z.tuple([z.number(), z.number(), z.number()]).optional(),
        })
        .optional(),
    }),
    execute: async ({ brief, style, seed, name, nodeId, transform }) => {
      if (getSettings().blender?.enabled === false) {
        return {
          success: false,
          kind: 'blender-asset' as const,
          error: 'Blender asset generation is disabled in Settings. Use motion.procedural.model or primitives.',
        };
      }

      const job = await runBlenderJob({ brief, style, seed });
      if (!job.success || !job.glbPath) {
        return {
          success: false,
          kind: 'blender-asset' as const,
          error: job.error ?? 'Blender job failed.',
          excerpt: job.excerpt,
        };
      }

      const assetId = `blender-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const nodeName = name ?? brief.slice(0, 80);

      try {
        const document = context.getDocument();
        const plan = planMotionCommand(
          document,
          [
            {
              op: 'asset.add',
              asset: {
                id: assetId,
                name: nodeName,
                kind: 'model' as const,
                mimeType: 'model/gltf-binary',
                path: job.glbPath,
                hash: 'blender-headless',
                byteSize: job.bytes ?? 0,
                createdAt: new Date().toISOString(),
                metadata: { brief, style, seed, generatedBy: 'blender-5.2-headless' },
              },
            },
            {
              op: 'scene.node.add',
              nodeId,
              type: 'model.gltf',
              name: nodeName,
              transform,
              props: { assetId, castShadow: true, receiveShadow: true },
            },
          ] as never,
          { now: new Date().toISOString() },
        );
        const applied = context.apply(plan);
        return {
          success: true,
          kind: 'blender-asset' as const,
          assetId,
          nodeId,
          bytes: job.bytes,
          manifest: describeMotionEngine(),
          ...applied,
        };
      } catch (error) {
        return {
          success: false,
          kind: 'blender-asset' as const,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });

  return { 'blender.asset.generate': generateBlenderAsset };
}

export type BlenderTools = ReturnType<typeof createBlenderTools>;
