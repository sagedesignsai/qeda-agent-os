/**
 * lib/motion/environment.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The scene's world: what fills the frame behind content, and what lights it.
 *
 * One resolver serves the editor viewport and the export window. They used to
 * disagree (editor painted a UI stage tone, export painted the brand colour),
 * which meant a scene's `background` was data nothing rendered. Everything here
 * is pure — no React, DOM or Three — so it runs in jest and in main.
 *
 * Two distinct jobs are kept apart on purpose:
 *   • the WORLD (`scene.background`) is global, per scene, and not animatable;
 *   • BACKDROP nodes (`stage.backdrop`, `stage.cyclorama`, …) are content: they
 *     animate, parallax, key, and export like any other object.
 */

import { motionAssetUrl } from './assets';
import type { MotionOpRequest } from './ops';
import type {
  MotionAsset,
  MotionDocument,
  MotionNode,
  MotionNodeTransform,
  MotionScene,
  MotionStudioWorldVariant,
} from './types';

export type MotionSceneBackground = NonNullable<MotionScene['background']>;

export type MotionWorldMode = 'color' | 'transparent' | 'environment' | 'studio';

/**
 * A world the renderer can paint without asking any more questions.
 * `unresolved-environment` is a valid state, not an error: it renders the
 * fallback colour and surfaces as missing media, exactly like a missing model.
 */
export type MotionResolvedWorld =
  | { kind: 'color'; color: string }
  | { kind: 'transparent' }
  | {
      kind: 'studio';
      variant: MotionStudioWorldVariant;
      color: string;
      intensity: number;
      rotation: number;
    }
  | {
      kind: 'environment';
      assetId: string;
      url: string;
      /** Source encoding — the URL has no extension, so the loader needs this. */
      format: 'hdr' | 'exr';
      /** Image-based lighting multiplier. */
      intensity: number;
      /** Visible-backdrop blur in radians of roughness (0–1). */
      blur: number;
      /** Y rotation in radians, for orienting the sun in the HDRI. */
      rotation: number;
    }
  | { kind: 'unresolved-environment'; assetId: string };

export const DEFAULT_WORLD_INTENSITY = 1;
export const DEFAULT_WORLD_BLUR = 0;
export const DEFAULT_WORLD_ROTATION = 0;

export const DEFAULT_STUDIO_COLORS: Record<MotionStudioWorldVariant, string> = {
  softbox: '#e8e4dc',
  room: '#15181f',
  dark: '#06070a',
};

export const MOTION_STUDIO_VARIANTS: Array<{ value: MotionStudioWorldVariant; label: string; description: string }> = [
  { value: 'softbox', label: 'Softbox', description: 'Neutral product stage with bright strip reflections.' },
  { value: 'room', label: 'Room', description: 'Soft room light for general 3D scenes.' },
  { value: 'dark', label: 'Dark', description: 'Moody stage with cool key and warm rim reflections.' },
];

export function isEnvironmentMedia(asset: Pick<MotionAsset, 'kind' | 'path'>): boolean {
  return asset.kind === 'environment' && /\.(hdr|exr)$/i.test(asset.path);
}

/** Resolve a scene's world against the document's asset table. */
export function resolveSceneWorld(
  scene: MotionScene | undefined,
  assets: readonly MotionAsset[],
  documentId: string,
): MotionResolvedWorld | null {
  const background = scene?.background;
  if (!background) return null;
  if (background.type === 'transparent') return { kind: 'transparent' };
  if (background.type === 'color') return { kind: 'color', color: background.color };
  if (background.type === 'studio') {
    const variant = background.variant ?? 'softbox';
    return {
      kind: 'studio',
      variant,
      color: background.color ?? DEFAULT_STUDIO_COLORS[variant],
      intensity: background.intensity ?? DEFAULT_WORLD_INTENSITY,
      rotation: background.rotation ?? DEFAULT_WORLD_ROTATION,
    };
  }
  const asset = assets.find((item) => item.id === background.assetId);
  if (!asset) return { kind: 'unresolved-environment', assetId: background.assetId };
  return {
    kind: 'environment',
    assetId: asset.id,
    url: motionAssetUrl(documentId, asset.id),
    format: /\.exr$/i.test(asset.path) ? 'exr' : 'hdr',
    intensity: background.intensity ?? DEFAULT_WORLD_INTENSITY,
    blur: background.blur ?? DEFAULT_WORLD_BLUR,
    rotation: background.rotation ?? DEFAULT_WORLD_ROTATION,
  };
}

/** Human label for the world chip in the viewport header. */
export function describeResolvedWorld(
  world: MotionResolvedWorld | null,
  assets: readonly MotionAsset[],
): { label: string; detail: string } {
  if (!world) return { label: 'Stage tone', detail: 'No scene world set — the editor tone shows.' };
  if (world.kind === 'transparent') return { label: 'Transparent', detail: 'Alpha background; WebM preserves it.' };
  if (world.kind === 'color') return { label: 'Solid', detail: world.color };
  if (world.kind === 'studio') {
    const variant = MOTION_STUDIO_VARIANTS.find((item) => item.value === world.variant);
    return {
      label: `Studio · ${variant?.label ?? world.variant}`,
      detail: `${world.color} · ${world.intensity.toFixed(2)}× light`,
    };
  }
  const asset = assets.find((item) => item.id === world.assetId);
  if (world.kind === 'unresolved-environment') {
    return { label: 'Missing HDRI', detail: 'The background asset is not in this project.' };
  }
  return { label: asset?.name ?? 'HDRI', detail: `${world.intensity.toFixed(2)}× light` };
}

// ── Presets ──────────────────────────────────────────────────────────────────
//
// Authoring a good-looking world from lights and surfaces is the hard part, and
// asking a model to hand-write eight ops per look is how scenes end up flat.
// A preset is one deterministic op batch: the same preset on the same scene
// always produces the same nodes, and re-applying it updates them in place
// (matched by `environmentSlot`) instead of stacking a second rig.

export type MotionEnvironmentPresetNode = {
  /** Stable within the preset: the re-apply key is `${presetId}:${slot}`. */
  slot: string;
  type: string;
  name?: string;
  transform?: Partial<MotionNodeTransform>;
  props?: Record<string, unknown>;
};

export type MotionEnvironmentPreset = {
  id: string;
  label: string;
  description: string;
  /** Two-stop gradient used for the UI swatch. */
  swatch: readonly [string, string];
  background: MotionSceneBackground;
  nodes: readonly MotionEnvironmentPresetNode[];
};

export const MOTION_ENVIRONMENT_PRESETS: readonly MotionEnvironmentPreset[] = [
  {
    id: 'studio-softbox',
    label: 'Studio softbox',
    description: 'Neutral sweep, soft key and warm/cool rims — the safe product look.',
    swatch: ['#1a2434', '#070a10'],
    background: { type: 'studio', variant: 'softbox', color: '#0e1118', intensity: 1 },
    nodes: [
      { slot: 'key', type: 'light.directional', name: 'Key light', transform: { position: [-4, 5, 4] }, props: { intensity: 2.6, color: '#ffffff', castShadow: true } },
      { slot: 'rim-cool', type: 'light.point', name: 'Cool rim', transform: { position: [4, 2, -2.5] }, props: { intensity: 6, color: '#8fb0ff', distance: 16 } },
      { slot: 'rim-warm', type: 'light.point', name: 'Warm rim', transform: { position: [-3, 1.2, 3] }, props: { intensity: 2.4, color: '#ffd9b0', distance: 12 } },
      { slot: 'ground', type: 'stage.ground', name: 'Sweep floor', transform: { position: [0, -1.5, 0] }, props: { size: 26, color: '#12161f', roughness: 0.6, metalness: 0.15 } },
      { slot: 'contact-shadow', type: 'stage.contact-shadow', name: 'Contact shadow', transform: { position: [0, -1.49, 0] }, props: { width: 5, depth: 5, opacity: 0.3, softness: 0.7 } },
      { slot: 'backdrop', type: 'stage.backdrop', name: 'Backdrop', transform: { position: [0, 2, -5] }, props: { mode: 'gradient', width: 30, height: 16, topColor: '#1a2434', bottomColor: '#070a10' } },
    ],
  },
  {
    id: 'product-plinth',
    label: 'Product plinth',
    description: 'Dark plinth, top spot and coloured rims for a hero shot.',
    swatch: ['#161b26', '#05070c'],
    background: { type: 'studio', variant: 'room', color: '#080a10', intensity: 0.8 },
    nodes: [
      { slot: 'plinth', type: 'stage.pedestal', name: 'Plinth', transform: { position: [0, -1.5, 0] }, props: { radius: 1.6, height: 0.55, color: '#151a24', accentColor: '#6f8dff', roughness: 0.28, metalness: 0.24 } },
      { slot: 'key', type: 'light.spot', name: 'Top spot', transform: { position: [0, 5, 2.5] }, props: { intensity: 5, color: '#ffffff', angle: 0.5, penumbra: 0.45, castShadow: true } },
      { slot: 'rim-blue', type: 'light.point', name: 'Blue rim', transform: { position: [3, 0.5, -2] }, props: { intensity: 4, color: '#4f7bff', distance: 12 } },
      { slot: 'rim-warm', type: 'light.point', name: 'Warm kick', transform: { position: [-3, 0.6, 2] }, props: { intensity: 2, color: '#ffb27a', distance: 10 } },
      { slot: 'ground', type: 'stage.ground', name: 'Floor', transform: { position: [0, -1.5, 0] }, props: { size: 28, color: '#0c0f16', roughness: 0.5, metalness: 0.2 } },
      { slot: 'contact-shadow', type: 'stage.contact-shadow', name: 'Contact shadow', transform: { position: [0, -1.49, 0] }, props: { width: 6, depth: 6, opacity: 0.35, softness: 0.7 } },
      { slot: 'backdrop', type: 'stage.backdrop', name: 'Backdrop', transform: { position: [0, 2, -6] }, props: { mode: 'gradient', width: 32, height: 18, topColor: '#151b2a', bottomColor: '#04060a' } },
    ],
  },
  {
    id: 'neon-grid',
    label: 'Neon grid',
    description: 'Cyber grid, particle haze and magenta/cyan rims.',
    swatch: ['#0a1030', '#02030a'],
    background: { type: 'color', color: '#04060c' },
    nodes: [
      { slot: 'grid', type: 'stage.grid', name: 'Grid floor', transform: { position: [0, -1.5, 0] }, props: { size: 34, divisions: 34, color: '#101a2c', accentColor: '#22d3ee', opacity: 0.75 } },
      { slot: 'haze', type: 'stage.particles', name: 'Haze', props: { count: 700, radius: 7, size: 0.018, color: '#7dd3fc', seed: 7, opacity: 0.7 } },
      { slot: 'rim-magenta', type: 'light.point', name: 'Magenta rim', transform: { position: [4, 1, -3] }, props: { intensity: 7, color: '#ff3bd4', distance: 22 } },
      { slot: 'rim-cyan', type: 'light.point', name: 'Cyan rim', transform: { position: [-4, 1, -3] }, props: { intensity: 7, color: '#22d3ee', distance: 22 } },
      { slot: 'ambient', type: 'light.ambient', name: 'Ambient', props: { intensity: 0.25, color: '#7c8cff' } },
      { slot: 'backdrop', type: 'stage.backdrop', name: 'Backdrop', transform: { position: [0, 2, -7] }, props: { mode: 'gradient', width: 36, height: 18, topColor: '#0a1030', bottomColor: '#02030a' } },
    ],
  },
  {
    id: 'gradient-sweep',
    label: 'Gradient sweep',
    description: 'Floating product on a coloured sweep — no floor, big colour.',
    swatch: ['#2a3f7a', '#0a0d18'],
    background: { type: 'color', color: '#0b1020' },
    nodes: [
      { slot: 'backdrop', type: 'stage.backdrop', name: 'Sweep', transform: { position: [0, 1, -6] }, props: { mode: 'gradient', width: 34, height: 18, topColor: '#2a3f7a', bottomColor: '#0a0d18' } },
      { slot: 'key', type: 'light.directional', name: 'Key light', transform: { position: [-3, 4, 5] }, props: { intensity: 2.2, color: '#ffffff', castShadow: true } },
      { slot: 'rim', type: 'light.point', name: 'Edge light', transform: { position: [2.5, 1.5, -3] }, props: { intensity: 3.5, color: '#8fb4ff', distance: 18 } },
      { slot: 'ambient', type: 'light.ambient', name: 'Ambient', props: { intensity: 0.6, color: '#c9d7ff' } },
    ],
  },
  {
    id: 'overcast-outdoor',
    label: 'Overcast daylight',
    description: 'Soft daylight, hazy distance and a light floor.',
    swatch: ['#dbe6f2', '#9fb0c4'],
    background: { type: 'color', color: '#c8d4e2' },
    nodes: [
      { slot: 'ambient', type: 'light.ambient', name: 'Sky fill', props: { intensity: 1.6, color: '#e8f0ff' } },
      { slot: 'key', type: 'light.directional', name: 'Daylight', transform: { position: [-5, 7, 4] }, props: { intensity: 1.4, color: '#ffffff', castShadow: true } },
      { slot: 'ground', type: 'stage.ground', name: 'Ground', transform: { position: [0, -1.5, 0] }, props: { size: 40, color: '#b9c4d2', roughness: 0.95, metalness: 0 } },
      { slot: 'backdrop', type: 'stage.backdrop', name: 'Horizon', transform: { position: [0, 2, -12] }, props: { mode: 'gradient', width: 60, height: 26, topColor: '#dbe6f2', bottomColor: '#9fb0c4' } },
      { slot: 'fog', type: 'stage.fog', name: 'Atmosphere', props: { color: '#c8d4e2', near: 14, far: 46 } },
    ],
  },
];

export function getEnvironmentPreset(presetId: string): MotionEnvironmentPreset | undefined {
  return MOTION_ENVIRONMENT_PRESETS.find((preset) => preset.id === presetId);
}

/**
 * The op batch that materializes a preset on the active scene.
 * `makeId` is injected because reducers must never mint ids (replay must be
 * deterministic) — main and the renderer each supply their own generator.
 */
export function buildEnvironmentPresetOps(
  doc: MotionDocument,
  presetId: string,
  makeId: () => string,
): MotionOpRequest[] {
  const preset = getEnvironmentPreset(presetId);
  if (!preset) throw new Error(`Unknown environment preset "${presetId}".`);
  const scene = doc.scenes.find((candidate) => candidate.id === doc.activeSceneId);
  if (!scene) throw new Error('The active scene does not exist.');

  const ops: MotionOpRequest[] = [
    { op: 'scene.setBackground', sceneId: scene.id, background: preset.background },
  ];

  // A caller-supplied generator can theoretically collide with an existing id;
  // adding a duplicate id would abort the whole batch.
  const nextId = () => {
    let id = makeId();
    while (scene.nodes.some((node) => node.id === id)) id = makeId();
    return id;
  };

  const existing = new Map<string, MotionNode>();
  for (const node of scene.nodes) {
    const slot = node.props.environmentSlot;
    if (typeof slot === 'string' && slot.length > 0) existing.set(slot, node);
  }

  // Switching presets DEACTIVATES the previous rig rather than deleting it:
  // a preset batch stays a reversible (mutating) operation, and switching back
  // restores the rig the user had tuned. Group visibility cascades to children
  // in Three, and an invisible subtree contributes no lights.
  for (const node of scene.nodes) {
    if (
      node.visible &&
      node.type === 'scene.group' &&
      typeof node.props.environmentPreset === 'string' &&
      node.props.environmentPreset !== preset.id
    ) {
      ops.push({
        op: 'scene.node.update',
        nodeId: node.id,
        visible: false,
        props: { environmentPreset: node.props.environmentPreset },
      });
    }
  }

  const groupSlot = `${preset.id}:group`;
  const existingGroup = existing.get(groupSlot);
  const groupId = existingGroup?.id ?? nextId();
  const groupProps = { environmentPreset: preset.id, environmentSlot: groupSlot };
  if (existingGroup) {
    ops.push({
      op: 'scene.node.update',
      nodeId: groupId,
      name: preset.label,
      visible: true,
      props: groupProps,
    });
  } else {
    ops.push({ op: 'scene.node.add', nodeId: groupId, type: 'scene.group', name: preset.label, props: groupProps });
  }

  for (const spec of preset.nodes) {
    const slot = `${preset.id}:${spec.slot}`;
    const props = { ...spec.props, environmentPreset: preset.id, environmentSlot: slot };
    const found = existing.get(slot);
    if (found) {
      ops.push({
        op: 'scene.node.update',
        nodeId: found.id,
        ...(spec.name ? { name: spec.name } : {}),
        ...(spec.transform ? { transform: spec.transform } : {}),
        visible: true,
        props,
      });
    } else {
      ops.push({
        op: 'scene.node.add',
        nodeId: nextId(),
        type: spec.type,
        ...(spec.name ? { name: spec.name } : {}),
        parentId: groupId,
        ...(spec.transform ? { transform: spec.transform } : {}),
        props,
      });
    }
  }

  return ops;
}

/**
 * Preset currently applied to a scene: the visible rig group. Older rigs stay in
 * the document (hidden) so switching presets never destroys tuned work.
 */
export function activeEnvironmentPreset(scene: MotionScene | undefined): string | null {
  const groups = (scene?.nodes ?? []).filter(
    (node) =>
      node.type === 'scene.group' &&
      typeof node.props.environmentPreset === 'string' &&
      (node.props.environmentPreset as string).length > 0,
  );
  const active = groups.find((node) => node.visible) ?? groups[groups.length - 1];
  return (active?.props.environmentPreset as string | undefined) ?? null;
}

/**
 * Environment assets a scene's world references. Preflight and bundle
 * availability checks need this: `scene.background.assetId` is not inside node
 * props, so the generic prop walk never saw it.
 */
export function sceneWorldAssetIds(scene: MotionScene | undefined): string[] {
  return scene?.background?.type === 'environment' ? [scene.background.assetId] : [];
}
