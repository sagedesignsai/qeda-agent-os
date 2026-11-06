import { stageOf } from '@/lib/trace/document';
/**
 * stores/trace/slices/storyboard-slice.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Scene planning over the same element graph. Scenes are a timeline layer, not a
 * second document.
 */

import type { TraceSliceCreator, TraceStoryboardActions } from './types';

export const createStoryboardSlice: TraceSliceCreator<
  TraceStoryboardActions
> = (_set, get) => ({
  addScene: (options = {}) => {
    const result = get().dispatch([
      {
        type: 'addScene',
        name: options.name,
        durationMs: options.durationMs,
        intent: options.intent,
      },
    ]);
    const added = result?.diff.scenes.added[0];
    if (added) get().setActiveScene(added);
  },

  updateScene: (sceneId, patch) => {
    get().dispatch([{ type: 'updateScene', id: sceneId, ...patch }]);
  },

  removeScene: (sceneId) => {
    get().dispatch([{ type: 'removeScene', id: sceneId }]);
    const project = get().project;
    const nextScene = project?.storyboard?.scenes[0];
    if (nextScene) get().setActiveScene(nextScene.id);
  },

  focusScene: (sceneId) => {
    const project = get().project;
    if (!project) return;
    get().setActiveScene(sceneId);

    const scene = project.storyboard?.scenes.find(
      (entry) => entry.id === sceneId,
    );
    if (!scene) return;

    const firstElement = Object.values(stageOf(project).elements).find(
      (element) => element.sceneId === sceneId,
    );
    if (firstElement) get().selectElement(firstElement.id);
    get().setPlayhead(scene.startMs);
  },
});
