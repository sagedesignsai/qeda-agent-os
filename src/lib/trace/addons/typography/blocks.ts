/**
 * lib/trace/addons/typography/blocks.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The Typography add-on. Text-first blocks that complement the existing title,
 * kinetic-type and lower-third recipes: captions, tickers, credits, split
 * titles, typewriter lines and agendas.
 *
 * Everything is ordinary text/rect/group layers with ordinary tracks, so copy,
 * font, colour and timing remain editable after insertion.
 */

import type { TraceAssetFragment } from '../../assets/types';
import type { PropertyTrack, TraceElement } from '../../types';
import {
  BLOCK_FONT,
  blockElement,
  blockTrack,
  optionColor,
  optionLines,
  optionText,
  withAlpha,
} from '../../blocks/helpers';
import type { TraceBlockDefinition } from '../../blocks/types';

const MONO_FONT = '"JetBrains Mono", "SFMono-Regular", Consolas, monospace';
const SAFE_DURATION = 4000;

function textElement(
  id: string,
  name: string,
  attributes: Record<string, unknown>,
  tracks: PropertyTrack[] = [],
  origin: { x: number; y: number } = { x: 0, y: 0 },
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

function rectElement(
  id: string,
  name: string,
  attributes: Record<string, unknown>,
  tracks: PropertyTrack[] = [],
): TraceElement {
  const width = Number(attributes.width ?? 0);
  const height = Number(attributes.height ?? 0);
  return blockElement({
    id,
    name,
    type: 'rect',
    attributes: { x: 0, y: 0, ...attributes },
    tracks,
    origin: { x: width / 2, y: height / 2 },
  });
}

function groupElement(
  id: string,
  name: string,
  attributes: Record<string, unknown>,
  childrenIds: string[],
  tracks: PropertyTrack[] = [],
  origin: { x: number; y: number } = { x: 0, y: 0 },
): TraceElement {
  return blockElement({
    id,
    name,
    type: 'group',
    attributes,
    childrenIds,
    tracks,
    origin,
  });
}

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
    elements[id] = { ...child, parentId: child.parentId ?? root.id };
  }
  return { width, height, elements, rootElementIds: [root.id] };
}

function track(
  id: string,
  property: PropertyTrack['property'],
  label: string,
  keyframes: Array<{ timeMs: number; value: number | string; easing?: string }>,
  discrete = false,
): PropertyTrack {
  const result = blockTrack(id, property, label, keyframes);
  if (discrete) result.discrete = true;
  return result;
}

const textColorDefault = '#f8fafc';
const mutedColorDefault = '#94a3b8';

export const captionBlock: TraceBlockDefinition = {
  id: 'text-caption',
  title: 'Caption card',
  description:
    'Broadcast-style caption with a speaker label, accent bar and semi-transparent card, timed to fade in and out inside the subtitle-safe band.',
  category: 'Titles',
  addonId: 'typography',
  tags: ['caption', 'subtitle', 'speaker', 'broadcast', 'accessible'],
  keywords: [
    'caption',
    'subtitle',
    'closed captions',
    'speaker label',
    'interview',
    'accessibility',
  ],
  fields: [
    {
      key: 'text',
      label: 'Caption',
      kind: 'text',
      placeholder: 'The best ideas move.',
      maxLength: 120,
      multiline: true,
    },
    { key: 'speaker', label: 'Speaker', kind: 'text', placeholder: 'MAYA CHEN', maxLength: 32 },
    { key: 'accentColor', label: 'Accent', kind: 'color' },
    { key: 'textColor', label: 'Text', kind: 'color' },
  ],
  defaults: {
    text: 'The best ideas move.',
    speaker: 'MAYA CHEN',
    accentColor: '#38bdf8',
    textColor: textColorDefault,
  },
  size: { width: 1280, height: 720 },
  previewTimeMs: 1800,
  previewDurationMs: SAFE_DURATION,
  build: ({ options, idFactory, canvas }) => {
    const copy = optionText(options, 'text', 'The best ideas move.');
    const speaker = optionText(options, 'speaker', 'MAYA CHEN');
    const accent = optionColor(options, 'accentColor', '#38bdf8');
    const ink = optionColor(options, 'textColor', textColorDefault);

    const rootId = idFactory('caption');
    const cardId = idFactory('caption-card');
    const barId = idFactory('caption-bar');
    const speakerId = idFactory('caption-speaker');
    const copyId = idFactory('caption-copy');

    const width = Math.min(canvas.width * 0.78, 900);
    const height = 132;
    const x = (canvas.width - width) / 2;
    const y = canvas.height * 0.78;

    return assemble(
      groupElement(
        rootId,
        'Caption card',
        { baseX: x, baseY: y, x: 0, y: 0, width, height },
        [cardId, barId, speakerId, copyId],
        [
          track(`${rootId}-opacity`, 'opacity', 'Reveal', [
            { timeMs: 0, value: 0, easing: 'power2.out' },
            { timeMs: 420, value: 1, easing: 'power2.out' },
            { timeMs: 3400, value: 1, easing: 'power2.in' },
            { timeMs: 3900, value: 0, easing: 'power2.in' },
          ]),
          track(`${rootId}-y`, 'y', 'Rise', [
            { timeMs: 0, value: 18, easing: 'power3.out' },
            { timeMs: 460, value: 0, easing: 'power3.out' },
            { timeMs: 3900, value: 10, easing: 'power2.in' },
          ]),
        ],
      ),
      {
        [cardId]: rectElement(cardId, 'Card', {
          width,
          height,
          rx: 14,
          fill: 'rgba(2, 6, 23, 0.78)',
          stroke: 'rgba(148, 163, 184, 0.2)',
          strokeWidth: 1,
        }),
        [barId]: rectElement(barId, 'Accent bar', {
          x: 18,
          y: 22,
          width: 4,
          height: height - 44,
          rx: 2,
          fill: accent,
        }),
        [speakerId]: textElement(speakerId, 'Speaker', {
          x: 38,
          y: 34,
          text: speaker.toUpperCase(),
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: 3,
          fill: accent,
        }),
        [copyId]: textElement(copyId, 'Caption', {
          x: 38,
          y: 80,
          text: copy,
          fontSize: 28,
          fontWeight: 600,
          fill: ink,
        }),
      },
      canvas.width,
      canvas.height,
    );
  },
};

export const tickerBlock: TraceBlockDefinition = {
  id: 'text-ticker',
  title: 'Ticker tape',
  description:
    'A loop-safe marquee strip with a label chip and repeated copy. Scrolls exactly one segment per loop, so the seam is invisible.',
  category: 'Titles',
  addonId: 'typography',
  tags: ['ticker', 'marquee', 'news', 'scroll', 'strip', 'loop'],
  keywords: ['ticker', 'marquee', 'news ticker', 'scrolling text', 'lower strip'],
  fields: [
    { key: 'text', label: 'Copy', kind: 'text', placeholder: 'BREAKING · SHIP SOMETHING REMARKABLE', maxLength: 90 },
    { key: 'label', label: 'Label', kind: 'text', placeholder: 'LIVE', maxLength: 12 },
    { key: 'barColor', label: 'Bar', kind: 'color' },
    { key: 'accentColor', label: 'Label', kind: 'color' },
  ],
  defaults: {
    text: 'BREAKING · SHIP SOMETHING REMARKABLE',
    label: 'LIVE',
    barColor: '#020617',
    accentColor: '#f97316',
  },
  size: { width: 1280, height: 720 },
  previewTimeMs: 1600,
  previewDurationMs: SAFE_DURATION,
  build: ({ options, idFactory, canvas }) => {
    const copy = optionText(options, 'text', 'BREAKING · SHIP SOMETHING REMARKABLE');
    const label = optionText(options, 'label', 'LIVE');
    const bar = optionColor(options, 'barColor', '#020617');
    const accent = optionColor(options, 'accentColor', '#f97316');

    const rootId = idFactory('ticker');
    const stripId = idFactory('ticker-strip');
    const chipId = idFactory('ticker-chip');
    const chipTextId = idFactory('ticker-chip-text');
    const trackId = idFactory('ticker-track');
    const barHeight = 56;
    const y = canvas.height - barHeight - 36;
    const chipWidth = 118;
    // One segment is the copy plus a gap; scrolling exactly one segment makes
    // the loop seam invisible and keeps the strip continuously filled.
    const estimatedTextWidth = copy.length * 15 + 60;
    const textWidth = estimatedTextWidth + 90;
    const repeatIds = [0, 1, 2].map((index) => idFactory(`ticker-copy-${index}`));

    const copies: Record<string, TraceElement> = {};
    repeatIds.forEach((id, index) => {
      copies[id] = {
        ...textElement(id, `Ticker copy ${index + 1}`, {
          x: chipWidth + 28 + index * textWidth,
          y: barHeight / 2,
          text: copy,
          fontSize: 20,
          fontWeight: 600,
          letterSpacing: 1.5,
          fill: '#e2e8f0',
        }),
        parentId: trackId,
      };
    });

    return assemble(
      groupElement(
        rootId,
        'Ticker tape',
        { x: 0, y, width: canvas.width, height: barHeight },
        [stripId, trackId, chipId, chipTextId],
      ),
      {
        [stripId]: rectElement(stripId, 'Strip', {
          width: canvas.width,
          height: barHeight,
          fill: withAlpha(bar, 0.92),
        }),
        [chipId]: rectElement(chipId, 'Label chip', {
          width: chipWidth,
          height: barHeight,
          fill: accent,
        }),
        [chipTextId]: textElement(chipTextId, 'Label', {
          x: chipWidth / 2,
          y: barHeight / 2,
          text: label.toUpperCase(),
          fontSize: 14,
          fontWeight: 800,
          letterSpacing: 2,
          textAnchor: 'middle',
          fill: '#0b1120',
        }),
        [trackId]: groupElement(
          trackId,
          'Scrolling copy',
          { x: 0, y: 0, width: canvas.width, height: barHeight },
          repeatIds,
          [
            track(`${trackId}-x`, 'x', 'Marquee', [
              { timeMs: 0, value: 0, easing: 'linear' },
              { timeMs: SAFE_DURATION, value: -textWidth, easing: 'linear' },
            ]),
          ],
        ),
        ...copies,
      },
      canvas.width,
      canvas.height,
    );
  },
};

export const creditsBlock: TraceBlockDefinition = {
  id: 'text-credits',
  title: 'Credits roll',
  description:
    'A vertical end-credit roll with a heading, role/name pairs and a closing mark. Scrolls from below the frame to above it.',
  category: 'Titles',
  addonId: 'typography',
  tags: ['credits', 'roll', 'end card', 'names', 'outro'],
  keywords: ['credits', 'end credits', 'roll', 'names', 'outro', 'thanks'],
  fields: [
    { key: 'heading', label: 'Heading', kind: 'text', placeholder: 'MADE BY', maxLength: 40 },
    {
      key: 'lines',
      label: 'Lines',
      kind: 'text',
      placeholder: 'Maya Chen — Direction\nIris Park — Motion\nNoah Vale — Sound',
      maxLength: 360,
      multiline: true,
    },
    { key: 'accentColor', label: 'Accent', kind: 'color' },
    { key: 'textColor', label: 'Text', kind: 'color' },
  ],
  defaults: {
    heading: 'MADE BY',
    lines: 'Maya Chen — Direction\nIris Park — Motion\nNoah Vale — Sound\nQeda — Studio',
    accentColor: '#38bdf8',
    textColor: textColorDefault,
  },
  size: { width: 1280, height: 720 },
  previewTimeMs: 2000,
  previewDurationMs: SAFE_DURATION,
  build: ({ options, idFactory, canvas }) => {
    const heading = optionText(options, 'heading', 'MADE BY');
    const lines = optionLines(
      options,
      'lines',
      ['Maya Chen — Direction', 'Iris Park — Motion', 'Noah Vale — Sound', 'Qeda — Studio'],
      8,
    );
    const accent = optionColor(options, 'accentColor', '#38bdf8');
    const ink = optionColor(options, 'textColor', textColorDefault);

    const rootId = idFactory('credits');
    const headingId = idFactory('credits-heading');
    const lineIds = lines.map((_, index) => idFactory(`credits-line-${index}`));
    const lineHeight = 58;
    const contentHeight = 130 + lines.length * lineHeight;

    const children: Record<string, TraceElement> = {
      [headingId]: textElement(headingId, 'Heading', {
        y: 0,
        text: heading.toUpperCase(),
        fontSize: 16,
        fontWeight: 700,
        letterSpacing: 7,
        textAnchor: 'middle',
        fill: accent,
      }),
    };
    lineIds.forEach((id, index) => {
      children[id] = textElement(
        id,
        `Credit ${index + 1}`,
        {
          y: 74 + index * lineHeight,
          text: lines[index],
          fontSize: 34,
          fontWeight: index === 0 ? 700 : 500,
          textAnchor: 'middle',
          fill:
            index === 0
              ? ink
              : index === lines.length - 1
                ? mutedColorDefault
                : withAlpha(ink, 0.86),
        },
        [],
      );
    });

    return assemble(
      groupElement(
        rootId,
        'Credits roll',
        {
          x: canvas.width / 2,
          y: 0,
          width: 640,
          height: contentHeight,
        },
        [headingId, ...lineIds],
        [
          track(`${rootId}-y`, 'y', 'Roll', [
            { timeMs: 0, value: canvas.height, easing: 'linear' },
            {
              timeMs: SAFE_DURATION,
              value: -contentHeight,
              easing: 'linear',
            },
          ]),
          track(`${rootId}-opacity`, 'opacity', 'Fade', [
            { timeMs: 0, value: 0, easing: 'ease-out' },
            { timeMs: 260, value: 1, easing: 'ease-out' },
            { timeMs: 3700, value: 1, easing: 'ease-in' },
            { timeMs: 4000, value: 0, easing: 'ease-in' },
          ]),
        ],
        { x: 0, y: 0 },
      ),
      children,
      canvas.width,
      canvas.height,
    );
  },
};

export const splitTitleBlock: TraceBlockDefinition = {
  id: 'text-split-title',
  title: 'Split title',
  description:
    'Editorial two-line title with an uppercase kicker and a growing accent rule. Stacks line-by-line with a crisp stagger.',
  category: 'Titles',
  addonId: 'typography',
  tags: ['title', 'editorial', 'headline', 'split', 'opener'],
  keywords: ['split title', 'editorial title', 'two line title', 'headline', 'opener'],
  fields: [
    { key: 'kicker', label: 'Kicker', kind: 'text', placeholder: 'FIELD NOTES', maxLength: 32 },
    { key: 'line1', label: 'Line 1', kind: 'text', placeholder: 'Make the', maxLength: 44 },
    { key: 'line2', label: 'Line 2', kind: 'text', placeholder: 'invisible visible.', maxLength: 44 },
    { key: 'accentColor', label: 'Accent', kind: 'color' },
    { key: 'textColor', label: 'Text', kind: 'color' },
  ],
  defaults: {
    kicker: 'FIELD NOTES',
    line1: 'Make the',
    line2: 'invisible visible.',
    accentColor: '#38bdf8',
    textColor: textColorDefault,
  },
  size: { width: 1280, height: 720 },
  previewTimeMs: 1900,
  previewDurationMs: SAFE_DURATION,
  build: ({ options, idFactory, canvas }) => {
    const kicker = optionText(options, 'kicker', 'FIELD NOTES');
    const line1 = optionText(options, 'line1', 'Make the');
    const line2 = optionText(options, 'line2', 'invisible visible.');
    const accent = optionColor(options, 'accentColor', '#38bdf8');
    const ink = optionColor(options, 'textColor', textColorDefault);

    const rootId = idFactory('split-title');
    const kickerId = idFactory('split-kicker');
    const line1Id = idFactory('split-line-1');
    const line2Id = idFactory('split-line-2');
    const ruleId = idFactory('split-rule');
    const baseX = canvas.width * 0.08;
    const baseY = canvas.height * 0.42;

    const items = [
      { id: line1Id, text: line1, delay: 120, weight: 800 },
      { id: line2Id, text: line2, delay: 240, weight: 800 },
    ];

    const children: Record<string, TraceElement> = {
      [kickerId]: textElement(
        kickerId,
        'Kicker',
        {
          y: -130,
          text: kicker.toUpperCase(),
          fontSize: 15,
          fontWeight: 700,
          letterSpacing: 6,
          fill: accent,
        },
        [
          track(`${kickerId}-opacity`, 'opacity', 'Fade', [
            { timeMs: 0, value: 0, easing: 'ease-out' },
            { timeMs: 380, value: 1, easing: 'ease-out' },
          ]),
        ],
      ),
      [line1Id]: textElement(
        line1Id,
        'Headline 1',
        {
          y: -30,
          text: line1,
          fontSize: 78,
          fontWeight: 800,
          fill: ink,
          letterSpacing: -1.5,
        },
        [
          track(`${line1Id}-opacity`, 'opacity', 'Fade', [
            { timeMs: 120, value: 0, easing: 'power2.out' },
            { timeMs: 620, value: 1, easing: 'power2.out' },
          ]),
          track(`${line1Id}-y`, 'y', 'Rise', [
            { timeMs: 120, value: 12, easing: 'power3.out' },
            { timeMs: 660, value: -30, easing: 'power3.out' },
          ]),
        ],
      ),
      [line2Id]: textElement(
        line2Id,
        'Headline 2',
        {
          y: 62,
          text: line2,
          fontSize: 78,
          fontWeight: 800,
          fill: withAlpha(ink, 0.72),
          letterSpacing: -1.5,
        },
        [
          track(`${line2Id}-opacity`, 'opacity', 'Fade', [
            { timeMs: 240, value: 0, easing: 'power2.out' },
            { timeMs: 760, value: 1, easing: 'power2.out' },
          ]),
          track(`${line2Id}-y`, 'y', 'Rise', [
            { timeMs: 240, value: 74, easing: 'power3.out' },
            { timeMs: 800, value: 62, easing: 'power3.out' },
          ]),
        ],
      ),
      [ruleId]: rectElement(
        ruleId,
        'Accent rule',
        {
          y: 132,
          width: 0,
          height: 5,
          rx: 2.5,
          fill: accent,
        },
        [
          track(`${ruleId}-width`, 'width', 'Draw', [
            { timeMs: 520, value: 0, easing: 'power3.out' },
            { timeMs: 1080, value: 220, easing: 'power3.out' },
          ]),
        ],
      ),
    };

    return assemble(
      groupElement(
        rootId,
        'Split title',
        { x: baseX, y: baseY, width: 900, height: 340 },
        [kickerId, line1Id, line2Id, ruleId],
      ),
      children,
      canvas.width,
      canvas.height,
    );
  },
};

export const typewriterBlock: TraceBlockDefinition = {
  id: 'text-typewriter',
  title: 'Typewriter line',
  description:
    'A monospace line typed on with discrete text keyframes and a blinking block cursor. Reads as terminal, code or dispatch copy.',
  category: 'Titles',
  addonId: 'typography',
  tags: ['typewriter', 'terminal', 'code', 'monospace', 'typing', 'cursor'],
  keywords: ['typewriter', 'typing', 'terminal', 'code', 'monospace', 'cursor'],
  fields: [
    { key: 'text', label: 'Line', kind: 'text', placeholder: '> deploy --now', maxLength: 24 },
    { key: 'prefix', label: 'Prefix', kind: 'text', placeholder: '>', maxLength: 4 },
    { key: 'accentColor', label: 'Cursor', kind: 'color' },
    { key: 'textColor', label: 'Text', kind: 'color' },
  ],
  defaults: {
    text: 'deploy --now',
    prefix: '>',
    accentColor: '#22d3ee',
    textColor: '#a5f3fc',
  },
  size: { width: 1280, height: 720 },
  previewTimeMs: 2200,
  previewDurationMs: SAFE_DURATION,
  build: ({ options, idFactory, canvas }) => {
    const line = optionText(options, 'text', 'deploy --now').slice(0, 24);
    const prefix = optionText(options, 'prefix', '>');
    const accent = optionColor(options, 'accentColor', '#22d3ee');
    const ink = optionColor(options, 'textColor', '#a5f3fc');

    const rootId = idFactory('typewriter');
    const prefixId = idFactory('typewriter-prefix');
    const textId = idFactory('typewriter-text');
    const cursorId = idFactory('typewriter-cursor');
    const fontSize = Math.min(64, canvas.width / 22);
    const charWidth = fontSize * 0.62;
    const x = canvas.width * 0.08;
    const y = canvas.height * 0.5;
    const typingFrames = Math.min(20, Math.max(2, line.length));
    const keyframes = Array.from({ length: typingFrames }, (_, index) => {
      const progress = (index + 1) / typingFrames;
      return {
        timeMs: Math.round(160 + progress * 1700),
        value: line.slice(0, Math.max(1, Math.round(line.length * progress))),
        easing: 'linear',
      };
    });
    if (keyframes[0].timeMs > 0) {
      keyframes.unshift({ timeMs: 0, value: '', easing: 'linear' });
    }

    return assemble(
      groupElement(
        rootId,
        'Typewriter line',
        { x, y, width: canvas.width - x * 2, height: 100 },
        [prefixId, textId, cursorId],
      ),
      {
        [prefixId]: textElement(prefixId, 'Prompt', {
          y: 0,
          text: prefix,
          fontFamily: MONO_FONT,
          fontSize,
          fontWeight: 500,
          fill: withAlpha(ink, 0.55),
        }),
        [textId]: textElement(
          textId,
          'Typed line',
          {
            x: (prefix.length + 1) * charWidth,
            y: 0,
            text: line.slice(0, 1),
            fontFamily: MONO_FONT,
            fontSize,
            fontWeight: 600,
            fill: ink,
          },
          [
            track(`${textId}-text`, 'text', 'Typing', keyframes, true),
            track(`${textId}-opacity`, 'opacity', 'Power on', [
              { timeMs: 0, value: 0, easing: 'ease-out' },
              { timeMs: 120, value: 1, easing: 'ease-out' },
            ]),
          ],
        ),
        [cursorId]: rectElement(
          cursorId,
          'Cursor',
          {
            x: (prefix.length + 2) * charWidth + line.length * charWidth,
            y: -fontSize * 0.55,
            width: charWidth * 0.9,
            height: fontSize * 1.1,
            fill: accent,
          },
          [
            track(`${cursorId}-x`, 'x', 'Cursor follow', keyframes.map((keyframe) => ({
              timeMs: keyframe.timeMs,
              value:
                (prefix.length + 2) * charWidth +
                String(keyframe.value).length * charWidth,
              easing: 'linear',
            }))),
            track(
              `${cursorId}-opacity`,
              'opacity',
              'Blink',
              [
                { timeMs: 0, value: 1, easing: 'linear' },
                { timeMs: 520, value: 0, easing: 'linear' },
                { timeMs: 1040, value: 1, easing: 'linear' },
                { timeMs: 1560, value: 0, easing: 'linear' },
                { timeMs: 2080, value: 1, easing: 'linear' },
                { timeMs: 2600, value: 0, easing: 'linear' },
                { timeMs: 3120, value: 1, easing: 'linear' },
                { timeMs: 3640, value: 0, easing: 'linear' },
                { timeMs: 4000, value: 1, easing: 'linear' },
              ],
              true,
            ),
          ],
          { x: 0, y: 0 },
        ),
      },
      canvas.width,
      canvas.height,
    );
  },
};

export const agendaBlock: TraceBlockDefinition = {
  id: 'text-agenda',
  title: 'Numbered agenda',
  description:
    'A compact numbered agenda with accent numerals and staggered line reveals. Good for walkthroughs, chapters and recap cards.',
  category: 'Titles',
  addonId: 'typography',
  tags: ['agenda', 'list', 'numbered', 'chapters', 'recap'],
  keywords: ['agenda', 'numbered list', 'chapters', 'outline', 'recap', 'steps'],
  fields: [
    {
      key: 'items',
      label: 'Items',
      kind: 'text',
      placeholder: 'The brief\nFirst pass\nReview\nDelivery',
      maxLength: 260,
      multiline: true,
    },
    { key: 'heading', label: 'Heading', kind: 'text', placeholder: 'TODAY', maxLength: 28 },
    { key: 'accentColor', label: 'Accent', kind: 'color' },
    { key: 'textColor', label: 'Text', kind: 'color' },
  ],
  defaults: {
    items: 'The brief\nFirst pass\nReview\nDelivery',
    heading: 'TODAY',
    accentColor: '#38bdf8',
    textColor: textColorDefault,
  },
  size: { width: 1280, height: 720 },
  previewTimeMs: 1800,
  previewDurationMs: SAFE_DURATION,
  build: ({ options, idFactory, canvas }) => {
    const items = optionLines(
      options,
      'items',
      ['The brief', 'First pass', 'Review', 'Delivery'],
      6,
    );
    const heading = optionText(options, 'heading', 'TODAY');
    const accent = optionColor(options, 'accentColor', '#38bdf8');
    const ink = optionColor(options, 'textColor', textColorDefault);

    const rootId = idFactory('agenda');
    const headingId = idFactory('agenda-heading');
    const rowIds = items.map((_, index) => idFactory(`agenda-row-${index}`));
    const numberIds = items.map((_, index) => idFactory(`agenda-number-${index}`));
    const labelIds = items.map((_, index) => idFactory(`agenda-label-${index}`));

    const x = canvas.width * 0.08;
    const y = canvas.height * 0.18;
    const rowHeight = Math.min(78, (canvas.height * 0.68) / items.length);
    const children: Record<string, TraceElement> = {
      [headingId]: textElement(headingId, 'Heading', {
        y: -44,
        text: heading.toUpperCase(),
        fontSize: 13,
        fontWeight: 700,
        letterSpacing: 5,
        fill: accent,
      }),
    };

    rowIds.forEach((rowId, index) => {
      const rowY = index * rowHeight;
      children[rowId] = groupElement(
        rowId,
        `Row ${index + 1}`,
        { x: 0, y: rowY, width: 620, height: rowHeight },
        [numberIds[index], labelIds[index]],
        [
          track(`${rowId}-opacity`, 'opacity', 'Reveal', [
            { timeMs: 160 + index * 110, value: 0, easing: 'power2.out' },
            { timeMs: 560 + index * 110, value: 1, easing: 'power2.out' },
          ]),
          track(`${rowId}-x`, 'x', 'Slide', [
            { timeMs: 160 + index * 110, value: -18, easing: 'power3.out' },
            { timeMs: 600 + index * 110, value: 0, easing: 'power3.out' },
          ]),
        ],
      );
      children[numberIds[index]] = textElement(
        numberIds[index],
        'Number',
        {
          x: 18,
          y: rowHeight / 2,
          text: String(index + 1).padStart(2, '0'),
          fontFamily: MONO_FONT,
          fontSize: 18,
          fontWeight: 600,
          fill: accent,
        },
      );
      children[numberIds[index]].parentId = rowId;
      children[labelIds[index]] = textElement(
        labelIds[index],
        'Item',
        {
          x: 66,
          y: rowHeight / 2,
          text: items[index],
          fontSize: 32,
          fontWeight: 600,
          fill: index === items.length - 1 ? withAlpha(ink, 0.65) : ink,
        },
      );
      children[labelIds[index]].parentId = rowId;
    });

    return assemble(
      groupElement(
        rootId,
        'Numbered agenda',
        {
          x,
          y,
          width: 640,
          height: items.length * rowHeight + 60,
        },
        [headingId, ...rowIds],
      ),
      children,
      canvas.width,
      canvas.height,
    );
  },
};