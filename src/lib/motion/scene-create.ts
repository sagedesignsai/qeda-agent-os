/**
 * lib/motion/scene-create.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Builds the op for creating or duplicating a scene. The id-map derivation is
 * non-obvious (duplicate clones every node/track/clip/audio id; create only
 * copies the camera + light rig), so it lives here once instead of being
 * re-derived per UI surface.
 */

import type { MotionOpRequest } from './ops';
import { createMotionId } from './ids';
import type { MotionDocument } from './types';

export type MotionSceneCreation = {
  sceneId: string;
  label: string;
  op: MotionOpRequest;
};

export function buildMotionSceneCreation(
  doc: MotionDocument,
  duplicate: boolean,
): MotionSceneCreation {
  const sceneId = createMotionId('scene');
  const sceneName = duplicate
    ? `${doc.scenes.find((scene) => scene.id === doc.activeSceneId)?.name ?? 'Scene'} copy`
    : `Scene ${doc.scenes.length + 1}`;
  const ids = duplicate
    ? [
        ...doc.scene.nodes.map((node) => node.id),
        ...doc.timeline.tracks.map((track) => track.id),
        ...doc.timeline.tracks.flatMap((track) =>
          track.placements.map((placement) => placement.id),
        ),
        ...doc.timeline.clips.map((clip) => clip.id),
        ...doc.timeline.clips.flatMap((clip) => clip.channels.map((channel) => channel.id)),
        ...doc.timeline.clips.flatMap((clip) =>
          clip.channels.flatMap((channel) => channel.keyframes.map((key) => key.id)),
        ),
        ...(doc.timeline.audio ?? []).map((audio) => audio.id),
      ]
    : doc.scene.nodes
        .filter(
          (node) =>
            node.type.startsWith('camera.') ||
            node.type.startsWith('light.') ||
            node.type === 'stage.ground',
        )
        .map((node) => node.id);
  const idMap = Object.fromEntries(ids.map((id) => [id, createMotionId('scene')]));
  return {
    sceneId,
    label: duplicate ? 'Duplicate scene' : 'Add scene',
    op: duplicate
      ? { op: 'scene.duplicate', sceneId, name: sceneName, idMap }
      : { op: 'scene.add', sceneId, name: sceneName, rigIdMap: idMap },
  };
}
