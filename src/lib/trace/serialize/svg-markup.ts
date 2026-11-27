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
import { scrubDangerousSvgMarkup } from '../parser/svg-scrub';
import {
  cameraTransformString,
  isCameraIdentity,
  resolveCameraAtTime,
} from '../runtime/camera';
import { resolveElementAtTime } from '../runtime/resolve-element';
import {
  DEFAULT_SCENE_BACKGROUND,
  sceneBackgroundAtTime,
  sceneVeilAtTime,
} from '../runtime/scenes';
import { subtitleAtTime } from '../runtime/subtitles';
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
      // Centre and radius come from the box, matching what the Layout fields and
      // the animation runtime (which sets `r` from width) already assume.
      return `<circle cx="${width / 2}" cy="${height / 2}" r="${width / 2}" ${paintAttrs(attributes)} />`;

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
  options: {
    background?: string;
    size?: boolean;
    subtitles?: boolean;
    /**
     * Paint the scene entrance veil. Exporters that bake their own animation
     * (GSAP, SVG specialisation) disable it so a snapshot taken mid transition
     * cannot freeze a cover panel into the artifact.
     */
    scenePresentation?: boolean;
    /**
     * Apply the composition camera to the graph. Exporters that bake their own
     * animation (GSAP, SVG specialisation) disable it: they do not author a
     * camera move, so baking one frame's framing would crop the artifact.
     */
    camera?: boolean;
  } = {},
): string {
  const project = migrateTraceProject(inputProject);
  const defs = `${gradientsToDefs(project.gradients)}${filtersToDefs(Object.values(project.filters ?? {}))}${scrubDangerousSvgMarkup(project.defs ?? '')}`;
  const roots = project.rootElementIds
    .map((elementId) => elementTreeMarkup(project, elementId, timeMs))
    .join('\n');
  const camera = resolveCameraAtTime(project, timeMs);
  const framedRoots =
    roots && options.camera !== false && !isCameraIdentity(camera, project)
      ? `<g data-trace-camera="true" transform="${cameraTransformString(
          project,
          camera,
        )}">${roots}</g>`
      : roots;
  const background = options.background
    ? `<rect width="${project.width}" height="${project.height}" fill="${escapeXml(options.background)}" />`
    : sceneBackgroundMarkup(project, timeMs);
  const veil =
    options.background || options.scenePresentation === false
      ? ''
      : sceneVeilMarkup(project, timeMs);
  const subtitles =
    options.subtitles === false ? '' : subtitleMarkup(project, timeMs);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${project.width} ${project.height}"${
    options.size ? ` width="${project.width}" height="${project.height}"` : ''
  }>${defs ? `<defs>${defs}</defs>` : ''}${background}${framedRoots}${veil}${subtitles}</svg>`;
}

/** Per-scene background, blended across an entrance when both scenes set one. */
function sceneBackgroundMarkup(
  project: TraceProject,
  timeMs: number,
): string {
  const background = sceneBackgroundAtTime(project, timeMs);
  if (!background) return '';
  return `<rect width="${project.width}" height="${project.height}" fill="${escapeXml(background.fill)}" />`;
}

/**
 * The entrance veil sits above the graph and below the subtitle layer, so a
 * dip never hides the narration. It is omitted entirely when settled.
 */
function sceneVeilMarkup(
  project: TraceProject,
  timeMs: number,
): string {
  const veil = sceneVeilAtTime(
    project,
    timeMs,
    sceneBackgroundAtTime(project, 0)?.fill ?? DEFAULT_SCENE_BACKGROUND,
  );
  if (!veil) return '';

  const offset = veil.translateX
    ? ` transform="translate(${veil.translateX} 0)"`
    : '';
  return `<rect data-trace-scene-veil="true" width="${veil.width}" height="${veil.height}" fill="${escapeXml(veil.fill)}" opacity="${num(veil.opacity, 1)}"${offset} />`;
}

/**
 * The engine-owned subtitle layer, serialized at a point in time.
 *
 * Width is estimated from the glyph count (no measured text metrics outside a
 * DOM); the editor overlay measures live. Both share the same timing function,
 * so a frame cannot say one thing on screen and another in the file. Nothing is
 * emitted between lines, so exports at a silent frame (t=0 included) are clean.
 */
function subtitleMarkup(project: TraceProject, timeMs: number): string {
  const frame = subtitleAtTime(project, timeMs);
  if (!frame) return '';

  const fontSize = Math.max(14, Math.round(project.height * 0.03));
  const baseline = Math.round(project.height * 0.91);
  const centerX = project.width / 2;
  const label = frame.speaker
    ? `${frame.speaker.toUpperCase()}  ${frame.text}`
    : frame.text;
  const textWidth = Math.max(fontSize, label.length * fontSize * 0.55);
  const padX = Math.round(fontSize * 0.8);
  const padY = Math.round(fontSize * 0.45);

  return (
    `<g id="trace-subtitle-group" pointer-events="none">` +
    `<rect id="trace-subtitle-bg" x="${Math.round(centerX - textWidth / 2 - padX)}" y="${baseline - fontSize - padY}" width="${Math.round(textWidth + padX * 2)}" height="${Math.round(fontSize * 1.6 + padY)}" rx="${Math.round(fontSize * 0.35)}" fill="rgba(2, 6, 23, 0.72)" />` +
    `<text id="trace-subtitle-text" x="${centerX}" y="${baseline}" text-anchor="middle" fill="#f8fafc" font-family="Inter, system-ui, sans-serif" font-weight="600" font-size="${fontSize}">${escapeXml(label)}</text>` +
    `</g>`
  );
}
