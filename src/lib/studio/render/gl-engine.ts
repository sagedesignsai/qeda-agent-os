/**
 * lib/studio/render/gl-engine.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared WebGL 2 offscreen engine for Studio GPU passes.
 *
 * All GPU modules (effects, transitions, masks/keying) share one lazily-created
 * WebGL 2 context, one dynamic quad buffer, and one program cache so allocating
 * per frame never thrashes the GPU driver.
 *
 * When WebGL 2 is unavailable (jsdom, `--disable-gpu`, context lost, or shader
 * compile failure), every entry point returns `null` / `false` cleanly.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface DeviceBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AffineLike {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export interface QuadCorner {
  x: number;
  y: number;
  u: number;
  v: number;
}

export type UniformValue =
  | number
  | readonly [number, number]
  | readonly [number, number, number]
  | readonly [number, number, number, number];

export interface GlEngine {
  canvas: HTMLCanvasElement;
  gl: WebGL2RenderingContext;
  quad: WebGLBuffer;
  textures: Map<number, WebGLTexture>;
  programs: Map<string, WebGLProgram | null>;
}

const VERTEX_SHADER = `#version 300 es
  precision highp float;

  in vec2 a_pos;
  in vec2 a_uv;
  uniform vec2 u_resolution;
  out vec2 v_uv;

  void main() {
    vec2 clip = (a_pos / u_resolution) * 2.0 - 1.0;
    gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
    v_uv = a_uv;
  }
`;

let engine: GlEngine | null = null;
let probed = false;

/**
 * Lazily create the shared offscreen WebGL 2 context.
 * Returns `null` when WebGL 2 is unavailable or context creation fails.
 */
export function getGlEngine(): GlEngine | null {
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
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(16), gl.DYNAMIC_DRAW);
    engine = {
      canvas,
      gl,
      quad,
      textures: new Map(),
      programs: new Map(),
    };
    return engine;
  } catch {
    return null;
  }
}

/** True when GPU passes can run in this environment. */
export function isGlAvailable(): boolean {
  const current = getGlEngine();
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
 * Compile-once program cache. A `null` entry records a failed compile so a
 * broken shader is not retried on every frame.
 */
export function getGlProgram(
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

/**
 * Upload a `CanvasImageSource` into a cached texture slot (e.g. unit 0 or 1).
 */
export function uploadGlTexture(
  current: GlEngine,
  source: CanvasImageSource,
  unit = 0,
): WebGLTexture | null {
  const { gl } = current;
  try {
    let texture = current.textures.get(unit) ?? null;
    if (!texture) {
      texture = gl.createTexture();
      if (!texture) return null;
      current.textures.set(unit, texture);
    }
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
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
    return texture;
  } catch {
    return null;
  }
}

/**
 * Draw a textured quad with the specified corners and uniform values.
 */
export function drawGlQuad(
  current: GlEngine,
  program: WebGLProgram,
  width: number,
  height: number,
  corners: readonly QuadCorner[],
  uniforms: Record<string, UniformValue>,
  samplers: Record<string, number> = { u_texture: 0 },
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
    } else if (value.length === 2) {
      gl.uniform2f(location, value[0], value[1]);
    } else if (value.length === 3) {
      gl.uniform3f(location, value[0], value[1], value[2]);
    } else if (value.length === 4) {
      gl.uniform4f(location, value[0], value[1], value[2], value[3]);
    }
  }
  for (const [samplerName, unit] of Object.entries(samplers)) {
    const location = gl.getUniformLocation(program, samplerName);
    if (location) gl.uniform1i(location, unit);
  }

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

// ── Shared Geometry & Scratch Layer Helpers ───────────────────────────────────

/** Axis-aligned device-space bounds of a rect under an affine transform. */
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

export function intersectBounds(
  a: DeviceBounds,
  b: DeviceBounds,
): DeviceBounds | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  const width = right - x;
  const height = bottom - y;
  if (width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}

export function hexToRgbNormalized(color: string): [number, number, number] {
  const match = /^#?([0-9a-f]{6})$/i.exec(color.trim());
  if (!match) return [0, 1, 0];
  const value = Number.parseInt(match[1], 16);
  return [
    ((value >> 16) & 0xff) / 255,
    ((value >> 8) & 0xff) / 255,
    (value & 0xff) / 255,
  ];
}

let scratchLayer: HTMLCanvasElement | null = null;
let scratchLayerWidth = 0;
let scratchLayerHeight = 0;

/** Reusable 2D scratch canvas for source passes; resized in place. */
export function acquireScratchLayer(
  width: number,
  height: number,
): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  if (!scratchLayer) scratchLayer = document.createElement('canvas');
  if (scratchLayerWidth !== width || scratchLayerHeight !== height) {
    scratchLayer.width = width;
    scratchLayer.height = height;
    scratchLayerWidth = width;
    scratchLayerHeight = height;
  }
  return scratchLayer;
}
