/**
 * lib/trace/templates/lower-third.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Lower Third overlay template for status/step displays.
 *
 * Features:
 *  - Translucent dark background card (bottom-left, 90% opacity, rounded)
 *  - Primary title text (bold sans-serif)
 *  - Secondary subtext line (lighter, smaller)
 *  - Right-aligned metric badge (numeric readout)
 *  - Slide-in entrance (0.4s, ease-out)
 *  - Fade-out exit
 *
 * Instantiate with: `instantiateLowerThirdTemplate(config)`
 */

import type { TraceOp, TraceElementSpec } from '../ops/types';
import type { TraceDocument } from '../types';
import { createBlankTraceDocument } from '../document';
import { applyOps } from '../ops';

export interface LowerThirdConfig {
  title: string;
  subtitle?: string;
  metric?: string;
  durationMs?: number;
  enterDurationMs?: number;
  exitDurationMs?: number;
}

/**
 * Instantiate a lower third overlay composition.
 *
 * @param config Configuration for title, subtitle, metric, and timing
 * @returns Complete TraceStage ready for export
 */
export function instantiateLowerThirdTemplate(
  config: LowerThirdConfig,
): TraceDocument {
  const {
    title,
    subtitle = '',
    metric = '',
    durationMs = 4000,
    enterDurationMs = 400,
    exitDurationMs = 300,
  } = config;

  const blank = createBlankTraceDocument('Lower Third Overlay', {
    width: 1920,
    height: 1080,
    durationMs,
  });

  const ops: TraceOp[] = [];

  // ──────────────────────────────────────────────────────────────────────────
  // 1. Background card (translucent, rounded, bottom-left)
  // ──────────────────────────────────────────────────────────────────────────

  const cardX = 40;
  const cardY = 880;
  const cardWidth = 600;
  const cardHeight = 140;
  const cardRadius = 12;

  ops.push({
    type: 'addElement',
    element: {
      type: 'rect',
      id: 'bg-card',
      name: 'Background Card',
      x: cardX,
      y: cardY,
      width: cardWidth,
      height: cardHeight,
      rx: cardRadius,
      ry: cardRadius,
      fill: '#000000',
      opacity: 0.9,
      visible: true,
    } as TraceElementSpec,
  });

  // Card slide-in animation (from left)
  ops.push({
    type: 'setTrack',
    elementId: 'bg-card',
    property: 'x',
    label: 'Card Slide In',
    keyframes: [
      { timeMs: 0, value: -cardWidth - 20, easing: 'power3.out' },
      { timeMs: enterDurationMs, value: cardX, easing: 'power3.out' },
      { timeMs: durationMs - exitDurationMs, value: cardX, easing: 'power3.out' },
      { timeMs: durationMs, value: -cardWidth - 20, easing: 'power3.in' },
    ],
  });

  // Card fade-out
  ops.push({
    type: 'setTrack',
    elementId: 'bg-card',
    property: 'opacity',
    label: 'Card Fade Out',
    keyframes: [
      { timeMs: 0, value: 0, easing: 'linear' },
      { timeMs: enterDurationMs, value: 0.9, easing: 'linear' },
      { timeMs: durationMs - exitDurationMs, value: 0.9, easing: 'linear' },
      { timeMs: durationMs, value: 0, easing: 'linear' },
    ],
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Primary title text (bold, large, left-aligned)
  // ──────────────────────────────────────────────────────────────────────────

  const textX = cardX + 30;
  const titleY = cardY + 35;

  ops.push({
    type: 'addElement',
    element: {
      type: 'text',
      id: 'title-text',
      name: 'Title',
      text: title,
      x: textX,
      y: titleY,
      fontSize: 32,
      fontWeight: 700,
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fill: '#ffffff',
      textAnchor: 'start',
      visible: true,
    } as TraceElementSpec,
  });

  // Title slide-in (follows card)
  ops.push({
    type: 'setTrack',
    elementId: 'title-text',
    property: 'x',
    keyframes: [
      { timeMs: 0, value: -cardWidth + 10, easing: 'power3.out' },
      { timeMs: enterDurationMs, value: textX, easing: 'power3.out' },
      { timeMs: durationMs - exitDurationMs, value: textX, easing: 'power3.out' },
      { timeMs: durationMs, value: -cardWidth + 10, easing: 'power3.in' },
    ],
  });

  // Title fade
  ops.push({
    type: 'setTrack',
    elementId: 'title-text',
    property: 'opacity',
    keyframes: [
      { timeMs: 0, value: 0, easing: 'linear' },
      { timeMs: enterDurationMs, value: 1, easing: 'linear' },
      { timeMs: durationMs - exitDurationMs, value: 1, easing: 'linear' },
      { timeMs: durationMs, value: 0, easing: 'linear' },
    ],
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. Secondary subtext (lighter, smaller, left-aligned below title)
  // ──────────────────────────────────────────────────────────────────────────

  if (subtitle) {
    const subtitleY = titleY + 50;

    ops.push({
      type: 'addElement',
      element: {
        type: 'text',
        id: 'subtitle-text',
        name: 'Subtitle',
        text: subtitle,
        x: textX,
        y: subtitleY,
        fontSize: 16,
        fontWeight: 400,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fill: '#cbd5e1',
        textAnchor: 'start',
        visible: true,
      } as TraceElementSpec,
    });

    // Subtitle slide-in (slight delay)
    ops.push({
      type: 'setTrack',
      elementId: 'subtitle-text',
      property: 'x',
      keyframes: [
        { timeMs: 0, value: -cardWidth + 10, easing: 'power3.out' },
        { timeMs: Math.min(enterDurationMs + 80, durationMs), value: textX, easing: 'power3.out' },
        { timeMs: durationMs - exitDurationMs, value: textX, easing: 'power3.out' },
        { timeMs: durationMs, value: -cardWidth + 10, easing: 'power3.in' },
      ],
    });

    // Subtitle fade
    ops.push({
      type: 'setTrack',
      elementId: 'subtitle-text',
      property: 'opacity',
      keyframes: [
        { timeMs: 0, value: 0, easing: 'linear' },
        { timeMs: Math.min(enterDurationMs + 80, durationMs), value: 0.8, easing: 'linear' },
        { timeMs: durationMs - exitDurationMs, value: 0.8, easing: 'linear' },
        { timeMs: durationMs, value: 0, easing: 'linear' },
      ],
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 4. Metric badge (right-aligned, numeric readout)
  // ──────────────────────────────────────────────────────────────────────────

  if (metric) {
    const badgeX = cardX + cardWidth - 50;
    const badgeY = cardY + cardHeight / 2 - 20;
    const badgeWidth = 80;
    const badgeHeight = 60;
    const badgeRadius = 8;

    // Badge background
    ops.push({
      type: 'addElement',
      element: {
        type: 'rect',
        id: 'metric-badge-bg',
        name: 'Metric Badge Background',
        x: badgeX,
        y: badgeY,
        width: badgeWidth,
        height: badgeHeight,
        rx: badgeRadius,
        ry: badgeRadius,
        fill: 'rgba(59, 130, 246, 0.2)',
        stroke: '#3b82f6',
        strokeWidth: 1.5,
        visible: true,
      } as TraceElementSpec,
    });

    // Badge slide-in
    ops.push({
      type: 'setTrack',
      elementId: 'metric-badge-bg',
      property: 'x',
      keyframes: [
        { timeMs: 0, value: 1920 + 100, easing: 'power3.out' },
        { timeMs: enterDurationMs + 150, value: badgeX, easing: 'power3.out' },
        { timeMs: durationMs - exitDurationMs, value: badgeX, easing: 'power3.out' },
        { timeMs: durationMs, value: 1920 + 100, easing: 'power3.in' },
      ],
    });

    // Badge opacity
    ops.push({
      type: 'setTrack',
      elementId: 'metric-badge-bg',
      property: 'opacity',
      keyframes: [
        { timeMs: 0, value: 0, easing: 'linear' },
        { timeMs: enterDurationMs + 150, value: 1, easing: 'linear' },
        { timeMs: durationMs - exitDurationMs, value: 1, easing: 'linear' },
        { timeMs: durationMs, value: 0, easing: 'linear' },
      ],
    });

    // Badge text
    ops.push({
      type: 'addElement',
      element: {
        type: 'text',
        id: 'metric-text',
        name: 'Metric',
        text: metric,
        x: badgeX + badgeWidth / 2,
        y: badgeY + badgeHeight / 2 - 5,
        fontSize: 24,
        fontWeight: 700,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fill: '#3b82f6',
        textAnchor: 'middle',
        visible: true,
      } as TraceElementSpec,
    });

    // Metric text slide-in
    ops.push({
      type: 'setTrack',
      elementId: 'metric-text',
      property: 'x',
      keyframes: [
        { timeMs: 0, value: 1920 + 100 + badgeWidth / 2, easing: 'power3.out' },
        { timeMs: enterDurationMs + 150, value: badgeX + badgeWidth / 2, easing: 'power3.out' },
        { timeMs: durationMs - exitDurationMs, value: badgeX + badgeWidth / 2, easing: 'power3.out' },
        { timeMs: durationMs, value: 1920 + 100 + badgeWidth / 2, easing: 'power3.in' },
      ],
    });

    // Metric text fade
    ops.push({
      type: 'setTrack',
      elementId: 'metric-text',
      property: 'opacity',
      keyframes: [
        { timeMs: 0, value: 0, easing: 'linear' },
        { timeMs: enterDurationMs + 150, value: 1, easing: 'linear' },
        { timeMs: durationMs - exitDurationMs, value: 1, easing: 'linear' },
        { timeMs: durationMs, value: 0, easing: 'linear' },
      ],
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Apply all ops and return project
  // ──────────────────────────────────────────────────────────────────────────

  const result = applyOps(blank, ops);
  return result.project;
}

/**
 * Example usage:
 *
 * const project = instantiateLowerThirdTemplate({
 *   title: 'Task Running',
 *   subtitle: 'Installing dependencies...',
 *   metric: '3/12',
 *   durationMs: 4000,
 *   enterDurationMs: 400,
 *   exitDurationMs: 300,
 * });
 *
 * // Export as GSAP or SVG
 */

