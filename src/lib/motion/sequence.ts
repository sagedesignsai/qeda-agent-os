/**
 * lib/motion/sequence.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure master-sequence timing shared by the editor and export renderer.
 */

import type { MotionDocument, MotionScene, MotionSequence, MotionSequenceItem, MotionTransition } from './types';

export type MotionSequenceLayer = {
  item: MotionSequenceItem;
  scene: MotionScene;
  sceneTime: number;
};

export type MotionSequenceFrame = {
  layers: MotionSequenceLayer[];
  transition?: { type: 'crossfade' | 'dip'; progress: number; color?: string };
};

/** Use authored sequence timing, or make a temporary cut sequence from scenes. */
export function resolveMotionSequence(document: MotionDocument): MotionSequence {
  if (document.sequence) {
    const scenes = new Map(document.scenes.map((scene) => [scene.id, scene]));
    const items = document.sequence.items
      .filter((item) => scenes.has(item.sceneId))
      .slice()
      .sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
    const duration = Math.max(
      document.sequence.duration,
      ...items.map((item) => item.start + item.duration),
      0,
    );
    return { duration, items };
  }

  let start = 0;
  const items = document.scenes.map((scene, index) => {
    const duration = Math.max(0, scene.timeline.duration);
    const item: MotionSequenceItem = {
      id: `auto_${index + 1}_${scene.id}`,
      sceneId: scene.id,
      start,
      duration,
    };
    start += duration;
    return item;
  }).filter((item) => item.duration > 0);
  return { duration: start, items };
}

function transitionFor(incoming: MotionSequenceItem, outgoing: MotionSequenceItem): MotionTransition | undefined {
  return incoming.transitionIn ?? outgoing.transitionOut;
}

/** Resolve one output time into a scene frame, or two layers during a transition. */
export function sampleMotionSequence(
  document: MotionDocument,
  sequence: MotionSequence,
  time: number,
): MotionSequenceFrame {
  const scenes = new Map(document.scenes.map((scene) => [scene.id, scene]));
  const active = sequence.items
    .filter((item) => item.start <= time && time < item.start + item.duration)
    .sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));

  if (active.length === 0) return { layers: [] };

  const incoming = active[active.length - 1];
  const outgoing = active.length > 1 ? active[active.length - 2] : null;
  const transition = outgoing ? transitionFor(incoming, outgoing) : undefined;
  const overlapEnd = outgoing
    ? Math.min(outgoing.start + outgoing.duration, incoming.start + incoming.duration)
    : 0;
  const overlapDuration = outgoing ? overlapEnd - incoming.start : 0;
  const effectiveTransitionDuration = Math.min(transition?.duration ?? 0, overlapDuration);

  if (
    outgoing && transition && transition.type !== 'cut' &&
    effectiveTransitionDuration > 0 &&
    time < incoming.start + effectiveTransitionDuration
  ) {
    const progress = Math.min(1, Math.max(0, (time - incoming.start) / effectiveTransitionDuration));
    const outgoingScene = scenes.get(outgoing.sceneId);
    const incomingScene = scenes.get(incoming.sceneId);
    if (outgoingScene && incomingScene) {
      return {
        layers: [
          { item: outgoing, scene: outgoingScene, sceneTime: Math.min(outgoing.duration, Math.max(0, time - outgoing.start)) },
          { item: incoming, scene: incomingScene, sceneTime: Math.min(incoming.duration, Math.max(0, time - incoming.start)) },
        ],
        transition: {
          type: transition.type,
          progress,
          ...(transition.color ? { color: transition.color } : {}),
        },
      };
    }
  }

  const scene = scenes.get(incoming.sceneId);
  return scene
    ? {
        layers: [{
          item: incoming,
          scene,
          sceneTime: Math.min(incoming.duration, Math.max(0, time - incoming.start)),
        }],
      }
    : { layers: [] };
}
