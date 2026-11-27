/**
 * lib/trace/addons/surfaces/advanced.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Advanced surface pack: eight layered, filter-driven backgrounds that go
 * beyond the first ten blocks — synthwave horizons, liquid blobs, bokeh depth,
 * aurora curtains, nebulas, kaleidoscopes, travelling dot waves and skyline
 * parallax.
 *
 * Everything is still ordinary Trace layers (paths, circles, rects, gradients,
 * filters, tracks), so each template stays fully editable after insertion and
 * exports through the standard SMIL/GSAP paths. Geometry is seeded, so previews
 * and inserts are deterministic. Every motion loops seamlessly on the
 * four-second surface canvas.
 */

import type { TraceElement } from '../../types';
import type { PropertyTrack } from '../../types';
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
  linearGradient,
  radialGradient,
  seededRandom,
  surfaceCircle,
  surfaceGroup,
  surfacePath,
  surfaceRect,
  surfaceTrack,
} from './helpers';

/**
 * x/y tracks are offsets: move an authored box position into baseX/baseY so
 * drift starts from the designed place instead of the canvas origin.
 */
function withBasePosition(element: TraceElement): TraceElement {
  if (element.attributes.baseX !== undefined) return element;
  element.attributes.baseX = element.attributes.x ?? 0;
  element.attributes.baseY = element.attributes.y ?? 0;
  element.attributes.x = 0;
  element.attributes.y = 0;
  return element;
}

/**
 * A vertical wavy ribbon path, used by the aurora curtains. The band widens
 * toward the bottom and both edges share one sine sway so the ribbon bends
 * instead of shearing.
 */
function curtainPath(
  centerX: number,
  height: number,
  amplitude: number,
  width: number,
  phase: number,
  segments = 28,
): string {
  const half = width / 2;
  const left: string[] = [];
  const right: string[] = [];
  for (let index = 0; index <= segments; index += 1) {
    const t = index / segments;
    const y = Number((t * height).toFixed(2));
    const sway = Math.sin(t * Math.PI * 1.6 + phase) * amplitude;
    const taper = 0.55 + 0.65 * t;
    left.push(
      `${(centerX - half * taper + sway).toFixed(2)} ${y}`,
    );
    right.push(
      `${(centerX + half * taper + sway * 0.86).toFixed(2)} ${y}`,
    );
  }
  return `M ${left.join(' L ')} L ${right.reverse().join(' L ')} Z`;
}

/** Sample a closed lissajous so a blob drifts on a loop-safe path. */
function lissajous(
  t: number,
  cx: number,
  cy: number,
  ax: number,
  ay: number,
  phaseX: number,
  phaseY: number,
  kY = 2,
): { x: number; y: number } {
  return {
    x: cx + ax * Math.sin(2 * Math.PI * t + phaseX),
    y: cy + ay * Math.sin(2 * Math.PI * kY * t + phaseY),
  };
}

function trianglePath(
  cx: number,
  cy: number,
  r: number,
  a0: number,
  a1: number,
): string {
  const x0 = cx + Math.cos(a0) * r;
  const y0 = cy + Math.sin(a0) * r;
  const x1 = cx + Math.cos(a1) * r;
  const y1 = cy + Math.sin(a1) * r;
  return `M ${cx} ${cy} L ${x0} ${y0} L ${x1} ${y1} Z`;
}

function ease(t: number): number {
  return 0.5 - 0.5 * Math.cos(Math.PI * t);
}

function loopTrack(
  id: string,
  property: PropertyTrack['property'],
  label: string,
  from: number,
  peak: number,
  options: { samples?: number; easing?: string } = {},
): PropertyTrack {
  const samples = options.samples ?? 3;
  const keyframes = Array.from({ length: samples + 1 }, (_, index) => {
    const t = index / samples;
    const value = from + (peak - from) * ease(t);
    return {
      timeMs: Math.round(t * SURFACE_DURATION_MS),
      value: Number(value.toFixed(2)),
      easing: options.easing ?? 'ease-in-out',
    };
  });
  // Guarantee an identical first and last frame.
  keyframes[keyframes.length - 1] = {
    ...keyframes[keyframes.length - 1],
    value: from,
  };
  return surfaceTrack(id, property, label, keyframes);
}

/* ── 1. Neon horizon ─────────────────────────────────────────────────────── */

export const neonHorizonSurfaceBlock: TraceBlockDefinition = {
  id: 'surface-neon-horizon',
  title: 'Neon horizon',
  description:
    'Synthwave sunset: gradient sky, striped sun, glowing horizon and a perspective grid that pulses toward the vanishing point.',
  category: 'Backgrounds',
  addonId: 'surfaces',
  tags: ['background', 'synthwave', 'retro', 'grid', 'sunset', 'advanced'],
  keywords: [
    'synthwave',
    'retrowave',
    'outrun',
    'neon grid',
    'vaporwave',
    'horizon',
    'perspective grid',
  ],
  layer: 'background',
  fields: [
    { key: 'baseColor', label: 'Sky', kind: 'color' },
    { key: 'deepColor', label: 'Depth', kind: 'color' },
    { key: 'sunTop', label: 'Sun top', kind: 'color' },
    { key: 'sunBottom', label: 'Sun base', kind: 'color' },
    { key: 'gridColor', label: 'Grid', kind: 'color' },
  ],
  defaults: {
    baseColor: '#2a1055',
    deepColor: '#0a0618',
    sunTop: '#fde047',
    sunBottom: '#f472b6',
    gridColor: '#22d3ee',
  },
  size: { width: 1280, height: 720 },
  previewTimeMs: 1800,
  previewDurationMs: SURFACE_DURATION_MS,
  build: ({ options, idFactory, canvas }) => {
    const base = optionColor(options, 'baseColor', '#2a1055');
    const deep = optionColor(options, 'deepColor', '#0a0618');
    const sunTop = optionColor(options, 'sunTop', '#fde047');
    const sunBottom = optionColor(options, 'sunBottom', '#f472b6');
    const grid = optionColor(options, 'gridColor', '#22d3ee');

    const rootId = idFactory('surface-neon-horizon');
    const skyId = `${rootId}-sky`;
    const sunGradientId = `${rootId}-sun`;
    const sunBlurId = `${rootId}-sun-blur`;
    const gridBlurId = `${rootId}-grid-blur`;

    const bgId = idFactory('horizon-bg');
    const starsId = idFactory('horizon-stars');
    const sunGroupId = idFactory('horizon-sun');
    const sunGlowId = idFactory('horizon-sun-glow');
    const sunId = idFactory('horizon-sun-disc');
    const stripesId = idFactory('horizon-stripes');
    const horizonId = idFactory('horizon-line');
    const gridId = idFactory('horizon-grid');

    const horizonY = canvas.height * 0.62;
    const sunRadius = canvas.width * 0.14;
    const sunCx = canvas.width * 0.5;
    const sunCy = horizonY - sunRadius * 0.55;
    const stripePeriod = Math.max(10, Math.round(sunRadius / 5));

    const random = seededRandom(7717);
    const starIds = Array.from({ length: 14 }, (_, index) =>
      idFactory(`horizon-star-${index}`),
    );
    const stars: Record<string, TraceElement> = {};
    starIds.forEach((starId, index) => {
      const x = 0.04 + random() * 0.92;
      const y = 0.05 + random() * (horizonY / canvas.height - 0.12);
      const radius = 0.8 + random() * 1.4;
      const initial = 0.25 + random() * 0.5;
      stars[starId] = surfaceCircle(
        starId,
        `Star ${index + 1}`,
        x * canvas.width,
        y * canvas.height,
        radius,
        { fill: '#e2e8f0', opacity: initial },
        [
          surfaceTrack(`${starId}-opacity`, 'opacity', 'Twinkle', [
            { timeMs: 0, value: initial, easing: 'ease-in-out' },
            { timeMs: 900 + index * 130, value: Math.min(1, initial + 0.35), easing: 'ease-in-out' },
            { timeMs: 2600 + index * 60, value: initial * 0.6, easing: 'ease-in-out' },
            { timeMs: SURFACE_DURATION_MS, value: initial, easing: 'ease-in-out' },
          ]),
        ],
      );
    });

    const stripeIds = Array.from({ length: 5 }, (_, index) =>
      idFactory(`horizon-stripe-${index}`),
    );
    const stripes: Record<string, TraceElement> = {};
    stripeIds.forEach((stripeId, index) => {
      const y = sunCy + sunRadius * (0.15 + index * 0.2);
      stripes[stripeId] = surfaceRect(
        stripeId,
        `Sun stripe ${index + 1}`,
        {
          x: sunCx - sunRadius - 2,
          y,
          width: sunRadius * 2 + 4,
          height: stripePeriod * 0.45,
          fill: deep,
        },
        [],
        { x: 0, y: 0 },
      );
    });

    const gridLineIds: string[] = [];
    const gridLines: Record<string, TraceElement> = {};
    for (let index = -6; index <= 6; index += 1) {
      const lineId = idFactory(`horizon-grid-v-${index + 6}`);
      gridLineIds.push(lineId);
      const bottomX = sunCx + (index / 6) * canvas.width * 0.9;
      gridLines[lineId] = surfacePath(
        lineId,
        `Ray ${index + 7}`,
        `M ${sunCx} ${horizonY} L ${bottomX} ${canvas.height}`,
        {
          fill: 'none',
          stroke: grid,
          strokeWidth: 1.6,
          opacity: 0.5 - Math.abs(index) * 0.03,
        },
      );
    }
    const hLineIds: string[] = [];
    for (let index = 1; index <= 7; index += 1) {
      const lineId = idFactory(`horizon-grid-h-${index}`);
      hLineIds.push(lineId);
      const y = horizonY + (canvas.height - horizonY) * Math.pow(index / 7, 1.8);
      gridLines[lineId] = surfaceRect(
        lineId,
        `Ground line ${index}`,
        {
          x: 0,
          y,
          width: canvas.width,
          height: 1.4,
          fill: grid,
          opacity: 0.32,
        },
        [],
        { x: 0, y: 0 },
      );
    }

    return assembleSurface(
      surfaceGroup(
        rootId,
        'Neon horizon',
        { x: 0, y: 0, width: canvas.width, height: canvas.height },
        [bgId, starsId, sunGroupId, horizonId, gridId],
      ),
      {
        [bgId]: surfaceRect(bgId, 'Sky', {
          width: canvas.width,
          height: canvas.height,
          fill: `url(#${skyId})`,
        }),
        [starsId]: surfaceGroup(
          starsId,
          'Stars',
          { x: 0, y: 0, width: canvas.width, height: horizonY },
          starIds,
        ),
        ...stars,
        [sunGroupId]: surfaceGroup(
          sunGroupId,
          'Sun',
          {
            x: 0,
            y: 0,
            width: canvas.width,
            height: canvas.height,
            filter: `url(#${sunBlurId})`,
          },
          [sunGlowId, sunId, stripesId],
          [
            surfaceTrack(`${sunGroupId}-scale`, 'scaleX', 'Breathe', [
              { timeMs: 0, value: 1, easing: 'ease-in-out' },
              { timeMs: 2000, value: 1.05, easing: 'ease-in-out' },
              { timeMs: SURFACE_DURATION_MS, value: 1, easing: 'ease-in-out' },
            ]),
            surfaceTrack(`${sunGroupId}-scale-y`, 'scaleY', 'Breathe', [
              { timeMs: 0, value: 1, easing: 'ease-in-out' },
              { timeMs: 2000, value: 1.05, easing: 'ease-in-out' },
              { timeMs: SURFACE_DURATION_MS, value: 1, easing: 'ease-in-out' },
            ]),
          ],
          { x: sunCx, y: sunCy },
        ),
        [sunGlowId]: surfaceCircle(
          sunGlowId,
          'Sun halo',
          sunCx,
          sunCy,
          sunRadius * 1.35,
          { fill: `url(#${sunGradientId})`, opacity: 0.5 },
        ),
        [sunId]: surfaceCircle(
          sunId,
          'Sun disc',
          sunCx,
          sunCy,
          sunRadius,
          { fill: `url(#${sunGradientId})`, opacity: 0.95 },
        ),
        [stripesId]: surfaceGroup(
          stripesId,
          'Sun stripes',
          { x: 0, y: 0, width: canvas.width, height: canvas.height },
          stripeIds,
          [
            // One full period per loop: the stripes land on identical frames.
            surfaceTrack(`${stripesId}-y`, 'y', 'Scan', [
              { timeMs: 0, value: 0, easing: 'linear' },
              {
                timeMs: SURFACE_DURATION_MS,
                value: stripePeriod,
                easing: 'linear',
              },
            ]),
          ],
        ),
        ...stripes,
        [horizonId]: surfaceRect(horizonId, 'Horizon', {
          y: horizonY - 1,
          width: canvas.width,
          height: 2.5,
          fill: grid,
          opacity: 0.9,
        }),
        [gridId]: surfaceGroup(
          gridId,
          'Perspective grid',
          {
            x: 0,
            y: 0,
            width: canvas.width,
            height: canvas.height - horizonY,
            filter: `url(#${gridBlurId})`,
          },
          [...gridLineIds, ...hLineIds],
          [
            loopTrack(`${gridId}-opacity`, 'opacity', 'Grid pulse', 0.75, 1, {
              samples: 2,
            }),
          ],
        ),
        ...gridLines,
      },
      canvas.width,
      canvas.height,
      {
        gradients: {
          [skyId]: linearGradient(skyId, 90, [
            { offset: 0, color: deep },
            { offset: 0.55, color: base },
            { offset: 0.56, color: deep },
            { offset: 1, color: deep },
          ]),
          [sunGradientId]: linearGradient(sunGradientId, 90, [
            { offset: 0, color: sunTop, opacity: 1 },
            { offset: 1, color: sunBottom, opacity: 0.9 },
          ]),
        },
        filters: {
          [sunBlurId]: blurFilter(sunBlurId, Math.max(8, canvas.width * 0.008), 'Sun bloom'),
          [gridBlurId]: blurFilter(gridBlurId, 1.4, 'Grid glow'),
        },
      },
    );
  },
};

/* ── 2. Liquid blobs ─────────────────────────────────────────────────────── */

export const liquidBlobsSurfaceBlock: TraceBlockDefinition = {
  id: 'surface-liquid-blobs',
  title: 'Liquid blobs',
  description:
    'Soft gradient blobs drifting on lissajous paths behind a heavy blur — an ambient, premium mesh of colour that never repeats a frame twice.',
  category: 'Backgrounds',
  addonId: 'surfaces',
  tags: ['background', 'blobs', 'gradient', 'ambient', 'liquid', 'advanced'],
  keywords: [
    'liquid background',
    'blobs',
    'mesh gradient',
    'lava lamp',
    'soft gradient',
    'ambient',
  ],
  layer: 'background',
  fields: [
    { key: 'baseColor', label: 'Base', kind: 'color' },
    { key: 'blobA', label: 'Blob A', kind: 'color' },
    { key: 'blobB', label: 'Blob B', kind: 'color' },
    { key: 'blobC', label: 'Blob C', kind: 'color' },
    {
      key: 'count',
      label: 'Blobs',
      kind: 'number',
      min: 3,
      max: 6,
      step: 1,
    },
  ],
  defaults: {
    baseColor: '#050816',
    blobA: '#6366f1',
    blobB: '#ec4899',
    blobC: '#06b6d4',
    count: 5,
  },
  size: { width: 1280, height: 720 },
  previewTimeMs: 1600,
  previewDurationMs: SURFACE_DURATION_MS,
  build: ({ options, idFactory, canvas }) => {
    const base = optionColor(options, 'baseColor', '#050816');
    const palette = [
      optionColor(options, 'blobA', '#6366f1'),
      optionColor(options, 'blobB', '#ec4899'),
      optionColor(options, 'blobC', '#06b6d4'),
      optionColor(options, 'blobA', '#6366f1'),
      optionColor(options, 'blobB', '#ec4899'),
      optionColor(options, 'blobC', '#06b6d4'),
    ];
    const count = Math.max(
      3,
      Math.min(6, Math.round(optionNumber(options, 'count', 5))),
    );

    const rootId = idFactory('surface-liquid-blobs');
    const vignetteId = `${rootId}-vignette`;
    const blobBlurId = `${rootId}-blur`;

    const bgId = idFactory('blobs-bg');
    const blobGroupId = idFactory('blobs-group');
    const vignetteElementId = idFactory('blobs-vignette');
    const blobIds = Array.from({ length: count }, (_, index) =>
      idFactory(`blob-${index}`),
    );

    const blobs: Record<string, TraceElement> = {};
    blobIds.forEach((blobId, index) => {
      const color = palette[index % palette.length];
      const radius = canvas.width * (0.16 + (index % 3) * 0.07);
      const cx = canvas.width * (0.22 + 0.18 * index);
      const cy = canvas.height * (index % 2 === 0 ? 0.34 : 0.68);
      const ax = canvas.width * 0.08;
      const ay = canvas.height * 0.09;
      const phaseX = (index * Math.PI) / 3;
      const phaseY = (index * Math.PI) / 2;
      const kY = index % 2 === 0 ? 2 : 3;

      const samples = 8;
      const xFrames = Array.from({ length: samples + 1 }, (_, step) => {
        const t = step / samples;
        return {
          timeMs: Math.round(t * SURFACE_DURATION_MS),
          value: Number(
            lissajous(t, 0, 0, ax, 0, phaseX, 0, 1).x.toFixed(2),
          ),
          easing: 'linear',
        };
      });
      const yFrames = Array.from({ length: samples + 1 }, (_, step) => {
        const t = step / samples;
        return {
          timeMs: Math.round(t * SURFACE_DURATION_MS),
          value: Number(lissajous(t, 0, 0, 0, ay, 0, phaseY, kY).y.toFixed(2)),
          easing: 'linear',
        };
      });

      const blob = surfaceCircle(
        blobId,
        `Blob ${index + 1}`,
        cx,
        cy,
        radius,
        {
          fill: `url(#${rootId}-blob-${index})`,
          opacity: 0.85,
        },
        [
          surfaceTrack(`${blobId}-x`, 'x', 'Drift X', xFrames),
          surfaceTrack(`${blobId}-y`, 'y', 'Drift Y', yFrames),
          surfaceTrack(`${blobId}-scale`, 'scaleX', 'Breathe', [
            { timeMs: 0, value: 1, easing: 'ease-in-out' },
            { timeMs: 2200 + index * 90, value: 1.12, easing: 'ease-in-out' },
            { timeMs: SURFACE_DURATION_MS, value: 1, easing: 'ease-in-out' },
          ]),
          surfaceTrack(`${blobId}-scale-y`, 'scaleY', 'Breathe', [
            { timeMs: 0, value: 1, easing: 'ease-in-out' },
            { timeMs: 2600 + index * 70, value: 0.94, easing: 'ease-in-out' },
            { timeMs: SURFACE_DURATION_MS, value: 1, easing: 'ease-in-out' },
          ]),
        ],
      );
      blobs[blobId] = withBasePosition(blob);
    });

    const gradients = Object.fromEntries(
      blobIds.map((blobId, index) => [
        `${rootId}-blob-${index}`,
        radialGradient(`${rootId}-blob-${index}`, [
          { offset: 0, color: palette[index % palette.length], opacity: 0.85 },
          { offset: 0.6, color: palette[index % palette.length], opacity: 0.4 },
          { offset: 1, color: palette[index % palette.length], opacity: 0 },
        ]),
      ]),
    );

    return assembleSurface(
      surfaceGroup(
        rootId,
        'Liquid blobs',
        { x: 0, y: 0, width: canvas.width, height: canvas.height },
        [bgId, blobGroupId, vignetteElementId],
      ),
      {
        [bgId]: surfaceRect(bgId, 'Base', {
          width: canvas.width,
          height: canvas.height,
          fill: base,
        }),
        [blobGroupId]: surfaceGroup(
          blobGroupId,
          'Blobs',
          {
            x: 0,
            y: 0,
            width: canvas.width,
            height: canvas.height,
            filter: `url(#${blobBlurId})`,
          },
          blobIds,
        ),
        ...blobs,
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
          ...gradients,
          [vignetteId]: radialGradient(vignetteId, [
            { offset: 0, color: base, opacity: 0 },
            { offset: 0.6, color: base, opacity: 0.05 },
            { offset: 1, color: base, opacity: 0.75 },
          ]),
        },
        filters: {
          [blobBlurId]: blurFilter(
            blobBlurId,
            Math.max(30, canvas.width * 0.045),
            'Blob diffusion',
          ),
        },
      },
    );
  },
};

/* ── 3. Bokeh field ──────────────────────────────────────────────────────── */

export const bokehFieldSurfaceBlock: TraceBlockDefinition = {
  id: 'surface-bokeh-field',
  title: 'Bokeh field',
  description:
    'Three depth layers of soft light discs with different blur radii, drifting at parallax speeds. Reads as camera defocus, not as circles.',
  category: 'Backgrounds',
  addonId: 'surfaces',
  tags: ['background', 'bokeh', 'depth', 'blur', 'lights', 'advanced'],
  keywords: ['bokeh', 'depth of field', 'defocus', 'light field', 'parallax'],
  layer: 'background',
  fields: [
    { key: 'baseColor', label: 'Base', kind: 'color' },
    { key: 'glowColor', label: 'Glow', kind: 'color' },
    { key: 'accentColor', label: 'Accent', kind: 'color' },
    {
      key: 'density',
      label: 'Density',
      kind: 'number',
      min: 20,
      max: 44,
      step: 4,
    },
  ],
  defaults: {
    baseColor: '#0b1120',
    glowColor: '#38bdf8',
    accentColor: '#f59e0b',
    density: 32,
  },
  size: { width: 1280, height: 720 },
  previewTimeMs: 2000,
  previewDurationMs: SURFACE_DURATION_MS,
  build: ({ options, idFactory, canvas }) => {
    const base = optionColor(options, 'baseColor', '#0b1120');
    const glow = optionColor(options, 'glowColor', '#38bdf8');
    const accent = optionColor(options, 'accentColor', '#f59e0b');
    const density = Math.max(
      20,
      Math.min(44, Math.round(optionNumber(options, 'density', 32))),
    );

    const rootId = idFactory('surface-bokeh-field');
    const skyId = `${rootId}-sky`;
    const nearBlurId = `${rootId}-near`;
    const midBlurId = `${rootId}-mid`;
    const farBlurId = `${rootId}-far`;

    const bgId = idFactory('bokeh-bg');
    const layerIds = [idFactory('bokeh-far'), idFactory('bokeh-mid'), idFactory('bokeh-near')];
    const random = seededRandom(5150 + density);

    const layers: Array<{
      count: number;
      radius: [number, number];
      blur: string;
      opacity: [number, number];
      drift: number;
    }> = [
      {
        count: Math.round(density * 0.45),
        radius: [canvas.width * 0.006, canvas.width * 0.012],
        blur: `url(#${farBlurId})`,
        opacity: [0.25, 0.5],
        drift: 10,
      },
      {
        count: Math.round(density * 0.35),
        radius: [canvas.width * 0.016, canvas.width * 0.03],
        blur: `url(#${midBlurId})`,
        opacity: [0.3, 0.6],
        drift: 18,
      },
      {
        count: Math.round(density * 0.2),
        radius: [canvas.width * 0.04, canvas.width * 0.075],
        blur: `url(#${nearBlurId})`,
        opacity: [0.35, 0.7],
        drift: 30,
      },
    ];

    const children: Record<string, TraceElement> = {
      [bgId]: surfaceRect(bgId, 'Base', {
        width: canvas.width,
        height: canvas.height,
        fill: `url(#${skyId})`,
      }),
    };

    layers.forEach((layer, layerIndex) => {
      const layerId = layerIds[layerIndex];
      const dotIds: string[] = [];
      for (let index = 0; index < layer.count; index += 1) {
        const dotId = idFactory(`bokeh-${layerIndex}-${index}`);
        dotIds.push(dotId);
        const x = 0.03 + random() * 0.94;
        const y = 0.05 + random() * 0.9;
        const radius =
          layer.radius[0] + random() * (layer.radius[1] - layer.radius[0]);
        const color = random() > 0.78 ? accent : glow;
        const initial =
          layer.opacity[0] + random() * (layer.opacity[1] - layer.opacity[0]);
        const phase = Math.round(random() * 2200);
        const dot = surfaceCircle(
          dotId,
          `Bokeh ${layerIndex + 1}.${index + 1}`,
          x * canvas.width,
          y * canvas.height,
          radius,
          { fill: color, opacity: initial },
          [
            surfaceTrack(`${dotId}-x`, 'x', 'Drift', [
              { timeMs: 0, value: 0, easing: 'ease-in-out' },
              {
                timeMs: (1400 + phase) % SURFACE_DURATION_MS,
                value: layer.drift,
                easing: 'ease-in-out',
              },
              { timeMs: SURFACE_DURATION_MS, value: 0, easing: 'ease-in-out' },
            ]),
            surfaceTrack(`${dotId}-opacity`, 'opacity', 'Breathe', [
              { timeMs: 0, value: initial, easing: 'ease-in-out' },
              {
                timeMs: (900 + phase) % SURFACE_DURATION_MS,
                value: Math.min(1, initial + 0.2),
                easing: 'ease-in-out',
              },
              { timeMs: SURFACE_DURATION_MS, value: initial, easing: 'ease-in-out' },
            ]),
          ],
        );
        children[dotId] = withBasePosition(dot);
      }
      children[layerId] = surfaceGroup(
        layerId,
        `Depth ${layerIndex + 1}`,
        {
          x: 0,
          y: 0,
          width: canvas.width,
          height: canvas.height,
          filter: layer.blur,
        },
        dotIds,
      );
    });

    return assembleSurface(
      surfaceGroup(
        rootId,
        'Bokeh field',
        { x: 0, y: 0, width: canvas.width, height: canvas.height },
        [bgId, ...layerIds],
      ),
      children,
      canvas.width,
      canvas.height,
      {
        gradients: {
          [skyId]: linearGradient(skyId, 100, [
            { offset: 0, color: base },
            { offset: 0.6, color: withAlpha(base, 0.85) },
            { offset: 1, color: base },
          ]),
        },
        filters: {
          [farBlurId]: blurFilter(farBlurId, 4, 'Far defocus'),
          [midBlurId]: blurFilter(midBlurId, 10, 'Mid defocus'),
          [nearBlurId]: blurFilter(nearBlurId, 22, 'Near defocus'),
        },
      },
    );
  },
};

/* ── 4. Aurora curtains ──────────────────────────────────────────────────── */

export const auroraCurtainsSurfaceBlock: TraceBlockDefinition = {
  id: 'surface-aurora-curtains',
  title: 'Aurora curtains',
  description:
    'Tall translucent ribbons of light swaying over a star field. Layered gradients and a soft blur give real curtain depth.',
  category: 'Backgrounds',
  addonId: 'surfaces',
  tags: ['background', 'aurora', 'ribbons', 'curtains', 'northern lights', 'advanced'],
  keywords: [
    'aurora',
    'northern lights',
    'curtains',
    'ribbons',
    'borealis',
    'night sky',
  ],
  layer: 'background',
  fields: [
    { key: 'baseColor', label: 'Night', kind: 'color' },
    { key: 'deepColor', label: 'Depth', kind: 'color' },
    { key: 'ribbonA', label: 'Ribbon A', kind: 'color' },
    { key: 'ribbonB', label: 'Ribbon B', kind: 'color' },
    {
      key: 'ribbons',
      label: 'Ribbons',
      kind: 'number',
      min: 3,
      max: 5,
      step: 1,
    },
  ],
  defaults: {
    baseColor: '#071730',
    deepColor: '#020617',
    ribbonA: '#34d399',
    ribbonB: '#818cf8',
    ribbons: 4,
  },
  size: { width: 1280, height: 720 },
  previewTimeMs: 2000,
  previewDurationMs: SURFACE_DURATION_MS,
  build: ({ options, idFactory, canvas }) => {
    const base = optionColor(options, 'baseColor', '#071730');
    const deep = optionColor(options, 'deepColor', '#020617');
    const ribbonColors = [
      optionColor(options, 'ribbonA', '#34d399'),
      optionColor(options, 'ribbonB', '#818cf8'),
    ];
    const ribbonCount = Math.max(
      3,
      Math.min(5, Math.round(optionNumber(options, 'ribbons', 4))),
    );

    const rootId = idFactory('surface-aurora-curtains');
    const skyId = `${rootId}-sky`;
    const ribbonBlurId = `${rootId}-ribbon-blur`;

    const bgId = idFactory('curtains-bg');
    const starsId = idFactory('curtains-stars');
    const ribbonGroupId = idFactory('curtains-ribbons');
    const vignetteElementId = idFactory('curtains-vignette');
    const vignetteId = `${rootId}-vignette`;

    const random = seededRandom(3133 + ribbonCount);
    const starIds = Array.from({ length: 16 }, (_, index) =>
      idFactory(`curtain-star-${index}`),
    );
    const stars: Record<string, TraceElement> = {};
    starIds.forEach((starId, index) => {
      const initial = 0.2 + random() * 0.6;
      stars[starId] = surfaceCircle(
        starId,
        `Star ${index + 1}`,
        (0.02 + random() * 0.96) * canvas.width,
        (0.02 + random() * 0.6) * canvas.height,
        0.7 + random() * 1.5,
        { fill: '#e2e8f0', opacity: initial },
        [
          surfaceTrack(`${starId}-opacity`, 'opacity', 'Twinkle', [
            { timeMs: 0, value: initial, easing: 'ease-in-out' },
            { timeMs: 700 + index * 140, value: 1, easing: 'ease-in-out' },
            { timeMs: 2300 + index * 90, value: initial * 0.55, easing: 'ease-in-out' },
            { timeMs: SURFACE_DURATION_MS, value: initial, easing: 'ease-in-out' },
          ]),
        ],
      );
    });

    const ribbonIds = Array.from({ length: ribbonCount }, (_, index) =>
      idFactory(`curtain-${index}`),
    );
    const ribbons: Record<string, TraceElement> = {};
    ribbonIds.forEach((ribbonId, index) => {
      const color = ribbonColors[index % ribbonColors.length];
      const centerX =
        canvas.width * (0.18 + (0.64 / Math.max(1, ribbonCount - 1)) * index);
      const width = canvas.width * (0.1 + (index % 3) * 0.03);
      const amplitude = canvas.width * 0.05;
      const d = curtainPath(
        centerX,
        canvas.height,
        amplitude,
        width,
        index * 0.85,
      );
      const phase = index * 260;

      ribbons[ribbonId] = surfacePath(
        ribbonId,
        `Curtain ${index + 1}`,
        d,
        { fill: `url(#${rootId}-ribbon-${index})`, opacity: 0.95 },
        [
          surfaceTrack(`${ribbonId}-x`, 'x', 'Sway', [
            { timeMs: 0, value: 0, easing: 'ease-in-out' },
            {
              timeMs: (1500 + phase) % SURFACE_DURATION_MS,
              value: index % 2 === 0 ? 22 : -18,
              easing: 'ease-in-out',
            },
            { timeMs: SURFACE_DURATION_MS, value: 0, easing: 'ease-in-out' },
          ]),
          surfaceTrack(`${ribbonId}-opacity`, 'opacity', 'Shimmer', [
            { timeMs: 0, value: 0.8, easing: 'ease-in-out' },
            { timeMs: 1200 + phase, value: 1, easing: 'ease-in-out' },
            { timeMs: 3000 + phase, value: 0.85, easing: 'ease-in-out' },
            { timeMs: SURFACE_DURATION_MS, value: 0.8, easing: 'ease-in-out' },
          ]),
        ],
        { x: centerX, y: canvas.height / 2 },
      );
    });

    const ribbonGradients = Object.fromEntries(
      ribbonIds.map((ribbonId, index) => [
        `${rootId}-ribbon-${index}`,
        linearGradient(`${rootId}-ribbon-${index}`, 90, [
          { offset: 0, color: ribbonColors[index % ribbonColors.length], opacity: 0.1 },
          { offset: 0.35, color: ribbonColors[index % ribbonColors.length], opacity: 0.7 },
          { offset: 0.7, color: ribbonColors[index % ribbonColors.length], opacity: 0.45 },
          { offset: 1, color: ribbonColors[index % ribbonColors.length], opacity: 0 },
        ]),
      ]),
    );

    return assembleSurface(
      surfaceGroup(
        rootId,
        'Aurora curtains',
        { x: 0, y: 0, width: canvas.width, height: canvas.height },
        [bgId, starsId, ribbonGroupId, vignetteElementId],
      ),
      {
        [bgId]: surfaceRect(bgId, 'Night sky', {
          width: canvas.width,
          height: canvas.height,
          fill: `url(#${skyId})`,
        }),
        [starsId]: surfaceGroup(
          starsId,
          'Stars',
          { x: 0, y: 0, width: canvas.width, height: canvas.height },
          starIds,
        ),
        ...stars,
        [ribbonGroupId]: surfaceGroup(
          ribbonGroupId,
          'Curtains',
          {
            x: 0,
            y: 0,
            width: canvas.width,
            height: canvas.height,
            filter: `url(#${ribbonBlurId})`,
          },
          ribbonIds,
        ),
        ...ribbons,
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
          ...ribbonGradients,
          [skyId]: linearGradient(skyId, 95, [
            { offset: 0, color: deep },
            { offset: 0.5, color: base },
            { offset: 1, color: deep },
          ]),
          [vignetteId]: radialGradient(vignetteId, [
            { offset: 0, color: deep, opacity: 0 },
            { offset: 0.62, color: deep, opacity: 0.1 },
            { offset: 1, color: deep, opacity: 0.85 },
          ]),
        },
        filters: {
          [ribbonBlurId]: blurFilter(
            ribbonBlurId,
            Math.max(8, canvas.width * 0.009),
            'Curtain diffusion',
          ),
        },
      },
    );
  },
};

/* ── 5. Nebula ───────────────────────────────────────────────────────────── */

export const nebulaSurfaceBlock: TraceBlockDefinition = {
  id: 'surface-nebula',
  title: 'Nebula',
  description:
    'Deep-space clouds of blurred gradient light with a bright core, seeded star field and a heavy vignette. Cinematic and very calm.',
  category: 'Backgrounds',
  addonId: 'surfaces',
  tags: ['background', 'nebula', 'space', 'cosmic', 'cinematic', 'advanced'],
  keywords: ['nebula', 'galaxy', 'cosmic', 'deep space', 'interstellar', 'stars'],
  layer: 'background',
  fields: [
    { key: 'baseColor', label: 'Void', kind: 'color' },
    { key: 'cloudA', label: 'Cloud A', kind: 'color' },
    { key: 'cloudB', label: 'Cloud B', kind: 'color' },
    { key: 'coreColor', label: 'Core', kind: 'color' },
    {
      key: 'stars',
      label: 'Stars',
      kind: 'number',
      min: 20,
      max: 60,
      step: 5,
    },
  ],
  defaults: {
    baseColor: '#020617',
    cloudA: '#7c3aed',
    cloudB: '#0ea5e9',
    coreColor: '#f0abfc',
    stars: 40,
  },
  size: { width: 1280, height: 720 },
  previewTimeMs: 2000,
  previewDurationMs: SURFACE_DURATION_MS,
  build: ({ options, idFactory, canvas }) => {
    const base = optionColor(options, 'baseColor', '#020617');
    const cloudA = optionColor(options, 'cloudA', '#7c3aed');
    const cloudB = optionColor(options, 'cloudB', '#0ea5e9');
    const core = optionColor(options, 'coreColor', '#f0abfc');
    const starCount = Math.max(
      20,
      Math.min(60, Math.round(optionNumber(options, 'stars', 40))),
    );

    const rootId = idFactory('surface-nebula');
    const vignetteId = `${rootId}-vignette`;
    const coreGradientId = `${rootId}-core`;
    const cloudBlurId = `${rootId}-cloud-blur`;

    const bgId = idFactory('nebula-bg');
    const cloudGroupId = idFactory('nebula-clouds');
    const coreId = idFactory('nebula-core');
    const starsId = idFactory('nebula-stars');
    const vignetteElementId = idFactory('nebula-vignette');
    const cloudIds = Array.from({ length: 4 }, (_, index) =>
      idFactory(`nebula-cloud-${index}`),
    );

    const cloudCenters: Array<[number, number, number]> = [
      [0.3, 0.4, 0.3],
      [0.72, 0.3, 0.24],
      [0.55, 0.72, 0.34],
      [0.85, 0.75, 0.2],
    ];
    const clouds: Record<string, TraceElement> = {};
    cloudIds.forEach((cloudId, index) => {
      const [cx, cy, radius] = cloudCenters[index];
      const color = index % 2 === 0 ? cloudA : cloudB;
      const drift = index % 2 === 0 ? 26 : -22;
      const cloud = surfaceCircle(
        cloudId,
        `Cloud ${index + 1}`,
        cx * canvas.width,
        cy * canvas.height,
        radius * canvas.width,
        { fill: `url(#${rootId}-cloud-${index})`, opacity: 0.8 },
        [
          surfaceTrack(`${cloudId}-x`, 'x', 'Drift', [
            { timeMs: 0, value: 0, easing: 'ease-in-out' },
            { timeMs: 1700 + index * 200, value: drift, easing: 'ease-in-out' },
            { timeMs: SURFACE_DURATION_MS, value: 0, easing: 'ease-in-out' },
          ]),
          surfaceTrack(`${cloudId}-scale`, 'scaleX', 'Expand', [
            { timeMs: 0, value: 1, easing: 'ease-in-out' },
            { timeMs: 2300 + index * 120, value: 1.1, easing: 'ease-in-out' },
            { timeMs: SURFACE_DURATION_MS, value: 1, easing: 'ease-in-out' },
          ]),
          surfaceTrack(`${cloudId}-scale-y`, 'scaleY', 'Expand', [
            { timeMs: 0, value: 1, easing: 'ease-in-out' },
            { timeMs: 2700 + index * 100, value: 1.06, easing: 'ease-in-out' },
            { timeMs: SURFACE_DURATION_MS, value: 1, easing: 'ease-in-out' },
          ]),
        ],
      );
      clouds[cloudId] = withBasePosition(cloud);
    });

    const random = seededRandom(9021 + starCount);
    const starIds = Array.from({ length: starCount }, (_, index) =>
      idFactory(`nebula-star-${index}`),
    );
    const stars: Record<string, TraceElement> = {};
    starIds.forEach((starId, index) => {
      const initial = 0.2 + random() * 0.7;
      stars[starId] = surfaceCircle(
        starId,
        `Star ${index + 1}`,
        random() * canvas.width,
        random() * canvas.height,
        0.7 + random() * 1.6,
        { fill: '#e2e8f0', opacity: initial },
        [
          surfaceTrack(`${starId}-opacity`, 'opacity', 'Twinkle', [
            { timeMs: 0, value: initial, easing: 'ease-in-out' },
            { timeMs: 600 + Math.round(random() * 2600), value: 1, easing: 'ease-in-out' },
            { timeMs: SURFACE_DURATION_MS, value: initial, easing: 'ease-in-out' },
          ]),
        ],
      );
    });

    const cloudGradients = Object.fromEntries(
      cloudIds.map((cloudId, index) => [
        `${rootId}-cloud-${index}`,
        radialGradient(`${rootId}-cloud-${index}`, [
          {
            offset: 0,
            color: index % 2 === 0 ? cloudA : cloudB,
            opacity: 0.55,
          },
          {
            offset: 0.55,
            color: index % 2 === 0 ? cloudA : cloudB,
            opacity: 0.22,
          },
          {
            offset: 1,
            color: index % 2 === 0 ? cloudA : cloudB,
            opacity: 0,
          },
        ]),
      ]),
    );

    return assembleSurface(
      surfaceGroup(
        rootId,
        'Nebula',
        { x: 0, y: 0, width: canvas.width, height: canvas.height },
        [bgId, cloudGroupId, coreId, starsId, vignetteElementId],
      ),
      {
        [bgId]: surfaceRect(bgId, 'Void', {
          width: canvas.width,
          height: canvas.height,
          fill: base,
        }),
        [cloudGroupId]: surfaceGroup(
          cloudGroupId,
          'Clouds',
          {
            x: 0,
            y: 0,
            width: canvas.width,
            height: canvas.height,
            filter: `url(#${cloudBlurId})`,
          },
          cloudIds,
        ),
        ...clouds,
        [coreId]: surfaceCircle(
          coreId,
          'Core',
          canvas.width * 0.5,
          canvas.height * 0.42,
          canvas.width * 0.09,
          { fill: `url(#${coreGradientId})`, opacity: 0.9 },
          [
            surfaceTrack(`${coreId}-opacity`, 'opacity', 'Burn', [
              { timeMs: 0, value: 0.7, easing: 'ease-in-out' },
              { timeMs: 2000, value: 1, easing: 'ease-in-out' },
              { timeMs: SURFACE_DURATION_MS, value: 0.7, easing: 'ease-in-out' },
            ]),
          ],
        ),
        [starsId]: surfaceGroup(
          starsId,
          'Stars',
          { x: 0, y: 0, width: canvas.width, height: canvas.height },
          starIds,
        ),
        ...stars,
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
          ...cloudGradients,
          [coreGradientId]: radialGradient(coreGradientId, [
            { offset: 0, color: core, opacity: 0.9 },
            { offset: 0.5, color: core, opacity: 0.28 },
            { offset: 1, color: core, opacity: 0 },
          ]),
          [vignetteId]: radialGradient(vignetteId, [
            { offset: 0, color: base, opacity: 0 },
            { offset: 0.55, color: base, opacity: 0.08 },
            { offset: 1, color: base, opacity: 0.9 },
          ]),
        },
        filters: {
          [cloudBlurId]: blurFilter(
            cloudBlurId,
            Math.max(30, canvas.width * 0.04),
            'Cloud diffusion',
          ),
        },
      },
    );
  },
};

/* ── 6. Kaleidoscope ─────────────────────────────────────────────────────── */

export const kaleidoscopeSurfaceBlock: TraceBlockDefinition = {
  id: 'surface-kaleidoscope',
  title: 'Kaleidoscope',
  description:
    'Mirrored wedges in two counter-rotating rings around a glowing core. Hypnotic, geometric and extremely legible behind type.',
  category: 'Backgrounds',
  addonId: 'surfaces',
  tags: ['background', 'kaleidoscope', 'geometric', 'rotation', 'advanced'],
  keywords: [
    'kaleidoscope',
    'mandala',
    'radial',
    'mirror',
    'rotation',
    'geometry',
  ],
  layer: 'background',
  fields: [
    { key: 'baseColor', label: 'Base', kind: 'color' },
    { key: 'wedgeA', label: 'Wedge A', kind: 'color' },
    { key: 'wedgeB', label: 'Wedge B', kind: 'color' },
    {
      key: 'wedges',
      label: 'Wedges',
      kind: 'number',
      min: 8,
      max: 16,
      step: 2,
    },
  ],
  defaults: {
    baseColor: '#0b1120',
    wedgeA: '#f472b6',
    wedgeB: '#38bdf8',
    wedges: 12,
  },
  size: { width: 1280, height: 720 },
  previewTimeMs: 1500,
  previewDurationMs: SURFACE_DURATION_MS,
  build: ({ options, idFactory, canvas }) => {
    const base = optionColor(options, 'baseColor', '#0b1120');
    const wedgeA = optionColor(options, 'wedgeA', '#f472b6');
    const wedgeB = optionColor(options, 'wedgeB', '#38bdf8');
    const wedgeCount = Math.max(
      8,
      Math.min(16, Math.round(optionNumber(options, 'wedges', 12) / 2) * 2),
    );

    const rootId = idFactory('surface-kaleidoscope');
    const coreGradientId = `${rootId}-core`;
    const ringBlurId = `${rootId}-ring-blur`;

    const bgId = idFactory('kaleido-bg');
    const coreId = idFactory('kaleido-core');
    const outerRingId = idFactory('kaleido-outer');
    const innerRingId = idFactory('kaleido-inner');
    const vignetteElementId = idFactory('kaleido-vignette');
    const vignetteId = `${rootId}-vignette`;

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const maxRadius = Math.hypot(centerX, centerY) * 0.92;

    const children: Record<string, TraceElement> = {
      [bgId]: surfaceRect(bgId, 'Base', {
        width: canvas.width,
        height: canvas.height,
        fill: base,
      }),
      [coreId]: surfaceCircle(
        coreId,
        'Core',
        centerX,
        centerY,
        canvas.width * 0.06,
        { fill: `url(#${coreGradientId})`, opacity: 0.9 },
        [
          surfaceTrack(`${coreId}-opacity`, 'opacity', 'Burn', [
            { timeMs: 0, value: 0.75, easing: 'ease-in-out' },
            { timeMs: 2000, value: 1, easing: 'ease-in-out' },
            { timeMs: SURFACE_DURATION_MS, value: 0.75, easing: 'ease-in-out' },
          ]),
        ],
      ),
      [vignetteElementId]: surfaceRect(vignetteElementId, 'Vignette', {
        width: canvas.width,
        height: canvas.height,
        fill: `url(#${vignetteId})`,
      }),
    };

    const buildRing = (
      ringId: string,
      radiusFactor: number,
      colorA: string,
      colorB: string,
      direction: 1 | -1,
      label: string,
    ) => {
      const wedgeIds: string[] = [];
      for (let index = 0; index < wedgeCount; index += 1) {
        const wedgeId = idFactory(`kaleido-${label}-${index}`);
        wedgeIds.push(wedgeId);
        const a0 = (Math.PI * 2 * index) / wedgeCount;
        const a1 = (Math.PI * 2 * (index + 0.6)) / wedgeCount;
        children[wedgeId] = surfacePath(
          wedgeId,
          `${label} wedge ${index + 1}`,
          trianglePath(centerX, centerY, maxRadius * radiusFactor, a0, a1),
          {
            fill: index % 2 === 0 ? colorA : colorB,
            opacity: 0.16,
          },
        );
      }
      children[ringId] = surfaceGroup(
        ringId,
        label === 'outer' ? 'Outer ring' : 'Inner ring',
        { x: 0, y: 0, width: canvas.width, height: canvas.height },
        wedgeIds,
        [
          surfaceTrack(`${ringId}-rotation`, 'rotation', 'Spin', [
            { timeMs: 0, value: 0, easing: 'linear' },
            {
              timeMs: SURFACE_DURATION_MS,
              value: 360 * direction,
              easing: 'linear',
            },
          ]),
        ],
        { x: centerX, y: centerY },
      );
    };

    buildRing(outerRingId, 1, wedgeA, wedgeB, 1, 'outer');
    buildRing(innerRingId, 0.62, wedgeB, wedgeA, -1, 'inner');
    children[outerRingId].attributes.filter = `url(#${ringBlurId})`;

    return assembleSurface(
      surfaceGroup(
        rootId,
        'Kaleidoscope',
        { x: 0, y: 0, width: canvas.width, height: canvas.height },
        [bgId, outerRingId, innerRingId, coreId, vignetteElementId],
      ),
      children,
      canvas.width,
      canvas.height,
      {
        gradients: {
          [coreGradientId]: radialGradient(coreGradientId, [
            { offset: 0, color: '#ffffff', opacity: 0.85 },
            { offset: 0.5, color: wedgeA, opacity: 0.3 },
            { offset: 1, color: wedgeA, opacity: 0 },
          ]),
          [vignetteId]: radialGradient(vignetteId, [
            { offset: 0, color: base, opacity: 0 },
            { offset: 0.6, color: base, opacity: 0.06 },
            { offset: 1, color: base, opacity: 0.88 },
          ]),
        },
        filters: {
          [ringBlurId]: blurFilter(ringBlurId, 6, 'Wedge bloom'),
        },
      },
    );
  },
};

/* ── 7. Dot wave ─────────────────────────────────────────────────────────── */

export const dotWaveSurfaceBlock: TraceBlockDefinition = {
  id: 'surface-dot-wave',
  title: 'Travelling dot wave',
  description:
    'A matrix of dots riding a sine wave that travels exactly one wavelength per loop. Ocean rhythm from pure circles, no images.',
  category: 'Backgrounds',
  addonId: 'surfaces',
  tags: ['background', 'dots', 'wave', 'rhythm', 'pattern', 'advanced'],
  keywords: ['dot wave', 'sine wave', 'ripple', 'ocean', 'points', 'pattern'],
  layer: 'background',
  fields: [
    { key: 'baseColor', label: 'Base', kind: 'color' },
    { key: 'dotColor', label: 'Dots', kind: 'color' },
    { key: 'accentColor', label: 'Crest', kind: 'color' },
    {
      key: 'amplitude',
      label: 'Amplitude',
      kind: 'number',
      min: 6,
      max: 40,
      step: 2,
      suffix: 'px',
    },
  ],
  defaults: {
    baseColor: '#0a192f',
    dotColor: '#64ffda',
    accentColor: '#38bdf8',
    amplitude: 28,
  },
  size: { width: 1280, height: 720 },
  previewTimeMs: 1400,
  previewDurationMs: SURFACE_DURATION_MS,
  build: ({ options, idFactory, canvas }) => {
    const base = optionColor(options, 'baseColor', '#0a192f');
    const dot = optionColor(options, 'dotColor', '#64ffda');
    const accent = optionColor(options, 'accentColor', '#38bdf8');
    const amplitude = Math.max(
      6,
      Math.min(40, optionNumber(options, 'amplitude', 28)),
    );

    const rootId = idFactory('surface-dot-wave');
    const skyId = `${rootId}-sky`;

    const bgId = idFactory('dotwave-bg');
    const matrixId = idFactory('dotwave-matrix');
    const vignetteElementId = idFactory('dotwave-vignette');
    const vignetteId = `${rootId}-vignette`;

    const columns = 16;
    const rows = 6;
    const marginX = canvas.width * 0.06;
    const spacingX = (canvas.width - marginX * 2) / (columns - 1);
    const spacingY = (canvas.height * 0.5) / (rows - 1);
    const baseY = canvas.height * 0.32;
    const wavelength = 6; // dots per full wave

    const children: Record<string, TraceElement> = {
      [bgId]: surfaceRect(bgId, 'Base', {
        width: canvas.width,
        height: canvas.height,
        fill: `url(#${skyId})`,
      }),
      [vignetteElementId]: surfaceRect(vignetteElementId, 'Vignette', {
        width: canvas.width,
        height: canvas.height,
        fill: `url(#${vignetteId})`,
      }),
    };

    const dotIds: string[] = [];
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const dotId = idFactory(`dotwave-${row}-${column}`);
        dotIds.push(dotId);
        const x = marginX + column * spacingX;
        const y = baseY + row * spacingY;
        const radius = 2.2 + row * 0.7;
        const phase =
          (Math.PI * 2 * column) / wavelength + row * 0.55;
        // Four samples of a full sine period: t=0 and t=T match by construction.
        const keyframes = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
          timeMs: Math.round(t * SURFACE_DURATION_MS),
          value: Number((amplitude * Math.sin(phase - Math.PI * 2 * t)).toFixed(2)),
          easing: 'linear' as const,
        }));
        const isCrest = column % wavelength === 0;
        children[dotId] = surfaceCircle(
          dotId,
          `Dot ${row + 1}.${column + 1}`,
          x,
          y,
          radius,
          {
            fill: isCrest && row < 2 ? accent : dot,
            opacity: 0.35 + row * 0.1,
          },
          [surfaceTrack(`${dotId}-y`, 'y', 'Wave', keyframes)],
        );
        withBasePosition(children[dotId]);
      }
    }
    children[matrixId] = surfaceGroup(
      matrixId,
      'Dots',
      { x: 0, y: 0, width: canvas.width, height: canvas.height },
      dotIds,
      [
        surfaceTrack(`${matrixId}-opacity`, 'opacity', 'Breathe', [
          { timeMs: 0, value: 0.85, easing: 'ease-in-out' },
          { timeMs: 2000, value: 1, easing: 'ease-in-out' },
          { timeMs: SURFACE_DURATION_MS, value: 0.85, easing: 'ease-in-out' },
        ]),
      ],
    );

    return assembleSurface(
      surfaceGroup(
        rootId,
        'Travelling dot wave',
        { x: 0, y: 0, width: canvas.width, height: canvas.height },
        [bgId, matrixId, vignetteElementId],
      ),
      children,
      canvas.width,
      canvas.height,
      {
        gradients: {
          [skyId]: linearGradient(skyId, 90, [
            { offset: 0, color: base },
            { offset: 0.6, color: withAlpha(base, 0.9) },
            { offset: 1, color: base },
          ]),
          [vignetteId]: radialGradient(vignetteId, [
            { offset: 0, color: base, opacity: 0 },
            { offset: 0.6, color: base, opacity: 0.08 },
            { offset: 1, color: base, opacity: 0.8 },
          ]),
        },
      },
    );
  },
};

/* ── 8. Skyline parallax ─────────────────────────────────────────────────── */

export const skylineParallaxSurfaceBlock: TraceBlockDefinition = {
  id: 'surface-skyline-parallax',
  title: 'Skyline parallax',
  description:
    'Three seeded building layers drifting at parallax speeds under a moon and slow clouds. Instant depth for stories and explainers.',
  category: 'Backgrounds',
  addonId: 'surfaces',
  tags: ['background', 'skyline', 'city', 'parallax', 'night', 'advanced'],
  keywords: [
    'skyline',
    'city',
    'buildings',
    'parallax',
    'night city',
    'urban',
    'moon',
  ],
  layer: 'background',
  fields: [
    { key: 'baseColor', label: 'Sky', kind: 'color' },
    { key: 'deepColor', label: 'Depth', kind: 'color' },
    { key: 'moonColor', label: 'Moon', kind: 'color' },
    { key: 'windowColor', label: 'Windows', kind: 'color' },
  ],
  defaults: {
    baseColor: '#131c3b',
    deepColor: '#05070f',
    moonColor: '#fef3c7',
    windowColor: '#fbbf24',
  },
  size: { width: 1280, height: 720 },
  previewTimeMs: 2000,
  previewDurationMs: SURFACE_DURATION_MS,
  build: ({ options, idFactory, canvas }) => {
    const base = optionColor(options, 'baseColor', '#131c3b');
    const deep = optionColor(options, 'deepColor', '#05070f');
    const moon = optionColor(options, 'moonColor', '#fef3c7');
    const windowColor = optionColor(options, 'windowColor', '#fbbf24');

    const rootId = idFactory('surface-skyline-parallax');
    const skyId = `${rootId}-sky`;
    const moonGradientId = `${rootId}-moon`;
    const cloudBlurId = `${rootId}-cloud-blur`;

    const bgId = idFactory('skyline-bg');
    const starsId = idFactory('skyline-stars');
    const moonId = idFactory('skyline-moon');
    const cloudsId = idFactory('skyline-clouds');
    const farId = idFactory('skyline-far');
    const midId = idFactory('skyline-mid');
    const nearId = idFactory('skyline-near');
    const vignetteElementId = idFactory('skyline-vignette');
    const vignetteId = `${rootId}-vignette`;

    const random = seededRandom(6013);

    const children: Record<string, TraceElement> = {
      [bgId]: surfaceRect(bgId, 'Sky', {
        width: canvas.width,
        height: canvas.height,
        fill: `url(#${skyId})`,
      }),
      [moonId]: surfaceCircle(
        moonId,
        'Moon',
        canvas.width * 0.78,
        canvas.height * 0.2,
        canvas.width * 0.05,
        { fill: `url(#${moonGradientId})`, opacity: 0.95 },
        [
          surfaceTrack(`${moonId}-opacity`, 'opacity', 'Glow', [
            { timeMs: 0, value: 0.8, easing: 'ease-in-out' },
            { timeMs: 2100, value: 1, easing: 'ease-in-out' },
            { timeMs: SURFACE_DURATION_MS, value: 0.8, easing: 'ease-in-out' },
          ]),
        ],
      ),
      [vignetteElementId]: surfaceRect(vignetteElementId, 'Vignette', {
        width: canvas.width,
        height: canvas.height,
        fill: `url(#${vignetteId})`,
      }),
    };

    // Stars
    const starIds: string[] = [];
    for (let index = 0; index < 12; index += 1) {
      const starId = idFactory(`skyline-star-${index}`);
      starIds.push(starId);
      const initial = 0.2 + random() * 0.5;
      children[starId] = surfaceCircle(
        starId,
        `Star ${index + 1}`,
        random() * canvas.width,
        random() * canvas.height * 0.45,
        0.8 + random() * 1.3,
        { fill: '#e2e8f0', opacity: initial },
        [
          surfaceTrack(`${starId}-opacity`, 'opacity', 'Twinkle', [
            { timeMs: 0, value: initial, easing: 'ease-in-out' },
            { timeMs: 800 + index * 180, value: 1, easing: 'ease-in-out' },
            { timeMs: SURFACE_DURATION_MS, value: initial, easing: 'ease-in-out' },
          ]),
        ],
      );
    }
    children[starsId] = surfaceGroup(
      starsId,
      'Stars',
      { x: 0, y: 0, width: canvas.width, height: canvas.height * 0.5 },
      starIds,
    );

    // Clouds: three overlapping puffs per cloud so the silhouette reads soft
    // instead of as a single blurred disc.
    const cloudIds = [0, 1, 2].map((index) => idFactory(`skyline-cloud-${index}`));
    const puffOffsets = [-1, 0, 1];
    cloudIds.forEach((cloudId, index) => {
      const cx = (0.2 + index * 0.3) * canvas.width;
      const cy = (0.16 + index * 0.08) * canvas.height;
      const baseRadius = canvas.width * (0.05 + index * 0.012);
      const puffIds = puffOffsets.map((puff) =>
        idFactory(`skyline-cloud-${index}-puff-${puff + 1}`),
      );
      puffIds.forEach((puffId, puffIndex) => {
        const radius = baseRadius * (puffIndex === 1 ? 1 : 0.72);
        const x = cx + puffOffsets[puffIndex] * baseRadius * 0.85;
        const y = cy + (puffIndex === 1 ? 0 : baseRadius * 0.2);
        children[puffId] = surfaceCircle(
          puffId,
          `Cloud ${index + 1} puff ${puffIndex + 1}`,
          x,
          y,
          radius,
          { fill: withAlpha('#cbd5f5', 0.09), opacity: 0.9 },
        );
      });
      children[cloudId] = surfaceGroup(
        cloudId,
        `Cloud ${index + 1}`,
        { x: 0, y: 0, width: canvas.width, height: canvas.height },
        puffIds,
        [
          surfaceTrack(`${cloudId}-x`, 'x', 'Drift', [
            { timeMs: 0, value: 0, easing: 'ease-in-out' },
            {
              timeMs: 1800 + index * 300,
              value: index % 2 === 0 ? 30 : -26,
              easing: 'ease-in-out',
            },
            { timeMs: SURFACE_DURATION_MS, value: 0, easing: 'ease-in-out' },
          ]),
        ],
      );
    });
    children[cloudsId] = surfaceGroup(
      cloudsId,
      'Clouds',
      {
        x: 0,
        y: 0,
        width: canvas.width,
        height: canvas.height,
        filter: `url(#${cloudBlurId})`,
      },
      cloudIds,
    );

    // Building layers with parallax drift.
    const layers: Array<{
      layerId: string;
      label: string;
      color: string;
      opacity: number;
      heightRange: [number, number];
      drift: number;
      withWindows: boolean;
    }> = [
      {
        layerId: farId,
        label: 'Far skyline',
        color: withAlpha(base, 0.55),
        opacity: 1,
        heightRange: [0.18, 0.34],
        drift: 8,
        withWindows: false,
      },
      {
        layerId: midId,
        label: 'Mid skyline',
        color: withAlpha(deep, 0.85),
        opacity: 1,
        heightRange: [0.26, 0.46],
        drift: 16,
        withWindows: false,
      },
      {
        layerId: nearId,
        label: 'Near skyline',
        color: deep,
        opacity: 1,
        heightRange: [0.36, 0.6],
        drift: 28,
        withWindows: true,
      },
    ];

    layers.forEach((layer) => {
      const buildingIds: string[] = [];
      let cursor = -canvas.width * 0.05;
      let index = 0;
      while (cursor < canvas.width * 1.02) {
        const width = canvas.width * (0.035 + random() * 0.05);
        const height = canvas.height * (layer.heightRange[0] + random() * (layer.heightRange[1] - layer.heightRange[0]));
        const buildingId = idFactory(`skyline-${layer.label.split(' ')[0].toLowerCase()}-${index}`);
        buildingIds.push(buildingId);
        children[buildingId] = surfaceRect(
          buildingId,
          `${layer.label} ${index + 1}`,
          {
            x: cursor,
            y: canvas.height - height,
            width,
            height,
            fill: layer.color,
          },
          [],
          { x: 0, y: 0 },
        );
        if (layer.withWindows && random() > 0.35) {
          const windowId = idFactory(`skyline-window-${index}`);
          buildingIds.push(windowId);
          children[windowId] = surfaceRect(
            windowId,
            `Window ${index + 1}`,
            {
              x: cursor + width * 0.25,
              y: canvas.height - height + height * (0.15 + random() * 0.4),
              width: Math.max(2, width * 0.18),
              height: Math.max(3, height * 0.18),
              fill: windowColor,
              opacity: 0.75,
            },
            [
              surfaceTrack(`${windowId}-opacity`, 'opacity', 'Flicker', [
                { timeMs: 0, value: 0.55, easing: 'ease-in-out' },
                { timeMs: 1400 + index * 220, value: 0.95, easing: 'ease-in-out' },
                { timeMs: SURFACE_DURATION_MS, value: 0.55, easing: 'ease-in-out' },
              ]),
            ],
            { x: 0, y: 0 },
          );
        }
        cursor += width + canvas.width * 0.012;
        index += 1;
      }
      children[layer.layerId] = surfaceGroup(
        layer.layerId,
        layer.label,
        { x: 0, y: 0, width: canvas.width, height: canvas.height },
        buildingIds,
        [
          surfaceTrack(`${layer.layerId}-x`, 'x', 'Parallax', [
            { timeMs: 0, value: 0, easing: 'ease-in-out' },
            { timeMs: 2000, value: layer.drift, easing: 'ease-in-out' },
            { timeMs: SURFACE_DURATION_MS, value: 0, easing: 'ease-in-out' },
          ]),
        ],
      );
    });

    return assembleSurface(
      surfaceGroup(
        rootId,
        'Skyline parallax',
        { x: 0, y: 0, width: canvas.width, height: canvas.height },
        [bgId, starsId, moonId, cloudsId, farId, midId, nearId, vignetteElementId],
      ),
      children,
      canvas.width,
      canvas.height,
      {
        gradients: {
          [skyId]: linearGradient(skyId, 90, [
            { offset: 0, color: deep },
            { offset: 0.45, color: base },
            { offset: 0.75, color: withAlpha(base, 0.9) },
            { offset: 1, color: deep },
          ]),
          [moonGradientId]: radialGradient(moonGradientId, [
            { offset: 0, color: moon, opacity: 1 },
            { offset: 0.55, color: moon, opacity: 0.35 },
            { offset: 1, color: moon, opacity: 0 },
          ]),
          [vignetteId]: radialGradient(vignetteId, [
            { offset: 0, color: deep, opacity: 0 },
            { offset: 0.62, color: deep, opacity: 0.12 },
            { offset: 1, color: deep, opacity: 0.85 },
          ]),
        },
        filters: {
          [cloudBlurId]: blurFilter(cloudBlurId, 18, 'Cloud softness'),
        },
      },
    );
  },
};