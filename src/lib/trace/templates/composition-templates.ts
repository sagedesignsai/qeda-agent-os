/**
 * lib/trace/templates/composition-templates.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Starter compositions for "New composition". Every template is pure document
 * data authored against the same op contract the editor writes.
 */

import { createBlankTraceProject } from '../defaults';
import { createScene } from '../storyboard';
import type { TraceElement, TraceProject } from '../types';
import { createNovaTraceMarkProject } from './default-project';

export interface CompositionTemplateMeta {
  id: string;
  title: string;
  description: string;
  category: 'Blank' | 'Branding' | 'Typography' | 'Infographics' | 'Broadcast';
  width: number;
  height: number;
  durationMs: number;
  fps: number;
  previewColor: string;
  create: (options: TemplateOptions) => TraceProject;
}

export interface TemplateOptions {
  name?: string;
  width?: number;
  height?: number;
  durationMs?: number;
  fps?: number;
}

function base(project: TraceProject, options: TemplateOptions): TraceProject {
  return {
    ...project,
    name: options.name || project.name,
    durationMs: options.durationMs ?? project.durationMs,
    fps: options.fps ?? project.fps,
  };
}

function element(
  input: Partial<TraceElement> & Pick<TraceElement, 'id' | 'name' | 'type'>,
): TraceElement {
  return {
    visible: true,
    locked: false,
    sceneId: null,
    origin: { x: 0, y: 0 },
    attributes: {},
    tracks: [],
    parentId: null,
    childrenIds: [],
    ...input,
  };
}

function createBlank(options: TemplateOptions): TraceProject {
  return base(
    createBlankTraceProject(options.name || 'Untitled Trace', {
      width: options.width ?? 1920,
      height: options.height ?? 1080,
      durationMs: options.durationMs ?? 6000,
      fps: options.fps ?? 60,
      storyboard: {
        scenes: [
          createScene({
            name: 'Scene 1',
            durationMs: options.durationMs ?? 6000,
          }),
        ],
        sourceRefs: [],
      },
    }),
    options,
  );
}

function createKineticType(options: TemplateOptions): TraceProject {
  const scene = createScene({
    id: 'kinetic-scene',
    name: 'Headline',
    durationMs: 4200,
  });
  const elements: Record<string, TraceElement> = {
    'kinetic-rule': element({
      id: 'kinetic-rule',
      name: 'Accent Rule',
      type: 'rect',
      sceneId: scene.id,
      attributes: {
        x: 120,
        y: 508,
        width: 240,
        height: 6,
        rx: 3,
        fill: '#38bdf8',
      },
      tracks: [
        {
          id: 'kinetic-rule-width',
          property: 'width',
          label: 'Width',
          keyframes: [
            {
              id: 'kinetic-rule-1',
              timeMs: 500,
              value: 0,
              easing: 'power3.out',
            },
            {
              id: 'kinetic-rule-2',
              timeMs: 1500,
              value: 240,
              easing: 'power3.out',
            },
          ],
        },
      ],
    }),
    'kinetic-headline': element({
      id: 'kinetic-headline',
      name: 'Headline',
      type: 'kinetic-text',
      sceneId: scene.id,
      origin: { x: 0, y: 0 },
      attributes: {
        x: 120,
        y: 400,
        text: 'MOVE THE STORY',
        fontSize: 92,
        fontWeight: 800,
        fontFamily: 'Inter, system-ui, sans-serif',
        fill: '#f8fafc',
        letterSpacing: 4,
        textAnchor: 'start',
        effect: 'typewriter',
        revealProgress: 100,
      },
      tracks: [
        {
          id: 'kinetic-headline-reveal',
          property: 'revealProgress',
          label: 'Reveal',
          keyframes: [
            {
              id: 'kinetic-headline-1',
              timeMs: 900,
              value: 0,
              easing: 'linear',
            },
            {
              id: 'kinetic-headline-2',
              timeMs: 2600,
              value: 100,
              easing: 'linear',
            },
          ],
        },
      ],
    }),
    'kinetic-sub': element({
      id: 'kinetic-sub',
      name: 'Subhead',
      type: 'text',
      sceneId: scene.id,
      origin: { x: 0, y: 0 },
      attributes: {
        x: 124,
        y: 560,
        text: 'vector motion, authored locally',
        fontSize: 22,
        fontWeight: 500,
        fill: '#94a3b8',
        letterSpacing: 3,
        textAnchor: 'start',
        opacity: 0,
      },
      tracks: [
        {
          id: 'kinetic-sub-opacity',
          property: 'opacity',
          label: 'Opacity',
          keyframes: [
            {
              id: 'kinetic-sub-1',
              timeMs: 2100,
              value: 0,
              easing: 'power2.out',
            },
            {
              id: 'kinetic-sub-2',
              timeMs: 3000,
              value: 1,
              easing: 'power2.out',
            },
          ],
        },
        {
          id: 'kinetic-sub-y',
          property: 'y',
          label: 'Y',
          keyframes: [
            {
              id: 'kinetic-sub-3',
              timeMs: 2100,
              value: 18,
              easing: 'power2.out',
            },
            {
              id: 'kinetic-sub-4',
              timeMs: 3000,
              value: 0,
              easing: 'power2.out',
            },
          ],
        },
      ],
    }),
  };

  return base(
    {
      id: 'kinetic-type',
      name: 'Kinetic Headline',
      width: 1280,
      height: 720,
      durationMs: 4200,
      fps: 60,
      elements,
      rootElementIds: ['kinetic-rule', 'kinetic-headline', 'kinetic-sub'],
      storyboard: { scenes: [scene], activeSceneId: scene.id, sourceRefs: [] },
    },
    options,
  );
}

function createMetrics(options: TemplateOptions): TraceProject {
  const scene = createScene({
    id: 'metrics-scene',
    name: 'Metrics',
    durationMs: 4000,
  });
  const elements: Record<string, TraceElement> = {
    'metrics-label': element({
      id: 'metrics-label',
      name: 'Label',
      type: 'text',
      sceneId: scene.id,
      attributes: {
        x: 120,
        y: 170,
        text: 'ARR GROWTH',
        fontSize: 18,
        fontWeight: 600,
        fill: '#64748b',
        letterSpacing: 4,
        opacity: 1,
      },
      tracks: [],
    }),
    'metrics-counter': element({
      id: 'metrics-counter',
      name: 'Revenue Counter',
      type: 'counter',
      sceneId: scene.id,
      attributes: {
        x: 120,
        y: 240,
        prefix: '$',
        suffix: 'K',
        endVal: 428,
        counterValue: 0,
        decimals: 0,
        fontSize: 96,
        fontWeight: 800,
        fill: '#f8fafc',
        text: 'monthly recurring revenue',
      },
      tracks: [
        {
          id: 'metrics-counter-value',
          property: 'counterValue',
          label: 'Value',
          keyframes: [
            {
              id: 'metrics-counter-1',
              timeMs: 400,
              value: 0,
              easing: 'power2.out',
            },
            {
              id: 'metrics-counter-2',
              timeMs: 2400,
              value: 428,
              easing: 'power2.out',
            },
          ],
        },
      ],
    }),
    'metrics-ring': element({
      id: 'metrics-ring',
      name: 'Efficiency Ring',
      type: 'progress-ring',
      sceneId: scene.id,
      attributes: {
        x: 900,
        y: 210,
        radius: 96,
        thickness: 14,
        progress: 0,
        progressColor: '#38bdf8',
        trackColor: '#1e293b',
        fill: '#f8fafc',
        fontSize: 34,
        fontWeight: 700,
      },
      tracks: [
        {
          id: 'metrics-ring-progress',
          property: 'progress',
          label: 'Progress',
          keyframes: [
            {
              id: 'metrics-ring-1',
              timeMs: 700,
              value: 0,
              easing: 'power2.inOut',
            },
            {
              id: 'metrics-ring-2',
              timeMs: 2600,
              value: 86,
              easing: 'power2.inOut',
            },
          ],
        },
      ],
    }),
    'metrics-bars': element({
      id: 'metrics-bars',
      name: 'Quarterly Bars',
      type: 'bar-chart',
      sceneId: scene.id,
      attributes: {
        x: 120,
        y: 400,
        width: 760,
        height: 240,
        barSpacing: 28,
        barRadius: 6,
        orientation: 'vertical',
        progress: 0,
        bars: [
          { id: 'q1', label: 'Q1', value: 42, color: '#0ea5e9' },
          { id: 'q2', label: 'Q2', value: 58, color: '#22d3ee' },
          { id: 'q3', label: 'Q3', value: 71, color: '#818cf8' },
          { id: 'q4', label: 'Q4', value: 96, color: '#f472b6' },
        ],
      },
      tracks: [
        {
          id: 'metrics-bars-progress',
          property: 'progress',
          label: 'Grow',
          keyframes: [
            {
              id: 'metrics-bars-1',
              timeMs: 1200,
              value: 0,
              easing: 'back.out',
            },
            {
              id: 'metrics-bars-2',
              timeMs: 2600,
              value: 100,
              easing: 'back.out',
            },
          ],
        },
      ],
    }),
  };

  return base(
    {
      id: 'metrics-infographic',
      name: 'Key Metrics',
      width: 1280,
      height: 720,
      durationMs: 4000,
      fps: 60,
      elements,
      rootElementIds: [
        'metrics-label',
        'metrics-counter',
        'metrics-ring',
        'metrics-bars',
      ],
      storyboard: { scenes: [scene], activeSceneId: scene.id, sourceRefs: [] },
    },
    options,
  );
}

function createLowerThird(options: TemplateOptions): TraceProject {
  const scene = createScene({
    id: 'lower-third-scene',
    name: 'Speaker',
    durationMs: 3600,
  });
  const elements: Record<string, TraceElement> = {
    'lower-third-card': element({
      id: 'lower-third-card',
      name: 'Speaker Card',
      type: 'lower-third',
      sceneId: scene.id,
      attributes: {
        x: 96,
        y: 540,
        width: 460,
        height: 88,
        progress: 0,
        title: 'Ada Lovelace',
        subtitle: 'Computing pioneer — Analytical Engine',
        accentColor: '#f472b6',
        cardBg: 'rgba(12, 18, 32, 0.9)',
        opacity: 1,
      },
      tracks: [
        {
          id: 'lower-third-progress',
          property: 'progress',
          label: 'Reveal',
          keyframes: [
            {
              id: 'lower-third-1',
              timeMs: 500,
              value: 0,
              easing: 'power3.out',
            },
            {
              id: 'lower-third-2',
              timeMs: 1400,
              value: 100,
              easing: 'power3.out',
            },
          ],
        },
      ],
    }),
  };

  return base(
    {
      id: 'lower-third',
      name: 'Cinematic Lower Third',
      width: 1280,
      height: 720,
      durationMs: 3600,
      fps: 60,
      elements,
      rootElementIds: ['lower-third-card'],
      storyboard: { scenes: [scene], activeSceneId: scene.id, sourceRefs: [] },
    },
    options,
  );
}

export const COMPOSITION_TEMPLATES: CompositionTemplateMeta[] = [
  {
    id: 'blank',
    title: 'Blank canvas',
    description: 'An empty artboard you fully control.',
    category: 'Blank',
    width: 1920,
    height: 1080,
    durationMs: 6000,
    fps: 60,
    previewColor: '#334155',
    create: createBlank,
  },
  {
    id: 'nova-mark',
    title: 'NovaTrace mark',
    description:
      'Concentric trace rings that draw on and resolve into a wordmark.',
    category: 'Branding',
    width: 700,
    height: 700,
    durationMs: 4600,
    fps: 60,
    previewColor: '#22d3ee',
    create: (options) =>
      createNovaTraceMarkProject(options.name || 'NovaTrace Mark'),
  },
  {
    id: 'kinetic-type',
    title: 'Kinetic headline',
    description: 'Typewriter headline, accent rule and a settling subhead.',
    category: 'Typography',
    width: 1280,
    height: 720,
    durationMs: 4200,
    fps: 60,
    previewColor: '#818cf8',
    create: createKineticType,
  },
  {
    id: 'metrics',
    title: 'Key metrics',
    description: 'KPI counter, efficiency ring and a growing bar chart.',
    category: 'Infographics',
    width: 1280,
    height: 720,
    durationMs: 4000,
    fps: 60,
    previewColor: '#38bdf8',
    create: createMetrics,
  },
  {
    id: 'lower-third',
    title: 'Lower third',
    description: 'Broadcast speaker card with an accent reveal.',
    category: 'Broadcast',
    width: 1280,
    height: 720,
    durationMs: 3600,
    fps: 60,
    previewColor: '#f472b6',
    create: createLowerThird,
  },
];

export function getCompositionTemplate(
  templateId?: string,
): CompositionTemplateMeta {
  return (
    COMPOSITION_TEMPLATES.find((template) => template.id === templateId) ??
    COMPOSITION_TEMPLATES[0]
  );
}

export function instantiateCompositionTemplate(
  templateId?: string,
  options: TemplateOptions = {},
): TraceProject {
  const template = getCompositionTemplate(templateId);
  const project = template.create(options);
  const width = options.width ?? template.width;
  const height = options.height ?? template.height;
  // Blank templates honour arbitrary dimensions. Authored templates keep their
  // own artboard so their keyframes stay on-canvas.
  return template.id === 'blank' ? { ...project, width, height } : project;
}
