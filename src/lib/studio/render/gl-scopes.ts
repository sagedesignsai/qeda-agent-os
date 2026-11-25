/**
 * lib/studio/render/gl-scopes.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Color analysis scopes (RGB + Luma histograms) and film LUT presets that map
 * cleanly to `color-grade` shader parameters.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface ColorScopesData {
  bins: number;
  r: Uint32Array;
  g: Uint32Array;
  b: Uint32Array;
  luma: Uint32Array;
  maxCount: number;
  pixelCount: number;
}

/**
 * Compute normalized RGB and Rec.709 luminance histograms from RGBA pixel data.
 */
export function computeColorScopes(
  rgba: Uint8ClampedArray | Uint8Array,
  bins = 64,
  stride = 4,
): ColorScopesData {
  const safeBins = Math.max(8, Math.min(256, Math.floor(bins)));
  const safeStride = Math.max(1, Math.floor(stride));
  const r = new Uint32Array(safeBins);
  const g = new Uint32Array(safeBins);
  const b = new Uint32Array(safeBins);
  const luma = new Uint32Array(safeBins);

  let maxCount = 0;
  let pixelCount = 0;
  const scale = (safeBins - 1) / 255;

  for (let i = 0; i + 3 < rgba.length; i += 4 * safeStride) {
    const a = rgba[i + 3];
    if (a === 0) continue;

    const rv = rgba[i];
    const gv = rgba[i + 1];
    const bv = rgba[i + 2];
    const lv = Math.round(0.2126 * rv + 0.7152 * gv + 0.0722 * bv);

    const ri = Math.min(safeBins - 1, Math.floor(rv * scale));
    const gi = Math.min(safeBins - 1, Math.floor(gv * scale));
    const bi = Math.min(safeBins - 1, Math.floor(bv * scale));
    const li = Math.min(safeBins - 1, Math.floor(lv * scale));

    r[ri] += 1;
    g[gi] += 1;
    b[bi] += 1;
    luma[li] += 1;

    maxCount = Math.max(maxCount, r[ri], g[gi], b[bi], luma[li]);
    pixelCount += 1;
  }

  return { bins: safeBins, r, g, b, luma, maxCount, pixelCount };
}

export interface ColorLutPreset {
  id: string;
  label: string;
  params: {
    exposure: number;
    contrast: number;
    saturation: number;
    temperature: number;
    tint: number;
  };
}

/**
 * Named look presets that map directly to `color-grade` uniforms.
 */
export const COLOR_LUT_PRESETS: readonly ColorLutPreset[] = [
  {
    id: 'teal-orange',
    label: 'Teal & Orange',
    params: { exposure: 0.08, contrast: 1.18, saturation: 1.15, temperature: 0.25, tint: -0.08 },
  },
  {
    id: 'matte-film',
    label: 'Matte Film',
    params: { exposure: 0.05, contrast: 0.92, saturation: 0.85, temperature: 0.12, tint: 0.04 },
  },
  {
    id: 'noir-mono',
    label: 'Noir Monochrome',
    params: { exposure: -0.05, contrast: 1.35, saturation: 0, temperature: 0, tint: 0 },
  },
  {
    id: 'crisp-product',
    label: 'Crisp Product',
    params: { exposure: 0.12, contrast: 1.1, saturation: 1.08, temperature: -0.05, tint: 0 },
  },
];

export function resolveColorLutParams(
  presetId: string,
): ColorLutPreset['params'] | null {
  const found = COLOR_LUT_PRESETS.find((preset) => preset.id === presetId);
  return found ? { ...found.params } : null;
}
