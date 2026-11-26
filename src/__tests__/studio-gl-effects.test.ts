/**
 * src/__tests__/studio-gl-effects.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase 2 contract tests: the WebGL 2 effect passes and their Canvas 2D
 * fallbacks.
 *
 * These run in jsdom, where `getContext('webgl2')` is unavailable, so they
 * cover the two things that matter without a GPU: the pure resolution layer
 * (catalog, parameter schemas, display-list chroma-key attachment) and the
 * degradation contract (every GPU entry point reports "not painted" instead of
 * throwing or half-painting the frame).
 */

import { describe, it, expect } from '@jest/globals';
import type { StudioStyling, TimelineTrack } from '@/lib/studio/types';
import type { BuildFrameProgramInput } from '@/lib/studio/render/program';
import { buildFrameProgram } from '@/lib/studio/render/program';
import { IDLE_CAMERA } from '@/lib/studio/render/camera';
import { evaluateEditorTimeline } from '@/lib/studio/timeline/evaluate';
import {
  applyChromaKeyCanvas,
  drawKeyedSource,
  isGpuEffectAvailable,
  isGpuEffectType,
  renderGpuEffectPass,
} from '@/lib/studio/render/gl-effect-pass';
import { resolveChromaKeyParams } from '@/lib/studio/render/chroma-key';
import { drawStudioEffectPass } from '@/lib/studio/render/effects';
import {
  STUDIO_EFFECTS,
  getStudioEffectDefinition,
  isStudioEffectType,
} from '@/lib/studio/effects/catalog';
import {
  getDefaultParams,
  getEffectParamSchema,
  validateEffectParams,
} from '@/lib/studio/effects/params';

const STYLING: StudioStyling = {
  canvasMode: 'showcase',
  background: '#0a0b10',
  borderRadius: 18,
  padding: 8,
  shadow: 'md',
  aspectRatio: '16:9',
  zoomIntensity: 1.5,
  cameraEasing: 'smooth',
  showCaptions: true,
  captionStyle: 'badge',
};

const ASSETS = {
  byAssetId: new Map([['asset-1', { width: 1920, height: 1080 }]]),
  recordedVideo: { width: 1920, height: 1080 },
};

function videoTracks(effects?: unknown[]): TimelineTrack[] {
  return [
    {
      id: 'track-video',
      type: 'video',
      name: 'Video',
      locked: false,
      visible: true,
      clips: [
        {
          id: 'clip-1',
          trackId: 'track-video',
          itemType: 'video',
          name: 'Clip',
          startMs: 0,
          durationMs: 5000,
          sourceStartMs: 0,
          sourceDurationMs: 5000,
          payload: {
            mediaAssetId: 'asset-1',
            ...(effects ? { effects } : {}),
          },
        },
      ],
    },
  ] as TimelineTrack[];
}

function build(
  tracks: TimelineTrack[],
  overrides: Partial<BuildFrameProgramInput> = {},
) {
  const compTimeMs = 1000;
  return buildFrameProgram({
    width: 1920,
    height: 1080,
    compTimeMs,
    styling: STYLING,
    evaluatedFrame: evaluateEditorTimeline(tracks, compTimeMs),
    camera: { ...IDLE_CAMERA },
    assets: ASSETS,
    ...overrides,
  });
}

/** Every property is a no-op function, so nothing can accidentally paint. */
function stubContext(): CanvasRenderingContext2D {
  const target: Record<string, unknown> = {};
  return new Proxy(target, {
    get: (store, property) => {
      if (property in store) return store[property as string];
      return () => undefined;
    },
    set: (store, property, value) => {
      store[property as string] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

describe('GPU effect catalog', () => {
  it('registers the three Phase 2 effects', () => {
    for (const type of ['color-grade', 'chroma-key', 'motion-blur'] as const) {
      expect(isStudioEffectType(type)).toBe(true);
      expect(isGpuEffectType(type)).toBe(true);
      expect(getStudioEffectDefinition(type)).toBeDefined();
    }
  });

  it('keeps the Canvas 2D effects off the GPU path', () => {
    for (const type of [
      'spotlight',
      'neon-glow',
      'vignette',
      'film-grain',
      'scanlines',
    ] as const) {
      expect(isGpuEffectType(type)).toBe(false);
    }
  });

  it('gives every catalog entry a schema with defaults in range', () => {
    for (const effect of STUDIO_EFFECTS) {
      const schema = getEffectParamSchema(effect.type);
      expect(schema).toBeDefined();
      const defaults = getDefaultParams(effect.type);
      expect(
        validateEffectParams(effect.type, defaults as Record<string, unknown>),
      ).toEqual({ valid: true });
    }
  });

  it('rejects out-of-range grading parameters', () => {
    const result = validateEffectParams('color-grade', { exposure: 5 });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.join(' ')).toContain('exposure');
    }
  });

  it('defaults the chroma key to a green screen', () => {
    expect(getDefaultParams('chroma-key')).toMatchObject({
      keyColor: '#00ff00',
    });
  });
});

describe('display list — chroma key attachment', () => {
  it('moves the key onto the media op instead of emitting an effect op', () => {
    const program = build(
      videoTracks([
        {
          id: 'key-1',
          type: 'chroma-key',
          intensity: 1,
          params: { keyColor: '#00ff00', tolerance: 0.3, softness: 0.1, spill: 0.5 },
          stackOrder: 0,
        },
      ]),
    );

    const media = program.ops.find((op) => op.kind === 'video');
    expect(media && 'chromaKey' in media ? media.chromaKey : undefined).toEqual({
      keyColor: '#00ff00',
      tolerance: 0.3,
      softness: 0.1,
      spill: 0.5,
      intensity: 1,
    });

    expect(
      program.ops.filter(
        (op) => op.kind === 'effect' && op.effectType === 'chroma-key',
      ),
    ).toHaveLength(0);
  });

  it('fills schema defaults when the effect carries no params', () => {
    const program = build(
      videoTracks([
        { id: 'key-2', type: 'chroma-key', intensity: 0.5, params: {}, stackOrder: 0 },
      ]),
    );
    const media = program.ops.find((op) => op.kind === 'video');
    const chromaKey =
      media && 'chromaKey' in media ? media.chromaKey : undefined;
    expect(chromaKey).toMatchObject({
      keyColor: '#00ff00',
      intensity: 0.5,
    });
  });

  it('leaves media unkeyed when no key effect is attached', () => {
    const program = build(videoTracks());
    const media = program.ops.find((op) => op.kind === 'video');
    expect(media && 'chromaKey' in media ? media.chromaKey : undefined).toBe(
      undefined,
    );
  });
});

describe('chroma-key resolution', () => {
  it('fills schema defaults and clamps user values', () => {
    expect(resolveChromaKeyParams({ params: {} }, 0.5)).toEqual({
      keyColor: '#00ff00',
      tolerance: 0.28,
      softness: 0.12,
      spill: 0.6,
      intensity: 0.5,
    });

    expect(
      resolveChromaKeyParams(
        {
          params: {
            keyColor: '',
            tolerance: 2,
            softness: -1,
            spill: 5,
          },
        },
        2,
      ),
    ).toEqual({
      keyColor: '#00ff00',
      tolerance: 1,
      softness: 0,
      spill: 1,
      intensity: 1,
    });
  });

  it('never runs a key as a destination readback', () => {
    expect(
      renderGpuEffectPass(stubContext(), {
        type: 'chroma-key',
        intensity: 1,
        frame: {
          x: 0,
          y: 0,
          width: 1920,
          height: 1080,
          radius: 0,
          headerHeight: 0,
          contentX: 0,
          contentY: 0,
          contentWidth: 1920,
          contentHeight: 1080,
        },
        timeMs: 0,
        params: { keyColor: '#00ff00', tolerance: 0.3 },
      }),
    ).toBe(false);
  });
});

describe('chroma-key source orchestration', () => {
  /** A destination context with just enough geometry to reach the GPU probe. */
  function sourceContext(): CanvasRenderingContext2D {
    const ctx = stubContext() as unknown as Record<string, unknown>;
    ctx.canvas = { width: 1920, height: 1080 };
    ctx.getTransform = () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
    return ctx as unknown as CanvasRenderingContext2D;
  }

  it('reports "not painted" when WebGL is unavailable', () => {
    const draw = jest.fn();
    const painted = drawKeyedSource(
      sourceContext(),
      { x: 0, y: 0, width: 400, height: 300 },
      {
        keyColor: '#00ff00',
        tolerance: 0.3,
        softness: 0.1,
        spill: 0.5,
        intensity: 1,
      },
      draw,
    );

    expect(painted).toBe(false);
    // The scratch layer has no 2D context in jsdom, so the caller keeps its
    // normal (unkeyed) draw path.
    expect(draw).not.toHaveBeenCalled();
  });

  it('skips the pass entirely when the key intensity is zero', () => {
    const draw = jest.fn();
    expect(
      drawKeyedSource(
        sourceContext(),
        { x: 0, y: 0, width: 400, height: 300 },
        {
          keyColor: '#00ff00',
          tolerance: 0.3,
          softness: 0.1,
          spill: 0.5,
          intensity: 0,
        },
        draw,
      ),
    ).toBe(false);
    expect(draw).not.toHaveBeenCalled();
  });
});

describe('GPU pass degradation without WebGL', () => {
  it('reports unavailability rather than throwing', () => {
    expect(isGpuEffectAvailable()).toBe(false);
  });

  it('returns false for a readback pass so the caller can fall back', () => {
    expect(
      renderGpuEffectPass(stubContext(), {
        type: 'color-grade',
        intensity: 1,
        frame: {
          x: 0,
          y: 0,
          width: 1920,
          height: 1080,
          radius: 0,
          headerHeight: 0,
          contentX: 0,
          contentY: 0,
          contentWidth: 1920,
          contentHeight: 1080,
        },
        timeMs: 0,
        params: { exposure: 0.5 },
      }),
    ).toBe(false);
  });

  it('returns null for a key pass so the clip draws unkeyed', () => {
    const layer = { width: 64, height: 64 } as unknown as CanvasImageSource;
    expect(
      applyChromaKeyCanvas(layer, 64, 64, {
        keyColor: '#00ff00',
        tolerance: 0.3,
        softness: 0.1,
        spill: 0.5,
        intensity: 1,
      }),
    ).toBeNull();
  });

  it('draws the Canvas 2D fallback for a GPU effect without throwing', () => {
    const ctx = stubContext();
    const frame = {
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
      radius: 0,
      headerHeight: 0,
      contentX: 0,
      contentY: 0,
      contentWidth: 1920,
      contentHeight: 1080,
    };
    expect(() => {
      drawStudioEffectPass(ctx, {
        type: 'color-grade',
        intensity: 0.8,
        frame,
        timeMs: 0,
        params: { exposure: 0.4, temperature: 0.3 },
      });
      drawStudioEffectPass(ctx, {
        type: 'motion-blur',
        intensity: 0.6,
        frame,
        timeMs: 0,
        params: { distance: 10, angle: 45, samples: 4 },
      });
      drawStudioEffectPass(ctx, {
        type: 'chroma-key',
        intensity: 1,
        frame,
        timeMs: 0,
      });
    }).not.toThrow();
  });
});

describe('GPU pass execution with mocked WebGL2', () => {
  function createMockGl() {
    const uniforms = new Map<string, unknown>();
    const gl = {
      VERTEX_SHADER: 0x8b31,
      FRAGMENT_SHADER: 0x8b30,
      COMPILE_STATUS: 0x8b81,
      LINK_STATUS: 0x8b82,
      ARRAY_BUFFER: 0x8892,
      DYNAMIC_DRAW: 0x88e8,
      TEXTURE_2D: 0x0de1,
      TEXTURE0: 0x84c0,
      RGBA: 0x1908,
      UNSIGNED_BYTE: 0x1401,
      FLOAT: 0x1406,
      TRIANGLE_STRIP: 0x0005,
      COLOR_BUFFER_BIT: 0x4000,
      SCISSOR_TEST: 0x0c11,
      UNPACK_FLIP_Y_WEBGL: 0x9240,
      UNPACK_PREMULTIPLY_ALPHA_WEBGL: 0x9241,
      TEXTURE_WRAP_S: 0x2802,
      TEXTURE_WRAP_T: 0x2803,
      TEXTURE_MIN_FILTER: 0x2801,
      TEXTURE_MAG_FILTER: 0x2800,
      CLAMP_TO_EDGE: 0x812f,
      LINEAR: 0x2601,
      MAX_TEXTURE_SIZE: 0x0d33,
      isContextLost: jest.fn(() => false),
      createBuffer: jest.fn(() => ({})),
      bindBuffer: jest.fn(),
      bufferData: jest.fn(),
      bufferSubData: jest.fn(),
      createShader: jest.fn(() => ({})),
      shaderSource: jest.fn(),
      compileShader: jest.fn(),
      getShaderParameter: jest.fn(() => true),
      deleteShader: jest.fn(),
      createProgram: jest.fn(() => ({})),
      attachShader: jest.fn(),
      linkProgram: jest.fn(),
      getProgramParameter: jest.fn(() => true),
      deleteProgram: jest.fn(),
      useProgram: jest.fn(),
      getAttribLocation: jest.fn(() => 0),
      enableVertexAttribArray: jest.fn(),
      vertexAttribPointer: jest.fn(),
      getUniformLocation: jest.fn((_p: unknown, name: string) => name),
      uniform1f: jest.fn((loc: string, v: number) => uniforms.set(loc, v)),
      uniform1i: jest.fn((loc: string, v: number) => uniforms.set(loc, v)),
      uniform2f: jest.fn((loc: string, x: number, y: number) =>
        uniforms.set(loc, [x, y]),
      ),
      uniform3f: jest.fn((loc: string, x: number, y: number, z: number) =>
        uniforms.set(loc, [x, y, z]),
      ),
      getParameter: jest.fn(() => 4096),
      viewport: jest.fn(),
      enable: jest.fn(),
      disable: jest.fn(),
      scissor: jest.fn(),
      clearColor: jest.fn(),
      clear: jest.fn(),
      createTexture: jest.fn(() => ({})),
      activeTexture: jest.fn(),
      bindTexture: jest.fn(),
      pixelStorei: jest.fn(),
      texParameteri: jest.fn(),
      texImage2D: jest.fn(),
      texSubImage2D: jest.fn(),
      drawArrays: jest.fn(),
    };
    return { gl, uniforms };
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('compiles shaders, binds uniforms, and composites readback passes', () => {
    const { gl, uniforms } = createMockGl();
    const layer2d = stubContext();
    jest
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(((type: string) => {
        if (type === 'webgl2') return gl as unknown as WebGL2RenderingContext;
        if (type === '2d') return layer2d;
        return null;
      }) as typeof HTMLCanvasElement.prototype.getContext);

    jest.isolateModules(() => {
      const mod = require('@/lib/studio/render/gl-effect-pass') as typeof import('@/lib/studio/render/gl-effect-pass');
      expect(mod.isGpuEffectAvailable()).toBe(true);

      const drawImage = jest.fn();
      const ctx = stubContext() as unknown as Record<string, unknown>;
      ctx.canvas = { width: 1280, height: 720 };
      ctx.getTransform = () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
      ctx.drawImage = drawImage;

      const frame = {
        x: 0,
        y: 0,
        width: 1280,
        height: 720,
        radius: 0,
        headerHeight: 0,
        contentX: 0,
        contentY: 0,
        contentWidth: 1280,
        contentHeight: 720,
      };

      const gradeOk = mod.renderGpuEffectPass(
        ctx as unknown as CanvasRenderingContext2D,
        {
          type: 'color-grade',
          intensity: 0.75,
          frame,
          timeMs: 0,
          params: { exposure: 0.5, contrast: 1.2, saturation: 0.9 },
        },
      );
      expect(gradeOk).toBe(true);
      expect(uniforms.get('u_intensity')).toBe(0.75);
      expect(uniforms.get('u_exposure')).toBe(0.5);
      expect(uniforms.get('u_contrast')).toBe(1.2);
      expect(gl.drawArrays).toHaveBeenCalledTimes(1);
      expect(drawImage).toHaveBeenCalledTimes(1);

      const blurOk = mod.renderGpuEffectPass(
        ctx as unknown as CanvasRenderingContext2D,
        {
          type: 'motion-blur',
          intensity: 1,
          frame,
          timeMs: 0,
          params: { distance: 16, angle: 90, samples: 6 },
        },
      );
      expect(blurOk).toBe(true);
      expect(uniforms.get('u_distance')).toBe(16);
      expect(uniforms.get('u_angle')).toBeCloseTo(Math.PI / 2);
      expect(uniforms.get('u_samples')).toBe(6);
      expect(drawImage).toHaveBeenCalledTimes(2);
      expect(gl.texImage2D).toHaveBeenCalledTimes(1);
      expect(gl.texSubImage2D).toHaveBeenCalledTimes(1);
    });
  });

  it('keys a source layer and composites it back via drawKeyedSource', () => {
    const { gl, uniforms } = createMockGl();
    const layer2d = stubContext();
    jest
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(((type: string) => {
        if (type === 'webgl2') return gl as unknown as WebGL2RenderingContext;
        if (type === '2d') return layer2d;
        return null;
      }) as typeof HTMLCanvasElement.prototype.getContext);

    jest.isolateModules(() => {
      const mod = require('@/lib/studio/render/gl-effect-pass') as typeof import('@/lib/studio/render/gl-effect-pass');
      const drawImage = jest.fn();
      const ctx = stubContext() as unknown as Record<string, unknown>;
      ctx.canvas = { width: 1280, height: 720 };
      ctx.getTransform = () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
      ctx.drawImage = drawImage;

      const drawClip = jest.fn();
      const painted = mod.drawKeyedSource(
        ctx as unknown as CanvasRenderingContext2D,
        { x: 10, y: 20, width: 300, height: 200 },
        {
          keyColor: '#00ff00',
          tolerance: 0.3,
          softness: 0.1,
          spill: 0.5,
          intensity: 1,
        },
        drawClip,
      );

      expect(painted).toBe(true);
      expect(drawClip).toHaveBeenCalledTimes(1);
      expect(drawClip.mock.calls[0][0]).toBe(layer2d);
      expect(uniforms.get('u_keyColor')).toEqual([0, 1, 0]);
      expect(uniforms.get('u_tolerance')).toBe(0.3);
      expect(uniforms.get('u_softness')).toBe(0.1);
      expect(uniforms.get('u_spill')).toBe(0.5);
      expect(drawImage).toHaveBeenCalledTimes(1);
    });
  });
});
