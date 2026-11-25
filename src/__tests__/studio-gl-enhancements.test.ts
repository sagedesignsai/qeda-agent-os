/**
 * __tests__/studio-gl-enhancements.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Unit tests for the modular WebGL 2 enhancements:
 *   - `gl-transitions.ts` (two-texture GPU transitions + Canvas 2D fallback)
 *   - `gl-masks.ts` (luma-key & shape mask source passes)
 *   - `gl-scopes.ts` (RGB/luma histogram & LUT presets)
 *   - `gl-camera-fx.ts` (camera-velocity motion blur derivation)
 *   - `audio-reactive.ts` (FFT band extraction & plasma modulation)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  drawGpuTransitionFallback,
  isGpuTransitionType,
  renderGpuTransitionPass,
} from '@/lib/studio/render/gl-transitions';
import {
  applyLumaKeyCanvas,
  applyShapeMaskCanvas,
  drawMaskedSource,
} from '@/lib/studio/render/gl-masks';
import {
  COLOR_LUT_PRESETS,
  computeColorScopes,
  resolveColorLutParams,
} from '@/lib/studio/render/gl-scopes';
import { computeCameraMotionBlur } from '@/lib/studio/render/gl-camera-fx';
import {
  extractAudioBands,
  modulatePlasmaWithAudio,
} from '@/lib/studio/render/audio-reactive';
import {
  addClipEffect,
  applyColorLut,
  listColorLutPresets,
  setClipMask,
} from '@/lib/studio/editing';
import type { StudioTake } from '@/lib/studio/types';
import { IDLE_CAMERA } from '@/lib/studio/render/camera';

function stubContext(): CanvasRenderingContext2D {
  const store: Record<string, unknown> = {};
  return new Proxy(store, {
    get(target, prop) {
      if (typeof prop === 'string' && prop in target) return target[prop];
      return () => undefined;
    },
    set(target, prop, value) {
      target[prop as string] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

describe('gl-transitions', () => {
  it('identifies GPU transition types', () => {
    expect(isGpuTransitionType('cross-zoom')).toBe(true);
    expect(isGpuTransitionType('rgb-split')).toBe(true);
    expect(isGpuTransitionType('fade')).toBe(false);
  });

  it('returns false without WebGL2 and falls back cleanly in Canvas 2D', () => {
    const ctx = stubContext() as unknown as Record<string, unknown>;
    const drawImage = jest.fn();
    ctx.drawImage = drawImage;
    const req = {
      type: 'cross-zoom' as const,
      progress: 0.5,
      fromSource: { width: 100, height: 100 } as unknown as CanvasImageSource,
      toSource: { width: 100, height: 100 } as unknown as CanvasImageSource,
      rect: { x: 0, y: 0, width: 320, height: 180 },
    };

    expect(
      renderGpuTransitionPass(ctx as unknown as CanvasRenderingContext2D, req),
    ).toBe(false);

    drawGpuTransitionFallback(ctx as unknown as CanvasRenderingContext2D, req);
    expect(drawImage).toHaveBeenCalledTimes(2);
  });

  it('binds two textures and draws when WebGL2 is mocked', () => {
    const uniforms = new Map<string, unknown>();
    const samplers = new Map<string, number>();
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
      UNPACK_FLIP_Y_WEBGL: 0x9240,
      UNPACK_PREMULTIPLY_ALPHA_WEBGL: 0x9241,
      TEXTURE_WRAP_S: 0x2802,
      TEXTURE_WRAP_T: 0x2803,
      TEXTURE_MIN_FILTER: 0x2801,
      TEXTURE_MAG_FILTER: 0x2800,
      CLAMP_TO_EDGE: 0x812f,
      LINEAR: 0x2601,
      isContextLost: jest.fn(() => false),
      createBuffer: jest.fn(() => ({})),
      bindBuffer: jest.fn(),
      bufferData: jest.fn(),
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
      uniform1i: jest.fn((loc: string, v: number) => samplers.set(loc, v)),
      uniform2f: jest.fn(),
      uniform3f: jest.fn(),
      uniform4f: jest.fn(),
      viewport: jest.fn(),
      clearColor: jest.fn(),
      clear: jest.fn(),
      createTexture: jest.fn(() => ({})),
      activeTexture: jest.fn(),
      bindTexture: jest.fn(),
      pixelStorei: jest.fn(),
      texParameteri: jest.fn(),
      texImage2D: jest.fn(),
      drawArrays: jest.fn(),
    };

    jest
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(((type: string) => {
        if (type === 'webgl2') return gl as unknown as WebGL2RenderingContext;
        return null;
      }) as typeof HTMLCanvasElement.prototype.getContext);

    jest.isolateModules(() => {
      const mod = require('@/lib/studio/render/gl-transitions') as typeof import('@/lib/studio/render/gl-transitions');
      const ctx = stubContext() as unknown as Record<string, unknown>;
      const drawImage = jest.fn();
      ctx.drawImage = drawImage;

      const ok = mod.renderGpuTransitionPass(
        ctx as unknown as CanvasRenderingContext2D,
        {
          type: 'rgb-split',
          progress: 0.4,
          fromSource: { width: 100, height: 100 } as unknown as CanvasImageSource,
          toSource: { width: 100, height: 100 } as unknown as CanvasImageSource,
          rect: { x: 0, y: 0, width: 320, height: 180 },
        },
      );
      expect(ok).toBe(true);
      expect(uniforms.get('u_progress')).toBe(0.4);
      expect(samplers.get('u_from')).toBe(0);
      expect(samplers.get('u_to')).toBe(1);
      expect(drawImage).toHaveBeenCalledTimes(1);
    });

    jest.restoreAllMocks();
  });
});

describe('gl-masks', () => {
  it('degrades to null/false when WebGL2 is unavailable', () => {
    const src = { width: 64, height: 64 } as unknown as CanvasImageSource;
    const ctx = stubContext() as unknown as Record<string, unknown>;
    ctx.canvas = { width: 1280, height: 720 };
    ctx.getTransform = () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
    expect(
      applyLumaKeyCanvas(src, 64, 64, {
        threshold: 0.2,
        softness: 0.1,
        intensity: 1,
      }),
    ).toBeNull();
    expect(
      applyShapeMaskCanvas(src, 64, 64, {
        shape: 'circle',
        centerX: 0.5,
        centerY: 0.5,
        radiusX: 0.4,
        radiusY: 0.4,
        feather: 0.05,
      }),
    ).toBeNull();
    expect(
      drawMaskedSource(
        ctx as unknown as CanvasRenderingContext2D,
        { x: 0, y: 0, width: 100, height: 100 },
        {
          kind: 'shape',
          params: {
            shape: 'rect',
            centerX: 0.5,
            centerY: 0.5,
            radiusX: 0.4,
            radiusY: 0.4,
            feather: 0.05,
          },
        },
        jest.fn(),
      ),
    ).toBe(false);
  });
});

describe('gl-scopes', () => {
  it('computes RGB and luma histograms and resolves LUT presets', () => {
    const pixels = new Uint8ClampedArray([
      255, 0, 0, 255,
      0, 255, 0, 255,
      0, 0, 255, 255,
      0, 0, 0, 0, // transparent pixel ignored
    ]);
    const scopes = computeColorScopes(pixels, 16, 1);
    expect(scopes.bins).toBe(16);
    expect(scopes.pixelCount).toBe(3);
    expect(scopes.r[15]).toBe(1);
    expect(scopes.g[15]).toBe(1);
    expect(scopes.b[15]).toBe(1);

    expect(COLOR_LUT_PRESETS.length).toBeGreaterThan(0);
    expect(resolveColorLutParams('teal-orange')).toMatchObject({
      temperature: 0.25,
    });
    expect(resolveColorLutParams('non-existent')).toBeNull();
  });
});

describe('gl-camera-fx', () => {
  it('returns null for stationary camera and computes directional blur for fast pan', () => {
    expect(
      computeCameraMotionBlur(IDLE_CAMERA, IDLE_CAMERA, 1920, 1080),
    ).toBeNull();

    const moved = { ...IDLE_CAMERA, panX: IDLE_CAMERA.panX + 0.05 };
    const blur = computeCameraMotionBlur(IDLE_CAMERA, moved, 1920, 1080);
    expect(blur).not.toBeNull();
    expect(blur?.angle).toBeCloseTo(0);
    expect(blur?.distance).toBeGreaterThan(0);
    expect(blur?.intensity).toBeGreaterThan(0);
  });
});

describe('audio-reactive', () => {
  it('extracts normalized frequency bands and modulates plasma params', () => {
    const bins = new Uint8Array(32);
    bins.fill(255, 0, 3); // loud bass (floor(32 * 0.12) = 3)
    bins.fill(128, 3, 14); // moderate mids (floor(32 * 0.45) = 14)
    bins.fill(0, 14, 32); // silent highs

    const bands = extractAudioBands(bins);
    expect(bands.bass).toBeCloseTo(1);
    expect(bands.mid).toBeCloseTo(128 / 255);
    expect(bands.high).toBe(0);
    expect(bands.energy).toBeGreaterThan(0.5);

    const modulated = modulatePlasmaWithAudio(
      {
        width: 1280,
        height: 720,
        timeSec: 0,
        bgColor1: '#000000',
        bgColor2: '#111111',
        lineColor: '#ffffff',
        accentColor: '#38bdf8',
        lineCount: 6,
        warp: 1,
        seed: 1,
      },
      bands,
      1,
    );
    expect(modulated.warp).toBeGreaterThan(2);
    expect(modulated.lineCount).toBeGreaterThan(6);
  });
});

describe('copilot programmatic editing API', () => {
  function makeTake(): StudioTake {
    return {
      id: 'take-1',
      projectId: 'proj-1',
      name: 'Test Take',
      createdAt: 0,
      updatedAt: 0,
      durationMs: 5000,
      tracks: [
        {
          id: 'track-video',
          name: 'Video',
          type: 'video',
          clips: [
            {
              id: 'clip-1',
              trackId: 'track-video',
              itemType: 'video',
              name: 'Clip 1',
              startMs: 0,
              durationMs: 5000,
              sourceStartMs: 0,
              sourceDurationMs: 5000,
              payload: { mediaAssetId: 'asset-1' },
            },
          ],
          muted: false,
          locked: false,
          visible: true,
        },
      ],
    } as unknown as StudioTake;
  }

  it('adds WebGL effects, applies LUT presets, and sets/clears shape masks', () => {
    let take = makeTake();

    const added = addClipEffect(take, 'clip-1', { type: 'chroma-key' });
    expect(added.error).toBeUndefined();
    expect(added.effect?.type).toBe('chroma-key');
    take = added.take;

    expect(listColorLutPresets().length).toBeGreaterThan(0);
    const lut = applyColorLut(take, 'clip-1', 'teal-orange', 0.9);
    expect(lut.error).toBeUndefined();
    expect(lut.effect?.type).toBe('color-grade');
    expect(lut.effect?.params).toMatchObject({ temperature: 0.25 });
    take = lut.take;

    const masked = setClipMask(take, 'clip-1', {
      shape: 'circle',
      centerX: 0.5,
      centerY: 0.5,
      radiusX: 0.4,
      radiusY: 0.4,
      feather: 0.05,
    });
    expect(masked.error).toBeUndefined();
    expect(masked.take.tracks?.[0].clips[0].payload?.mask).toMatchObject({
      enabled: true,
      shape: 'circle',
    });

    const cleared = setClipMask(masked.take, 'clip-1', null);
    expect(cleared.take.tracks?.[0].clips[0].payload?.mask).toBeUndefined();
  });
});
