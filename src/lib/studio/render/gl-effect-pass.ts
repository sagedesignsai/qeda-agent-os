/**
 * lib/studio/render/gl-effect-pass.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase 2 of the rendering roadmap: WebGL 2 effect passes over the Canvas 2D
 * compositor.
 *
 * WHY NOT `rasterize-webgl.ts`
 * ────────────────────────────
 * A whole-frame GPU rasterizer is the wrong next step. `export-renderer.ts`
 * spends most of its wall clock in `await seekTo(video)` on DOM decoders, so
 * replacing *drawing* buys little, while it would have to re-implement text,
 * chrome, device frames and every Canvas 2D idiom. Instead a single effect is
 * rendered into a cached offscreen WebGL canvas and composited back with
 * `drawImage`. That is the same shape `shader-background.ts` already ships, and
 * it leaves the compositor — and therefore preview/export parity — untouched.
 *
 * TWO PASS KINDS
 * ──────────────
 *   • readback  (color-grade, motion-blur)
 *       Reads the destination canvas region that has been painted so far,
 *       filters it, and composites the result back over the same region. This
 *       is adjustment-layer semantics: the pass sees everything below it.
 *
 *   • source    (chroma-key)
 *       Keying cannot work on a readback — once the clip is composited, the
 *       background it should reveal is already overwritten. The clip is drawn
 *       into a scratch 2D layer by the rasterizer and keyed here before it is
 *       composited, so `alpha = 0` genuinely reveals what is underneath.
 *
 * DETERMINISM
 * ───────────
 * Every uniform is derived from the display-list op (composition time, static
 * params, keyframed intensity) — no wall clock, no `Math.random()`. Preview and
 * export therefore run the identical shader with identical inputs.
 *
 * AVAILABILITY
 * ────────────
 * No feature flag: the pass is used whenever a WebGL 2 context can be created.
 * When it cannot (jsdom, `--disable-gpu`, context lost, shader compile failure)
 * every entry point returns `false`/`null` and the caller keeps the Canvas 2D
 * path, so degradation is local to one effect rather than the whole frame.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { StudioEffectType } from '../types';
import type { StudioWindowFrame } from './geometry';
import type { ChromaKeyParams } from './display-list';

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

export interface DeviceBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface AffineLike {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

interface QuadCorner {
  x: number;
  y: number;
  u: number;
  v: number;
}

// ── Engine ────────────────────────────────────────────────────────────────────

interface GlEngine {
  canvas: HTMLCanvasElement;
  gl: WebGL2RenderingContext;
  quad: WebGLBuffer;
  sourceTexture: WebGLTexture | null;
  programs: Map<string, WebGLProgram | null>;
}

let engine: GlEngine | null = null;
let probed = false;

/**
 * Lazily create the shared offscreen context. One context, one quad buffer for
 * the whole session: allocating per frame would thrash the GPU driver.
 */
function getEngine(): GlEngine | null {
  if (probed) return engine;
  probed = true;
  if (typeof document === 'undefined') return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    if (!gl) return null;
    const quad = gl.createBuffer();
    if (!quad) return null;
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    // Four vertices, (x, y, u, v) each; rewritten per pass.
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(16), gl.DYNAMIC_DRAW);
    engine = { canvas, gl, quad, sourceTexture: null, programs: new Map() };
    return engine;
  } catch {
    return null;
  }
}

/** True when GPU effect passes can run in this environment. */
export function isGpuEffectAvailable(): boolean {
  const current = getEngine();
  if (!current) return false;
  return !current.gl.isContextLost();
}

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function buildProgram(
  gl: WebGL2RenderingContext,
  fragmentSource: string,
): WebGLProgram | null {
  const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  if (!vs || !fs) {
    if (vs) gl.deleteShader(vs);
    if (fs) gl.deleteShader(fs);
    return null;
  }
  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    return null;
  }
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

/**
 * Compile-once cache. A `null` entry records a failed compile so a broken
 * shader is not retried on every frame.
 */
function getProgram(
  current: GlEngine,
  key: string,
  fragmentSource: string,
): WebGLProgram | null {
  const cached = current.programs.get(key);
  if (cached !== undefined) return cached;
  const program = buildProgram(current.gl, fragmentSource);
  current.programs.set(key, program);
  return program;
}

function uploadSourceTexture(
  current: GlEngine,
  source: CanvasImageSource,
): WebGLTexture | null {
  const { gl } = current;
  try {
    if (!current.sourceTexture) {
      current.sourceTexture = gl.createTexture();
      if (!current.sourceTexture) return null;
    }
    gl.bindTexture(gl.TEXTURE_2D, current.sourceTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    // Canvas sources are premultiplied; the shaders work in straight alpha and
    // premultiply on output.
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      source as TexImageSource,
    );
    return current.sourceTexture;
  } catch {
    return null;
  }
}

type UniformValue = number | readonly [number, number, number];

function drawQuad(
  current: GlEngine,
  program: WebGLProgram,
  width: number,
  height: number,
  corners: readonly QuadCorner[],
  uniforms: Record<string, UniformValue>,
): void {
  const { gl } = current;
  gl.viewport(0, 0, width, height);
  gl.useProgram(program);

  gl.bindBuffer(gl.ARRAY_BUFFER, current.quad);
  const data = new Float32Array(16);
  corners.forEach((corner, index) => {
    data.set([corner.x, corner.y, corner.u, corner.v], index * 4);
  });
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);

  const position = gl.getAttribLocation(program, 'a_pos');
  const uv = gl.getAttribLocation(program, 'a_uv');
  if (position >= 0) {
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 16, 0);
  }
  if (uv >= 0) {
    gl.enableVertexAttribArray(uv);
    gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, 16, 8);
  }

  gl.uniform2f(gl.getUniformLocation(program, 'u_resolution'), width, height);
  for (const [name, value] of Object.entries(uniforms)) {
    const location = gl.getUniformLocation(program, name);
    if (!location) continue;
    if (typeof value === 'number') {
      gl.uniform1f(location, value);
    } else {
      gl.uniform3f(location, value[0], value[1], value[2]);
    }
  }
  gl.uniform1i(gl.getUniformLocation(program, 'u_texture'), 0);

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

// ── Geometry helpers ──────────────────────────────────────────────────────────

/**
 * Axis-aligned device-space bounds of a rect under an affine transform.
 * Exported because the rasterizer needs the same projection to size its scratch
 * layer for source passes.
 */
export function deviceBounds(
  matrix: AffineLike,
  rect: { x: number; y: number; width: number; height: number },
): DeviceBounds | null {
  const corners: Array<[number, number]> = [
    [rect.x, rect.y],
    [rect.x + rect.width, rect.y],
    [rect.x + rect.width, rect.y + rect.height],
    [rect.x, rect.y + rect.height],
  ];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of corners) {
    const deviceX = matrix.a * x + matrix.c * y + matrix.e;
    const deviceY = matrix.b * x + matrix.d * y + matrix.f;
    minX = Math.min(minX, deviceX);
    maxX = Math.max(maxX, deviceX);
    minY = Math.min(minY, deviceY);
    maxY = Math.max(maxY, deviceY);
  }
  const x = Math.floor(minX);
  const y = Math.floor(minY);
  const width = Math.ceil(maxX) - x;
  const height = Math.ceil(maxY) - y;
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return null;
  }
  return { x, y, width, height };
}

function intersect(a: DeviceBounds, b: DeviceBounds): DeviceBounds | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  const width = right - x;
  const height = bottom - y;
  if (width <= 0 || height <= 0) return null;
  return { x, y, width, height };
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

function hexToRgb(color: string): [number, number, number] {
  const match = /^#?([0-9a-f]{6})$/i.exec(color.trim());
  if (!match) return [0, 1, 0];
  const value = Number.parseInt(match[1], 16);
  return [
    ((value >> 16) & 0xff) / 255,
    ((value >> 8) & 0xff) / 255,
    (value & 0xff) / 255,
  ];
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

  // Chroma key is a *source* pass, not a readback: by the time this runs the
  // pixels below have already been overwritten, and there is no destination
  // alpha that could reveal them again. Callers resolve it onto the media draw
  // (`drawKeyedSource`); running the shader here would key the wrong pixels
  // (with an unset key colour) instead of degrading cleanly.
  if (request.type === 'chroma-key') return false;

  const current = getEngine();
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
  const clipped = intersect(bounds, {
    x: 0,
    y: 0,
    width: canvas.width,
    height: canvas.height,
  });
  if (!clipped || clipped.width < 2 || clipped.height < 2) return false;

  const { gl } = current;
  const maxTexture = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || 4096;
  if (clipped.width > maxTexture || clipped.height > maxTexture) return false;

  const program = getProgram(current, type, SHADERS[type]);
  if (!program) return false;

  current.canvas.width = clipped.width;
  current.canvas.height = clipped.height;
  gl.viewport(0, 0, clipped.width, clipped.height);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  const texture = uploadSourceTexture(current, canvas);
  if (!texture) return false;
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);

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

  drawQuad(current, program, clipped.width, clipped.height, corners, uniforms);

  // Composite back in device space so the graded pixels land exactly where the
  // readback came from. A non-identity transform (a rotated clip effect) is
  // clipped to its own quad, otherwise the bounding box would grade its
  // neighbours.
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
 * Key a pre-composited clip layer.
 *
 * The caller draws the clip into a scratch 2D canvas (so rounded corners and
 * device frames keep their existing code path), then hands that layer here. The
 * returned canvas owns the keyed pixels and is composited in the clip's place;
 * `null` means "no GPU available, draw the layer unkeyed".
 */
export function applyChromaKeyCanvas(
  source: CanvasImageSource,
  width: number,
  height: number,
  params: ChromaKeyParams,
): HTMLCanvasElement | null {
  if (width < 2 || height < 2) return null;
  if (!(params.intensity > 0)) return null;

  const current = getEngine();
  if (!current) return null;
  const { gl } = current;
  if (gl.isContextLost()) return null;

  const program = getProgram(current, 'chroma-key', SHADERS['chroma-key']);
  if (!program) return null;

  current.canvas.width = width;
  current.canvas.height = height;
  gl.viewport(0, 0, width, height);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  const texture = uploadSourceTexture(current, source);
  if (!texture) return null;
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);

  const corners: QuadCorner[] = [
    { x: 0, y: 0, u: 0, v: 0 },
    { x: width, y: 0, u: 1, v: 0 },
    { x: 0, y: height, u: 0, v: 1 },
    { x: width, y: height, u: 1, v: 1 },
  ];

  drawQuad(current, program, width, height, corners, {
    u_intensity: Math.max(0, Math.min(1, params.intensity)),
    u_tolerance: Math.max(0, Math.min(1, params.tolerance)),
    u_softness: Math.max(0, Math.min(1, params.softness)),
    u_spill: Math.max(0, Math.min(1, params.spill)),
    u_keyColor: hexToRgb(params.keyColor),
  });

  return current.canvas;
}

// ── Source pass orchestration ────────────────────────────────────────────────

let keyedLayer: HTMLCanvasElement | null = null;
let keyedLayerWidth = 0;
let keyedLayerHeight = 0;

/** Scratch layer for source passes; resized in place, never re-allocated. */
function acquireKeyedLayer(
  width: number,
  height: number,
): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  if (!keyedLayer) keyedLayer = document.createElement('canvas');
  if (keyedLayerWidth !== width || keyedLayerHeight !== height) {
    keyedLayer.width = width;
    keyedLayer.height = height;
    keyedLayerWidth = width;
    keyedLayerHeight = height;
  }
  return keyedLayer;
}

/**
 * Draw a clip through a chroma-key source pass.
 *
 * The caller's `draw` callback paints the clip exactly as it would have on the
 * destination, but into a device-resolution scratch layer. That layer is keyed
 * on the GPU and composited back in device space, so alpha and blend state from
 * the destination context still apply to the final composite.
 *
 * Returns `false` — leaving the destination untouched — when keying cannot run
 * (no WebGL 2, no scratch canvas, empty region), so the caller can fall back to
 * painting the clip unkeyed.
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

  // Keep the scratch layer bounded by the destination canvas. A clip that is
  // partly off-screen still keys correctly because the layer origin moves with
  // the clipped region, not the clip's nominal AABB.
  const canvas = ctx.canvas as
    | HTMLCanvasElement
    | OffscreenCanvas
    | undefined;
  const region =
    canvas && canvas.width > 0 && canvas.height > 0
      ? intersect(bounds, {
          x: 0,
          y: 0,
          width: canvas.width,
          height: canvas.height,
        })
      : bounds;
  if (!region || region.width < 2 || region.height < 2) return false;

  const layer = acquireKeyedLayer(region.width, region.height);
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
  ctx.drawImage(keyed, region.x, region.y, region.width, region.height);
  ctx.restore();
  return true;
}

// ── Shaders ───────────────────────────────────────────────────────────────────

const VERTEX_SHADER = `#version 300 es
  precision highp float;

  in vec2 a_pos;
  in vec2 a_uv;
  uniform vec2 u_resolution;
  out vec2 v_uv;

  void main() {
    vec2 clip = a_pos / u_resolution * 2.0 - 1.0;
    gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
    v_uv = a_uv;
  }
`;

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
    // The drawing buffer is premultiplied.
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

    // Spill suppression: pull the keyed hue toward luma where it was removed.
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
