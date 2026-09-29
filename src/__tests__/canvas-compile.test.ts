/**
 * __tests__/canvas-compile.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The compiler's promises. These are less about pixels than about the four
 * invariants the module advertises: determinism, no class names, total
 * escaping, and self-containment.
 *
 * A regression in any of them is invisible in a screenshot and permanent in
 * every export ever produced, so each is asserted directly rather than being
 * left to review. The determinism test is the flagship: it is the invariant
 * that makes an export worth trusting at all.
 *
 * ⚠️ No pixel test, and no PNG/PDF comparison. Rasterization is not
 * deterministic — GPU, antialiasing and the font rasterizer all vary — so such
 * a test would be flaky by construction. The determinism guarantee covers the
 * HTML string and nothing else.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  ANIMATIONS,
  CSP,
  DocSchema,
  PRESETS,
  PRESET_SLUGS,
  TOKEN_COLORS,
  TOKEN_NAMES,
  animationStyle,
  compilePage,
  docOutline,
  nodeStyle,
  type Doc,
  type Page,
} from '@/lib/canvas';

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

function docOf(
  nodes: unknown[],
  groups: unknown[] = [],
): {
  doc: Doc;
  page: Page;
} {
  const doc = DocSchema.parse({
    id: 'd',
    name: 'T',
    width: 600,
    height: 400,
    background: 'surface',
    pages: [{ id: 'p', nodes, groups }],
  });
  return { doc, page: doc.pages[0] as Page };
}

const textNoH = {
  id: 't',
  kind: 'text',
  x: 10,
  y: 20,
  w: 200,
  content: 'Auto height',
  fontSize: 24,
  fontWeight: 600,
  color: 'on-surface',
};

const textWithH = { ...textNoH, id: 'th', h: 80 };

// ─────────────────────────────────────────────────────────────────────────────
// DETERMINISM — the flagship
// ─────────────────────────────────────────────────────────────────────────────

describe('determinism', () => {
  it('compilePage is byte-identical across repeated calls', () => {
    const { doc, page } = docOf([textNoH, textWithH]);
    const a = compilePage(doc, page);
    const b = compilePage(doc, page);
    const c = compilePage(doc, page, { clip: true });
    expect(a).toBe(b);
    expect(a).toBe(c);
  });

  it.each(PRESET_SLUGS)('preset %s compiles deterministically', (slug) => {
    const doc = DocSchema.parse(PRESETS[slug]);
    const page = doc.pages[0] as Page;
    expect(compilePage(doc, page)).toBe(compilePage(doc, page));
  });

  it('does not mutate the document it is given', () => {
    const { doc, page } = docOf([textNoH]);
    const before = JSON.stringify({ doc, page });
    compilePage(doc, page);
    expect(JSON.stringify({ doc, page })).toBe(before);
  });

  it('emits the same bytes for two structurally equal documents', () => {
    // Object key order in the source must not reach the output: the emitter
    // reads named fields, never `Object.entries` of a node.
    const one = docOf([{ ...textNoH }]);
    const two = docOf([
      {
        content: 'Auto height',
        fontWeight: 600,
        color: 'on-surface',
        fontSize: 24,
        w: 200,
        y: 20,
        x: 10,
        id: 't',
        kind: 'text',
      },
    ]);
    expect(compilePage(one.doc, one.page)).toBe(compilePage(two.doc, two.page));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// NO CLASS NAMES
// ─────────────────────────────────────────────────────────────────────────────

describe('never emits a class name', () => {
  it.each(PRESET_SLUGS)('preset %s has no class attribute anywhere', (slug) => {
    // LOAD-BEARING. Tailwind v4 purges runtime-generated classes with zero
    // diagnostics, so a single class-based rule silently vanishes and the
    // export is unstyled in production with a clean build. Inline styles
    // cannot be purged, which is the entire reason for this rule.
    const doc = DocSchema.parse(PRESETS[slug]);
    const html = compilePage(doc, doc.pages[0] as Page);
    expect(html).not.toMatch(/\sclass\s*=/i);
    expect(html).not.toMatch(/className/);
  });

  it('has no class attribute even for a text node trying to smuggle one', () => {
    const { doc, page } = docOf([
      { ...textNoH, content: '<div class="x">hi</div>' },
    ]);
    const html = compilePage(doc, page);
    // Scoped to real tags: the payload is *escaped text*, so the literal string
    // ` class=` legitimately survives inside it. What must not exist is a class
    // attribute on an element the emitter produced.
    expect(html).not.toMatch(/<[a-zA-Z][^>]*\sclass\s*=/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Policy and self-containment
// ─────────────────────────────────────────────────────────────────────────────

describe('self-containment', () => {
  it.each(PRESET_SLUGS)('preset %s contains no remote or file URL', (slug) => {
    const doc = DocSchema.parse(PRESETS[slug]);
    const html = compilePage(doc, doc.pages[0] as Page);
    // Belt to the CSP's braces: with `default-src 'none'` and `img-src data:`
    // a remote reference could not load anyway, but it would still leak an
    // author's intent into the artefact and break the no-network promise in a
    // way no test in the browser would catch.
    expect(html).not.toMatch(/https?:\/\//i);
    expect(html).not.toMatch(/file:\/\//i);
  });

  it('emits the exact CSP, with no file: grant', () => {
    const { doc, page } = docOf([textNoH]);
    const html = compilePage(doc, page);
    expect(html).toContain(
      `<meta http-equiv="Content-Security-Policy" content="${CSP}">`,
    );
    expect(CSP).toBe(
      "default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:",
    );
    // `file:` was an existence-oracle channel, and a granted capability widens
    // silently later — so v1 starts without it and treats needing it as a
    // deliberate schema change.
    expect(CSP).not.toContain('file:');
  });

  it('uses a system font stack and no webfont', () => {
    const { doc, page } = docOf([textNoH]);
    const html = compilePage(doc, page);
    expect(html).toContain('--canvas-font:');
    expect(html).toContain('system-ui');
    // A webfont would mean base64-inlining megabytes per export, plus a whole
    // class of "renders differently on the user's machine".
    expect(html).not.toMatch(/@font-face/);
    expect(html).not.toMatch(/data:font|data:application\/font/i);
  });

  it('resolves an unresolved image to a data: placeholder, never a path', () => {
    const { doc, page } = docOf([
      {
        id: 'i',
        kind: 'image',
        x: 0,
        y: 0,
        w: 100,
        h: 100,
        src: { kind: 'asset', assetId: 'missing' },
      },
    ]);
    const html = compilePage(doc, page);
    expect(html).toContain('src="data:image/png;base64,');
  });

  it('accepts a supplied data: asset and refuses a non-data: one', () => {
    const node = {
      id: 'i',
      kind: 'image',
      x: 0,
      y: 0,
      w: 100,
      h: 100,
      src: { kind: 'asset', assetId: 'a1' },
    };
    const good = docOf([node]);
    const png =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    expect(compilePage(good.doc, good.page, { assets: { a1: png } })).toContain(
      png,
    );

    // A caller trying to smuggle a remote URL through the asset map is
    // ignored, not honoured: the allow-list is in the compiler so the
    // guarantee does not depend on every caller being careful.
    const bad = docOf([node]);
    expect(
      compilePage(bad.doc, bad.page, {
        assets: { a1: 'https://evil.example/x.png' },
      }),
    ).not.toContain('evil.example');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Escaping
// ─────────────────────────────────────────────────────────────────────────────

describe('escaping', () => {
  it('a text node cannot close its own element', () => {
    const payload = '</div><script>alert(1)</script>';
    const { doc, page } = docOf([{ ...textNoH, content: payload }]);
    const html = compilePage(doc, page);
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('</div><script');
    expect(html).toContain('&lt;/div&gt;&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('a text node cannot break out of a style attribute or the style block', () => {
    const payload = '"><style>*{display:none}</style><div a="';
    const { doc, page } = docOf([{ ...textNoH, content: payload }]);
    const html = compilePage(doc, page);
    // Exactly one style block: the generated one. A second would mean the
    // payload closed ours. (`*{display:none}` survives as escaped TEXT, which
    // is inert — it is inside a div, not a stylesheet.)
    expect(html.match(/<style>/g)).toHaveLength(1);
    expect(html).not.toContain(payload);
    expect(html).toContain('&lt;style&gt;');
  });

  it('escapes quotes and ampersands in text', () => {
    const { doc, page } = docOf([
      { ...textNoH, content: `Tom & "Jerry" <tag>` },
    ]);
    const html = compilePage(doc, page);
    expect(html).toContain('Tom &amp; &quot;Jerry&quot; &lt;tag&gt;');
  });

  it('preserves authored newlines as real newlines in the content', () => {
    const { doc, page } = docOf([
      { ...textNoH, content: 'line one\nline two' },
    ]);
    const html = compilePage(doc, page);
    expect(html).toContain('line one\nline two');
    expect(html).toContain('white-space:pre-wrap');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The height rule — the drift canary
// ─────────────────────────────────────────────────────────────────────────────

describe('text height is emitted only when authored', () => {
  it('a text node with no h emits no height at all', () => {
    // THE RULE. Not `height:auto`, not a cached measurement, not an estimate —
    // the key is absent. A measured height here would make the document a
    // picture of a render instead of a statement of intent, and the breakage
    // would only surface on a machine with different fonts.
    const { doc, page } = docOf([textNoH]);
    const html = compilePage(doc, page);
    // Scoped to the node's own element. The page frame legitimately has a
    // height; the NODE must not.
    const line = html.split('\n').find((l) => l.includes('Auto height'));
    expect(line).toBeDefined();
    expect(line).not.toMatch(/height:/);
    expect('height' in nodeStyle(textNoH as never)).toBe(false);
  });

  it('a text node with h: 80 emits height:80px', () => {
    const { doc, page } = docOf([textWithH]);
    const html = compilePage(doc, page);
    expect(html).toContain('height:80px');
  });

  it('nodeStyle itself agrees, in both directions', () => {
    // The compiler is not the only consumer — the React canvas passes
    // nodeStyle() to `style` directly. Pinning it here means the drift cannot
    // re-enter through the other consumer either.
    expect('height' in nodeStyle(textNoH as never)).toBe(false);
    expect(nodeStyle(textWithH as never)['height']).toBe('80px');
  });

  it('rounds lengths to 2dp at the style boundary', () => {
    const style = nodeStyle({
      ...textNoH,
      x: 10.123456,
      y: -0.004,
      w: 100.005,
    } as never);
    expect(style['left']).toBe('10.12px');
    expect(style['top']).toBe('0px');
    expect(style['width']).toBe('100.01px');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The emitter adds no geometry
// ─────────────────────────────────────────────────────────────────────────────

describe('the emitter stringifies nodeStyle() and nothing else', () => {
  it.each(PRESET_SLUGS)(
    'preset %s node styles match nodeStyle() exactly',
    (slug) => {
      const doc = DocSchema.parse(PRESETS[slug]);
      const page = doc.pages[0] as Page;
      const html = compilePage(doc, page);

      for (const node of page.nodes) {
        const expected = Object.entries(nodeStyle(node))
          .map(([k, v]) => `${k}:${v}`)
          .join(';');
        // If the emitter ever computed geometry of its own, this would diverge
        // — and the editor (which uses nodeStyle) and the export (which uses the
        // string) would disagree. That is the whole reason this module exists.
        expect(html).toContain(expected);
      }
    },
  );

  it('a node carries a transform only when it asks for one', () => {
    const plain = docOf([textNoH]);
    expect(compilePage(plain.doc, plain.page)).not.toMatch(/transform:/);

    const turned = docOf([{ ...textNoH, rotate: 15, opacity: 0.5 }]);
    const html = compilePage(turned.doc, turned.page);
    expect(html).toContain('transform:rotate(15deg)');
    expect(html).toContain('opacity:0.5');
  });

  it('emits box-sizing so a stroke does not change the node size', () => {
    const { doc, page } = docOf([
      {
        id: 's',
        kind: 'shape',
        shape: 'rect',
        x: 0,
        y: 0,
        w: 100,
        h: 50,
        fill: 'brand',
        style: {
          stroke: 'accent',
          strokeWidth: 4,
          radius: 8,
          shadow: '0 2px 8px rgba(0,0,0,0.2)',
        },
      },
    ]);
    const html = compilePage(doc, page);
    expect(html).toContain('box-sizing:border-box');
    expect(html).toContain('border-radius:8px');
    expect(html).toContain('border:4px solid var(--accent)');
    expect(html).toContain('box-shadow:0 2px 8px rgba(0,0,0,0.2)');
  });

  it('an ellipse is fully round regardless of the requested radius', () => {
    const { doc, page } = docOf([
      {
        id: 'e',
        kind: 'shape',
        shape: 'ellipse',
        x: 0,
        y: 0,
        w: 100,
        h: 50,
        fill: 'brand',
        style: { radius: 2 },
      },
    ]);
    expect(compilePage(doc, page)).toContain('border-radius:9999px');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Groups
// ─────────────────────────────────────────────────────────────────────────────

describe('groups', () => {
  it('wraps members and rotates about the derived centre', () => {
    const { doc, page } = docOf(
      [
        { ...textNoH, id: 'a', x: 100, y: 100, w: 50 },
        { ...textNoH, id: 'b', x: 200, y: 100, w: 50 },
      ],
      [{ id: 'g', rotate: 30, nodeIds: ['a', 'b'] }],
    );
    const html = compilePage(doc, page);
    expect(html).toContain('transform:rotate(30deg)');
    // Bounds of the two members: x 100→250, centre x 175, centre y = 100 + h/2.
    // The centre is DERIVED, which is why the group needs no stored box.
    expect(html).toMatch(/transform-origin:175px \d/);
  });

  it('does not re-coordinate members inside a group', () => {
    const { doc, page } = docOf(
      [{ ...textNoH, id: 'a', x: 137, y: 42, w: 50 }],
      [{ id: 'g', rotate: 30, nodeIds: ['a'] }],
    );
    // A member's coordinates are page coordinates. If wrapping a group shifted
    // a child, the group would need a stored box to undo it — which is exactly
    // the second source of truth decision 3 forbids.
    expect(compilePage(doc, page)).toContain('left:137px');
  });

  it('emits nothing for a group with no resolvable members', () => {
    const { doc, page } = docOf(
      [textNoH],
      [{ id: 'g', rotate: 30, nodeIds: [] }],
    );
    const html = compilePage(doc, page);
    expect(html).not.toMatch(/transform:rotate/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Page frame
// ─────────────────────────────────────────────────────────────────────────────

describe('the page frame', () => {
  it('clips by default and shows off-page content when clip is false', () => {
    const { doc, page } = docOf([textNoH]);
    expect(compilePage(doc, page)).toContain('overflow:hidden');
    // The editor stage needs to see what the author is dragging back in; an
    // export must not show anything outside the frame.
    expect(compilePage(doc, page, { clip: false })).toContain(
      'overflow:visible',
    );
  });

  it('uses the document dimensions and the page background', () => {
    const doc = DocSchema.parse({
      id: 'd',
      name: 'T',
      width: 600,
      height: 400,
      background: 'brand',
      pages: [{ id: 'p', background: 'accent', nodes: [textNoH], groups: [] }],
    });
    const html = compilePage(doc, doc.pages[0] as Page);
    expect(html).toContain('width:600px');
    expect(html).toContain('height:400px');
    expect(html).toContain('background:var(--accent)');
  });

  it('emits a hidden node not at all', () => {
    const { doc, page } = docOf([
      { ...textNoH, id: 'shown' },
      { ...textNoH, id: 'gone', content: 'SECRET', visible: false },
    ]);
    const html = compilePage(doc, page);
    expect(html).toContain('Auto height');
    expect(html).not.toContain('SECRET');
  });

  it('emits a locked node, because locking is an editor concern', () => {
    // `locked` blocks selection and drag. It has no rendering meaning, and a
    // document that hides locked content would lose work on export.
    const { doc, page } = docOf([{ ...textNoH, locked: true }]);
    expect(compilePage(doc, page)).toContain('Auto height');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tokens
// ─────────────────────────────────────────────────────────────────────────────

describe('tokens', () => {
  it('emits every token with a concrete value in :root', () => {
    const { doc, page } = docOf([textNoH]);
    const html = compilePage(doc, page);
    for (const name of TOKEN_NAMES) {
      expect(html).toContain(`--${name}:${TOKEN_COLORS[name]};`);
    }
  });

  it('references tokens by var() rather than inlining them', () => {
    const { doc, page } = docOf([textNoH]);
    const html = compilePage(doc, page);
    // One definition, short output, and a token change is a one-line diff
    // rather than a rewrite of every node.
    expect(html).toContain('color:var(--on-surface)');
    expect(html).not.toContain(`color:${TOKEN_COLORS['on-surface']}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Animation
// ─────────────────────────────────────────────────────────────────────────────

describe('animation', () => {
  it('emits no @keyframes for an unanimated page', () => {
    // "No keyframes when unanimated" is only a meaningful invariant if the
    // animated path is real, so it is asserted on every preset.
    for (const slug of PRESET_SLUGS) {
      const doc = DocSchema.parse(PRESETS[slug]);
      expect(compilePage(doc, doc.pages[0] as Page)).not.toContain(
        '@keyframes',
      );
    }
  });

  it.each(
    (Object.keys(ANIMATIONS) as Array<keyof typeof ANIMATIONS>).filter(
      (p) => p !== 'none',
    ),
  )('the %s preset pairs keyframes with a declaration', (preset) => {
    const { keyframes, declaration } = ANIMATIONS[preset];
    // A declaration without its keyframes is an invisible element: it
    // animates over the author's whole lifetime and never moves.
    expect(keyframes).toContain(`@keyframes canvas-${preset}`);
    expect(declaration).toContain(`animation:canvas-${preset}`);
    expect(animationStyle(preset)).toBe(declaration);
  });

  it('the none preset emits neither half', () => {
    expect(ANIMATIONS.none.keyframes).toBe('');
    expect(ANIMATIONS.none.declaration).toBe('');
  });

  it('declares an empty animation style for none and for undefined', () => {
    expect(animationStyle('none')).toBe('');
    expect(animationStyle(undefined)).toBe('');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Outline
// ─────────────────────────────────────────────────────────────────────────────

describe('docOutline', () => {
  it('renders a plain-text tree containing every node id', () => {
    const doc = DocSchema.parse(PRESETS['link-card']);
    const outline = docOutline(doc);
    expect(outline).toContain('doc "Link card"');
    for (const node of doc.pages[0]?.nodes ?? []) {
      expect(outline).toContain(node.id);
    }
    expect(outline).not.toContain('<');
  });

  it('records that a text node has no authored height', () => {
    const { doc } = docOf([textNoH]);
    expect(docOutline(doc)).toContain('height: auto');
  });
});
