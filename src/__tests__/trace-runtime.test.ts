import { applyOps } from '@/lib/trace/ops';
import { compileProjectToAnimatedSvg } from '@/lib/trace/export/animated-svg';
import { generateGsapCode } from '@/lib/trace/export/gsap-code';
import {
  ELEMENT_DESCRIPTORS,
  getAnimatableProperties,
  TRACK_LABELS,
} from '@/lib/trace/elements/registry';
import { resolveElementAtTime } from '@/lib/trace/runtime/resolve-element';
import { getElementTransformAtTime } from '@/lib/trace/runtime/transform-resolver';
import { mapEasingToGsap } from '@/lib/trace/runtime/gsap-compiler';
import { staticSvgMarkup } from '@/lib/trace/serialize/svg-markup';
import { createBlankTraceProject } from '@/lib/trace/defaults';
import {
  COMPOSITION_TEMPLATES,
  instantiateCompositionTemplate,
} from '@/lib/trace/templates';
import { getValueAtTime } from '@/lib/trace/animation/interpolator';
import type { TraceProject } from '@/lib/trace/types';

function animatedProject(): { project: TraceProject; elementId: string } {
  const added = applyOps(createBlankTraceProject('Runtime'), [
    {
      type: 'addElement',
      element: {
        type: 'rect',
        name: 'Card',
        x: 100,
        y: 120,
        width: 240,
        height: 160,
        fill: '#38bdf8',
      },
    },
  ]);
  const elementId = added.diff.added[0];

  const tracked = applyOps(added.project, [
    {
      type: 'setTrack',
      elementId,
      property: 'x',
      keyframes: [
        { timeMs: 0, value: 100, easing: 'power2.out' },
        { timeMs: 1000, value: 500, easing: 'power2.out' },
      ],
    },
    {
      type: 'setTrack',
      elementId,
      property: 'opacity',
      keyframes: [
        { timeMs: 0, value: 0, easing: 'linear' },
        { timeMs: 1000, value: 1, easing: 'linear' },
      ],
    },
  ]);

  return { project: tracked.project, elementId };
}

describe('Trace runtime evaluation', () => {
  it('resolves track values at an arbitrary time', () => {
    const { project, elementId } = animatedProject();
    const element = project.elements[elementId];

    expect(getElementTransformAtTime(element, 0).x).toBeCloseTo(100);
    const mid = getElementTransformAtTime(element, 500);
    expect(mid.x).toBeGreaterThan(100);
    expect(mid.x).toBeLessThan(500);
    expect(getElementTransformAtTime(element, 1000).x).toBeCloseTo(500);

    expect(resolveElementAtTime(element, 500).attributes.opacity).toBeCloseTo(
      0.5,
    );
  });

  it('keeps the document immutable while evaluating', () => {
    const { project, elementId } = animatedProject();
    const snapshot = JSON.stringify(project);
    resolveElementAtTime(project.elements[elementId], 500);
    expect(JSON.stringify(project)).toBe(snapshot);
  });

  it('maps easing identifiers to GSAP easings', () => {
    expect(mapEasingToGsap('linear')).toBe('none');
    expect(mapEasingToGsap('power2.out')).toBe('power2.out');
    expect(typeof mapEasingToGsap('cubic-bezier(0.4, 0, 0.2, 1)')).toBe(
      'function',
    );
  });
});

describe('Trace templates', () => {
  it('exposes a template catalogue with a blank first entry', () => {
    expect(COMPOSITION_TEMPLATES[0].id).toBe('blank');
    expect(COMPOSITION_TEMPLATES.length).toBeGreaterThanOrEqual(4);
  });

  it('instantiates the signature template with layers, tracks and scenes', () => {
    const project = instantiateCompositionTemplate('nova-mark', {
      name: 'Mark',
    });

    expect(project.name).toBe('Mark');
    expect(project.rootElementIds.length).toBeGreaterThan(3);
    expect(
      Object.values(project.elements).some(
        (element) => element.tracks.length > 0,
      ),
    ).toBe(true);
    expect(project.storyboard?.scenes.length).toBeGreaterThan(1);
    expect(project.gradients?.['nova-glow']).toBeDefined();
  });

  it('keeps template ids stable so documents remain reproducible', () => {
    const project = instantiateCompositionTemplate('lower-third');
    expect(project.elements['lower-third-card']).toBeDefined();
    expect(project.rootElementIds).toEqual(['lower-third-card']);
  });
});

describe('Trace element registry', () => {
  it('registers exactly the SVG primitive element types', () => {
    expect(Object.keys(ELEMENT_DESCRIPTORS).sort()).toEqual(
      [
        'circle',
        'ellipse',
        'group',
        'image',
        'line',
        'path',
        'polygon',
        'polyline',
        'rect',
        'text',
        'use',
      ].sort(),
    );
  });

  it('gives every element type at least one animatable property', () => {
    const types = [
      'text',
      'rect',
      'circle',
      'ellipse',
      'line',
      'polyline',
      'polygon',
      'path',
      'image',
      'use',
      'group',
    ] as const;
    for (const type of types) {
      expect(getAnimatableProperties(type).length).toBeGreaterThan(0);
    }
  });

  it('exposes human labels for animated properties', () => {
    expect(TRACK_LABELS.opacity).toBe('Opacity');
    expect(TRACK_LABELS.trimEnd).toBe('Trim end');
  });

  it('supports SVG primitive element specs and compiles star to polygon points', () => {
    const blank = createBlankTraceProject('Primitives');
    const result = applyOps(blank, [
      {
        type: 'addElement',
        element: { type: 'ellipse', x: 10, y: 10, width: 200, height: 100 },
      },
      {
        type: 'addElement',
        element: { type: 'line', x: 0, y: 0, x1: 0, y1: 0, x2: 150, y2: 80 },
      },
      {
        type: 'addElement',
        element: {
          type: 'polyline',
          x: 0,
          y: 0,
          points: '0,0 50,25 100,0',
        },
      },
      {
        type: 'addElement',
        element: {
          type: 'image',
          x: 0,
          y: 0,
          width: 300,
          height: 200,
          href: 'test.png',
        },
      },
      {
        type: 'addElement',
        element: {
          type: 'use',
          x: 0,
          y: 0,
          width: 50,
          height: 50,
          href: '#sym',
        },
      },
      {
        type: 'addElement',
        element: {
          type: 'star',
          name: 'StarPoly',
          x: 0,
          y: 0,
          width: 100,
          height: 100,
        },
      },
    ]);

    expect(result.diagnostics).toHaveLength(0);
    expect(result.diff.added).toHaveLength(6);

    const starElem = Object.values(result.project.elements).find(
      (e) => e.name === 'StarPoly',
    );
    expect(starElem).toBeDefined();
    expect(starElem?.type).toBe('polygon');
    expect(starElem?.attributes.points).toBeDefined();
    expect(starElem?.attributes.points.length).toBeGreaterThan(0);

    const svg = staticSvgMarkup(result.project, 0);
    expect(svg).toContain('<ellipse');
    expect(svg).toContain('<line');
    expect(svg).toContain('<polyline');
    expect(svg).toContain('<image');
    expect(svg).toContain('<use');
    expect(svg).toContain('<polygon points=');
  });
});

describe('Trace exports', () => {
  it('serializes a static SVG containing element ids and gradient defs', () => {
    const project = instantiateCompositionTemplate('nova-mark');
    const svg = staticSvgMarkup(project, 2000, { size: true });

    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('id="trace-elem-nova-wordmark"');
    expect(svg).toContain('<radialGradient id="nova-glow"');
  });

  it('compiles a self-contained SMIL animation without scripts', () => {
    const { project } = animatedProject();
    const svg = compileProjectToAnimatedSvg(project, { loop: true });

    expect(svg).toContain('<animateTransform');
    expect(svg).toContain('repeatCount="indefinite"');
    expect(svg).toContain('attributeName="opacity"');
    expect(svg).not.toContain('<script');
  });

  it('generates runnable GSAP code with the composition markup', () => {
    const { project } = animatedProject();
    const vanilla = generateGsapCode(project, {
      format: 'vanilla',
      loop: false,
    });
    expect(vanilla).toContain(
      'createTraceSceneTimeline'.replace('TraceScene', 'Runtime'),
    );
    expect(vanilla).toContain('tl.to(');
    expect(vanilla).toContain('svgMarkup');

    const react = generateGsapCode(project, { format: 'react' });
    expect(react).toContain('useGSAP');
    expect(react).toContain('dangerouslySetInnerHTML');
  });
});

describe('Trace interpolation still matches the original contract', () => {
  it('returns the last keyframe value past the end of a track', () => {
    const { project, elementId } = animatedProject();
    const track = project.elements[elementId].tracks.find(
      (entry) => entry.property === 'x',
    );
    expect(getValueAtTime(track as never, 99_999)).toBe(500);
  });
});

describe('Trace recipe compiler and applyRecipe op', () => {
  it('expands lower-third into group of standard primitives with animations', () => {
    const blank = createBlankTraceProject('RecipeTest');
    const result = applyOps(blank, [
      {
        type: 'applyRecipe',
        recipeId: 'lower-third',
        options: { title: 'Alex Vance', subtitle: 'Lead Engineer' },
      },
    ]);

    expect(result.diagnostics).toHaveLength(0);
    const rootId = result.recipeRootIds[0];
    expect(result.diff.added[0]).toBe(rootId);
    const root = result.project.elements[rootId];
    expect(root.type).toBe('group');
    expect(root.childrenIds?.length).toBe(4);

    const children = root.childrenIds!.map((id) => result.project.elements[id]);
    const types = children.map((c) => c.type);
    expect(types).toEqual(['rect', 'rect', 'text', 'text']);

    // Check accent height track
    const accent = children[1];
    expect(accent.tracks.some((t) => t.property === 'height')).toBe(true);

    const svg = staticSvgMarkup(result.project, 0);
    expect(svg).toContain('Alex Vance');
    expect(svg).toContain('Lead Engineer');
    expect(svg).not.toContain('<lower-third');
  });

  it('expands progress-ring, bar-chart, kinetic-text, and counter into purely primitive subtrees', () => {
    const blank = createBlankTraceProject('AllRecipes');
    const result = applyOps(blank, [
      { type: 'applyRecipe', recipeId: 'progress-ring', options: { progress: 80 } },
      { type: 'applyRecipe', recipeId: 'bar-chart' },
      { type: 'applyRecipe', recipeId: 'kinetic-text', options: { text: 'HELLO WORLD' } },
      { type: 'applyRecipe', recipeId: 'counter', options: { startVal: 0, endVal: 50, prefix: '$' } },
    ]);

    expect(result.diagnostics).toHaveLength(0);
    expect(result.diff.added.length).toBeGreaterThan(15);

    // Verify every created element is strictly a primitive
    const validPrimitives = new Set([
      'group',
      'rect',
      'circle',
      'ellipse',
      'line',
      'polyline',
      'polygon',
      'path',
      'text',
      'image',
      'use',
    ]);

    for (const elem of Object.values(result.project.elements)) {
      expect(validPrimitives.has(elem.type)).toBe(true);
    }
  });
});

import { migrateTraceProject } from '@/lib/trace/migrate';

describe('Trace migration (Stage 4)', () => {
  const PRIMITIVES = new Set([
    'group', 'rect', 'circle', 'ellipse', 'line', 'polyline',
    'polygon', 'path', 'text', 'image', 'use',
  ]);

  function legacyProject(type: string, attrs: Record<string, unknown> = {}): TraceProject {
    return {
      id: 'test',
      name: 'Test',
      width: 1280,
      height: 720,
      durationMs: 4000,
      fps: 60,
      elements: {
        'el-1': {
          id: 'el-1',
          name: 'Element',
          type: type as never,
          visible: true,
          locked: false,
          sceneId: null,
          origin: { x: 0, y: 0 },
          attributes: attrs,
          tracks: [],
          parentId: null,
          childrenIds: [],
        },
      },
      rootElementIds: ['el-1'],
      audioTracks: [],
      storyboard: { scenes: [], sourceRefs: [] },
    };
  }

  test('is a no-op on a fully-primitive project', () => {
    const project = legacyProject('rect', { x: 0, y: 0, width: 100, height: 100 });
    expect(migrateTraceProject(project)).toBe(project); // same reference
  });

  test.each([
    ['counter', {}],
    ['progress-ring', { radius: 80 }],
    ['bar-chart', { bars: [{ id: 'a', label: 'A', value: 50 }] }],
    ['kinetic-text', { text: 'Hello World' }],
    ['lower-third', { title: 'Ada Lovelace' }],
  ])('expands %s into only primitive elements', (type, attrs) => {
    const legacy = legacyProject(type, attrs);
    const migrated = migrateTraceProject(legacy);

    // id preserved on the root group
    expect(migrated.elements['el-1']).toBeDefined();
    expect(migrated.elements['el-1'].type).toBe('group');
    expect(migrated.rootElementIds).toContain('el-1');

    // every element is a primitive
    for (const el of Object.values(migrated.elements)) {
      expect(PRIMITIVES.has(el.type)).toBe(true);
    }
  });

  test('migration is idempotent', () => {
    const legacy = legacyProject('counter', { endVal: 100 });
    const once = migrateTraceProject(legacy);
    const twice = migrateTraceProject(once);
    expect(twice).toBe(once); // same reference on second call
  });

  test('preserves opacity/x/y tracks on the group root', () => {
    const project: TraceProject = {
      ...legacyProject('lower-third', { title: 'Test' }),
      elements: {
        'el-1': {
          id: 'el-1',
          name: 'LT',
          type: 'lower-third' as never,
          visible: true,
          locked: false,
          sceneId: null,
          origin: { x: 0, y: 0 },
          attributes: { title: 'Test' },
          tracks: [
            { id: 't1', property: 'opacity', label: 'Opacity', keyframes: [{ id: 'k1', timeMs: 0, value: 0, easing: 'linear' }, { id: 'k2', timeMs: 500, value: 1, easing: 'linear' }] },
          ],
          parentId: null,
          childrenIds: [],
        },
      },
    };
    const migrated = migrateTraceProject(project);
    const root = migrated.elements['el-1'];
    expect(root.tracks.some((t) => t.property === 'opacity')).toBe(true);
  });

  test('preserves legacy group metadata and parent membership', () => {
    const legacy = legacyProject('lower-third', { title: 'Title', x: 30, y: 40 });
    const parent = {
      ...legacy.elements['el-1'],
      id: 'parent',
      name: 'Parent',
      type: 'group' as const,
      childrenIds: ['el-1'],
    };
    const nestedElement = {
      ...legacy.elements['el-1'],
      id: 'el-1',
      name: 'Legacy card',
      type: 'lower-third' as never,
      visible: false,
      locked: true,
      sceneId: 'legacy-scene',
      parentId: 'parent',
      origin: { x: 12, y: 14 },
    };
    const project: TraceProject = {
      ...legacy,
      elements: { parent, 'el-1': nestedElement },
      rootElementIds: ['parent'],
    };

    const migrated = migrateTraceProject(project);
    const root = migrated.elements['el-1'];
    expect(root).toMatchObject({
      type: 'group',
      name: 'Legacy card',
      visible: false,
      locked: true,
      sceneId: 'legacy-scene',
      parentId: 'parent',
      origin: { x: 12, y: 14 },
    });
    expect(migrated.elements.parent.childrenIds).toEqual(['el-1']);
    expect(root.childrenIds).toContain('el-1-card');
    expect(migrated.rootElementIds).toEqual(['parent']);
  });

  test('maps counter, ring and lower-third animation tracks to child attributes', () => {
    const counter = legacyProject('counter', {
      startVal: 0,
      prefix: '$',
      suffix: 'K',
    });
    counter.elements['el-1'].tracks = [
      {
        id: 'counter-track',
        property: 'counterValue' as never,
        label: 'Value',
        keyframes: [
          { id: 'counter-kf', timeMs: 200, value: 1250, easing: 'linear' },
        ],
      },
    ];
    const migratedCounter = migrateTraceProject(counter);
    const value = migratedCounter.elements['el-1-value'];
    expect(value.type).toBe('text');
    expect(value.tracks[0].property).toBe('text');
    expect(value.tracks[0].keyframes[0].value).toBe('$1,250K');

    const ring = legacyProject('progress-ring', { radius: 10 });
    ring.elements['el-1'].tracks = [
      {
        id: 'progress-track',
        property: 'progress' as never,
        label: 'Progress',
        keyframes: [
          { id: 'progress-kf', timeMs: 100, value: 50, easing: 'linear' },
        ],
      },
    ];
    const migratedRing = migrateTraceProject(ring);
    const indicator = migratedRing.elements['el-1-indicator'];
    expect(indicator.tracks[0].property).toBe('strokeDashoffset');
    expect(indicator.tracks[0].keyframes[0].value).toBeCloseTo(Math.PI * 10);

    const lowerThird = legacyProject('lower-third', { progress: 50 });
    const migratedLowerThird = migrateTraceProject(lowerThird);
    const accent = migratedLowerThird.elements['el-1-accent'];
    expect(accent.attributes.width).toBe(2);
  });

  test('converts shape, star and spline-tracer legacy types to primitives', () => {
    const shapes = legacyProject('shape', {
      shapeKind: 'star',
      width: 100,
      height: 80,
    });
    const migratedShape = migrateTraceProject(shapes).elements['el-1'];
    expect(migratedShape.type).toBe('polygon');
    expect(migratedShape.attributes.points).toContain('50,');

    const tracer = legacyProject('spline-tracer', { r: 8, pathProgress: 20 });
    tracer.elements['el-1'].tracks = [
      {
        id: 'path-track',
        property: 'pathProgress' as never,
        label: 'Path progress',
        keyframes: [
          { id: 'path-kf', timeMs: 0, value: 20, easing: 'linear' },
        ],
      },
    ];
    const migratedTracer = migrateTraceProject(tracer).elements['el-1'];
    expect(migratedTracer.type).toBe('circle');
    expect(migratedTracer.attributes.radius).toBe(8);
    expect(migratedTracer.tracks[0].property).toBe('pathProgress');
  });

  test('exports legacy documents through their primitive migration', () => {
    const project = legacyProject('counter', {
      startVal: 0,
      endVal: 100,
      prefix: '$',
    });
    const svg = staticSvgMarkup(project, 0);
    expect(svg).toContain('$100');
    expect(svg).not.toContain('data-role');
    expect(svg).not.toContain('counter-value');
  });
});
