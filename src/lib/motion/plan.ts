import { applyMotionOps, batchRisk, requiresApproval, type MotionOpRequest, type MotionOpRisk } from './ops';
import { diffMotionDocuments, type MotionDocumentDiff } from './diff';
import type { MotionDocument } from './types';

export type MotionPlanWarning = { code: string; message: string };

export type MotionPlan = {
  planId: string;
  baseRevision: number;
  summary: string;
  ops: MotionOpRequest[];
  preview: MotionDocument;
  diff: MotionDocumentDiff;
  risk: MotionOpRisk;
  requiresApproval: boolean;
  warnings: MotionPlanWarning[];
  createdAt: string;
  expiresAt: string;
};

export type MotionApplyResult = {
  document: MotionDocument;
  revision: number;
  applied: number;
  diff: MotionDocumentDiff;
  warnings: MotionPlanWarning[];
};

export type MotionApplyOptions = {
  approvalToken?: string;
  confirmedDestructive?: boolean;
  now?: string;
};

const consumedPlans = new Set<string>();
const planTokens = new Map<string, string>();

function id(): string {
  return globalThis.crypto?.randomUUID?.() ?? `motion-plan-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function planMotionCommand(
  doc: MotionDocument,
  requests: readonly MotionOpRequest[],
  options: { now?: string; summary?: string } = {},
): MotionPlan {
  const createdAt = options.now ?? new Date().toISOString();
  const preview = applyMotionOps(doc, requests, { now: createdAt });
  const planId = id();
  const token = id();
  planTokens.set(planId, token);
  const expiresAt = new Date(new Date(createdAt).getTime() + 10 * 60_000).toISOString();
  return {
    planId,
    baseRevision: doc.revision,
    summary: options.summary ?? `${requests.length} motion operation${requests.length === 1 ? '' : 's'}`,
    ops: [...requests],
    preview,
    diff: diffMotionDocuments(doc, preview),
    risk: batchRisk(requests),
    requiresApproval: requiresApproval(requests),
    warnings: [],
    createdAt,
    expiresAt,
  };
}

export function mintMotionApprovalToken(plan: MotionPlan): string {
  return planTokens.get(plan.planId) ?? '';
}

export function applyMotionCommand(
  doc: MotionDocument,
  plan: MotionPlan,
  options: MotionApplyOptions = {},
): MotionApplyResult {
  const now = options.now ?? new Date().toISOString();
  if (consumedPlans.has(plan.planId)) throw new Error('MOTION_PLAN_CONSUMED: This plan has already been applied.');
  if (doc.revision !== plan.baseRevision) throw new Error('MOTION_REVISION_CONFLICT: The document changed since this plan was created.');
  if (new Date(now).getTime() > new Date(plan.expiresAt).getTime()) throw new Error('MOTION_PLAN_EXPIRED: This plan is no longer valid.');
  if (plan.requiresApproval && options.confirmedDestructive !== true) throw new Error('MOTION_APPROVAL_REQUIRED: Confirm the destructive change before applying it.');
  if (options.approvalToken !== planTokens.get(plan.planId)) throw new Error('MOTION_APPROVAL_TOKEN: This plan was not approved by the editor.');

  const next = applyMotionOps(doc, plan.ops, { now });
  consumedPlans.add(plan.planId);
  planTokens.delete(plan.planId);
  return { document: next, revision: next.revision, applied: plan.ops.length, diff: diffMotionDocuments(doc, next), warnings: plan.warnings };
}
