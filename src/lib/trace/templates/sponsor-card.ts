/**
 * lib/trace/templates/sponsor-card.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Logo Stinger / Sponsor Card template for Qeda.
 *
 * Features:
 *  - Dark slate background with ambient glow accents
 *  - Centered logo with scale-up reveal (90% → 100%, 0.5s)
 *  - Two-column feature list with staggered bullet fade-in
 *  - Production-ready SVG composition
 *
 * Instantiate with: `instantiateSponsorCardTemplate(features)`
 */

import type { TraceOp, TraceElementSpec } from '../ops/types';
import type { TraceDocument } from '../types';
import { createBlankTraceDocument } from '../document';
import { applyOps } from '../ops';

export interface SponsorCardFeature {
  title: string;
  subtitle?: string;
}

/**
 * Qeda logo SVG as a Base64 data URI (optimized for 300×300px display).
 * Embedded as inline path for maximum portability.
 */
const QEDA_LOGO_PATH = `
  m 99.333958,165.81275 c -9.570989,-0.70831 -18.077945,-5.25085 -24.258468,-12.95353 -2.929114,-3.6505 -5.28556,-8.39527 -6.412457,-12.91166 -1.202843,-4.82077 -1.340603,-9.56439 -0.424147,-14.605 1.556562,-8.56128 6.647752,-16.5092 13.841355,-21.60792 2.778149,-1.96911 5.363706,-3.28857 8.585918,-4.38156 3.545596,-1.202686 6.358767,-1.685167 10.244671,-1.757039 4.12374,-0.07627 7.48586,0.423288 11.13366,1.654289 5.07306,1.71197 9.49381,4.4878 13.25948,8.32574 1.75046,1.78407 3.22159,3.63609 4.56253,5.74382 0.83688,1.31543 2.32445,4.25231 2.89473,5.715 0.99204,2.54445 1.70935,5.44064 2.10746,8.509 0.18377,1.41633 0.25799,5.45307 0.1278,6.95072 -0.49673,5.71432 -2.28132,10.97771 -5.37278,15.84619 -0.37715,0.59396 -0.71355,1.07021 -0.74755,1.05834 -0.034,-0.0119 -0.96892,-1.37413 -2.0776,-3.02725 -1.10868,-1.65312 -2.36984,-3.52607 -2.80259,-4.16211 l -0.7868,-1.15644 0.17631,-0.3456 c 0.27644,-0.54187 0.93079,-2.16846 1.24662,-3.09885 1.53883,-4.53325 1.69241,-9.47987 0.44833,-14.44008 -0.79316,-3.16236 -2.44389,-6.45821 -4.59001,-9.16439 -0.83202,-1.04915 -2.88986,-3.12316 -3.87393,-3.90437 -2.63005,-2.08789 -6.03214,-3.7919 -9.1422,-4.57906 -2.07521,-0.52524 -3.79748,-0.7299 -6.14302,-0.72997 -3.765604,-1.3e-4 -7.214629,0.80579 -10.580444,2.47229 -4.055181,2.00781 -7.276653,4.86558 -9.822188,8.71325 -1.573431,2.3783 -2.611922,4.78146 -3.338345,7.72522 -0.41196,1.66944 -0.564547,2.69403 -0.689538,4.63013 -0.18643,2.88778 0.310965,6.45909 1.280259,9.19231 1.369517,3.86178 3.263303,6.87916 6.086782,9.69812 2.549674,2.54559 5.082564,4.21232 8.345697,5.49177 1.946518,0.76322 3.960743,1.30425 5.55636,1.49248 l 0.47636,0.0562 1.346303,1.28272 c 6.827894,6.50543 8.072644,7.70126 8.072644,7.75542 0,0.0636 -1.35513,0.27275 -2.794,0.43127 -1.09488,0.12062 -4.72948,0.16994 -5.937202,0.0806 z
  m 38.486262,22.92397 c -2.40095,-2.19311 -17.2883,-16.15904 -21.50006,-20.16938 -0.93133,-0.88679 -3.71263,-3.51629 -6.18067,-5.84334 -5.37724,-5.07007 -6.4084,-6.06691 -6.34323,-6.13217 0.0272,-0.0273 2.27171,-0.0687 4.9877,-0.0919 l 4.93816,-0.0423 -1.39455,-1.905 c -0.76701,-1.04775 -2.28139,-3.10514 -3.36529,-4.57199 -1.0839,-1.46685 -2.70807,-3.67665 -3.60927,-4.91067 -0.9012,-1.23402 -1.97791,-2.69776 -2.39269,-3.25277 -0.8865,-1.18619 -2.28304,-3.09396 -2.37572,-3.2454 -0.0516,-0.0844 1.53287,-0.10583 7.81391,-0.10583 h 7.87869 l 3.80141,5.69383 c 3.70041,5.54253 8.37426,12.47183 11.78647,17.47424 0.92555,1.35689 1.70638,2.52846 1.73518,2.6035 0.0478,0.12452 -0.38731,0.13643 -4.98379,0.13643 h -5.03614 l 0.7629,1.29116 c 0.41959,0.71015 1.13412,1.90077 1.58784,2.64584 2.52419,4.14509 11.09935,18.42867 12.02122,20.02366 0.20186,0.34925 0.42221,0.72073 0.48968,0.8255 0.0675,0.10478 0.10637,0.1905 0.0865,0.1905 -0.0199,0 -0.3386,-0.27622 -0.70821,-0.61383 z
`;

/**
 * Instantiate a sponsor card composition with a feature list.
 *
 * @param features Array of { title, subtitle? } for the two-column list
 * @returns Complete TraceStage ready for export or publishing
 */
export function instantiateSponsorCardTemplate(
  features: SponsorCardFeature[] = [],
): TraceDocument {
  const blank = createBlankTraceDocument('Qeda Sponsor Card', {
    width: 1920,
    height: 1080,
    durationMs: 3500, // 3.5s total
  });

  const ops: TraceOp[] = [];

  // ──────────────────────────────────────────────────────────────────────────
  // 1. Background layer (dark slate with glow accents)
  // ──────────────────────────────────────────────────────────────────────────

  ops.push({
    type: 'addElement',
    element: {
      type: 'rect',
      id: 'bg-base',
      name: 'Background',
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
      fill: '#0f172a', // Dark slate (slate-950)
      visible: true,
      locked: true,
    } as TraceElementSpec,
  });

  // Left glow accent (radial gradient edge light)
  ops.push({
    type: 'addElement',
    element: {
      type: 'circle',
      id: 'glow-left',
      name: 'Glow Left',
      x: -200,
      y: 540,
      radius: 600,
      fill: 'rgba(59, 130, 246, 0.1)', // Blue glow, very transparent
      visible: true,
    } as TraceElementSpec,
  });

  // Right glow accent
  ops.push({
    type: 'addElement',
    element: {
      type: 'circle',
      id: 'glow-right',
      name: 'Glow Right',
      x: 2120,
      y: 540,
      radius: 600,
      fill: 'rgba(139, 92, 246, 0.08)', // Purple glow, very transparent
      visible: true,
    } as TraceElementSpec,
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Logo (centered, scale-up animation)
  // ──────────────────────────────────────────────────────────────────────────

  ops.push({
    type: 'addElement',
    element: {
      type: 'path',
      id: 'logo-mark',
      name: 'Qeda Logo',
      d: QEDA_LOGO_PATH,
      x: 960,
      y: 340,
      fill: '#ffffff',
      visible: true,
    } as TraceElementSpec,
  });

  // Logo scale-up animation (0.9 → 1.0, 0-500ms)
  ops.push({
    type: 'setTrack',
    elementId: 'logo-mark',
    property: 'scaleX',
    label: 'Logo Reveal Scale X',
    keyframes: [
      { timeMs: 0, value: 0.9, easing: 'power2.out' },
      { timeMs: 500, value: 1.0, easing: 'power2.out' },
    ],
  });

  ops.push({
    type: 'setTrack',
    elementId: 'logo-mark',
    property: 'scaleY',
    label: 'Logo Reveal Scale Y',
    keyframes: [
      { timeMs: 0, value: 0.9, easing: 'power2.out' },
      { timeMs: 500, value: 1.0, easing: 'power2.out' },
    ],
  });

  // Logo fade-in (0 → 1, 0-500ms)
  ops.push({
    type: 'setTrack',
    elementId: 'logo-mark',
    property: 'opacity',
    label: 'Logo Fade In',
    keyframes: [
      { timeMs: 0, value: 0, easing: 'linear' },
      { timeMs: 500, value: 1, easing: 'linear' },
    ],
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. Feature list (two columns, below logo)
  // ──────────────────────────────────────────────────────────────────────────

  const featuresToShow = features.slice(0, 6); // Max 6 features (3 per column)
  const featuresPerColumn = Math.ceil(featuresToShow.length / 2);

  // Calculate positions
  const listStartY = 700;
  const columnSpacing = 500;
  const rowSpacing = 70;
  const bulletRadius = 4;
  const bulletOffsetX = 30;
  const textOffsetX = 60;

  featuresToShow.forEach((feature, index) => {
    const column = index < featuresPerColumn ? 0 : 1;
    const rowInColumn = index % featuresPerColumn;
    const posX = 550 + column * columnSpacing;
    const posY = listStartY + rowInColumn * rowSpacing;
    const staggerDelay = 500 + (index * 200); // Start after logo reveal, stagger 0.2s each

    // Bullet point (small circle)
    const bulletId = `bullet-${index}`;
    ops.push({
      type: 'addElement',
      element: {
        type: 'circle',
        id: bulletId,
        name: `Bullet ${index + 1}`,
        x: posX + bulletOffsetX,
        y: posY,
        radius: bulletRadius,
        fill: '#3b82f6', // Blue accent
        visible: true,
      } as TraceElementSpec,
    });

    // Bullet fade-in
    ops.push({
      type: 'setTrack',
      elementId: bulletId,
      property: 'opacity',
      keyframes: [
        { timeMs: staggerDelay, value: 0, easing: 'linear' },
        { timeMs: staggerDelay + 200, value: 1, easing: 'linear' },
      ],
    });

    // Feature title text
    const titleId = `title-${index}`;
    ops.push({
      type: 'addElement',
      element: {
        type: 'text',
        id: titleId,
        name: `Feature ${index + 1}`,
        text: feature.title,
        x: posX + textOffsetX,
        y: posY - 8,
        fontSize: 18,
        fontWeight: 600,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fill: '#f1f5f9', // Slate-100
        textAnchor: 'start',
        visible: true,
      } as TraceElementSpec,
    });

    // Title fade-in
    ops.push({
      type: 'setTrack',
      elementId: titleId,
      property: 'opacity',
      keyframes: [
        { timeMs: staggerDelay, value: 0, easing: 'linear' },
        { timeMs: staggerDelay + 200, value: 1, easing: 'linear' },
      ],
    });

    // Feature subtitle (if provided)
    if (feature.subtitle) {
      const subtitleId = `subtitle-${index}`;
      ops.push({
        type: 'addElement',
        element: {
          type: 'text',
          id: subtitleId,
          name: `Subtitle ${index + 1}`,
          text: feature.subtitle,
          x: posX + textOffsetX,
          y: posY + 16,
          fontSize: 13,
          fontWeight: 400,
          fontFamily: 'system-ui, -apple-system, sans-serif',
          fill: '#94a3b8', // Slate-400
          textAnchor: 'start',
          visible: true,
        } as TraceElementSpec,
      });

      // Subtitle fade-in (same timing as bullet/title)
      ops.push({
        type: 'setTrack',
        elementId: subtitleId,
        property: 'opacity',
        keyframes: [
          { timeMs: staggerDelay, value: 0, easing: 'linear' },
          { timeMs: staggerDelay + 200, value: 1, easing: 'linear' },
        ],
      });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Apply all ops and return project
  // ──────────────────────────────────────────────────────────────────────────

  const result = applyOps(blank, ops);
  return result.project;
}

/**
 * Example usage:
 *
 * const features: SponsorCardFeature[] = [
 *   { title: 'Local Agent OS', subtitle: 'Full machine access from desktop' },
 *   { title: 'One-shot Planning', subtitle: 'Goal → steps → approval → run' },
 *   { title: 'Real Completion', subtitle: 'Track every command & result' },
 *   { title: 'Workspace Notebooks', subtitle: 'Local knowledge + RAG' },
 *   { title: 'Terminal Integration', subtitle: 'Shell mode & agent autopilot' },
 *   { title: 'Task Copilot', subtitle: 'AI-assisted focus sessions' },
 * ];
 *
 * const project = instantiateSponsorCardTemplate(features);
 * // → Ready to export as GSAP code or animated SVG
 */

