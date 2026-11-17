/**
 * lib/motion/look-presets.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Starting points for the look stack, as op batches.
 *
 * A preset is just a set of `fx.*` nodes with tuned props. Nothing is hidden
 * behind it: every value lands in the inspector and every slider stays live, so
 * a preset is a first draft, not a mode.
 */

import type { MotionEntityKind } from './ids';
import type { MotionOpRequest } from './ops';

export type MotionLookPresetId =
  | 'cinematic'
  | 'clean-tech'
  | 'warm-film'
  | 'noir'
  | 'anamorphic'
  | 'vhs';

type LookNodeSpec = { type: string; name: string; props: Record<string, unknown> };

export type MotionLookPreset = {
  id: MotionLookPresetId;
  label: string;
  description: string;
};

const PRESETS: Record<MotionLookPresetId, MotionLookPreset & { nodes: LookNodeSpec[] }> = {
  cinematic: {
    id: 'cinematic',
    label: 'Cinematic',
    description: 'Scope framing, gentle bloom, warm grade and a little grain.',
    nodes: [
      { type: 'fx.grade', name: 'Grade', props: { exposure: 0.05, contrast: 0.18, saturation: 0.08, temperature: 0.12, tint: 0.02 } },
      { type: 'fx.bloom', name: 'Bloom', props: { intensity: 0.5, threshold: 0.85, smoothing: 0.35 } },
      { type: 'fx.vignette', name: 'Vignette', props: { offset: 0.35, darkness: 0.55 } },
      { type: 'fx.grain', name: 'Grain', props: { amount: 0.18 } },
      { type: 'fx.letterbox', name: 'Letterbox', props: { aspect: 2.39, opacity: 1 } },
    ],
  },
  'clean-tech': {
    id: 'clean-tech',
    label: 'Clean tech',
    description: 'Crisp highlights, neutral colour and the faintest edge separation.',
    nodes: [
      { type: 'fx.grade', name: 'Grade', props: { exposure: 0.05, contrast: 0.08, saturation: 0.04, temperature: -0.1, tint: 0 } },
      { type: 'fx.bloom', name: 'Bloom', props: { intensity: 0.4, threshold: 0.92, smoothing: 0.25 } },
      { type: 'fx.chroma', name: 'Chroma', props: { offset: 0.0008, radial: true, modulationOffset: 0.25 } },
      { type: 'fx.vignette', name: 'Vignette', props: { offset: 0.2, darkness: 0.32 } },
    ],
  },
  'warm-film': {
    id: 'warm-film',
    label: 'Warm film',
    description: 'Golden highlights, soft contrast and visible grain — 35mm-ish.',
    nodes: [
      { type: 'fx.grade', name: 'Grade', props: { exposure: 0.1, contrast: 0.12, saturation: 0.12, temperature: 0.35, tint: 0.05 } },
      { type: 'fx.bloom', name: 'Bloom', props: { intensity: 0.35, threshold: 0.8, smoothing: 0.4 } },
      { type: 'fx.vignette', name: 'Vignette', props: { offset: 0.3, darkness: 0.5 } },
      { type: 'fx.grain', name: 'Grain', props: { amount: 0.35 } },
      { type: 'fx.letterbox', name: 'Letterbox', props: { aspect: 1.85, opacity: 1 } },
    ],
  },
  noir: {
    id: 'noir',
    label: 'Noir',
    description: 'Monochrome, hard contrast and heavy falloff.',
    nodes: [
      { type: 'fx.grade', name: 'Grade', props: { exposure: -0.15, contrast: 0.4, saturation: -1, temperature: -0.2, tint: 0 } },
      { type: 'fx.vignette', name: 'Vignette', props: { offset: 0.5, darkness: 0.8 } },
      { type: 'fx.grain', name: 'Grain', props: { amount: 0.45 } },
      { type: 'fx.letterbox', name: 'Letterbox', props: { aspect: 2.39, opacity: 1 } },
    ],
  },
  anamorphic: {
    id: 'anamorphic',
    label: 'Anamorphic',
    description: 'Wide bloom and edge splitting — a lens with character.',
    nodes: [
      { type: 'fx.grade', name: 'Grade', props: { exposure: 0.02, contrast: 0.12, saturation: 0.06, temperature: 0.05, tint: 0 } },
      { type: 'fx.bloom', name: 'Bloom', props: { intensity: 1.1, threshold: 0.7, smoothing: 0.5 } },
      { type: 'fx.chroma', name: 'Chroma', props: { offset: 0.003, radial: true, modulationOffset: 0.1 } },
      { type: 'fx.grain', name: 'Grain', props: { amount: 0.12 } },
      { type: 'fx.letterbox', name: 'Letterbox', props: { aspect: 2.39, opacity: 1 } },
    ],
  },
  vhs: {
    id: 'vhs',
    label: 'VHS',
    description: 'Chromatic smear, soft colour and coarse noise.',
    nodes: [
      { type: 'fx.grade', name: 'Grade', props: { exposure: 0.08, contrast: -0.05, saturation: 0.2, temperature: 0.2, tint: -0.05 } },
      { type: 'fx.chroma', name: 'Chroma', props: { offset: 0.006, radial: false, modulationOffset: 0 } },
      { type: 'fx.vignette', name: 'Vignette', props: { offset: 0.25, darkness: 0.45 } },
      { type: 'fx.grain', name: 'Grain', props: { amount: 0.6 } },
    ],
  },
};

export function listLookPresets(): MotionLookPreset[] {
  return Object.values(PRESETS).map(({ id, label, description }) => ({ id, label, description }));
}

export function expandLookPreset(
  presetId: MotionLookPresetId | string,
  options: { existingLookNodeIds?: readonly string[] } = {},
  idFactory: (kind: MotionEntityKind) => string = (kind) => `${kind}-${Math.random().toString(36).slice(2, 8)}`,
): MotionOpRequest[] {
  const preset = PRESETS[presetId as MotionLookPresetId];
  if (!preset) throw new Error(`Unknown look preset: "${presetId}"`);

  const ops: MotionOpRequest[] = [];
  // Replacing the previous look keeps the mental model "one look per shot".
  // Removing the nodes is an explicit, undoable op — not a hidden reset.
  for (const nodeId of options.existingLookNodeIds ?? []) {
    ops.push({ op: 'scene.node.remove', nodeId });
  }
  for (const node of preset.nodes) {
    ops.push({
      op: 'scene.node.add',
      nodeId: idFactory('scene'),
      type: node.type,
      name: node.name,
      props: node.props,
      transform: { position: [0, 0, 0] },
    });
  }
  return ops;
}
