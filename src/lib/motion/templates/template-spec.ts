import { createEmptyMotionDocument } from '../defaults';
import { createMotionNode } from '../node-registry';
import { selectMotionScene } from '../scene-select';
import type { MotionClip, MotionDocument, MotionNode, MotionTimeline, MotionTransition } from '../types';

export type TemplateSceneSpec = {
  name: string;
  duration: number;
  nodes: MotionNode[];
  clips?: MotionClip[];
  cameraId?: string | null;
  background?: MotionDocument['scenes'][number]['background'];
  transitionIn?: MotionTransition;
};

export type TemplateSpec = {
  id: string;
  name: string;
  category: MotionTemplateCategory;
  description: string;
  width: number;
  height: number;
  fps?: number;
  tags?: string[];
  scenes: TemplateSceneSpec[];
};

export type MotionTemplateCategory = 'Product' | 'Brand';

export type MotionTemplate = {
  id: string;
  name: string;
  category: MotionTemplateCategory;
  description: string;
  duration: number;
  width: number;
  height: number;
  fps: number;
  sceneCount: number;
  tags: string[];
};

export function buildTemplate(spec: TemplateSpec): MotionDocument {
  const totalDuration = spec.scenes.reduce((a, s) => a + s.duration, 0) || spec.scenes[0]?.duration || 6;
  const doc = createEmptyMotionDocument({
    id: `doc_${spec.id}`,
    name: spec.name,
    duration: totalDuration,
    width: spec.width,
    height: spec.height,
    fps: spec.fps ?? 30,
  });
  const builtScenes = spec.scenes.map((s, i) => {
    const sceneId = `scene_${i + 1}`;
    const timeline: MotionTimeline = {
      duration: s.duration,
      loop: { enabled: true, start: 0, end: s.duration },
      workArea: { enabled: false, start: 0, end: s.duration },
      playMode: 'loop',
      tracks: (s.clips ?? []).map((clip) => ({
        id: `trk_${sceneId}_${clip.id}`,
        name: clip.name,
        targetId: clip.channels[0]?.targetId ?? null,
        muted: false,
        locked: false,
        placements: [{ id: `plc_${sceneId}_${clip.id}`, clipId: clip.id, start: 0, trimIn: 0, duration: s.duration }],
      })),
      clips: s.clips ?? [],
      audio: [],
    };
    return {
      id: sceneId,
      name: s.name,
      nodes: s.nodes,
      timeline: { ...timeline, loop: undefined },
      cameraId: s.cameraId ?? (s.nodes.find((n) => n.type === 'camera.perspective')?.id ?? null),
      ...(s.background ? { background: s.background } : {}),
    };
  });
  doc.scenes = builtScenes;
  doc.activeSceneId = builtScenes[0].id;
  // sync alias
  const synced = selectMotionScene(doc, builtScenes[0].id);
  synced.timeline = builtScenes[0].timeline as any;
  synced.scene = { nodes: builtScenes[0].nodes };
  // sequence metadata (forward-compatible; not consumed by export)
  let sequenceCursor = 0;
  const sequenceItems = builtScenes.map((scene, index) => {
    const transitionIn = spec.scenes[index].transitionIn;
    if (index > 0 && transitionIn && transitionIn.type !== 'cut') {
      sequenceCursor = Math.max(0, sequenceCursor - transitionIn.duration);
    }
    const item = {
      id: `seq_${index + 1}`,
      sceneId: scene.id,
      start: sequenceCursor,
      duration: scene.timeline.duration,
      ...(transitionIn ? { transitionIn } : {}),
    };
    sequenceCursor += scene.timeline.duration;
    return item;
  });
  synced.sequence = {
    duration: Math.max(...sequenceItems.map((item) => item.start + item.duration), 0),
    items: sequenceItems,
  };
  return synced;
}

export function node(type: string, id: string, props?: Record<string, unknown>, transform?: Partial<MotionNode['transform']>): MotionNode {
  const n = createMotionNode(type, id);
  if (props) n.props = { ...n.props, ...props };
  if (transform) n.transform = { ...n.transform, ...transform } as MotionNode['transform'];
  return n;
}

export function T(id: string, text: string, transform?: Partial<MotionNode['transform']>, props?: Record<string, unknown>): MotionNode {
  return node('text.title', id, { text, ...(props ?? {}) }, transform);
}
export function B(id: string, text: string, transform?: Partial<MotionNode['transform']>, props?: Record<string, unknown>): MotionNode {
  return node('text.body', id, { text, ...(props ?? {}) }, transform);
}
