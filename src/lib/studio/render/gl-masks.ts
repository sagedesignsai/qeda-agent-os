/**
 * lib/studio/render/gl-masks.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * GPU source-pass masking and luminance keying over the shared WebGL 2 engine.
 *
 * Follows the same scratch-layer pattern as `drawKeyedSource` in
 * `gl-effect-pass.ts`: the clip is painted into a device-resolution 2D scratch
 * canvas, masked or luma-keyed on the GPU, and composited back in device space.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  acquireScratchLayer,
  deviceBounds,
  drawGlQuad,
  getGlEngine,
  getGlProgram,
  intersectBounds,
  uploadGlTexture,
  type AffineLike,
  type QuadCorner,
} from './gl-engine';

export interface LumaKeyParams {
  /** Luminance threshold (0..1). */
  threshold: number;
  /** Edge feather width (0..1). */
  softness: number;
  /** When true, keep darks and key out highlights instead of blacks. */
  invert?: boolean;
  /** 0..1 blend with unkeyed source. */
  intensity: number;
}

export interface ShapeMaskParams {
  shape: 'circle' | 'rect';
  /** Normalized center (0..1). */
  centerX: number;
  centerY: number;
  /** Normalized half-size / radius (0..1). */
  radiusX: number;
  radiusY: number;
  /** Normalized feather width (0..0.5). */
  feather: number;
  invert?: boolean;
}

/**
 * Apply a luminance key to a pre-composited clip layer on the GPU.
 * Returns `null` when WebGL 2 is unavailable.
 */
export function applyLumaKeyCanvas(
  source: CanvasImageSource,
  width: number,
  height: number,
  params: LumaKeyParams,
): HTMLCanvasElement | null {
  if (width < 2 || height < 2) return null;
  if (!(params.intensity > 0)) return null;

  const current = getGlEngine();
  if (!current || current.gl.isContextLost()) return null;

  const program = getGlProgram(current, 'mask:luma-key', FRAGMENT_LUMA_KEY);
  if (!program) return null;

  const { gl } = current;
  current.canvas.width = width;
  current.canvas.height = height;
  gl.viewport(0, 0, width, height);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  if (!uploadGlTexture(current, source, 0)) return null;

  const corners: QuadCorner[] = [
    { x: 0, y: 0, u: 0, v: 0 },
    { x: width, y: 0, u: 1, v: 0 },
    { x: 0, y: height, u: 0, v: 1 },
    { x: width, y: height, u: 1, v: 1 },
  ];

  drawGlQuad(current, program, width, height, corners, {
    u_threshold: Math.max(0, Math.min(1, params.threshold)),
    u_softness: Math.max(0.001, Math.min(1, params.softness)),
    u_invert: params.invert ? 1 : 0,
    u_intensity: Math.max(0, Math.min(1, params.intensity)),
  });

  return current.canvas;
}

/**
 * Apply a feathered elliptical or rectangular mask to a clip layer on the GPU.
 * Returns `null` when WebGL 2 is unavailable.
 */
export function applyShapeMaskCanvas(
  source: CanvasImageSource,
  width: number,
  height: number,
  params: ShapeMaskParams,
): HTMLCanvasElement | null {
  if (width < 2 || height < 2) return null;

  const current = getGlEngine();
  if (!current || current.gl.isContextLost()) return null;

  const program = getGlProgram(current, 'mask:shape', FRAGMENT_SHAPE_MASK);
  if (!program) return null;

  const { gl } = current;
  current.canvas.width = width;
  current.canvas.height = height;
  gl.viewport(0, 0, width, height);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  if (!uploadGlTexture(current, source, 0)) return null;

  const corners: QuadCorner[] = [
    { x: 0, y: 0, u: 0, v: 0 },
    { x: width, y: 0, u: 1, v: 0 },
    { x: 0, y: height, u: 0, v: 1 },
    { x: width, y: height, u: 1, v: 1 },
  ];

  drawGlQuad(current, program, width, height, corners, {
    u_shape: params.shape === 'rect' ? 1 : 0,
    u_center: [params.centerX, params.centerY],
    u_radius: [Math.max(0.01, params.radiusX), Math.max(0.01, params.radiusY)],
    u_feather: Math.max(0.001, Math.min(0.5, params.feather)),
    u_invert: params.invert ? 1 : 0,
  });

  return current.canvas;
}

/**
 * Draw a clip through a GPU mask or luma-key source pass.
 * Returns `false` when WebGL 2 or scratch canvas is unavailable.
 */
export function drawMaskedSource(
  ctx: CanvasRenderingContext2D,
  rect: { x: number; y: number; width: number; height: number },
  pass:
    | { kind: 'luma-key'; params: LumaKeyParams }
    | { kind: 'shape'; params: ShapeMaskParams },
  draw: (layerCtx: CanvasRenderingContext2D) => void,
): boolean {
  if (pass.kind === 'luma-key' && !(pass.params.intensity > 0)) return false;
  if (typeof ctx.getTransform !== 'function') return false;

  let ctm: AffineLike;
  try {
    ctm = ctx.getTransform();
  } catch {
    return false;
  }

  const bounds = deviceBounds(ctm, rect);
  if (!bounds) return false;

  const canvas = ctx.canvas as
    | HTMLCanvasElement
    | OffscreenCanvas
    | undefined;
  const region =
    canvas && canvas.width > 0 && canvas.height > 0
      ? intersectBounds(bounds, {
          x: 0,
          y: 0,
          width: canvas.width,
          height: canvas.height,
        })
      : bounds;
  if (!region || region.width < 2 || region.height < 2) return false;

  const layer = acquireScratchLayer(region.width, region.height);
  if (!layer) return false;
  const layerCtx = layer.getContext('2d');
  if (!layerCtx) return false;

  layerCtx.setTransform(1, 0, 0, 1, 0, 0);
  layerCtx.clearRect(0, 0, region.width, region.height);
  layerCtx.setTransform(
    ctm.a,
    ctm.b,
    ctm.c,
    ctm.d,
    ctm.e - region.x,
    ctm.f - region.y,
  );
  draw(layerCtx);
  layerCtx.setTransform(1, 0, 0, 1, 0, 0);

  const masked =
    pass.kind === 'luma-key'
      ? applyLumaKeyCanvas(layer, region.width, region.height, pass.params)
      : applyShapeMaskCanvas(layer, region.width, region.height, pass.params);
  if (!masked) return false;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(masked, region.x, region.y, region.width, region.height);
  ctx.restore();
  return true;
}

// ── Fragment Shaders ──────────────────────────────────────────────────────────

const FRAGMENT_LUMA_KEY = `#version 300 es
  precision highp float;
  uniform sampler2D u_texture;
  uniform float u_threshold;
  uniform float u_softness;
  uniform float u_invert;
  uniform float u_intensity;
  in vec2 v_uv;
  out vec4 outColor;

  void main() {
    vec4 src = texture(u_texture, v_uv);
    float luma = dot(src.rgb, vec3(0.2126, 0.7152, 0.0722));
    float keep = smoothstep(u_threshold, u_threshold + u_softness, luma);
    if (u_invert > 0.5) keep = 1.0 - keep;
    float alpha = mix(1.0, keep, u_intensity) * src.a;
    outColor = vec4(src.rgb * alpha, alpha);
  }
`;

const FRAGMENT_SHAPE_MASK = `#version 300 es
  precision highp float;
  uniform sampler2D u_texture;
  uniform float u_shape;
  uniform vec2 u_center;
  uniform vec2 u_radius;
  uniform float u_feather;
  uniform float u_invert;
  in vec2 v_uv;
  out vec4 outColor;

  void main() {
    vec4 src = texture(u_texture, v_uv);
    vec2 d = abs(v_uv - u_center) / max(u_radius, vec2(0.001));
    float dist = u_shape > 0.5 ? max(d.x, d.y) : length(d);
    float keep = 1.0 - smoothstep(1.0 - u_feather, 1.0 + u_feather, dist);
    if (u_invert > 0.5) keep = 1.0 - keep;
    float alpha = keep * src.a;
    outColor = vec4(src.rgb * alpha, alpha);
  }
`;
