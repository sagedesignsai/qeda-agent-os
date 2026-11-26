/**
 * lib/studio/render/gl-effect-pass.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase 2 of the rendering roadmap: WebGL 2 effect passes over the Canvas 2D
 * compositor.
 *
 * Delegates context, program caching, texture upload, quad drawing, and bounds
 * math to `./gl-engine.ts` so every GPU pass shares one WebGL 2 context.
 *
 * TWO PASS KINDS
 * ──────────────
 *   • readback  (color-grade, motion-blur)
 *       Reads the destination canvas region that has been painted so far,
 *       filters it, and composites the result back over the same region.
 *   • source    (chroma-key)
 *       Draws the clip into a scratch 2D layer, keys it on the GPU, and
 *       composites it back so `alpha = 0` reveals layers underneath.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { StudioEffectType } from '../types';
import type { StudioWindowFrame } from './geometry';
import type { ChromaKeyParams } from './display-list';
import {
  acquireScratchLayer,
  deviceBounds,
  drawGlQuad,
  getGlEngine,
  getGlProgram,
  hexToRgbNormalized,
  intersectBounds,
  isGlAvailable,
  prepareGlCanvas,
  uploadGlTexture,
  type AffineLike,
  type DeviceBounds,
  type QuadCorner,
  type UniformValue,
} from './gl-engine';

export type { DeviceBounds };
export { deviceBounds };

// ── Types ─────────────────────────────────────────────────────────────────────

/** Effect types that have a GPU implementation. */
export type GpuEffectType = 'color-grade' | 'chroma-key' | 'motion-blur';

const GPU_EFFECT_TYPES: ReadonlySet<string> = new Set<GpuEffectType>([
  'color-grade',
  'chroma-key',
  'motion-blur',
]);

export function isGpuEffectType(type: StudioEffectType | string): type is GpuEffectType {
  return GPU_EFFECT_TYPES.has(type);
}

export type GpuEffectParams = Record<string, number | string | boolean>;

export interface GpuEffectRequest {
  type: GpuEffectType;
  /** 0..1 — 0 is a no-op, 1 is the fully resolved parameter set. */
  intensity: number;
  frame: StudioWindowFrame;
  /** Composition time; kept for time-varying grades. */
  timeMs: number;
  params?: GpuEffectParams;
  /**
   * Target box in the caller's *local* transform space. Absent means the whole
   * content box (a lane-level, full-frame pass).
   */
  rect?: { x: number; y: number; width: number; height: number };
}

/** True when GPU effect passes can run in this environment. */
export function isGpuEffectAvailable(): boolean {
  return isGlAvailable();
}

// ── Parameter helpers ─────────────────────────────────────────────────────────

function numberParam(
  params: GpuEffectParams | undefined,
  key: string,
  fallback: number,
): number {
  const value = params?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

// ── Readback pass ─────────────────────────────────────────────────────────────

/**
 * Run one readback effect pass. Returns `false` — leaving the frame untouched —
 * whenever a WebGL 2 context, the destination canvas or the shader is
 * unavailable, so the caller can fall back to Canvas 2D.
 */
export function renderGpuEffectPass(
  ctx: CanvasRenderingContext2D,
  request: GpuEffectRequest,
): boolean {
  const intensity = Math.max(0, Math.min(1, request.intensity));
  if (intensity <= 0) return false;

  // Chroma key is a *source* pass, not a readback.
  if (request.type === 'chroma-key') return false;

  const current = getGlEngine();
  if (!current) return false;
  if (current.gl.isContextLost()) return false;

  const canvas = ctx.canvas as HTMLCanvasElement | OffscreenCanvas | undefined;
  if (!canvas || typeof ctx.getTransform !== 'function') return false;
  if (!canvas.width || !canvas.height) return false;

  const { frame, params, rect, type } = request;
  const target = rect ?? {
    x: frame.contentX,
    y: frame.contentY,
    width: frame.contentWidth,
    height: frame.contentHeight,
  };
  if (target.width < 1 || target.height < 1) return false;

  let matrix: AffineLike;
  try {
    matrix = ctx.getTransform();
  } catch {
    return false;
  }

  const bounds = deviceBounds(matrix, target);
  if (!bounds) return false;
  const clipped = intersectBounds(bounds, {
    x: 0,
    y: 0,
    width: canvas.width,
    height: canvas.height,
  });
  if (!clipped || clipped.width < 2 || clipped.height < 2) return false;

  const { gl } = current;
  const maxTexture = current.maxTextureSize;
  if (clipped.width > maxTexture || clipped.height > maxTexture) return false;

  const program = getGlProgram(current, `fx:${type}`, SHADERS[type]);
  if (!program) return false;

  prepareGlCanvas(current, clipped.width, clipped.height);

  const texture = uploadGlTexture(current, canvas, 0);
  if (!texture) return false;

  const u0 = clipped.x / canvas.width;
  const v0 = clipped.y / canvas.height;
  const u1 = (clipped.x + clipped.width) / canvas.width;
  const v1 = (clipped.y + clipped.height) / canvas.height;
  const corners: QuadCorner[] = [
    { x: 0, y: 0, u: u0, v: v0 },
    { x: clipped.width, y: 0, u: u1, v: v0 },
    { x: 0, y: clipped.height, u: u0, v: v1 },
    { x: clipped.width, y: clipped.height, u: u1, v: v1 },
  ];

  const uniforms: Record<string, UniformValue> = { u_intensity: intensity };
  if (type === 'color-grade') {
    uniforms.u_exposure = numberParam(params, 'exposure', 0);
    uniforms.u_contrast = numberParam(params, 'contrast', 1);
    uniforms.u_saturation = numberParam(params, 'saturation', 1);
    uniforms.u_temperature = numberParam(params, 'temperature', 0);
    uniforms.u_tint = numberParam(params, 'tint', 0);
  } else if (type === 'motion-blur') {
    uniforms.u_distance = numberParam(params, 'distance', 12);
    uniforms.u_angle = (numberParam(params, 'angle', 0) * Math.PI) / 180;
    uniforms.u_samples = numberParam(params, 'samples', 8);
  }

  drawGlQuad(current, program, clipped.width, clipped.height, corners, uniforms);

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (rect) {
    ctx.beginPath();
    const points: Array<[number, number]> = [
      [target.x, target.y],
      [target.x + target.width, target.y],
      [target.x + target.width, target.y + target.height],
      [target.x, target.y + target.height],
    ];
    points.forEach(([x, y], index) => {
      const deviceX = matrix.a * x + matrix.c * y + matrix.e;
      const deviceY = matrix.b * x + matrix.d * y + matrix.f;
      if (index === 0) ctx.moveTo(deviceX, deviceY);
      else ctx.lineTo(deviceX, deviceY);
    });
    ctx.closePath();
    ctx.clip();
  }
  ctx.drawImage(
    current.canvas,
    0,
    0,
    clipped.width,
    clipped.height,
    clipped.x,
    clipped.y,
    clipped.width,
    clipped.height,
  );
  ctx.restore();

  return true;
}

// ── Source pass (chroma key) ──────────────────────────────────────────────────

/**
 * Key a pre-composited clip layer on the GPU.
 * Returns `null` when WebGL 2 is unavailable so the caller draws unkeyed.
 */
export function applyChromaKeyCanvas(
  source: CanvasImageSource,
  width: number,
  height: number,
  params: ChromaKeyParams,
): HTMLCanvasElement | null {
  if (width < 2 || height < 2) return null;
  if (!(params.intensity > 0)) return null;

  const current = getGlEngine();
  if (!current) return null;
  const { gl } = current;
  if (gl.isContextLost()) return null;

  const program = getGlProgram(
    current,
    'fx:chroma-key',
    SHADERS['chroma-key'],
  );
  if (!program) return null;

  prepareGlCanvas(current, width, height);

  const texture = uploadGlTexture(current, source, 0);
  if (!texture) return null;

  const corners: QuadCorner[] = [
    { x: 0, y: 0, u: 0, v: 0 },
    { x: width, y: 0, u: 1, v: 0 },
    { x: 0, y: height, u: 0, v: 1 },
    { x: width, y: height, u: 1, v: 1 },
  ];

  drawGlQuad(current, program, width, height, corners, {
    u_intensity: Math.max(0, Math.min(1, params.intensity)),
    u_tolerance: Math.max(0, Math.min(1, params.tolerance)),
    u_softness: Math.max(0, Math.min(1, params.softness)),
    u_spill: Math.max(0, Math.min(1, params.spill)),
    u_keyColor: hexToRgbNormalized(params.keyColor),
  });

  return current.canvas;
}

/**
 * Draw a clip through a chroma-key source pass.
 */
export function drawKeyedSource(
  ctx: CanvasRenderingContext2D,
  rect: { x: number; y: number; width: number; height: number },
  chromaKey: ChromaKeyParams,
  draw: (layerCtx: CanvasRenderingContext2D) => void,
): boolean {
  if (!(chromaKey.intensity > 0)) return false;
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

  const keyed = applyChromaKeyCanvas(
    layer,
    region.width,
    region.height,
    chromaKey,
  );
  if (!keyed) return false;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(
    keyed,
    0,
    0,
    region.width,
    region.height,
    region.x,
    region.y,
    region.width,
    region.height,
  );
  ctx.restore();
  return true;
}

// ── Fragment Shaders ──────────────────────────────────────────────────────────

const FRAGMENT_COLOR_GRADE = `#version 300 es
  precision highp float;

  uniform sampler2D u_texture;
  uniform float u_intensity;
  uniform float u_exposure;
  uniform float u_contrast;
  uniform float u_saturation;
  uniform float u_temperature;
  uniform float u_tint;
  in vec2 v_uv;
  out vec4 outColor;

  void main() {
    vec4 src = texture(u_texture, v_uv);
    vec3 c = src.rgb;

    c *= exp2(u_exposure);
    c *= vec3(
      1.0 + u_temperature * 0.16,
      1.0 + u_tint * 0.06,
      1.0 - u_temperature * 0.16
    );
    c = (c - 0.5) * u_contrast + 0.5;

    float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = mix(vec3(luma), c, u_saturation);
    c = clamp(c, 0.0, 1.0);

    c = mix(src.rgb, c, clamp(u_intensity, 0.0, 1.0));
    outColor = vec4(c * src.a, src.a);
  }
`;

const FRAGMENT_MOTION_BLUR = `#version 300 es
  precision highp float;

  uniform sampler2D u_texture;
  uniform vec2 u_resolution;
  uniform float u_intensity;
  uniform float u_distance;
  uniform float u_angle;
  uniform float u_samples;
  in vec2 v_uv;
  out vec4 outColor;

  void main() {
    vec4 src = texture(u_texture, v_uv);
    int samples = int(clamp(u_samples, 2.0, 24.0));
    vec2 dir = vec2(cos(u_angle), sin(u_angle))
      * max(u_distance, 0.0) / max(u_resolution, vec2(1.0));

    vec3 acc = vec3(0.0);
    float weight = 0.0;
    for (int i = 0; i < 24; i++) {
      if (i >= samples) break;
      float t = float(i) / float(samples - 1) - 0.5;
      float w = 1.0 - abs(t) * 0.7;
      acc += texture(u_texture, v_uv + dir * t).rgb * w;
      weight += w;
    }

    vec3 blurred = acc / max(weight, 1e-4);
    vec3 c = mix(src.rgb, blurred, clamp(u_intensity, 0.0, 1.0));
    outColor = vec4(c * src.a, src.a);
  }
`;

const FRAGMENT_CHROMA_KEY = `#version 300 es
  precision highp float;

  uniform sampler2D u_texture;
  uniform vec3 u_keyColor;
  uniform float u_intensity;
  uniform float u_tolerance;
  uniform float u_softness;
  uniform float u_spill;
  in vec2 v_uv;
  out vec4 outColor;

  void main() {
    vec4 src = texture(u_texture, v_uv);
    float distanceToKey = length(src.rgb - u_keyColor);
    float soft = max(u_softness, 0.001);
    float keep = smoothstep(u_tolerance, u_tolerance + soft, distanceToKey);

    float alpha = mix(1.0, keep, clamp(u_intensity, 0.0, 1.0)) * src.a;

    float luma = dot(src.rgb, vec3(0.2126, 0.7152, 0.0722));
    vec3 graded = mix(src.rgb, vec3(luma), clamp(u_spill, 0.0, 1.0) * (1.0 - keep));

    outColor = vec4(graded * alpha, alpha);
  }
`;

const SHADERS: Record<GpuEffectType, string> = {
  'color-grade': FRAGMENT_COLOR_GRADE,
  'chroma-key': FRAGMENT_CHROMA_KEY,
  'motion-blur': FRAGMENT_MOTION_BLUR,
};
