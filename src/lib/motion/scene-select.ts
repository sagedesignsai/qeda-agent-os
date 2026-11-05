/**
 * lib/motion/scene-select.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure helper that makes `doc.scene` and `doc.timeline` point at a chosen
 * scene. The scenes array is canonical; the aliases are what the editor, the
 * export renderer and the frame binding actually read, so switching scenes
 * without resyncing them is a silent revert.
 */

import type { MotionDocument } from './types';

export function selectMotionScene(doc: MotionDocument, sceneId: string): MotionDocument {
  const scene = doc.scenes.find((candidate) => candidate.id === sceneId);
  if (!scene) throw new Error(`Unknown Motion scene "${sceneId}".`);
  const loop = scene.timeline.loop ?? {
    enabled: false,
    start: 0,
    end: scene.timeline.duration,
  };
  return {
    ...doc,
    activeSceneId: scene.id,
    scene: { nodes: scene.nodes },
    timeline: { ...scene.timeline, loop },
  };
}