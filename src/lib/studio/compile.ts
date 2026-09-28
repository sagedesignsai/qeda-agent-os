/**
 * lib/studio/compile.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Compiles a Studio document (`doc.ts`) into one self-contained HTML string,
 * plus a plain-text outline of the same document.
 *
 * The HTML is a RENDER TARGET ONLY. It is regenerated from the document on every
 * load, never parsed back, never stored as the source of truth. That is what
 * keeps a composition diffable, mergeable and LLM-editable; the cost is that
 * this compiler must be *deterministic* — same document in, byte-identical
 * string out, forever — or exports are not reproducible.
 *
 * Three invariants this file exists to hold:
 *
 *  1. NO CLASS NAMES, EVER. Everything is an inline `style` attribute plus one
 *     generated `<style>` block. Tailwind is deliberately not an option: v4
 *     purges classes it cannot see in a registered `@source` directory, and
 *     classes produced at *runtime* (which is exactly what a compiler emits)
 *     get dropped with zero diagnostics — a silently unstyled export. Inline
 *     styles cannot be purged, so they cannot vanish. The `no class attributes`
 *     test is the guard rail.
 *
 *  2. EVERYTHING INTERPOLATED IS ESCAPED. Text content AND attribute values
 *     AND values interpolated into the `<style>` block. A composition carries
 *     author- and LLM-supplied strings; none of them may ever close a tag, an
 *     attribute or the style element. Escaping is centralised in `escapeText` /
 *     `escapeAttr` / `cssSafe` rather than sprinkled at call sites, because a
 *     missed call site is an XSS in a renderer that will eventually preview
 *     user content in a srcdoc iframe.
 *
 *  3. SELF-CONTAINED. No network, no webfonts, no external anything: the CSP
 *     meta below is `default-src 'none'`. It is load-bearing, not decoration —
 *     a srcdoc iframe inherits the parent's policy, and the app's own CSP has
 *     no `default-src`, so without this an export could reach out to anything.
 *     Fonts are a CSS variable holding a system stack, so text metrics are the
 *     same on every machine and layout does not shift per host.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  type Align,
  type AnimationPreset,
  type Color,
  type FrameNode,
  type GroupNode,
  type ImageNode,
  type Justify,
  type ShapeNode,
  type StudioDoc,
  type StudioNode,
  type TextNode,
  type TokenName,
} from './doc';
import { TOKEN_COLORS, TOKEN_NAMES, tokenVarName } from './tokens';

export type {
  Align,
  AnimationPreset,
  Color,
  FrameNode,
  GroupNode,
  ImageNode,
  Justify,
  ShapeNode,
  StudioDoc,
  StudioNode,
  TextNode,
};

// ─────────────────────────────────────────────────────────────────────────────
// Escaping
// ─────────────────────────────────────────────────────────────────────────────

const TEXT_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Escape for HTML *text content*. Quotes are escaped too, even though they are
 * inert there: text nodes round-trip through tools and UIs that treat the
 * string as an attribute, and `"` appearing raw in an export is the kind of
 * thing that only fails in production.
 */
export function escapeText(value: string): string {
  return value.replace(/[&<>"']/g, (c) => TEXT_ESCAPES[c] ?? c);
}

/**
 * Escape for a double-quoted HTML *attribute* value. Single quotes are left
 * alone on purpose: the CSP meta tag is full of them (`default-src 'none'`),
 * and leaving them literal keeps the emitted policy greppable while remaining
 * correct inside double quotes.
 */
export function escapeAttr(value: string): string {
  return value.replace(/[&<>"]/g, (c) => TEXT_ESCAPES[c] ?? c);
}

/**
 * Last line of defence for anything interpolated into the `<style>` block: no
 * angle brackets (so nothing can close the element early), no backslash (no CSS
 * escapes smuggled in), and no newlines (so a value cannot inject a new rule).
 * Applied after the value has been built from validated numbers, hex and
 * token names.
 */
function cssSafe(value: string): string {
  return value.replace(/[<>{}\\]/g, '').replace(/[\r\n]+/g, ' ');
}

// ─────────────────────────────────────────────────────────────────────────────
// Value formatting
// ─────────────────────────────────────────────────────────────────────────────

/** Fixed-precision number → shortest safe CSS token. Never exponential. */
function num(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}

function tokenColor(name: TokenName): string {
  return TOKEN_COLORS[name];
}

/** Resolve a `Color` to a CSS colour. Tokens stay in the emitted CSS as `var()`. */
function color(c: Color): string {
  switch (c.kind) {
    case 'token':
      // Reference the custom property rather than inlining: the :root block is
      // the single place a value appears, which keeps the output short and
      // makes a token change a one-line diff.
      return `var(${tokenVarName(c.name)})`;
    case 'hex':
      return c.value;
    case 'rgba':
      return `rgba(${c.rgba.map(num).join(',')})`;
    default:
      // Unreachable for any schema-valid `Color` — the union is exactly the
      // three cases above. `z.infer` widens the union enough that TS cannot
      // prove the switch exhaustive, so guard it here rather than letting an
      // unhandled kind fall through as `undefined`.
      throw new Error(`Unknown color kind: ${String((c as Color).kind)}`);
  }
}

const JUSTIFY_CSS: Record<Justify, string> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  'space-between': 'space-between',
  'space-around': 'space-around',
  'space-evenly': 'space-evenly',
};

function background(bg: FrameNode['background']): string {
  switch (bg.kind) {
    case 'token':
      return `var(${tokenVarName(bg.name)})`;
    case 'hex':
      return bg.value;
    case 'linear-gradient': {
      // Sorted by offset so the emitted string does not depend on author
      // ordering — two documents that mean the same gradient compile the same.
      const stops = [...bg.stops]
        .sort((a, b) => a.offset - b.offset)
        .map((s) => {
          const value = s.token ? tokenColor(s.token) : (s.hex ?? 'transparent');
          return `${cssSafe(value)} ${num(s.offset * 100)}%`;
        });
      return `linear-gradient(${num(bg.angle)}deg,${stops.join(',')})`;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Animation
// ─────────────────────────────────────────────────────────────────────────────

/** Motion presets. Keyframes only — opacity/transform, nothing composited. */
const ANIMATION_CSS: Record<AnimationPreset, string> = {
  none: '',
  'fade-in': '@keyframes studio-fade-in{from{opacity:0}to{opacity:1}}',
  'rise-in':
    '@keyframes studio-rise-in{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}',
  'slide-in-left':
    '@keyframes studio-slide-in-left{from{opacity:0;transform:translateX(-24px)}to{opacity:1;transform:none}}',
  'scale-in':
    '@keyframes studio-scale-in{from{opacity:0;transform:scale(0.94)}to{opacity:1;transform:none}}',
};

const ANIMATION_DECLARATION: Record<AnimationPreset, string> = {
  none: '',
  'fade-in': 'animation:studio-fade-in 420ms cubic-bezier(0.22,1,0.36,1) both',
  'rise-in': 'animation:studio-rise-in 520ms cubic-bezier(0.22,1,0.36,1) both',
  'slide-in-left':
    'animation:studio-slide-in-left 520ms cubic-bezier(0.22,1,0.36,1) both',
  'scale-in': 'animation:studio-scale-in 460ms cubic-bezier(0.22,1,0.36,1) both',
};

function animationStyle(a: AnimationPreset | undefined): string {
  if (!a || a === 'none') return '';
  return ANIMATION_DECLARATION[a];
}

/** Every animation preset referenced anywhere in the tree, in enum order. */
function collectAnimations(node: StudioNode, into: Set<AnimationPreset>): void {
  if (node.kind === 'frame' || node.kind === 'text') {
    if (node.animation && node.animation !== 'none') into.add(node.animation);
  }
  if (node.kind === 'frame' || node.kind === 'group') {
    for (const child of node.children) collectAnimations(child, into);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Node compilation
// ─────────────────────────────────────────────────────────────────────────────

const ALIGN_CSS: Record<Align, string> = {
  left: 'left',
  center: 'center',
  right: 'right',
};

/**
 * Join declarations and escape once, for the `style` attribute. Entries may be
 * `false`/`undefined` when a declaration is conditional — the conditional
 * branches read better than building arrays imperatively.
 */
function styleAttr(declarations: (string | boolean | undefined | null)[]): string {
  const css = declarations
    .filter((d): d is string => typeof d === 'string' && d.length > 0)
    .join(';');
  return ` style="${escapeAttr(cssSafe(css))}"`;
}

/** Absolute local path → `file://` URI. Data URIs pass through untouched. */
function imageSrc(src: string): string {
  if (/^data:/i.test(src)) return src;
  const withSlashes = src.replace(/\\/g, '/');
  return `file://${withSlashes.startsWith('/') ? '' : '/'}${encodeURI(withSlashes)}`;
}

function compileFrame(node: FrameNode, depth: number): string {
  const declarations: (string | false)[] = [
    'display:flex',
    `flex-direction:${node.direction}`,
    `align-items:${ALIGN_CSS[node.align]}`,
    `justify-content:${JUSTIFY_CSS[node.justify]}`,
    `gap:${num(node.gap)}px`,
    `padding:${num(node.padding)}px`,
    `width:${num(node.w)}px`,
    `height:${num(node.h)}px`,
    `box-sizing:border-box`,
    `flex:none`,
    node.radius > 0 ? `border-radius:${num(node.radius)}px` : false,
    `background:${cssSafe(background(node.background))}`,
    animationStyle(node.animation),
  ];
  const body = node.children
    .map((child) => compileNode(child, depth + 1))
    .join('\n');
  const pad = '  '.repeat(depth);
  return `${pad}<div${styleAttr(declarations)}>${
    body ? `\n${body}\n${pad}` : ''
  }</div>`;
}

function compileText(node: TextNode, depth: number): string {
  const declarations = [
    'margin:0',
    `font-family:var(--studio-font)`,
    `font-size:${num(node.size)}px`,
    `font-weight:${num(node.weight)}`,
    `line-height:${num(node.lineHeight)}`,
    `letter-spacing:${num(node.letterSpacing)}px`,
    `color:${cssSafe(color(node.color))}`,
    `text-align:${ALIGN_CSS[node.align]}`,
    `max-width:${num(node.maxWidth)}px`,
    'white-space:pre-wrap',
    'box-sizing:border-box',
    animationStyle(node.animation),
  ];
  const pad = '  '.repeat(depth);
  return `${pad}<div${styleAttr(declarations)}>${escapeText(
    node.content,
  )}</div>`;
}

function compileImage(node: ImageNode, depth: number): string {
  const declarations = [
    'display:block',
    node.w !== undefined ? `width:${num(node.w)}px` : false,
    node.h !== undefined ? `height:${num(node.h)}px` : false,
    node.w === undefined && node.h === undefined ? 'flex:1 1 auto' : false,
    'object-fit:' + node.fit,
    node.radius > 0 ? `border-radius:${num(node.radius)}px` : false,
    'box-sizing:border-box',
  ];
  const pad = '  '.repeat(depth);
  return `${pad}<img${styleAttr(declarations)} src="${escapeAttr(
    cssSafe(imageSrc(node.src)),
  )}" alt="">`;
}

function compileShape(node: ShapeNode, depth: number): string {
  const radius =
    node.shape === 'ellipse'
      ? '999px' // a true ellipse, independent of the box aspect
      : node.shape === 'line'
        ? '0'
        : `${num(node.radius)}px`;
  const declarations = [
    `width:${num(node.w)}px`,
    `height:${num(node.h)}px`,
    `background:${cssSafe(color(node.fill))}`,
    `border-radius:${radius}`,
    'flex:none',
    'box-sizing:border-box',
  ];
  const pad = '  '.repeat(depth);
  return `${pad}<div${styleAttr(declarations)}></div>`;
}

function compileGroup(node: GroupNode, depth: number): string {
  const transforms: string[] = [];
  if (node.rotate !== undefined && node.rotate !== 0) {
    transforms.push(`rotate(${num(node.rotate)}deg)`);
  }
  if (node.scale !== undefined && node.scale !== 1) {
    transforms.push(`scale(${num(node.scale)})`);
  }
  const declarations = [
    'display:flex',
    'flex-direction:column',
    'box-sizing:border-box',
    node.opacity !== undefined ? `opacity:${num(node.opacity)}` : false,
    transforms.length > 0 ? `transform:${transforms.join(' ')}` : false,
  ];
  const body = node.children
    .map((child) => compileNode(child, depth + 1))
    .join('\n');
  const pad = '  '.repeat(depth);
  return `${pad}<div${styleAttr(declarations)}>${
    body ? `\n${body}\n${pad}` : ''
  }</div>`;
}

function compileNode(node: StudioNode, depth: number): string {
  switch (node.kind) {
    case 'frame':
      return compileFrame(node, depth);
    case 'text':
      return compileText(node, depth);
    case 'image':
      return compileImage(node, depth);
    case 'shape':
      return compileShape(node, depth);
    case 'group':
      return compileGroup(node, depth);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Document assembly
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `default-src 'none'` plus the narrowest allowances a composition needs:
 * inline styles (there are no class names, and there will never be any), data:
 * fonts (in case a future node inlines one), and data:/file: images. Anything a
 * document reaches for beyond this is a bug, not a feature request.
 */
const CSP =
  "default-src 'none'; img-src data: file:; style-src 'unsafe-inline'; font-src data:";

/** System stack only — no webfont means no FOUT and no per-host metric drift. */
const FONT_STACK =
  "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif";

function styleBlock(doc: StudioDoc, keyframes: string[]): string {
  // Note: this builds an *array* of lines. Spreading a pre-joined string here
  // would spread it character-by-character.
  const rootVars = TOKEN_NAMES.map(
    (name) => `  ${tokenVarName(name)}:${TOKEN_COLORS[name]};`,
  );
  return [
    ':root {',
    `  --studio-font: ${FONT_STACK};`,
    ...rootVars,
    '}',
    'html,body { margin:0; padding:0; background:#ffffff; }',
    `body { width:${num(doc.w)}px; height:${num(doc.h)}px; overflow:hidden; }`,
    '* { box-sizing:border-box; }',
    ...keyframes,
  ].join('\n');
}

/**
 * Compile a document to a complete, self-contained HTML document string.
 * Deterministic: identical input always yields byte-identical output.
 */
export function compileDoc(doc: StudioDoc): string {
  const used = new Set<AnimationPreset>();
  collectAnimations(doc, used);
  const keyframes = [...used].map((a) => ANIMATION_CSS[a]);
  const root = compileFrame(doc, 1);

  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${escapeAttr(CSP)}">`,
    '<style>',
    styleBlock(doc, keyframes),
    '</style>',
    '</head>',
    '<body>',
    root,
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Outline
// ─────────────────────────────────────────────────────────────────────────────

const OUTLINE_MAX_CONTENT = 80;

function oneLine(value: string): string {
  const flat = value.replace(/\s+/g, ' ').trim();
  return flat.length > OUTLINE_MAX_CONTENT
    ? `${flat.slice(0, OUTLINE_MAX_CONTENT - 1)}…`
    : flat;
}

function colorLabel(c: Color): string {
  switch (c.kind) {
    case 'token':
      return `token/${c.name}`;
    case 'hex':
      return c.value;
    case 'rgba':
      return `rgba(${c.rgba.join(',')})`;
    default:
      // Unreachable for any schema-valid `Color` — see `color()` above.
      throw new Error(`Unknown color kind: ${String((c as Color).kind)}`);
  }
}

function backgroundLabel(bg: FrameNode['background']): string {
  switch (bg.kind) {
    case 'token':
      return `token/${bg.name}`;
    case 'hex':
      return bg.value;
    case 'linear-gradient':
      return `linear-gradient ${bg.angle}deg ×${bg.stops.length}`;
  }
}

function outlineNode(node: StudioNode, depth: number, into: string[]): void {
  const pad = '  '.repeat(depth);
  const arrow = depth > 0 ? '> ' : '';
  switch (node.kind) {
    case 'frame':
      into.push(
        `${pad}${arrow}frame ${num(node.w)}x${num(node.h)} (bg: ${backgroundLabel(
          node.background,
        )}, ${node.direction}, gap ${num(node.gap)}, pad ${num(node.padding)}, align ${node.align}, justify ${node.justify})`,
      );
      break;
    case 'text':
      into.push(
        `${pad}${arrow}text "${oneLine(node.content)}" (size ${num(
          node.size,
        )}, weight ${num(node.weight)}, ${colorLabel(node.color)})`,
      );
      break;
    case 'image':
      into.push(
        `${pad}${arrow}image ${node.w !== undefined ? `${num(node.w)}x` : 'auto'}${
          node.h !== undefined ? num(node.h) : 'auto'
        } (fit ${node.fit})`,
      );
      break;
    case 'shape':
      into.push(
        `${pad}${arrow}shape ${node.shape} ${num(node.w)}x${num(node.h)} (fill: ${colorLabel(
          node.fill,
        )})`,
      );
      break;
    case 'group':
      into.push(
        `${pad}${arrow}group${
          node.opacity !== undefined ? ` (opacity ${num(node.opacity)})` : ''
        }`,
      );
      break;
  }
  if (node.kind === 'frame' || node.kind === 'group') {
    for (const child of node.children) outlineNode(child, depth + 1, into);
  }
}

/**
 * A compact, human-readable outline of the document.
 *
 * This exists because an LLM reasons about `frame 1200x630 > text "Hello"
 * (size 48, primary)` far better than it reasons about 4KB of JSON, and it is
 * 10× cheaper to put in a tool response. It is a *view*, never a parse target —
 * the structured document stays the source of truth.
 */
export function docOutline(doc: StudioDoc): string {
  const lines: string[] = [];
  outlineNode(doc, 0, lines);
  return lines.join('\n');
}
