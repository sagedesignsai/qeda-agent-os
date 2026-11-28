/**
 * components/motion/export/shader-compositor.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * GPU compositor for sequence transitions. The export stage already owns two
 * scene canvases; this uploads them as textures and runs a full-screen fragment
 * shader between them. It renders to its own canvas, which the 2D export canvas
 * then copies into the encoder frame.
 *
 * WebGL1 + GLSL ES 1.00 is deliberate: Electron always exposes it, and every
 * shader stays readable instead of depending on a WebGL2 extension.
 */

import {
  MOTION_SHADER_TRANSITIONS,
  type MotionShaderTransitionName,
} from '@/lib/motion/transitions';

const VERTEX_SOURCE = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const HEADER = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_from;
uniform sampler2D u_to;
uniform float u_progress;
uniform vec2 u_resolution;
uniform vec3 u_accent;
uniform vec3 u_accent_dark;
uniform vec3 u_accent_bright;
`;

const NOISE = `
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 5; i++) {
    v += a * vnoise(p);
    p = r * p * 2.02;
    a *= 0.5;
  }
  return v;
}
`;

const FRAGMENTS: Record<MotionShaderTransitionName, string> = {
  'domain-warp': `
${HEADER}
${NOISE}
void main() {
  vec2 q = vec2(fbm(v_uv * 3.0), fbm(v_uv * 3.0 + vec2(5.2, 1.3)));
  vec2 r = vec2(fbm(v_uv * 3.0 + q * 4.0 + vec2(1.7, 9.2)),
                fbm(v_uv * 3.0 + q * 4.0 + vec2(8.3, 2.8)));
  float n = fbm(v_uv * 3.0 + r * 2.0);
  vec2 warp = (q - 0.5) * 0.4;
  vec4 a = texture2D(u_from, clamp(v_uv + warp * u_progress, 0.0, 1.0));
  vec4 b = texture2D(u_to, clamp(v_uv - warp * (1.0 - u_progress), 0.0, 1.0));
  float edge = smoothstep(u_progress - 0.08, u_progress + 0.08, n);
  float rim = smoothstep(0.1, 0.0, abs(n - u_progress)) * (1.0 - step(1.0, u_progress));
  gl_FragColor = vec4(mix(b, a, edge).rgb + mix(u_accent_dark, u_accent_bright, rim) * rim * 2.0, 1.0);
}
`,
  'ridged-burn': `
${HEADER}
${NOISE}
float ridged(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 5; i++) {
    v += a * abs(vnoise(p) * 2.0 - 1.0);
    p = r * p * 2.02;
    a *= 0.5;
  }
  return v;
}
void main() {
  vec4 a = texture2D(u_from, v_uv);
  vec4 b = texture2D(u_to, v_uv);
  float n = ridged(v_uv * 4.0);
  float edge = smoothstep(u_progress - 0.04, u_progress + 0.04, n);
  float heat = smoothstep(0.12, 0.0, abs(n - u_progress)) * (1.0 - step(1.0, u_progress));
  vec3 burn = mix(u_accent_dark, u_accent, smoothstep(0.0, 0.25, heat));
  burn = mix(burn, u_accent_bright, smoothstep(0.25, 0.5, heat));
  burn = mix(burn, vec3(1.0), smoothstep(0.5, 1.0, heat));
  float sparks = step(0.92, vnoise(v_uv * 80.0)) * heat * 3.0;
  gl_FragColor = vec4(mix(b, a, edge).rgb + burn * heat * 3.5 + u_accent_bright * sparks, 1.0);
}
`,
  'whip-pan': `
${HEADER}
void main() {
  float fromOffset = u_progress * 1.5;
  vec3 fromColor = vec3(0.0);
  for (int i = 0; i < 10; i++) {
    float f = float(i) / 10.0;
    vec2 uv = vec2(v_uv.x + fromOffset + u_progress * 0.08 * f, v_uv.y);
    fromColor += texture2D(u_from, clamp(uv, 0.0, 1.0)).rgb;
  }
  fromColor /= 10.0;
  float toOffset = (1.0 - u_progress) * 1.5;
  vec3 toColor = vec3(0.0);
  for (int i = 0; i < 10; i++) {
    float f = float(i) / 10.0;
    vec2 uv = vec2(v_uv.x - toOffset - (1.0 - u_progress) * 0.08 * f, v_uv.y);
    toColor += texture2D(u_to, clamp(uv, 0.0, 1.0)).rgb;
  }
  toColor /= 10.0;
  gl_FragColor = vec4(mix(fromColor, toColor, u_progress), 1.0);
}
`,
  'sdf-iris': `
${HEADER}
void main() {
  vec4 a = texture2D(u_from, v_uv);
  vec4 b = texture2D(u_to, v_uv);
  vec2 uv = (v_uv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0);
  float dist = length(uv);
  float radius = u_progress * 1.2;
  float fw = 0.003;
  float edge = smoothstep(radius + fw, radius - fw, dist);
  float ring = exp(-abs(dist - radius) * 25.0)
             + exp(-abs(dist - radius + 0.04) * 20.0) * 0.5
             + exp(-abs(dist - radius + 0.08) * 15.0) * 0.25;
  float glow = ring * u_progress * (1.0 - u_progress) * 4.0;
  gl_FragColor = vec4(mix(a, b, edge).rgb + u_accent_bright * glow * 0.6, 1.0);
}
`,
  'ripple-waves': `
${HEADER}
void main() {
  vec2 uv = v_uv - 0.5;
  float dist = length(uv);
  vec2 dir = normalize(uv + 0.001);
  float fromAmp = u_progress * 0.04;
  float fw1 = exp(sin(dist * 25.0 - u_progress * 12.0) - 1.0);
  float fw2 = exp(sin(dist * 50.0 - u_progress * 18.0) - 1.0) * 0.5;
  vec2 fromUv = clamp(v_uv + dir * (fw1 + fw2) * fromAmp, 0.0, 1.0);
  float toAmp = (1.0 - u_progress) * 0.04;
  float tw1 = exp(sin(dist * 25.0 + u_progress * 12.0) - 1.0);
  float tw2 = exp(sin(dist * 50.0 + u_progress * 18.0) - 1.0) * 0.5;
  vec2 toUv = clamp(v_uv - dir * (tw1 + tw2) * toAmp, 0.0, 1.0);
  vec4 a = texture2D(u_from, fromUv);
  vec4 b = texture2D(u_to, toUv);
  vec3 tint = u_accent_bright * fw1 * u_progress * 0.1;
  gl_FragColor = vec4(mix(a.rgb + tint, b.rgb, u_progress), 1.0);
}
`,
  'gravitational-lens': `
${HEADER}
void main() {
  vec4 b = texture2D(u_to, v_uv);
  vec2 uv = v_uv - 0.5;
  float dist = length(uv);
  float pull = u_progress * 2.0;
  float warp = pull * 0.3 / (dist + 0.1);
  vec2 warped = clamp(v_uv - uv * warp, 0.0, 1.0);
  vec4 a = texture2D(u_from, warped);
  float horizon = smoothstep(0.0, 0.3, dist / (1.0 - u_progress * 0.85 + 0.001));
  float shift = pull * 0.02 / (dist + 0.2);
  float r = texture2D(u_from, clamp(v_uv - uv * (warp + shift), 0.0, 1.0)).r;
  float bl = texture2D(u_from, clamp(v_uv - uv * (warp - shift), 0.0, 1.0)).b;
  vec3 lensed = vec3(r, a.g, bl) * mix(1.0, horizon, smoothstep(0.0, 0.3, u_progress));
  gl_FragColor = vec4(mix(lensed, b.rgb, smoothstep(0.3, 0.9, u_progress)), 1.0);
}
`,
  'cinematic-zoom': `
${HEADER}
void main() {
  vec2 d = v_uv - vec2(0.5);
  float fromScale = u_progress * 0.08;
  float toScale = (1.0 - u_progress) * 0.06;
  vec3 fromColor = vec3(0.0);
  vec3 toColor = vec3(0.0);
  for (int i = 0; i < 12; i++) {
    float f = float(i) / 12.0;
    fromColor += texture2D(u_from, v_uv - d * fromScale * f).rgb;
    toColor += texture2D(u_to, v_uv + d * toScale * f).rgb;
  }
  gl_FragColor = vec4(mix(fromColor / 12.0, toColor / 12.0, u_progress), 1.0);
}
`,
  'chromatic-split': `
${HEADER}
void main() {
  vec2 c = v_uv - 0.5;
  float fromShift = u_progress * 0.06;
  float r1 = texture2D(u_from, clamp(v_uv + c * fromShift, 0.0, 1.0)).r;
  float g1 = texture2D(u_from, v_uv).g;
  float b1 = texture2D(u_from, clamp(v_uv - c * fromShift, 0.0, 1.0)).b;
  float toShift = (1.0 - u_progress) * 0.06;
  float r2 = texture2D(u_to, clamp(v_uv - c * toShift, 0.0, 1.0)).r;
  float g2 = texture2D(u_to, v_uv).g;
  float b2 = texture2D(u_to, clamp(v_uv + c * toShift, 0.0, 1.0)).b;
  gl_FragColor = vec4(mix(vec3(r1, g1, b1), vec3(r2, g2, b2), u_progress), 1.0);
}
`,
  glitch: `
${HEADER}
${NOISE}
float rand(vec2 co) {
  return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}
void main() {
  float intensity = u_progress * (1.0 - u_progress) * 4.0;
  float lineY = floor(v_uv.y * 60.0) / 60.0;
  float lineShift = (rand(vec2(lineY, floor(u_progress * 17.0))) - 0.5) * 0.18 * intensity;
  vec2 block = floor(v_uv * vec2(12.0, 8.0));
  float blockRand = rand(block + vec2(floor(u_progress * 11.0)));
  float blockAmount = step(0.83, blockRand) * intensity;
  vec2 blockShift = (vec2(rand(block * 2.1), rand(block * 3.7)) - 0.5) * 0.35 * blockAmount;
  vec2 uv = clamp(v_uv + vec2(lineShift, 0.0) + blockShift, 0.0, 1.0);
  float shift = intensity * 0.035;
  float r = texture2D(u_from, uv + vec2(shift, 0.0)).r;
  float g = texture2D(u_from, uv).g;
  float b = texture2D(u_from, uv - vec2(shift, 0.0)).b;
  vec3 fromColor = vec3(r, g, b);
  fromColor += u_accent_bright * step(0.985, rand(block)) * intensity;
  gl_FragColor = vec4(mix(fromColor, texture2D(u_to, v_uv).rgb, u_progress), 1.0);
}
`,
  'swirl-vortex': `
${HEADER}
void main() {
  vec2 uv = v_uv - 0.5;
  float dist = length(uv);
  float angle = u_progress * 6.2832 * (1.0 - smoothstep(0.0, 0.7, dist));
  float s = sin(angle);
  float c = cos(angle);
  vec2 rotated = vec2(uv.x * c - uv.y * s, uv.x * s + uv.y * c) + 0.5;
  vec4 a = texture2D(u_from, clamp(rotated, 0.0, 1.0));
  vec4 b = texture2D(u_to, v_uv);
  float ring = smoothstep(0.08, 0.0, abs(dist - u_progress * 0.5)) * 0.35;
  gl_FragColor = vec4(mix(a, b, u_progress).rgb + u_accent_bright * ring, 1.0);
}
`,
  'thermal-distortion': `
${HEADER}
${NOISE}
void main() {
  float shimmer = (vnoise(vec2(v_uv.x * 18.0, v_uv.y * 6.0 + u_progress * 9.0)) - 0.5);
  vec2 fromUv = clamp(v_uv + vec2(shimmer * 0.012, -0.004) * u_progress, 0.0, 1.0);
  vec2 toUv = clamp(v_uv + vec2(shimmer * 0.006, 0.0) * (1.0 - u_progress), 0.0, 1.0);
  vec4 a = texture2D(u_from, fromUv);
  vec4 b = texture2D(u_to, toUv);
  float heat = smoothstep(0.0, 0.45, u_progress) * (1.0 - smoothstep(0.55, 1.0, u_progress));
  vec3 warm = u_accent * heat * 0.08 * (1.0 - v_uv.y);
  gl_FragColor = vec4(mix(a, b, u_progress).rgb + warm, 1.0);
}
`,
  'flash-through-white': `
${HEADER}
void main() {
  vec4 a = texture2D(u_from, v_uv);
  vec4 b = texture2D(u_to, v_uv);
  float white = 1.0 - abs(u_progress * 2.0 - 1.0);
  white = pow(white, 1.6);
  vec3 color = mix(a.rgb, b.rgb, smoothstep(0.45, 0.55, u_progress));
  color = mix(color, vec3(1.0), white);
  gl_FragColor = vec4(color, 1.0);
}
`,
  'cross-warp-morph': `
${HEADER}
${NOISE}
void main() {
  vec2 warp = vec2(fbm(v_uv * 4.0), fbm(v_uv * 4.0 + vec2(3.7, 8.1))) - 0.5;
  vec4 a = texture2D(u_from, clamp(v_uv + warp * 0.16 * u_progress, 0.0, 1.0));
  vec4 b = texture2D(u_to, clamp(v_uv - warp * 0.16 * (1.0 - u_progress), 0.0, 1.0));
  float noise = fbm(v_uv * 5.0 + u_progress * 2.0);
  float edge = smoothstep(0.35, 0.65, noise + (u_progress - 0.5) * 0.7);
  gl_FragColor = vec4(mix(a, b, edge).rgb, 1.0);
}
`,
  'light-leak': `
${HEADER}
${NOISE}
void main() {
  vec4 a = texture2D(u_from, v_uv);
  vec4 b = texture2D(u_to, v_uv);
  vec2 p = v_uv - vec2(0.85, 0.8);
  float leak = exp(-length(p) * 5.0) * (0.4 + 0.6 * u_progress);
  leak += exp(-length(v_uv - vec2(0.1, 0.25)) * 8.0) * (1.0 - u_progress) * 0.6;
  vec3 warm = mix(u_accent, u_accent_bright, vnoise(v_uv * 12.0 + u_progress));
  vec3 base = mix(a.rgb, b.rgb, smoothstep(0.1, 0.9, u_progress));
  gl_FragColor = vec4(base + warm * leak * 0.9, 1.0);
}
`,
};

function compileShader(
  gl: WebGLRenderingContext,
  source: string,
  type: number,
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('The shader compiler could not allocate a shader.');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? 'unknown shader error';
    gl.deleteShader(shader);
    throw new Error(`Shader transition failed to compile: ${log}`);
  }
  return shader;
}

function hexToRgb(hex: string): [number, number, number] {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!match) return [1, 1, 1];
  const value = Number.parseInt(match[1], 16);
  return [
    ((value >> 16) & 0xff) / 255,
    ((value >> 8) & 0xff) / 255,
    (value & 0xff) / 255,
  ];
}

function isWebGLContext(value: unknown): value is WebGLRenderingContext {
  return Boolean(value && typeof (value as WebGLRenderingContext).createShader === 'function');
}

export class MotionShaderCompositor {
  private readonly gl: WebGLRenderingContext;
  private readonly programs = new Map<string, WebGLProgram>();
  private readonly quad: WebGLBuffer;
  private readonly fromTexture: WebGLTexture;
  private readonly toTexture: WebGLTexture;
  readonly canvas: HTMLCanvasElement;

  private constructor(canvas: HTMLCanvasElement, gl: WebGLRenderingContext) {
    this.canvas = canvas;
    this.gl = gl;
    const quad = gl.createBuffer();
    const fromTexture = gl.createTexture();
    const toTexture = gl.createTexture();
    if (!quad || !fromTexture || !toTexture) {
      throw new Error('The shader compositor could not allocate its buffers.');
    }
    this.quad = quad;
    this.fromTexture = fromTexture;
    this.toTexture = toTexture;
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    for (const texture of [fromTexture, toTexture]) {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    }
  }

  static create(width: number, height: number): MotionShaderCompositor | null {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    const gl = canvas.getContext('webgl', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: true,
    });
    if (!isWebGLContext(gl)) return null;
    try {
      return new MotionShaderCompositor(canvas, gl);
    } catch {
      return null;
    }
  }

  get availableShaders(): readonly MotionShaderTransitionName[] {
    return MOTION_SHADER_TRANSITIONS.map((transition) => transition.id);
  }

  private programFor(name: MotionShaderTransitionName): WebGLProgram {
    const cached = this.programs.get(name);
    if (cached) return cached;
    const gl = this.gl;
    const vertex = compileShader(gl, VERTEX_SOURCE, gl.VERTEX_SHADER);
    const fragment = compileShader(gl, FRAGMENTS[name], gl.FRAGMENT_SHADER);
    const program = gl.createProgram();
    if (!program) throw new Error('The shader compositor could not allocate a program.');
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.bindAttribLocation(program, 0, 'a_pos');
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program) ?? 'unknown link error';
      gl.deleteProgram(program);
      throw new Error(`Shader transition failed to link: ${log}`);
    }
    this.programs.set(name, program);
    return program;
  }

  private upload(texture: WebGLTexture, unit: number, source: HTMLCanvasElement): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  }

  draw({
    from,
    to,
    progress,
    shader,
    accentColor,
  }: {
    from: HTMLCanvasElement;
    to: HTMLCanvasElement;
    progress: number;
    shader: MotionShaderTransitionName;
    accentColor?: string;
  }): HTMLCanvasElement {
    const gl = this.gl;
    const program = this.programFor(shader);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.upload(this.fromTexture, 0, from);
    this.upload(this.toTexture, 1, to);
    gl.uniform1i(gl.getUniformLocation(program, 'u_from'), 0);
    gl.uniform1i(gl.getUniformLocation(program, 'u_to'), 1);
    gl.uniform1f(gl.getUniformLocation(program, 'u_progress'), Math.min(1, Math.max(0, progress)));
    gl.uniform2f(
      gl.getUniformLocation(program, 'u_resolution'),
      this.canvas.width,
      this.canvas.height,
    );
    const accent = hexToRgb(accentColor ?? '#ff6b2b');
    gl.uniform3f(gl.getUniformLocation(program, 'u_accent'), ...accent);
    gl.uniform3f(
      gl.getUniformLocation(program, 'u_accent_dark'),
      accent[0] * 0.25,
      accent[1] * 0.25,
      accent[2] * 0.25,
    );
    gl.uniform3f(
      gl.getUniformLocation(program, 'u_accent_bright'),
      Math.min(1, accent[0] * 1.6 + 0.15),
      Math.min(1, accent[1] * 1.6 + 0.15),
      Math.min(1, accent[2] * 1.6 + 0.15),
    );
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return this.canvas;
  }

  dispose(): void {
    const gl = this.gl;
    for (const program of this.programs.values()) gl.deleteProgram(program);
    this.programs.clear();
    gl.deleteBuffer(this.quad);
    gl.deleteTexture(this.fromTexture);
    gl.deleteTexture(this.toTexture);
    const lose = gl.getExtension('WEBGL_lose_context');
    lose?.loseContext();
  }
}

/** Resolve the shader name the compositor should use for a transition. */
export function shaderNameFor(name: string | undefined): MotionShaderTransitionName {
  return (MOTION_SHADER_TRANSITIONS.find((transition) => transition.id === name)?.id ??
    'domain-warp') as MotionShaderTransitionName;
}