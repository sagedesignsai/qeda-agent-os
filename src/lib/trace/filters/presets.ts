/**
 * lib/trace/filters/presets.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Creative filter presets for the NovaTrace inspector. Each preset is a
 * ready-to-apply `TraceFilter` template (the inspector clones it with a fresh
 * id). Primitive params are the editable surface exposed in the Effects popover.
 */

import type { FilterPreset } from './types';

export const FILTER_PRESETS: FilterPreset[] = [
  {
    id: 'preset-drop-shadow',
    label: 'Drop shadow',
    kind: 'dropShadow',
    summary: 'Soft shadow offset behind the element (Figma-style).',
    filter: {
      label: 'Drop shadow',
      kind: 'dropShadow',
      region: 30,
      colorSpace: 'sRGB',
      primitives: [
        { id: 'blur', kind: 'feGaussianBlur', in: 'SourceAlpha', result: 'blur', params: { stdDeviation: 4 } },
        { id: 'offset', kind: 'feOffset', in: 'blur', result: 'offset', params: { dx: 0, dy: 4 } },
        { id: 'flood', kind: 'feFlood', result: 'flood', params: { 'flood-color': '#000000', 'flood-opacity': 0.25 } },
        { id: 'composite', kind: 'feComposite', in: 'flood', in2: 'offset', result: 'shadow', params: { operator: 'in' } },
        { id: 'merge', kind: 'feMerge', params: { mergeNodes: ['shadow', 'SourceGraphic'] } },
      ],
    },
  },
  {
    id: 'preset-neon-glow',
    label: 'Neon glow',
    kind: 'glow',
    summary: 'Colored bloom that bleeds beyond the element edge.',
    filter: {
      label: 'Neon glow',
      kind: 'glow',
      region: 40,
      colorSpace: 'sRGB',
      primitives: [
        { id: 'blur', kind: 'feGaussianBlur', in: 'SourceGraphic', result: 'blur', params: { stdDeviation: 6 } },
        { id: 'flood', kind: 'feFlood', result: 'flood', params: { 'flood-color': '#38bdf8', 'flood-opacity': 0.8 } },
        { id: 'composite', kind: 'feComposite', in: 'flood', in2: 'blur', result: 'glow', params: { operator: 'in' } },
        { id: 'merge', kind: 'feMerge', params: { mergeNodes: ['glow', 'SourceGraphic'] } },
      ],
    },
  },
  {
    id: 'preset-inner-glow',
    label: 'Inner glow',
    kind: 'glow',
    summary: 'Glow composited inside the element silhouette.',
    filter: {
      label: 'Inner glow',
      kind: 'glow',
      region: 20,
      colorSpace: 'sRGB',
      primitives: [
        { id: 'blur', kind: 'feGaussianBlur', in: 'SourceAlpha', result: 'blur', params: { stdDeviation: 4 } },
        { id: 'flood', kind: 'feFlood', result: 'flood', params: { 'flood-color': '#38bdf8', 'flood-opacity': 0.7 } },
        { id: 'composite', kind: 'feComposite', in: 'flood', in2: 'blur', result: 'glow', params: { operator: 'in' } },
        { id: 'merge', kind: 'feMerge', params: { mergeNodes: ['SourceGraphic', 'glow'] } },
      ],
    },
  },
  {
    id: 'preset-gaussian-blur',
    label: 'Layer blur',
    kind: 'blur',
    summary: 'Uniform Gaussian blur (soften or focus-pull).',
    filter: {
      label: 'Layer blur',
      kind: 'blur',
      region: 30,
      primitives: [
        { id: 'blur', kind: 'feGaussianBlur', in: 'SourceGraphic', result: 'blur', params: { stdDeviation: 4 } },
      ],
    },
  },
  {
    id: 'preset-grayscale',
    label: 'Grayscale',
    kind: 'color',
    summary: 'Desaturate to luminance (color bloom reveal source).',
    filter: {
      label: 'Grayscale',
      kind: 'color',
      region: 10,
      colorSpace: 'sRGB',
      primitives: [
        { id: 'sat', kind: 'feColorMatrix', in: 'SourceGraphic', result: 'gray', params: { type: 'saturate', values: 0 } },
      ],
    },
  },
  {
    id: 'preset-sepia',
    label: 'Sepia',
    kind: 'color',
    summary: 'Warm vintage tone via color matrix.',
    filter: {
      label: 'Sepia',
      kind: 'color',
      region: 10,
      colorSpace: 'sRGB',
      primitives: [
        {
          id: 'sepia',
          kind: 'feColorMatrix',
          in: 'SourceGraphic',
          result: 'sepia',
          params: {
            type: 'matrix',
            values: '0.393 0.769 0.189 0 0  0.349 0.686 0.168 0 0  0.272 0.534 0.131 0 0  0 0 0 1 0',
          },
        },
      ],
    },
  },
  {
    id: 'preset-hue-shift',
    label: 'Hue shift',
    kind: 'color',
    summary: 'Rotate hue for scene transitions or brand tinting.',
    filter: {
      label: 'Hue shift',
      kind: 'color',
      region: 10,
      colorSpace: 'sRGB',
      primitives: [
        { id: 'hue', kind: 'feColorMatrix', in: 'SourceGraphic', result: 'hue', params: { type: 'hueRotate', values: 45 } },
      ],
    },
  },
  {
    id: 'preset-duotone-blue',
    label: 'Duotone',
    kind: 'color',
    summary: 'Blue-to-cyan brand duotone (saturate + hue rotate).',
    filter: {
      label: 'Duotone',
      kind: 'color',
      region: 10,
      colorSpace: 'sRGB',
      primitives: [
        { id: 'sat', kind: 'feColorMatrix', in: 'SourceGraphic', result: 'sat', params: { type: 'saturate', values: 0.2 } },
        { id: 'hue', kind: 'feColorMatrix', in: 'sat', result: 'hue', params: { type: 'hueRotate', values: 190 } },
      ],
    },
  },
  {
    id: 'preset-glitch',
    label: 'Glitch (RGB split)',
    kind: 'distort',
    summary: 'Chromatic offset for error states and stingers.',
    filter: {
      label: 'Glitch',
      kind: 'distort',
      region: 25,
      colorSpace: 'sRGB',
      primitives: [
        { id: 'redOff', kind: 'feOffset', in: 'SourceGraphic', result: 'red', params: { dx: 3, dy: 0 } },
        { id: 'redFlood', kind: 'feFlood', result: 'redC', params: { 'flood-color': '#ff0040', 'flood-opacity': 0.6 } },
        { id: 'redComp', kind: 'feComposite', in: 'redC', in2: 'red', result: 'redOut', params: { operator: 'in' } },
        { id: 'blueOff', kind: 'feOffset', in: 'SourceGraphic', result: 'blue', params: { dx: -3, dy: 0 } },
        { id: 'blueFlood', kind: 'feFlood', result: 'blueC', params: { 'flood-color': '#00d4ff', 'flood-opacity': 0.6 } },
        { id: 'blueComp', kind: 'feComposite', in: 'blueC', in2: 'blue', result: 'blueOut', params: { operator: 'in' } },
        { id: 'merge', kind: 'feMerge', params: { mergeNodes: ['redOut', 'blueOut', 'SourceGraphic'] } },
      ],
    },
  },
  {
    id: 'preset-film-grain',
    label: 'Film grain',
    kind: 'distort',
    summary: 'Fractal noise blended as a cinematic texture.',
    filter: {
      label: 'Film grain',
      kind: 'distort',
      region: 10,
      colorSpace: 'sRGB',
      primitives: [
        { id: 'noise', kind: 'feTurbulence', result: 'noise', params: { type: 'fractalNoise', baseFrequency: 0.9, numOctaves: 2 } },
        { id: 'blend', kind: 'feBlend', in: 'SourceGraphic', in2: 'noise', result: 'out', params: { mode: 'multiply' } },
      ],
    },
  },
  {
    id: 'preset-liquid-displace',
    label: 'Liquid displace',
    kind: 'distort',
    summary: 'Turbulence-driven displacement for organic motion.',
    filter: {
      label: 'Liquid displace',
      kind: 'distort',
      region: 35,
      primitives: [
        { id: 'noise', kind: 'feTurbulence', result: 'noise', params: { type: 'fractalNoise', baseFrequency: 0.015, numOctaves: 2, seed: 3 } },
        { id: 'disp', kind: 'feDisplacementMap', in: 'SourceGraphic', in2: 'noise', result: 'out', params: { scale: 18, xChannelSelector: 'R', yChannelSelector: 'G' } },
      ],
    },
  },
  {
    id: 'preset-outline',
    label: 'Outline',
    kind: 'edge',
    summary: 'Dilated silhouette outline behind the element.',
    filter: {
      label: 'Outline',
      kind: 'edge',
      region: 25,
      colorSpace: 'sRGB',
      primitives: [
        { id: 'dilate', kind: 'feMorphology', in: 'SourceAlpha', result: 'dilated', params: { operator: 'dilate', radius: 2 } },
        { id: 'flood', kind: 'feFlood', result: 'color', params: { 'flood-color': '#38bdf8', 'flood-opacity': 1 } },
        { id: 'composite', kind: 'feComposite', in: 'color', in2: 'dilated', result: 'outline', params: { operator: 'in' } },
        { id: 'merge', kind: 'feMerge', params: { mergeNodes: ['outline', 'SourceGraphic'] } },
      ],
    },
  },
  {
    id: 'preset-emboss',
    label: 'Emboss',
    kind: 'edge',
    summary: 'Convolution emboss for a tactile, 3D-ish surface.',
    filter: {
      label: 'Emboss',
      kind: 'edge',
      region: 15,
      primitives: [
        {
          id: 'conv',
          kind: 'feConvolveMatrix',
          in: 'SourceGraphic',
          result: 'emboss',
          params: { order: 3, kernelMatrix: '1 0 0  0 0 0  0 0 -1', bias: 0.5, divisor: 1 },
        },
      ],
    },
  },
];