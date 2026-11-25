/**
 * lib/studio/render/shader-background.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Animated WebGL plasma shader background renderer (inspired by the classic
 * warped plasma lines shader), parameterized by palette colors, speed, warp,
 * line density, and seed.
 *
 * Renders into a cached offscreen WebGL canvas and composites onto the target
 * 2D canvas so both live 60fps Studio previews and deterministic WebCodecs
 * exports share the exact same GPU-rendered output. Falls back to a matching
 * Canvas 2D plasma pass when WebGL is unavailable (e.g., headless tests).
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface PlasmaShaderParams {
  width: number;
  height: number;
  timeSec: number;
  bgColor1: string;
  bgColor2: string;
  lineColor: string;
  accentColor: string;
  lineCount: number;
  warp: number;
  seed: number;
}

const VERTEX_SHADER_SOURCE = `
  attribute vec4 aVertexPosition;
  void main() {
    gl_Position = aVertexPosition;
  }
`;

const FRAGMENT_SHADER_SOURCE = `
  precision highp float;
  uniform vec2 iResolution;
  uniform float iTime;
  uniform vec3 uBgColor1;
  uniform vec3 uBgColor2;
  uniform vec3 uLineColor;
  uniform vec3 uAccentColor;
  uniform float uLineCount;
  uniform float uWarp;
  uniform float uSeed;

  const float gridSmoothWidth = 0.015;
  const float scale = 5.0;
  const float minLineWidth = 0.01;
  const float maxLineWidth = 0.2;
  const float lineSpeed = 0.2;
  const float lineAmplitude = 1.0;
  const float lineFrequency = 0.2;
  const float warpSpeed = 0.04;
  const float warpFrequency = 0.5;
  const float offsetFrequency = 0.5;
  const float offsetSpeed = 0.266;
  const float minOffsetSpread = 0.6;
  const float maxOffsetSpread = 2.0;
  const int MAX_LINES = 24;

  #define drawCircle(pos, radius, coord) smoothstep(radius + gridSmoothWidth, radius, length(coord - (pos)))
  #define drawSmoothLine(pos, halfWidth, t) smoothstep(halfWidth, 0.0, abs(pos - (t)))
  #define drawCrispLine(pos, halfWidth, t) smoothstep(halfWidth + gridSmoothWidth, halfWidth, abs(pos - (t)))

  float random(float t) {
    return (cos(t) + cos(t * 1.3 + 1.3) + cos(t * 1.4 + 1.4)) / 3.0;
  }

  float getPlasmaY(float x, float horizontalFade, float offset) {
    return random(x * lineFrequency + iTime * lineSpeed + uSeed) * horizontalFade * lineAmplitude + offset;
  }

  void main() {
    vec2 fragCoord = gl_FragCoord.xy;
    vec2 uv = fragCoord.xy / iResolution.xy;
    vec2 space = (fragCoord - iResolution.xy / 2.0) / iResolution.x * 2.0 * scale;

    float horizontalFade = 1.0 - (cos(uv.x * 6.2831853) * 0.5 + 0.5);
    float verticalFade = 1.0 - (cos(uv.y * 6.2831853) * 0.5 + 0.5);

    space.y += random(space.x * warpFrequency + iTime * warpSpeed + uSeed) * uWarp * (0.5 + horizontalFade);
    space.x += random(space.y * warpFrequency + iTime * warpSpeed + 2.0 + uSeed) * uWarp * horizontalFade;

    vec4 lines = vec4(0.0);

    for (int l = 0; l < MAX_LINES; l++) {
      if (float(l) >= uLineCount) break;
      float normalizedLineIndex = float(l) / max(1.0, uLineCount);
      float offsetTime = iTime * offsetSpeed;
      float offsetPosition = float(l) + space.x * offsetFrequency + uSeed * 0.13;
      float rand = random(offsetPosition + offsetTime) * 0.5 + 0.5;
      float halfWidth = mix(minLineWidth, maxLineWidth, rand * horizontalFade) / 2.0;
      float offset = random(offsetPosition + offsetTime * (1.0 + normalizedLineIndex)) * mix(minOffsetSpread, maxOffsetSpread, horizontalFade);
      float linePosition = getPlasmaY(space.x, horizontalFade, offset);
      float line = drawSmoothLine(linePosition, halfWidth, space.y) / 2.0 + drawCrispLine(linePosition, halfWidth * 0.15, space.y);

      float circleX = mod(float(l) + iTime * lineSpeed * 2.5 + uSeed, 25.0) - 12.0;
      vec2 circlePosition = vec2(circleX, getPlasmaY(circleX, horizontalFade, offset));
      float circle = drawCircle(circlePosition, 0.015, space) * 3.5;

      vec3 tint = mix(uLineColor, uAccentColor, normalizedLineIndex);
      lines += (line + circle) * vec4(tint, 1.0) * rand;
    }

    vec3 baseBg = mix(uBgColor1, uBgColor2, uv.x);
    baseBg *= (0.45 + 0.55 * verticalFade);
    vec4 fragColor = vec4(baseBg, 1.0) + lines;
    fragColor.a = 1.0;

    gl_FragColor = fragColor;
  }
`;

interface CachedWebGLPlasma {
  canvas: HTMLCanvasElement;
  gl: WebGLRenderingContext;
  program: WebGLProgram;
  buffer: WebGLBuffer;
  attribs: {
    vertexPosition: number;
  };
  uniforms: {
    resolution: WebGLUniformLocation | null;
    time: WebGLUniformLocation | null;
    bgColor1: WebGLUniformLocation | null;
    bgColor2: WebGLUniformLocation | null;
    lineColor: WebGLUniformLocation | null;
    accentColor: WebGLUniformLocation | null;
    lineCount: WebGLUniformLocation | null;
    warp: WebGLUniformLocation | null;
    seed: WebGLUniformLocation | null;
  };
}

let cachedPlasma: CachedWebGLPlasma | null = null;
let webglUnavailable = false;

export function hexToRgb01(hex: string, fallback: [number, number, number]): [number, number, number] {
  const clean = hex.trim().replace(/^#/, '');
  if (/^[\da-f]{3}$/i.test(clean)) {
    return [
      parseInt(clean[0] + clean[0], 16) / 255,
      parseInt(clean[1] + clean[1], 16) / 255,
      parseInt(clean[2] + clean[2], 16) / 255,
    ];
  }
  if (/^[\da-f]{6}$/i.test(clean)) {
    return [
      parseInt(clean.slice(0, 2), 16) / 255,
      parseInt(clean.slice(2, 4), 16) / 255,
      parseInt(clean.slice(4, 6), 16) / 255,
    ];
  }
  return fallback;
}

function compileShader(
  gl: WebGLRenderingContext,
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

function getWebGLPlasma(): CachedWebGLPlasma | null {
  if (webglUnavailable || typeof document === 'undefined') return null;
  if (cachedPlasma && !cachedPlasma.gl.isContextLost()) {
    return cachedPlasma;
  }

  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: true,
    });
    if (!gl) {
      webglUnavailable = true;
      return null;
    }

    const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SOURCE);
    if (!vs || !fs) {
      if (vs) gl.deleteShader(vs);
      if (fs) gl.deleteShader(fs);
      webglUnavailable = true;
      return null;
    }

    const program = gl.createProgram();
    if (!program) {
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      webglUnavailable = true;
      return null;
    }
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      webglUnavailable = true;
      return null;
    }

    const buffer = gl.createBuffer();
    if (!buffer) {
      gl.deleteProgram(program);
      webglUnavailable = true;
      return null;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );

    cachedPlasma = {
      canvas,
      gl,
      program,
      buffer,
      attribs: {
        vertexPosition: gl.getAttribLocation(program, 'aVertexPosition'),
      },
      uniforms: {
        resolution: gl.getUniformLocation(program, 'iResolution'),
        time: gl.getUniformLocation(program, 'iTime'),
        bgColor1: gl.getUniformLocation(program, 'uBgColor1'),
        bgColor2: gl.getUniformLocation(program, 'uBgColor2'),
        lineColor: gl.getUniformLocation(program, 'uLineColor'),
        accentColor: gl.getUniformLocation(program, 'uAccentColor'),
        lineCount: gl.getUniformLocation(program, 'uLineCount'),
        warp: gl.getUniformLocation(program, 'uWarp'),
        seed: gl.getUniformLocation(program, 'uSeed'),
      },
    };
    return cachedPlasma;
  } catch {
    webglUnavailable = true;
    return null;
  }
}

function renderPlasmaFallback2D(
  ctx: CanvasRenderingContext2D,
  params: PlasmaShaderParams,
): void {
  const { width, height, timeSec, bgColor1, bgColor2, lineColor, accentColor, lineCount, warp, seed } = params;
  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, bgColor1);
  bg.addColorStop(1, bgColor2);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const count = Math.max(4, Math.min(18, Math.round(lineCount)));
  const warpAmt = Math.max(0.15, warp) * height * 0.14;

  for (let i = 0; i < count; i++) {
    const t = i / Math.max(1, count - 1);
    const phase = timeSec * (0.45 + t * 0.25) + i * 0.7 + seed * 0.31;
    const baseY = height * (0.22 + t * 0.56);

    ctx.beginPath();
    const steps = 28;
    for (let s = 0; s <= steps; s++) {
      const u = s / steps;
      const x = u * width;
      const env = Math.sin(u * Math.PI);
      const y =
        baseY +
        Math.sin(u * 4.2 + phase) * warpAmt * env +
        Math.cos(u * 7.1 - phase * 0.7 + i) * warpAmt * 0.45 * env;
      if (s === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = i % 2 === 0 ? lineColor : accentColor;
    ctx.globalAlpha = 0.14 + (1 - Math.abs(t - 0.5) * 1.4) * 0.14;
    ctx.lineWidth = Math.max(2, height * 0.012 * (1 + (i % 3) * 0.4));
    ctx.stroke();
  }
  ctx.restore();
}

export function drawPlasmaShaderBackground(
  ctx: CanvasRenderingContext2D,
  params: PlasmaShaderParams,
): void {
  const plasma = getWebGLPlasma();
  if (!plasma) {
    renderPlasmaFallback2D(ctx, params);
    return;
  }

  const { gl, canvas, program, buffer, attribs, uniforms } = plasma;
  // Cap offscreen shader resolution at 1280px wide for smooth 60fps preview
  // while preserving aspect ratio for full-canvas drawImage compositing.
  const scale = params.width > 1280 ? 1280 / params.width : 1;
  const renderW = Math.max(64, Math.round(params.width * scale));
  const renderH = Math.max(64, Math.round(params.height * scale));
  if (canvas.width !== renderW || canvas.height !== renderH) {
    canvas.width = renderW;
    canvas.height = renderH;
  }

  const c1 = hexToRgb01(params.bgColor1, [0.1, 0.1, 0.3]);
  const c2 = hexToRgb01(params.bgColor2, [0.3, 0.1, 0.5]);
  const lc = hexToRgb01(params.lineColor, [0.4, 0.2, 0.8]);
  const ac = hexToRgb01(params.accentColor, [0.65, 0.33, 0.96]);

  gl.viewport(0, 0, renderW, renderH);
  gl.useProgram(program);
  gl.uniform2f(uniforms.resolution, renderW, renderH);
  gl.uniform1f(uniforms.time, params.timeSec);
  gl.uniform3f(uniforms.bgColor1, c1[0], c1[1], c1[2]);
  gl.uniform3f(uniforms.bgColor2, c2[0], c2[1], c2[2]);
  gl.uniform3f(uniforms.lineColor, lc[0], lc[1], lc[2]);
  gl.uniform3f(uniforms.accentColor, ac[0], ac[1], ac[2]);
  gl.uniform1f(uniforms.lineCount, Math.max(4, Math.min(24, params.lineCount)));
  gl.uniform1f(uniforms.warp, Math.max(0.1, Math.min(2.2, params.warp)));
  gl.uniform1f(uniforms.seed, params.seed % 100);

  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.vertexAttribPointer(attribs.vertexPosition, 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(attribs.vertexPosition);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  ctx.drawImage(canvas, 0, 0, params.width, params.height);
}
