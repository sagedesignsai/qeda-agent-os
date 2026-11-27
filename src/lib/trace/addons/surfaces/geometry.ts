/**
 * lib/trace/addons/surfaces/geometry.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Geometric surfaces: Bauhaus fields, blueprint grids and halftone matrices.
 */

import type { TraceElement } from '../../types';
import {
  optionColor,
  optionNumber,
} from '../../blocks/helpers';
import type { TraceBlockDefinition } from '../../blocks/types';
import {
  SURFACE_DURATION_MS,
  assembleSurface,
  linearGradient,
  polygonPath,
  seededRandom,
  surfaceCircle,
  surfaceGroup,
  surfacePath,
  surfaceRect,
  surfaceTrack,
} from './helpers';

export const bauhausSurfaceBlock: TraceBlockDefinition = {
  id: 'surface-bauhaus',
  title: 'Bauhaus field',
  description:
    'A seeded composition of circles, rings, bars, triangles and arcs on flat stock, with staggered rotation and breathing scale.',
  category: 'Backgrounds',
  addonId: 'surfaces',
  tags: ['background', 'bauhaus', 'geometric', 'shapes', 'editorial', 'flat'],
  keywords: [
    'bauhaus',
    'geometric background',
    'shapes',
    'editorial',
    'swiss',
    'poster',
  ],
  layer: 'background',
  fields: [
    { key: 'baseColor', label: 'Stock', kind: 'color' },
    { key: 'accentColor', label: 'Accent', kind: 'color' },
    { key: 'altColor', label: 'Second', kind: 'color' },
    {
      key: 'density',
      label: 'Shapes',
      kind: 'number',
      min: 6,
      max: 14,
      step: 1,
    },
  ],
  defaults: {
    baseColor: '#f1e9d8',
    accentColor: '#0f172a',
    altColor: '#e4572e',
    density: 12,
  },
  size: { width: 1280, height: 720 },
  previewTimeMs: 1800,
  previewDurationMs: SURFACE_DURATION_MS,
  build: ({ options, idFactory, canvas }) => {
    const base = optionColor(options, 'baseColor', '#f1e9d8');
    const accent = optionColor(options, 'accentColor', '#0f172a');
    const alt = optionColor(options, 'altColor', '#e4572e');
    const density = Math.max(
      6,
      Math.min(14, Math.round(optionNumber(options, 'density', 12))),
    );

    const rootId = idFactory('surface-bauhaus');
    const bgId = idFactory('bauhaus-bg');
    const shapesId = idFactory('bauhaus-shapes');

    const random = seededRandom(8801 + density);
    const columns = 4;
    const rows = 3;
    const cellWidth = canvas.width / columns;
    const cellHeight = canvas.height / rows;
    const cellCount = columns * rows;
    const palette = [accent, alt, base, accent, alt];
    const shapeIds = Array.from({ length: density }, (_, index) =>
      idFactory(`bauhaus-shape-${index}`),
    );
    const shapes: Record<string, TraceElement> = {};
    const usedCells = new Set<number>();

    shapeIds.forEach((shapeId, index) => {
      let cell = Math.floor(random() * cellCount);
      let attempts = 0;
      while (usedCells.has(cell) && attempts < cellCount) {
        cell = (cell + 1) % cellCount;
        attempts += 1;
      }
      usedCells.add(cell);

      const column = cell % columns;
      const row = Math.floor(cell / columns);
      const centerX = (column + 0.5) * cellWidth + (random() - 0.5) * cellWidth * 0.12;
      const centerY = (row + 0.5) * cellHeight + (random() - 0.5) * cellHeight * 0.12;
      const radius = Math.min(cellWidth, cellHeight) * (0.16 + random() * 0.16);
      const color = palette[index % palette.length];
      const kind = index % 5;

      const tracks = [];
      if (index % 3 === 0) {
        const direction = index % 2 === 0 ? 1 : -1;
        tracks.push(
          surfaceTrack(`${shapeId}-rotation`, 'rotation', 'Rotate', [
            { timeMs: 0, value: 0, easing: 'ease-in-out' },
            {
              timeMs: 1200 + index * 90,
              value: 9 * direction,
              easing: 'ease-in-out',
            },
            {
              timeMs: SURFACE_DURATION_MS,
              value: 0,
              easing: 'ease-in-out',
            },
          ]),
        );
      } else if (index % 3 === 1) {
        tracks.push(
          surfaceTrack(`${shapeId}-scale`, 'scaleX', 'Breathe', [
            { timeMs: 0, value: 1, easing: 'ease-in-out' },
            { timeMs: 1800 + index * 60, value: 1.08, easing: 'ease-in-out' },
            { timeMs: SURFACE_DURATION_MS, value: 1, easing: 'ease-in-out' },
          ]),
          surfaceTrack(`${shapeId}-scale-y`, 'scaleY', 'Breathe', [
            { timeMs: 0, value: 1, easing: 'ease-in-out' },
            { timeMs: 1800 + index * 60, value: 0.95, easing: 'ease-in-out' },
            { timeMs: SURFACE_DURATION_MS, value: 1, easing: 'ease-in-out' },
          ]),
        );
      }

      if (kind === 0) {
        shapes[shapeId] = surfaceCircle(
          shapeId,
          `Disc ${index + 1}`,
          centerX,
          centerY,
          radius,
          { fill: color },
          tracks,
        );
      } else if (kind === 1) {
        shapes[shapeId] = surfaceCircle(
          shapeId,
          `Ring ${index + 1}`,
          centerX,
          centerY,
          radius,
          {
            fill: 'none',
            stroke: color,
            strokeWidth: Math.max(4, radius * 0.22),
          },
          tracks,
        );
      } else if (kind === 2) {
        shapes[shapeId] = surfaceRect(
          shapeId,
          `Bar ${index + 1}`,
          {
            x: centerX - radius,
            y: centerY - radius * 0.18,
            width: radius * 2,
            height: radius * 0.36,
            fill: color,
          },
          tracks,
          { x: 0, y: 0 },
        );
      } else if (kind === 3) {
        shapes[shapeId] = surfacePath(
          shapeId,
          `Triangle ${index + 1}`,
          polygonPath(centerX, centerY, radius, 3, index * 12),
          { fill: color },
          tracks,
          { x: radius, y: radius },
        );
      } else {
        shapes[shapeId] = surfacePath(
          shapeId,
          `Arc ${index + 1}`,
          `M ${centerX - radius} ${centerY} A ${radius} ${radius} 0 0 1 ${
            centerX + radius
          } ${centerY} Z`,
          { fill: color },
          tracks,
          { x: radius, y: radius },
        );
      }
    });

    return assembleSurface(
      surfaceGroup(
        rootId,
        'Bauhaus field',
        { x: 0, y: 0, width: canvas.width, height: canvas.height },
        [bgId, shapesId],
      ),
      {
        [bgId]: surfaceRect(bgId, 'Stock', {
          width: canvas.width,
          height: canvas.height,
          fill: base,
        }),
        [shapesId]: surfaceGroup(
          shapesId,
          'Shapes',
          { x: 0, y: 0, width: canvas.width, height: canvas.height },
          shapeIds,
        ),
        ...shapes,
      },
      canvas.width,
      canvas.height,
    );
  },
};

export const blueprintSurfaceBlock: TraceBlockDefinition = {
  id: 'surface-blueprint',
  title: 'Blueprint grid',
  description:
    'A drafting grid that pans by exactly one cell per loop, with corner brackets and a scanning accent line. Reads as technical, calm and precise.',
  category: 'Backgrounds',
  addonId: 'surfaces',
  tags: ['background', 'grid', 'blueprint', 'technical', 'scan', 'drafting'],
  keywords: [
    'blueprint',
    'grid',
    'technical background',
    'schematic',
    'drafting',
    'scanline',
  ],
  layer: 'background',
  fields: [
    { key: 'baseColor', label: 'Base', kind: 'color' },
    { key: 'lineColor', label: 'Lines', kind: 'color' },
    { key: 'accentColor', label: 'Scan', kind: 'color' },
    {
      key: 'spacing',
      label: 'Cell',
      kind: 'number',
      min: 32,
      max: 96,
      step: 4,
      suffix: 'px',
    },
  ],
  defaults: {
    baseColor: '#06121f',
    lineColor: '#1e3a5f',
    accentColor: '#38bdf8',
    spacing: 48,
  },
  size: { width: 1280, height: 720 },
  previewTimeMs: 2000,
  previewDurationMs: SURFACE_DURATION_MS,
  build: ({ options, idFactory, canvas }) => {
    const base = optionColor(options, 'baseColor', '#06121f');
    const line = optionColor(options, 'lineColor', '#1e3a5f');
    const accent = optionColor(options, 'accentColor', '#38bdf8');
    const spacing = Math.max(
      32,
      Math.min(96, Math.round(optionNumber(options, 'spacing', 48))),
    );

    const rootId = idFactory('surface-blueprint');
    const bgId = idFactory('blueprint-bg');
    const gridId = idFactory('blueprint-grid');
    const scanId = idFactory('blueprint-scan');
    const glowId = idFactory('blueprint-glow');
    const glowGradientId = `${rootId}-glow`;

    const columns = Math.min(60, Math.ceil(canvas.width / spacing) + 1);
    const rows = Math.min(40, Math.ceil(canvas.height / spacing) + 1);
    const verticalIds = Array.from({ length: columns }, (_, index) =>
      idFactory(`blueprint-v-${index}`),
    );
    const horizontalIds = Array.from({ length: rows }, (_, index) =>
      idFactory(`blueprint-h-${index}`),
    );

    const lines: Record<string, TraceElement> = {};
    verticalIds.forEach((id, index) => {
      lines[id] = surfaceRect(
        id,
        `Vertical ${index + 1}`,
        {
          x: index * spacing,
          y: 0,
          width: 1,
          height: canvas.height,
          fill: line,
          opacity: index % 4 === 0 ? 0.9 : 0.45,
        },
        [],
        { x: 0, y: 0 },
      );
    });
    horizontalIds.forEach((id, index) => {
      lines[id] = surfaceRect(
        id,
        `Horizontal ${index + 1}`,
        {
          x: 0,
          y: index * spacing,
          width: canvas.width,
          height: 1,
          fill: line,
          opacity: index % 4 === 0 ? 0.9 : 0.45,
        },
        [],
        { x: 0, y: 0 },
      );
    });

    const bracket = 28;
    const bracketWidth = 2;
    const brackets = [
      `M 0 ${bracket} V 0 H ${bracket}`,
      `M ${canvas.width - bracket} 0 H ${canvas.width} V ${bracket}`,
      `M ${canvas.width} ${canvas.height - bracket} V ${canvas.height} H ${
        canvas.width - bracket
      }`,
      `M ${bracket} ${canvas.height} H 0 V ${canvas.height - bracket}`,
    ].map((d, index) => {
      const id = idFactory(`blueprint-bracket-${index}`);
      return surfacePath(id, `Bracket ${index + 1}`, d, {
        fill: 'none',
        stroke: accent,
        strokeWidth: bracketWidth,
        opacity: 0.7,
      });
    });
    const bracketElements = Object.fromEntries(
      brackets.map((element) => [element.id, element]),
    );
    const glowHeight = canvas.height * 0.36;

    return assembleSurface(
      surfaceGroup(
        rootId,
        'Blueprint grid',
        { x: 0, y: 0, width: canvas.width, height: canvas.height },
        [bgId, gridId, glowId, scanId, ...brackets.map((entry) => entry.id)],
      ),
      {
        [bgId]: surfaceRect(bgId, 'Drafting base', {
          width: canvas.width,
          height: canvas.height,
          fill: base,
        }),
        [gridId]: surfaceGroup(
          gridId,
          'Grid',
          { x: 0, y: 0, width: canvas.width, height: canvas.height },
          [...verticalIds, ...horizontalIds],
          [
            // The pattern repeats every cell, so a full-cell pan lands on an
            // identical frame and the loop is invisible.
            surfaceTrack(`${gridId}-x`, 'x', 'Grid pan', [
              { timeMs: 0, value: 0, easing: 'linear' },
              { timeMs: SURFACE_DURATION_MS, value: -spacing, easing: 'linear' },
            ]),
          ],
        ),
        ...lines,
        [glowId]: surfaceRect(
          glowId,
          'Scanner glow',
          {
            width: canvas.width,
            height: glowHeight,
            fill: `url(#${glowGradientId})`,
            opacity: 0.9,
          },
          [
            surfaceTrack(`${glowId}-y`, 'y', 'Glow follow', [
              { timeMs: 0, value: -glowHeight / 2, easing: 'linear' },
              {
                timeMs: SURFACE_DURATION_MS,
                value: canvas.height - glowHeight / 2,
                easing: 'linear',
              },
            ]),
          ],
          { x: 0, y: 0 },
        ),
        [scanId]: surfaceRect(
          scanId,
          'Scan line',
          {
            width: canvas.width,
            height: 2,
            fill: accent,
            opacity: 0,
          },
          [
            surfaceTrack(`${scanId}-y`, 'y', 'Scan Y', [
              { timeMs: 0, value: 0, easing: 'linear' },
              { timeMs: SURFACE_DURATION_MS, value: canvas.height, easing: 'linear' },
            ]),
            surfaceTrack(`${scanId}-opacity`, 'opacity', 'Scan fade', [
              { timeMs: 0, value: 0, easing: 'linear' },
              { timeMs: 600, value: 0.85, easing: 'linear' },
              { timeMs: 3400, value: 0.85, easing: 'linear' },
              { timeMs: SURFACE_DURATION_MS, value: 0, easing: 'linear' },
            ]),
          ],
          { x: 0, y: 0 },
        ),
        ...bracketElements,
      },
      canvas.width,
      canvas.height,
      {
        gradients: {
          [glowGradientId]: linearGradient(glowGradientId, 90, [
            { offset: 0, color: accent, opacity: 0 },
            { offset: 0.5, color: accent, opacity: 0.18 },
            { offset: 1, color: accent, opacity: 0 },
          ]),
        },
      },
    );
  },
};

export const halftoneSurfaceBlock: TraceBlockDefinition = {
  id: 'surface-halftone',
  title: 'Halftone matrix',
  description:
    'A focus-weighted dot matrix with an accent diagonal and a slow breathing scale. Dense print texture without a raster image.',
  category: 'Backgrounds',
  addonId: 'surfaces',
  tags: ['background', 'halftone', 'dots', 'print', 'texture', 'pattern'],
  keywords: [
    'halftone',
    'dot grid',
    'dots',
    'print texture',
    'comic',
    'pattern',
  ],
  layer: 'background',
  fields: [
    { key: 'baseColor', label: 'Base', kind: 'color' },
    { key: 'dotColor', label: 'Dots', kind: 'color' },
    { key: 'accentColor', label: 'Accent', kind: 'color' },
    {
      key: 'spacing',
      label: 'Spacing',
      kind: 'number',
      min: 52,
      max: 96,
      step: 4,
      suffix: 'px',
    },
  ],
  defaults: {
    baseColor: '#0b1120',
    dotColor: '#94a3b8',
    accentColor: '#38bdf8',
    spacing: 64,
  },
  size: { width: 1280, height: 720 },
  previewTimeMs: 2000,
  previewDurationMs: SURFACE_DURATION_MS,
  build: ({ options, idFactory, canvas }) => {
    const base = optionColor(options, 'baseColor', '#0b1120');
    const dot = optionColor(options, 'dotColor', '#94a3b8');
    const accent = optionColor(options, 'accentColor', '#38bdf8');
    const spacing = Math.max(
      52,
      Math.min(96, Math.round(optionNumber(options, 'spacing', 64))),
    );

    const rootId = idFactory('surface-halftone');
    const bgId = idFactory('halftone-bg');
    const matrixId = idFactory('halftone-matrix');

    const columns = Math.ceil(canvas.width / spacing);
    const rows = Math.ceil(canvas.height / spacing);
    const centerX = canvas.width * 0.42;
    const centerY = canvas.height * 0.48;
    const maxDistance = Math.hypot(
      Math.max(centerX, canvas.width - centerX),
      Math.max(centerY, canvas.height - centerY),
    );
    const random = seededRandom(3301);

    const dotIds: string[] = [];
    const dots: Record<string, TraceElement> = {};
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const x = (column + 0.5) * spacing;
        const y = (row + 0.5) * spacing;
        const distance = Math.hypot(x - centerX, y - centerY) / maxDistance;
        const radius =
          spacing * (0.05 + Math.max(0, 1 - distance) * 0.24) +
          random() * spacing * 0.02;
        const diagonal = (x + y) / (canvas.width + canvas.height);
        const isAccent = diagonal > 0.52 && diagonal < 0.62;
        const id = idFactory(`halftone-dot-${row}-${column}`);
        dotIds.push(id);
        dots[id] = surfaceCircle(
          id,
          `Dot ${row + 1}.${column + 1}`,
          x,
          y,
          Math.max(1, radius),
          {
            fill: isAccent ? accent : dot,
            opacity: isAccent ? 0.95 : 0.25 + (1 - distance) * 0.5,
          },
        );
      }
    }

    return assembleSurface(
      surfaceGroup(
        rootId,
        'Halftone matrix',
        { x: 0, y: 0, width: canvas.width, height: canvas.height },
        [bgId, matrixId],
      ),
      {
        [bgId]: surfaceRect(bgId, 'Base', {
          width: canvas.width,
          height: canvas.height,
          fill: base,
        }),
        [matrixId]: surfaceGroup(
          matrixId,
          'Dots',
          {
            x: 0,
            y: 0,
            width: canvas.width,
            height: canvas.height,
          },
          dotIds,
          [
            surfaceTrack(`${matrixId}-scale`, 'scaleX', 'Breathe', [
              { timeMs: 0, value: 1, easing: 'ease-in-out' },
              { timeMs: 2200, value: 1.035, easing: 'ease-in-out' },
              { timeMs: SURFACE_DURATION_MS, value: 1, easing: 'ease-in-out' },
            ]),
            surfaceTrack(`${matrixId}-scale-y`, 'scaleY', 'Breathe', [
              { timeMs: 0, value: 1, easing: 'ease-in-out' },
              { timeMs: 2200, value: 1.035, easing: 'ease-in-out' },
              { timeMs: SURFACE_DURATION_MS, value: 1, easing: 'ease-in-out' },
            ]),
          ],
          { x: centerX, y: centerY },
        ),
        ...dots,
      },
      canvas.width,
      canvas.height,
    );
  },
};