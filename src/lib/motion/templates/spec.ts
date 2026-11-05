import { createEmptyMotionDocument } from '../defaults';
import { createMotionNode } from '../node-registry';
import { selectMotionScene } from '../scene-select';
import type { MotionClip, MotionDocument, MotionNode, MotionTimeline } from '../types';

export type TemplateSceneSpec = {
  name: string;
  duration: number;
  nodes: MotionNode[];
  clips?: MotionClip[];
  cameraId?: string | null;
  background?: MotionDocument['scenes'][number]['background'];
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

export type MotionTemplateCategory =
  | 'Product' | 'Software' | 'Brand' | 'Data' | 'Editorial'
  | 'Event' | 'Entertainment' | 'Education' | 'Commerce' | 'Cause' | 'Social';

export type MotionTemplate = {
  id: string;
  name: string;
  category: MotionTemplateCategory;
  description: string;
  duration: number;
  width: number;
  height: number;
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
  synced.sequence = {
    duration: totalDuration,
    items: builtScenes.map((sc, i) => {
      const start = builtScenes.slice(0, i).reduce((a, x) => a + (x.timeline.duration ?? 0), 0);
      return { id: `seq_${i + 1}`, sceneId: sc.id, start, duration: sc.timeline.duration };
    }),
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