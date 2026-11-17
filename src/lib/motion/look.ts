/**
 * lib/motion/look.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The look pipeline: which nodes are post effects, what order they run in, and
 * what their parameters are at a given time.
 *
 * Pure by design. The composer in the renderer consumes this module; tests can
 * assert ordering, clamping and animation without touching WebGL.
 *
 * Order is fixed rather than user-defined. A post stack is a pipeline, not a
 * pile: DOF has to happen with depth, bloom before the grade, texture after
 * colour, and framing at the end. A reorder control would mostly let people
 * make their own shots look worse.
 */

import { sampleSceneTimeline } from './sample';
import { channelKey, type MotionNode, type MotionScene } from './types';

export type MotionLookKind =
  | 'bloom'
  | 'grade'
  | 'chroma'
  | 'vignette'
  | 'grain'
  | 'letterbox'
  | 'scanline'
  | 'lens-distortion';

const KIND_BY_NODE_TYPE: Readonly<Record<string, MotionLookKind>> = {
  'fx.bloom': 'bloom',
  'fx.grade': 'grade',
  'fx.chroma': 'chroma',
  'fx.vignette': 'vignette',
  'fx.grain': 'grain',
  'fx.letterbox': 'letterbox',
  'fx.scanline': 'scanline',
  'fx.lens-distortion': 'lens-distortion',
};

/** Pipeline order. Lower runs first; ties fall back to document order. */
const PIPELINE_ORDER: Readonly<Record<MotionLookKind, number>> = {
  'lens-distortion': 5,
  bloom: 10,
  grade: 20,
  chroma: 30,
  vignette: 40,
  scanline: 50,
  grain: 60,
  letterbox: 70,
};

export const MOTION_LOOK_KINDS = Object.keys(PIPELINE_ORDER) as MotionLookKind[];

export function lookKindOf(type: string): MotionLookKind | null {
  return KIND_BY_NODE_TYPE[type] ?? null;
}

export function isMotionLookNode(type: string): boolean {
  return type in KIND_BY_NODE_TYPE;
}

export function isMotionLookContainerNode(type: string): boolean {
  return type === 'fx.stack';
}

/** Top-level nodes to remove when replacing/clearing a look. */
export function motionLookRemovalRoots(nodes: readonly MotionNode[]): MotionNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  return nodes.filter((node) => {
    if (isMotionLookContainerNode(node.type)) return true;
    if (!isMotionLookNode(node.type)) return false;
    let parentId = node.parentId;
    const seen = new Set<string>();
    while (parentId && !seen.has(parentId)) {
      seen.add(parentId);
      const parent = byId.get(parentId);
      if (!parent) break;
      if (isMotionLookContainerNode(parent.type)) return false;
      parentId = parent.parentId;
    }
    return true;
  });
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function numberProp(
  props: Readonly<Record<string, unknown>>,
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const value = finite(props[key]);
  return value === null ? fallback : clamp(value, min, max);
}

function boolProp(
  props: Readonly<Record<string, unknown>>,
  key: string,
  fallback: boolean,
): boolean {
  const value = props[key];
  return typeof value === 'boolean' ? value : fallback;
}

export type MotionLookParams = {
  kind: MotionLookKind;
  props: Readonly<Record<string, number | boolean>>;
};

/**
 * Clamp a look node's raw props into renderer-safe values. Every parameter has a
 * defined range, so an agent-authored or hand-edited document can never push the
 * composer into NaNs.
 */
export function readLookParams(kind: MotionLookKind, raw: Readonly<Record<string, unknown>>): MotionLookParams {
  switch (kind) {
    case 'bloom':
      return {
        kind,
        props: {
          intensity: numberProp(raw, 'intensity', 0.7, 0, 5),
          threshold: numberProp(raw, 'threshold', 0.8, 0, 1),
          smoothing: numberProp(raw, 'smoothing', 0.3, 0, 1),
        },
      };
    case 'grade':
      return {
        kind,
        props: {
          exposure: numberProp(raw, 'exposure', 0, -3, 3),
          contrast: numberProp(raw, 'contrast', 0, -1, 1),
          saturation: numberProp(raw, 'saturation', 0, -1, 1),
          temperature: numberProp(raw, 'temperature', 0, -1, 1),
          tint: numberProp(raw, 'tint', 0, -1, 1),
        },
      };
    case 'chroma':
      return {
        kind,
        props: {
          offset: numberProp(raw, 'offset', 0.0015, 0, 0.01),
          radial: boolProp(raw, 'radial', true),
          modulationOffset: numberProp(raw, 'modulationOffset', 0.15, 0, 1),
        },
      };
    case 'vignette':
      return {
        kind,
        props: {
          offset: numberProp(raw, 'offset', 0.3, 0, 1),
          darkness: numberProp(raw, 'darkness', 0.55, 0, 1),
        },
      };
    case 'grain':
      return {
        kind,
        props: { amount: numberProp(raw, 'amount', 0.22, 0, 1) },
      };
    case 'letterbox':
      return {
        kind,
        props: {
          aspect: numberProp(raw, 'aspect', 2.39, 1, 3.5),
          opacity: numberProp(raw, 'opacity', 1, 0, 1),
        },
      };
    case 'scanline':
      return {
        kind,
        props: {
          intensity: numberProp(raw, 'intensity', 0.18, 0, 1),
          density: numberProp(raw, 'density', 480, 1, 1200),
          speed: numberProp(raw, 'speed', 0, -4, 4),
        },
      };
    case 'lens-distortion':
      return {
        kind,
        props: {
          radial1: numberProp(raw, 'radial1', 0, -0.5, 0.5),
          radial2: numberProp(raw, 'radial2', 0, -0.5, 0.5),
        },
      };
  }
}

export type MotionResolvedLook = {
  node: MotionNode;
  kind: MotionLookKind;
  params: MotionLookParams;
};

type LookScene = Pick<MotionScene, 'nodes' | 'timeline'>;

/**
 * The look nodes that should render at `time`, in pipeline order, with their
 * animated properties resolved. Hidden nodes are skipped, which is how a shot
 * mutes an effect.
 */
export function resolveLookStack(
  scene: LookScene,
  time: number,
): MotionResolvedLook[] {
  const byId = new Map(scene.nodes.map((node) => [node.id, node]));
  const isEnabled = (node: MotionNode): boolean => {
    if (!node.visible) return false;
    let parentId = node.parentId;
    const seen = new Set<string>();
    while (parentId && !seen.has(parentId)) {
      seen.add(parentId);
      const parent = byId.get(parentId);
      if (!parent) break;
      if (!parent.visible) return false;
      parentId = parent.parentId;
    }
    return true;
  };
  const live = scene.nodes.filter((node) => isEnabled(node) && isMotionLookNode(node.type));
  if (live.length === 0) return [];

  const sampled = sampleSceneTimeline(scene as MotionScene, time);
  const props = new Map<string, Record<string, unknown>>();
  for (const node of live) {
    const resolved: Record<string, unknown> = { ...node.props };
    // Only values the timeline actually produced are overridden; a prop with no
    // active channel keeps its authored value. Sampling is placement-aware, so
    // a look clip that is not on a track cannot leak in.
    for (const key of Object.keys(resolved)) {
      const value = sampled.get(channelKey(node.id, key));
      if (value !== undefined) resolved[key] = value;
    }
    props.set(node.id, resolved);
  }

  return live
    .map((node, index) => {
      const kind = lookKindOf(node.type);
      if (!kind) return null;
      return {
        node,
        kind,
        params: readLookParams(kind, props.get(node.id) ?? {}),
        index,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((a, b) => PIPELINE_ORDER[a.kind] - PIPELINE_ORDER[b.kind] || a.index - b.index)
    .map(({ node, kind, params }) => ({ node, kind, params }));
}

/** Stable identity for the pass chain; props animate, structure does not. */
export function lookStackKey(looks: readonly MotionResolvedLook[]): string {
  return looks.map((look) => `${look.node.id}:${look.kind}`).join('|');
}

/** Convenience for UI copy: "Bloom · Grade · Vignette". */
export function describeLookStack(looks: readonly MotionResolvedLook[]): string {
  if (looks.length === 0) return 'No look';
  const labels: Record<MotionLookKind, string> = {
    bloom: 'Bloom',
    grade: 'Grade',
    chroma: 'Chroma',
    vignette: 'Vignette',
    grain: 'Grain',
    letterbox: 'Letterbox',
    scanline: 'Scanlines',
    'lens-distortion': 'Lens distortion',
  };
  return looks.map((look) => labels[look.kind]).join(' · ');
}
