import { translateSvgPath } from '@/lib/trace/parser/path-transformer';
import { parseSvgToFragment } from '@/lib/trace/parser/svg-importer';
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
});