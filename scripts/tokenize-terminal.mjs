#!/usr/bin/env node
/**
 * scripts/tokenize-terminal.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * One-shot codemod: replace hardcoded Tailwind palette classes in the Terminal
 * module with the semantic design tokens defined in src/renderer/index.css.
 *
 * WHY
 * The Terminal was written against raw zinc/sky/emerald ramps instead of the
 * token layer every other page uses:
 *   1. `bg-zinc-950` is a neutral black, but --background is a blue-cast black
 *      (oklch hue 262). The page reads a different temperature from the app.
 *   2. Hardcoded classes are not theme-aware. In light mode the Terminal stays
 *      a black island, because nothing overrides a raw zinc utility.
 *
 * WHAT
 * Maps the neutral (zinc) ramp onto structural tokens:
 *   background / card / muted / accent  → surfaces
 *   foreground / muted-foreground       → text (4 tiers from 2 tokens)
 *   border / ring                       → hairlines
 *
 * Status colours (emerald=approved, rose=error, sky=running, violet=note) are
 * LEFT ALONE by default: they are load-bearing semantics rather than chrome,
 * and they read correctly in both themes. Pass --status to remap them onto the
 * brand accent — purer, but it changes the colour language, so it needs eyes.
 *
 * USAGE
 *   node scripts/tokenize-terminal.mjs          # dry run (default)
 *   node scripts/tokenize-terminal.mjs --write  # apply
 *   node scripts/tokenize-terminal.mjs --write --status
 *
 * Idempotent: re-running finds nothing to change.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Files in scope. XtermPane.tsx is deliberately EXCLUDED: it hands raw hex
 * values to the xterm.js canvas, which cannot read Tailwind classes. Theming
 * it is a structural change (getComputedStyle + oklch→hex + a theme-change
 * listener), not a find-and-replace.
 */
const FILES = [
  'src/components/terminal/CommandBlock.tsx',
  'src/components/terminal/TerminalGoalInput.tsx',
  'src/components/terminal/TerminalWelcome.tsx',
  'src/renderer/pages/Terminal.tsx',
  'src/components/sidebar/TerminalMenu.tsx',
];

/**
 * Neutral ramp → structural tokens.
 *
 * The text ramp deserves a note. shadcn exposes only two text tokens, but the
 * Terminal used six zinc shades to build hierarchy (prompt vs command vs
 * thought vs dimmed hint). Collapsing all six onto two would flatten the
 * density cues that make a terminal readable, so the faint tiers are rebuilt
 * with alpha modifiers on --muted-foreground. That yields four visual tiers
 * from two tokens and survives the light theme inverting the ramp.
 */
const NEUTRAL_MAP = {
  // surfaces
  'bg-zinc-950': 'bg-background',
  'bg-zinc-900': 'bg-card',
  'bg-zinc-800': 'bg-muted',
  'bg-zinc-700': 'bg-accent',

  // text tier 1 (primary)
  'text-zinc-100': 'text-foreground',
  'text-zinc-200': 'text-foreground',

  // text tier 2 (secondary)
  'text-zinc-300': 'text-muted-foreground',
  'text-zinc-400': 'text-muted-foreground',

  // text tiers 3-4 (tertiary / faint) — same token, stepped by alpha
  'text-zinc-500': 'text-muted-foreground/75',
  'text-zinc-600': 'text-muted-foreground/60',
  'text-zinc-700': 'text-muted-foreground/45',

  // hairlines
  'border-zinc-700': 'border-border',
  'border-zinc-800': 'border-border',
  'ring-zinc-800': 'ring-ring',
};


/**
 * Opt-in (`--status`): collapse status semantics onto the brand accent.
 * Not applied by default — emerald/rose carry "approved"/"failed" as a learned
 * convention and primary is azure, so this trades recognability for purity.
 * Verify visually if you use it.
 */
const STATUS_MAP = {
  'text-emerald-400': 'text-primary',
  'text-emerald-300': 'text-primary',
  'bg-emerald-600': 'bg-primary',
  'text-rose-400': 'text-destructive',
  'text-rose-300': 'text-destructive',
  'text-sky-400': 'text-primary',
  'text-sky-300': 'text-primary',
  'text-violet-400': 'text-accent-foreground',
  'text-violet-300': 'text-accent-foreground',
};

const argv = new Set(process.argv.slice(2));
const APPLY = argv.has('--write');
const WITH_STATUS = argv.has('--status');
const map = WITH_STATUS ? { ...NEUTRAL_MAP, ...STATUS_MAP } : NEUTRAL_MAP;

/** Any palette utility, optionally with an /alpha suffix. */
const CLASS_RE =
  /\b(bg|text|border|ring)-(zinc|sky|emerald|rose|amber|violet|orange|purple|indigo|green|red|slate|neutral|stone|blue|yellow|teal|cyan|pink|lime)-(\d{2,3})(\/\d{1,3})?\b/g;

const kept = new Set();
const perFile = [];
let totalEdits = 0;

for (const rel of FILES) {
  const abs = path.join(ROOT, rel);
  const before = readFileSync(abs, 'utf8');
  let fileEdits = 0;

  const after = before.replace(CLASS_RE, (match, prefix, family, shade, alpha) => {
    const key = `${prefix}-${family}-${shade}`;
    const mapped = map[key];
    if (!mapped) {
      kept.add(match);
      return match;
    }
    // An explicit modifier on the source wins; otherwise use whatever alpha the
    // map itself specifies (that is how the faint text tiers get opacity).
    // Bare `border-border` stays bare so the token's own alpha does the work.
    const suffix = alpha ?? (mapped.includes('/') ? null : '');
    fileEdits++;
    return suffix ? `${mapped}/${suffix.replace('/', '')}` : mapped;
  });

  if (after !== before) {
    perFile.push({ rel, edits: fileEdits });
    totalEdits += fileEdits;
    if (APPLY) writeFileSync(abs, after, 'utf8');
  }
}

const c = {
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
};

console.log(
  c.bold(`\n  Vellum token codemod  ${c.dim(APPLY ? '· WRITE' : '· dry run')}${WITH_STATUS ? ' · +status' : ''}\n`),
);
for (const { rel, edits } of perFile) {
  console.log(`  ${c.green('●')} ${rel.padEnd(46)} ${String(edits).padStart(3)} classes`);
}
if (perFile.length === 0) {
  console.log(c.dim('  nothing to change — already tokenized (idempotent)'));
}
console.log(`\n  ${c.bold(String(totalEdits))} class replacements across ${perFile.length} files`);

if (kept.size) {
  const list = [...kept].sort().join(', ');
  console.log(`\n  ${c.yellow('kept')} ${kept.size} classes — no structural token maps to these:`);
  console.log(c.dim(`        ${list}`));
  if (!WITH_STATUS) {
    console.log(c.dim('        (status semantics — intentional. pass --status to remap)'));
  }
}
console.log(c.dim('  excluded: XtermPane.tsx — canvas needs real colours, not classes'));

console.log(
  APPLY ? c.green(c.bold('\n  ✓ written\n')) : c.yellow(c.bold('\n  dry run — pass --write to apply\n')),
);
