import { getValueAtTime } from '@/lib/trace/animation/interpolator';
import { createBlankTraceProject } from '@/lib/trace/defaults';
import { generateGsapCode } from '@/lib/trace/export/gsap-code';
import { applyOps } from '@/lib/trace/ops';
import type { RecipeId } from '@/lib/trace/recipes';
import {
  estimateRecipeSize,
  expandRecipe,
  sanitizeRecipeOptions,
} from '@/lib/trace/recipes';

function idFactory() {
  let index = 0;
  return (prefix: string) => `${prefix}-${index++}`;
}

describe('Trace recipes', () => {
  it('keeps counter values discrete instead of typing between keyframes', () => {
    const { children } = expandRecipe(
      'counter',
      { startVal: 0, endVal: 50, prefix: '$' },
      idFactory(),
    );
    const track = children[0].tracks.find((entry) => entry.property === 'text');
    expect(track).toBeDefined();
    expect(track!.discrete).toBe(true);

    const [first, second] = track!.keyframes;
    expect(getValueAtTime(track!, first.timeMs)).toBe(first.value);
    expect(getValueAtTime(track!, (first.timeMs + second.timeMs) / 2)).toBe(
      first.value,
    );
    expect(getValueAtTime(track!, second.timeMs)).toBe(second.value);
    expect(getValueAtTime(track!, Number.MAX_SAFE_INTEGER)).toBe('$50');

    for (const keyframe of track!.keyframes) {
      const value = getValueAtTime(track!, keyframe.timeMs);
      expect(String(value)).not.toBe('');
      expect(String(value).startsWith('$')).toBe(true);
    }
  });

  it('draws the progress ring with a circumference that matches its radius', () => {
    const { root, children } = expandRecipe(
      'progress-ring',
      { radius: 50, thickness: 8, progress: 75 },
      idFactory(),
    );
    const indicator = children.find((child) => child.name === 'Ring Indicator');
    expect(indicator).toBeDefined();

    // The circle body derives `r` from width / 2, so the dash circumference
    // must be built from the same box or the ring can never close.
    expect(indicator!.attributes.width).toBe(100);
    expect(indicator!.attributes.height).toBe(100);
    expect(Number(indicator!.attributes.strokeDasharray)).toBeCloseTo(
      2 * Math.PI * 50,
      6,
    );
    expect(Number(indicator!.attributes.strokeDasharray)).toBeCloseTo(
      2 * Math.PI * (indicator!.attributes.width / 2),
      6,
    );

    const finalOffset = Number(indicator!.tracks[0].keyframes.at(-1)!.value);
    const visible = 1 - finalOffset / (2 * Math.PI * 50);
    expect(visible).toBeCloseTo(0.75, 6);
    expect(root.attributes.width).toBe(108);
  });

  it('pivots every recipe group around its local centre, not the canvas position', () => {
    const recipes: RecipeId[] = [
      'lower-third',
      'progress-ring',
      'bar-chart',
      'kinetic-text',
      'counter',
    ];

    for (const recipeId of recipes) {
      const { root } = expandRecipe(
        recipeId,
        {
          x: 300,
          y: 200,
          ...(recipeId === 'kinetic-text' ? { text: 'HELLO' } : {}),
        },
        idFactory(),
      );

      expect(root.origin.x).toBeCloseTo(Number(root.attributes.width) / 2, 6);
      expect(root.origin.y).toBeCloseTo(Number(root.attributes.height) / 2, 6);
      expect(root.origin).not.toEqual({ x: 300, y: 200 });
    }
  });

  it('grows horizontal bars without a dead position track', () => {
    const bars = [{ id: 'a', label: 'A', value: 50 }];
    const horizontal = expandRecipe(
      'bar-chart',
      { orientation: 'horizontal', bars },
      idFactory(),
    );
    const horizontalBar = horizontal.children.find(
      (child) => child.name === 'Bar A',
    );
    const horizontalProps = horizontalBar!.tracks.map(
      (track) => track.property,
    );
    expect(horizontalProps).toContain('width');
    expect(horizontalProps).not.toContain('x');
    expect(horizontalProps).not.toContain('y');

    const vertical = expandRecipe(
      'bar-chart',
      { orientation: 'vertical', bars },
      idFactory(),
    );
    const verticalBar = vertical.children.find(
      (child) => child.name === 'Bar A',
    );
    expect(verticalBar!.tracks.map((track) => track.property).sort()).toEqual([
      'height',
      'y',
    ]);
  });

  it('sanitises setup-dialog values into compiler-safe options', () => {
    expect(
      sanitizeRecipeOptions('counter', {
        endVal: 10_000_000,
        decimals: 9,
        prefix: '  $ ',
      }),
    ).toMatchObject({
      endVal: 1_000_000,
      decimals: 3,
      prefix: '$',
    });

    expect(
      sanitizeRecipeOptions('bar-chart', {
        orientation: 'diagonal',
        bars: [
          { label: 'A', value: 5 },
          { label: '', value: 0 },
        ],
      }),
    ).toMatchObject({
      orientation: 'vertical',
      bars: [{ label: 'A', value: 5, color: '#38bdf8' }],
    });
  });

  it('estimates recipe size for centring on the canvas', () => {
    expect(estimateRecipeSize('lower-third')).toEqual({
      width: 460,
      height: 64,
    });
    expect(
      estimateRecipeSize('progress-ring', { radius: 50, thickness: 8 }),
    ).toEqual({ width: 108, height: 108 });
  });

  it('preserves a discrete track when the store rewrites its keyframes', () => {
    const applied = applyOps(createBlankTraceProject('Recipe'), [
      { type: 'applyRecipe', recipeId: 'counter', options: { endVal: 10 } },
    ]);
    expect(applied.ok).toBe(true);

    const root = applied.project.elements[applied.recipeRootIds[0]];
    const valueId = root.childrenIds![0];
    const track = applied.project.elements[valueId].tracks[0];

    const updated = applyOps(applied.project, [
      {
        type: 'setTrack',
        elementId: valueId,
        property: 'text',
        trackId: track.id,
        keyframes: track.keyframes.map((keyframe) => ({ ...keyframe })),
      },
    ]);

    expect(updated.ok).toBe(true);
    expect(updated.project.elements[valueId].tracks[0].discrete).toBe(true);
  });

  it('exports discrete text tracks as GSAP sets, not text tweens', () => {
    const project = applyOps(createBlankTraceProject('Recipe'), [
      { type: 'applyRecipe', recipeId: 'counter', options: { endVal: 10 } },
    ]).project;
    const code = generateGsapCode(project, { format: 'vanilla' });
    const textLines = code
      .split('\n')
      .filter((line) => line.includes('text: { value:'));

    expect(textLines.length).toBeGreaterThan(1);
    for (const line of textLines) {
      expect(line).toContain('tl.set(');
    }
  });
});
