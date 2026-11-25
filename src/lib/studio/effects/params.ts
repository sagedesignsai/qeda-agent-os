/**
 * lib/studio/effects/params.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Effect parameter schema, validation, and persistence.
 *
 * Each effect type has a fixed set of static parameters (not keyframable).
 * This module defines the schema for each effect and provides validation
 * functions to ensure parameter values are within expected ranges and types.
 *
 * Usage:
 *   - getEffectParamSchema(effectType) - get the schema for an effect type
 *   - validateEffectParams(effectType, params) - validate params against schema
 *   - getDefaultParams(effectType) - get default values for all params
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { StudioEffectType } from '../types';

/**
 * Parameter definition for a single effect property.
 * Defines name, type, default value, and valid range.
 */
export interface EffectParamDef {
  name: string;
  type: 'number' | 'color' | 'boolean';
  default: number | string | boolean;
  min?: number;
  max?: number;
  step?: number;
  label: string;
  description?: string;
}

/**
 * Complete schema for an effect type.
 * Maps parameter names to their definitions.
 */
export interface EffectParamSchema {
  effectType: StudioEffectType;
  params: Record<string, EffectParamDef>;
}

/**
 * Spotlight effect parameters:
 * - radius: size of the spotlight ellipse (0–1, fraction of frame diagonal)
 * - colorHue: hue of the vignette darkening (0–360 degrees, but typically 0 for neutral black)
 * - feather: softness of the spotlight edge (0–100px)
 */
export const SPOTLIGHT_PARAM_SCHEMA: EffectParamSchema = {
  effectType: 'spotlight',
  params: {
    radius: {
      name: 'radius',
      type: 'number',
      default: 0.4,
      min: 0.1,
      max: 1,
      step: 0.05,
      label: 'Spotlight Size',
      description: 'Fraction of frame diagonal (0.1–1.0)',
    },
    colorHue: {
      name: 'colorHue',
      type: 'number',
      default: 0,
      min: 0,
      max: 360,
      step: 1,
      label: 'Vignette Hue',
      description: 'Hue angle in degrees (0–360)',
    },
    feather: {
      name: 'feather',
      type: 'number',
      default: 40,
      min: 0,
      max: 100,
      step: 5,
      label: 'Edge Feather',
      description: 'Softness of spotlight edge (0–100px)',
    },
  },
};

/**
 * Neon glow effect parameters:
 * - glowColor: CSS color for the bloom (default: cyan/indigo)
 * - blurRadius: blur radius in pixels for the bloom
 */
export const NEON_GLOW_PARAM_SCHEMA: EffectParamSchema = {
  effectType: 'neon-glow',
  params: {
    glowColor: {
      name: 'glowColor',
      type: 'color',
      default: '#4f46e5',
      label: 'Glow Color',
      description: 'Color of the ambient bloom',
    },
    blurRadius: {
      name: 'blurRadius',
      type: 'number',
      default: 40,
      min: 5,
      max: 100,
      step: 5,
      label: 'Blur Radius',
      description: 'Bloom blur in pixels (5–100px)',
    },
  },
};

/**
 * Vignette effect parameters:
 * - darknessFactor: how dark the vignette gets (0–1)
 * - falloff: gradient falloff from edge to center (0–1)
 */
export const VIGNETTE_PARAM_SCHEMA: EffectParamSchema = {
  effectType: 'vignette',
  params: {
    darknessFactor: {
      name: 'darknessFactor',
      type: 'number',
      default: 0.5,
      min: 0,
      max: 1,
      step: 0.1,
      label: 'Darkness',
      description: 'How dark the vignette edge becomes (0–1)',
    },
    falloff: {
      name: 'falloff',
      type: 'number',
      default: 0.6,
      min: 0,
      max: 1,
      step: 0.1,
      label: 'Falloff',
      description: 'Gradient falloff from edge to center (0–1)',
    },
  },
};

/**
 * Film grain effect parameters:
 * - grainSize: pixel size of grain (1–5px)
 * - grainAmount: density/opacity of grain (0–1)
 * - grainColor: grain color overlay (default: white for neutral look)
 */
export const FILM_GRAIN_PARAM_SCHEMA: EffectParamSchema = {
  effectType: 'film-grain',
  params: {
    grainSize: {
      name: 'grainSize',
      type: 'number',
      default: 1.5,
      min: 1,
      max: 5,
      step: 0.5,
      label: 'Grain Size',
      description: 'Pixel size of grain particles (1–5px)',
    },
    grainAmount: {
      name: 'grainAmount',
      type: 'number',
      default: 0.4,
      min: 0,
      max: 1,
      step: 0.1,
      label: 'Grain Amount',
      description: 'Density and opacity of grain (0–1)',
    },
    grainColor: {
      name: 'grainColor',
      type: 'color',
      default: '#ffffff',
      label: 'Grain Color',
      description: 'Base color of grain overlay',
    },
  },
};

/**
 * Scanlines effect parameters:
 * - lineSpacing: pixels between lines (1–10px)
 * - lineOpacity: opacity of scanline effect (0–1)
 * - lineColor: scanline color (default: black for CRT look)
 */
export const SCANLINES_PARAM_SCHEMA: EffectParamSchema = {
  effectType: 'scanlines',
  params: {
    lineSpacing: {
      name: 'lineSpacing',
      type: 'number',
      default: 2,
      min: 1,
      max: 10,
      step: 1,
      label: 'Line Spacing',
      description: 'Pixels between scanlines (1–10px)',
    },
    lineOpacity: {
      name: 'lineOpacity',
      type: 'number',
      default: 0.3,
      min: 0,
      max: 1,
      step: 0.1,
      label: 'Line Opacity',
      description: 'Darkness of scanlines (0–1)',
    },
    lineColor: {
      name: 'lineColor',
      type: 'color',
      default: '#000000',
      label: 'Line Color',
      description: 'Color of scanlines',
    },
  },
};

/**
 * Colour grading parameters (WebGL 2 pass):
 * - exposure: stops of exposure (-2 to +2)
 * - contrast: 1 = neutral
 * - saturation: 1 = neutral
 * - temperature: blue → warm white balance (-1 cool .. 1 warm)
 * - tint: green → magenta white balance (-1 green .. 1 magenta)
 */
export const COLOR_GRADE_PARAM_SCHEMA: EffectParamSchema = {
  effectType: 'color-grade',
  params: {
    exposure: {
      name: 'exposure',
      type: 'number',
      default: 0,
      min: -2,
      max: 2,
      step: 0.05,
      label: 'Exposure',
      description: 'Stops of exposure (-2 to +2)',
    },
    contrast: {
      name: 'contrast',
      type: 'number',
      default: 1,
      min: 0,
      max: 2,
      step: 0.05,
      label: 'Contrast',
      description: '1 is neutral',
    },
    saturation: {
      name: 'saturation',
      type: 'number',
      default: 1,
      min: 0,
      max: 2,
      step: 0.05,
      label: 'Saturation',
      description: '1 is neutral, 0 is monochrome',
    },
    temperature: {
      name: 'temperature',
      type: 'number',
      default: 0,
      min: -1,
      max: 1,
      step: 0.05,
      label: 'Temperature',
      description: 'White balance: -1 cool, 1 warm',
    },
    tint: {
      name: 'tint',
      type: 'number',
      default: 0,
      min: -1,
      max: 1,
      step: 0.05,
      label: 'Tint',
      description: 'White balance: -1 green, 1 magenta',
    },
  },
};

/**
 * Chroma key parameters (WebGL 2 source pass):
 * - keyColor: the background colour to remove
 * - tolerance: RGB distance that still counts as background (0–1)
 * - softness: width of the falloff edge (0–1)
 * - spill: how strongly the keyed hue is desaturated in kept pixels (0–1)
 */
export const CHROMA_KEY_PARAM_SCHEMA: EffectParamSchema = {
  effectType: 'chroma-key',
  params: {
    keyColor: {
      name: 'keyColor',
      type: 'color',
      default: '#00ff00',
      label: 'Key Colour',
      description: 'Background colour to remove',
    },
    tolerance: {
      name: 'tolerance',
      type: 'number',
      default: 0.28,
      min: 0,
      max: 1,
      step: 0.02,
      label: 'Tolerance',
      description: 'Colour distance treated as background (0–1)',
    },
    softness: {
      name: 'softness',
      type: 'number',
      default: 0.12,
      min: 0,
      max: 1,
      step: 0.02,
      label: 'Edge Softness',
      description: 'Width of the keyed edge falloff (0–1)',
    },
    spill: {
      name: 'spill',
      type: 'number',
      default: 0.6,
      min: 0,
      max: 1,
      step: 0.05,
      label: 'Spill Suppression',
      description: 'Desaturates keyed hue left on the subject (0–1)',
    },
  },
};

/**
 * Motion blur parameters (WebGL 2 pass):
 * - distance: smear length in pixels
 * - angle: direction in degrees
 * - samples: number of taps (2–24)
 */
export const MOTION_BLUR_PARAM_SCHEMA: EffectParamSchema = {
  effectType: 'motion-blur',
  params: {
    distance: {
      name: 'distance',
      type: 'number',
      default: 12,
      min: 0,
      max: 64,
      step: 1,
      label: 'Distance',
      description: 'Smear length in pixels',
    },
    angle: {
      name: 'angle',
      type: 'number',
      default: 0,
      min: -180,
      max: 180,
      step: 1,
      label: 'Angle',
      description: 'Direction of the smear in degrees',
    },
    samples: {
      name: 'samples',
      type: 'number',
      default: 8,
      min: 2,
      max: 24,
      step: 1,
      label: 'Samples',
      description: 'Number of blur taps (2–24)',
    },
  },
};

/**
 * Complete catalog of all effect parameter schemas.
 */
const PARAM_SCHEMAS: Map<StudioEffectType, EffectParamSchema> = new Map([
  ['spotlight', SPOTLIGHT_PARAM_SCHEMA],
  ['neon-glow', NEON_GLOW_PARAM_SCHEMA],
  ['vignette', VIGNETTE_PARAM_SCHEMA],
  ['film-grain', FILM_GRAIN_PARAM_SCHEMA],
  ['scanlines', SCANLINES_PARAM_SCHEMA],
  ['color-grade', COLOR_GRADE_PARAM_SCHEMA],
  ['chroma-key', CHROMA_KEY_PARAM_SCHEMA],
  ['motion-blur', MOTION_BLUR_PARAM_SCHEMA],
]);

/**
 * Get the parameter schema for a specific effect type.
 * Returns undefined if the effect type is unknown (e.g., 'zoom').
 */
export function getEffectParamSchema(
  effectType: StudioEffectType,
): EffectParamSchema | undefined {
  return PARAM_SCHEMAS.get(effectType);
}

/**
 * Get default parameter values for an effect type.
 * Returns an object with parameter names mapped to their default values.
 */
export function getDefaultParams(
  effectType: StudioEffectType,
): Record<string, number | string | boolean> {
  const schema = getEffectParamSchema(effectType);
  if (!schema) return {};

  const defaults: Record<string, number | string | boolean> = {};
  for (const [name, def] of Object.entries(schema.params)) {
    defaults[name] = def.default;
  }
  return defaults;
}

/**
 * Validate that params conform to the schema for the effect type.
 * Returns { valid: true } or { valid: false, errors: [...] }.
 */
export function validateEffectParams(
  effectType: StudioEffectType,
  params: Record<string, unknown>,
): { valid: true } | { valid: false; errors: string[] } {
  const schema = getEffectParamSchema(effectType);
  if (!schema) {
    // Unknown effect type (e.g., 'zoom') — no params validation needed
    return { valid: true };
  }

  const errors: string[] = [];

  for (const [name, def] of Object.entries(schema.params)) {
    const value = params[name];

    // Check type
    if (def.type === 'number') {
      if (value !== undefined && typeof value !== 'number') {
        errors.push(`${name}: expected number, got ${typeof value}`);
        continue;
      }
      // Check range if defined
      if (typeof value === 'number') {
        if (def.min !== undefined && value < def.min) {
          errors.push(`${name}: value ${value} is below minimum ${def.min}`);
        }
        if (def.max !== undefined && value > def.max) {
          errors.push(`${name}: value ${value} exceeds maximum ${def.max}`);
        }
      }
    } else if (def.type === 'color') {
      if (value !== undefined && typeof value !== 'string') {
        errors.push(`${name}: expected color string, got ${typeof value}`);
      }
    } else if (def.type === 'boolean') {
      if (value !== undefined && typeof value !== 'boolean') {
        errors.push(`${name}: expected boolean, got ${typeof value}`);
      }
    }
  }

  return errors.length > 0 ? { valid: false, errors } : { valid: true };
}

/**
 * Merge user-provided params with defaults for an effect type.
 * This ensures all parameters are present, filling in defaults where needed.
 */
export function normalizeEffectParams(
  effectType: StudioEffectType,
  userParams?: Partial<Record<string, number | string | boolean>>,
): Record<string, number | string | boolean> {
  const defaults = getDefaultParams(effectType);
  if (!userParams) return defaults;
  
  // Filter out undefined values from userParams
  const filtered: Record<string, number | string | boolean> = {};
  for (const [key, value] of Object.entries(userParams)) {
    if (value !== undefined) {
      filtered[key] = value;
    }
  }
  return { ...defaults, ...filtered };
}
