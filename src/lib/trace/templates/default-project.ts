/**
 * lib/trace/templates/default-project.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The NovaTrace signature composition: a concentric "trace" mark that draws
 * itself, breathes, and resolves into a wordmark.
 *
 * Pure data — no DOM, no store, no GSAP — so project creation works in the main
 * process, in Jest and in the browser.
 */

import { createScene } from '../storyboard';
import type { TraceElement, TraceProject, TraceGradient } from '../types';

const WIDTH = 700;
const HEIGHT = 700;
const DURATION = 4600;
const CENTER = { x: WIDTH / 2, y: HEIGHT / 2 };

function element(
  input: Partial<TraceElement> & Pick<TraceElement, 'id' | 'name' | 'type'>,
): TraceElement {
  return {
    visible: true,
    locked: false,
    sceneId: null,
    origin: { x: CENTER.x, y: CENTER.y },
    attributes: {},
    tracks: [],
    parentId: null,
    childrenIds: [],
    ...input,
  };
}

const GLOW_GRADIENT: TraceGradient = {
  id: 'nova-glow',
  type: 'radial',
  stops: [
    { id: 'nova-glow-1', offset: 0, color: '#67e8f9', opacity: 0.55 },
    { id: 'nova-glow-2', offset: 0.55, color: '#0ea5e9', opacity: 0.18 },
    { id: 'nova-glow-3', offset: 1, color: '#0b1220', opacity: 0 },
  ],
  angle: 0,
  cx: 0.5,
  cy: 0.5,
  r: 0.5,
};

const STROKE_GRADIENT: TraceGradient = {
  id: 'nova-stroke',
  type: 'linear',
  stops: [
    { id: 'nova-stroke-1', offset: 0, color: '#22d3ee', opacity: 1 },
    { id: 'nova-stroke-2', offset: 0.5, color: '#818cf8', opacity: 1 },
    { id: 'nova-stroke-3', offset: 1, color: '#f472b6', opacity: 1 },
  ],
  angle: 135,
  cx: 0.5,
  cy: 0.5,
  r: 0.5,
};

export function createNovaTraceMarkProject(
  name = 'NovaTrace Mark',
): TraceProject {
  const scenes = [
    createScene({
      id: 'scene-signal',
      name: 'Signal',
      durationMs: 1500,
      intent: 'Glow rises, outer ring draws on.',
      transitionIn: 'cut',
    }),
    createScene({
      id: 'scene-trace',
      name: 'Trace',
      durationMs: 1700,
      intent: 'Sparks sweep the sweep of the ring, rotation accelerates.',
      transitionIn: 'fade',
    }),
    createScene({
      id: 'scene-mark',
      name: 'Wordmark',
      durationMs: 1400,
      intent: 'Wordmark types on, tagline settles, loop closes.',
      transitionIn: 'fade',
    }),
  ];

  const elements: Record<string, TraceElement> = {
    'nova-glow': element({
      id: 'nova-glow',
      name: 'Ambient Glow',
      type: 'circle',
      sceneId: 'scene-signal',
      attributes: {
        x: 40,
        y: 40,
        width: 620,
        height: 620,
        fill: 'url(#nova-glow)',
        fillOpacity: 1,
        opacity: 0.2,
        scaleX: 0.86,
        scaleY: 0.86,
      },
      origin: { x: 310, y: 310 },
      tracks: [
        {
          id: 'nova-glow-opacity',
          property: 'opacity',
          label: 'Opacity',
          keyframes: [
            {
              id: 'nova-glow-opacity-1',
              timeMs: 0,
              value: 0,
              easing: 'power2.out',
            },
            {
              id: 'nova-glow-opacity-2',
              timeMs: 1200,
              value: 0.75,
              easing: 'sine.inOut',
            },
            {
              id: 'nova-glow-opacity-3',
              timeMs: 3000,
              value: 0.42,
              easing: 'sine.inOut',
            },
            {
              id: 'nova-glow-opacity-4',
              timeMs: DURATION,
              value: 0.75,
              easing: 'sine.inOut',
            },
          ],
        },
        {
          id: 'nova-glow-scale',
          property: 'scaleX',
          label: 'Scale',
          keyframes: [
            {
              id: 'nova-glow-scale-1',
              timeMs: 0,
              value: 0.82,
              easing: 'sine.inOut',
            },
            {
              id: 'nova-glow-scale-2',
              timeMs: 1800,
              value: 1,
              easing: 'sine.inOut',
            },
            {
              id: 'nova-glow-scale-3',
              timeMs: DURATION,
              value: 0.92,
              easing: 'sine.inOut',
            },
          ],
        },
      ],
    }),

    'nova-ring-outer': element({
      id: 'nova-ring-outer',
      name: 'Outer Trace',
      type: 'circle',
      sceneId: 'scene-signal',
      attributes: {
        x: 110,
        y: 110,
        width: 480,
        height: 480,
        fill: 'none',
        stroke: 'url(#nova-stroke)',
        strokeWidth: 3,
        trimStart: 0,
        trimEnd: 100,
        rotation: -90,
        opacity: 1,
      },
      origin: { x: 240, y: 240 },
      tracks: [
        {
          id: 'nova-ring-outer-trim',
          property: 'trimEnd',
          label: 'Draw',
          keyframes: [
            {
              id: 'nova-ring-outer-trim-1',
              timeMs: 0,
              value: 0,
              easing: 'power2.inOut',
            },
            {
              id: 'nova-ring-outer-trim-2',
              timeMs: 1500,
              value: 100,
              easing: 'power2.out',
            },
          ],
        },
        {
          id: 'nova-ring-outer-rotate',
          property: 'rotation',
          label: 'Rotation',
          keyframes: [
            {
              id: 'nova-ring-outer-rotate-1',
              timeMs: 0,
              value: -90,
              easing: 'linear',
            },
            {
              id: 'nova-ring-outer-rotate-2',
              timeMs: DURATION,
              value: 270,
              easing: 'linear',
            },
          ],
        },
      ],
    }),

    'nova-ring-inner': element({
      id: 'nova-ring-inner',
      name: 'Inner Orbit',
      type: 'circle',
      sceneId: 'scene-trace',
      attributes: {
        x: 170,
        y: 170,
        width: 360,
        height: 360,
        fill: 'none',
        stroke: '#38bdf8',
        strokeWidth: 1.5,
        strokeDasharray: '3 12',
        opacity: 0.7,
        rotation: 0,
      },
      origin: { x: 180, y: 180 },
      tracks: [
        {
          id: 'nova-ring-inner-rotate',
          property: 'rotation',
          label: 'Rotation',
          keyframes: [
            {
              id: 'nova-ring-inner-rotate-1',
              timeMs: 0,
              value: 0,
              easing: 'linear',
            },
            {
              id: 'nova-ring-inner-rotate-2',
              timeMs: DURATION,
              value: -360,
              easing: 'linear',
            },
          ],
        },
        {
          id: 'nova-ring-inner-opacity',
          property: 'opacity',
          label: 'Opacity',
          keyframes: [
            {
              id: 'nova-ring-inner-opacity-1',
              timeMs: 0,
              value: 0,
              easing: 'power2.out',
            },
            {
              id: 'nova-ring-inner-opacity-2',
              timeMs: 1500,
              value: 0.7,
              easing: 'power2.out',
            },
          ],
        },
      ],
    }),

    'nova-spark-left': element({
      id: 'nova-spark-left',
      name: 'Trace A',
      type: 'path',
      sceneId: 'scene-trace',
      origin: { x: 0, y: 0 },
      attributes: {
        x: 0,
        y: 0,
        d: 'M 190 350 L 285 350 L 330 245',
        fill: 'none',
        stroke: '#67e8f9',
        strokeWidth: 6,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        trimStart: 0,
        trimEnd: 100,
      },
      tracks: [
        {
          id: 'nova-spark-left-trim',
          property: 'trimEnd',
          label: 'Draw',
          keyframes: [
            {
              id: 'nova-spark-left-trim-1',
              timeMs: 900,
              value: 0,
              easing: 'power3.out',
            },
            {
              id: 'nova-spark-left-trim-2',
              timeMs: 2100,
              value: 100,
              easing: 'power3.out',
            },
          ],
        },
      ],
    }),

    'nova-spark-right': element({
      id: 'nova-spark-right',
      name: 'Trace B',
      type: 'path',
      sceneId: 'scene-trace',
      origin: { x: 0, y: 0 },
      attributes: {
        x: 0,
        y: 0,
        d: 'M 510 350 L 415 350 L 370 455',
        fill: 'none',
        stroke: '#f472b6',
        strokeWidth: 6,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        trimStart: 0,
        trimEnd: 100,
      },
      tracks: [
        {
          id: 'nova-spark-right-trim',
          property: 'trimEnd',
          label: 'Draw',
          keyframes: [
            {
              id: 'nova-spark-right-trim-1',
              timeMs: 1150,
              value: 0,
              easing: 'power3.out',
            },
            {
              id: 'nova-spark-right-trim-2',
              timeMs: 2350,
              value: 100,
              easing: 'power3.out',
            },
          ],
        },
      ],
    }),

    'nova-wordmark': element({
      id: 'nova-wordmark',
      name: 'Wordmark',
      type: 'text',
      sceneId: 'scene-mark',
      origin: { x: 0, y: 0 },
      attributes: {
        x: CENTER.x,
        y: 352,
        text: 'NOVATRACE',
        fontSize: 72,
        fontWeight: 800,
        fontFamily: 'Inter, system-ui, sans-serif',
        fill: '#f8fafc',
        letterSpacing: 12,
        textAnchor: 'middle',
        opacity: 1,
      },
      tracks: [
        {
          id: 'nova-wordmark-opacity',
          property: 'opacity',
          label: 'Opacity',
          keyframes: [
            {
              id: 'nova-wordmark-op-1',
              timeMs: 2900,
              value: 0,
              easing: 'power2.out',
            },
            {
              id: 'nova-wordmark-op-2',
              timeMs: 3800,
              value: 1,
              easing: 'power2.out',
            },
          ],
        },
        {
          id: 'nova-wordmark-spacing',
          property: 'letterSpacing',
          label: 'Tracking',
          keyframes: [
            {
              id: 'nova-wordmark-spacing-1',
              timeMs: 2900,
              value: 26,
              easing: 'power3.out',
            },
            {
              id: 'nova-wordmark-spacing-2',
              timeMs: 4000,
              value: 12,
              easing: 'power3.out',
            },
          ],
        },
      ],
    }),

    'nova-tagline': element({
      id: 'nova-tagline',
      name: 'Tagline',
      type: 'text',
      sceneId: 'scene-mark',
      origin: { x: 0, y: 0 },
      attributes: {
        x: CENTER.x,
        y: 410,
        text: 'vectors in motion',
        fontSize: 20,
        fontWeight: 500,
        fontFamily: 'Inter, system-ui, sans-serif',
        fill: '#94a3b8',
        letterSpacing: 6,
        textAnchor: 'middle',
        opacity: 0,
      },
      tracks: [
        {
          id: 'nova-tagline-opacity',
          property: 'opacity',
          label: 'Opacity',
          keyframes: [
            {
              id: 'nova-tagline-opacity-1',
              timeMs: 3800,
              value: 0,
              easing: 'power2.out',
            },
            {
              id: 'nova-tagline-opacity-2',
              timeMs: 4400,
              value: 1,
              easing: 'power2.out',
            },
          ],
        },
        {
          id: 'nova-tagline-y',
          property: 'y',
          label: 'Y',
          keyframes: [
            {
              id: 'nova-tagline-y-1',
              timeMs: 3800,
              value: 14,
              easing: 'power2.out',
            },
            {
              id: 'nova-tagline-y-2',
              timeMs: 4400,
              value: 0,
              easing: 'power2.out',
            },
          ],
        },
      ],
    }),
  };

  return {
    id: 'nova-mark',
    name,
    width: WIDTH,
    height: HEIGHT,
    durationMs: DURATION,
    fps: 60,
    elements,
    rootElementIds: [
      'nova-glow',
      'nova-ring-outer',
      'nova-ring-inner',
      'nova-spark-left',
      'nova-spark-right',
      'nova-wordmark',
      'nova-tagline',
    ],
    gradients: {
      [GLOW_GRADIENT.id]: GLOW_GRADIENT,
      [STROKE_GRADIENT.id]: STROKE_GRADIENT,
    },
    storyboard: {
      scenes,
      activeSceneId: scenes[0].id,
      logline: 'A trace draws itself into a wordmark.',
      sourceRefs: [],
    },
  };
}
