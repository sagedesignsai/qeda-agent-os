/**
 * lib/studio/render/rasterize-webgl.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * WebGL 2 rasterizer for display-list rendering (future optimization).
 *
 * This is a foundation/stub for GPU-accelerated rendering. The full
 * implementation requires:
 *   1. Shader compilation (vertex/fragment programs for each op type)
 *   2. Texture management (video frames, overlays, effects)
 *   3. Render passes (background, media, overlays, effects, chrome, text)
 *   4. Framebuffer chaining for deferred effects (spotlight, grain, etc.)
 *
 * MOTIVATION
 * ──────────
 * Canvas 2D is CPU-based. For large exports (4K, high frame rate, many effects)
 * the GPU bottleneck is video seeking (35–50% of time), not drawing. WebGL
 * could add 2–5% overhead for shader compilation but would reduce Canvas 2D
 * drawing overhead from 15–30% to <5%, producing net ~10% speedup.
 *
 * For real-time preview (60 fps) the GPU benefit is higher: Canvas 2D drawing
 * eats 30–40% of the frame budget; GPU acceleration via WebGL would drop that
 * to 5–10%, enabling higher effect complexity or better preview responsiveness.
 *
 * ARCHITECTURE
 * ────────────
 * The renderer is a Tier 3 backend swappable with rasterize2D():
 *
 *   rasterize2D(ctx, program)     [CPU, Canvas 2D]
 *   rasterizeWebGL(gl, program)   [GPU, WebGL 2]  [FUTURE]
 *
 * Callers don't change; the display-list program (Tier 2.5) stays identical.
 * Frame-renderer.ts would route based on a feature flag or GPU availability.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { FrameProgram, DrawOp } from './display-list';

/**
 * WebGL 2 rendering context + state for GPU acceleration.
 */
export interface WebGLRenderContext {
  gl: WebGL2RenderingContext;
  /** Compiled shader programs keyed by op kind (video, overlay, text, shape, effect, etc.) */
  programs: Map<string, WebGLProgram>;
  /** Texture cache: key is asset ID or data URI */
  textureCache: Map<string, WebGLTexture>;
  /** Framebuffer for render passes (background, content, effects, chrome). */
  renderFramebuffers: {
    background: WebGLFramebuffer | null;
    content: WebGLFramebuffer | null;
    effects: WebGLFramebuffer | null;
  };
  /** Uniform buffer for global state (matrices, frame dimensions, time). */
  globalUBO: WebGLBuffer | null;
}

/**
 * Initialize a WebGL 2 rendering context with shader programs and textures.
 *
 * @param canvas HTML canvas element
 * @returns Initialized WebGL context or null if not available
 *
 * STUB: Full implementation would:
 *   1. Create WebGL 2 context with powerPreference: 'high-performance'
 *   2. Compile all shader programs
 *   3. Initialize framebuffers for effect passes
 *   4. Set up texture units and samplers
 */
export function initializeWebGLContext(canvas: HTMLCanvasElement): WebGLRenderContext | null {
  const gl = canvas.getContext('webgl2', {
    powerPreference: 'high-performance',
    antialias: false, // We handle anti-aliasing in shaders
    preserveDrawingBuffer: false, // Let GPU discard old frames
  });

  if (!gl) {
    console.warn('[rasterize-webgl] WebGL 2 not available');
    return null;
  }

  // TODO: Compile shader programs for each op type
  // const programs = compileShaderPrograms(gl);

  // TODO: Initialize framebuffers
  // const renderFramebuffers = initializeFramebuffers(gl, canvas.width, canvas.height);

  return {
    gl,
    programs: new Map(),
    textureCache: new Map(),
    renderFramebuffers: {
      background: null,
      content: null,
      effects: null,
    },
    globalUBO: null,
  };
}

/**
 * Main entry point: rasterize a display-list frame program using WebGL.
 *
 * @param glCtx WebGL rendering context
 * @param program Display-list frame program
 * @param width Canvas width
 * @param height Canvas height
 *
 * STUB: Full implementation would:
 *   1. Update global UBO (matrices, frame time, window geometry)
 *   2. For each pass (background, media, overlays, effects, chrome, text):
 *      a. Bind appropriate framebuffer
 *      b. Iterate ops and dispatch shader programs
 *      c. Handle blend modes via glBlendFunc
 *   3. Read final pixels to canvas via glReadPixels or direct display
 */
export function rasterizeWebGL(
  glCtx: WebGLRenderContext,
  program: FrameProgram,
  width: number,
  height: number,
): void {
  const { gl } = glCtx;

  // Set viewport and clear color
  gl.viewport(0, 0, width, height);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // TODO: Update global UBO with frame data
  // updateGlobalUBO(glCtx, program, width, height);

  // TODO: For each DrawOp in program.ops:
  //   1. Select shader program by op.kind
  //   2. Bind textures (video, overlays, etc.)
  //   3. Set up transform matrices (op.transform, clipping domain)
  //   4. Set blend mode from op.blendMode
  //   5. Execute draw call (quad for most ops, potentially lines/triangles for shapes)

  // Example structure (not implemented):
  /*
  for (const op of program.ops) {
    const shader = glCtx.programs.get(op.kind);
    if (!shader) continue;

    gl.useProgram(shader);

    // Bind uniforms: transform, opacity, clip domain
    // Bind textures: video frame, overlay, etc.
    // Bind VAO/VBO

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); // Fullscreen quad
  }
  */

  // TODO: Optional: Read pixels back to canvas for hybrid CPU/GPU rendering
  // const pixels = new Uint8Array(width * height * 4);
  // gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  // ctx.putImageData(new ImageData(pixels, width, height), 0, 0);
}

/**
 * Create or get a WebGL texture for a video frame or image asset.
 *
 * STUB: Full implementation would:
 *   1. Check texture cache (key: asset ID)
 *   2. If cached, return existing texture
 *   3. Otherwise, create new texture, upload element data, cache it
 *   4. Handle mipmap generation for downsampling
 */
export function getOrCreateTexture(
  glCtx: WebGLRenderContext,
  element: HTMLVideoElement | HTMLImageElement | CanvasImageSource,
  assetId: string,
): WebGLTexture | null {
  const { gl, textureCache } = glCtx;

  // Check cache
  const cached = textureCache.get(assetId);
  if (cached) return cached;

  // TODO: Create new texture
  // const texture = gl.createTexture();
  // gl.bindTexture(gl.TEXTURE_2D, texture);
  // gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, element);
  // gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  // gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  // textureCache.set(assetId, texture);
  // return texture;

  return null;
}

/**
 * Compile all shader programs needed for display-list rendering.
 *
 * Shader types needed:
 *   - simple-quad: Copy texture to framebuffer (video, overlay, shape fill)
 *   - effect-grain: Film grain overlay (deterministic from time)
 *   - effect-spotlight: Radial spotlight mask
 *   - effect-scanlines: Horizontal scanline overlay
 *   - text-sdf: Signed-distance-field text rendering
 *   - blend-modes: Implement CSS blend modes (multiply, screen, overlay, etc.)
 *
 * STUB: Returns empty map; real implementation would compile 6–8 shader programs.
 */
export function compileShaderPrograms(gl: WebGL2RenderingContext): Map<string, WebGLProgram> {
  const programs = new Map<string, WebGLProgram>();

  // TODO: For each shader type:
  //   1. Create program from vertex/fragment source
  //   2. Link and validate
  //   3. Store in programs map

  // Example (not implemented):
  /*
  const videoShader = compileShader(gl, VERTEX_SIMPLE_QUAD, FRAGMENT_SAMPLE_TEXTURE);
  programs.set('video', videoShader);
  */

  return programs;
}

/**
 * Cleanup WebGL resources (textures, framebuffers, programs).
 * Call when switching renderers or closing the app.
 */
export function cleanupWebGLContext(glCtx: WebGLRenderContext): void {
  const { gl, programs, textureCache, renderFramebuffers } = glCtx;

  // Delete programs
  for (const [, program] of programs) {
    gl.deleteProgram(program);
  }

  // Delete textures
  for (const [, texture] of textureCache) {
    gl.deleteTexture(texture);
  }

  // Delete framebuffers
  gl.deleteFramebuffer(renderFramebuffers.background);
  gl.deleteFramebuffer(renderFramebuffers.content);
  gl.deleteFramebuffer(renderFramebuffers.effects);

  // Delete UBO
  if (glCtx.globalUBO) {
    gl.deleteBuffer(glCtx.globalUBO);
  }

  // Delete context
  (gl as any).getExtension('WEBGL_lose_context')?.loseContext();
}

// ── Shader Sources (STUB) ──────────────────────────────────────────────────────

/**
 * Simple vertex shader for fullscreen quad (most ops).
 * Outputs clip-space position and normalized texture coordinates.
 */
const VERTEX_SIMPLE_QUAD = `#version 300 es
  precision highp float;

  in vec2 position;
  out vec2 texCoord;

  void main() {
    texCoord = position * 0.5 + 0.5; // [0, 1]
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

/**
 * Simple fragment shader: sample a texture and apply opacity/blend.
 */
const FRAGMENT_SAMPLE_TEXTURE = `#version 300 es
  precision highp float;

  uniform sampler2D u_texture;
  uniform float u_opacity;
  in vec2 texCoord;
  out vec4 outColor;

  void main() {
    vec4 texel = texture(u_texture, texCoord);
    outColor = vec4(texel.rgb, texel.a * u_opacity);
  }
`;

/**
 * Fragment shader for film grain effect.
 * Uses time + position to generate deterministic noise.
 */
const FRAGMENT_GRAIN = `#version 300 es
  precision highp float;

  uniform sampler2D u_texture;
  uniform float u_time;
  uniform float u_intensity;
  in vec2 texCoord;
  out vec4 outColor;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  }

  void main() {
    vec4 texel = texture(u_texture, texCoord);
    float noise = hash(texCoord + u_time) * 2.0 - 1.0;
    outColor = texel + vec4(vec3(noise * u_intensity), 0.0);
  }
`;

/**
 * Fragment shader for spotlight effect.
 * Radial gradient centered on focal point.
 */
const FRAGMENT_SPOTLIGHT = `#version 300 es
  precision highp float;

  uniform sampler2D u_texture;
  uniform vec2 u_center;
  uniform float u_radius;
  in vec2 texCoord;
  out vec4 outColor;

  void main() {
    vec4 texel = texture(u_texture, texCoord);
    float dist = distance(texCoord, u_center);
    float mask = smoothstep(u_radius, u_radius - 0.2, dist);
    outColor = texel * mask;
  }
`;
