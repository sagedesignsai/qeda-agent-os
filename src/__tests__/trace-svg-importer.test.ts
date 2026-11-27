import { translateSvgPath } from '@/lib/trace/parser/path-transformer';
import {
  parseSvgToFragment,
  parseSvgToFragmentDetailed,
} from '@/lib/trace/parser/svg-importer';
import { parsePathData } from '@/lib/trace/path/model';
import { validateTraceFragment } from '@/lib/trace/assets/validate';
import type { TraceElement } from '@/lib/trace/types';

function elementsOfType(type: TraceElement['type']): TraceElement[] {
  const fragment = parseSvgToFragment(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">
      <circle cx="60" cy="40" r="20" fill="#f00" />
      <ellipse cx="150" cy="60" rx="30" ry="10" fill="#0f0" />
      <rect x="10" y="20" width="30" height="40" fill="#00f" />
      <text x="30" y="50" font-size="12">Label</text>
    </svg>`,
  );
  return fragment.rootElementIds.map((id) => fragment.elements[id]).filter((element) => element.type === type);
}

describe('Trace SVG importer', () => {
  it('converts circle and ellipse geometry to the renderer box model', () => {
    const [circle] = elementsOfType('circle');
    expect(circle.attributes).toMatchObject({
      x: 40,
      y: 20,
      width: 40,
      height: 40,
    });
    expect(circle.origin).toEqual({ x: 20, y: 20 });

    const [ellipse] = elementsOfType('ellipse');
    expect(ellipse.attributes).toMatchObject({
      x: 120,
      y: 50,
      width: 60,
      height: 20,
      rx: 30,
      ry: 10,
    });
    expect(ellipse.origin).toEqual({ x: 30, y: 10 });
  });

  it('uses local transform origins for base-positioned rects and text', () => {
    const [rect] = elementsOfType('rect');
    expect(rect.attributes).toMatchObject({ baseX: 10, baseY: 20 });
    expect(rect.origin).toEqual({ x: 15, y: 20 });

    const [text] = elementsOfType('text');
    expect(text.attributes).toMatchObject({ baseX: 30, baseY: 50 });
    expect(text.origin).toEqual({ x: 0, y: 0 });
  });

  it('only synthesises dash data for solid stroked paths', () => {
    const fragment = parseSvgToFragment(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <path d="M 0 0 L 100 0" fill="#fff" />
        <path d="M 0 10 L 100 10" stroke="#000" />
        <path d="M 0 20 L 100 20" stroke="#000" stroke-dasharray="5 3" />
      </svg>`,
    );
    const [fillOnly, solid, dashed] = fragment.rootElementIds.map(
      (id) => fragment.elements[id],
    );

    expect(fillOnly.attributes.strokeDasharray).toBeUndefined();
    expect(solid.attributes.strokeDasharray).toBe('500 500');
    expect(dashed.attributes.strokeDasharray).toBe('5 3');
  });

  it('translates arc endpoints without moving radii or flags', () => {
    expect(translateSvgPath('M 0 0 A 10 10 0 0 1 20 20', 5, 7)).toBe(
      'M 5 7 A 10 10 0 0 1 25 27',
    );
  });

  it('bakes translate, rotate and scale transforms into paths', () => {
    const fragment = parseSvgToFragment(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <path d="M 0 0 L 10 0" transform="translate(50 20) rotate(90)" />
        <rect x="10" y="20" width="30" height="40" transform="scale(2)" />
      </svg>`,
    );
    const [rotated, scaled] = fragment.rootElementIds.map(
      (id) => fragment.elements[id],
    );

    const rotatedModel = parsePathData(rotated.attributes.d);
    expect(rotatedModel.subpaths[0].nodes[0].point).toMatchObject({
      x: 50,
      y: 20,
    });
    const rotatedEnd = rotatedModel.subpaths[0].nodes[1].point;
    expect(rotatedEnd.x).toBeCloseTo(50, 4);
    expect(rotatedEnd.y).toBeCloseTo(30, 4);

    expect(scaled.type).toBe('path');
    const scaledModel = parsePathData(scaled.attributes.d);
    const xs = scaledModel.subpaths.flatMap((subpath) =>
      subpath.nodes.map((node) => node.point.x),
    );
    const ys = scaledModel.subpaths.flatMap((subpath) =>
      subpath.nodes.map((node) => node.point.y),
    );
    expect(Math.min(...xs)).toBeCloseTo(20, 2);
    expect(Math.max(...xs)).toBeCloseTo(80, 2);
    expect(Math.min(...ys)).toBeCloseTo(40, 2);
    expect(Math.max(...ys)).toBeCloseTo(120, 2);
  });

  it('keeps native circles under similarity transforms and scales them', () => {
    const fragment = parseSvgToFragment(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">
        <circle cx="10" cy="10" r="5" transform="translate(100 50)" />
        <circle cx="10" cy="10" r="5" transform="scale(3)" />
      </svg>`,
    );
    const [translated, scaled] = fragment.rootElementIds.map(
      (id) => fragment.elements[id],
    );

    expect(translated.type).toBe('circle');
    expect(translated.attributes).toMatchObject({
      x: 105,
      y: 55,
      width: 10,
      height: 10,
    });
    expect(scaled.type).toBe('circle');
    expect(scaled.attributes).toMatchObject({
      x: 15,
      y: 15,
      width: 30,
      height: 30,
    });
  });

  it('resolves use references into ordinary layers', () => {
    const { fragment, report } = parseSvgToFragmentDetailed(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <defs>
          <g id="dot"><circle cx="0" cy="0" r="4" fill="#fff" /></g>
        </defs>
        <use href="#dot" x="20" y="30" />
        <use href="#dot" x="60" y="30" />
      </svg>`,
    );

    expect(report.expandedUses).toBe(2);
    const circles = Object.values(fragment.elements).filter(
      (element) => element.type === 'circle',
    );
    expect(circles).toHaveLength(2);
    const centres = circles
      .map((circle) => ({
        x: Number(circle.attributes.x) + Number(circle.attributes.width) / 2,
        y: Number(circle.attributes.y) + Number(circle.attributes.height) / 2,
      }))
      .sort((a, b) => a.x - b.x);
    expect(centres[0]).toMatchObject({ x: 20, y: 30 });
    expect(centres[1]).toMatchObject({ x: 60, y: 30 });
  });

  it('reports dropped SMIL, images and unsupported attributes', () => {
    const { report } = parseSvgToFragmentDetailed(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="20" clip-path="url(#clip)">
          <animate attributeName="opacity" values="0;1" dur="1s" />
        </circle>
        <image href="data:image/png;base64,AAAA" width="10" height="10" />
      </svg>`,
    );

    expect(report.droppedTags.animate).toBe(1);
    expect(report.droppedTags.image).toBe(1);
    expect(report.droppedAttributes['clip-path']).toBe(1);
    expect(report.warnings.some((entry) => /Unsupported SVG elements/.test(entry))).toBe(
      true,
    );
    expect(report.elementCount).toBe(1);
  });

  it('imports text transforms as rotation and scale', () => {
    const fragment = parseSvgToFragment(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
        <text x="10" y="20" font-size="10" transform="translate(50 60) rotate(30) scale(2)">Hi</text>
      </svg>`,
    );
    const text = fragment.elements[fragment.rootElementIds[0]];
    expect(text.attributes.baseX).toBeCloseTo(47.32, 1);
    expect(text.attributes.baseY).toBeCloseTo(104.64, 1);
    expect(text.attributes.fontSize).toBe(20);
    expect(text.attributes.rotation).toBeCloseTo(30, 1);
  });

  it('produces fragments that pass the insertion validator', () => {
    const { fragment } = parseSvgToFragmentDetailed(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180">
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#0f172a" />
            <stop offset="100%" stop-color="#38bdf8" />
          </linearGradient>
        </defs>
        <rect width="320" height="180" fill="url(#sky)" />
        <g transform="translate(160 90)">
          <circle cx="0" cy="0" r="40" fill="none" stroke="#fff" stroke-width="2" />
          <path d="M -60 0 L 60 0" stroke="#fff" />
        </g>
      </svg>`,
    );

    const result = validateTraceFragment(fragment, { durationMs: 4000 });
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });
});