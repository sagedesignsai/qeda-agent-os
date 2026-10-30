/**
 * lib/motion/assets.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure helpers for resolving imported Motion media at a deterministic time.
 */

import type { MotionAsset } from './types';

export function motionAssetFrameIndex(asset: MotionAsset, time: number): number {
  if (!Number.isFinite(time)) throw new Error('Motion asset time must be finite.');
  if (!Number.isInteger(asset.frameCount) || asset.frameCount < 1) {
    throw new Error(`Motion asset "${asset.id}" must contain at least one frame.`);
  }
  if (!Number.isFinite(asset.fps) || asset.fps <= 0) {
    throw new Error(`Motion asset "${asset.id}" must have a positive frame rate.`);
  }
  return Math.min(Math.floor(Math.max(0, time) * asset.fps), asset.frameCount - 1);
}

export function motionAssetFrameUrl(documentId: string, assetId: string, frameIndex: number): string {
  if (!Number.isInteger(frameIndex) || frameIndex < 0) {
    throw new Error('Motion asset frame index must be a non-negative integer.');
  }
  return `qeda-media://motion/${encodeURIComponent(documentId)}/${encodeURIComponent(assetId)}/${frameIndex}`;
}
