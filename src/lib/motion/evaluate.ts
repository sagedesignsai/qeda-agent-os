/**
 * lib/motion/evaluate.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Deterministic scene evaluation: compose timeline samples onto document nodes
 * for a caller-supplied time. This module has no clock or renderer dependency.
 */

import { applyNodeProperty, MotionNodeError } from './node-registry';
import { sampleSceneTimeline } from './sample';
import { channelKey, type MotionNode, type MotionScene, type MotionTimeline } from './types';

export class MotionEvaluationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MotionEvaluationError';
  }
}

export type MotionFrame = {
  time: number;
  sceneId: string;
  nodes: MotionNode[];
};

export type MotionEvaluationScene = Pick<MotionScene, 'id' | 'nodes' | 'timeline'>;
export type MotionEvaluationContext = { timeline?: MotionTimeline };

export function evaluateMotionFrame(
  scene: MotionEvaluationScene,
  time: number,
  context: MotionEvaluationContext = {},
): MotionFrame {
  if (!Number.isFinite(time)) {
    throw new MotionEvaluationError('Frame time must be a finite number.');
  }

  const timeline = context.timeline ?? scene.timeline as MotionTimeline;
  const evaluatedScene = { ...scene, timeline } as MotionScene;
  const nodes = new Map(scene.nodes.map((node) => [node.id, node]));
  const values = sampleSceneTimeline(evaluatedScene, time);

  for (const clip of timeline.clips) {
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

  return { time, sceneId: scene.id, nodes: scene.nodes.map((node) => nodes.get(node.id) ?? node) };
}
