import { applyOps } from '@/lib/trace/ops';
import { compileProjectToAnimatedSvg } from '@/lib/trace/export/animated-svg';
import { generateGsapCode } from '@/lib/trace/export/gsap-code';
import {
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
  it('gives every element type at least one animatable property', () => {
    const types = [
      'text',
      'rect',
      'path',
      'counter',
      'group',
      'kinetic-text',
      'bar-chart',
    ] as const;
    for (const type of types) {
      expect(getAnimatableProperties(type).length).toBeGreaterThan(0);
    }
  });

  it('exposes human labels for animated properties', () => {
    expect(TRACK_LABELS.opacity).toBe('Opacity');
    expect(TRACK_LABELS.trimEnd).toBe('Trim end');
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
