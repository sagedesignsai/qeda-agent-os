/**
 * lib/trace/export/animated-svg.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Compiles a Trace project into a standalone, self-contained animated SVG.
 *
 * No JavaScript and no external runtime: every animated property becomes SMIL
 * (`<animate>` / `<animateTransform>`), so the file plays in a browser, an
 * `<img>` tag, or an embed in a document. SMIL cannot animate text content;
 * text-track recipes such as counters require the GSAP/TextPlugin export.
 *
 * Adapted from sagedesigns-os lib/motion/export/svg-animation-compiler.ts.
 */

import { getValueAtTime } from '../animation/interpolator';
import { migrateTraceProject } from '../migrate';
import { resolveElementAtTime } from '../runtime/resolve-element';
import {
  elementBodyMarkup,
  escapeXml,
  gradientsToDefs,
} from '../serialize/svg-markup';
import type {
  EasingType,
  PropertyTrack,
  TraceElement,
  TraceProject,
} from '../types';

export interface AnimatedSvgOptions {
  loop?: boolean;
  background?: string;
  includeDimensions?: boolean;
}

type Sample = { timeMs: number; value: number | string; easing: EasingType };

const BEZIER: Record<string, string> = {
  linear: '0 0 1 1',
  ease: '0.25 0.1 0.25 1',
  'ease-in': '0.42 0 1 1',
  'ease-out': '0 0 0.58 1',
  'ease-in-out': '0.42 0 0.58 1',
  'power1.out': '0.25 0.46 0.45 0.94',
  'power1.in': '0.55 0.085 0.68 0.53',
  'power1.inOut': '0.455 0.03 0.515 0.955',
  'power2.out': '0.215 0.61 0.355 1',
  'power2.in': '0.55 0.055 0.675 0.19',
  'power2.inOut': '0.645 0.045 0.355 1',
  'power3.out': '0.215 0.61 0.355 1',
  'power3.in': '0.55 0.055 0.675 0.19',
  'power3.inOut': '0.645 0.045 0.355 1',
  'power4.out': '0.19 1 0.22 1',
  'expo.out': '0.19 1 0.22 1',
  'expo.inOut': '0.87 0 0.13 1',
  'circ.out': '0.075 0.82 0.165 1',
  'sine.out': '0.39 0.575 0.565 1',
  'sine.inOut': '0.445 0.05 0.55 0.95',
  'back.out': '0.34 1.56 0.64 1',
  'back.inOut': '0.68 -0.6 0.32 1.6',
  'elastic.out': '0.25 0.46 0.45 0.94',
  'bounce.out': '0.25 0.46 0.45 0.94',
};

function bezierFor(easing: EasingType): string {
  if (typeof easing === 'string' && easing.startsWith('cubic-bezier(')) {
    const match = easing.match(
      /cubic-bezier\(([^,]+),([^,]+),([^,]+),([^)]+)\)/,
    );
    if (match)
      return `${Number(match[1])} ${Number(match[2])} ${Number(match[3])} ${Number(match[4])}`;
  }
  return BEZIER[easing] ?? '0.25 0.1 0.25 1';
}

function trackFor(
  element: TraceElement,
  property: string,
): PropertyTrack | undefined {
  return (element.tracks ?? []).find((track) => track.property === property);
}

function buildSamples(
  tracks: PropertyTrack[],
  durationMs: number,
  evaluate: (timeMs: number) => number | string,
): Sample[] {
  const times = new Set<number>([0, durationMs]);
  for (const track of tracks) {
    for (const keyframe of track.keyframes)
      times.add(Math.max(0, Math.min(durationMs, keyframe.timeMs)));
  }

  const sorted = [...times].sort((a, b) => a - b);
  const samples: Sample[] = sorted.map((timeMs) => {
    const easing =
      tracks
        .flatMap((track) => track.keyframes)
        .filter((keyframe) => keyframe.timeMs <= timeMs)
        .sort((a, b) => b.timeMs - a.timeMs)[0]?.easing ?? 'linear';
    return { timeMs, value: evaluate(timeMs), easing };
  });

  return samples.filter(
    (sample, index, all) =>
      index === 0 || sample.timeMs !== all[index - 1].timeMs,
  );
}

function keyTimes(samples: Sample[], durationMs: number): string {
  return samples
    .map((sample) => (sample.timeMs / Math.max(1, durationMs)).toFixed(5))
    .join(';');
}

function keySplines(samples: Sample[]): string | null {
  if (samples.length < 2) return null;
  const splines: string[] = [];
  for (let index = 0; index < samples.length - 1; index += 1) {
    const segment = samples[index].timeMs;
    const spline = bezierFor(samples[index].easing);
    splines.push(samples[index + 1].timeMs > segment ? spline : '0 0 1 1');
  }
  return splines.join(';');
}

function animateTag(
  attributeName: string,
  samples: Sample[],
  durationMs: number,
  options: { loop: boolean; type?: string },
): string {
  if (samples.length < 2) return '';
  const splines = keySplines(samples);
  const values = samples.map((sample) => String(sample.value)).join(';');
  const mode = splines ? 'spline' : 'linear';
  return `<animate attributeName="${attributeName}" values="${escapeXml(values)}" keyTimes="${keyTimes(
    samples,
    durationMs,
  )}" calcMode="${mode}"${splines ? ` keySplines="${splines}"` : ''} dur="${(
    durationMs / 1000
  ).toFixed(
    3,
  )}s" repeatCount="${options.loop ? 'indefinite' : '1'}" fill="freeze" />`;
}

function animateTransform(
  type: 'translate' | 'rotate' | 'scale',
  samples: Sample[],
  durationMs: number,
  loop: boolean,
): string {
  if (samples.length < 2) return '';
  const splines = keySplines(samples);
  const values = samples.map((sample) => String(sample.value)).join(';');
  return `<animateTransform attributeName="transform" type="${type}" values="${escapeXml(
    values,
  )}" keyTimes="${keyTimes(samples, durationMs)}" calcMode="${splines ? 'spline' : 'linear'}"${
    splines ? ` keySplines="${splines}"` : ''
  } dur="${(durationMs / 1000).toFixed(3)}s" repeatCount="${loop ? 'indefinite' : '1'}" fill="freeze" />`;
}

/** Insert generated animation nodes inside the first opening tag of the body. */
function injectAnimations(body: string, animations: string): string {
  if (!animations) return body;
  const match = body.match(/^<([a-zA-Z]+)\b[^>]*>/);
  if (!match) return body;
  const insertAt = match[0].length;
  return `${body.slice(0, insertAt)}${animations}${body.slice(insertAt)}`;
}

function pathTrimAnimations(
  element: TraceElement,
  durationMs: number,
  loop: boolean,
): string {
  const startTrack = trackFor(element, 'trimStart');
  const endTrack = trackFor(element, 'trimEnd');
  const offsetTrack = trackFor(element, 'trimOffset');
  if (!startTrack && !endTrack && !offsetTrack) return '';

  const startSamples = buildSamples(
    startTrack ? [startTrack] : [],
    durationMs,
    (at) =>
      Number(
        startTrack
          ? (getValueAtTime(startTrack, at) ?? 0)
          : (element.attributes.trimStart ?? 0),
      ),
  );
  const endSamples = buildSamples(
    endTrack ? [endTrack] : [],
    durationMs,
    (at) =>
      Number(
        endTrack
          ? (getValueAtTime(endTrack, at) ?? 100)
          : (element.attributes.trimEnd ?? 100),
      ),
  );

  const dashSamples: Sample[] = endSamples.map((sample, index) => ({
    timeMs: sample.timeMs,
    value: `${Math.max(0, Number(sample.value) - Number(startSamples[index]?.value ?? 0))} 400`,
    easing: sample.easing,
  }));
  const offsetSamples: Sample[] = startSamples.map((sample) => ({
    timeMs: sample.timeMs,
    value: -Number(sample.value),
    easing: sample.easing,
  }));

  return [
    animateTag('stroke-dasharray', dashSamples, durationMs, { loop }),
    animateTag('stroke-dashoffset', offsetSamples, durationMs, { loop }),
  ].join('');
}

function animatedElementMarkup(
  project: TraceProject,
  element: TraceElement,
  timeMs: number,
  options: { loop: boolean },
): { markup: string; clip: string } {
  const durationMs = project.durationMs;
  const { attributes, transform } = resolveElementAtTime(element, timeMs);
  const tracks = element.tracks ?? [];

  const xTracks = tracks.filter((track) => track.property === 'x');
  const yTracks = tracks.filter((track) => track.property === 'y');
  const rotationTracks = tracks.filter(
    (track) => track.property === 'rotation',
  );
  const scaleTracks = tracks.filter(
    (track) => track.property === 'scaleX' || track.property === 'scaleY',
  );

  const translateAnimations =
    xTracks.length || yTracks.length
      ? animateTransform(
          'translate',
          buildSamples([...xTracks, ...yTracks], durationMs, (at) => {
            const resolved = resolveElementAtTime(element, at).transform;
            return `${resolved.x} ${resolved.y}`;
          }),
          durationMs,
          options.loop,
        )
      : '';
  const rotateAnimations = rotationTracks.length
    ? animateTransform(
        'rotate',
        buildSamples(
          rotationTracks,
          durationMs,
          (at) => resolveElementAtTime(element, at).transform.rotation,
        ),
        durationMs,
        options.loop,
      )
    : '';
  const scaleAnimations = scaleTracks.length
    ? animateTransform(
        'scale',
        buildSamples(scaleTracks, durationMs, (at) => {
          const resolved = resolveElementAtTime(element, at).transform;
          return `${resolved.scaleX} ${resolved.scaleY}`;
        }),
        durationMs,
        options.loop,
      )
    : '';

  const inherited: string[] = [];
  for (const property of [
    'opacity',
    'fill',
    'stroke',
    'strokeWidth',
    'fontSize',
    'letterSpacing',
  ]) {
    const track = trackFor(element, property);
    if (!track) continue;
    inherited.push(
      animateTag(
        property === 'strokeWidth'
          ? 'stroke-width'
          : property === 'fontSize'
            ? 'font-size'
            : property === 'letterSpacing'
              ? 'letter-spacing'
              : property,
        buildSamples(
          [track],
          durationMs,
          (at) =>
            getValueAtTime(track, at) ?? element.attributes[property] ?? 0,
        ),
        durationMs,
        { loop: options.loop },
      ),
    );
  }

  const geometry: string[] = [];
  for (const property of ['width', 'height', 'rx']) {
    const track = trackFor(element, property);
    if (!track) continue;
    geometry.push(
      animateTag(
        property === 'width' && element.type === 'circle' ? 'r' : property,
        buildSamples([track], durationMs, (at) => {
          const value = Number(
            getValueAtTime(track, at) ?? element.attributes[property] ?? 0,
          );
          return property === 'width' && element.type === 'circle'
            ? value / 2
            : value;
        }),
        durationMs,
        { loop: options.loop },
      ),
    );
  }

  const inheritedXml = inherited.join('');
  const geometryXml = geometry.join('');
  const trimXml =
    element.type === 'path'
      ? pathTrimAnimations(element, durationMs, options.loop)
      : '';

  let body = elementBodyMarkup(element, attributes);
  if (element.type === 'path' && trimXml) {
    body = body.replace(/^<path\b/, '<path pathLength="100"');
    body = injectAnimations(body, trimXml);
  } else {
    body = injectAnimations(body, geometryXml);
  }

  let clip = '';

  const children = (element.childrenIds ?? [])
    .map((childId) => {
      const child = project.elements[childId];
      if (!child || !child.visible) return '';
      const result = animatedElementMarkup(project, child, timeMs, options);
      clip += result.clip;
      return result.markup;
    })
    .join('');

  const markup = `<g id="trace-elem-${escapeXml(element.id)}" data-trace-id="${escapeXml(
    element.id,
  )}"${inheritedXml ? '' : ` opacity="${Number(attributes.opacity ?? 1)}"`}>
<g transform="translate(${transform.x} ${transform.y})">${translateAnimations}
<g transform="rotate(${transform.rotation})">${rotateAnimations}
<g transform="scale(${transform.scaleX} ${transform.scaleY})">${scaleAnimations}
${inheritedXml ? `<g>${inheritedXml}` : ''}${body}${inheritedXml ? '</g>' : ''}${children}
</g></g></g></g>`;

  return { markup, clip };
}

export function compileProjectToAnimatedSvg(
  inputProject: TraceProject,
  options: AnimatedSvgOptions = {},
): string {
  const project = migrateTraceProject(inputProject);
  const loop = options.loop !== false;
  // Poster time: the last frame is the most representative settled state.
  const timeMs = Math.min(
    project.durationMs,
    Math.max(0, project.durationMs * 0.7),
  );

  const clips: string[] = [];
  const roots = project.rootElementIds
    .map((elementId) => {
      const element = project.elements[elementId];
      if (!element || !element.visible) return '';
      const result = animatedElementMarkup(project, element, timeMs, { loop });
      if (result.clip) clips.push(result.clip);
      return result.markup;
    })
    .join('\n');

  const defs = `${gradientsToDefs(project.gradients)}${project.defs ?? ''}${clips.join('')}`;
  const background = options.background
    ? `<rect width="${project.width}" height="${project.height}" fill="${escapeXml(options.background)}" />`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${project.width} ${project.height}"${
    options.includeDimensions !== false
      ? ` width="${project.width}" height="${project.height}"`
      : ''
  } role="img" aria-label="${escapeXml(project.name)}">
<title>${escapeXml(project.name)}</title>
${defs ? `<defs>${defs}</defs>` : ''}${background}
${roots}
</svg>
`;
}

/** Triggers a browser download of the standalone animated SVG. */
export function downloadAnimatedSvg(
  project: TraceProject,
  options?: AnimatedSvgOptions,
): void {
  const svg = compileProjectToAnimatedSvg(project, options);
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'trace'}-animated.svg`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
