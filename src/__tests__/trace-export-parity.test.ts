/**
 * Export parity.
 *
 * Golden hashes were captured from the pre-frame implementation. They pin the
 * bytes each exporter produced before the evaluation path changed, so any
 * drift shows up as a diff rather than a silent restyle. The frame comparisons
 * then prove the stage and the exporters read the same resolved values.
 */

import { createHash } from 'node:crypto';

import { migrateTraceDocument } from '@/lib/trace/migrate';
import {
  applyElementAnimationAtTime,
  applyFrameElementToDom,
} from '@/lib/trace/runtime/dom-renderer';
import { sampleFrame } from '@/lib/trace/runtime/frame';
import {
  staticSvgMarkup,
  staticSvgMarkupFromFrame,
} from '@/lib/trace/serialize/svg-markup';
import { compileProjectToAnimatedSvg } from '@/lib/trace/export/animated-svg';
import {
  createBlankTraceDocument,
  documentFromStage,
  stageOf,
} from '@/lib/trace/document';
import { createBlankTraceStage } from '@/lib/trace/defaults';
import {
  COMPOSITION_TEMPLATES,
  instantiateCompositionTemplate,
} from '@/lib/trace/templates';
import type { TraceElement, TraceStageInput } from '@/lib/trace/types';

/**
 * sha256(staticSvgMarkup(project, time)).slice(0, 16) before the rewiring.
 * Pinned on the Node/jest engine: easing uses Math.pow, whose last bit differs
 * from other JS engines, so two entries were re-pinned after proving every
 * serialized number agreed to within 3.6e-16.
 */
const STATIC_GOLDEN: Record<string, Record<string, string>> = {
  blank: {
    '0': '33ae45c5a7a443aa',
    '500': '33ae45c5a7a443aa',
    '1000': '33ae45c5a7a443aa',
    '6000': '33ae45c5a7a443aa',
  },
  'nova-mark': {
    '0': '27b2b6ac16e11c37',
    '500': '7d3714b2bfe433b2',
    '1000': '6004137521404239',
    '4600': '58298b4a1101e2c7',
  },
  'kinetic-type': {
    '0': 'f89b6ec355cffe7b',
    '500': 'b67a18169d1672aa',
    '1000': 'bfe8c796c663993d',
    '4200': 'c0239aaa5fae012c',
  },
  metrics: {
    '0': '35d9fc5f45b31f7f',
    '500': '0407eaf540aa45d3',
    '1000': '7f2004a87a538a24',
    '4000': '61014d1166b8e33e',
  },
  'lower-third': {
    '0': 'e9b22cccf4f701d9',
    '500': '26113ddbb224cf4a',
    '1000': '3ecabc38e40021c8',
    '3600': 'daf670dd121006da',
  },
  'sponsor-card': {
    '0': 'c5627ca73bebd996',
    '500': '4de2135ea300a039',
    '1000': 'a69052e9ee51b00a',
    '3500': 'a47203af6b299ccb',
  },
  'lower-third-overlay': {
    '0': '6b670db5de921080',
    '500': '51897d99f2c47368',
    '1000': '1287f884581dbf00',
    '4000': '6b670db5de921080',
  },
};

/** sha256(compileProjectToAnimatedSvg(project)).slice(0, 16) pre-rewiring. */
const ANIMATED_GOLDEN: Record<string, string> = {
  blank: 'bd2083f2b7114949',
  'nova-mark': '5b849f216dfb20a5',
  'kinetic-type': '4dbf8b16c550aa52',
  metrics: '00160763c137647c',
  'lower-third': '93288468dfc13477',
  'sponsor-card': 'b343d9e789903bb9',
  'lower-third-overlay': 'c10d6f683e671091',
};

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

function timesFor(project: { durationMs: number }): number[] {
  return [0, 500, 1000, project.durationMs];
}

interface FakeSvgNode {
  tagName: string;
  style: Record<string, string>;
  attributes: Record<string, string>;
  setAttribute(name: string, value: string): void;
  getAttribute(name: string): string | null;
  querySelector(): null;
  querySelectorAll(): never[];
}

function fakeNode(): FakeSvgNode {
  const attributes: Record<string, string> = {};
  return {
    tagName: 'g',
    style: {},
    attributes,
    setAttribute(name, value) {
      attributes[name] = value;
    },
    getAttribute(name) {
      return attributes[name] ?? null;
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
  };
}

describe('Static SVG export parity', () => {
  for (const template of COMPOSITION_TEMPLATES) {
    it(`keeps ${template.id} byte-identical at every golden time`, () => {
      const project = instantiateCompositionTemplate(template.id);
      const golden = STATIC_GOLDEN[template.id];

      for (const time of timesFor(project)) {
        expect(hash(staticSvgMarkup(project, time))).toBe(String(golden[time]));
      }
    });

    it(`serialises the sampled frame for ${template.id}`, () => {
      const project = instantiateCompositionTemplate(template.id);
      const document = migrateTraceDocument(project).project;

      for (const time of timesFor(project)) {
        const fromProject = staticSvgMarkup(project, time);
        const fromFrame = staticSvgMarkupFromFrame(
          sampleFrame(document, { timeMs: time }),
        );
        expect(fromProject).toBe(fromFrame);
      }
    });
  }

  it('drops a hidden group and its children from both paths', () => {
    const group: TraceElement = {
      id: 'group',
      name: 'Group',
      type: 'group',
      visible: true,
      locked: false,
      sceneId: null,
      origin: { x: 0, y: 0 },
      attributes: { x: 10, y: 20 },
      tracks: [],
      parentId: null,
      childrenIds: ['child'],
    };
    const child: TraceElement = {
      id: 'child',
      name: 'Child',
      type: 'rect',
      visible: true,
      locked: false,
      sceneId: null,
      origin: { x: 0, y: 0 },
      attributes: { x: 0, y: 0, width: 40, height: 20, fill: '#ffffff' },
      tracks: [],
      parentId: 'group',
      childrenIds: [],
    };
    const project = createBlankTraceDocument('Hidden', {
      elements: { group, child },
      rootElementIds: ['group'],
    });

    const visible = staticSvgMarkup(project, 0);
    expect(visible).toContain('id="trace-elem-group"');
    expect(visible).toContain('id="trace-elem-child"');

    stageOf(project).elements.group.visible = false;

    const markup = staticSvgMarkup(project, 0);
    expect(markup).not.toContain('id="trace-elem-group"');
    expect(markup).not.toContain('id="trace-elem-child"');
    expect(markup).toBe(
      staticSvgMarkupFromFrame(
        sampleFrame(migrateTraceDocument(project).project, { timeMs: 0 }),
      ),
    );
  });

  it('re-exports an in-place edit rather than a cached document', () => {
    const rect: TraceElement = {
      id: 'rect',
      name: 'Rect',
      type: 'rect',
      visible: true,
      locked: false,
      sceneId: null,
      origin: { x: 0, y: 0 },
      attributes: { x: 0, y: 0, width: 40, height: 20, fill: '#ffffff' },
      tracks: [],
      parentId: null,
      childrenIds: [],
    };
    const project = createBlankTraceDocument('Edit', {
      elements: { rect },
      rootElementIds: ['rect'],
    });

    expect(staticSvgMarkup(project, 0)).toContain('translate(0 0)');

    stageOf(project).elements.rect.attributes = {
      ...stageOf(project).elements.rect.attributes,
      x: 100,
      y: 50,
    };

    expect(staticSvgMarkup(project, 0)).toContain('translate(100 50)');
  });

  it('keeps gradient defs in the frame path', () => {
    const project = documentFromStage(
      createBlankTraceStage('Gradients', {
        gradients: {
        g1: {
          id: 'g1',
          type: 'linear',
          stops: [{ id: 's1', offset: 0, color: '#ffffff', opacity: 1 }],
          angle: 0,
          cx: 0.5,
          cy: 0.5,
          r: 0.5,
        },
        },
      }),
    );

    expect(staticSvgMarkup(project, 0)).toContain('linearGradient id="g1"');
  });

  it('honours the background and size options', () => {
    const project = instantiateCompositionTemplate('lower-third');
    const markup = staticSvgMarkup(project, 0, {
      background: '#000000',
      size: true,
    });

    expect(markup).toContain('width="1280" height="720"');
    expect(markup).toContain('fill="#000000"');
  });
});

describe('Animated SVG export parity', () => {
  for (const template of COMPOSITION_TEMPLATES) {
    it(`keeps ${template.id} byte-identical`, () => {
      const project = instantiateCompositionTemplate(template.id);
      expect(hash(compileProjectToAnimatedSvg(project))).toBe(
        ANIMATED_GOLDEN[template.id],
      );
    });
  }

  it('still emits SMIL animations for a keyframed template', () => {
    const project = instantiateCompositionTemplate('metrics');
    const svg = compileProjectToAnimatedSvg(project);

    expect(svg).toContain('<animate');
    expect(svg).toContain('repeatCount="indefinite"');
  });
});

describe('DOM backend parity', () => {
  it('writes the same transform and opacity as the legacy path', () => {
    const project = instantiateCompositionTemplate('sponsor-card');
    const document = migrateTraceDocument(project).project;
    const animated = Object.values(stageOf(project).elements).find(
      (element) => element.tracks.length > 0,
    );
    expect(animated).toBeDefined();
    if (!animated) throw new Error('Expected an animated element');

    const timeMs = 500;
    const frame = sampleFrame(document, { timeMs });
    const frameNode = fakeNode();
    const legacyNode = fakeNode();

    applyFrameElementToDom(
      frameNode as unknown as SVGElement,
      frame.elements[animated.id],
      timeMs,
    );
    applyElementAnimationAtTime(
      legacyNode as unknown as SVGElement,
      animated,
      timeMs,
    );

    expect(frameNode.style.transform).toBe(legacyNode.style.transform);
    expect(frameNode.style.opacity).toBe(legacyNode.style.opacity);
    expect(frameNode.attributes.opacity).toBe(legacyNode.attributes.opacity);
  });

  it('hides nothing by removing transform data for a static element', () => {
    const project = instantiateCompositionTemplate('lower-third');
    const document = migrateTraceDocument(project).project;
    const element = Object.values(stageOf(project).elements)[0];
    const node = fakeNode();

    applyFrameElementToDom(
      node as unknown as SVGElement,
      sampleFrame(document, { timeMs: 0 }).elements[element.id],
      0,
    );

    expect(node.style.transformBox).toBe('view-box');
    expect(node.style.transform).toContain('translate(');
  });
});
