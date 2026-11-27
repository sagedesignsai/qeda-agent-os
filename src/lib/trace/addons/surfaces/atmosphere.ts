/**
 * lib/trace/addons/surfaces/atmosphere.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Atmospheric surfaces: aurora mesh, film grain and star fields.
 */

import type { TraceElement } from '../../types';
import {
  optionColor,
  optionNumber,
  withAlpha,
} from '../../blocks/helpers';
import type { TraceBlockDefinition } from '../../blocks/types';
import {
  SURFACE_DURATION_MS,
  assembleSurface,
  blurFilter,
  grainFilter,
  linearGradient,
  radialGradient,
  seededRandom,
  surfaceCircle,
  surfaceGroup,
  surfacePath,
  surfaceRect,
  surfaceTrack,
} from './helpers';

export const auroraSurfaceBlock: TraceBlockDefinition = {
  id: 'surface-aurora',
  title: 'Aurora mesh',
  description:
    'Deep gradient base with three drifting, softly blurred light pools and a vignette. The slowest, most ambient surface in the pack.',
  category: 'Backgrounds',
  addonId: 'surfaces',
  tags: ['background', 'aurora', 'gradient', 'glow', 'mesh', 'ambient'],
  keywords: [
    'aurora',
    'mesh gradient',
    'glow field',
    'ambient background',
    'soft background',
  ],
  layer: 'background',
  fields: [
    { key: 'baseColor', label: 'Base', kind: 'color' },
    { key: 'deepColor', label: 'Depth', kind: 'color' },
    { key: 'glowColor', label: 'Glow', kind: 'color' },
    { key: 'accentColor', label: 'Accent', kind: 'color' },
  ],
  defaults: {
    baseColor: '#172554',
    deepColor: '#020617',
    glowColor: '#38bdf8',
    accentColor: '#8b5cf6',
  },
  size: { width: 1280, height: 720 },
  previewTimeMs: 1800,
  previewDurationMs: SURFACE_DURATION_MS,
  build: ({ options, idFactory, canvas }) => {
    const base = optionColor(options, 'baseColor', '#172554');
    const deep = optionColor(options, 'deepColor', '#020617');
    const glow = optionColor(options, 'glowColor', '#38bdf8');
    const accent = optionColor(options, 'accentColor', '#8b5cf6');

    const rootId = idFactory('surface-aurora');
    const skyId = `${rootId}-sky`;
    const glowGradientId = `${rootId}-glow`;
    const accentGradientId = `${rootId}-accent`;
    const vignetteId = `${rootId}-vignette`;
    const blurId = `${rootId}-blur`;

    const bgId = idFactory('aurora-bg');
    const glowGroupId = idFactory('aurora-glow');
    const vignetteElementId = idFactory('aurora-vignette');
    const glowIds = [0, 1, 2].map((index) => idFactory(`aurora-glow-${index}`));

    const glowPositions: Array<{
      x: number;
      y: number;
      radius: number;
      fill: string;
      drift: number;
    }> = [
      {
        x: canvas.width * 0.22,
        y: canvas.height * 0.28,
        radius: canvas.width * 0.32,
        fill: `url(#${glowGradientId})`,
        drift: 1,
      },
      {
        x: canvas.width * 0.82,
        y: canvas.height * 0.24,
        radius: canvas.width * 0.28,
        fill: `url(#${accentGradientId})`,
        drift: -1,
      },
      {
        x: canvas.width * 0.56,
        y: canvas.height * 0.92,
        radius: canvas.width * 0.36,
        fill: `url(#${glowGradientId})`,
        drift: 0.5,
      },
    ];

    const glows: Record<string, TraceElement> = {};
    glowIds.forEach((glowId, index) => {
      const setup = glowPositions[index];
      const phase = index * 420;
      const offset = phase;
      const duration = SURFACE_DURATION_MS;
      glows[glowId] = surfaceCircle(
        glowId,
        `Light pool ${index + 1}`,
        setup.x,
        setup.y,
        setup.radius,
        { fill: setup.fill, opacity: 0.7 },
        [
          surfaceTrack(`${glowId}-x`, 'x', 'Drift X', [
            { timeMs: 0, value: 0, easing: 'ease-in-out' },
            {
              timeMs: (1300 + offset) % duration,
              value: 26 * setup.drift,
              easing: 'ease-in-out',
            },
            {
              timeMs: (2700 + offset) % duration,
              value: -20 * setup.drift,
              easing: 'ease-in-out',
            },
            { timeMs: duration, value: 0, easing: 'ease-in-out' },
          ]),
          surfaceTrack(`${glowId}-y`, 'y', 'Drift Y', [
            { timeMs: 0, value: 0, easing: 'ease-in-out' },
            {
              timeMs: (1500 + offset) % duration,
              value: -16 * setup.drift,
              easing: 'ease-in-out',
            },
            {
              timeMs: (2800 + offset) % duration,
              value: 12 * setup.drift,
              easing: 'ease-in-out',
            },
            { timeMs: duration, value: 0, easing: 'ease-in-out' },
          ]),
          surfaceTrack(`${glowId}-opacity`, 'opacity', 'Breathe', [
            { timeMs: 0, value: 0.55, easing: 'ease-in-out' },
            { timeMs: 1200 + phase, value: 0.82, easing: 'ease-in-out' },
            { timeMs: 2400 + phase, value: 0.6, easing: 'ease-in-out' },
            { timeMs: duration, value: 0.55, easing: 'ease-in-out' },
          ]),
          surfaceTrack(`${glowId}-scale`, 'scaleX', 'Scale', [
            { timeMs: 0, value: 1, easing: 'ease-in-out' },
            { timeMs: 2000, value: 1.08, easing: 'ease-in-out' },
            { timeMs: duration, value: 1, easing: 'ease-in-out' },
          ]),
        ],
      );
    });

    return assembleSurface(
      surfaceGroup(
        rootId,
        'Aurora mesh',
        { x: 0, y: 0, width: canvas.width, height: canvas.height },
        [bgId, glowGroupId, vignetteElementId],
      ),
      {
        [bgId]: surfaceRect(bgId, 'Sky', {
          width: canvas.width,
          height: canvas.height,
          fill: `url(#${skyId})`,
        }),
        [glowGroupId]: surfaceGroup(
          glowGroupId,
          'Light pools',
          {
            x: 0,
            y: 0,
            width: canvas.width,
            height: canvas.height,
            filter: `url(#${blurId})`,
          },
          glowIds,
        ),
        ...glows,
        [vignetteElementId]: surfaceRect(vignetteElementId, 'Vignette', {
          width: canvas.width,
          height: canvas.height,
          fill: `url(#${vignetteId})`,
        }),
      },
      canvas.width,
      canvas.height,
      {
        gradients: {
          [skyId]: linearGradient(skyId, 125, [
            { offset: 0, color: deep },
            { offset: 0.55, color: base },
            { offset: 1, color: withAlpha(deep, 1) },
          ]),
          [glowGradientId]: radialGradient(glowGradientId, [
            { offset: 0, color: glow, opacity: 0.75 },
            { offset: 0.55, color: glow, opacity: 0.28 },
            { offset: 1, color: glow, opacity: 0 },
          ]),
          [accentGradientId]: radialGradient(accentGradientId, [
            { offset: 0, color: accent, opacity: 0.65 },
            { offset: 0.6, color: accent, opacity: 0.2 },
            { offset: 1, color: accent, opacity: 0 },
          ]),
          [vignetteId]: radialGradient(vignetteId, [
            { offset: 0, color: deep, opacity: 0 },
            { offset: 0.62, color: deep, opacity: 0.08 },
            { offset: 1, color: deep, opacity: 0.82 },
          ]),
        },
        filters: {
          [blurId]: blurFilter(blurId, Math.max(18, canvas.width * 0.035)),
        },
      },
    );
  },
};

export const grainSurfaceBlock: TraceBlockDefinition = {
  id: 'surface-grain',
  title: 'Film grain & vignette',
  description:
    'Gradient film base with a turbulence grain overlay, stepped flicker, scanlines, a light leak and a heavy vignette. Instant analog texture.',
  category: 'Backgrounds',
  addonId: 'surfaces',
  tags: ['background', 'grain', 'film', 'texture', 'vignette', 'analog'],
  keywords: ['film grain', 'noise', 'analog', 'vhs', 'texture', 'vignette'],
  layer: 'background',
  fields: [
    { key: 'baseColor', label: 'Base', kind: 'color' },
    { key: 'deepColor', label: 'Depth', kind: 'color' },
    { key: 'leakColor', label: 'Light leak', kind: 'color' },
    {
      key: 'intensity',
      label: 'Grain',
      kind: 'number',
      min: 0,
      max: 100,
      step: 5,
      suffix: '%',
    },
  ],
  defaults: {
    baseColor: '#1e293b',
    deepColor: '#020617',
    leakColor: '#f97316',
    intensity: 45,
  },
  size: { width: 1280, height: 720 },
  previewTimeMs: 900,
  previewDurationMs: SURFACE_DURATION_MS,
  build: ({ options, idFactory, canvas }) => {
    const base = optionColor(options, 'baseColor', '#1e293b');
    const deep = optionColor(options, 'deepColor', '#020617');
    const leak = optionColor(options, 'leakColor', '#f97316');
    const intensity = Math.max(
      0,
      Math.min(100, optionNumber(options, 'intensity', 45)),
    );

    const rootId = idFactory('surface-grain');
    const skyId = `${rootId}-sky`;
    const leakId = `${rootId}-leak`;
    const vignetteId = `${rootId}-vignette`;
    const grainId = `${rootId}-grain-filter`;

    const bgId = idFactory('grain-bg');
    const leakElementId = idFactory('grain-leak');
    const grainElementId = idFactory('grain-noise');
    const scanlinesId = idFactory('grain-scanlines');
    const vignetteElementId = idFactory('grain-vignette');

    const lineCount = Math.max(12, Math.round(canvas.height / 28));
    const scanlineIds = Array.from({ length: lineCount }, (_, index) =>
      idFactory(`grain-scanline-${index}`),
    );
    const scanlines: Record<string, TraceElement> = {};
    scanlineIds.forEach((lineId, index) => {
      scanlines[lineId] = surfaceRect(
        lineId,
        `Scanline ${index + 1}`,
        {
          y: (index / lineCount) * canvas.height,
          width: canvas.width,
          height: 1,
          fill: '#ffffff',
          opacity: 0.05,
        },
        [],
        { x: 0, y: 0 },
      );
    });

    const flickerValues = [0.5, 0.78, 0.42, 0.9, 0.55, 0.72, 0.38, 0.84, 0.6, 0.46, 0.66, 0.5];
    const flicker = flickerValues.map((value, index) => ({
      timeMs: Math.round((index / (flickerValues.length - 1)) * SURFACE_DURATION_MS),
      value: Number((value * (intensity / 100) * 0.28).toFixed(3)),
    }));

    return assembleSurface(
      surfaceGroup(
        rootId,
        'Film grain & vignette',
        { x: 0, y: 0, width: canvas.width, height: canvas.height },
        [bgId, leakElementId, scanlinesId, grainElementId, vignetteElementId],
      ),
      {
        [bgId]: surfaceRect(bgId, 'Film base', {
          width: canvas.width,
          height: canvas.height,
          fill: `url(#${skyId})`,
        }),
        [leakElementId]: surfaceCircle(
          leakElementId,
          'Light leak',
          canvas.width * 0.92,
          canvas.height * 0.1,
          canvas.width * 0.42,
          { fill: `url(#${leakId})`, opacity: 0.9 },
          [
            surfaceTrack(`${leakElementId}-opacity`, 'opacity', 'Leak breathe', [
              { timeMs: 0, value: 0.65, easing: 'ease-in-out' },
              { timeMs: 2000, value: 0.95, easing: 'ease-in-out' },
              { timeMs: SURFACE_DURATION_MS, value: 0.65, easing: 'ease-in-out' },
            ]),
          ],
        ),
        [scanlinesId]: surfaceGroup(
          scanlinesId,
          'Scanlines',
          { x: 0, y: 0, width: canvas.width, height: canvas.height },
          scanlineIds,
          [
            surfaceTrack(`${scanlinesId}-y`, 'y', 'Scan drift', [
              { timeMs: 0, value: 0, easing: 'linear' },
              { timeMs: SURFACE_DURATION_MS, value: 28, easing: 'linear' },
            ]),
          ],
        ),
        ...scanlines,
        [grainElementId]: surfaceRect(
          grainElementId,
          'Grain',
          {
            width: canvas.width,
            height: canvas.height,
            fill: '#ffffff',
            filter: `url(#${grainId})`,
            opacity: 0.12,
          },
          [
            surfaceTrack(
              `${grainElementId}-opacity`,
              'opacity',
              'Grain flicker',
              flicker,
              true,
            ),
          ],
        ),
        [vignetteElementId]: surfaceRect(vignetteElementId, 'Vignette', {
          width: canvas.width,
          height: canvas.height,
          fill: `url(#${vignetteId})`,
        }),
      },
      canvas.width,
      canvas.height,
      {
        gradients: {
          [skyId]: linearGradient(skyId, 100, [
            { offset: 0, color: base },
            { offset: 0.6, color: deep },
            { offset: 1, color: deep },
          ]),
          [leakId]: radialGradient(leakId, [
            { offset: 0, color: leak, opacity: 0.55 },
            { offset: 0.5, color: leak, opacity: 0.16 },
            { offset: 1, color: leak, opacity: 0 },
          ]),
          [vignetteId]: radialGradient(vignetteId, [
            { offset: 0, color: deep, opacity: 0 },
            { offset: 0.55, color: deep, opacity: 0.12 },
            { offset: 1, color: deep, opacity: 0.88 },
          ]),
        },
        filters: {
          [grainId]: grainFilter(grainId, 0.9, 7),
        },
      },
    );
  },
};

export const starfieldSurfaceBlock: TraceBlockDefinition = {
  id: 'surface-starfield',
  title: 'Star field',
  description:
    'A deep-space gradient with seeded twinkling stars, a few blurred bokeh glows and a slow parallax drift. Deterministic brightness, infinitely reusable.',
  category: 'Backgrounds',
  addonId: 'surfaces',
  tags: ['background', 'stars', 'space', 'night', 'twinkle', 'parallax'],
  keywords: ['starfield', 'stars', 'space', 'night sky', 'galaxy', 'twinkle'],
  layer: 'background',
  fields: [
    { key: 'baseColor', label: 'Sky', kind: 'color' },
    { key: 'deepColor', label: 'Depth', kind: 'color' },
    { key: 'starColor', label: 'Stars', kind: 'color' },
    { key: 'glowColor', label: 'Glow', kind: 'color' },
    {
      key: 'count',
      label: 'Stars',
      kind: 'number',
      min: 20,
      max: 90,
      step: 5,
    },
  ],
  defaults: {
    baseColor: '#0f172a',
    deepColor: '#020617',
    starColor: '#e2e8f0',
    glowColor: '#38bdf8',
    count: 60,
  },
  size: { width: 1280, height: 720 },
  previewTimeMs: 1500,
  previewDurationMs: SURFACE_DURATION_MS,
  build: ({ options, idFactory, canvas }) => {
    const base = optionColor(options, 'baseColor', '#0f172a');
    const deep = optionColor(options, 'deepColor', '#020617');
    const star = optionColor(options, 'starColor', '#e2e8f0');
    const glow = optionColor(options, 'glowColor', '#38bdf8');
    const count = Math.max(
      20,
      Math.min(90, Math.round(optionNumber(options, 'count', 60))),
    );

    const rootId = idFactory('surface-starfield');
    const skyId = `${rootId}-sky`;
    const glowGradientId = `${rootId}-glow`;
    const blurId = `${rootId}-blur`;

    const bgId = idFactory('starfield-bg');
    const starGroupId = idFactory('starfield-stars');
    const bokehGroupId = idFactory('starfield-bokeh');
    const bokehIds = [0, 1, 2].map((index) => idFactory(`starfield-bokeh-${index}`));

    const random = seededRandom(4217 + count);
    const starIds = Array.from({ length: count }, (_, index) =>
      idFactory(`starfield-star-${index}`),
    );
    const stars: Record<string, TraceElement> = {};
    const stageWidth = canvas.width * 1.06;
    const stageHeight = canvas.height * 1.06;

    starIds.forEach((starId, index) => {
      const x = 0.02 + random() * 0.96;
      const y = 0.02 + random() * 0.96;
      const radius = 0.7 + random() * 1.7;
      const initial = 0.25 + random() * 0.65;
      const peakTime = 600 + Math.round(random() * 2200);
      const dipTime = Math.min(3400, peakTime + 500);

      stars[starId] = surfaceCircle(
        starId,
        `Star ${index + 1}`,
        x * stageWidth,
        y * stageHeight,
        radius,
        { fill: star, opacity: initial },
        [
          surfaceTrack(`${starId}-opacity`, 'opacity', 'Twinkle', [
            { timeMs: 0, value: initial, easing: 'ease-in-out' },
            { timeMs: peakTime, value: 1, easing: 'ease-in-out' },
            { timeMs: dipTime, value: initial * 0.55, easing: 'ease-in-out' },
            { timeMs: SURFACE_DURATION_MS, value: initial, easing: 'ease-in-out' },
          ]),
        ],
      );
    });

    const bokehPositions: Array<[number, number, number]> = [
      [0.24, 0.32, 0.11],
      [0.72, 0.2, 0.08],
      [0.58, 0.78, 0.13],
    ];
    const bokeh: Record<string, TraceElement> = {};
    bokehIds.forEach((id, index) => {
      const [cx, cy, radius] = bokehPositions[index];
      bokeh[id] = surfaceCircle(
        id,
        `Bokeh ${index + 1}`,
        cx * canvas.width,
        cy * canvas.height,
        radius * canvas.width,
        { fill: `url(#${glowGradientId})`, opacity: 0.5 },
        [
          surfaceTrack(`${id}-x`, 'x', 'Drift', [
            { timeMs: 0, value: 0, easing: 'ease-in-out' },
            {
              timeMs: 2000 + index * 240,
              value: index % 2 === 0 ? 22 : -18,
              easing: 'ease-in-out',
            },
            { timeMs: SURFACE_DURATION_MS, value: 0, easing: 'ease-in-out' },
          ]),
          surfaceTrack(`${id}-opacity`, 'opacity', 'Breathe', [
            { timeMs: 0, value: 0.4, easing: 'ease-in-out' },
            { timeMs: 2200, value: 0.62, easing: 'ease-in-out' },
            { timeMs: SURFACE_DURATION_MS, value: 0.4, easing: 'ease-in-out' },
          ]),
        ],
      );
    });

    return assembleSurface(
      surfaceGroup(
        rootId,
        'Star field',
        { x: 0, y: 0, width: canvas.width, height: canvas.height },
        [bgId, bokehGroupId, starGroupId],
      ),
      {
        [bgId]: surfaceRect(bgId, 'Night sky', {
          width: canvas.width,
          height: canvas.height,
          fill: `url(#${skyId})`,
        }),
        [starGroupId]: surfaceGroup(
          starGroupId,
          'Stars',
          {
            x: 0,
            y: 0,
            width: canvas.width,
            height: canvas.height,
          },
          starIds,
          [
            surfaceTrack(`${starGroupId}-x`, 'x', 'Parallax X', [
              { timeMs: 0, value: 0, easing: 'ease-in-out' },
              { timeMs: 2000, value: -canvas.width * 0.02, easing: 'ease-in-out' },
              { timeMs: SURFACE_DURATION_MS, value: 0, easing: 'ease-in-out' },
            ]),
            surfaceTrack(`${starGroupId}-y`, 'y', 'Parallax Y', [
              { timeMs: 0, value: 0, easing: 'ease-in-out' },
              { timeMs: 2600, value: -canvas.height * 0.015, easing: 'ease-in-out' },
              { timeMs: SURFACE_DURATION_MS, value: 0, easing: 'ease-in-out' },
            ]),
          ],
        ),
        ...stars,
        [bokehGroupId]: surfaceGroup(
          bokehGroupId,
          'Bokeh glows',
          {
            x: 0,
            y: 0,
            width: canvas.width,
            height: canvas.height,
            filter: `url(#${blurId})`,
          },
          bokehIds,
        ),
        ...bokeh,
      },
      canvas.width,
      canvas.height,
      {
        gradients: {
          [skyId]: linearGradient(skyId, 95, [
            { offset: 0, color: deep },
            { offset: 0.45, color: base },
            { offset: 1, color: deep },
          ]),
          [glowGradientId]: radialGradient(glowGradientId, [
            { offset: 0, color: glow, opacity: 0.4 },
            { offset: 0.55, color: glow, opacity: 0.12 },
            { offset: 1, color: glow, opacity: 0 },
          ]),
        },
        filters: {
          [blurId]: blurFilter(blurId, 24, 'Bokeh blur'),
        },
      },
    );
  },
};