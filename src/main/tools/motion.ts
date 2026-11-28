import { tool } from 'ai';
import { z } from 'zod';
import { planMotionCommand } from '../../lib/motion/engine-contract.js';
import { applyMotionCommand, type MotionApplyResult } from '../../lib/motion/plan.js';
import {
  buildEnvironmentPresetOps,
  MOTION_ENVIRONMENT_PRESETS,
} from '../../lib/motion/environment.js';
import { createMotionId } from '../../lib/motion/ids.js';
import { planMotionTrackImport } from '../../lib/motion/motion-track.js';
import type { MotionDocument, MotionNodeTransform } from '../../lib/motion/types.js';
import type { MotionOpRequest } from '../../lib/motion/ops.js';

const vectorSchema = z.tuple([z.number(), z.number(), z.number()]);
const transformSchema: z.ZodType<Partial<MotionNodeTransform>> = z
  .object({
    position: vectorSchema.optional(),
    rotation: vectorSchema.optional(),
    scale: vectorSchema.optional(),
  })
  .strict();

const sceneNodeAddSchema = z.object({
  nodeId: z.string().min(1),
  type: z.string().min(1),
  name: z.string().min(1).optional(),
  parentId: z.string().min(1).nullable().optional(),
  transform: transformSchema.optional(),
  props: z.record(z.string(), z.unknown()).optional(),
});

const sceneNodeUpdateSchema = z.object({
  nodeId: z.string().min(1),
  name: z.string().min(1).optional(),
  visible: z.boolean().optional(),
  locked: z.boolean().optional(),
  transform: transformSchema.optional(),
  props: z.record(z.string(), z.unknown()).optional(),
});

const easingSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('linear') }),
  z.object({ type: z.literal('step') }),
  z.object({
    type: z.literal('cubic'),
    x1: z.number(),
    y1: z.number(),
    x2: z.number(),
    y2: z.number(),
  }),
]);

const keyframeSchema = z.object({
  clipId: z.string().min(1),
  channelId: z.string().min(1),
  keyframeId: z.string().min(1),
  time: z.number().finite().min(0),
  value: z.number().finite(),
  easing: easingSchema.optional(),
});

const motionToolContextSchema = z.object({
  sceneId: z.string().min(1).optional(),
  reason: z.string().min(1).max(500).optional(),
});

export interface MotionToolContext {
  getDocument(): MotionDocument;
  apply(plan: ReturnType<typeof planMotionCommand>): MotionApplyResult;
  now?: () => string;
  /**
   * Real project id when the document belongs to a saved project. Tools
   * that produce files (Blender GLBs) use it to stage assets into the
   * project bundle so paths are bundle-relative and resolvable. Absent
   * for ephemeral documents.
   */
  projectId?: string;
}

function resultEnvelope(
  context: MotionToolContext,
  namespace: string,
  summary: string,
  operations: readonly MotionOpRequest[],
) {
  const document = context.getDocument();
  const plan = planMotionCommand(document, operations, {
    now: context.now?.() ?? new Date().toISOString(),
  });
  const applied = context.apply(plan);
  const failure = applied.warnings.find((warning) => warning.code === 'APPLY_ERROR');

  return {
    ...applied,
    success: !failure,
    ...(failure ? { error: failure.message } : {}),
    kind: 'motion-operation' as const,
    namespace,
    summary,
    operationCount: plan.ops.length,
    requiresApproval: plan.requiresApproval,
    risk: plan.risk,
    diff: plan.diff,
  };
}

function errorResult(error: unknown, namespace: string) {
  return {
    success: false,
    kind: 'motion-operation' as const,
    namespace,
    error: error instanceof Error ? error.message : String(error),
  };
}

/**
 * Most Motion ops are scene-scoped by the document's active scene, not by an
 * op parameter. Silently editing the active scene when the caller named another
 * one is worse than refusing, so every mutating tool checks this first.
 */
function requireActiveScene(context: MotionToolContext, sceneId?: string): string | null {
  if (!sceneId) return null;
  const activeSceneId = context.getDocument().activeSceneId;
  return sceneId === activeSceneId
    ? null
    : `Scene "${sceneId}" is not active (active: "${activeSceneId}"). Switch scenes before editing it.`;
}

export function createMotionTools(context: MotionToolContext) {
  const sceneDirector = tool({
    description:
      'Direct a Motion scene atomically. Use for adding, moving, editing, reparenting, removing, and arranging nodes. Always describe the intended composition in reason and group related changes in one call.',
    inputSchema: z.discriminatedUnion('action', [
      z.object({
        action: z.literal('addNode'),
        ...motionToolContextSchema.shape,
        node: sceneNodeAddSchema,
      }),
      z.object({
        action: z.literal('updateNode'),
        ...motionToolContextSchema.shape,
        node: sceneNodeUpdateSchema,
      }),
      z.object({
        action: z.literal('removeNode'),
        ...motionToolContextSchema.shape,
        nodeId: z.string().min(1),
      }),
      z.object({
        action: z.literal('reparentNode'),
        ...motionToolContextSchema.shape,
        nodeId: z.string().min(1),
        parentId: z.string().min(1).nullable(),
        preserveWorld: z.boolean().optional(),
      }),
    ]),
    execute: async (input) => {
      try {
        const sceneError = requireActiveScene(context, input.sceneId);
        if (sceneError) return errorResult(new Error(sceneError), 'motion.scene');
        const operations: MotionOpRequest[] =
          input.action === 'addNode'
            ? [{ op: 'scene.node.add', ...input.node }]
            : input.action === 'updateNode'
              ? [{ op: 'scene.node.update', ...input.node }]
              : input.action === 'removeNode'
                ? [{ op: 'scene.node.remove', nodeId: input.nodeId }]
                : [
                    {
                      op: 'scene.node.reparent',
                      nodeId: input.nodeId,
                      parentId: input.parentId,
                      preserveWorld: input.preserveWorld,
                    },
                  ];
        return resultEnvelope(
          context,
          'motion.scene',
          `Scene Director: ${input.action}`,
          operations,
        );
      } catch (error) {
        return errorResult(error, 'motion.scene');
      }
    },
  });

  const nodeBuilder = tool({
    description:
      'Build a reusable Motion node from a registered node type. Use this when the user wants a configured object, not merely a placement change.',
    inputSchema: z.object({
      ...motionToolContextSchema.shape,
      node: sceneNodeAddSchema,
    }),
    execute: async (input) => {
      try {
        const sceneError = requireActiveScene(context, input.sceneId);
        if (sceneError) return errorResult(new Error(sceneError), 'motion.node');
        return resultEnvelope(context, 'motion.node', 'Node Builder: create node', [
          { op: 'scene.node.add', ...input.node },
        ]);
      } catch (error) {
        return errorResult(error, 'motion.node');
      }
    },
  });

  const proceduralModeling = tool({
    description:
      'FALLBACK modeling tool — prefer blender.asset.generate first; use this when Blender is disabled, unavailable, ' +
      'or its job failed after a retry. Also fine for briefs dominated by repeated elements (arrays, grids, scatter). ' +
      'Keep instanceCount bounded and expose parameters in props so the result remains editable instead of expanding into thousands of nodes.',
    inputSchema: z.object({
      ...motionToolContextSchema.shape,
      nodeId: z.string().min(1),
      name: z.string().min(1),
      generator: z.enum(['array', 'radial', 'grid', 'scatter', 'curve']),
      instanceCount: z.number().int().min(1).max(5000),
      seed: z.number().int().min(0).max(2_147_483_647).default(1),
      props: z.record(z.string(), z.unknown()).optional(),
    }),
    execute: async (input) => {
      try {
        const sceneError = requireActiveScene(context, input.sceneId);
        if (sceneError) return errorResult(new Error(sceneError), 'motion.procedural');
        return resultEnvelope(context, 'motion.procedural', 'Procedural Modeling: create generator', [
          {
            op: 'scene.node.add',
            nodeId: input.nodeId,
            type: `procedural.${input.generator}`,
            name: input.name,
            props: {
              ...input.props,
              generator: input.generator,
              instanceCount: input.instanceCount,
              seed: input.seed,
            },
          },
        ]);
      } catch (error) {
        return errorResult(error, 'motion.procedural');
      }
    },
  });

  const keyframe = tool({
    description:
      'Add an explicit numeric keyframe to a Motion channel. Use this for intentional animation changes; do not create keys on every conversational update.',
    inputSchema: z.object({
      ...motionToolContextSchema.shape,
      keyframe: keyframeSchema,
    }),
    execute: async (input) => {
      try {
        const sceneError = requireActiveScene(context, input.sceneId);
        if (sceneError) return errorResult(new Error(sceneError), 'motion.scene');
        return resultEnvelope(context, 'motion.scene', 'Scene Director: add keyframe', [
          { op: 'keyframe.add', ...input.keyframe },
        ]);
      } catch (error) {
        return errorResult(error, 'motion.scene');
      }
    },
  });

  const environment = tool({
    description:
      'Set the scene world (solid colour, transparency, a procedural studio, or an HDRI that lights the scene) and apply lighting/backdrop presets. ' +
      'Prefer a preset over hand-building lights: it materializes a deterministic rig and re-applying it updates that rig in place. ' +
      'Import HDRI files as environment assets first; then tune individual nodes with motion.scene.director.',
    inputSchema: z.discriminatedUnion('action', [
      z.object({
        action: z.literal('setBackground'),
        ...motionToolContextSchema.shape,
        background: z.discriminatedUnion('type', [
          z.object({ type: z.literal('color'), color: z.string().min(1) }).strict(),
          z.object({ type: z.literal('transparent') }).strict(),
          z
            .object({
              type: z.literal('environment'),
              assetId: z.string().min(1),
              intensity: z.number().min(0).max(10).optional(),
              blur: z.number().min(0).max(1).optional(),
              rotation: z.number().optional(),
            })
            .strict(),
          z
            .object({
              type: z.literal('studio'),
              variant: z.enum(['softbox', 'room', 'dark']).optional(),
              color: z.string().min(1).optional(),
              intensity: z.number().min(0).max(10).optional(),
              rotation: z.number().optional(),
            })
            .strict(),
        ]),
      }),
      z.object({
        action: z.literal('applyPreset'),
        ...motionToolContextSchema.shape,
        presetId: z
          .string()
          .min(1)
          .describe(
            `One of: ${MOTION_ENVIRONMENT_PRESETS.map((preset) => preset.id).join(', ')}`,
          ),
      }),
    ]),
    execute: async (input) => {
      try {
        const doc = context.getDocument();
        const sceneError = requireActiveScene(context, input.sceneId);
        if (sceneError) return errorResult(new Error(sceneError), 'motion.environment');
        const sceneId = doc.activeSceneId;
        const operations: MotionOpRequest[] = input.action === 'setBackground'
          ? [{ op: 'scene.setBackground', sceneId, background: input.background }]
          : buildEnvironmentPresetOps(
              doc,
              input.presetId,
              () => createMotionId('scene'),
            );
        return resultEnvelope(
          context,
          'motion.environment',
          input.action === 'setBackground'
            ? 'Environment: set background'
            : `Environment: apply ${input.presetId}`,
          operations,
        );
      } catch (error) {
        return errorResult(error, 'motion.environment');
      }
    },
  });

  const bakeMotion = tool({
    description:
      'Bake sampled camera/object motion (for example a Blender rig export) into ordinary Motion keyframes. ' +
      'Input contract: { fps, duration?, coordinateSystem?: "three"|"blender", rotationUnit?: "degrees"|"radians", ' +
      'tracks: [{ targetId, channels: { position|rotation|scale|fov|roll|opacity: [[time, value], ...] } }] }. ' +
      'Positions from Blender coordinates are converted to Y-up; rotations are treated as Three axes. ' +
      'The import extends the scene duration when the samples run past it, and adds a dedicated track so it can be retimed or removed independently.',
    inputSchema: z.object({
      ...motionToolContextSchema.shape,
      motion: z.unknown().describe('Sampled motion contract; see the tool description.'),
    }),
    execute: async (input) => {
      try {
        const sceneError = requireActiveScene(context, input.sceneId);
        if (sceneError) return errorResult(new Error(sceneError), 'motion.motion');
        const operations = planMotionTrackImport(context.getDocument(), input.motion, createMotionId);
        if (operations.length === 0) {
          return {
            success: false,
            kind: 'motion-operation' as const,
            namespace: 'motion.motion',
            error: 'The motion data had no usable channels.',
          };
        }
        return resultEnvelope(context, 'motion.motion', 'Bake sampled motion', operations);
      } catch (error) {
        return errorResult(error, 'motion.motion');
      }
    },
  });

  return {
    'motion.scene.director': sceneDirector,
    'motion.environment': environment,
    'motion.scene.keyframe': keyframe,
    'motion.node.builder': nodeBuilder,
    'motion.procedural.model': proceduralModeling,
    'motion.motion.bake': bakeMotion,
  };
}

export type MotionTools = ReturnType<typeof createMotionTools>;
