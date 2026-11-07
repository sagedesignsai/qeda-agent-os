/**
 * lib/trace/serialize/svg-markup.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Static SVG serialization for a Trace element graph at a point in time.
 *
 * Shared by the animated-SVG exporter, the GSAP code generator and poster
 * rendering. The DOM contract matches the editor stage exactly:
 * `id="trace-elem-<id>"` and `data-trace-id`.
 *
 * Pure string building — no React, no DOM.
 */

import { filtersToDefs } from '../filters/serialize';
import { resolveElementAtTime } from '../runtime/resolve-element';
import { migrateTraceProject } from '../migrate';
import type { TraceElement, TraceGradient, TraceProject } from '../types';

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function num(value: unknown, fallback = 0): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function paint(value: unknown, fallback: string): string {
  if (value === undefined || value === null || value === '') return fallback;
  return escapeXml(String(value));
}

function gradientAngle(gradient: TraceGradient): {
  x1: string;
  y1: string;
  x2: string;
  y2: string;
} {
  const radians = ((gradient.angle ?? 0) * Math.PI) / 180;
  const dx = Math.cos(radians) / 2;
  const dy = Math.sin(radians) / 2;
  return {
    x1: `${50 - dx * 100}%`,
    y1: `${50 - dy * 100}%`,
    x2: `${50 + dx * 100}%`,
    y2: `${50 + dy * 100}%`,
  };
}

export function gradientsToDefs(
  gradients?: Record<string, TraceGradient> | null,
): string {
  if (!gradients) return '';
  const defs = Object.values(gradients).map((gradient) => {
    const stops = gradient.stops
      .slice()
      .sort((a, b) => a.offset - b.offset)
      .map(
        (stop) =>
          `<stop offset="${Math.max(0, Math.min(1, stop.offset))}" stop-color="${paint(
            stop.color,
            '#ffffff',
          )}" stop-opacity="${Math.max(0, Math.min(1, stop.opacity ?? 1))}" />`,
      )
      .join('');

    if (gradient.type === 'radial') {
      return `<radialGradient id="${escapeXml(gradient.id)}" cx="${num(gradient.cx, 0.5)}" cy="${num(
        gradient.cy,
        0.5,
      )}" r="${num(gradient.r, 0.5)}">${stops}</radialGradient>`;
    }

    const { x1, y1, x2, y2 } = gradientAngle(gradient);
    return `<linearGradient id="${escapeXml(gradient.id)}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops}</linearGradient>`;
  });

  return defs.join('');
}

export function polygonPoints(sides: number, radius: number): string {
  const count = Math.max(3, Math.round(sides));
  const points: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const angle = (Math.PI * 2 * index) / count - Math.PI / 2;
    points.push(`${radius * Math.cos(angle)},${radius * Math.sin(angle)}`);
  }
  return points.join(' ');
}

export function starPoints(radius: number, ratio: number): string {
  const points: string[] = [];
  for (let index = 0; index < 10; index += 1) {
    const current = index % 2 === 0 ? radius : radius * ratio;
    const angle = (Math.PI * index) / 5 - Math.PI / 2;
    points.push(`${current * Math.cos(angle)},${current * Math.sin(angle)}`);
  }
  return points.join(' ');
}

function paintAttrs(
  attributes: Record<string, any>,
  defaultFill = '#38bdf8',
): string {
  const stroke =
    attributes.stroke && attributes.stroke !== 'none'
      ? String(attributes.stroke)
      : 'none';
  return [
    `fill="${paint(attributes.fill, defaultFill)}"`,
    `fill-opacity="${num(attributes.fillOpacity, 1)}"`,
    `stroke="${paint(stroke, 'none')}"`,
    `stroke-width="${num(attributes.strokeWidth, 0)}"`,
    attributes.strokeLinecap
      ? `stroke-linecap="${escapeXml(String(attributes.strokeLinecap))}"`
      : '',
    attributes.strokeLinejoin
      ? `stroke-linejoin="${escapeXml(String(attributes.strokeLinejoin))}"`
      : '',
    attributes.strokeDasharray
      ? `stroke-dasharray="${escapeXml(String(attributes.strokeDasharray))}"`
      : '',
  ]
    .filter(Boolean)
    .join(' ');
}

function trimAttrs(attributes: Record<string, any>): string {
  if (attributes.trimStart === undefined && attributes.trimEnd === undefined)
    return '';
  // Approximate the visible segment with a percentage dash; the exporter
  // replaces this with precise lengths when it has path geometry.
  const start = num(attributes.trimStart, 0);
  const end = num(attributes.trimEnd, 100);
  const visible = Math.max(0, end - start);
  return ` pathLength="100" stroke-dasharray="${visible} 200" stroke-dashoffset="${-start}"`;
}

export function elementBodyMarkup(
  element: TraceElement,
  attributes: Record<string, any>,
): string {
  const width = num(attributes.width, 100);
  const height = num(attributes.height, 100);

  switch (element.type) {
    case 'text':
      return `<text x="0" y="0" ${paintAttrs(attributes, '#ffffff')} font-size="${num(
        attributes.fontSize,
        24,
      )}" font-family="${escapeXml(String(attributes.fontFamily ?? 'Inter, sans-serif'))}" font-weight="${escapeXml(
        String(attributes.fontWeight ?? 400),
      )}" font-style="${escapeXml(String(attributes.fontStyle ?? 'normal'))}" letter-spacing="${num(
        attributes.letterSpacing,
        0,
      )}" text-anchor="${escapeXml(String(attributes.textAnchor ?? 'start'))}" dominant-baseline="${escapeXml(
        String(attributes.dominantBaseline ?? 'middle'),
      )}">${escapeXml(String(attributes.text ?? ''))}</text>`;

    case 'rect':
      return `<rect x="0" y="0" width="${width}" height="${height}" rx="${num(
        attributes.rx,
        0,
      )}" ry="${num(attributes.ry, num(attributes.rx, 0))}" ${paintAttrs(attributes)} />`;

    case 'circle':
      return `<circle cx="${num(attributes.cx, width / 2)}" cy="${num(
        attributes.cy,
        height / 2,
      )}" r="${num(
        attributes.r,
        num(attributes.radius, width / 2),
      )}" ${paintAttrs(attributes)} />`;

    case 'ellipse':
      return `<ellipse cx="${width / 2}" cy="${height / 2}" rx="${num(
        attributes.rx,
        width / 2,
      )}" ry="${num(attributes.ry, height / 2)}" ${paintAttrs(attributes)} />`;

    case 'line':
      return `<line x1="${num(attributes.x1, 0)}" y1="${num(
        attributes.y1,
        0,
      )}" x2="${num(attributes.x2, width)}" y2="${num(
        attributes.y2,
        height,
      )}" ${paintAttrs(attributes, 'none')} />`;

    case 'polyline':
      return `<polyline points="${escapeXml(
        String(attributes.points ?? ''),
      )}" ${paintAttrs(attributes, 'none')}${trimAttrs(attributes)} />`;

    case 'polygon': {
      if (attributes.points) {
        return `<polygon points="${escapeXml(
          String(attributes.points),
        )}" ${paintAttrs(attributes)} />`;
      }
      return `<polygon points="${polygonPoints(
        num(attributes.polygonSides, num(attributes.sides, 5)),
        width / 2,
      )}" transform="translate(${width / 2} ${height / 2})" ${paintAttrs(
        attributes,
      )} />`;
    }

    case 'image':
      return `<image href="${escapeXml(
        String(attributes.href ?? attributes.src ?? ''),
      )}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="${escapeXml(
        String(attributes.preserveAspectRatio ?? 'xMidYMid meet'),
      )}" />`;

    case 'use':
      return `<use href="${escapeXml(
        String(attributes.href ?? ''),
      )}" x="0" y="0" width="${width}" height="${height}" />`;

    case 'path':
      return `<path d="${escapeXml(String(attributes.d ?? ''))}" ${paintAttrs(
        attributes,
        'none',
      )} stroke-linecap="round" stroke-linejoin="round"${trimAttrs(attributes)} />`;

    case 'group':
      return '';

    default:
      return '';
  }
}

export function elementMarkup(
  element: TraceElement,
  timeMs: number,
  options: { includeTransform?: boolean } = {},
): string {
  const { attributes, transform } = resolveElementAtTime(element, timeMs);
  const transformAttr =
    options.includeTransform === false
      ? ''
      : ` transform="translate(${transform.x} ${transform.y}) rotate(${transform.rotation}) scale(${transform.scaleX} ${transform.scaleY})"`;
  const opacity =
    attributes.opacity !== undefined
      ? ` opacity="${num(attributes.opacity, 1)}"`
      : '';
  const filterAttr =
    attributes.filter !== undefined && attributes.filter !== null && attributes.filter !== ''
      ? ` filter="${escapeXml(String(attributes.filter))}"`
      : '';
  return `<g id="trace-elem-${escapeXml(element.id)}" data-trace-id="${escapeXml(
    element.id,
  )}"${transformAttr}${opacity}${filterAttr}>${elementBodyMarkup(element, attributes)}</g>`;
}

/** Render an element subtree (recursively) at `timeMs`. */
export function elementTreeMarkup(
  project: TraceProject,
  elementId: string,
  timeMs: number,
): string {
  const element = project.elements[elementId];
  if (!element || !element.visible) return '';
  const children = (element.childrenIds ?? [])
    .map((childId) => elementTreeMarkup(project, childId, timeMs))
    .join('');
  return elementMarkup(element, timeMs).replace('</g>', `${children}</g>`);
}

export function staticSvgMarkup(
  inputProject: TraceProject,
  timeMs: number,
  options: { background?: string; size?: boolean } = {},
): string {
  const project = migrateTraceProject(inputProject);
  const defs = `${gradientsToDefs(project.gradients)}${filtersToDefs(Object.values(project.filters ?? {}))}${project.defs ?? ''}`;
  const roots = project.rootElementIds
    .map((elementId) => elementTreeMarkup(project, elementId, timeMs))
    .join('\n');
  const background = options.background
    ? `<rect width="${project.width}" height="${project.height}" fill="${escapeXml(options.background)}" />`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${project.width} ${project.height}"${
    options.size ? ` width="${project.width}" height="${project.height}"` : ''
  }>${defs ? `<defs>${defs}</defs>` : ''}${background}${roots}</svg>`;
}
