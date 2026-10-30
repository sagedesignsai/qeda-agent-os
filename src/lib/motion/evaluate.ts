/**
 * lib/motion/evaluate.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Deterministic scene evaluation: compose timeline samples onto document nodes
 * for a caller-supplied time. This module has no clock or renderer dependency.
 */

import { applyNodeProperty, MotionNodeError } from './node-registry';
import { sampleTimeline } from './sample';
import { channelKey, type MotionDocument, type MotionNode } from './types';

export class MotionEvaluationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MotionEvaluationError';
  }
}

export type MotionFrame = {
  time: number;
  nodes: MotionNode[];
};

export function evaluateMotionFrame(doc: MotionDocument, time: number): MotionFrame {
  if (!Number.isFinite(time)) {
    throw new MotionEvaluationError('Frame time must be a finite number.');
  }

  const nodes = new Map(doc.scene.nodes.map((node) => [node.id, node]));
  const values = sampleTimeline(doc, time);

  for (const clip of doc.timeline.clips) {
    for (const channel of clip.channels) {
      const key = channelKey(channel.targetId, channel.property);
      const value = values.get(key);
      if (value === undefined) continue;
      const node = nodes.get(channel.targetId);
      if (!node) {
        throw new MotionEvaluationError(
          `Animation channel "${channel.id}" references missing node "${channel.targetId}".`,
        );
      }
      try {
        nodes.set(
          node.id,
          applyNodeProperty(node, channel.property, value),
        );
      } catch (error) {
        if (error instanceof MotionNodeError) {
          throw new MotionEvaluationError(`Channel "${channel.id}": ${error.message}`);
        }
        throw error;
      }
    }
  }

  return { time, nodes: doc.scene.nodes.map((node) => nodes.get(node.id) ?? node) };
}
