import {
  TRACE_BLOCKS,
  blockDefaults,
  blockPreviewSvg,
  getBlock,
  instantiateBlock,
  searchBlocks,
} from '@/lib/trace/blocks';
import {
  SURFACES_ADDON,
  SURFACE_BLOCKS,
  TRACE_ADDONS,
  getTraceAddon,
} from '@/lib/trace/addons';
import { validateTraceFragment } from '@/lib/trace/assets/validate';
import { toTraceProject } from '@/lib/trace/assets/types';
import { staticSvgMarkup } from '@/lib/trace/serialize/svg-markup';
import { applyOps } from '@/lib/trace/ops';
import type { TraceProject } from '@/lib/trace/types';

function idFactory() {
  let counter = 0;
  return (prefix: string) => `${prefix}-${++counter}`;
}

function emptyProject(): TraceProject {
  return {
    id: 'surfaces-test',
    name: 'Surfaces test',
    width: 1280,
    height: 720,
    durationMs: 4000,
    fps: 60,
    elements: {},
    rootElementIds: [],
  };
}

describe('Trace Surfaces add-on', () => {
  it('registers eighteen surface blocks in the shared catalogue', () => {
    expect(TRACE_ADDONS.map((addon) => addon.id)).toContain('surfaces');
    expect(SURFACE_BLOCKS).toHaveLength(18);
    for (const block of SURFACE_BLOCKS) {
      expect(block.addonId).toBe('surfaces');
      expect(block.category).toBe('Backgrounds');
      expect(block.layer).toBe('background');
      expect(TRACE_BLOCKS).toContain(block);
    }
    expect(getTraceAddon('surfaces')).toBe(SURFACES_ADDON);
    expect(searchBlocks('background').length).toBeGreaterThanOrEqual(18);
  });

  it('builds every surface into a valid, insertable fragment', () => {
    for (const block of SURFACE_BLOCKS) {
      const { fragment } = instantiateBlock(block.id, {}, {
        canvas: { width: 1280, height: 720 },
        idFactory: idFactory(),
      });

      const validation = validateTraceFragment(fragment, {
        durationMs: 4000,
      });
      expect({ block: block.id, errors: validation.errors }).toEqual({
        block: block.id,
        errors: [],
      });

      const result = applyOps(emptyProject(), [
        {
          type: 'insertFragment',
          fragment,
          sceneId: null,
          position: 'back',
          suffix: 'surface',
        },
      ]);
      expect({ block: block.id, ok: result.ok }).toEqual({
        block: block.id,
        ok: true,
      });
      expect(result.project.rootElementIds[0]).toContain('surface');
      expect(Object.keys(result.project.elements).length).toBeGreaterThan(3);
    }
  });

  it('produces animated tracks on every surface', () => {
    for (const block of SURFACE_BLOCKS) {
      const { fragment } = instantiateBlock(block.id, {}, {
        canvas: { width: 1280, height: 720 },
        idFactory: idFactory(),
      });
      const tracks = Object.values(fragment.elements).flatMap(
        (element) => element.tracks,
      );
      expect({ block: block.id, animated: tracks.length > 0 }).toEqual({
        block: block.id,
        animated: true,
      });
    }
  });

  it('serialises structured gradients and filters into the SVG defs', () => {
    const auroraPreview = blockPreviewSvg(getBlock('surface-aurora')!);
    expect(auroraPreview).toContain('feGaussianBlur');
    expect(auroraPreview).toContain('radialGradient');
    expect(blockPreviewSvg(getBlock('surface-grain')!)).toContain('feTurbulence');

    const aurora = instantiateBlock('surface-aurora', {}, {
      canvas: { width: 1280, height: 720 },
      idFactory: idFactory(),
    }).fragment;
    const auroraSvg = staticSvgMarkup(
      toTraceProject(aurora, 'Aurora', 4000),
      0,
    );
    expect(auroraSvg).toContain('linearGradient');
    expect(auroraSvg).toContain('radialGradient');
    expect(auroraSvg).toContain('feGaussianBlur');

    const grain = instantiateBlock('surface-grain', {}, {
      canvas: { width: 1280, height: 720 },
      idFactory: idFactory(),
    }).fragment;
    const grainSvg = staticSvgMarkup(toTraceProject(grain, 'Grain', 4000), 0);
    expect(grainSvg).toContain('feTurbulence');
    expect(grainSvg).toContain('feColorMatrix');
    expect(grainSvg).toContain('filter="url(#');
  });

  it('honours surface options (colours and density)', () => {
    const bauhaus = instantiateBlock(
      'surface-bauhaus',
      { baseColor: '#ffffff', accentColor: '#ff0000', density: 6 },
      { canvas: { width: 1280, height: 720 }, idFactory: idFactory() },
    ).fragment;
    expect(
      Object.values(bauhaus.elements).some(
        (element) => element.attributes.fill === '#ffffff',
      ),
    ).toBe(true);
    expect(
      Object.values(bauhaus.elements).filter(
        (element) => element.name.startsWith('Disc') || element.name.startsWith('Ring'),
      ).length,
    ).toBeGreaterThan(0);

    const halftone = instantiateBlock(
      'surface-halftone',
      { spacing: 96 },
      { canvas: { width: 1280, height: 720 }, idFactory: idFactory() },
    ).fragment;
    const dots = Object.values(halftone.elements).filter(
      (element) => element.type === 'circle',
    );
    expect(dots.length).toBeLessThan(200);
    expect(dots.length).toBeGreaterThan(40);
  });

  it('keeps every surface within the element budget at defaults', () => {
    for (const block of SURFACE_BLOCKS) {
      const { fragment } = instantiateBlock(block.id, blockDefaults(block), {
        canvas: { width: 1280, height: 720 },
        idFactory: idFactory(),
      });
      expect({
        block: block.id,
        withinBudget: Object.keys(fragment.elements).length <= 600,
      }).toEqual({ block: block.id, withinBudget: true });
    }
  });

  it('is deterministic for seeded geometry', () => {
    const build = () =>
      instantiateBlock('surface-starfield', { count: 40 }, {
        canvas: { width: 1280, height: 720 },
        idFactory: idFactory(),
      }).fragment;
    const first = build();
    const second = build();
    const coordinates = (fragment: typeof first) =>
      Object.values(fragment.elements)
        .map((element) => [
          element.type,
          element.attributes.x,
          element.attributes.y,
          element.attributes.width,
        ])
        .slice(1);
    expect(coordinates(first)).toEqual(coordinates(second));
  });

  it('exposes the generator capability on the add-on', () => {
    expect(getBlock('surface-aurora')).toBeDefined();
    expect(SURFACES_ADDON.generator?.toolName).toBe('generateSurface');
    expect(SURFACES_ADDON.guidance).toContain('generateSurface');
  });
});