/**
 * lib/motion/nodes/effects.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Look nodes: the post-processing stack, authored as scene content.
 *
 * They live in the node graph on purpose. A look is then keyable (`intensity`
 * is just another animatable property), mutable (`visible`), groupable, undoable
 * and reachable by the engine manifest — all for free. The renderer collects
 * them in pipeline order and turns them into composer passes; they have no
 * Three geometry and never appear in the viewport's spatial selection.
 *
 * Everything here is pure data: no Three, no WebGL, so jest can exercise the
 * parameter clamping and ordering without a graphics context.
 */

import { z } from 'zod';

import type { MotionNodeTypeDefinition, MotionPropertyHint } from './definition';

const slider = (
  label: string,
  group: string,
  min: number,
  max: number,
  step: number,
): MotionPropertyHint => ({ label, control: 'slider', group, min, max, step });

const bloom: MotionNodeTypeDefinition = {
  id: 'fx.bloom',
  label: 'Bloom',
  category: 'fx',
  description: 'Glow around bright areas — highlights, emissive parts and practical lights.',
  defaultName: 'Bloom',
  propsSchema: z.object({
    intensity: z.number().min(0).max(5),
    threshold: z.number().min(0).max(1),
    smoothing: z.number().min(0).max(1),
  }),
  defaultProps: { intensity: 0.7, threshold: 0.8, smoothing: 0.3 },
  animatableProperties: {
    intensity: { description: 'Bloom strength.' },
    threshold: { description: 'Luminance above which a pixel starts to glow.' },
    smoothing: { description: 'Softness of the bloom threshold.' },
  },
  propertyHints: {
    intensity: slider('Intensity', 'Bloom', 0, 5, 0.01),
    threshold: slider('Threshold', 'Bloom', 0, 1, 0.01),
    smoothing: slider('Smoothing', 'Bloom', 0, 1, 0.01),
  },
};

const grade: MotionNodeTypeDefinition = {
  id: 'fx.grade',
  label: 'Color grade',
  category: 'fx',
  description: 'Exposure, contrast, saturation and a warm/cool temperature push.',
  defaultName: 'Grade',
  propsSchema: z.object({
    exposure: z.number().min(-3).max(3),
    contrast: z.number().min(-1).max(1),
    saturation: z.number().min(-1).max(1),
    temperature: z.number().min(-1).max(1),
    tint: z.number().min(-1).max(1),
  }),
  defaultProps: { exposure: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0 },
  animatableProperties: {
    exposure: { description: 'Exposure in stops.' },
    contrast: { description: 'Contrast, -1 to 1.' },
    saturation: { description: 'Saturation, -1 to 1.' },
    temperature: { description: 'Warm (+) to cool (−) balance.' },
    tint: { description: 'Magenta (+) to green (−) balance.' },
  },
  propertyHints: {
    exposure: slider('Exposure', 'Color', -3, 3, 0.01),
    contrast: slider('Contrast', 'Color', -1, 1, 0.01),
    saturation: slider('Saturation', 'Color', -1, 1, 0.01),
    temperature: slider('Temperature', 'Color', -1, 1, 0.01),
    tint: slider('Tint', 'Color', -1, 1, 0.01),
  },
};

const vignette: MotionNodeTypeDefinition = {
  id: 'fx.vignette',
  label: 'Vignette',
  category: 'fx',
  description: 'Darkens the frame corners so the eye stays on the subject.',
  defaultName: 'Vignette',
  propsSchema: z.object({
    offset: z.number().min(0).max(1),
    darkness: z.number().min(0).max(1),
  }),
  defaultProps: { offset: 0.3, darkness: 0.55 },
  animatableProperties: {
    offset: { description: 'Where the falloff begins, 0 centre to 1 edge.' },
    darkness: { description: 'Corner darkness.' },
  },
  propertyHints: {
    offset: slider('Offset', 'Vignette', 0, 1, 0.01),
    darkness: slider('Darkness', 'Vignette', 0, 1, 0.01),
  },
};

const grain: MotionNodeTypeDefinition = {
  id: 'fx.grain',
  label: 'Film grain',
  category: 'fx',
  description: 'Fine luma noise that keeps gradients from looking too clean.',
  defaultName: 'Grain',
  propsSchema: z.object({
    amount: z.number().min(0).max(1),
  }),
  defaultProps: { amount: 0.22 },
  animatableProperties: {
    amount: { description: 'Grain strength.' },
  },
  propertyHints: {
    amount: slider('Amount', 'Film grain', 0, 1, 0.01),
  },
};

const chroma: MotionNodeTypeDefinition = {
  id: 'fx.chroma',
  label: 'Chromatic aberration',
  category: 'fx',
  description: 'Splits red and blue toward the edges — a subtle lens fingerprint.',
  defaultName: 'Chroma',
  propsSchema: z.object({
    offset: z.number().min(0).max(0.01),
    radial: z.boolean(),
    modulationOffset: z.number().min(0).max(1),
  }),
  defaultProps: { offset: 0.0015, radial: true, modulationOffset: 0.15 },
  animatableProperties: {
    offset: { description: 'Channel separation in UV units.' },
  },
  propertyHints: {
    offset: slider('Offset', 'Lens', 0, 0.01, 0.0001),
    radial: { label: 'Edge weighted', control: 'toggle', group: 'Lens' },
    modulationOffset: slider('Falloff', 'Lens', 0, 1, 0.01),
  },
};

const letterbox: MotionNodeTypeDefinition = {
  id: 'fx.letterbox',
  label: 'Letterbox',
  category: 'fx',
  description: 'Bakes in a widescreen frame — bars top and bottom, or sides for square.',
  defaultName: 'Letterbox',
  propsSchema: z.object({
    aspect: z.number().min(1).max(3.5),
    opacity: z.number().min(0).max(1),
  }),
  defaultProps: { aspect: 2.39, opacity: 1 },
  animatableProperties: {
    aspect: { description: 'Frame aspect ratio, e.g. 2.39 for scope.' },
    opacity: { description: 'Bar opacity.' },
  },
  propertyHints: {
    aspect: slider('Aspect', 'Framing', 1, 3.5, 0.01),
    opacity: slider('Opacity', 'Framing', 0, 1, 0.01),
  },
};

export const effectNodes: readonly MotionNodeTypeDefinition[] = [
  bloom,
  grade,
  vignette,
  grain,
  chroma,
  letterbox,
];
