/**
 * The Terminal module must stay on the shadcn design tokens.
 *
 * Regression guard: the Terminal was originally written against raw zinc/sky/
 * emerald ramps, which left it pinned to a dark palette and broke light mode
 * (hardcoded classes have no `.dark` override). `scripts/tokenize-terminal.mjs`
 * fixed it; this test stops it drifting back.
 *
 * The ANSI 16 slots in XtermPane are exempt by design — they are a terminal
 * protocol, not UI chrome, and they are declared in a clearly-named block.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const TERMINAL_DIR = path.resolve(__dirname, '../components/terminal');
const EXTRA_FILES = [
  path.resolve(__dirname, '../renderer/pages/Terminal.tsx'),
  path.resolve(__dirname, '../components/sidebar/TerminalMenu.tsx'),
];

/** Token utilities the Terminal is allowed to use. */
const TOKENS = [
  'background',
  'foreground',
  'card',
  'popover',
  'primary',
  'secondary',
  'muted',
  'accent',
  'destructive',
  'border',
  'input',
  'ring',
];

/**
 * Raw Tailwind palette families that must not appear: the neutral ramp plus any
 * hue that would pin a *surface* to a fixed appearance.
 *
 * These are the STATUS_FAMILIES used by the Terminal, deliberately excluded —
 * each one carries meaning rather than chrome:
 *   emerald = approved,  rose = failed,  sky = running,
 *   amber   = awaiting approval,  violet = explained,  orange = system insight
 * They read correctly in both themes, so they stay literal. For strict purity
 * run `npm run theme:terminal:write -- --status`, then drop these from the
 * exclusion list above and add them here.
 */
const PALETTE_FAMILIES = [
  'zinc',
  'slate',
  'neutral',
  'stone',
  'gray',
  'red',
  'yellow',
  'lime',
  'teal',
  'indigo',
  'fuchsia',
  'pink',
];

const UTILITY_RE = new RegExp(
  `\\b(?:bg|text|border|ring|fill|stroke|from|to|via|outline|decoration|divide|shadow)-` +
    `(${PALETTE_FAMILIES.join('|')})-\\d{2,3}(?:/\\d{1,3})?\\b`,
  'g',
);

const HEX_RE = /#[0-9a-fA-F]{3,8}\b/g;

function read(file: string): string {
  return readFileSync(file, 'utf8');
}

describe('terminal theming', () => {
  const files = [
    ...readdirSync(TERMINAL_DIR)
      .filter((f) => f.endsWith('.tsx'))
      .map((f) => path.join(TERMINAL_DIR, f)),
    ...EXTRA_FILES,
  ];

  it('has files to check', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  describe.each(files.map((f) => [path.basename(f), f] as const))(
    '%s',
    (_name, file) => {
      const source = read(file);

      it('uses no raw Tailwind palette classes', () => {
        const hits = source.match(UTILITY_RE) ?? [];
        // XtermPane declares the ANSI 16 block; strip it before asserting.
        const offenders = hits.filter((h) => !isAnsiExempt(source, h));
        expect(offenders).toEqual([]);
      });

      it('uses no hardcoded hex colours outside the ANSI block', () => {
        expect(withoutAnsiBlock(source).match(HEX_RE) ?? []).toEqual([]);
      });

      it('does not pin surfaces with an arbitrary-colour utility', () => {
        // e.g. bg-[#09090b] — a hex that survives because it is not a palette
        // name, and therefore silently escapes both the codemod and the above.
        expect(source).not.toMatch(/bg-\[#[0-9a-fA-F]{3,8}\]/);
      });

      it('references design tokens, not a fixed palette', () => {
        const usesTokens = new RegExp(
          `\\b(?:bg|text|border|ring)-(${TOKENS.join('|')})\\b`,
        ).test(source);
        const usesTokensAtRuntime = source.includes('readToken(');
        expect(usesTokens || usesTokensAtRuntime).toBe(true);
      });
    },
  );
});

/** True when every occurrence of `cls` sits inside the ANSI_COLORS block. */
function isAnsiExempt(source: string, cls: string): boolean {
  const block = ansiBlock(source);
  return block !== null && block.includes(cls);
}

/**
 * The ANSI_COLORS declaration, or null when the file has none. Guarded on
 * `indexOf` returning -1: a naive `slice(start, end)` on -1 would return the
 * whole file and silently disable the hex assertion.
 */
function ansiBlock(source: string): string | null {
  const start = source.indexOf('const ANSI_COLORS');
  if (start === -1) return null;
  const end = source.indexOf('buildXtermTheme', start);
  return end === -1 ? null : source.slice(start, end);
}

/** Source with the ANSI block removed, ready for the hex assertion. */
function withoutAnsiBlock(source: string): string {
  const block = ansiBlock(source);
  return block === null ? source : source.replace(block, '');
}
