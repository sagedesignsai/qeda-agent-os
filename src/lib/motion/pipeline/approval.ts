import { MotionDocument, MotionOpRequest, MotionPlan } from '../types';
import { PipelineExecutionResult } from './types';
import { MotionPipeline } from './types';

/**
 * Approval level determines how a pipeline execution is handled
 */
export type ApprovalLevel = 'auto-approve' | 'requires-review' | 'requires-approval';

/**
 * Changed assets tracked in a pipeline execution
 */
export interface ChangedAssets {
  createdNodes: string[];
  modifiedNodes: string[];
  deletedNodes: string[];
  createdClips: string[];
  modifiedClips: string[];
  deletedClips: string[];
  createdTracks: string[];
  modifiedTracks: string[];
  deletedTracks: string[];
  createdAssets: string[];
  modifiedAssets: string[];
  deletedAssets: string[];
}

/**
 * Pipeline approval metadata attached to MotionPlan
 */
export interface PipelineApprovalMetadata {
  pipelineId: string;
  pipelineName: string;
  pipelineDescription?: string;
  approvalLevel: ApprovalLevel;
  changeDescription: string;
  changedAssets: ChangedAssets;
  opsCount: number;
  opsPreview: string[];
  riskClassification: 'safe' | 'mutating' | 'destructive';
  requiredReason: string;
}

/**
 * Convert pipeline execution result to MotionPlan for approval gating
 *
 * @param result - Pipeline execution result with ops
 * @param pipeline - Original pipeline definition
 * @param docBefore - Document before execution (for diff)
 * @returns MotionPlan ready for approval workflow
 */
export function pipelineToMotionPlan(
  result: PipelineExecutionResult,
  pipeline: MotionPipeline,
  docBefore: MotionDocument
): MotionPlan {
  const changedAssets = extractChangedAssets(docBefore, result.ops);
  const changeDescription = describePipelineChanges(result, changedAssets);
  const approvalLevel = getApprovalLevel(result.risk);
  const opsPreview = result.ops.slice(0, 5).map(previewOp);

  // Build metadata
  const metadata: PipelineApprovalMetadata = {
    pipelineId: pipeline.id,
    pipelineName: pipeline.name,
    pipelineDescription: pipeline.description,
    approvalLevel,
    changeDescription,
    changedAssets,
    opsCount: result.ops.length,
    opsPreview,
    riskClassification: result.risk,
    requiredReason: getApprovalReason(result.risk),
  };

  // Create plan
  const plan: MotionPlan = {
    id: `pipeline-${pipeline.id}-${Date.now()}`,
    name: `Execute pipeline: ${pipeline.name}`,
    description: changeDescription,
    ops: result.ops,
    risk: result.risk,
    requiresApproval: result.requiresApproval,
    version: 1,
    metadata: {
      source: 'pipeline',
      pipeline: metadata,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return plan;
}

/**
 * Generate human-readable description of pipeline changes
 *
 * @param result - Pipeline execution result
 * @param changedAssets - Tracked changes
 * @returns Human-friendly description of what will change
 */
export function describePipelineChanges(
  result: PipelineExecutionResult,
  changedAssets: ChangedAssets
): string {
  const parts: string[] = [];

  // Total ops
  parts.push(`${result.ops.length} operation${result.ops.length !== 1 ? 's' : ''}`);

  // Asset counts
  const totalCreated =
    changedAssets.createdNodes.length +
    changedAssets.createdClips.length +
    changedAssets.createdTracks.length +
    changedAssets.createdAssets.length;

  const totalModified =
    changedAssets.modifiedNodes.length +
    changedAssets.modifiedClips.length +
    changedAssets.modifiedTracks.length +
    changedAssets.modifiedAssets.length;

  const totalDeleted =
    changedAssets.deletedNodes.length +
    changedAssets.deletedClips.length +
    changedAssets.deletedTracks.length +
    changedAssets.deletedAssets.length;

  if (totalCreated > 0) {
    parts.push(`Create ${totalCreated} asset${totalCreated !== 1 ? 's' : ''}`);
  }
  if (totalModified > 0) {
    parts.push(`Modify ${totalModified} asset${totalModified !== 1 ? 's' : ''}`);
  }
  if (totalDeleted > 0) {
    parts.push(`Delete ${totalDeleted} asset${totalDeleted !== 1 ? 's' : ''}`);
  }

  // Execution metadata
  if (result.metadata) {
    if (result.metadata.branchesEvaluated > 0) {
      parts.push(`Evaluate ${result.metadata.branchesEvaluated} branch${result.metadata.branchesEvaluated !== 1 ? 'es' : ''}`);
    }
    if (result.metadata.loopsIterated > 0) {
      parts.push(`Execute ${result.metadata.loopsIterated} loop${result.metadata.loopsIterated !== 1 ? 's' : ''}`);
    }
  }

  return parts.join(', ');
}

/**
 * Classify approval requirement based on risk level
 *
 * @param risk - Risk classification from execution
 * @returns Approval level needed
 */
export function getApprovalLevel(risk: 'safe' | 'mutating' | 'destructive'): ApprovalLevel {
  switch (risk) {
    case 'safe':
      return 'auto-approve';
    case 'mutating':
      return 'requires-review';
    case 'destructive':
      return 'requires-approval';
    default:
      // Fail safe
      return 'requires-approval';
  }
}

/**
 * Get human-readable reason for approval requirement
 *
 * @param risk - Risk classification
 * @returns Reason string for UI
 */
export function getApprovalReason(risk: 'safe' | 'mutating' | 'destructive'): string {
  switch (risk) {
    case 'safe':
      return 'Safe operations can be applied automatically';
    case 'mutating':
      return 'Mutating operations should be reviewed';
    case 'destructive':
      return 'Destructive operations require explicit approval';
    default:
      return 'Review required before applying';
  }
}

/**
 * Extract changed assets from operation list for diff visualization
 *
 * @param docBefore - Document state before ops
 * @param ops - Motion operations to be applied
 * @returns Structured change tracking
 */
export function extractChangedAssets(
  docBefore: MotionDocument,
  ops: MotionOpRequest[]
): ChangedAssets {
  const changed: ChangedAssets = {
    createdNodes: [],
    modifiedNodes: [],
    deletedNodes: [],
    createdClips: [],
    modifiedClips: [],
    deletedClips: [],
    createdTracks: [],
    modifiedTracks: [],
    deletedTracks: [],
    createdAssets: [],
    modifiedAssets: [],
    deletedAssets: [],
  };

  // Track IDs before execution
  const nodesBefore = new Set(
    docBefore.scene?.nodes?.map((n: any) => n.id) || []
  );
  const clipsBefore = new Set(
    docBefore.timeline?.clips?.map((c: any) => c.id) || []
  );
  const tracksBefore = new Set(
    docBefore.timeline?.tracks?.map((t: any) => t.id) || []
  );
  const assetsBefore = new Set(
    docBefore.assets?.models?.map((a: any) => a.id) || []
  );

  // Analyze each op
  for (const op of ops) {
    const opType = op.op as string;

    if (opType.startsWith('node.')) {
      if (opType === 'node.create') {
        const nodeId = (op as any).nodeId;
        if (nodeId && !nodesBefore.has(nodeId)) {
          changed.createdNodes.push(nodeId);
        }
      } else if (opType === 'node.delete') {
        const nodeId = (op as any).nodeId;
        if (nodeId && nodesBefore.has(nodeId)) {
          changed.deletedNodes.push(nodeId);
        }
      } else {
        const nodeId = (op as any).nodeId;
        if (nodeId && nodesBefore.has(nodeId)) {
          if (!changed.modifiedNodes.includes(nodeId)) {
            changed.modifiedNodes.push(nodeId);
          }
        }
      }
    } else if (opType.startsWith('clip.')) {
      if (opType === 'clip.create') {
        const clipId = (op as any).clipId;
        if (clipId && !clipsBefore.has(clipId)) {
          changed.createdClips.push(clipId);
        }
      } else if (opType === 'clip.delete') {
        const clipId = (op as any).clipId;
        if (clipId && clipsBefore.has(clipId)) {
          changed.deletedClips.push(clipId);
        }
      } else {
        const clipId = (op as any).clipId;
        if (clipId && clipsBefore.has(clipId)) {
          if (!changed.modifiedClips.includes(clipId)) {
            changed.modifiedClips.push(clipId);
          }
        }
      }
    } else if (opType.startsWith('track.')) {
      const trackId = (op as any).trackId;
      if (opType === 'track.create') {
        if (trackId && !tracksBefore.has(trackId)) {
          changed.createdTracks.push(trackId);
        }
      } else if (opType === 'track.delete') {
        if (trackId && tracksBefore.has(trackId)) {
          changed.deletedTracks.push(trackId);
        }
      } else if (trackId && tracksBefore.has(trackId)) {
        if (!changed.modifiedTracks.includes(trackId)) {
          changed.modifiedTracks.push(trackId);
        }
      }
    } else if (opType.startsWith('asset.')) {
      if (opType === 'asset.create') {
        const assetId = (op as any).assetId;
        if (assetId && !assetsBefore.has(assetId)) {
          changed.createdAssets.push(assetId);
        }
      } else if (opType === 'asset.delete') {
        const assetId = (op as any).assetId;
        if (assetId && assetsBefore.has(assetId)) {
          changed.deletedAssets.push(assetId);
        }
      } else {
        const assetId = (op as any).assetId;
        if (assetId && assetsBefore.has(assetId)) {
          if (!changed.modifiedAssets.includes(assetId)) {
            changed.modifiedAssets.push(assetId);
          }
        }
      }
    }
  }

  return changed;
}

/**
 * Generate human-readable preview of an operation
 *
 * @param op - Motion operation
 * @returns String representation of operation
 */
export function previewOp(op: MotionOpRequest): string {
  const opType = op.op as string;
  const obj = op as any;

  // Node operations
  if (opType === 'node.create') {
    return `Create node: ${obj.nodeId || 'unnamed'}`;
  }
  if (opType === 'node.delete') {
    return `Delete node: ${obj.nodeId || 'unnamed'}`;
  }
  if (opType === 'node.update') {
    return `Update node: ${obj.nodeId || 'unnamed'}`;
  }

  // Clip operations
  if (opType === 'clip.create') {
    return `Create clip: ${obj.clipId || 'unnamed'}`;
  }
  if (opType === 'clip.delete') {
    return `Delete clip: ${obj.clipId || 'unnamed'}`;
  }

  // Track operations
  if (opType === 'track.create') {
    return `Create track: ${obj.trackId || 'unnamed'}`;
  }
  if (opType === 'track.delete') {
    return `Delete track: ${obj.trackId || 'unnamed'}`;
  }

  // Asset operations
  if (opType === 'asset.create') {
    return `Add asset: ${obj.assetId || 'unnamed'}`;
  }
  if (opType === 'asset.delete') {
    return `Remove asset: ${obj.assetId || 'unnamed'}`;
  }

  // Keyframe operations
  if (opType === 'keyframe.add') {
    return `Add keyframe: ${obj.keyframeId || 'unnamed'} @ ${obj.time}s`;
  }
  if (opType === 'keyframe.delete') {
    return `Delete keyframe: ${obj.keyframeId || 'unnamed'}`;
  }

  // Generic fallback
  return `${opType}`;
}

/**
 * Validate approval requirement matches execution risk
 *
 * @param result - Execution result
 * @returns True if approval requirement is consistent
 */
export function validateApprovalRequirement(result: PipelineExecutionResult): boolean {
  const level = getApprovalLevel(result.risk);
  const shouldRequire = level === 'requires-approval';

  return result.requiresApproval === shouldRequire;
}
