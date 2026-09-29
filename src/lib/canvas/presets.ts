/**
 * lib/canvas/presets.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Template documents at real, exact sizes, used as the starting point for a
 * new composition and as fixtures in the tests.
 *
 * WHY EXACT SIZES MATTER MORE THAN PRETTY. 1200×630 is the Open Graph size
 * every major consumer renders; 1080×1080 is the square feed unit; 1080×1920 is
 * the 9:16 story unit. A preset at a "roughly right" size is a preset that
 * silently crops or letterboxes in the one place it was built for, so the
 * numbers are literals and the test asserts them.
 *
 * WHY THEY ARE SUBSTANTIVE. A preset that is an empty box teaches a user
 * nothing, renders as a blank page, and — worse — would let a bug in the
 * emitter hide behind a document with no content. The `>400 JSON chars` floor
 * in the test suite is a crude but effective guard against that.
 *
 * WHY THEY ARE `DocInput` AND NOT `Doc`. `Doc` is the *parsed* type, where
 * `locked`/`visible` are filled in by defaults. A preset is authored data, so
 * it is typed against the input type and parsed at the boundary — which also
 * means the parse is exercised every time a preset is used.
 *
 * IDs ARE STABLE AND READABLE (`bg`, `headline`, `rule`). Unlike generated
 * ids, a human-readable one makes a diff of two versions of the same preset
 * actually reviewable.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { DocInput } from './schema';

// ─────────────────────────────────────────────────────────────────────────────
// 1200 × 630 — Open Graph / link card
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A link card: brand rule, headline, sub-line, and a rotated accent disc
 * (which exercises the group path — see `rot` below).
 */
export const LINK_CARD: DocInput = {
  id: 'preset-link-card',
  name: 'Link card',
  width: 1200,
  height: 630,
  background: 'surface',
  pages: [
    {
      id: 'link-card-page',
      name: 'Default',
      background: 'surface',
      groups: [
        {
          id: 'disc-group',
          label: 'Accent disc',
          rotate: -12,
          nodeIds: ['disc', 'disc-inner'],
        },
      ],
      nodes: [
        {
          id: 'bg',
          kind: 'shape',
          name: 'Background',
          shape: 'rect',
          x: 0,
          y: 0,
          w: 1200,
          h: 630,
          fill: 'surface',
        },
        {
          id: 'band',
          kind: 'shape',
          name: 'Accent band',
          shape: 'rect',
          x: 0,
          y: 0,
          w: 14,
          h: 630,
          fill: 'accent',
        },
        {
          id: 'brand',
          kind: 'text',
          name: 'Brand',
          x: 72,
          y: 64,
          w: 400,
          h: 34,
          content: 'QEDA STUDIO',
          fontSize: 22,
          fontWeight: 700,
          color: 'brand',
          align: 'left',
          lineHeight: 1.2,
        },
        {
          id: 'headline',
          kind: 'text',
          name: 'Headline',
          x: 72,
          y: 150,
          w: 700,
          content: 'Design documents\nthat stay documents',
          fontSize: 64,
          fontWeight: 800,
          color: 'on-surface',
          align: 'left',
          lineHeight: 1.08,
        },
        {
          id: 'subline',
          kind: 'text',
          name: 'Sub-line',
          x: 72,
          y: 380,
          w: 620,
          content:
            'A frozen, diffable canvas model compiled to self-contained HTML. No drift between what you edit and what you export.',
          fontSize: 26,
          fontWeight: 400,
          color: 'on-surface-muted',
          align: 'left',
          lineHeight: 1.45,
        },
        {
          id: 'rule',
          kind: 'shape',
          name: 'Rule',
          shape: 'rect',
          x: 72,
          y: 540,
          w: 180,
          h: 6,
          fill: 'accent',
          style: { radius: 3 },
        },
        {
          id: 'disc',
          kind: 'shape',
          name: 'Disc',
          shape: 'ellipse',
          x: 880,
          y: 130,
          w: 260,
          h: 260,
          fill: 'brand',
          opacity: 0.92,
        },
        {
          id: 'disc-inner',
          kind: 'shape',
          name: 'Disc inner',
          shape: 'ellipse',
          x: 940,
          y: 190,
          w: 140,
          h: 140,
          fill: 'accent',
        },
        {
          id: 'footer',
          kind: 'text',
          name: 'Footer',
          x: 72,
          y: 566,
          w: 500,
          h: 28,
          content: 'vellum.db · one SQLite file · zero drift',
          fontSize: 18,
          fontWeight: 500,
          color: 'on-surface-muted',
          align: 'left',
        },
      ],
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// 1080 × 1080 — square feed post
// ─────────────────────────────────────────────────────────────────────────────

/** A square post: a big number, a quote block, and an image placeholder. */
export const SQUARE_POST: DocInput = {
  id: 'preset-square-post',
  name: 'Square post',
  width: 1080,
  height: 1080,
  background: 'surface-2',
  pages: [
    {
      id: 'square-page',
      name: 'Default',
      groups: [],
      nodes: [
        {
          id: 'card',
          kind: 'shape',
          name: 'Card',
          shape: 'rect',
          x: 60,
          y: 60,
          w: 960,
          h: 960,
          fill: 'surface',
          style: { radius: 32, shadow: '0 18px 48px rgba(11,18,32,0.12)' },
        },
        {
          id: 'eyebrow',
          kind: 'text',
          name: 'Eyebrow',
          x: 120,
          y: 132,
          w: 600,
          h: 32,
          content: 'RELEASE 4.6',
          fontSize: 24,
          fontWeight: 700,
          color: 'accent',
          align: 'left',
        },
        {
          id: 'stat',
          kind: 'text',
          name: 'Stat',
          x: 120,
          y: 200,
          w: 840,
          content: '81',
          fontSize: 260,
          fontWeight: 800,
          color: 'on-surface',
          align: 'left',
          lineHeight: 0.95,
        },
        {
          id: 'stat-label',
          kind: 'text',
          name: 'Stat label',
          x: 120,
          y: 480,
          w: 840,
          content: 'IPC handler modules,\none composition root',
          fontSize: 44,
          fontWeight: 600,
          color: 'on-surface-muted',
          align: 'left',
          lineHeight: 1.25,
        },
        {
          id: 'divider',
          kind: 'shape',
          name: 'Divider',
          shape: 'rect',
          x: 120,
          y: 660,
          w: 840,
          h: 2,
          fill: 'border',
        },
        {
          id: 'quote',
          kind: 'text',
          name: 'Quote',
          x: 120,
          y: 700,
          w: 840,
          content:
            '“One function, two consumers — that is what makes editor/export drift structurally impossible.”',
          fontSize: 32,
          fontWeight: 400,
          color: 'on-surface',
          align: 'left',
          lineHeight: 1.4,
        },
        {
          id: 'shot',
          kind: 'image',
          name: 'Screenshot',
          x: 120,
          y: 850,
          w: 840,
          h: 130,
          fit: 'cover',
          src: { kind: 'asset', assetId: 'asset-square-shot' },
          style: { radius: 16, stroke: 'border', strokeWidth: 1 },
        },
      ],
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// 1080 × 1920 — 9:16 story
// ─────────────────────────────────────────────────────────────────────────────

/** A story: a full-bleed hero, a scrim so the text stays readable, a CTA. */
export const STORY: DocInput = {
  id: 'preset-story',
  name: 'Story',
  width: 1080,
  height: 1920,
  background: 'on-surface',
  pages: [
    {
      id: 'story-page',
      name: 'Default',
      groups: [],
      nodes: [
        {
          id: 'hero',
          kind: 'shape',
          name: 'Hero',
          shape: 'rect',
          x: 0,
          y: 0,
          w: 1080,
          h: 1180,
          fill: 'brand-strong',
        },
        {
          id: 'hero-accent',
          kind: 'shape',
          name: 'Hero accent',
          shape: 'ellipse',
          x: 640,
          y: 140,
          w: 420,
          h: 420,
          fill: 'accent',
          opacity: 0.85,
        },
        {
          id: 'scrim',
          kind: 'shape',
          name: 'Scrim',
          shape: 'rect',
          x: 0,
          y: 700,
          w: 1080,
          h: 480,
          fill: 'on-surface',
          opacity: 0.72,
        },
        {
          id: 'kicker',
          kind: 'text',
          name: 'Kicker',
          x: 88,
          y: 240,
          w: 700,
          h: 40,
          content: 'PHASE 1',
          fontSize: 30,
          fontWeight: 700,
          color: 'on-accent',
          align: 'left',
        },
        {
          id: 'title',
          kind: 'text',
          name: 'Title',
          x: 88,
          y: 780,
          w: 900,
          content: 'A canvas model\nthat never lies\nto you',
          fontSize: 92,
          fontWeight: 800,
          color: 'surface',
          align: 'left',
          lineHeight: 1.06,
        },
        {
          id: 'body',
          kind: 'text',
          name: 'Body',
          x: 88,
          y: 1120,
          w: 904,
          content:
            'The document stores intent, not measurement. Height is emitted only when the author asked for it.',
          fontSize: 34,
          fontWeight: 400,
          color: 'on-surface-muted',
          align: 'left',
          lineHeight: 1.45,
        },
        {
          id: 'cta',
          kind: 'shape',
          name: 'CTA pill',
          shape: 'rect',
          x: 88,
          y: 1360,
          w: 460,
          h: 104,
          fill: 'accent',
          style: { radius: 52 },
        },
        {
          id: 'cta-label',
          kind: 'text',
          name: 'CTA label',
          x: 88,
          y: 1392,
          w: 460,
          h: 44,
          content: 'Read the ADR',
          fontSize: 30,
          fontWeight: 700,
          color: 'on-accent',
          align: 'center',
        },
        {
          id: 'swipe',
          kind: 'text',
          name: 'Swipe hint',
          x: 88,
          y: 1760,
          w: 904,
          h: 36,
          content: 'Swipe up  ↑',
          fontSize: 26,
          fontWeight: 500,
          color: 'on-surface-muted',
          align: 'left',
        },
      ],
    },
  ],
};

/** All presets, keyed by a stable slug. The order is the suggested order. */
export const PRESETS = {
  'link-card': LINK_CARD,
  'square-post': SQUARE_POST,
  story: STORY,
} as const;

export type PresetSlug = keyof typeof PRESETS;

/** The preset slugs, for a picker. */
export const PRESET_SLUGS = Object.keys(PRESETS) as PresetSlug[];

/** Look a preset up by slug. */
export function getPreset(slug: PresetSlug): DocInput {
  return PRESETS[slug];
}
