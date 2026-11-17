/**
 * lib/motion/export/preflight.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure, renderer-independent export checks. Main runs these against its immutable
 * snapshot and the editor runs the same function for live blocking feedback.
 */

import { isEnvironmentMedia, sceneWorldAssetIds } from '../environment';
import { getMotionNodeType } from '../node-registry';
import { resolveMotionSequence } from '../sequence';
import type { MotionDocument, MotionScene } from '../types';
import type { MotionRenderRange } from './render-plan';

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
  const sequence = options.range?.sequence ? resolveMotionSequence(document) : undefined;
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
  const rangeDuration = sequence?.duration ?? scene.timeline.duration;
  if (!Number.isFinite(range.start) || !Number.isFinite(range.end) || range.start < 0 || range.end <= range.start || range.end > rangeDuration + 1e-9) {
    add({ severity: 'blocking', code: 'MOTION_EXPORT_RANGE_INVALID', message: sequence
      ? 'The export range must be a positive interval within the master sequence.'
      : 'The export range must be a positive interval within the selected scene.', sceneId: scene.id, action: 'Adjust the range or sequence duration.' });
  }

  const assetIds = new Set(document.assets.map((asset) => asset.id));
  const scenesToValidate = sequence
    ? [...new Set(sequence.items.map((item) => item.sceneId))]
        .map((sceneId) => document.scenes.find((candidate) => candidate.id === sceneId))
        .filter((candidate): candidate is MotionScene => Boolean(candidate))
    : [scene];
  if (sequence && sequence.items.length === 0) {
    add({ severity: 'blocking', code: 'MOTION_SEQUENCE_EMPTY', message: 'The master sequence has no shots to export.', action: 'Add at least one scene to the sequence.' });
  }
  if (sequence && document.sequence?.items.some((item) => !document.scenes.some((candidate) => candidate.id === item.sceneId))) {
    add({ severity: 'blocking', code: 'MOTION_SEQUENCE_SCENE_MISSING', message: 'The master sequence references a scene that no longer exists.', action: 'Remove or repair the missing shot.' });
  }
  if (sequence) {
    let previousEnd = 0;
    let previousItem: (typeof sequence.items)[number] | undefined;
    for (const item of sequence.items) {
      const itemScene = document.scenes.find((candidate) => candidate.id === item.sceneId);
      if (!itemScene) continue;
      if (item.duration > itemScene.timeline.duration + 1e-9) {
        add({ severity: 'blocking', code: 'MOTION_SEQUENCE_SHOT_TOO_LONG', message: `Shot “${itemScene.name}” is longer than its scene timeline.`, sceneId: item.sceneId, action: 'Shorten the sequence shot or extend the scene timeline.' });
      }
      if (item.start > previousEnd + 0.5) {
        add({ severity: 'warning', code: 'MOTION_SEQUENCE_GAP', message: `The sequence has a ${(item.start - previousEnd).toFixed(2)}s gap before “${itemScene.name}”.`, sceneId: item.sceneId, action: 'Close the gap or keep it as a deliberate pause.' });
      }
      if (previousItem && item.start < previousEnd - 1e-9) {
        const transition = item.transitionIn ?? previousItem.transitionOut;
        if (!transition || transition.type === 'cut') {
          add({ severity: 'warning', code: 'MOTION_SEQUENCE_OVERLAP_CUT', message: `Overlapping shot “${itemScene.name}” has no transition; the later shot will take over.`, sceneId: item.sceneId, action: 'Choose a crossfade or dip transition.' });
        }
      }
      previousEnd = Math.max(previousEnd, item.start + item.duration);
      previousItem = item;
    }
  }

  for (const targetScene of scenesToValidate) {
    const refs = new Set<string>();
    for (const node of targetScene.nodes) {
      if (!node.visible) continue;
      if (!getMotionNodeType(node.type)) {
        add({ severity: 'blocking', code: 'MOTION_NODE_UNSUPPORTED', message: `Node “${node.name}” uses unsupported type “${node.type}”.`, sceneId: targetScene.id, nodeId: node.id, action: 'Replace or remove this node before exporting.' });
      }
      collectAssetRefs(node.props, refs);
    }
    for (const assetId of refs) {
      const existsInBundle = assetIds.has(assetId);
      const isAvailable = options.availableAssetIds?.has(assetId) ?? existsInBundle;
      if (!existsInBundle || !isAvailable) {
        const asset = document.assets.find((item) => item.id === assetId);
        add({ severity: 'blocking', code: 'MOTION_ASSET_MISSING', message: asset ? `Media asset “${asset.name}” is missing from the project bundle.` : `Referenced media asset “${assetId}” is not in the project.`, sceneId: targetScene.id, assetId, action: 'Relink or remove the missing media.' });
      }
    }

    // The world is scene-level state, not a node prop, so the prop walk above
    // never sees it: an unlinked HDRI used to pass preflight and render unlit.
    for (const assetId of sceneWorldAssetIds(targetScene)) {
      const asset = document.assets.find((item) => item.id === assetId);
      const available = options.availableAssetIds?.has(assetId) ?? Boolean(asset);
      if (!asset || !available) {
        add({
          severity: 'blocking',
          code: 'MOTION_WORLD_ASSET_MISSING',
          message: asset
            ? `Background environment “${asset.name}” is missing from the project bundle.`
            : `Background environment “${assetId}” is not in the project.`,
          sceneId: targetScene.id,
          assetId,
          action: 'Relink the environment or switch the world to a solid colour.',
        });
        continue;
      }
      if (!isEnvironmentMedia(asset)) {
        add({
          severity: 'blocking',
          code: 'MOTION_WORLD_FORMAT_UNSUPPORTED',
          message: `Background environment “${asset.name}” is not an HDR or EXR image.`,
          sceneId: targetScene.id,
          assetId,
          action: 'Import a .hdr or .exr environment.',
        });
      }
    }
    if (options.container === 'mp4' && targetScene.background?.type === 'transparent') {
      add({ severity: 'warning', code: 'MOTION_TRANSPARENCY_COMPOSITED', message: 'MP4 does not preserve transparency; the scene background will be composited.', sceneId: targetScene.id, action: 'Choose WebM to preserve transparency.' });
    }
  }
  return issues;
}
