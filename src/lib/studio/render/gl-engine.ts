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

interface GlProgramLocations {
  position: number;
  uv: number;
  uniforms: Map<string, WebGLUniformLocation | null>;
}

export interface GlEngine {
  canvas: HTMLCanvasElement;
  gl: WebGL2RenderingContext;
  quad: WebGLBuffer;
  quadData: Float32Array;
  textures: Map<number, WebGLTexture>;
  textureSizes: Map<number, { width: number; height: number }>;
  programs: Map<string, WebGLProgram | null>;
  locations: Map<WebGLProgram, GlProgramLocations>;
  maxTextureSize: number;
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
const DEFAULT_SAMPLERS = { u_texture: 0 };

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
    const quadData = new Float32Array(16);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, quadData, gl.DYNAMIC_DRAW);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    engine = {
      canvas,
      gl,
      quad,
      quadData,
      textures: new Map(),
      textureSizes: new Map(),
      programs: new Map(),
      locations: new Map(),
      maxTextureSize: Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || 4096,
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
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    }
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    const image = source as TexImageSource & {
      width?: number;
      height?: number;
      naturalWidth?: number;
      naturalHeight?: number;
      videoWidth?: number;
      videoHeight?: number;
    };
    const width = Number(image.videoWidth || image.naturalWidth || image.width);
    const height = Number(image.videoHeight || image.naturalHeight || image.height);
    const size = current.textureSizes.get(unit);
    if (
      width > 0 &&
      height > 0 &&
      Number.isFinite(width) &&
      Number.isFinite(height) &&
      size?.width === width &&
      size.height === height
    ) {
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        source as TexImageSource,
      );
    } else {
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        source as TexImageSource,
      );
      if (width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height)) {
        current.textureSizes.set(unit, { width, height });
      }
    }
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
  samplers: Record<string, number> = DEFAULT_SAMPLERS,
): void {
  const { gl } = current;
  gl.viewport(0, 0, width, height);
  gl.useProgram(program);

  gl.bindBuffer(gl.ARRAY_BUFFER, current.quad);
  const data = current.quadData;
  for (let index = 0; index < corners.length; index += 1) {
    const corner = corners[index];
    const offset = index * 4;
    data[offset] = corner.x;
    data[offset + 1] = corner.y;
    data[offset + 2] = corner.u;
    data[offset + 3] = corner.v;
  }
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);

  let locations = current.locations.get(program);
  if (!locations) {
    locations = {
      position: gl.getAttribLocation(program, 'a_pos'),
      uv: gl.getAttribLocation(program, 'a_uv'),
      uniforms: new Map(),
    };
    current.locations.set(program, locations);
  }
  const position = locations.position;
  const uv = locations.uv;
  if (position >= 0) {
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 16, 0);
  }
  if (uv >= 0) {
    gl.enableVertexAttribArray(uv);
    gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, 16, 8);
  }

  const getUniformLocation = (name: string) => {
    if (locations.uniforms.has(name)) return locations.uniforms.get(name) ?? null;
    const location = gl.getUniformLocation(program, name);
    locations.uniforms.set(name, location);
    return location;
  };
  const resolution = getUniformLocation('u_resolution');
  if (resolution) gl.uniform2f(resolution, width, height);
  for (const name in uniforms) {
    const value = uniforms[name];
    const location = getUniformLocation(name);
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
  for (const samplerName in samplers) {
    const location = getUniformLocation(samplerName);
    const unit = samplers[samplerName];
    if (location) gl.uniform1i(location, unit);
  }

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

/** Grow the reusable draw buffer only when a pass exceeds its current size. */
export function ensureGlCanvasSize(
  current: GlEngine,
  width: number,
  height: number,
): void {
  const nextWidth = Math.max(current.canvas.width, width);
  const nextHeight = Math.max(current.canvas.height, height);
  if (nextWidth === current.canvas.width && nextHeight === current.canvas.height) {
    return;
  }
  current.canvas.width = nextWidth;
  current.canvas.height = nextHeight;
}

/** Prepare only the requested viewport while retaining the larger backbuffer. */
export function prepareGlCanvas(
  current: GlEngine,
  width: number,
  height: number,
): void {
  ensureGlCanvasSize(current, width, height);
  const { gl } = current;
  gl.viewport(0, 0, width, height);
  gl.clearColor(0, 0, 0, 0);
  gl.enable(gl.SCISSOR_TEST);
  gl.scissor(0, 0, width, height);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.disable(gl.SCISSOR_TEST);
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
