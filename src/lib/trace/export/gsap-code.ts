/**
 * lib/trace/export/gsap-code.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Generates production-ready GSAP code from a Trace project.
 *
 * Two formats:
 *  - `react`   — a component that mounts the self-contained SVG and plays a
 *                timeline, ready to drop into an interactive experience.
 *  - `vanilla` — a factory that takes a mounted SVG element and returns the
 *                timeline, so a host can wire play/pause/seek to its own UI.
 *
 * Text-content tracks are emitted as TextPlugin tweens in the vanilla format;
 * the React format uses the same markup plus a note, because the SVG must be
 * mounted before TextPlugin can write into it.
 */

import { mapEasingToGsap } from '../runtime/gsap-compiler';
import { staticSvgMarkup } from '../serialize/svg-markup';
import { migrateTraceProject } from '../migrate';
import type { PropertyTrack, TraceElement, TraceProject } from '../types';

export interface GsapCodeOptions {
  format: 'react' | 'vanilla';
  loop?: boolean;
  componentName?: string;
  /** Embed the static SVG markup as a constant in the output. */
  includeMarkup?: boolean;
}

const ATTRIBUTE_PROPS = new Set([
  'width',
  'height',
  'rx',
  'strokeDashoffset',
  'strokeDasharray',
  'strokeWidth',
  'stroke',
  'fill',
  'fillOpacity',
  'fontSize',
  'letterSpacing',
]);

function toPascalCase(value: string): string {
  return (
    value
      .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr: string) => chr.toUpperCase())
      .replace(/^[a-z]/, (chr) => chr.toUpperCase())
      .replace(/[^a-zA-Z0-9]/g, '') || 'TraceAnimation'
  );
}

function selectorFor(element: TraceElement): string {
  return `#trace-elem-${element.id}`;
}

function initialTransform(element: TraceElement): string {
  const attributes = element.attributes ?? {};
  const baseX = Number(attributes.baseX ?? attributes.x ?? 0);
  const baseY = Number(attributes.baseY ?? attributes.y ?? 0);
  const rotation = Number(attributes.rotation ?? 0);
  const scaleX = Number(attributes.scaleX ?? 1);
  const scaleY = Number(attributes.scaleY ?? 1);
  const origin = element.origin ?? { x: 0, y: 0 };
  return `gsap.set("${selectorFor(element)}", { x: ${baseX}, y: ${baseY}, rotation: ${rotation}, scaleX: ${scaleX}, scaleY: ${scaleY}, transformOrigin: "${origin.x}px ${origin.y}px", transformBox: "view-box" });`;
}

function easeLiteral(track: PropertyTrack, index: number): string {
  const easing =
    track.keyframes[index]?.easing ??
    track.keyframes[0]?.easing ??
    'power2.out';
  const mapped = mapEasingToGsap(easing);
  return typeof mapped === 'function' ? `"power2.out"` : `"${mapped}"`;
}

function trackTweenLines(
  element: TraceElement,
  track: PropertyTrack,
  indent: string,
): string[] {
  const lines: string[] = [];
  const keys = track.keyframes.slice().sort((a, b) => a.timeMs - b.timeMs);
  if (keys.length === 0) return lines;

  const target =
    track.property === 'text'
      ? `${selectorFor(element)} text`
      : selectorFor(element);

  if (track.property === 'text') {
    for (let index = 0; index < keys.length - 1; index += 1) {
      const from = keys[index];
      const to = keys[index + 1];
      const duration = Math.max(0.001, (to.timeMs - from.timeMs) / 1000);
      lines.push(
        `${indent}tl.to("${target}", { text: { value: ${JSON.stringify(
          String(to.value),
        )} }, duration: ${duration.toFixed(3)}, ease: ${easeLiteral(track, index)} }, ${(
          from.timeMs / 1000
        ).toFixed(3)});`,
      );
    }
    return lines;
  }

  const isAttribute = ATTRIBUTE_PROPS.has(track.property);
  const wrap = (body: string) => (isAttribute ? `attr: { ${body} }` : body);

  if (keys.length === 1) {
    lines.push(
      `${indent}tl.set("${target}", { ${wrap(`${track.property}: ${JSON.stringify(keys[0].value)}`)} }, 0);`,
    );
    return lines;
  }

  lines.push(
    `${indent}tl.set("${target}", { ${wrap(`${track.property}: ${JSON.stringify(keys[0].value)}`)} }, 0);`,
  );

  for (let index = 0; index < keys.length - 1; index += 1) {
    const from = keys[index];
    const to = keys[index + 1];
    const duration = Math.max(0.001, (to.timeMs - from.timeMs) / 1000);
    lines.push(
      `${indent}tl.to("${target}", { ${wrap(`${track.property}: ${JSON.stringify(to.value)}`)}, duration: ${duration.toFixed(
        3,
      )}, ease: ${easeLiteral(track, index)} }, ${(from.timeMs / 1000).toFixed(3)});`,
    );
  }

  return lines;
}

function timelineLines(project: TraceProject, indent: string): string[] {
  const lines: string[] = [];
  for (const element of Object.values(project.elements)) {
    if (!element.visible) continue;
    if (!element.tracks || element.tracks.length === 0) continue;

    lines.push(`${indent}// ${element.name}`);
    if (
      element.tracks.some((track) =>
        ['x', 'y', 'rotation', 'scaleX', 'scaleY'].includes(track.property),
      )
    ) {
      lines.push(`${indent}${initialTransform(element)}`);
    }
    for (const track of element.tracks) {
      lines.push(...trackTweenLines(element, track, indent));
    }
    lines.push('');
  }
  return lines;
}

export function generateGsapCode(
  inputProject: TraceProject,
  options: GsapCodeOptions,
): string {
  const project = migrateTraceProject(inputProject);
  const { format, loop = true, componentName, includeMarkup = true } = options;
  const name = toPascalCase(componentName || project.name || 'TraceScene');
  const markup = staticSvgMarkup(project, project.durationMs * 0.7, {
    size: true,
  });
  const needsTextPlugin = Object.values(project.elements).some((element) =>
    element.tracks?.some((track) => track.property === 'text'),
  );

  const pluginImport = needsTextPlugin
    ? `\nimport { TextPlugin } from 'gsap/TextPlugin';`
    : '';
  const pluginRegister = needsTextPlugin
    ? `\n\ngsap.registerPlugin(TextPlugin);`
    : '';
  const markupSection = includeMarkup
    ? `\n/** Self-contained SVG markup for this composition. */\nexport const svgMarkup = ${JSON.stringify(markup)};\n`
    : '';

  if (format === 'react') {
    const lines = timelineLines(project, '      ').join('\n');
    return `'use client';

import { useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';${pluginImport}${pluginRegister}
${markupSection}
export interface ${name}Props {
  className?: string;
  loop?: boolean;
  autoPlay?: boolean;
}

/**
 * Generated by NovaTrace. Renders a self-contained SVG and drives it with GSAP.
 * Wire any interactive controls by calling methods on the timeline ref.
 */
export function ${name}({ className, loop = ${loop}, autoPlay = true }: ${name}Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);

  useGSAP(
    () => {
      if (!containerRef.current) return;
      const scope = containerRef.current;

      const tl = gsap.timeline({
        paused: !autoPlay,
        repeat: loop ? -1 : 0,
        defaults: { ease: 'power2.out' },
      });

${lines}
      timelineRef.current = tl;
      return () => {
        tl.kill();
        timelineRef.current = null;
        gsap.set(scope.querySelectorAll('[data-trace-id]'), { clearProps: 'transform,opacity' });
      };
    },
    { scope: containerRef, dependencies: [loop, autoPlay] },
  );

  return (
    <div
      ref={containerRef}
      className={className}
      data-trace-composition="${project.name.replace(/"/g, '')}"
      dangerouslySetInnerHTML={{ __html: svgMarkup }}
    />
  );
}

export default ${name};
`;
  }

  const lines = timelineLines(project, '  ').join('\n');
  return `import { gsap } from 'gsap';${pluginImport}${pluginRegister}
${markupSection}
/**
 * Generated by NovaTrace — "${project.name}"
 * ${project.width}×${project.height}px, ${(project.durationMs / 1000).toFixed(1)}s, ${project.fps}fps.
 */
export function create${name}Timeline(
  svgElement: SVGSVGElement | HTMLElement,
  options: { loop?: boolean; autoPlay?: boolean } = {},
): gsap.core.Timeline {
  const isLoop = options.loop !== false;
  const isPaused = options.autoPlay === false;

  const tl = gsap.timeline({
    paused: isPaused,
    repeat: isLoop ? -1 : 0,
    defaults: { ease: 'power2.out' },
  });

${lines}
  return tl;
}
`;
}

/** Copy code to the clipboard with a file-download fallback. */
export async function copyOrDownloadCode(
  code: string,
  filename: string,
): Promise<'copied' | 'downloaded'> {
  try {
    await navigator.clipboard.writeText(code);
    return 'copied';
  } catch {
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return 'downloaded';
  }
}
