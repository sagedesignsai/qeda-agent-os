import { z } from 'zod';

import { listMotionNodeTypes } from './node-registry';
import { applyMotionOps, listMotionOps, type MotionOpRequest } from './ops';
import { applyMotionCommand as applyPlanned, planMotionCommand as createPlan, type MotionPlan } from './plan';
import { MOTION_SCHEMA_VERSION } from './types';
import type { MotionDocument } from './types';
import type { MotionRuntimeDefinition, MotionRuntimeEvent, MotionRuntimeInputs, MotionRuntimeState } from './runtime';

export class MotionCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MotionCommandError';
  }
}

export type MotionEngineManifest = {
  contractVersion: 2;
  engine: 'qeda-motion';
  documentSchemaVersion: number;
  nodes: ReturnType<typeof listMotionNodeTypes>;
  operations: Array<{
    id: string;
    summary: string;
    risk: string;
    sceneScoped: boolean;
    parameters: Record<string, unknown>;
    since: string;
    deprecated?: boolean;
  }>;
  recipes: Array<{ id: string; label: string; description: string; params: Record<string, unknown> }>;
  runtime: {
    inputs: string;
    state: string;
    events: string;
    definitions: string;
    deterministic: true;
    contextTypes: {
      inputs: MotionRuntimeInputs;
      state: MotionRuntimeState;
      events: MotionRuntimeEvent[];
      definition: MotionRuntimeDefinition;
    };
  };
};

function jsonSchema(params: z.ZodType): Record<string, unknown> {
  return z.toJSONSchema(params) as Record<string, unknown>;
}

export function describeMotionEngine(): MotionEngineManifest {
  return {
    contractVersion: 2,
    engine: 'qeda-motion',
    documentSchemaVersion: MOTION_SCHEMA_VERSION,
    nodes: listMotionNodeTypes(),
    operations: listMotionOps().map((operation) => ({
      id: operation.id,
      summary: operation.summary,
      risk: operation.risk,
      sceneScoped: operation.id.startsWith('scene.') || operation.id.startsWith('timeline.') || operation.id.startsWith('track.') || operation.id.startsWith('clip.') || operation.id.startsWith('placement.') || operation.id.startsWith('channel.') || operation.id.startsWith('keyframe.'),
      parameters: jsonSchema(operation.params),
      since: 'motion-2/phase-1.5',
      ...(operation.id === 'timeline.setLoop' ? { deprecated: true } : {}),
    })),
    recipes: [],
    runtime: {
      inputs: 'Explicit boolean, number, and string inputs.',
      state: 'Serializable runtime state kept separate from editor state.',
      events: 'Ordered typed events supplied by the host runtime.',
      definitions: 'State-machine definitions are additive and renderer-independent.',
      deterministic: true,
      contextTypes: {
        inputs: {},
        state: {},
        events: [],
        definition: { id: 'runtime-definition', initialState: 'initial', states: ['initial'], transitions: [] },
      },
    },
  };
}

export const createMotionEngineManifest = describeMotionEngine;

export function planMotionCommand(
  doc: MotionDocument,
  requests: readonly MotionOpRequest[],
  options: { now?: string; summary?: string } = {},
): MotionPlan {
  try {
    return createPlan(doc, requests, options);
  } catch (error) {
    throw new MotionCommandError(error instanceof Error ? error.message : String(error));
  }
}

export function applyMotionCommand(
  doc: MotionDocument,
  command: readonly MotionOpRequest[] | MotionPlan,
  options: { now?: string; approved?: boolean; approvalToken?: string; confirmedDestructive?: boolean } = {},
): { document: MotionDocument; revision: number; applied: number; diff?: MotionPlan['diff'] } {
  const commandIsOps = Array.isArray(command);
  const plan: MotionPlan = commandIsOps
    ? planMotionCommand(doc, command as readonly MotionOpRequest[], { now: options.now })
    : (command as MotionPlan);
  if (plan.requiresApproval && options.approved !== true && options.confirmedDestructive !== true) {
    throw new MotionCommandError('MOTION_APPROVAL_REQUIRED: Confirm the destructive change before applying it.');
  }
  try {
    if (commandIsOps) {
      const requests = command as readonly MotionOpRequest[];
      const document = applyMotionOps(doc, requests, { now: options.now });
      return { document, revision: document.revision, applied: requests.length, diff: plan.diff };
    }
    return applyPlanned(doc, command as MotionPlan, {
      now: options.now,
      approvalToken: options.approvalToken,
      confirmedDestructive: options.confirmedDestructive ?? options.approved,
    });
  } catch (error) {
    throw new MotionCommandError(error instanceof Error ? error.message : String(error));
  }
}

