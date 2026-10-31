import { tool } from 'ai';
import { z } from 'zod';
import {
  describeMotionEngine,
  planMotionCommand,
} from '@/lib/motion/engine-contract';
import { applyMotionCommand, type MotionApplyResult } from '@/lib/motion/plan';
import type { MotionDocument, MotionNodeTransform } from '@/lib/motion/types';
import type { MotionOpRequest } from '@/lib/motion/ops';

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

  return {
    ...applied,
    kind: 'motion-operation' as const,
    namespace,
    summary,
    operationCount: plan.ops.length,
    requiresApproval: plan.requiresApproval,
    risk: plan.risk,
    diff: plan.diff,
    manifest: describeMotionEngine(),
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
      'Create a deterministic procedural Motion node. Keep instanceCount bounded and expose parameters in props so the result remains editable instead of expanding into thousands of nodes.',
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
        return resultEnvelope(context, 'motion.scene', 'Scene Director: add keyframe', [
          { op: 'keyframe.add', ...input.keyframe },
        ]);
      } catch (error) {
        return errorResult(error, 'motion.scene');
      }
    },
  });

  return {
    'motion.scene.director': sceneDirector,
    'motion.scene.keyframe': keyframe,
    'motion.node.builder': nodeBuilder,
    'motion.procedural.model': proceduralModeling,
  };
}

export type MotionTools = ReturnType<typeof createMotionTools>;
