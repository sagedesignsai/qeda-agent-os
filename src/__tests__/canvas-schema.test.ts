/**
 * __tests__/canvas-schema.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The document model's own guarantees: what it accepts, and — more importantly
 * — what it refuses.
 *
 * A validation test is only worth writing when the rejection is a decision
 * someone made deliberately. So each `rejects …` case below names the reason in
 * its title. If you find yourself deleting one of these to make a draft
 * document load, read the title first: the schema is the thing keeping an
 * under-specified document from becoming a document nobody can render.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  CanvasGroupSchema,
  CanvasNodeSchema,
  DocSchema,
  PRESETS,
  PRESET_SLUGS,
  type Doc,
} from '@/lib/canvas';
import { normalizeDoc } from '@/lib/canvas';

const ok = (r: { success: boolean }) => r.success;

// ─────────────────────────────────────────────────────────────────────────────
// A minimal valid document
// ─────────────────────────────────────────────────────────────────────────────

const textNode = {
  id: 'n1',
  kind: 'text',
  x: 10,
  y: 20,
  w: 300,
  content: 'Hello',
  fontSize: 32,
  fontWeight: 700,
  color: '#112233',
};

const minimal: unknown = {
  id: 'd1',
  name: 'Minimal',
  width: 400,
  height: 200,
  background: 'surface',
  pages: [
    {
      id: 'p1',
      nodes: [textNode],
      groups: [],
    },
  ],
};

describe('minimal valid document', () => {
  it('parses a document with one text node and nothing optional', () => {
    const doc = DocSchema.parse(minimal);
    expect(doc.width).toBe(400);
    expect(doc.pages).toHaveLength(1);
    expect(doc.pages[0]?.nodes[0]?.kind).toBe('text');
  });

  it('fills defaults for locked and visible', () => {
    const node = DocSchema.parse(minimal).pages[0]?.nodes[0];
    expect(node?.locked).toBe(false);
    expect(node?.visible).toBe(true);
  });

  it('rejects a document with no pages', () => {
    const doc = minimal as Doc;
    expect(ok(DocSchema.safeParse({ ...doc, pages: [] }))).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tokens and colours
// ─────────────────────────────────────────────────────────────────────────────

describe('colour and token validation', () => {
  it('rejects an unknown token name', () => {
    // A token is a closed enum, so a typo is a hard error rather than a colour
    // that silently renders as `var(--nonexistent)` and falls back to nothing.
    const r = DocSchema.safeParse({
      ...(minimal as Doc),
      background: 'not-a-real-token',
    });
    expect(ok(r)).toBe(false);
  });

  it('compiles a known token name to a var() reference', () => {
    const doc = DocSchema.parse({
      ...(minimal as Doc),
      background: 'accent',
    });
    expect(doc.background).toBe('var(--accent)');
  });

  it('accepts a hex colour literal unchanged', () => {
    const doc = DocSchema.parse({
      ...(minimal as Doc),
      background: '#ff00aa',
    });
    expect(doc.background).toBe('#ff00aa');
  });

  it('rejects a colour literal containing a url() or a declaration break', () => {
    // The colour allow-list is what stops a colour from injecting CSS. If this
    // ever passes, the `style` attribute is no longer trustworthy.
    for (const bad of [
      'url(http://evil.example/x.png)',
      '#fff; background:red',
      'red}',
      'expression(alert(1))',
    ]) {
      expect(
        ok(DocSchema.safeParse({ ...(minimal as Doc), background: bad })),
      ).toBe(false);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The closed node union
// ─────────────────────────────────────────────────────────────────────────────

describe('node kind union', () => {
  it('rejects an unknown node kind', () => {
    // A fourth kind would be a schema change with a migration attached. An
    // unknown kind must not degrade into "some node".
    expect(ok(CanvasNodeSchema.safeParse({ ...textNode, kind: 'video' }))).toBe(
      false,
    );
  });

  it('rejects a node with no kind at all', () => {
    const noKind: Record<string, unknown> = { ...textNode };
    delete noKind['kind'];
    expect(ok(CanvasNodeSchema.safeParse(noKind))).toBe(false);
  });

  it('accepts exactly the three frozen kinds', () => {
    for (const kind of ['text', 'shape', 'image'] as const) {
      const base = {
        id: `k-${kind}`,
        x: 0,
        y: 0,
        w: 10,
        h: 10,
        kind,
      };
      const node =
        kind === 'text'
          ? {
              ...base,
              content: 'x',
              fontSize: 12,
              fontWeight: 400,
              color: '#000',
            }
          : kind === 'shape'
            ? { ...base, shape: 'rect', fill: '#000' }
            : { ...base, src: { kind: 'asset', assetId: 'a' } };
      expect(ok(CanvasNodeSchema.safeParse(node))).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// THE RESERVATION: a Group has no box
// ─────────────────────────────────────────────────────────────────────────────

describe('Group geometry is derived, never stored', () => {
  it.each(['x', 'y', 'w', 'h'])('rejects %s on a Group', (key) => {
    // The most important test in this file. A stored box is a second source
    // of truth for a value that is already derivable from the members, and
    // the group→node migration (P4) would inherit every disagreement between
    // the two copies. So these keys are not merely undocumented — they are
    // rejected.
    const r = CanvasGroupSchema.safeParse({
      id: 'g1',
      rotate: 15,
      [key]: 100,
    });
    expect(ok(r)).toBe(false);
  });

  it('accepts a group with only the frozen fields', () => {
    const g = CanvasGroupSchema.parse({
      id: 'g1',
      label: 'Disc',
      rotate: -12,
      scale: 1.1,
    });
    expect(g.rotate).toBe(-12);
    expect(g.scale).toBe(1.1);
  });

  it('rejects a non-positive scale', () => {
    // A zero or negative scale is a singular transform: it collapses or mirrors
    // the page and cannot be inverted by dragging. There is no use for it.
    expect(ok(CanvasGroupSchema.safeParse({ id: 'g1', scale: 0 }))).toBe(false);
    expect(ok(CanvasGroupSchema.safeParse({ id: 'g1', scale: -1 }))).toBe(
      false,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// `h`: required for shape/image, optional for text
// ─────────────────────────────────────────────────────────────────────────────

describe('height is required for shapes and images, optional for text', () => {
  const shape = {
    id: 's1',
    kind: 'shape',
    shape: 'rect',
    x: 0,
    y: 0,
    w: 50,
    fill: '#000',
  };
  const image = {
    id: 'i1',
    kind: 'image',
    x: 0,
    y: 0,
    w: 50,
    src: { kind: 'asset', assetId: 'a1' },
  };

  it('rejects a shape with no h', () => {
    expect(ok(CanvasNodeSchema.safeParse(shape))).toBe(false);
  });

  it('rejects an image with no h', () => {
    expect(ok(CanvasNodeSchema.safeParse(image))).toBe(false);
  });

  it('accepts a text node with no h', () => {
    // "As tall as the content needs" is a statement about intent, and it is
    // the whole reason this model can be un-measured. See style.ts.
    const r = CanvasNodeSchema.safeParse(textNode);
    expect(ok(r)).toBe(true);
    expect(r.success && r.data.h).toBeUndefined();
  });

  it('keeps an explicit h on a text node', () => {
    const node = CanvasNodeSchema.parse({ ...textNode, h: 80 });
    expect(node.h).toBe(80);
  });

  it('rejects a negative h', () => {
    expect(ok(CanvasNodeSchema.safeParse({ ...shape, h: -1 }))).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Numbers
// ─────────────────────────────────────────────────────────────────────────────

describe('numeric validation', () => {
  it.each([
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
  ])('rejects %s in x', (_label, value) => {
    // z.number() in zod 4 rejects every non-finite value. This is what stops a
    // NaN reaching a `transform` and silently emptying a node.
    expect(ok(CanvasNodeSchema.safeParse({ ...textNode, x: value }))).toBe(
      false,
    );
  });

  it('rejects a numeric string rather than coercing it', () => {
    // Coercion is `normalizeDoc`'s job, at the ingest boundary. The schema is
    // the strict gate, and a schema that coerces hides which layer did it.
    expect(ok(CanvasNodeSchema.safeParse({ ...textNode, x: '10' }))).toBe(
      false,
    );
  });

  it('accepts negative x and y', () => {
    // Off-page content is legitimate: the editor stage shows it, the export
    // clips it. A non-negative constraint would forbid authoring it.
    const node = CanvasNodeSchema.parse({ ...textNode, x: -50, y: -20 });
    expect(node.x).toBe(-50);
  });
});

describe('opacity', () => {
  it('accepts the ends of the range', () => {
    expect(ok(CanvasNodeSchema.safeParse({ ...textNode, opacity: 0 }))).toBe(
      true,
    );
    expect(ok(CanvasNodeSchema.safeParse({ ...textNode, opacity: 1 }))).toBe(
      true,
    );
  });

  it('rejects out-of-range opacity rather than clamping it', () => {
    // The schema is the strict gate: `opacity: 4` is a producer bug and
    // silently becoming `1` would make a wrong document look right. Clamping
    // is `normalizeDoc`'s job, on the untrusted ingest path. Both are tested;
    // they are different decisions, not two copies of one.
    expect(ok(CanvasNodeSchema.safeParse({ ...textNode, opacity: 4 }))).toBe(
      false,
    );
    expect(ok(CanvasNodeSchema.safeParse({ ...textNode, opacity: -0.5 }))).toBe(
      false,
    );
  });

  it('normalizeDoc clamps opacity instead of failing', () => {
    const doc = normalizeDoc({
      ...(minimal as Doc),
      pages: [
        {
          id: 'p1',
          nodes: [{ ...textNode, opacity: 4 }],
          groups: [],
        },
      ],
    });
    expect(doc.pages[0]?.nodes[0]?.opacity).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Unknown keys
// ─────────────────────────────────────────────────────────────────────────────

describe('unknown keys are rejected everywhere', () => {
  it('rejects an unknown key on a node', () => {
    // `.strict()` everywhere. An LLM that invents a field must be told, not
    // have it silently dropped — otherwise a document can look correct and
    // render wrong, and there is no signal anywhere to explain why.
    expect(ok(CanvasNodeSchema.safeParse({ ...textNode, zIndex: 3 }))).toBe(
      false,
    );
    expect(ok(CanvasNodeSchema.safeParse({ ...textNode, font: 'Inter' }))).toBe(
      false,
    );
  });

  it('rejects an unknown key on the document and the page', () => {
    const doc = minimal as Doc;
    expect(ok(DocSchema.safeParse({ ...doc, theme: 'dark' }))).toBe(false);
    expect(
      ok(
        DocSchema.safeParse({
          ...doc,
          pages: [{ ...doc.pages[0], zIndex: 1 }],
        }),
      ),
    ).toBe(false);
  });

  it('rejects an unknown key on a node style', () => {
    expect(
      ok(
        CanvasNodeSchema.safeParse({
          ...textNode,
          style: { radius: 4, blur: 8 },
        }),
      ),
    ).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Stable identity
// ─────────────────────────────────────────────────────────────────────────────

describe('stable identity', () => {
  it('rejects a node with an empty id', () => {
    // Selection, undo remapping and the layer panel all key off the id. An
    // empty id is not a weak id, it is no id, and array-index identity is never
    // an acceptable substitute.
    expect(ok(CanvasNodeSchema.safeParse({ ...textNode, id: '' }))).toBe(false);
  });

  it('assigns a generated id during normalization', () => {
    const noId: Record<string, unknown> = { ...textNode };
    delete noId['id'];
    const doc = normalizeDoc({
      ...(minimal as Doc),
      pages: [{ id: 'p1', nodes: [noId], groups: [] }],
    });
    expect(typeof doc.pages[0]?.nodes[0]?.id).toBe('string');
    expect(doc.pages[0]?.nodes[0]?.id.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Normalization
// ─────────────────────────────────────────────────────────────────────────────

describe('normalizeDoc', () => {
  it('coerces numeric strings', () => {
    const doc = normalizeDoc({
      ...(minimal as Doc),
      width: '800',
      height: '600',
      pages: [{ id: 'p1', nodes: [{ ...textNode, x: '12.345' }], groups: [] }],
    });
    expect(doc.width).toBe(800);
    // Rounded to 2dp — the same boundary style.ts rounds at, so the document
    // and the rendered output can never disagree by a third decimal.
    expect(doc.pages[0]?.nodes[0]?.x).toBe(12.35);
  });

  it('throws on NaN instead of substituting a value', () => {
    // 0 is a VALID x. Substituting it would make a broken document
    // indistinguishable from a correct one, which is strictly worse than
    // failing loudly at the boundary.
    expect(() =>
      normalizeDoc({
        ...(minimal as Doc),
        pages: [
          { id: 'p1', nodes: [{ ...textNode, x: Number.NaN }], groups: [] },
        ],
      }),
    ).toThrow(/non-finite/);
  });

  it('throws on a shape with no h', () => {
    // The normalizer cannot invent a height for a shape any more than the
    // schema can, so it fails loudly instead of defaulting one.
    const noH = {
      id: 's1',
      kind: 'shape',
      shape: 'rect',
      x: 0,
      y: 0,
      w: 10,
      fill: '#000',
    };
    expect(() =>
      normalizeDoc({
        ...(minimal as Doc),
        pages: [{ id: 'p1', nodes: [noH], groups: [] }],
      }),
    ).toThrow(/missing 'h'/);
  });

  it('leaves an absent text h absent', () => {
    // The normalizer must not be the place a measured height sneaks in.
    const doc = normalizeDoc(minimal);
    expect(doc.pages[0]?.nodes[0]?.h).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Presets
// ─────────────────────────────────────────────────────────────────────────────

describe('presets', () => {
  it.each(PRESET_SLUGS)(
    '%s is a schema-valid, non-trivial document',
    (slug) => {
      const parsed = DocSchema.parse(PRESETS[slug]);
      // "No preset is an empty box" — a preset that renders blank teaches a user
      // nothing and would let an emitter bug hide behind an empty document.
      expect(JSON.stringify(PRESETS[slug]).length).toBeGreaterThan(400);
      expect(parsed.pages[0]?.nodes.length).toBeGreaterThan(3);
    },
  );

  it('are all at their exact, documented sizes', () => {
    expect(DocSchema.parse(PRESETS['link-card']).width).toBe(1200);
    expect(DocSchema.parse(PRESETS['link-card']).height).toBe(630);
    expect(DocSchema.parse(PRESETS['square-post']).width).toBe(1080);
    expect(DocSchema.parse(PRESETS['square-post']).height).toBe(1080);
    expect(DocSchema.parse(PRESETS.story).width).toBe(1080);
    expect(DocSchema.parse(PRESETS.story).height).toBe(1920);
  });

  it('includes at least one preset that exercises a rotated group', () => {
    const withGroup = PRESET_SLUGS.some((s) =>
      DocSchema.parse(PRESETS[s]).pages[0]?.groups.some((g) => g.rotate),
    );
    expect(withGroup).toBe(true);
  });
});
