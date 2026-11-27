import {
  TRACE_BLOCKS,
  blockDefaults,
  instantiateBlock,
  searchBlocks,
} from '@/lib/trace/blocks';
import {
  TYPOGRAPHY_ADDON,
  TYPOGRAPHY_BLOCKS,
  TRACE_ADDONS,
  getTraceAddon,
} from '@/lib/trace/addons';
import { validateTraceFragment } from '@/lib/trace/assets/validate';
import { applyOps } from '@/lib/trace/ops';
import type { TraceProject } from '@/lib/trace/types';

function idFactory() {
  let counter = 0;
  return (prefix: string) => `${prefix}-${++counter}`;
}

function emptyProject(): TraceProject {
  return {
    id: 'typography-test',
    name: 'Typography test',
    width: 1280,
    height: 720,
    durationMs: 4000,
    fps: 60,
    elements: {},
    rootElementIds: [],
  };
}

describe('Trace Typography add-on', () => {
  it('registers six text blocks in the shared catalogue', () => {
    expect(TRACE_ADDONS.map((addon) => addon.id)).toContain('typography');
    expect(TYPOGRAPHY_BLOCKS).toHaveLength(6);
    for (const block of TYPOGRAPHY_BLOCKS) {
      expect(block.addonId).toBe('typography');
      expect(block.category).toBe('Titles');
      expect(TRACE_BLOCKS).toContain(block);
    }
    expect(getTraceAddon('typography')).toBe(TYPOGRAPHY_ADDON);
    expect(searchBlocks('caption').map((block) => block.id)).toContain(
      'text-caption',
    );
    expect(searchBlocks('credits').map((block) => block.id)).toContain(
      'text-credits',
    );
  });

  it('builds every text block into a valid, insertable fragment', () => {
    for (const block of TYPOGRAPHY_BLOCKS) {
      const { fragment } = instantiateBlock(block.id, {}, {
        canvas: { width: 1280, height: 720 },
        idFactory: idFactory(),
      });

      const validation = validateTraceFragment(fragment, { durationMs: 4000 });
      expect({ block: block.id, errors: validation.errors }).toEqual({
        block: block.id,
        errors: [],
      });

      const result = applyOps(emptyProject(), [
        {
          type: 'insertFragment',
          fragment,
          sceneId: null,
          suffix: 'type',
        },
      ]);
      expect({ block: block.id, ok: result.ok }).toEqual({
        block: block.id,
        ok: true,
      });
    }
  });

  it('keeps text as editable text layers with tracks', () => {
    for (const block of TYPOGRAPHY_BLOCKS) {
      const { fragment } = instantiateBlock(block.id, blockDefaults(block), {
        canvas: { width: 1280, height: 720 },
        idFactory: idFactory(),
      });
      const texts = Object.values(fragment.elements).filter(
        (element) => element.type === 'text',
      );
      expect({ block: block.id, hasText: texts.length > 0 }).toEqual({
        block: block.id,
        hasText: true,
      });
      expect(
        Object.values(fragment.elements).some(
          (element) => element.tracks.length > 0,
        ),
      ).toBe(true);
    }
  });

  it('honours caption copy and speaker options', () => {
    const { fragment } = instantiateBlock(
      'text-caption',
      { text: 'Ship the thing.', speaker: 'NOAH VALE' },
      { canvas: { width: 1280, height: 720 }, idFactory: idFactory() },
    );
    const texts = Object.values(fragment.elements).filter(
      (element) => element.type === 'text',
    );
    expect(texts.some((element) => element.attributes.text === 'Ship the thing.')).toBe(
      true,
    );
    expect(texts.some((element) => element.attributes.text === 'NOAH VALE')).toBe(
      true,
    );
  });

  it('types with a discrete text track and a following cursor', () => {
    const { fragment } = instantiateBlock(
      'text-typewriter',
      { text: 'deploy --now', prefix: '>' },
      { canvas: { width: 1280, height: 720 }, idFactory: idFactory() },
    );
    const typed = Object.values(fragment.elements).find(
      (element) => element.name === 'Typed line',
    )!;
    const textTrack = typed.tracks.find((entry) => entry.property === 'text')!;
    expect(textTrack.discrete).toBe(true);
    expect(textTrack.keyframes.at(-1)?.value).toBe('deploy --now');

    const cursor = Object.values(fragment.elements).find(
      (element) => element.name === 'Cursor',
    )!;
    const cursorTrack = cursor.tracks.find((entry) => entry.property === 'x');
    expect(cursorTrack).toBeDefined();
    expect(cursorTrack!.keyframes).toHaveLength(textTrack.keyframes.length);
  });

  it('rolls credits from below the frame to above it', () => {
    const { fragment } = instantiateBlock('text-credits', {}, {
      canvas: { width: 1280, height: 720 },
      idFactory: idFactory(),
    });
    const root = fragment.elements[fragment.rootElementIds[0]];
    const yTrack = root.tracks.find((entry) => entry.property === 'y')!;
    expect(Number(root.attributes.y)).toBe(0);
    expect(Number(yTrack.keyframes[0].value)).toBe(720);
    expect(Number(yTrack.keyframes.at(-1)?.value)).toBeLessThan(0);
    expect(
      Number(yTrack.keyframes[0].value) - Number(yTrack.keyframes.at(-1)?.value),
    ).toBeGreaterThan(720);
  });

  it('caps agenda items and staggers their reveals', () => {
    const { fragment } = instantiateBlock(
      'text-agenda',
      { items: 'One\nTwo\nThree\nFour\nFive\nSix\nSeven' },
      { canvas: { width: 1280, height: 720 }, idFactory: idFactory() },
    );
    const rows = Object.values(fragment.elements).filter((element) =>
      element.name.startsWith('Row '),
    );
    expect(rows).toHaveLength(6);
    expect(rows.every((row) => row.tracks.length >= 2)).toBe(true);
  });
});