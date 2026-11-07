/**
 * lib/trace/filters/serialize.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Serialise a `TraceFilter` into the SVG markup that belongs inside `<defs>`,
 * and parse it back out of arbitrary defs markup so imported SVG round-trips.
 *
 * The output is deliberately hand-written rather than templated from the
 * structured model so the markup is byte-identical to what a designer would
 * author — copilots and exports can both consume it.
 */

import type { FilterParamValue, FilterPrimitive, TraceFilter } from './types';

const ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

function escapeXml(value: string): string {
  return String(value).replace(/[&<>"']/g, (char) => ESCAPE_MAP[char] ?? char);
}

/** Only scalar param values become attributes; arrays are child elements. */
function isScalarParam(value: FilterParamValue): value is string | number | boolean {
  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

function attr(name: string, value: string | number | boolean | undefined): string {
  if (value === undefined || value === null) return '';
  if (value === false) return '';
  const text = value === true ? '' : String(value);
  return ` ${name}="${escapeXml(text)}"`;
}

function renderPrimitive(p: FilterPrimitive, indent: string): string {
  const base = [`${indent}<${p.kind}`];
  if (p.id) base.push(attr('id', p.id));
  if (p.result) base.push(attr('result', p.result));
  if (p.in !== undefined) base.push(attr('in', p.in));
  if (p.in2 !== undefined) base.push(attr('in2', p.in2));

  if (p.kind === 'feMerge') {
    const nodes = Array.isArray(p.params?.mergeNodes)
      ? (p.params!.mergeNodes as Array<string | { in: string }>)
      : [];
    base.push('>');
    for (const node of nodes) {
      const ref = typeof node === 'string' ? node : node.in;
      base.push(`\n${indent}  <feMergeNode in="${escapeXml(ref)}"/>`);
    }
    base.push(`\n${indent}</feMerge>`);
    return base.join('');
  }

  if (p.kind === 'feComponentTransfer') {
    base.push('>');
    for (const ch of ['feFuncR', 'feFuncG', 'feFuncB', 'feFuncA']) {
      const chParams = p.params?.[ch] as Record<string, string | number> | undefined;
      if (!chParams) continue;
      let tag = `\n${indent}  <${ch}`;
      for (const [k, v] of Object.entries(chParams)) tag += attr(k, v);
      tag += '/>';
      base.push(tag);
    }
    base.push(`\n${indent}</feComponentTransfer>`);
    return base.join('');
  }

  if (p.kind === 'feDiffuseLighting' || p.kind === 'feSpecularLighting') {
    base.push('>');
    const light = p.params?.light as
      | Record<string, string | number>
      | undefined;
    if (light?.kind) {
      let tag = `\n${indent}  <fe${String(light.kind).charAt(0).toUpperCase()}${String(light.kind).slice(1)}Light`;
      for (const [k, v] of Object.entries(light)) {
        if (k === 'kind') continue;
        tag += attr(k, v);
      }
      tag += '/>';
      base.push(tag);
    }
    // other lighting params go as attrs on the parent
    if (p.params) {
      for (const [k, v] of Object.entries(p.params)) {
        if (k === 'light' || !isScalarParam(v)) continue;
        base.push(attr(k, v));
      }
    }
    base.push(`\n${indent}</${p.kind}>`);
    return base.join('');
  }

  if (p.params) {
    for (const [key, value] of Object.entries(p.params)) {
      if (key === 'mergeNodes' || key === 'light') continue;
      if (!isScalarParam(value)) continue;
      base.push(attr(key, value));
    }
  }
  base.push('/>');
  return base.join('');
}

/** Render one `<filter>` element, including its primitives, as SVG markup. */
export function filterToSvg(filter: TraceFilter): string {
  const r = typeof filter.region === 'number' ? filter.region : 10;
  const x = `-${r}%`;
  const y = `-${r}%`;
  const w = `${100 + 2 * r}%`;
  const h = `${100 + 2 * r}%`;
  const colorSpace = filter.colorSpace ?? 'linearRGB';
  const primitives = filter.primitives
    .map((p) => renderPrimitive(p, '    '))
    .join('\n');
  return [
    `  <filter id="${escapeXml(filter.id)}" x="${x}" y="${y}" width="${w}" height="${h}" color-interpolation-filters="${colorSpace}">`,
    primitives,
    '  </filter>',
  ].join('\n');
}

/** Render a list of filters as a single defs fragment (no `<defs>` wrapper). */
export function filtersToDefs(filters: TraceFilter[]): string {
  if (filters.length === 0) return '';
  return filters.map(filterToSvg).join('\n\n');
}

/* ── Parsing ────────────────────────────────────────────────────────────────── */

const TAG_RE = /<([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g;
const ATTR_RE = /\s([a-zA-Z-:]+)="([^"]*)"/g;

function parseAttrs(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  let match: RegExpExecArray | null;
  ATTR_RE.lastIndex = 0;
  while ((match = ATTR_RE.exec(text)) !== null) {
    out[match[1]] = match[2];
  }
  return out;
}

/** Extract every `<filter id="…">…</filter>` block from arbitrary defs markup. */
export function parseFiltersFromDefs(defs: string | undefined): TraceFilter[] {
  if (!defs) return [];
  const filters: TraceFilter[] = [];
  let match: RegExpExecArray | null;
  TAG_RE.lastIndex = 0;
  const stack: Array<{ tag: string; attrs: Record<string, string>; children: string[] }> = [];
  while ((match = TAG_RE.exec(defs)) !== null) {
    const [, tag, attrText, selfClosing] = match;
    const attrs = parseAttrs(attrText);
    if (tag === 'filter') {
      stack.push({ tag, attrs, children: [] });
    } else if (tag === '/filter') {
      const block = stack.pop();
      if (!block) continue;
      const xVal = block.attrs.x ? parseFloat(block.attrs.x) : -10;
      const region = Number.isFinite(xVal) ? Math.abs(xVal) : 10;
      const primitives: FilterPrimitive[] = [];
      for (const child of block.children) {
        TAG_RE.lastIndex = 0;
        const pMatch = TAG_RE.exec(child);
        if (!pMatch) continue;
        const pTag = pMatch[1];
        if (pTag.startsWith('/')) continue;
        const pAttrs = parseAttrs(pMatch[2]);
        const params: Record<string, string | number | boolean> = {};
        for (const [k, v] of Object.entries(pAttrs)) {
          if (k === 'id' || k === 'result' || k === 'in' || k === 'in2') continue;
          const num = Number(v);
          params[k] = Number.isFinite(num) && v.trim() !== '' ? num : v;
        }
        primitives.push({
          id: pAttrs.id ?? pTag,
          kind: pTag as FilterPrimitive['kind'],
          result: pAttrs.result,
          in: pAttrs.in,
          in2: pAttrs.in2,
          params,
        });
      }
      filters.push({
        id: block.attrs.id ?? `filter-${filters.length}`,
        label: block.attrs.id ?? `Filter ${filters.length + 1}`,
        kind: 'custom',
        region,
        colorSpace: block.attrs['color-interpolation-filters'] as TraceFilter['colorSpace'],
        primitives,
      });
    } else if (stack.length > 0) {
      stack[stack.length - 1].children.push(match[0]);
    }
  }
  return filters;
}