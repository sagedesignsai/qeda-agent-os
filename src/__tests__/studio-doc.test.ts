/**
 * __tests__/studio-doc.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The Studio composition foundation: schema validation and the doc → HTML
 * compiler.
 *
 * The compiler tests are less about pixels than about the three invariants the
 * module promises — determinism, total escaping, and self-containment (no
 * class names, no network). A regression in any of those is invisible in a
 * screenshot and permanent in every export ever produced, so they are asserted
 * directly.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  compileDoc,
  docOutline,
  parseDoc,
  PRESETS,
  PRESET_LIST,
  safeParseDoc,
  type FrameNode,
  type StudioDoc,
  type TokenName,
} from '@/lib/studio';

const baseFrame = {
  kind: 'frame',
  w: 400,
  h: 200,
  background: { kind: 'token', name: 'background' },
  padding: 0,
  gap: 0,
  align: 'left',
  justify: 'start',
  direction: 'column',
  radius: 0,
  children: [],
} satisfies FrameNode;

function frameDoc(overrides: Partial<StudioDoc> = {}): StudioDoc {
  return { ...baseFrame, ...overrides };
}

const textNode = (content: string, overrides: Record<string, unknown> = {}) => ({
  kind: 'text',
  content,
  size: 48,
  weight: 400,
  color: { kind: 'token', name: 'primary' },
  align: 'left',
  lineHeight: 1.2,
  letterSpacing: 0,
  maxWidth: 400,
  ...overrides,
});

describe('Studio document schema', () => {
  it('accepts a minimal valid frame document', () => {
    const doc = parseDoc(frameDoc());
    expect(doc.kind).toBe('frame');
    expect(doc.w).toBe(400);
  });

  it('rejects an unknown token name', () => {
    const result = safeParseDoc(
      // `zinc-900` is deliberately not a design token. The point of this case is
      // that an unknown token name is a *validation error*, so the literal has to
      // be forced past the compile-time `TokenName` union to reach the runtime
      // check. Only the schema verdict is under test here, not the type.
      frameDoc({
        background: { kind: 'token', name: 'zinc-900' as TokenName },
      }),
    );
    expect(result.success).toBe(false);
  });

  it('rejects a node kind outside the closed union', () => {
    const result = safeParseDoc(
      frameDoc({ children: [{ kind: 'canvas' }] as never }),
    );
    expect(result.success).toBe(false);
  });

  it('rejects an http:// image source but accepts a data: image', () => {
    const remote = safeParseDoc(
      frameDoc({
        children: [
          {
            kind: 'image',
            src: 'http://example.com/a.png',
            fit: 'cover',
            radius: 0,
          },
        ] as never,
      }),
    );
    expect(remote.success).toBe(false);

    const local = safeParseDoc(
      frameDoc({
        children: [
          {
            kind: 'image',
            src: 'data:image/png;base64,iVBORw0KGgo=',
            fit: 'cover',
            radius: 0,
          },
        ] as never,
      }),
    );
    expect(local.success).toBe(true);
  });

  it('rejects a protocol-relative and a javascript: image source', () => {
    for (const src of ['//example.com/a.png', 'javascript:alert(1)']) {
      const result = safeParseDoc(
        frameDoc({
          children: [{ kind: 'image', src, fit: 'cover', radius: 0 }] as never,
        }),
      );
      expect(result.success).toBe(false);
    }
  });

  it('requires exactly one of token/hex on a gradient stop', () => {
    expect(
      safeParseDoc(
        frameDoc({
          background: {
            kind: 'linear-gradient',
            angle: 90,
            stops: [
              { offset: 0 },
              { token: 'card', offset: 1 },
            ],
          },
        }),
      ).success,
    ).toBe(false);
  });

  it('validates the closed animation enum', () => {
    const bad = safeParseDoc(
      frameDoc({ children: [textNode('x', { animation: 'wobble' })] as never }),
    );
    expect(bad.success).toBe(false);
  });
});

describe('compileDoc', () => {
  it('is deterministic: the same document compiles to byte-identical output', () => {
    for (const doc of PRESET_LIST) {
      expect(compileDoc(doc)).toBe(compileDoc(doc));
    }
  });

  it('emits a complete, self-contained document', () => {
    const html = compileDoc(frameDoc());
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain('<style>');
    expect(html).toContain('width:400px');
    expect(html).toContain('height:200px');
  });

  it('escapes text content, including quotes and ampersands', () => {
    const html = compileDoc(
      frameDoc({ children: [textNode('<script>alert(1)</script> & "x"')] as never }),
    );
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&amp;');
    expect(html).toContain('&quot;x&quot;');
  });

  it('escapes a text node that tries to close its own element', () => {
    const html = compileDoc(
      frameDoc({ children: [textNode('</div><script>alert(1)</script>')] as never }),
    );
    expect(html).not.toContain('</div><script>');
  });

  it('never emits a class attribute — styles are inline by invariant', () => {
    for (const doc of PRESET_LIST) {
      expect(compileDoc(doc)).not.toContain('class=');
    }
  });

  it('emits the restrictive inner CSP with default-src none', () => {
    const html = compileDoc(frameDoc());
    expect(html).toContain('Content-Security-Policy');
    expect(html).toContain("default-src 'none'");
    expect(html).toContain("img-src data: file:");
    expect(html).toContain("style-src 'unsafe-inline'");
    expect(html).toContain("font-src data:");
  });

  it('contains no remote reference at all', () => {
    for (const doc of PRESET_LIST) {
      const html = compileDoc(doc);
      expect(html).not.toContain('http://');
      expect(html).not.toContain('https://');
    }
  });

  it('emits a file:// URI for an absolute local image path', () => {
    const html = compileDoc(
      frameDoc({
        children: [
          { kind: 'image', src: '/tmp/a b.png', fit: 'cover', radius: 4 },
        ] as never,
      }),
    );
    expect(html).toContain('src="file:///tmp/a%20b.png"');
  });

  it('compiles every animation preset to a matching @keyframes rule', () => {
    const presets = [
      'fade-in',
      'rise-in',
      'slide-in-left',
      'scale-in',
    ] as const;
    for (const animation of presets) {
      const html = compileDoc(
        frameDoc({
          children: [textNode('x', { animation })] as never,
        }),
      );
      expect(html).toContain(`@keyframes studio-${animation}{`);
      expect(html).toContain(`animation:studio-${animation} `);
    }
  });

  it('emits no keyframes for an unanimated document', () => {
    expect(compileDoc(frameDoc())).not.toContain('@keyframes');
  });

  it('resolves token names to concrete values in the :root block', () => {
    const html = compileDoc(frameDoc());
    expect(html).toContain('--background:#090c13;');
    expect(html).toContain('--muted-foreground:#99a3b1;');
    expect(html).toContain('var(--background)');
  });
});

describe('PRESETS', () => {
  const expected: Record<string, [number, number]> = {
    'og-1200x630': [1200, 630],
    'square-1080x1080': [1080, 1080],
    'story-1080x1920': [1080, 1920],
  };

  it('provides at least three documents at the expected sizes', () => {
    expect(Object.keys(PRESETS).length).toBeGreaterThanOrEqual(3);
    for (const [name, [w, h]] of Object.entries(expected)) {
      const doc = PRESETS[name as keyof typeof PRESETS];
      expect([doc.w, doc.h]).toEqual([w, h]);
    }
  });

  it('parses and compiles without throwing', () => {
    for (const doc of PRESET_LIST) {
      expect(() => parseDoc(doc)).not.toThrow();
      expect(() => compileDoc(doc)).not.toThrow();
    }
  });

  it('are genuinely laid out: no preset is an empty box', () => {
    for (const doc of PRESET_LIST) {
      const total = JSON.stringify(doc).length;
      expect(total).toBeGreaterThan(400);
    }
  });
});

describe('docOutline', () => {
  it('states the root frame dimensions and the text content', () => {
    const outline = docOutline(
      frameDoc({ children: [textNode('Hello', { size: 48 })] as never }),
    );
    expect(outline).toContain('frame 400x200');
    expect(outline).toContain('text "Hello" (size 48, weight 400, token/primary)');
  });

  it('collapses multi-line text onto one outline line', () => {
    const outline = docOutline(
      frameDoc({ children: [textNode('a\nb')] as never }),
    );
    expect(outline).toContain('text "a b"');
    expect(outline.split('\n')).toHaveLength(2);
  });

  it('describes images, shapes and groups', () => {
    const outline = docOutline(
      frameDoc({
        children: [
          {
            kind: 'group',
            opacity: 0.5,
            children: [
              {
                kind: 'shape',
                shape: 'ellipse',
                fill: { kind: 'hex', value: '#ff0000' },
                w: 20,
                h: 20,
                radius: 10,
              },
              {
                kind: 'image',
                src: 'data:image/png;base64,iVBORw0KGgo=',
                fit: 'contain',
                radius: 0,
                w: 100,
                h: 50,
              },
            ],
          },
        ] as never,
      }),
    );
    expect(outline).toContain('group (opacity 0.5)');
    expect(outline).toContain('shape ellipse 20x20 (fill: #ff0000)');
    expect(outline).toContain('image 100x50 (fit contain)');
  });
});
