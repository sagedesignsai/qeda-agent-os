/**
 * main/motion/preflight.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure, renderer-independent export checks. The export host runs these against
 * its immutable document snapshot before creating an output file.
 */

import { getMotionNodeType } from '../../lib/motion/node-registry';
import type { MotionDocument, MotionScene } from '../../lib/motion/types';
import type { MotionRenderRange } from './render-plan.js';

export type MotionPreflightIssue = {
  severity: 'blocking' | 'warning';
  code: string;
  message: string;
  sceneId?: string;
  nodeId?: string;
  assetId?: string;
  action?: string;
};

export type MotionExportRange = MotionRenderRange & { sceneId?: string };

export type MotionPreflightOptions = {
  range?: MotionExportRange;
  container?: 'mp4' | 'webm';
  /** Actual bundle availability, when the caller has resolved files on disk. */
  availableAssetIds?: ReadonlySet<string>;
};

function collectAssetRefs(value: unknown, refs: Set<string>): void {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value) collectAssetRefs(item, refs);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (/^(assetId|fontAssetId|imageAssetId|modelAssetId|environmentAssetId)$/.test(key) && typeof child === 'string' && child) {
      refs.add(child);
    } else {
      collectAssetRefs(child, refs);
    }
  }
}

function selectedScene(document: MotionDocument, sceneId?: string): MotionScene | undefined {
  return document.scenes.find((scene) => scene.id === (sceneId ?? document.activeSceneId));
}

/** Return all export blockers and warnings without mutating the input document. */
export function preflightMotionExport(
  document: MotionDocument,
  options: MotionPreflightOptions = {},
): MotionPreflightIssue[] {
  const issues: MotionPreflightIssue[] = [];
  const scene = selectedScene(document, options.range?.sceneId);
  const add = (issue: MotionPreflightIssue) => issues.push(issue);

  if (!scene) {
    add({ severity: 'blocking', code: 'MOTION_SCENE_MISSING', message: 'The selected scene is not present in this project.', action: 'Select an existing scene.' });
    return issues;
  }

  const { width, height, fps } = document.meta.output;
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0 || width > 7680 || height > 7680) {
    add({ severity: 'blocking', code: 'MOTION_OUTPUT_SIZE_INVALID', message: 'Output width and height must be whole pixels between 1 and 7680.', action: 'Choose a valid output size.' });
  }
  if (![24, 30, 60].includes(fps)) {
    add({ severity: 'blocking', code: 'MOTION_OUTPUT_FPS_INVALID', message: 'Output frame rate must be 24, 30, or 60 fps.', action: 'Choose a supported frame rate.' });
  }

  const range = options.range ?? { start: 0, end: scene.timeline.duration };
  if (!Number.isFinite(range.start) || !Number.isFinite(range.end) || range.start < 0 || range.end <= range.start || range.end > scene.timeline.duration + 1e-9) {
    add({ severity: 'blocking', code: 'MOTION_EXPORT_RANGE_INVALID', message: 'The export range must be a positive interval within the selected scene.', sceneId: scene.id, action: 'Adjust the range or scene duration.' });
  }

  const assetIds = new Set(document.assets.map((asset) => asset.id));
  const refs = new Set<string>();
  for (const node of scene.nodes) {
    if (!node.visible) continue;
    if (!getMotionNodeType(node.type)) {
      add({ severity: 'blocking', code: 'MOTION_NODE_UNSUPPORTED', message: `Node “${node.name}” uses unsupported type “${node.type}”.`, sceneId: scene.id, nodeId: node.id, action: 'Replace or remove this node before exporting.' });
    }
    collectAssetRefs(node.props, refs);
  }
  for (const assetId of refs) {
    const existsInBundle = assetIds.has(assetId);
    const isAvailable = options.availableAssetIds?.has(assetId) ?? existsInBundle;
    if (!existsInBundle || !isAvailable) {
      const asset = document.assets.find((item) => item.id === assetId);
      add({ severity: 'blocking', code: 'MOTION_ASSET_MISSING', message: asset ? `Media asset “${asset.name}” is missing from the project bundle.` : `Referenced media asset “${assetId}” is not in the project.`, sceneId: scene.id, assetId, action: 'Relink or remove the missing media.' });
    }
  }

  if (options.container === 'mp4' && scene.background?.type === 'transparent') {
    add({ severity: 'warning', code: 'MOTION_TRANSPARENCY_COMPOSITED', message: 'MP4 does not preserve transparency; the scene background will be composited.', sceneId: scene.id, action: 'Choose WebM to preserve transparency.' });
  }
  return issues;
}
