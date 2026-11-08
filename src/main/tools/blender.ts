/**
 * main/tools/blender.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Blender tools for the Model Builder.
 *
 *  - `blender.asset.generate`: the default entry point. With a `part` (LLM-
 *    authored mesh-building bpy code) it runs the deterministic harness with
 *    tiered validation (static gate → run → report → GLB structural gate) and
 *    registers + places the GLB via the existing ops pipeline. Without a
 *    `part` it falls back to the legacy fixed template (v1 compat).
 *  - `blender.asset.import`: places an *existing* GLB/GLTF file from disk —
 *    the bridge back from MCP live-session work into the Motion document.
 */

import { tool } from 'ai';
import { z } from 'zod';
import { stat } from 'node:fs/promises';
import type { MotionToolContext } from './motion';
import { planMotionCommand } from '../../lib/motion/engine-contract.js';
import { describeMotionEngine } from '../../lib/motion/engine-contract.js';
import { getSettings } from '../ai/settings';
import { runBlenderJob, runAuthoredBlenderJob, type BlenderReport } from '../blender/runner';
import { getMotionAssetStore } from '../motion/service';
import type { MotionAsset } from '../../lib/motion/types';

const nodePlacementSchema = {
  name: z.string().min(1).max(80).optional().describe('Node name (defaults to brief).'),
  nodeId: z.string().min(1).describe('Node id for the placed model.gltf node.'),
  transform: z
    .object({
      position: z.tuple([z.number(), z.number(), z.number()]).optional(),
      rotation: z.tuple([z.number(), z.number(), z.number()]).optional(),
      scale: z.tuple([z.number(), z.number(), z.number()]).optional(),
    })
    .optional(),
} as const;

/**
 * Build the ops that register a model asset and place it as `model.gltf`.
 *
 * `asset.add` takes the MotionAsset fields FLAT on the op
 * (`{ op: 'asset.add', id, name, kind, ... }`, per `MotionOpParams` in
 * lib/motion/ops.ts) — wrapping them in an `asset: {}` key leaves `id`
 * undefined and fails validation after the GLB was already generated.
 * Exported so the placement shape has a regression test.
 */
export function buildBlenderPlacementOps(args: {
  assetId: string;
  path: string;
  nodeName: string;
  nodeId: string;
  transform?: unknown;
  metadata: Record<string, unknown>;
  bytes?: number;
  mimeType?: string;
  hash?: string;
}) {
  return [
    {
      op: 'asset.add',
      id: args.assetId,
      name: args.nodeName,
      kind: 'model',
      mimeType: args.mimeType ?? 'model/gltf-binary',
      path: args.path,
      // Document schema (lib/motion/schema.ts) allows only '', 'builtin',
      // or a 64-char hex digest for asset hashes — free-form labels like
      // 'blender-headless' fail ASSET_HASH validation. Provenance lives
      // in `metadata` instead; '' means "not a bundled asset".
      hash: args.hash ?? '',
      byteSize: args.bytes ?? 0,
      createdAt: new Date().toISOString(),
      metadata: args.metadata,
    },
    {
      op: 'scene.node.add',
      nodeId: args.nodeId,
      type: 'model.gltf',
      name: args.nodeName,
      transform: args.transform,
      props: { assetId: args.assetId, castShadow: true, receiveShadow: true },
    },
  ] as never;
}

/**
 * Stage a generated/imported GLB into the project bundle via the standard
 * asset pipeline (stage → commit), returning the committed asset record
 * with a bundle-relative path and a real content hash.
 *
 * This is required for the model to actually render and survive save:
 * `asset.path` must be bundle-relative (`assets/<id>/source.glb`) per
 * lib/motion/schema.ts, and `qeda-media://` resolution only serves
 * bundle assets. Registering the raw absolute job path
 * (`userData/blender-jobs/<run>/output.glb`) fails ASSET_PATH_NOT_RELATIVE
 * validation and can never be resolved by the renderer.
 *
 * Returns null when staging is unavailable (no project id) or fails;
 * callers fall back to direct registration (ephemeral preview only).
 */
async function stageModelIntoProject(
  projectId: string,
  sourcePath: string,
): Promise<MotionAsset | null> {
  try {
    const store = getMotionAssetStore();
    const staged = await store.stageAssets(projectId, [sourcePath]);
    if (!staged.items.length || staged.errors.length) return null;
    const committed = await store.commitAssets(projectId, [
      { importId: staged.items[0].importId, kind: 'model' },
    ]);
    if (!committed.assets.length || committed.errors.length) return null;
    return committed.assets[0];
  } catch {
    return null;
  }
}

/** Shared asset+node placement through the ops pipeline (never throws). */
const placeAsset = (
  ctx: MotionToolContext,
  args: {
    path: string;
    nodeName: string;
    nodeId: string;
    transform?: unknown;
    metadata: Record<string, unknown>;
    bytes?: number;
    mimeType?: string;
    hash?: string;
    /** Pre-staged asset id (from stageModelIntoProject); generated when omitted. */
    assetId?: string;
  },
): {
  assetId: string;
  applied?: ReturnType<MotionToolContext['apply']>;
  error?: string;
} => {
  const assetId =
    args.assetId ?? `blender-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  try {
    const plan = planMotionCommand(
      ctx.getDocument(),
      buildBlenderPlacementOps({ ...args, assetId }),
      { now: new Date().toISOString() },
    );
    return { assetId, applied: ctx.apply(plan) };
  } catch (error) {
    return {
      assetId,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

export function createBlenderTools(context: MotionToolContext) {
  const generateBlenderAsset = tool({
    description:
      'PREFERRED first choice for creating model geometry: run an AI-authored Blender script in the sandboxed harness and place the result as model.gltf. ' +
      'Supply a `part` — mesh-building bpy code (use the mat/link/primitive helpers; scene setup, grounding, export and preview are harness-owned). ' +
      'Fall back to motion.procedural.model only when Blender is disabled, unavailable, or fails after refining the part code (errors return the part\'s own exception + validation report so you can fix and retry). ' +
      '(e.g. a "sci-fi barrel with metal rings").',
    inputSchema: z.object({
      brief: z.string().min(3).max(240).describe('Short noun-phrase brief, e.g. "sci-fi barrel with metal rings".'),
      part: z
        .string()
        .min(1)
        .max(32_000)
        .optional()
        .describe(
          'Mesh-building bpy code (the PART). Must create mesh objects and assign materials via the helpers (`mat`, `link`, `primitive`); ' +
          'no imports of os/subprocess/socket, no file/export ops, no `while` loops — the harness owns those. Seed random is already seeded.',
        ),
      style: z.enum(['lowpoly', 'pbr', 'stylized']).default('pbr').describe('Material style.'),
      seed: z.number().int().min(0).max(2_147_483_647).default(1).describe('Seed for reproducible output.'),
      ...nodePlacementSchema,
    }),
    execute: async ({ brief, part, style, seed, name, nodeId, transform }) => {
      if (getSettings().blender?.enabled === false) {
        return {
          success: false,
          kind: 'blender-asset' as const,
          error: 'Blender asset generation is disabled in Settings. Use motion.procedural.model or primitives.',
        };
      }

      const authoredAllowed = getSettings().blender?.authoredGeneration !== 'off';

      // ── Authored path (default when the model supplies a PART) ──
      if (part && authoredAllowed) {
        const nodeName = name ?? brief.slice(0, 80);
        const job = await runAuthoredBlenderJob({ part, brief, style, seed });
        if (!job.success || !job.glbPath) {
          const report = job.report as BlenderReport | undefined;
          return {
            success: false,
            kind: 'blender-asset' as const,
            generatedBy: 'authored' as const,
            error: job.error ?? 'Authored Blender job failed.',
            excerpt: job.excerpt,
            stderrTail: job.stderrTail,
            // Structured report (tri counts, part inventory) lets the agent
            // self-correct: e.g. trim triangle/segment counts to the budget.
            report,
          };
        }

        const staged = context.projectId
          ? await stageModelIntoProject(context.projectId, job.glbPath)
          : null;
        if (context.projectId && !staged) {
          return {
            success: false,
            kind: 'blender-asset' as const,
            generatedBy: 'authored' as const,
            error:
              'Generated GLB could not be staged into the project bundle. ' +
              `Source file: ${job.glbPath}`,
            report: job.report,
          };
        }
        const placed = placeAsset(context, {
          path: staged?.path ?? job.glbPath,
          nodeName,
          nodeId,
          transform,
          bytes: staged?.byteSize ?? job.bytes,
          mimeType: staged?.mimeType,
          hash: staged?.hash,
          assetId: staged?.id,
          metadata: {
            brief,
            style,
            seed,
            generatedBy: 'blender-5.2-authored',
            previewPath: job.previewPath,
            report: job.report,
            sourceGlbPath: job.glbPath,
          },
        });
        if ('error' in placed && placed.error) {
          return {
            success: false,
            kind: 'blender-asset' as const,
            generatedBy: 'authored' as const,
            error: placed.error,
            report: job.report,
          };
        }
        return {
          success: true,
          kind: 'blender-asset' as const,
          generatedBy: 'authored' as const,
          assetId: placed.assetId,
          nodeId,
          bytes: job.bytes,
          previewPath: job.previewPath,
          report: job.report,
          manifest: describeMotionEngine(),
          ...placed.applied,
        };
      }

      // ── Legacy template path (no PART, or authored generation off) ──
      const job = await runBlenderJob({ brief, style, seed });
      if (!job.success || !job.glbPath) {
        return {
          success: false,
          kind: 'blender-asset' as const,
          generatedBy: 'template' as const,
          error: job.error ?? 'Blender job failed.',
          excerpt: job.excerpt,
        };
      }

      const nodeName = name ?? brief.slice(0, 80);
      const staged = context.projectId
        ? await stageModelIntoProject(context.projectId, job.glbPath)
        : null;
      if (context.projectId && !staged) {
        return {
          success: false,
          kind: 'blender-asset' as const,
          generatedBy: 'template' as const,
          error:
            'Generated GLB could not be staged into the project bundle. ' +
            `Source file: ${job.glbPath}`,
        };
      }
      const placed = placeAsset(context, {
        path: staged?.path ?? job.glbPath,
        nodeName,
        nodeId,
        transform,
        bytes: staged?.byteSize ?? job.bytes,
        mimeType: staged?.mimeType,
        hash: staged?.hash,
        assetId: staged?.id,
        metadata: {
          brief,
          style,
          seed,
          generatedBy: 'blender-5.2-headless-template',
          previewPath: job.previewPath,
          sourceGlbPath: job.glbPath,
        },
      });
      if (placed.error) {
        return {
          success: false,
          kind: 'blender-asset' as const,
          generatedBy: 'template' as const,
          error: placed.error,
        };
      }
      return {
        success: true,
        kind: 'blender-asset' as const,
        generatedBy: 'template' as const,
        assetId: placed.assetId,
        nodeId,
        bytes: job.bytes,
        previewPath: job.previewPath,
        manifest: describeMotionEngine(),
        ...placed.applied,
      };
    },
  });

  /**
   * `blender.asset.import` — places an *existing* .glb/.gltf file from disk
   * into the scene. Companion to the MCP-for-Blender tools: those drive a
   * live Blender session (which can export a GLB), but they cannot touch the
   * Motion document. This tool is the bridge back: register the file as a
   * Motion asset + place it as model.gltf via the ops pipeline.
   */
  const importBlenderAsset = tool({
    description:
      'Place an existing GLB/GLTF file from disk into the scene as model.gltf. ' +
      'Use after generating geometry through the live Blender MCP tools (mcp_*): export the result from the live Blender session ' +
      '(e.g. bpy.ops.export_scene.gltf) and then import it here. Also useful for user-provided asset files.',
    inputSchema: z.object({
      glbPath: z
        .string()
        .min(1)
        .describe('Absolute path to a .glb or .gltf file on disk.'),
      name: z.string().min(1).max(80).optional().describe('Node/asset name.'),
      nodeId: z.string().min(1).describe('Node id for the placed model.gltf node.'),
      transform: z
        .object({
          position: z.tuple([z.number(), z.number(), z.number()]).optional(),
          rotation: z.tuple([z.number(), z.number(), z.number()]).optional(),
          scale: z.tuple([z.number(), z.number(), z.number()]).optional(),
        })
        .optional(),
    }),
    execute: async ({ glbPath, name, nodeId, transform }) => {
      try {
        const fileStat = await stat(glbPath);
        if (!fileStat.isFile()) {
          return {
            success: false,
            kind: 'blender-asset' as const,
            error: `Not a file: ${glbPath}`,
          };
        }

        const isGltf = glbPath.toLowerCase().endsWith('.gltf');
        const nodeName = name ?? glbPath.split('/').pop() ?? 'imported asset';
        const staged = context.projectId
          ? await stageModelIntoProject(context.projectId, glbPath)
          : null;
        if (context.projectId && !staged) {
          return {
            success: false,
            kind: 'blender-asset' as const,
            error: `Could not stage ${glbPath} into the project bundle.`,
          };
        }
        const placed = placeAsset(context, {
          path: staged?.path ?? glbPath,
          nodeName,
          nodeId,
          transform,
          bytes: staged?.byteSize ?? fileStat.size,
          mimeType: staged?.mimeType ?? (isGltf ? 'model/gltf+json' : 'model/gltf-binary'),
          hash: staged?.hash,
          assetId: staged?.id,
          metadata: {
            importedBy: 'blender-asset-import',
            sourcePath: glbPath,
          },
        });
        if (placed.error) {
          return {
            success: false,
            kind: 'blender-asset' as const,
            error: placed.error,
          };
        }
        return {
          success: true,
          kind: 'blender-asset' as const,
          source: 'import',
          assetId: placed.assetId,
          nodeId,
          bytes: fileStat.size,
          manifest: describeMotionEngine(),
          ...placed.applied,
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

  return {
    'blender.asset.generate': generateBlenderAsset,
    'blender.asset.import': importBlenderAsset,
  };
}

export type BlenderTools = ReturnType<typeof createBlenderTools>;
