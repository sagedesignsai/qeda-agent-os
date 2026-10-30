/**
 * lib/motion/engine-contract.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Versioned, JSON-serializable discovery and execution surface for AI clients,
 * editor integrations, and future MCP tools.
 */

import { z } from 'zod';

import { listMotionNodeTypes } from './node-registry';
import {
  applyMotionOps,
  batchRisk,
  listMotionOps,
  type MotionOpRequest,
  type MotionOpRisk,
} from './ops';
import { MOTION_SCHEMA_VERSION, type MotionDocument } from './types';

export const MOTION_ENGINE_CONTRACT_VERSION = 1;

export type MotionEngineManifest = {
  contractVersion: number;
  engine: string;
  documentSchemaVersion: number;
  nodes: ReturnType<typeof listMotionNodeTypes>;
  operations: Array<{
    id: string;
    summary: string;
    risk: MotionOpRisk;
    parameters: Record<string, unknown>;
  }>;
};

export function describeMotionEngine(): MotionEngineManifest {
  return {
    contractVersion: MOTION_ENGINE_CONTRACT_VERSION,
    engine: 'qeda-motion',
    documentSchemaVersion: MOTION_SCHEMA_VERSION,
    nodes: listMotionNodeTypes(),
    operations: listMotionOps().map(({ id, summary, risk, params }) => {
      const parameters = z.toJSONSchema(params) as Record<string, unknown>;
      return {
        id,
        summary,
        risk,
        parameters: { ...parameters, additionalProperties: false },
      };
    }),
  };
}

export type MotionCommandResult = {
  document: MotionDocument;
  risk: MotionOpRisk;
  requiresApproval: boolean;
};

export class MotionCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MotionCommandError';
  }
}

export type MotionCommandPlan = {
  preview: MotionDocument;
  risk: MotionOpRisk;
  requiresApproval: boolean;
};

export function planMotionCommand(
  doc: MotionDocument,
  requests: readonly MotionOpRequest[],
  options: { now?: string; approved?: boolean } = {},
): MotionCommandPlan {
  const risk = batchRisk(requests);
  return {
    preview: applyMotionOps(doc, requests, options),
    risk,
    requiresApproval: risk === 'destructive',
  };
}

export function applyMotionCommand(
  doc: MotionDocument,
  requests: readonly MotionOpRequest[],
  options: { now?: string; approved?: boolean } = {},
): MotionCommandResult {
  const plan = planMotionCommand(doc, requests, options);
  if (plan.requiresApproval && !options.approved) {
    throw new MotionCommandError('This Motion command is destructive and requires user approval.');
  }
  return {
    document: plan.preview,
    risk: plan.risk,
    requiresApproval: plan.requiresApproval,
  };
}
