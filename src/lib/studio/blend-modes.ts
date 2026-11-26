/**
 * lib/studio/blend-modes.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Canonical blend-mode metadata shared by the renderer, the Inspector and the
 * command bar. Blend modes are persisted as strings on `clip.payload.blendMode`
 * and resolved to a Canvas `globalCompositeOperation` at draw time.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { BlendMode } from './render/display-list';

export interface StudioBlendModeOption {
  value: BlendMode;
  label: string;
  /** Short, plain-language explanation shown in the picker. */
  description: string;
  group: 'Normal' | 'Darken' | 'Lighten' | 'Contrast' | 'Comparative' | 'Component';
}

export const STUDIO_BLEND_MODES: StudioBlendModeOption[] = [
  {
    value: 'source-over',
    label: 'Normal',
    description: 'Draws the clip normally over the layers below.',
    group: 'Normal',
  },
  {
    value: 'multiply',
    label: 'Multiply',
    description: 'Darkens by multiplying colour values; great for shadows and texture.',
    group: 'Darken',
  },
  {
    value: 'darken',
    label: 'Darken',
    description: 'Keeps whichever pixel is darker, layer or background.',
    group: 'Darken',
  },
  {
    value: 'color-burn',
    label: 'Color Burn',
    description: 'Deepens the background using the clip colours.',
    group: 'Darken',
  },
  {
    value: 'screen',
    label: 'Screen',
    description: 'Brightens by inverting, multiplying and inverting again.',
    group: 'Lighten',
  },
  {
    value: 'lighten',
    label: 'Lighten',
    description: 'Keeps whichever pixel is lighter, layer or background.',
    group: 'Lighten',
  },
  {
    value: 'color-dodge',
    label: 'Color Dodge',
    description: 'Brightens the background toward the clip colours.',
    group: 'Lighten',
  },
  {
    value: 'overlay',
    label: 'Overlay',
    description: 'Combines multiply and screen for punchy contrast.',
    group: 'Contrast',
  },
  {
    value: 'soft-light',
    label: 'Soft Light',
    description: 'A gentle version of overlay for subtle shading.',
    group: 'Contrast',
  },
  {
    value: 'hard-light',
    label: 'Hard Light',
    description: 'Strong contrast that follows the clip brightness.',
    group: 'Contrast',
  },
  {
    value: 'difference',
    label: 'Difference',
    description: 'Subtracts the darker colour from the lighter one.',
    group: 'Comparative',
  },
  {
    value: 'exclusion',
    label: 'Exclusion',
    description: 'Like difference but with lower contrast.',
    group: 'Comparative',
  },
  {
    value: 'lighter',
    label: 'Add',
    description: 'Adds colour values together for glowing highlights.',
    group: 'Comparative',
  },
  {
    value: 'hue',
    label: 'Hue',
    description: 'Keeps the background luminance with the clip hue.',
    group: 'Component',
  },
  {
    value: 'saturation',
    label: 'Saturation',
    description: 'Keeps the background hue and luminance with clip saturation.',
    group: 'Component',
  },
  {
    value: 'color',
    label: 'Color',
    description: 'Keeps the background luminance with the clip hue and saturation.',
    group: 'Component',
  },
  {
    value: 'luminosity',
    label: 'Luminosity',
    description: 'Keeps the background colour with the clip luminance.',
    group: 'Component',
  },
];

const BLEND_MODE_OPTION_BY_VALUE = new Map(
  STUDIO_BLEND_MODES.map((option) => [option.value, option]),
);

export function getBlendModeOption(
  value: string | undefined,
): StudioBlendModeOption {
  return (
    (value ? BLEND_MODE_OPTION_BY_VALUE.get(value as BlendMode) : undefined) ??
    STUDIO_BLEND_MODES[0]
  );
}

/** Resolve a persisted string to a Canvas composite operation. */
export function blendModeToComposite(
  value: string | undefined,
): GlobalCompositeOperation {
  return getBlendModeOption(value).value as GlobalCompositeOperation;
}

/** True when the mode changes how the clip composites. */
export function isNonDefaultBlendMode(value: string | undefined): boolean {
  return Boolean(value && value !== 'source-over');
}