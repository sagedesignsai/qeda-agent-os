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
import { expandRecipe } from '../recipes';
import { instantiateSponsorCardTemplate } from './sponsor-card';
import { instantiateLowerThirdTemplate } from './lower-third';

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

  const headline = expandRecipe(
    'kinetic-text',
    {
      x: 120,
      y: 400,
      text: 'MOVE THE STORY',
      fontSize: 92,
      fontWeight: 800,
      fontFamily: 'Inter, system-ui, sans-serif',
      fill: '#f8fafc',
      sceneId: scene.id,
      name: 'Headline',
    },
    () => 'kinetic-headline',
  );

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
    'kinetic-headline': headline.root,
    ...Object.fromEntries(headline.children.map((c) => [c.id, c])),
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

  const counter = expandRecipe(
    'counter',
    {
      x: 120,
      y: 240,
      startVal: 0,
      endVal: 428,
      prefix: '$',
      suffix: 'K',
      caption: 'monthly recurring revenue',
      fontSize: 96,
      name: 'Revenue Counter',
      sceneId: scene.id,
    },
    () => 'metrics-counter',
  );

  const ring = expandRecipe(
    'progress-ring',
    {
      x: 900,
      y: 210,
      radius: 96,
      thickness: 14,
      progress: 86,
      progressColor: '#38bdf8',
      name: 'Efficiency Ring',
      sceneId: scene.id,
    },
    () => 'metrics-ring',
  );

  const bars = expandRecipe(
    'bar-chart',
    {
      x: 120,
      y: 400,
      width: 760,
      height: 240,
      barSpacing: 28,
      barRadius: 6,
      bars: [
        { id: 'q1', label: 'Q1', value: 42, color: '#0ea5e9' },
        { id: 'q2', label: 'Q2', value: 58, color: '#22d3ee' },
        { id: 'q3', label: 'Q3', value: 71, color: '#818cf8' },
        { id: 'q4', label: 'Q4', value: 96, color: '#f472b6' },
      ],
      name: 'Quarterly Bars',
      sceneId: scene.id,
    },
    () => 'metrics-bars',
  );

  const elements: Record<string, TraceElement> = {
    'metrics-label': element({
      id: 'metrics-label',
      name: 'Section Label',
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
    'metrics-counter': counter.root,
    ...Object.fromEntries(counter.children.map((c) => [c.id, c])),
    'metrics-ring': ring.root,
    ...Object.fromEntries(ring.children.map((c) => [c.id, c])),
    'metrics-bars': bars.root,
    ...Object.fromEntries(bars.children.map((c) => [c.id, c])),
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

  const lt = expandRecipe(
    'lower-third',
    {
      x: 96,
      y: 540,
      width: 460,
      height: 88,
      title: 'Ada Lovelace',
      subtitle: 'Computing pioneer — Analytical Engine',
      accentColor: '#f472b6',
      cardBg: 'rgba(12, 18, 32, 0.9)',
      name: 'Speaker Card',
      sceneId: scene.id,
    },
    () => 'lower-third-card',
  );

  const elements: Record<string, TraceElement> = {
    'lower-third-card': lt.root,
    ...Object.fromEntries(lt.children.map((c) => [c.id, c])),
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
  {
    id: 'sponsor-card',
    title: 'Sponsor card',
    description: 'Logo stinger with animated feature list and glow accents.',
    category: 'Branding',
    width: 1920,
    height: 1080,
    durationMs: 3500,
    fps: 60,
    previewColor: '#0f172a',
    create: (options) => {
      const project = instantiateSponsorCardTemplate([
        { title: 'Feature One', subtitle: 'Description' },
        { title: 'Feature Two', subtitle: 'Description' },
        { title: 'Feature Three', subtitle: 'Description' },
      ]);
      return base(project, options);
    },
  },
  {
    id: 'lower-third-overlay',
    title: 'Lower third overlay',
    description: 'Status card with title, subtext, and metric badge.',
    category: 'Broadcast',
    width: 1920,
    height: 1080,
    durationMs: 4000,
    fps: 60,
    previewColor: '#1e293b',
    create: (options) => {
      const project = instantiateLowerThirdTemplate({
        title: 'Status Title',
        subtitle: 'Subtext description',
        metric: '5/10',
        durationMs: options.durationMs ?? 4000,
        enterDurationMs: 400,
        exitDurationMs: 300,
      });
      return base(project, options);
    },
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
