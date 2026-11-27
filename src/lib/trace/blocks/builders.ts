/**
 * lib/trace/blocks/builders.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * First-party Trace blocks. Each builder returns an insertable fragment whose
 * elements are ordinary layers with ordinary tracks — nothing about a block is
 * special after insertion.
 *
 * Layout is derived from the target canvas, so a title card centres on 16:9,
 * 1:1 and 9:16 alike. Blocks that paint the frame (`background-treatment`)
 * declare `layer: 'background'` so insertion drops them behind existing art.
 */

import type { TraceAssetFragment } from '../assets/types';
import type { PropertyTrack, TraceElement } from '../types';
import {
  BLOCK_FONT,
  blockElement,
  blockTrack,
  optionColor,
  optionLines,
  optionText,
  withAlpha,
  wrapLines,
} from './helpers';
import type { TraceBlockDefinition } from './types';

function group(
  id: string,
  name: string,
  x: number,
  y: number,
  width: number,
  height: number,
  childrenIds: string[],
  tracks: PropertyTrack[] = [],
): TraceElement {
  return blockElement({
    id,
    name,
    type: 'group',
    attributes: { x, y, width, height },
    origin: { x: 0, y: 0 },
    childrenIds,
    tracks,
  });
}

/**
 * Assemble a root + its children into a fragment. Child `parentId` is written
 * here so the hierarchy is already consistent before `insertFragment` copies it:
 * `childrenIds` and `parentId` are two views of the same edge and must agree.
 */
function assemble(
  root: TraceElement,
  children: Record<string, TraceElement>,
  width: number,
  height: number,
): TraceAssetFragment {
  const elements: Record<string, TraceElement> = {
    [root.id]: { ...root, parentId: null },
  };
  for (const [id, child] of Object.entries(children)) {
    if (id === root.id) continue;
    elements[id] = { ...child, parentId: root.id };
  }
  return { width, height, elements, rootElementIds: [root.id] };
}

function text(
  id: string,
  name: string,
  attributes: Record<string, unknown>,
  tracks: PropertyTrack[] = [],
  origin = { x: 0, y: 0 },
): TraceElement {
  return blockElement({
    id,
    name,
    type: 'text',
    attributes: {
      x: 0,
      y: 0,
      fontFamily: BLOCK_FONT,
      dominantBaseline: 'middle',
      ...attributes,
    },
    origin,
    tracks,
  });
}

function rect(
  id: string,
  name: string,
  attributes: Record<string, unknown>,
  tracks: PropertyTrack[] = [],
): TraceElement {
  return blockElement({
    id,
    name,
    type: 'rect',
    attributes: { x: 0, y: 0, ...attributes },
    origin: { x: 0, y: 0 },
    tracks,
  });
}

function dot(
  id: string,
  name: string,
  centerX: number,
  centerY: number,
  radius: number,
  fill: string,
  tracks: PropertyTrack[] = [],
): TraceElement {
  return blockElement({
    id,
    name,
    type: 'circle',
    attributes: {
      x: centerX - radius,
      y: centerY - radius,
      width: radius * 2,
      height: radius * 2,
      fill,
    },
    origin: { x: radius, y: radius },
    tracks,
  });
}

export const titleCardBlock: TraceBlockDefinition = {
  id: 'title-card',
  title: 'Title card',
  description:
    'Centered opener: uppercase kicker, oversized headline and a growing accent rule, revealed in sequence.',
  category: 'Titles',
  tags: ['title', 'headline', 'opener', 'intro'],
  keywords: ['title card', 'opening title', 'headline reveal', 'intro card'],
  fields: [
    { key: 'kicker', label: 'Kicker', kind: 'text', placeholder: 'INTRODUCING', maxLength: 32 },
    { key: 'headline', label: 'Headline', kind: 'text', placeholder: 'Make it move.', maxLength: 60 },
    { key: 'align', label: 'Align', kind: 'select', options: [
      { value: 'center', label: 'Center' },
      { value: 'left', label: 'Left' },
    ] },
    { key: 'accentColor', label: 'Accent', kind: 'color' },
    { key: 'textColor', label: 'Text', kind: 'color' },
  ],
  defaults: {
    kicker: 'INTRODUCING',
    headline: 'Make it move.',
    align: 'center',
    accentColor: '#38bdf8',
    textColor: '#f8fafc',
  },
  size: { width: 1280, height: 720 },
  previewTimeMs: 1600,
  previewDurationMs: 3600,
  build: ({ options, idFactory, canvas }) => {
    const kicker = optionText(options, 'kicker', 'INTRODUCING');
    const headline = optionText(options, 'headline', 'Make it move.');
    const accent = optionColor(options, 'accentColor', '#38bdf8');
    const ink = optionColor(options, 'textColor', '#f8fafc');
    const centered = optionText(options, 'align', 'center') !== 'left';
    const anchor = centered ? 'middle' : 'start';
    const cx = centered ? canvas.width / 2 : canvas.width * 0.08;
    const baseY = canvas.height * 0.46;
    const ruleWidth = 180;

    const rootId = idFactory('title');
    const kickerId = idFactory('title-kicker');
    const headlineId = idFactory('title-headline');
    const ruleId = idFactory('title-rule');

    const elements: Record<string, TraceElement> = {
      [kickerId]: text(
        kickerId,
        'Kicker',
        {
          y: -92,
          text: kicker,
          fontSize: 18,
          fontWeight: 600,
          fill: accent,
          letterSpacing: 6,
          textAnchor: anchor,
        },
        [
          blockTrack(`${kickerId}-opacity`, 'opacity', 'Opacity', [
            { timeMs: 0, value: 0 },
            { timeMs: 450, value: 1 },
          ]),
          blockTrack(`${kickerId}-y`, 'y', 'Y', [
            { timeMs: 0, value: -76 },
            { timeMs: 500, value: -92 },
          ]),
        ],
      ),
      [headlineId]: text(
        headlineId,
        'Headline',
        {
          text: headline,
          fontSize: 76,
          fontWeight: 800,
          fill: ink,
          textAnchor: anchor,
        },
        [
          blockTrack(`${headlineId}-opacity`, 'opacity', 'Opacity', [
            { timeMs: 120, value: 0 },
            { timeMs: 720, value: 1 },
          ]),
          blockTrack(`${headlineId}-y`, 'y', 'Y', [
            { timeMs: 120, value: 34, easing: 'power3.out' },
            { timeMs: 760, value: 0, easing: 'power3.out' },
          ]),
        ],
      ),
      [ruleId]: rect(
        ruleId,
        'Accent rule',
        {
          x: centered ? -ruleWidth / 2 : 0,
          y: 78,
          width: 0,
          height: 6,
          rx: 3,
          fill: accent,
        },
        [
          blockTrack(`${ruleId}-width`, 'width', 'Width', [
            { timeMs: 300, value: 0, easing: 'power3.out' },
            { timeMs: 950, value: ruleWidth, easing: 'power3.out' },
          ]),
        ],
      ),
    };

    return assemble(
      group(
          rootId,
          'Title card',
          cx,
          baseY,
          560,
          220,
          [kickerId, headlineId, ruleId],
        ),
      elements,
      canvas.width,
      canvas.height,
    );
  },
};

export const quoteCardBlock: TraceBlockDefinition = {
  id: 'quote-card',
  title: 'Quote card',
  description:
    'Oversized quotation mark, a statement wrapped to three lines, and an attribution that settles last.',
  category: 'Titles',
  tags: ['quote', 'statement', 'testimonial'],
  keywords: ['quote card', 'pull quote', 'testimonial', 'statement'],
  fields: [
    { key: 'quote', label: 'Quote', kind: 'text', multiline: true, maxLength: 220 },
    { key: 'attribution', label: 'Attribution', kind: 'text', placeholder: '— Alan Kay', maxLength: 48 },
    { key: 'accentColor', label: 'Accent', kind: 'color' },
    { key: 'textColor', label: 'Text', kind: 'color' },
  ],
  defaults: {
    quote: 'The best way to predict the future is to invent it.',
    attribution: '— Alan Kay',
    accentColor: '#38bdf8',
    textColor: '#f8fafc',
  },
  size: { width: 1280, height: 720 },
  previewTimeMs: 1800,
  previewDurationMs: 3800,
  build: ({ options, idFactory, canvas }) => {
    const quote = optionText(
      options,
      'quote',
      'The best way to predict the future is to invent it.',
    );
    const attribution = optionText(options, 'attribution', '— Alan Kay');
    const accent = optionColor(options, 'accentColor', '#38bdf8');
    const ink = optionColor(options, 'textColor', '#f8fafc');
    const lines = wrapLines(quote, 34, 3);

    const rootId = idFactory('quote');
    const glyphId = idFactory('quote-glyph');
    const childrenIds = [glyphId];

    const elements: Record<string, TraceElement> = {
      [glyphId]: text(
        glyphId,
        'Quotation mark',
        {
          y: -150,
          text: '“',
          fontSize: 200,
          fontWeight: 800,
          fill: accent,
          textAnchor: 'middle',
          opacity: 0.16,
        },
        [
          blockTrack(`${glyphId}-opacity`, 'opacity', 'Opacity', [
            { timeMs: 0, value: 0 },
            { timeMs: 500, value: 0.16 },
          ]),
        ],
      ),
    };

    lines.forEach((line, index) => {
      const lineId = idFactory(`quote-line-${index}`);
      childrenIds.push(lineId);
      elements[lineId] = text(
        lineId,
        `Line ${index + 1}`,
        {
          y: -40 + index * 58,
          text: line,
          fontSize: 42,
          fontWeight: 600,
          fill: ink,
          textAnchor: 'middle',
        },
        [
          blockTrack(`${lineId}-opacity`, 'opacity', 'Opacity', [
            { timeMs: index * 90, value: 0 },
            { timeMs: index * 90 + 520, value: 1 },
          ]),
          blockTrack(`${lineId}-y`, 'y', 'Y', [
            { timeMs: index * 90, value: -18 + index * 58, easing: 'power2.out' },
            { timeMs: index * 90 + 560, value: -40 + index * 58, easing: 'power2.out' },
          ]),
        ],
      );
    });

    if (attribution) {
      const attributionId = idFactory('quote-attribution');
      childrenIds.push(attributionId);
      elements[attributionId] = text(
        attributionId,
        'Attribution',
        {
          y: -40 + lines.length * 58 + 48,
          text: attribution,
          fontSize: 18,
          fontWeight: 500,
          fill: '#94a3b8',
          letterSpacing: 1.5,
          textAnchor: 'middle',
        },
        [
          blockTrack(`${attributionId}-opacity`, 'opacity', 'Opacity', [
            { timeMs: 260 + lines.length * 90, value: 0 },
            { timeMs: 820 + lines.length * 90, value: 1 },
          ]),
        ],
      );
    }

    return assemble(
      group(
          rootId,
          'Quote card',
          canvas.width / 2,
          canvas.height * 0.48,
          880,
          460,
          childrenIds,
        ),
      elements,
      canvas.width,
      canvas.height,
    );
  },
};

export const calloutBlock: TraceBlockDefinition = {
  id: 'callout',
  title: 'Callout',
  description:
    'A pill label with a pulsing accent dot and a short connector — call out one detail without stopping the story.',
  category: 'Callouts',
  tags: ['callout', 'annotation', 'label', 'pointer'],
  keywords: ['annotation', 'callout', 'label', 'tooltip', 'pointer'],
  fields: [
    { key: 'label', label: 'Label', kind: 'text', placeholder: 'Key insight', maxLength: 42 },
    { key: 'accentColor', label: 'Accent', kind: 'color' },
  ],
  defaults: { label: 'Key insight', accentColor: '#f472b6' },
  size: { width: 640, height: 360 },
  previewTimeMs: 1200,
  previewDurationMs: 3000,
  build: ({ options, idFactory, canvas }) => {
    const label = optionText(options, 'label', 'Key insight');
    const accent = optionColor(options, 'accentColor', '#f472b6');
    const pillWidth = Math.max(190, Math.min(520, label.length * 9 + 70));
    const pillHeight = 46;

    const rootId = idFactory('callout');
    const pillId = idFactory('callout-pill');
    const dotId = idFactory('callout-dot');
    const textId = idFactory('callout-text');
    const stemId = idFactory('callout-stem');

    const elements: Record<string, TraceElement> = {
      [pillId]: rect(pillId, 'Pill', {
        width: pillWidth,
        height: pillHeight,
        rx: pillHeight / 2,
        fill: 'rgba(2, 6, 23, 0.88)',
        stroke: withAlpha(accent, 0.55),
        strokeWidth: 1.5,
      }),
      [dotId]: dot(dotId, 'Dot', 23, 23, 5, accent, [
        blockTrack(`${dotId}-opacity`, 'opacity', 'Opacity', [
          { timeMs: 0, value: 0 },
          { timeMs: 300, value: 1 },
        ]),
      ]),
      [textId]: text(
        textId,
        'Label',
        {
          x: 38,
          y: 23,
          text: label,
          fontSize: 15,
          fontWeight: 600,
          fill: '#f8fafc',
          textAnchor: 'start',
        },
        [
          blockTrack(`${textId}-opacity`, 'opacity', 'Opacity', [
            { timeMs: 90, value: 0 },
            { timeMs: 480, value: 1 },
          ]),
        ],
      ),
      [stemId]: blockElement({
        id: stemId,
        name: 'Connector',
        type: 'line',
        attributes: {
          x1: 23,
          y1: pillHeight,
          x2: 23,
          y2: pillHeight + 48,
          stroke: withAlpha(accent, 0.7),
          strokeWidth: 2,
        },
        origin: { x: 0, y: 0 },
        tracks: [
          blockTrack(`${stemId}-opacity`, 'opacity', 'Opacity', [
            { timeMs: 220, value: 0 },
            { timeMs: 620, value: 1 },
          ]),
        ],
      }),
    };

    const rootX = canvas.width * 0.14;
    return assemble(
      group(
          rootId,
          'Callout',
          rootX - 18,
          canvas.height * 0.66,
          pillWidth,
          pillHeight + 48,
          [pillId, dotId, textId, stemId],
          [
            blockTrack(`${rootId}-opacity`, 'opacity', 'Opacity', [
              { timeMs: 0, value: 0 },
              { timeMs: 500, value: 1 },
            ]),
            blockTrack(`${rootId}-x`, 'x', 'X', [
              { timeMs: 0, value: rootX - 18, easing: 'power2.out' },
              { timeMs: 620, value: rootX, easing: 'power2.out' },
            ]),
          ],
        ),
      elements,
      canvas.width,
      canvas.height,
    );
  },
};

export const deviceFrameBlock: TraceBlockDefinition = {
  id: 'device-frame',
  title: 'Device frame',
  description:
    'A phone-shaped screen with browser dots and an app panel — drop screenshots or motion inside it.',
  category: 'Social',
  tags: ['device', 'phone', 'app', 'showcase'],
  keywords: ['device frame', 'phone mockup', 'app showcase', 'product demo'],
  fields: [
    { key: 'label', label: 'Label', kind: 'text', placeholder: 'Product tour', maxLength: 32 },
    { key: 'accentColor', label: 'Accent', kind: 'color' },
    { key: 'frameColor', label: 'Frame', kind: 'color' },
  ],
  defaults: {
    label: 'Product tour',
    accentColor: '#38bdf8',
    frameColor: '#0b1220',
  },
  size: { width: 1280, height: 720 },
  previewTimeMs: 1600,
  previewDurationMs: 3400,
  build: ({ options, idFactory, canvas }) => {
    const label = optionText(options, 'label', 'Product tour');
    const accent = optionColor(options, 'accentColor', '#38bdf8');
    const frame = optionColor(options, 'frameColor', '#0b1220');
    const scale = Math.max(
      0.55,
      Math.min(1.3, Math.min(canvas.width / 1400, canvas.height / 800)),
    );

    const rootId = idFactory('device');
    const outerId = idFactory('device-outer');
    const screenId = idFactory('device-screen');
    const panelId = idFactory('device-panel');
    const labelId = idFactory('device-label');
    const dotIds = [0, 1, 2].map((index) => idFactory(`device-dot-${index}`));

    const elements: Record<string, TraceElement> = {
      [outerId]: rect(outerId, 'Frame', {
        x: -280 * scale,
        y: -160 * scale,
        width: 560 * scale,
        height: 320 * scale,
        rx: 30 * scale,
        fill: frame,
        stroke: 'rgba(148, 163, 184, 0.28)',
        strokeWidth: 2,
      }),
      [screenId]: rect(screenId, 'Screen', {
        x: -264 * scale,
        y: -144 * scale,
        width: 528 * scale,
        height: 288 * scale,
        rx: 18 * scale,
        fill: '#0f172a',
      }),
      [panelId]: rect(panelId, 'App panel', {
        x: -240 * scale,
        y: -96 * scale,
        width: 480 * scale,
        height: 196 * scale,
        rx: 12 * scale,
        fill: withAlpha(accent, 0.1),
        stroke: withAlpha(accent, 0.4),
        strokeWidth: 1.5,
      }),
      [labelId]: text(
        labelId,
        'Label',
        {
          y: 92 * scale,
          text: label,
          fontSize: 20 * scale,
          fontWeight: 600,
          fill: '#e2e8f0',
          textAnchor: 'middle',
        },
        [
          blockTrack(`${labelId}-opacity`, 'opacity', 'Opacity', [
            { timeMs: 240, value: 0 },
            { timeMs: 760, value: 1 },
          ]),
        ],
      ),
    };

    dotIds.forEach((dotId, index) => {
      const cx = (-244 + index * 18) * scale;
      elements[dotId] = dot(
        dotId,
        `Dot ${index + 1}`,
        cx,
        -128 * scale,
        5 * scale,
        index === 0 ? accent : '#334155',
      );
    });

    return assemble(
      group(
          rootId,
          'Device frame',
          canvas.width / 2,
          canvas.height / 2,
          560 * scale,
          320 * scale,
          [outerId, screenId, ...dotIds, panelId, labelId],
          [
            blockTrack(`${rootId}-opacity`, 'opacity', 'Opacity', [
              { timeMs: 0, value: 0 },
              { timeMs: 500, value: 1 },
            ]),
            blockTrack(`${rootId}-scaleX`, 'scaleX', 'Scale X', [
              { timeMs: 0, value: 0.95, easing: 'back.out' },
              { timeMs: 700, value: 1, easing: 'back.out' },
            ]),
            blockTrack(`${rootId}-scaleY`, 'scaleY', 'Scale Y', [
              { timeMs: 0, value: 0.95, easing: 'back.out' },
              { timeMs: 700, value: 1, easing: 'back.out' },
            ]),
          ],
        ),
      elements,
      canvas.width,
      canvas.height,
    );
  },
};

export const backgroundTreatmentBlock: TraceBlockDefinition = {
  id: 'background-treatment',
  title: 'Background treatment',
  description:
    'Full-frame base with three slow glow pools and edge shading. Inserts behind existing art so it never covers the composition.',
  category: 'Backgrounds',
  tags: ['background', 'glow', 'gradient', 'vignette'],
  keywords: ['background', 'backdrop', 'glow field', 'vignette', 'gradient mesh'],
  layer: 'background',
  fields: [
    { key: 'baseColor', label: 'Base', kind: 'color' },
    { key: 'glowColor', label: 'Glow', kind: 'color' },
  ],
  defaults: { baseColor: '#0b1120', glowColor: '#38bdf8' },
  size: { width: 1280, height: 720 },
  previewTimeMs: 1600,
  previewDurationMs: 3200,
  build: ({ options, idFactory, canvas }) => {
    const base = optionColor(options, 'baseColor', '#0b1120');
    const glow = optionColor(options, 'glowColor', '#38bdf8');
    const rootId = idFactory('bg');
    const baseId = idFactory('bg-base');
    const topId = idFactory('bg-top');
    const bottomId = idFactory('bg-bottom');
    const glowIds = [0, 1, 2].map((index) => idFactory(`bg-glow-${index}`));

    const glows: Array<[number, number, number, number]> = [
      [canvas.width * 0.18, canvas.height * 0.16, canvas.width * 0.38, 0.12],
      [canvas.width * 0.88, canvas.height * 0.22, canvas.width * 0.32, 0.1],
      [canvas.width * 0.55, canvas.height * 0.98, canvas.width * 0.42, 0.08],
    ];

    const elements: Record<string, TraceElement> = {
      [baseId]: rect(baseId, 'Base', {
        width: canvas.width,
        height: canvas.height,
        fill: base,
      }),
      ...Object.fromEntries(
        glowIds.map((glowId, index) => {
          const [cx, cy, radius, alpha] = glows[index];
          return [
            glowId,
            dot(glowId, `Glow ${index + 1}`, cx, cy, radius, withAlpha(glow, alpha), [
              blockTrack(`${glowId}-opacity`, 'opacity', 'Opacity', [
                { timeMs: 0, value: 0.7 },
                { timeMs: 1600, value: 1 },
                { timeMs: 3200, value: 0.7 },
              ]),
            ]),
          ];
        }),
      ),
      [topId]: rect(topId, 'Top shade', {
        width: canvas.width,
        height: canvas.height * 0.1,
        fill: 'rgba(0, 0, 0, 0.28)',
      }),
      [bottomId]: rect(bottomId, 'Bottom shade', {
        y: canvas.height * 0.9,
        width: canvas.width,
        height: canvas.height * 0.1,
        fill: 'rgba(0, 0, 0, 0.28)',
      }),
    };

    return assemble(
      group(
          rootId,
          'Background treatment',
          0,
          0,
          canvas.width,
          canvas.height,
          [baseId, ...glowIds, topId, bottomId],
        ),
      elements,
      canvas.width,
      canvas.height,
    );
  },
};

export const bulletListBlock: TraceBlockDefinition = {
  id: 'bullet-list',
  title: 'Bullet list',
  description:
    'A short list of points that reveals line by line — one line per row in the field.',
  category: 'Titles',
  tags: ['list', 'bullets', 'features'],
  keywords: ['bullet list', 'feature list', 'points', 'checklist'],
  fields: [
    { key: 'items', label: 'Items', kind: 'text', multiline: true, maxLength: 320 },
    { key: 'accentColor', label: 'Accent', kind: 'color' },
    { key: 'textColor', label: 'Text', kind: 'color' },
  ],
  defaults: {
    items: 'Ship faster\nStay on brand\nMeasure what matters',
    accentColor: '#38bdf8',
    textColor: '#f8fafc',
  },
  size: { width: 1280, height: 720 },
  previewTimeMs: 1600,
  previewDurationMs: 3400,
  build: ({ options, idFactory, canvas }) => {
    const items = optionLines(
      options,
      'items',
      ['Ship faster', 'Stay on brand', 'Measure what matters'],
      6,
    );
    const accent = optionColor(options, 'accentColor', '#38bdf8');
    const ink = optionColor(options, 'textColor', '#f8fafc');
    const rootId = idFactory('list');
    const childrenIds: string[] = [];
    const elements: Record<string, TraceElement> = {};

    items.forEach((item, index) => {
      const dotId = idFactory(`list-dot-${index}`);
      const textId = idFactory(`list-text-${index}`);
      childrenIds.push(dotId, textId);
      elements[dotId] = dot(dotId, `Bullet ${index + 1}`, 5, index * 56 + 11, 5, accent, [
        blockTrack(`${dotId}-opacity`, 'opacity', 'Opacity', [
          { timeMs: index * 90, value: 0 },
          { timeMs: index * 90 + 420, value: 1 },
        ]),
      ]);
      elements[textId] = text(
        textId,
        `Item ${index + 1}`,
        {
          x: 28,
          y: index * 56 + 13,
          text: item,
          fontSize: 24,
          fontWeight: 500,
          fill: ink,
          textAnchor: 'start',
        },
        [
          blockTrack(`${textId}-opacity`, 'opacity', 'Opacity', [
            { timeMs: index * 90, value: 0 },
            { timeMs: index * 90 + 430, value: 1 },
          ]),
          blockTrack(`${textId}-x`, 'x', 'X', [
            { timeMs: index * 90, value: 10, easing: 'power2.out' },
            { timeMs: index * 90 + 460, value: 28, easing: 'power2.out' },
          ]),
        ],
      );
    });

    return assemble(
      group(
          rootId,
          'Bullet list',
          canvas.width * 0.1,
          canvas.height * 0.34,
          640,
          Math.max(56, items.length * 56),
          childrenIds,
        ),
      elements,
      canvas.width,
      canvas.height,
    );
  },
};

export const logoEndCardBlock: TraceBlockDefinition = {
  id: 'logo-end-card',
  title: 'Logo end card',
  description:
    'Badge, wordmark and tagline settling together — the closing frame of a launch film or sponsor spot.',
  category: 'Social',
  tags: ['logo', 'end card', 'outro', 'brand'],
  keywords: ['end card', 'logo reveal', 'outro', 'closing card', 'wordmark'],
  fields: [
    { key: 'brand', label: 'Brand', kind: 'text', placeholder: 'QEDA', maxLength: 24 },
    { key: 'tagline', label: 'Tagline', kind: 'text', placeholder: 'Made to move', maxLength: 48 },
    { key: 'accentColor', label: 'Accent', kind: 'color' },
    { key: 'textColor', label: 'Text', kind: 'color' },
  ],
  defaults: {
    brand: 'QEDA',
    tagline: 'Made to move',
    accentColor: '#38bdf8',
    textColor: '#f8fafc',
  },
  size: { width: 1280, height: 720 },
  previewTimeMs: 1600,
  previewDurationMs: 3400,
  build: ({ options, idFactory, canvas }) => {
    const brand = optionText(options, 'brand', 'QEDA');
    const tagline = optionText(options, 'tagline', 'Made to move');
    const accent = optionColor(options, 'accentColor', '#38bdf8');
    const ink = optionColor(options, 'textColor', '#f8fafc');
    const rootId = idFactory('endcard');
    const badgeId = idFactory('endcard-badge');
    const brandId = idFactory('endcard-brand');
    const taglineId = idFactory('endcard-tagline');

    const elements: Record<string, TraceElement> = {
      [badgeId]: blockElement({
        id: badgeId,
        name: 'Badge',
        type: 'circle',
        attributes: {
          x: -48,
          y: -166,
          width: 96,
          height: 96,
          fill: withAlpha(accent, 0.16),
          stroke: accent,
          strokeWidth: 2,
        },
        origin: { x: 48, y: 48 },
        tracks: [],
      }),
      [brandId]: text(brandId, 'Wordmark', {
        y: -20,
        text: brand,
        fontSize: 64,
        fontWeight: 800,
        fill: ink,
        textAnchor: 'middle',
      }),
      [taglineId]: text(
        taglineId,
        'Tagline',
        {
          y: 48,
          text: tagline,
          fontSize: 18,
          fontWeight: 500,
          fill: '#94a3b8',
          letterSpacing: 4,
          textAnchor: 'middle',
        },
        [
          blockTrack(`${taglineId}-opacity`, 'opacity', 'Opacity', [
            { timeMs: 420, value: 0 },
            { timeMs: 900, value: 1 },
          ]),
        ],
      ),
    };

    return assemble(
      group(
          rootId,
          'Logo end card',
          canvas.width / 2,
          canvas.height / 2,
          520,
          320,
          [badgeId, brandId, taglineId],
          [
            blockTrack(`${rootId}-opacity`, 'opacity', 'Opacity', [
              { timeMs: 100, value: 0 },
              { timeMs: 700, value: 1 },
            ]),
            blockTrack(`${rootId}-scaleX`, 'scaleX', 'Scale X', [
              { timeMs: 100, value: 0.96, easing: 'power2.out' },
              { timeMs: 800, value: 1, easing: 'power2.out' },
            ]),
            blockTrack(`${rootId}-scaleY`, 'scaleY', 'Scale Y', [
              { timeMs: 100, value: 0.96, easing: 'power2.out' },
              { timeMs: 800, value: 1, easing: 'power2.out' },
            ]),
          ],
        ),
      elements,
      canvas.width,
      canvas.height,
    );
  },
};