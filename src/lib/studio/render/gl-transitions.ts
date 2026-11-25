/**
 * lib/studio/render/gl-transitions.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Two-texture WebGL 2 transition passes (`u_from` → `u_to`) with Canvas 2D
 * crossfade fallback.
 *
 * Supported GPU transitions:
 *   - `cross-zoom`       — zoom-in on outgoing + zoom-out on incoming
 *   - `directional-blur` — directional motion smear across the dissolve
 *   - `glitch`           — deterministic horizontal scanline block jitter
 *   - `rgb-split`        — chromatic aberration split during crossfade
 *   - `radial-wipe`      — smooth angular clock wipe
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  drawGlQuad,
  getGlEngine,
  getGlProgram,
  uploadGlTexture,
  type QuadCorner,
} from './gl-engine';

export type GpuTransitionType =
  | 'cross-zoom'
  | 'directional-blur'
  | 'glitch'
  | 'rgb-split'
  | 'radial-wipe';

const GPU_TRANSITIONS: ReadonlySet<string> = new Set<GpuTransitionType>([
  'cross-zoom',
  'directional-blur',
  'glitch',
  'rgb-split',
  'radial-wipe',
]);

export function isGpuTransitionType(type: string): type is GpuTransitionType {
  return GPU_TRANSITIONS.has(type);
}

export interface GpuTransitionRequest {
  type: GpuTransitionType;
  /** 0..1 transition progress. */
  progress: number;
  fromSource: CanvasImageSource;
  toSource: CanvasImageSource;
  rect: { x: number; y: number; width: number; height: number };
}

/**
 * Render a two-texture GPU transition onto `ctx`.
 * Returns `false` when WebGL 2 is unavailable so the caller can invoke
 * `drawGpuTransitionFallback`.
 */
export function renderGpuTransitionPass(
  ctx: CanvasRenderingContext2D,
  request: GpuTransitionRequest,
): boolean {
  const progress = Math.max(0, Math.min(1, request.progress));
  const width = Math.round(request.rect.width);
  const height = Math.round(request.rect.height);
  if (width < 2 || height < 2) return false;

  const current = getGlEngine();
  if (!current || current.gl.isContextLost()) return false;

  const program = getGlProgram(
    current,
    `tr:${request.type}`,
    TRANSITION_SHADERS[request.type],
  );
  if (!program) return false;

  const { gl } = current;
  current.canvas.width = width;
  current.canvas.height = height;
  gl.viewport(0, 0, width, height);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  if (!uploadGlTexture(current, request.fromSource, 0)) return false;
  if (!uploadGlTexture(current, request.toSource, 1)) return false;

  const corners: QuadCorner[] = [
    { x: 0, y: 0, u: 0, v: 0 },
    { x: width, y: 0, u: 1, v: 0 },
    { x: 0, y: height, u: 0, v: 1 },
    { x: width, y: height, u: 1, v: 1 },
  ];

  drawGlQuad(
    current,
    program,
    width,
    height,
    corners,
    { u_progress: progress },
    { u_from: 0, u_to: 1 },
  );

  ctx.save();
  ctx.drawImage(
    current.canvas,
    request.rect.x,
    request.rect.y,
    request.rect.width,
    request.rect.height,
  );
  ctx.restore();
  return true;
}

/**
 * Canvas 2D crossfade fallback when WebGL 2 is unavailable.
 */
export function drawGpuTransitionFallback(
  ctx: CanvasRenderingContext2D,
  request: GpuTransitionRequest,
): void {
  const p = Math.max(0, Math.min(1, request.progress));
  const { x, y, width, height } = request.rect;
  if (width <= 0 || height <= 0) return;

  ctx.save();
  ctx.globalAlpha = 1 - p;
  ctx.drawImage(request.fromSource, x, y, width, height);
  ctx.globalAlpha = p;
  ctx.drawImage(request.toSource, x, y, width, height);
  ctx.restore();
}

// ── Fragment Shaders ──────────────────────────────────────────────────────────

const FRAGMENT_CROSS_ZOOM = `#version 300 es
  precision highp float;
  uniform sampler2D u_from;
  uniform sampler2D u_to;
  uniform float u_progress;
  in vec2 v_uv;
  out vec4 outColor;

  void main() {
    float p = clamp(u_progress, 0.0, 1.0);
    vec2 center = vec2(0.5);
    vec2 uvFrom = (v_uv - center) * (1.0 - p * 0.35) + center;
    vec2 uvTo = (v_uv - center) * (1.35 - p * 0.35) + center;
    vec4 a = texture(u_from, clamp(uvFrom, 0.0, 1.0));
    vec4 b = texture(u_to, clamp(uvTo, 0.0, 1.0));
    outColor = mix(a, b, smoothstep(0.15, 0.85, p));
  }
`;

const FRAGMENT_DIRECTIONAL_BLUR = `#version 300 es
  precision highp float;
  uniform sampler2D u_from;
  uniform sampler2D u_to;
  uniform float u_progress;
  in vec2 v_uv;
  out vec4 outColor;

  void main() {
    float p = clamp(u_progress, 0.0, 1.0);
    float strength = sin(p * 3.14159265) * 0.04;
    vec4 accA = vec4(0.0);
    vec4 accB = vec4(0.0);
    for (int i = -3; i <= 3; i++) {
      float offset = float(i) / 3.0 * strength;
      accA += texture(u_from, clamp(v_uv + vec2(offset, 0.0), 0.0, 1.0));
      accB += texture(u_to, clamp(v_uv + vec2(offset, 0.0), 0.0, 1.0));
    }
    outColor = mix(accA / 7.0, accB / 7.0, p);
  }
`;

const FRAGMENT_GLITCH = `#version 300 es
  precision highp float;
  uniform sampler2D u_from;
  uniform sampler2D u_to;
  uniform float u_progress;
  in vec2 v_uv;
  out vec4 outColor;

  float hash(float n) {
    return fract(sin(n * 127.1) * 43758.5453123);
  }

  void main() {
    float p = clamp(u_progress, 0.0, 1.0);
    float band = floor(v_uv.y * 20.0);
    float burst = sin(p * 3.14159265);
    float jitter = (hash(band + floor(p * 12.0)) - 0.5) * 0.08 * burst;
    vec2 uv = vec2(fract(v_uv.x + jitter), v_uv.y);
    vec4 a = texture(u_from, uv);
    vec4 b = texture(u_to, uv);
    outColor = mix(a, b, smoothstep(0.2, 0.8, p));
  }
`;

const FRAGMENT_RGB_SPLIT = `#version 300 es
  precision highp float;
  uniform sampler2D u_from;
  uniform sampler2D u_to;
  uniform float u_progress;
  in vec2 v_uv;
  out vec4 outColor;

  void main() {
    float p = clamp(u_progress, 0.0, 1.0);
    float shift = sin(p * 3.14159265) * 0.025;
    vec4 a = vec4(
      texture(u_from, clamp(v_uv + vec2(shift, 0.0), 0.0, 1.0)).r,
      texture(u_from, v_uv).g,
      texture(u_from, clamp(v_uv - vec2(shift, 0.0), 0.0, 1.0)).b,
      texture(u_from, v_uv).a
    );
    vec4 b = vec4(
      texture(u_to, clamp(v_uv + vec2(shift, 0.0), 0.0, 1.0)).r,
      texture(u_to, v_uv).g,
      texture(u_to, clamp(v_uv - vec2(shift, 0.0), 0.0, 1.0)).b,
      texture(u_to, v_uv).a
    );
    outColor = mix(a, b, p);
  }
`;

const FRAGMENT_RADIAL_WIPE = `#version 300 es
  precision highp float;
  uniform sampler2D u_from;
  uniform sampler2D u_to;
  uniform float u_progress;
  in vec2 v_uv;
  out vec4 outColor;

  void main() {
    float p = clamp(u_progress, 0.0, 1.0);
    vec2 d = v_uv - vec2(0.5);
    float angle = (atan(d.y, d.x) + 3.14159265) / 6.28318530;
    float mask = smoothstep(p - 0.02, p + 0.02, angle);
    vec4 a = texture(u_from, v_uv);
    vec4 b = texture(u_to, v_uv);
    outColor = mix(b, a, mask);
  }
`;

const TRANSITION_SHADERS: Record<GpuTransitionType, string> = {
  'cross-zoom': FRAGMENT_CROSS_ZOOM,
  'directional-blur': FRAGMENT_DIRECTIONAL_BLUR,
  glitch: FRAGMENT_GLITCH,
  'rgb-split': FRAGMENT_RGB_SPLIT,
  'radial-wipe': FRAGMENT_RADIAL_WIPE,
};
