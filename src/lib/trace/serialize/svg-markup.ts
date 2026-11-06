/**
 * lib/trace/serialize/svg-markup.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Static SVG serialization for a Trace element graph at a point in time.
 *
 * Shared by the animated-SVG exporter, the GSAP code generator and poster
 * rendering. The DOM contract matches the editor stage exactly:
 * `id="trace-elem-<id>"`, `data-trace-id`, and `data-role` internals.
 *
 * Pure string building — no React, no DOM.
 */

import { resolveElementAtTime } from '../runtime/resolve-element';
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

function polygonPoints(sides: number, radius: number): string {
  const count = Math.max(3, Math.round(sides));
  const points: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const angle = (Math.PI * 2 * index) / count - Math.PI / 2;
    points.push(`${radius * Math.cos(angle)},${radius * Math.sin(angle)}`);
  }
  return points.join(' ');
}

function starPoints(radius: number, ratio: number): string {
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
  const kind =
    element.type === 'shape'
      ? String(attributes.shapeKind ?? 'rect')
      : element.type;

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
      )}" data-role="text-content">${escapeXml(String(attributes.text ?? ''))}</text>`;

    case 'kinetic-text':
      return `<text x="0" y="0" ${paintAttrs(attributes, '#ffffff')} font-size="${num(
        attributes.fontSize,
        44,
      )}" font-family="${escapeXml(String(attributes.fontFamily ?? 'Inter, sans-serif'))}" font-weight="${escapeXml(
        String(attributes.fontWeight ?? 800),
      )}" letter-spacing="${num(attributes.letterSpacing, 0)}" text-anchor="${escapeXml(
        String(attributes.textAnchor ?? 'start'),
      )}" dominant-baseline="${escapeXml(
        String(attributes.dominantBaseline ?? 'middle'),
      )}" data-role="kinetic-text-content">${escapeXml(String(attributes.text ?? ''))}</text>`;

    case 'path':
      return `<path d="${escapeXml(String(attributes.d ?? ''))}" ${paintAttrs(
        attributes,
        'none',
      )} stroke-linecap="round" stroke-linejoin="round"${trimAttrs(attributes)} />`;

    case 'counter':
      return `<g><text x="0" y="0" ${paintAttrs(attributes, '#ffffff')} font-size="${num(
        attributes.fontSize,
        48,
      )}" font-weight="${escapeXml(String(attributes.fontWeight ?? 800))}" dominant-baseline="middle" data-role="counter-value">${escapeXml(
        `${attributes.prefix ?? ''}${num(
          attributes.counterValue,
          num(attributes.endVal, 0),
        ).toFixed(num(attributes.decimals, 0))}${attributes.suffix ?? ''}`,
      )}</text>${
        attributes.text
          ? `<text x="0" y="${num(attributes.fontSize, 48) + 8}" ${paintAttrs(
              { fill: attributes.captionColor ?? '#94a3b8', stroke: 'none' },
              '#94a3b8',
            )} font-size="${Math.max(10, num(attributes.fontSize, 48) * 0.28)}" dominant-baseline="middle">${escapeXml(
              String(attributes.text),
            )}</text>`
          : ''
      }</g>`;

    case 'progress-ring': {
      const radius = num(attributes.radius, num(attributes.r, 40));
      const thickness = num(attributes.thickness, 8);
      const progress = Math.max(0, Math.min(100, num(attributes.progress, 0)));
      const circumference = 2 * Math.PI * radius;
      const center = radius + thickness / 2;
      return `<g>
  <circle cx="${center}" cy="${center}" r="${radius}" fill="none" stroke="${paint(
    attributes.trackColor,
    '#1e293b',
  )}" stroke-width="${thickness}" />
  <circle data-role="progress-ring-indicator" cx="${center}" cy="${center}" r="${radius}" fill="none" stroke="${paint(
    attributes.progressColor,
    '#38bdf8',
  )}" stroke-width="${thickness}" stroke-linecap="round" stroke-dasharray="${circumference}" stroke-dashoffset="${
    circumference * (1 - progress / 100)
  }" transform="rotate(-90 ${center} ${center})" />
  <text data-role="progress-ring-label" x="${center}" y="${center}" ${paintAttrs(
    { fill: attributes.fill ?? '#f8fafc', stroke: 'none' },
    '#f8fafc',
  )} font-size="${num(attributes.fontSize, 24)}" font-weight="${escapeXml(
    String(attributes.fontWeight ?? 600),
  )}" text-anchor="middle" dominant-baseline="middle">${Math.round(progress)}%</text>
</g>`;
    }

    case 'bar-chart': {
      const bars: Array<{
        id?: string;
        label?: string;
        value: number;
        color?: string;
      }> = Array.isArray(attributes.bars) ? attributes.bars : [];
      const max = num(
        attributes.maxVal,
        Math.max(1, ...bars.map((bar) => num(bar.value, 0))),
      );
      const chartWidth = num(attributes.width, 400);
      const chartHeight = num(attributes.height, 300);
      const spacing = num(attributes.barSpacing, 16);
      const orientation = String(attributes.orientation ?? 'vertical');
      const barThickness =
        bars.length > 0
          ? Math.max(
              4,
              ((orientation === 'vertical' ? chartWidth : chartHeight) -
                spacing * (bars.length - 1)) /
                bars.length,
            )
          : 0;
      const progress =
        Math.max(0, Math.min(100, num(attributes.progress, 100))) / 100;

      const rects = bars
        .map((bar, index) => {
          const ratio = Math.max(0, num(bar.value, 0)) / Math.max(1, max);
          const offset = index * (barThickness + spacing);
          const color = paint(bar.color ?? attributes.fill, '#38bdf8');
          if (orientation === 'horizontal') {
            return `<rect data-role="bar-chart-bar" data-orientation="horizontal" data-target-length="${
              chartWidth * ratio
            }" data-base-pos="0" x="0" y="${offset}" width="${chartWidth * ratio * progress}" height="${barThickness}" rx="${num(
              attributes.barRadius,
              4,
            )}" fill="${color}" />`;
          }
          const length = chartHeight * ratio;
          return `<rect data-role="bar-chart-bar" data-orientation="vertical" data-target-length="${length}" data-base-pos="${chartHeight}" x="${offset}" y="${
            chartHeight - length * progress
          }" width="${barThickness}" height="${length * progress}" rx="${num(
            attributes.barRadius,
            4,
          )}" fill="${color}" />`;
        })
        .join('');

      return `<g>${rects}</g>`;
    }

    case 'lower-third': {
      const cardWidth = num(attributes.width, 380);
      const cardHeight = num(attributes.height, 64);
      const progress =
        Math.max(0, Math.min(100, num(attributes.progress, 100))) / 100;
      const accentWidth = 4 * progress;
      return `<g>
  <rect x="0" y="0" width="${cardWidth}" height="${cardHeight}" rx="10" fill="${paint(
    attributes.cardBg,
    'rgba(15, 23, 42, 0.88)',
  )}" stroke="rgba(148,163,184,0.22)" />
  <rect data-role="lower-third-accent" data-full-width="4" x="0" y="0" width="${accentWidth}" height="${cardHeight}" rx="2" fill="${paint(
    attributes.accentColor,
    '#38bdf8',
  )}" />
  <text x="22" y="${cardHeight / 2 - 8}" fill="#f8fafc" font-size="18" font-weight="700" dominant-baseline="middle">${escapeXml(
    String(attributes.title ?? ''),
  )}</text>
  <text x="22" y="${cardHeight / 2 + 12}" fill="#94a3b8" font-size="12" dominant-baseline="middle">${escapeXml(
    String(attributes.subtitle ?? ''),
  )}</text>
</g>`;
    }

    case 'spline-tracer':
      return `<circle data-role="tracer-dot" cx="0" cy="0" r="${num(attributes.r, 5)}" fill="${paint(
        attributes.fill,
        '#38bdf8',
      )}" />`;

    case 'group':
      return '';

    default: {
      switch (kind) {
        case 'circle':
          return `<circle cx="${width / 2}" cy="${height / 2}" r="${width / 2}" ${paintAttrs(
            attributes,
          )} />`;
        case 'ellipse':
          return `<ellipse cx="${width / 2}" cy="${height / 2}" rx="${width / 2}" ry="${height / 2}" ${paintAttrs(
            attributes,
          )} />`;
        case 'polygon':
          return `<polygon points="${polygonPoints(
            num(attributes.polygonSides, num(attributes.sides, 5)),
            width / 2,
          )}" transform="translate(${width / 2} ${height / 2})" ${paintAttrs(attributes)} />`;
        case 'star':
          return `<polygon points="${starPoints(
            width / 2,
            num(attributes.starRatio, 0.5),
          )}" transform="translate(${width / 2} ${height / 2})" ${paintAttrs(attributes)} />`;
        default:
          return `<rect x="0" y="0" width="${width}" height="${height}" rx="${num(
            attributes.rx,
            0,
          )}" ry="${num(attributes.ry, num(attributes.rx, 0))}" ${paintAttrs(attributes)} />`;
      }
    }
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
  return `<g id="trace-elem-${escapeXml(element.id)}" data-trace-id="${escapeXml(
    element.id,
  )}"${transformAttr}${opacity}>${elementBodyMarkup(element, attributes)}</g>`;
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
  project: TraceProject,
  timeMs: number,
  options: { background?: string; size?: boolean } = {},
): string {
  const defs = `${gradientsToDefs(project.gradients)}${project.defs ?? ''}`;
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
