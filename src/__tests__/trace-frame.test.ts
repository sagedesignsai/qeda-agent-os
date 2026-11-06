import { stageOf } from '@/lib/trace/document';
/**
 * Frame sampler.
 *
 * Two jobs: pin the sampler's own contract (purity, clamping, blending, motion
 * paths) and prove it agrees with the legacy evaluator for every shipped
 * template and recipe. The second half is the gate that stops the stage and the
 * sampler from drifting apart while renderers are rewired.
 */

import { lerpColor, parseTraceColor } from '@/lib/trace/animation/color-math';
import { migrateTraceDocument } from '@/lib/trace/migrate';
import { expandRecipe } from '@/lib/trace/recipes';
import { sampleFrame } from '@/lib/trace/runtime/frame';
import { resolveElementAtTime } from '@/lib/trace/runtime/resolve-element';
import {
  COMPOSITION_TEMPLATES,
  instantiateCompositionTemplate,
} from '@/lib/trace/templates';
import type {
  PropertyTrack,
  TraceAnimation,
  TraceDocument,
  TraceElement,
  TraceStageInput,
} from '@/lib/trace/types';

const ARTBOARD_ID = 'ab-default';
const ANIMATION_ID = 'anim-default';

function element(
  id: string,
  overrides: Partial<TraceElement> = {},
): TraceElement {
  return {
    id,
    name: id,
    type: 'rect',
    visible: true,
    locked: false,
    sceneId: null,
    origin: { x: 0, y: 0 },
    attributes: { width: 100, height: 100 },
    tracks: [],
    parentId: null,
    childrenIds: [],
    ...overrides,
  };
}

function track(
  id: string,
  property: PropertyTrack['property'],
  keyframes: Array<[number, number | string]>,
  animationId?: string,
): PropertyTrack {
  return {
    id,
    ...(animationId ? { animationId } : {}),
    property,
    label: property,
    keyframes: keyframes.map(([timeMs, value], index) => ({
      id: `${id}-k${index}`,
      timeMs,
      value,
      easing: 'linear',
    })),
  };
}

function v1Project(elements: TraceElement[], durationMs = 2000): TraceStageInput {
  return {
    id: 'prj-frame',
    name: 'Frame test',
    width: 800,
    height: 600,
    durationMs,
    fps: 60,
    elements: Object.fromEntries(elements.map((item) => [item.id, item])),
    rootElementIds: elements.map((item) => item.id),
    audioTracks: [],
    storyboard: {
      scenes: [{ id: 'scene-1', name: 'Scene 1', startMs: 0, durationMs }],
      activeSceneId: 'scene-1',
      sourceRefs: [],
    },
  };
}

function v2Document(elements: TraceElement[], durationMs = 2000): TraceDocument {
  return migrateTraceDocument(v1Project(elements, durationMs)).project;
}

function withAnimations(
  document: TraceDocument,
  animations: TraceAnimation[],
): TraceDocument {
  const artboard = document.artboards[ARTBOARD_ID];
  return {
    ...document,
    artboards: {
      ...document.artboards,
      [ARTBOARD_ID]: {
        ...artboard,
        animations: [...artboard.animations, ...animations],
        animationOrder: [
          ...artboard.animationOrder,
          ...animations.map((animation) => animation.id),
        ],
      },
    },
  };
}

describe('sampleFrame', () => {
  it('is pure and never aliases the document', () => {
    const document = v2Document([
      element('el', {
        attributes: { x: 10, y: 20, width: 100, height: 100 },
        tracks: [track('t-x', 'x', [[0, 0], [1000, 100]])],
      }),
    ]);

    const first = sampleFrame(document, { timeMs: 500 });
    const second = sampleFrame(document, { timeMs: 500 });

    expect(second).toEqual(first);

    (first.elements.el.attributes as Record<string, unknown>).x = 9999;
    expect(document.artboards[ARTBOARD_ID].elements.el.attributes.x).toBe(10);
    expect(sampleFrame(document, { timeMs: 500 }).elements.el.attributes.x).toBe(
      50,
    );
  });

  it('clamps time to the animation duration', () => {
    const document = v2Document([
      element('el', { tracks: [track('t-x', 'x', [[0, 0], [1000, 100]])] }),
    ]);

    expect(sampleFrame(document, { timeMs: -500 }).timeMs).toBe(0);
    expect(sampleFrame(document, { timeMs: 99_999 }).timeMs).toBe(2000);
    expect(
      sampleFrame(document, { timeMs: 99_999 }).elements.el.transform.x,
    ).toBe(100);
  });

  it('ignores tracks owned by another animation', () => {
    const document = v2Document([
      element('el', {
        attributes: { x: 10 },
        tracks: [track('t-x', 'x', [[0, 500], [1000, 500]], 'anim-foreign')],
      }),
    ]);

    const frame = sampleFrame(document, { timeMs: 500 });
    expect(frame.elements.el.transform.x).toBe(10);
  });

  it('keeps the base/offset transform convention', () => {
    const document = v2Document([
      element('el', {
        attributes: { baseX: 100, baseY: 50, x: 0, y: 0 },
        tracks: [track('t-x', 'x', [[0, 0], [1000, 20]])],
      }),
    ]);

    const frame = sampleFrame(document, { timeMs: 500 });
    expect(frame.elements.el.transform.x).toBeCloseTo(110, 6);
    expect(frame.elements.el.transform.y).toBeCloseTo(50, 6);
  });

  it('clamps opacity into 0..1', () => {
    const document = v2Document([
      element('el', {
        tracks: [track('t-op', 'opacity', [[0, 0], [1000, 2]])],
      }),
    ]);

    expect(sampleFrame(document, { timeMs: 1000 }).elements.el.opacity).toBe(1);
    expect(sampleFrame(document, { timeMs: 1000 }).elements.el.attributes.opacity).toBe(2);
  });

  it('filters by scene only when a scene is requested', () => {
    const document = v2Document([
      element('global'),
      element('scoped', { sceneId: 'scene-a' }),
    ]);

    expect(Object.keys(sampleFrame(document, { timeMs: 0 }).elements)).toEqual([
      'global',
      'scoped',
    ]);
    expect(
      Object.keys(sampleFrame(document, { timeMs: 0, sceneId: 'scene-b' }).elements),
    ).toEqual(['global']);
    expect(
      Object.keys(sampleFrame(document, { timeMs: 0, sceneId: 'scene-a' }).elements),
    ).toEqual(['global', 'scoped']);
  });

  it('walks a motion path by arc length', () => {
    const document = v2Document([
      element('el', {
        type: 'path',
        attributes: { d: 'M 0 0 L 50 0 L 50 50' },
        tracks: [track('t-move', 'motionPathProgress', [[0, 0], [1000, 100]])],
      }),
    ]);

    const middle = sampleFrame(document, { timeMs: 500 }).elements.el;
    expect(middle.transform.x).toBeCloseTo(50, 4);
    expect(middle.transform.y).toBeCloseTo(0, 4);

    const end = sampleFrame(document, { timeMs: 1000 }).elements.el;
    expect(end.transform.x).toBeCloseTo(50, 4);
    expect(end.transform.y).toBeCloseTo(50, 4);
  });

  it('adds the motion tangent to rotationOffset when autoRotate is on', () => {
    const document = v2Document([
      element('el', {
        type: 'path',
        attributes: {
          d: 'M 0 0 L 0 100',
          motionPathData: 'M 0 0 L 0 100',
          autoRotate: true,
          rotationOffset: 10,
        },
        tracks: [track('t-move', 'motionPathProgress', [[0, 0], [1000, 100]])],
      }),
    ]);

    const frame = sampleFrame(document, { timeMs: 1000 }).elements.el;
    expect(frame.transform.rotation).toBeCloseTo(100, 3);
  });

  it('blends numeric properties across layers', () => {
    const document = v2Document([
      element('el', { tracks: [track('t-op', 'opacity', [[0, 0], [1000, 1]])] }),
    ]);

    const frame = sampleFrame(document, {
      timeMs: 0,
      layers: [
        { animationId: ANIMATION_ID, timeMs: 0, weight: 1 },
        { animationId: ANIMATION_ID, timeMs: 1000, weight: 1 },
      ],
    });

    expect(frame.elements.el.opacity).toBeCloseTo(0.5, 6);
  });

  it('blends colors without the old half-way jump', () => {
    const document = v2Document([
      element('el', {
        attributes: { fill: '#000000' },
        tracks: [
          track('t-fill', 'fill', [
            [0, '#000000'],
            [1000, '#ffffff'],
          ]),
        ],
      }),
    ]);

    const frame = sampleFrame(document, {
      timeMs: 0,
      layers: [
        { animationId: ANIMATION_ID, timeMs: 0, weight: 1 },
        { animationId: ANIMATION_ID, timeMs: 1000, weight: 1 },
      ],
    });

    const blended = parseTraceColor(frame.elements.el.attributes.fill);
    expect(blended).not.toBeNull();
    expect(blended?.r).toBeGreaterThan(120);
    expect(blended?.r).toBeLessThan(136);
    expect(blended?.a).toBe(1);
  });

  it('takes the dominant layer for discrete values', () => {
    const document = v2Document([
      element('el', {
        type: 'text',
        attributes: { text: 'A' },
        tracks: [
          track('t-text', 'text', [
            [0, 'A'],
            [1000, 'B'],
          ]),
        ],
      }),
    ]);

    const frame = sampleFrame(document, {
      timeMs: 0,
      layers: [
        { animationId: ANIMATION_ID, timeMs: 0, weight: 1 },
        { animationId: ANIMATION_ID, timeMs: 1000, weight: 3 },
      ],
    });

    expect(frame.elements.el.attributes.text).toBe('B');
  });

  it('lets a property fall through when a layer does not define it', () => {
    const foreign: TraceAnimation = {
      id: 'anim-b',
      name: 'B',
      durationMs: 2000,
      loop: 'loop',
    };
    const document = withAnimations(
      v2Document([
        element('el', {
          attributes: { y: 5 },
          tracks: [
            track('t-x', 'x', [[0, 40], [1000, 40]]),
            track('t-op', 'opacity', [[0, 1], [1000, 0]], 'anim-b'),
          ],
        }),
      ]),
      [foreign],
    );

    const frame = sampleFrame(document, {
      timeMs: 0,
      layers: [
        { animationId: ANIMATION_ID, timeMs: 0, weight: 1 },
        { animationId: 'anim-b', timeMs: 1000, weight: 1 },
      ],
    });

    // x has a single contribution, so it must not be halved by the other layer.
    expect(frame.elements.el.transform.x).toBe(40);
    expect(frame.elements.el.opacity).toBeCloseTo(0.5, 6);
  });

  it('ignores layers with zero weight', () => {
    const document = v2Document([
      element('el', { tracks: [track('t-op', 'opacity', [[0, 1], [1000, 1]])] }),
    ]);

    const frame = sampleFrame(document, {
      timeMs: 0,
      layers: [
        { animationId: ANIMATION_ID, timeMs: 0, weight: 0 },
        { animationId: ANIMATION_ID, timeMs: 1000, weight: 1 },
      ],
    });

    expect(frame.elements.el.opacity).toBe(1);
  });
});

describe('Trace color maths', () => {
  it('parses short hex, alpha hex and rgba()', () => {
    expect(parseTraceColor('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseTraceColor('#00000080')?.a).toBeCloseTo(0.5, 2);
    expect(parseTraceColor('rgba(10, 20, 30, 0.5)')).toEqual({
      r: 10,
      g: 20,
      b: 30,
      a: 0.5,
    });
    expect(parseTraceColor('none')).toBeNull();
    expect(parseTraceColor('var(--brand)')).toBeNull();
  });

  it('interpolates rgba() smoothly instead of jumping at 50 %', () => {
    const quarter = lerpColor('rgba(0, 0, 0, 0)', 'rgba(255, 255, 255, 1)', 0.25);
    const parsed = parseTraceColor(quarter);

    expect(parsed?.r).toBeCloseTo(64, 0);
    expect(parsed?.a).toBeCloseTo(0.25, 2);
  });

  it('falls back to the discrete rule for unparseable colors', () => {
    expect(lerpColor('var(--brand)', '#ffffff', 0.2)).toBe('var(--brand)');
    expect(lerpColor('var(--brand)', '#ffffff', 0.8)).toBe('#ffffff');
  });
});

describe('Sampler parity with the legacy evaluator', () => {
  const TIMES = [0, 500, 1000];

  function expectParity(
    project: TraceStageInput | TraceDocument,
    document: TraceDocument,
    times: number[],
  ): void {
    for (const time of times) {
      const frame = sampleFrame(document, { timeMs: time });
      for (const [id, source] of Object.entries(stageOf(project).elements)) {
        const sampled = frame.elements[id];
        const legacy = resolveElementAtTime(source, time);

        expect(sampled).toBeDefined();
        expect(sampled.transform.x).toBeCloseTo(legacy.transform.x, 5);
        expect(sampled.transform.y).toBeCloseTo(legacy.transform.y, 5);
        expect(sampled.transform.rotation).toBeCloseTo(
          legacy.transform.rotation,
          5,
        );
        expect(sampled.transform.scaleX).toBeCloseTo(legacy.transform.scaleX, 5);
        expect(sampled.transform.scaleY).toBeCloseTo(legacy.transform.scaleY, 5);

        for (const [key, value] of Object.entries(legacy.attributes)) {
          if (key === 'opacity') continue;
          expect(sampled.attributes[key]).toEqual(value);
        }

        const legacyOpacity = Number(legacy.attributes.opacity ?? 1);
        expect(sampled.opacity).toBeCloseTo(
          Math.min(1, Math.max(0, legacyOpacity)),
          5,
        );
      }
    }
  }

  for (const template of COMPOSITION_TEMPLATES) {
    it(`matches resolveElementAtTime for the ${template.id} template`, () => {
      const project = instantiateCompositionTemplate(template.id);
      const document = migrateTraceDocument(project).project;
      expectParity(project, document, [...TIMES, project.durationMs]);
    });
  }

  const RECIPE_CASES: Array<[string, Record<string, unknown>]> = [
    ['counter', { startVal: 0, endVal: 100 }],
    ['progress-ring', { radius: 40, progress: 60 }],
    [
      'bar-chart',
      {
        width: 400,
        height: 300,
        bars: [
          { id: 'a', label: 'A', value: 50 },
          { id: 'b', label: 'B', value: 80 },
        ],
      },
    ],
    ['kinetic-text', { text: 'Hello World', staggerMs: 90 }],
    ['lower-third', { title: 'Ada', subtitle: 'Engineer' }],
  ];

  for (const [recipeId, options] of RECIPE_CASES) {
    it(`matches resolveElementAtTime for the ${recipeId} recipe`, () => {
      const expanded = expandRecipe(recipeId, options, (prefix) =>
        `${recipeId}-${prefix}`,
      );
      const elements = [expanded.root, ...expanded.children];
      const project = v1Project(elements);
      const document = migrateTraceDocument(project).project;

      expectParity(project, document, TIMES);
    });
  }
});
