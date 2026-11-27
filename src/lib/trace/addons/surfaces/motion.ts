/**
 * lib/trace/addons/surfaces/motion.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Motion-led surfaces: wave stacks, orbital systems, terrain ridges and speed
 * lines. Every motion is an ordinary editable track on an ordinary layer.
 */

import type { TraceElement } from '../../types';
import {
  optionColor,
  optionNumber,
  optionText,
  withAlpha,
} from '../../blocks/helpers';
import type { TraceBlockDefinition } from '../../blocks/types';
import {
  SURFACE_DURATION_MS,
  assembleSurface,
  blurFilter,
  linearGradient,
  radialGradient,
  ridgePath,
  seededRandom,
  surfaceCircle,
  surfaceGroup,
  surfacePath,
  surfaceRect,
  surfaceTrack,
  wavePath,
} from './helpers';

export const wavesSurfaceBlock: TraceBlockDefinition = {
  id: 'surface-waves',
  title: 'Wave stack',
  description:
    'Layered liquid ridges that rise and drift at different speeds. Calm, premium and easy to recolour from a single accent.',
  category: 'Backgrounds',
  addonId: 'surfaces',
  tags: ['background', 'waves', 'liquid', 'gradient', 'layers', 'calm'],
  keywords: ['waves', 'liquid background', 'layered waves', 'fluid', 'ocean'],
  layer: 'background',
  fields: [
    { key: 'baseColor', label: 'Sky', kind: 'color' },
    { key: 'deepColor', label: 'Depth', kind: 'color' },
    { key: 'waveColor', label: 'Waves', kind: 'color' },
    { key: 'accentColor', label: 'Accent', kind: 'color' },
    {
      key: 'layers',
      label: 'Layers',
      kind: 'number',
      min: 3,
      max: 6,
      step: 1,
    },
    {
      key: 'amplitude',
      label: 'Amplitude',
      kind: 'number',
      min: 20,
      max: 120,
      step: 5,
      suffix: 'px',
    },
  ],
  defaults: {
    baseColor: '#0f2a4a',
    deepColor: '#020617',
    waveColor: '#38bdf8',
    accentColor: '#22d3ee',
    layers: 4,
    amplitude: 64,
  },
  size: { width: 1280, height: 720 },
  previewTimeMs: 2000,
  previewDurationMs: SURFACE_DURATION_MS,
  build: ({ options, idFactory, canvas }) => {
    const base = optionColor(options, 'baseColor', '#0f2a4a');
    const deep = optionColor(options, 'deepColor', '#020617');
    const wave = optionColor(options, 'waveColor', '#38bdf8');
    const accent = optionColor(options, 'accentColor', '#22d3ee');
    const layers = Math.max(
      3,
      Math.min(6, Math.round(optionNumber(options, 'layers', 4))),
    );
    const amplitude = Math.max(
      20,
      Math.min(120, optionNumber(options, 'amplitude', 64)),
    );

    const rootId = idFactory('surface-waves');
    const skyId = `${rootId}-sky`;
    const sunId = `${rootId}-sun`;
    const glowId = `${rootId}-glow`;
    const waveGradientId = `${rootId}-wave`;

    const bgId = idFactory('waves-bg');
    const sunElementId = idFactory('waves-sun');
    const waveIds = Array.from({ length: layers }, (_, index) =>
      idFactory(`waves-layer-${index}`),
    );
    const waves: Record<string, TraceElement> = {};
    const stageWidth = canvas.width * 1.2;
    const stageX = -canvas.width * 0.1;

    waveIds.forEach((id, index) => {
      const baseline =
        canvas.height * (0.46 + index * (0.12 / Math.max(1, layers - 1)));
      const layerAmplitude = amplitude * (1 - index * 0.14);
      const d = `${wavePath(stageWidth, baseline, layerAmplitude, 4)} L ${stageWidth} ${
        canvas.height
      } L 0 ${canvas.height} Z`;
      const direction = index % 2 === 0 ? 1 : -1;

      waves[id] = surfacePath(
        id,
        `Wave ${index + 1}`,
        d,
        {
          // A vertical fade to transparent keeps stacked layers from
          // accumulating into a flat block of colour.
          fill: `url(#${waveGradientId})`,
        },
        [
          surfaceTrack(`${id}-x`, 'x', 'Drift', [
            { timeMs: 0, value: 0, easing: 'ease-in-out' },
            {
              timeMs: 1400 + index * 120,
              value: 22 * direction,
              easing: 'ease-in-out',
            },
            {
              timeMs: 2800 + index * 120,
              value: -16 * direction,
              easing: 'ease-in-out',
            },
            { timeMs: SURFACE_DURATION_MS, value: 0, easing: 'ease-in-out' },
          ]),
          surfaceTrack(`${id}-y`, 'y', 'Rise', [
            { timeMs: 0, value: 0, easing: 'ease-in-out' },
            {
              timeMs: 1600 + index * 100,
              value: -10 - index * 2,
              easing: 'ease-in-out',
            },
            {
              timeMs: 3000 + index * 80,
              value: 6,
              easing: 'ease-in-out',
            },
            { timeMs: SURFACE_DURATION_MS, value: 0, easing: 'ease-in-out' },
          ]),
          surfaceTrack(`${id}-opacity`, 'opacity', 'Shimmer', [
            { timeMs: 0, value: 0.78 + index * 0.04, easing: 'ease-in-out' },
            { timeMs: 1800 + index * 90, value: 1, easing: 'ease-in-out' },
            {
              timeMs: SURFACE_DURATION_MS,
              value: 0.78 + index * 0.04,
              easing: 'ease-in-out',
            },
          ]),
        ],
        { x: stageWidth / 2, y: canvas.height * 0.75 },
      );
    });

    return assembleSurface(
      surfaceGroup(
        rootId,
        'Wave stack',
        { x: 0, y: 0, width: canvas.width, height: canvas.height },
        [bgId, sunElementId, ...waveIds],
      ),
      {
        [bgId]: surfaceRect(bgId, 'Sky', {
          width: canvas.width,
          height: canvas.height,
          fill: `url(#${skyId})`,
        }),
        [sunElementId]: surfaceCircle(
          sunElementId,
          'Sun',
          canvas.width * 0.74,
          canvas.height * 0.28,
          canvas.width * 0.2,
          {
            fill: `url(#${glowId})`,
            opacity: 0.8,
            filter: `url(#${sunId})`,
          },
          [
            surfaceTrack(`${sunElementId}-opacity`, 'opacity', 'Sun breathe', [
              { timeMs: 0, value: 0.65, easing: 'ease-in-out' },
              { timeMs: 2000, value: 0.9, easing: 'ease-in-out' },
              { timeMs: SURFACE_DURATION_MS, value: 0.65, easing: 'ease-in-out' },
            ]),
          ],
        ),
        ...waves,
      },
      canvas.width,
      canvas.height,
      {
        gradients: {
          [skyId]: linearGradient(skyId, 90, [
            { offset: 0, color: deep },
            { offset: 0.5, color: base },
            { offset: 1, color: withAlpha(deep, 1) },
          ]),
          [waveGradientId]: linearGradient(waveGradientId, 90, [
            { offset: 0, color: wave, opacity: 0.34 },
            { offset: 0.45, color: wave, opacity: 0.18 },
            { offset: 1, color: wave, opacity: 0.04 },
          ]),
          [glowId]: radialGradient(glowId, [
            { offset: 0, color: accent, opacity: 0.72 },
            { offset: 0.55, color: accent, opacity: 0.2 },
            { offset: 1, color: accent, opacity: 0 },
          ]),
        },
        filters: {
          [sunId]: blurFilter(sunId, 30, 'Sun blur'),
        },
      },
    );
  },
};

export const orbitSurfaceBlock: TraceBlockDefinition = {
  id: 'surface-orbit',
  title: 'Orbital system',
  description:
    'Concentric rings with orbiting markers, split across counter-rotating groups. A precise, engineered backdrop for product and data stories.',
  category: 'Backgrounds',
  addonId: 'surfaces',
  tags: ['background', 'orbit', 'rings', 'space', 'rotation', 'system'],
  keywords: [
    'orbits',
    'orbital',
    'rings',
    'solar system',
    'radial',
    'engineering',
  ],
  layer: 'background',
  fields: [
    { key: 'baseColor', label: 'Base', kind: 'color' },
    { key: 'deepColor', label: 'Depth', kind: 'color' },
    { key: 'orbitColor', label: 'Rings', kind: 'color' },
    { key: 'dotColor', label: 'Markers', kind: 'color' },
    {
      key: 'rings',
      label: 'Rings',
      kind: 'number',
      min: 3,
      max: 7,
      step: 1,
    },
  ],
  defaults: {
    baseColor: '#0b1120',
    deepColor: '#020617',
    orbitColor: '#334155',
    dotColor: '#38bdf8',
    rings: 5,
  },
  size: { width: 1280, height: 720 },
  previewTimeMs: 1500,
  previewDurationMs: SURFACE_DURATION_MS,
  build: ({ options, idFactory, canvas }) => {
    const base = optionColor(options, 'baseColor', '#0b1120');
    const deep = optionColor(options, 'deepColor', '#020617');
    const orbit = optionColor(options, 'orbitColor', '#334155');
    const dot = optionColor(options, 'dotColor', '#38bdf8');
    const rings = Math.max(
      3,
      Math.min(7, Math.round(optionNumber(options, 'rings', 5))),
    );

    const rootId = idFactory('surface-orbit');
    const skyId = `${rootId}-sky`;
    const glowId = `${rootId}-glow`;
    const bgId = idFactory('orbit-bg');
    const coreGlowId = idFactory('orbit-glow');
    const coreId = idFactory('orbit-core');
    const outerId = idFactory('orbit-outer');
    const innerId = idFactory('orbit-inner');

    const centerX = canvas.width * 0.5;
    const centerY = canvas.height * 0.5;
    const maxRadius = Math.min(canvas.width, canvas.height) * 0.44;
    const random = seededRandom(4409 + rings);

    const ringIds: string[] = [];
    const dotIds: string[] = [];
    const elements: Record<string, TraceElement> = {};

    for (let index = 0; index < rings; index += 1) {
      const radius = maxRadius * (0.32 + (index / rings) * 0.68);
      const ringId = idFactory(`orbit-ring-${index}`);
      ringIds.push(ringId);
      elements[ringId] = surfaceCircle(
        ringId,
        `Ring ${index + 1}`,
        centerX,
        centerY,
        radius,
        {
          fill: 'none',
          stroke: orbit,
          strokeWidth: 1.4 + (index % 2) * 0.8,
          opacity: 0.55 + index * 0.06,
          ...(index % 2 === 0 ? { strokeDasharray: '2 8' } : {}),
        },
      );

      for (let markerIndex = 0; markerIndex < 2; markerIndex += 1) {
        const markerId = idFactory(`orbit-marker-${index}-${markerIndex}`);
        dotIds.push(markerId);
        const angle =
          (Math.PI * 2 * index) / rings -
          Math.PI / 2 +
          markerIndex * Math.PI * 0.9;
        elements[markerId] = surfaceCircle(
          markerId,
          `Marker ${index + 1}.${markerIndex + 1}`,
          centerX + Math.cos(angle) * radius,
          centerY + Math.sin(angle) * radius,
          markerIndex === 0 && index % 3 === 0 ? 4.5 : 2.6,
          {
            fill: markerIndex === 0 ? dot : withAlpha(dot, 0.65),
            opacity: markerIndex === 0 ? 0.95 : 0.6,
            ...(markerIndex === 0 && index % 3 === 0
              ? { filter: `url(#${coreGlowId})` }
              : {}),
          },
        );
      }
    }

    const ambientIds = Array.from({ length: 8 }, (_, index) =>
      idFactory(`orbit-ambient-${index}`),
    );
    ambientIds.forEach((id, index) => {
      const angle = random() * Math.PI * 2;
      const radius = maxRadius * (0.2 + random() * 0.85);
      elements[id] = surfaceCircle(
        id,
        `Ambient ${index + 1}`,
        centerX + Math.cos(angle) * radius,
        centerY + Math.sin(angle) * radius,
        1 + random() * 1.4,
        {
          fill: dot,
          opacity: 0.16 + random() * 0.22,
        },
      );
      dotIds.push(id);
    });

    const accentArcId = idFactory('orbit-accent');
    const arcRadius = maxRadius * 0.74;
    const startAngle = -0.55;
    const endAngle = 0.62;
    const arcStartX = centerX + Math.cos(startAngle) * arcRadius;
    const arcStartY = centerY + Math.sin(startAngle) * arcRadius;
    const arcEndX = centerX + Math.cos(endAngle) * arcRadius;
    const arcEndY = centerY + Math.sin(endAngle) * arcRadius;
    elements[accentArcId] = surfacePath(
      accentArcId,
      'Accent arc',
      `M ${arcStartX} ${arcStartY} A ${arcRadius} ${arcRadius} 0 0 1 ${arcEndX} ${arcEndY}`,
      {
        fill: 'none',
        stroke: dot,
        strokeWidth: 2.4,
        strokeLinecap: 'round',
        opacity: 0.8,
      },
      [],
      { x: centerX, y: centerY },
    );
    ringIds.push(accentArcId);

    // The ring group rotates as one unit around the canvas centre.
    return assembleSurface(
      surfaceGroup(
        rootId,
        'Orbital system',
        { x: 0, y: 0, width: canvas.width, height: canvas.height },
        [bgId, coreId, outerId, innerId],
      ),
      {
        [bgId]: surfaceRect(bgId, 'Sky', {
          width: canvas.width,
          height: canvas.height,
          fill: `url(#${skyId})`,
        }),
        [coreId]: surfaceCircle(
          coreId,
          'Core',
          centerX,
          centerY,
          maxRadius * 0.2,
          { fill: `url(#${glowId})`, opacity: 0.9 },
        ),
        [outerId]: surfaceGroup(
          outerId,
          'Rings',
          { x: 0, y: 0, width: canvas.width, height: canvas.height },
          ringIds,
          [
            surfaceTrack(`${outerId}-rotation`, 'rotation', 'Orbit', [
              { timeMs: 0, value: 0, easing: 'linear' },
              { timeMs: SURFACE_DURATION_MS, value: 360, easing: 'linear' },
            ]),
          ],
          { x: centerX, y: centerY },
        ),
        [innerId]: surfaceGroup(
          innerId,
          'Markers',
          { x: 0, y: 0, width: canvas.width, height: canvas.height },
          dotIds,
          [
            surfaceTrack(`${innerId}-rotation`, 'rotation', 'Counter orbit', [
              { timeMs: 0, value: 0, easing: 'linear' },
              { timeMs: SURFACE_DURATION_MS, value: -360, easing: 'linear' },
            ]),
          ],
          { x: centerX, y: centerY },
        ),
        ...elements,
      },
      canvas.width,
      canvas.height,
      {
        gradients: {
          [skyId]: radialGradient(skyId, [
            { offset: 0, color: base },
            { offset: 0.55, color: deep },
            { offset: 1, color: deep },
          ]),
          [glowId]: radialGradient(glowId, [
            { offset: 0, color: dot, opacity: 0.9 },
            { offset: 0.5, color: dot, opacity: 0.25 },
            { offset: 1, color: dot, opacity: 0 },
          ]),
        },
        filters: {
          [coreGlowId]: blurFilter(coreGlowId, 8, 'Marker glow'),
        },
      },
    );
  },
};

export const terrainSurfaceBlock: TraceBlockDefinition = {
  id: 'surface-terrain',
  title: 'Terrain ridges',
  description:
    'Layered topographic ridges with a glowing sun and slow alternating drift. Landscape depth from pure paths — no images.',
  category: 'Backgrounds',
  addonId: 'surfaces',
  tags: ['background', 'terrain', 'mountains', 'landscape', 'ridges', 'sun'],
  keywords: [
    'terrain',
    'mountains',
    'landscape',
    'ridges',
    'topographic',
    'sunset',
  ],
  layer: 'background',
  fields: [
    { key: 'baseColor', label: 'Sky', kind: 'color' },
    { key: 'deepColor', label: 'Depth', kind: 'color' },
    { key: 'ridgeColor', label: 'Ridges', kind: 'color' },
    { key: 'sunColor', label: 'Sun', kind: 'color' },
    {
      key: 'layers',
      label: 'Ridges',
      kind: 'number',
      min: 3,
      max: 6,
      step: 1,
    },
  ],
  defaults: {
    baseColor: '#1e1b4b',
    deepColor: '#020617',
    ridgeColor: '#0f172a',
    sunColor: '#f59e0b',
    layers: 4,
  },
  size: { width: 1280, height: 720 },
  previewTimeMs: 2000,
  previewDurationMs: SURFACE_DURATION_MS,
  build: ({ options, idFactory, canvas }) => {
    const base = optionColor(options, 'baseColor', '#1e1b4b');
    const deep = optionColor(options, 'deepColor', '#020617');
    const ridge = optionColor(options, 'ridgeColor', '#0f172a');
    const sun = optionColor(options, 'sunColor', '#f59e0b');
    const layers = Math.max(
      3,
      Math.min(6, Math.round(optionNumber(options, 'layers', 4))),
    );

    const rootId = idFactory('surface-terrain');
    const skyId = `${rootId}-sky`;
    const sunGlowId = `${rootId}-sun`;

    const bgId = idFactory('terrain-bg');
    const sunElementId = idFactory('terrain-sun');
    const ridgeIds = Array.from({ length: layers }, (_, index) =>
      idFactory(`terrain-ridge-${index}`),
    );
    const random = seededRandom(9157 + layers);
    const ridges: Record<string, TraceElement> = {};

    ridgeIds.forEach((id, index) => {
      const baseline =
        canvas.height * (0.52 + index * (0.4 / Math.max(1, layers)));
      const relief = canvas.height * (0.14 - index * 0.012);
      const d = ridgePath(canvas.width, canvas.height, baseline, relief, 9, random);
      const direction = index % 2 === 0 ? 1 : -1;

      ridges[id] = surfacePath(
        id,
        `Ridge ${index + 1}`,
        d,
        {
          fill: withAlpha(ridge, 0.34 + index * 0.16),
          stroke: withAlpha(base, 0.25),
          strokeWidth: 1,
        },
        [
          surfaceTrack(`${id}-x`, 'x', 'Drift', [
            { timeMs: 0, value: 0, easing: 'ease-in-out' },
            {
              timeMs: 1500 + index * 110,
              value: 18 * direction,
              easing: 'ease-in-out',
            },
            {
              timeMs: 2900 + index * 90,
              value: -12 * direction,
              easing: 'ease-in-out',
            },
            { timeMs: SURFACE_DURATION_MS, value: 0, easing: 'ease-in-out' },
          ]),
          surfaceTrack(`${id}-y`, 'y', 'Bob', [
            { timeMs: 0, value: 0, easing: 'ease-in-out' },
            {
              timeMs: 1700 + index * 80,
              value: -5 - index,
              easing: 'ease-in-out',
            },
            { timeMs: SURFACE_DURATION_MS, value: 0, easing: 'ease-in-out' },
          ]),
        ],
        { x: canvas.width / 2, y: canvas.height * 0.8 },
      );
    });

    return assembleSurface(
      surfaceGroup(
        rootId,
        'Terrain ridges',
        { x: 0, y: 0, width: canvas.width, height: canvas.height },
        [bgId, sunElementId, ...ridgeIds],
      ),
      {
        [bgId]: surfaceRect(bgId, 'Sky', {
          width: canvas.width,
          height: canvas.height,
          fill: `url(#${skyId})`,
        }),
        [sunElementId]: surfaceCircle(
          sunElementId,
          'Sun',
          canvas.width * 0.68,
          canvas.height * 0.36,
          canvas.width * 0.14,
          { fill: `url(#${sunGlowId})`, opacity: 0.9 },
          [
            surfaceTrack(`${sunElementId}-opacity`, 'opacity', 'Sun breathe', [
              { timeMs: 0, value: 0.7, easing: 'ease-in-out' },
              { timeMs: 2100, value: 0.95, easing: 'ease-in-out' },
              { timeMs: SURFACE_DURATION_MS, value: 0.7, easing: 'ease-in-out' },
            ]),
          ],
        ),
        ...ridges,
      },
      canvas.width,
      canvas.height,
      {
        gradients: {
          [skyId]: linearGradient(skyId, 90, [
            { offset: 0, color: base },
            { offset: 0.55, color: withAlpha(sun, 0.28) },
            { offset: 1, color: deep },
          ]),
          [sunGlowId]: radialGradient(sunGlowId, [
            { offset: 0, color: sun, opacity: 0.85 },
            { offset: 0.55, color: sun, opacity: 0.22 },
            { offset: 1, color: sun, opacity: 0 },
          ]),
        },
      },
    );
  },
};

export const speedlinesSurfaceBlock: TraceBlockDefinition = {
  id: 'surface-speedlines',
  title: 'Speed lines',
  description:
    'Diagonal streaks that race across the frame with staggered opacity windows. Additive, energetic and ideal behind product reveals.',
  category: 'Backgrounds',
  addonId: 'surfaces',
  tags: ['background', 'speed', 'lines', 'motion', 'energy', 'streaks'],
  keywords: [
    'speed lines',
    'motion lines',
    'streaks',
    'diagonal',
    'energy',
    'fast',
  ],
  layer: 'background',
  fields: [
    { key: 'baseColor', label: 'Base', kind: 'color' },
    { key: 'deepColor', label: 'Depth', kind: 'color' },
    { key: 'lineColor', label: 'Lines', kind: 'color' },
    { key: 'accentColor', label: 'Accent', kind: 'color' },
    {
      key: 'count',
      label: 'Streaks',
      kind: 'number',
      min: 8,
      max: 20,
      step: 1,
    },
    {
      key: 'angle',
      label: 'Angle',
      kind: 'select',
      options: [
        { value: '0', label: 'Horizontal' },
        { value: '12', label: 'Slight' },
        { value: '24', label: 'Diagonal' },
        { value: '-18', label: 'Reverse' },
      ],
    },
  ],
  defaults: {
    baseColor: '#0b1120',
    deepColor: '#020617',
    lineColor: '#93c5fd',
    accentColor: '#38bdf8',
    count: 14,
    angle: '12',
  },
  size: { width: 1280, height: 720 },
  previewTimeMs: 1800,
  previewDurationMs: SURFACE_DURATION_MS,
  build: ({ options, idFactory, canvas }) => {
    const base = optionColor(options, 'baseColor', '#0b1120');
    const deep = optionColor(options, 'deepColor', '#020617');
    const line = optionColor(options, 'lineColor', '#93c5fd');
    const accent = optionColor(options, 'accentColor', '#38bdf8');
    const count = Math.max(
      8,
      Math.min(20, Math.round(optionNumber(options, 'count', 14))),
    );
    const angle = Number(optionText(options, 'angle', '12')) || 0;

    const rootId = idFactory('surface-speedlines');
    const skyId = `${rootId}-sky`;
    const bgId = idFactory('speedlines-bg');
    const fieldId = idFactory('speedlines-field');
    const random = seededRandom(6121 + count);
    const lineIds = Array.from({ length: count }, (_, index) =>
      idFactory(`speedline-${index}`),
    );
    const lines: Record<string, TraceElement> = {};

    lineIds.forEach((id, index) => {
      const y = ((index + 0.5) / count) * canvas.height;
      const length = canvas.width * (0.12 + random() * 0.34);
      const startX = -canvas.width * 0.2 + random() * canvas.width * 0.4;
      const thickness = index % 7 === 0 ? 3 : 1 + random() * 1.4;
      const visibleStart = index * 70;
      const visibleEnd = visibleStart + 1500 + random() * 700;

      lines[id] = surfacePath(
        id,
        `Streak ${index + 1}`,
        `M ${startX} ${y} L ${startX + length} ${y}`,
        {
          fill: 'none',
          stroke: index % 5 === 0 ? accent : line,
          strokeWidth: thickness,
          strokeLinecap: 'round',
          opacity: 0,
        },
        [
          surfaceTrack(`${id}-x`, 'x', 'Travel', [
            { timeMs: 0, value: 0, easing: 'linear' },
            {
              timeMs: SURFACE_DURATION_MS,
              value: canvas.width * 0.7,
              easing: 'linear',
            },
          ]),
          surfaceTrack(`${id}-opacity`, 'opacity', 'Fade window', [
            { timeMs: 0, value: 0, easing: 'linear' },
            { timeMs: visibleStart, value: 0, easing: 'linear' },
            {
              timeMs: Math.min(SURFACE_DURATION_MS, visibleStart + 180),
              value: index % 5 === 0 ? 0.75 : 0.45,
              easing: 'linear',
            },
            {
              timeMs: Math.min(SURFACE_DURATION_MS, visibleEnd),
              value: index % 5 === 0 ? 0.75 : 0.45,
              easing: 'linear',
            },
            {
              timeMs: Math.min(SURFACE_DURATION_MS, visibleEnd + 200),
              value: 0,
              easing: 'linear',
            },
            { timeMs: SURFACE_DURATION_MS, value: 0, easing: 'linear' },
          ]),
        ],
        { x: startX + length / 2, y },
      );
    });

    return assembleSurface(
      surfaceGroup(
        rootId,
        'Speed lines',
        { x: 0, y: 0, width: canvas.width, height: canvas.height },
        [bgId, fieldId],
      ),
      {
        [bgId]: surfaceRect(bgId, 'Base', {
          width: canvas.width,
          height: canvas.height,
          fill: `url(#${skyId})`,
        }),
        [fieldId]: surfaceGroup(
          fieldId,
          'Streak field',
          {
            x: 0,
            y: 0,
            width: canvas.width,
            height: canvas.height,
            rotation: angle,
          },
          lineIds,
          [],
          { x: canvas.width / 2, y: canvas.height / 2 },
        ),
        ...lines,
      },
      canvas.width,
      canvas.height,
      {
        gradients: {
          [skyId]: linearGradient(skyId, 95, [
            { offset: 0, color: deep },
            { offset: 0.55, color: base },
            { offset: 1, color: deep },
          ]),
        },
      },
    );
  },
};