import type { TraceAssetFragment } from '@/lib/trace/assets/types';
import {
  assertValidTraceFragment,
  validateTraceFragment,
} from '@/lib/trace/assets/validate';
import type { TraceElement } from '@/lib/trace/types';

function rect(id: string, overrides: Partial<TraceElement> = {}): TraceElement {
  return {
    id,
    name: id,
    type: 'rect',
    visible: true,
    locked: false,
    attributes: {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      fill: '#0f172a',
    },
    origin: { x: 50, y: 50 },
    tracks: [],
    parentId: null,
    childrenIds: [],
    ...overrides,
  };
}

function fragment(
  elements: Record<string, TraceElement>,
  roots: string[],
  overrides: Partial<TraceAssetFragment> = {},
): TraceAssetFragment {
  return {
    width: 320,
    height: 180,
    elements,
    rootElementIds: roots,
    ...overrides,
  };
}

describe('Trace fragment validation', () => {
  it('accepts a valid fragment and reports truthful stats', () => {
    const result = validateTraceFragment(
      fragment(
        {
          base: rect('base', {
            attributes: {
              x: 0,
              y: 0,
              width: 320,
              height: 180,
              fill: 'url(#grad)',
            },
            tracks: [
              {
                id: 'base-opacity',
                property: 'opacity',
                label: 'Opacity',
                keyframes: [
                  { id: 'a', timeMs: 0, value: 0.4, easing: 'ease-out' },
                  { id: 'b', timeMs: 4000, value: 0.4, easing: 'ease-out' },
                ],
              },
            ],
          }),
        },
        ['base'],
        {
          gradients: {
            grad: {
              id: 'grad',
              type: 'linear',
              stops: [
                { id: 's1', offset: 0, color: '#0f172a', opacity: 1 },
                { id: 's2', offset: 1, color: '#38bdf8', opacity: 1 },
              ],
              angle: 90,
              cx: 0.5,
              cy: 0.5,
              r: 0.5,
            },
          },
        },
      ),
      { durationMs: 4000 },
    );

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.stats).toMatchObject({
      elements: 1,
      tracks: 1,
      keyframes: 2,
      gradients: 1,
    });
  });

  it('rejects id/key mismatches and missing type attributes', () => {
    const result = validateTraceFragment(
      fragment(
        {
          wrongKey: rect('different-id'),
          path: {
            ...rect('path'),
            type: 'path',
            attributes: { fill: '#fff' },
          },
        },
        ['wrongKey', 'path'],
      ),
    );

    expect(result.ok).toBe(false);
    expect(
      result.errors.some(
        (entry) => entry.code === 'FRAGMENT_ELEMENT_ID_MISMATCH',
      ),
    ).toBe(true);
    expect(
      result.errors.some(
        (entry) =>
          entry.code === 'FRAGMENT_MISSING_ATTRIBUTE' &&
          entry.elementId === 'path',
      ),
    ).toBe(true);
  });

  it('rejects unresolved paint references', () => {
    const result = validateTraceFragment(
      fragment(
        {
          base: rect('base', {
            attributes: {
              x: 0,
              y: 0,
              width: 100,
              height: 100,
              fill: 'url(#missing)',
            },
          }),
        },
        ['base'],
      ),
    );

    expect(result.ok).toBe(false);
    expect(
      result.errors.some(
        (entry) => entry.code === 'FRAGMENT_PAINT_UNRESOLVED',
      ),
    ).toBe(true);
  });

  it('rejects unsafe defs and malformed structured filters', () => {
    const unsafe = validateTraceFragment(
      fragment({ base: rect('base') }, ['base'], {
        defs: '<script>alert(1)</script>',
      }),
    );
    expect(unsafe.ok).toBe(false);
    expect(
      unsafe.errors.some((entry) => entry.code === 'FRAGMENT_DEFS_UNSAFE'),
    ).toBe(true);

    const badFilter = validateTraceFragment(
      fragment({ base: rect('base') }, ['base'], {
        filters: {
          glow: {
            id: 'glow',
            label: 'Glow',
            kind: 'glow',
            primitives: [],
          },
        },
      }),
    );
    expect(badFilter.ok).toBe(false);
    expect(
      badFilter.errors.some(
        (entry) => entry.code === 'FRAGMENT_FILTER_INVALID',
      ),
    ).toBe(true);
  });

  it('enforces element and keyframe budgets', () => {
    const result = validateTraceFragment(
      fragment(
        {
          base: rect('base', {
            tracks: [
              {
                id: 'opacity',
                property: 'opacity',
                label: 'Opacity',
                keyframes: Array.from({ length: 6 }, (_, index) => ({
                  id: `k${index}`,
                  timeMs: index * 100,
                  value: 1,
                  easing: 'ease-out' as const,
                })),
              },
            ],
          }),
        },
        ['base'],
      ),
      { maxKeyframesPerTrack: 4 },
    );

    expect(result.ok).toBe(false);
    expect(
      result.errors.some((entry) => entry.code === 'FRAGMENT_BUDGET_EXCEEDED'),
    ).toBe(true);
  });

  it('flags elements unreachable from a root', () => {
    const result = validateTraceFragment(
      fragment(
        {
          base: rect('base'),
          stray: rect('stray'),
        },
        ['base'],
      ),
    );

    expect(result.ok).toBe(true);
    expect(
      result.warnings.some(
        (entry) => entry.code === 'FRAGMENT_ORPHAN_ELEMENT',
      ),
    ).toBe(true);
  });

  it('throws a compact summary for invalid fragments', () => {
    expect(() =>
      assertValidTraceFragment(
        fragment(
          {
            bad: {
              ...rect('bad'),
              type: 'path',
              attributes: { fill: '#fff' },
            },
          },
          ['bad'],
        ),
      ),
    ).toThrow(/failed validation/);
  });
});