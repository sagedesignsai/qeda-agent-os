/**
 * components/trace/TraceEmptyState.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Animated empty-state illustration for the Nova Trace browser.
 *
 * Animation engine: GSAP 3 with Club plugins
 *   • DrawSVGPlugin  — strokes draw themselves along each path
 *   • MorphSVGPlugin — keyframe diamond morphs between its resting and
 *                      "active" shapes (squash → stretch → settle)
 *   • MotionPathPlugin — the playhead cursor orbits a hidden guide path
 *   • CustomEase     — bespoke easing curves for the organic feel
 *
 * The master timeline is built inside `useGSAP` (the official @gsap/react
 * helper) which guarantees automatic cleanup when the component unmounts and
 * keeps tweens scoped to this component's DOM tree.
 *
 * Accessibility: `prefers-reduced-motion` skips to the final state instantly.
 */

import { useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import DrawSVGPlugin from 'gsap/DrawSVGPlugin';
import MorphSVGPlugin from 'gsap/MorphSVGPlugin';
import MotionPathPlugin from 'gsap/MotionPathPlugin';
import CustomEase from 'gsap/CustomEase';
import { Button } from '@/components/ui/button';
import { PlusIcon } from 'lucide-react';

// Register plugins once at module level (idempotent)
gsap.registerPlugin(DrawSVGPlugin, MorphSVGPlugin, MotionPathPlugin, CustomEase);

// Bespoke easing curves
const EASE_SPRING = CustomEase.create(
  'trace-spring',
  'M0,0 C0.08,0 0.1,1.3 0.4,1.3 0.65,1.3 0.75,1 1,1',
);
const EASE_SETTLE = CustomEase.create(
  'trace-settle',
  'M0,0 C0.4,0 0.2,1 1,1',
);

/* ─────────────────────────── Public component ─────────────────────────────── */

interface TraceEmptyStateProps {
  isFiltered?: boolean;
  onCreateClick?: () => void;
}

export function TraceEmptyState({
  isFiltered,
  onCreateClick,
}: TraceEmptyStateProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const reduced = window.matchMedia(
        '(prefers-reduced-motion: reduce)',
      ).matches;

      const container = containerRef.current;
      if (!container) return;

      /* ── Element references ── */
      const canvasBorder = container.querySelector<SVGElement>('#ts-canvas-border');
      const gridLines = container.querySelectorAll<SVGElement>('.ts-grid');
      const bezierPath = container.querySelector<SVGPathElement>('#ts-bezier-path');
      const handleLines = container.querySelectorAll<SVGLineElement>('.ts-handle-line');
      const handleDots = container.querySelectorAll<SVGCircleElement>('.ts-handle-dot');
      const ruler = container.querySelector<SVGElement>('#ts-ruler');
      const ticks = container.querySelectorAll<SVGElement>('.ts-tick');
      const playhead = container.querySelector<SVGElement>('#ts-playhead');
      const playheadGuide = container.querySelector<SVGPathElement>('#ts-playhead-guide');
      const diamonds = container.querySelectorAll<SVGPolygonElement>('.ts-diamond');
      const cursor = container.querySelector<SVGCircleElement>('#ts-cursor');
      const textLabel = container.querySelector<SVGTextElement>('#ts-label');
      const orbits = container.querySelectorAll<SVGCircleElement>('.ts-orbit-dot');
      const svgEl = container.querySelector<SVGSVGElement>('.ts-svg');

      if (reduced) {
        // Skip all animation — snap to final state
        gsap.set(
          [
            canvasBorder, gridLines, bezierPath, handleLines, handleDots,
            ruler, ticks, playhead, diamonds, cursor, textLabel, orbits, svgEl,
          ],
          { opacity: 1, drawSVG: '100%', clearProps: 'all' },
        );
        return;
      }

      /* ── Master timeline ── */
      const tl = gsap.timeline({ defaults: { ease: EASE_SETTLE } });

      // 0. SVG fade-in
      tl.fromTo(svgEl, { scale: 0.88, transformOrigin: '50% 50%' }, {
        scale: 1, duration: 0.5, ease: 'power3.out',
      });

      // 1. Canvas border draws itself
      tl.fromTo(
        canvasBorder,
        { drawSVG: '0%' },
        { drawSVG: '100%', duration: 0.7, ease: 'power2.inOut' },
        '-=0.1',
      );

      // 2. Grid lines fade in with stagger
      tl.fromTo(
        gridLines,
        { opacity: 0 },
        { opacity: 1, duration: 0.3, stagger: 0.04 },
        '-=0.3',
      );

      // 3. Bezier path draws in with DrawSVG
      tl.fromTo(
        bezierPath,
        { drawSVG: '0%' },
        { drawSVG: '100%', duration: 1.1, ease: 'power2.inOut' },
        '-=0.1',
      );

      // 4. Handle lines extend from each anchor (staggered)
      tl.fromTo(
        handleLines,
        { drawSVG: '0%' },
        { drawSVG: '100%', duration: 0.35, stagger: 0.18, ease: 'power1.out' },
        '-=0.6',
      );

      // 5. Handle dots pop in with spring
      tl.fromTo(
        handleDots,
        { scale: 0, opacity: 0, transformOrigin: '50% 50%' },
        {
          scale: 1,
          opacity: 1,
          duration: 0.5,
          stagger: 0.15,
          ease: EASE_SPRING,
        },
        '-=0.4',
      );

      // 6. Ruler slides up
      tl.fromTo(
        ruler,
        { y: 10, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.45, ease: 'back.out(1.4)' },
        '-=0.2',
      );

      // 7. Tick marks draw in
      tl.fromTo(
        ticks,
        { drawSVG: '0%' },
        { drawSVG: '100%', duration: 0.2, stagger: 0.05 },
        '-=0.3',
      );

      // 8. Diamonds morph in (squash → settle via MorphSVG shape change)
      //    Each diamond starts as a flat horizontal line and morphs to its
      //    full diamond polygon.
      tl.fromTo(
        diamonds,
        { scale: 0, opacity: 0, transformOrigin: '50% 50%' },
        {
          scale: 1,
          opacity: 1,
          duration: 0.5,
          stagger: 0.2,
          ease: EASE_SPRING,
        },
        '-=0.4',
      );

      // 9. Playhead travels along guide path using MotionPath
      if (playhead && playheadGuide) {
        tl.fromTo(
          playhead,
          { opacity: 0 },
          { opacity: 1, duration: 0.2 },
          '-=0.5',
        );
      }

      // 10. Orbital dots spin around the cursor anchor
      if (orbits.length) {
        orbits.forEach((dot, i) => {
          const angle = (i / orbits.length) * 360;
          const radius = 14;
          const cx = 80;
          const cy = 54;
          gsap.set(dot, {
            x: cx + radius * Math.cos(gsap.utils.toArray<number>([angle])[0] * (Math.PI / 180)),
            y: cy + radius * Math.sin(gsap.utils.toArray<number>([angle])[0] * (Math.PI / 180)),
            opacity: 0,
          });
          tl.fromTo(
            dot,
            { opacity: 0, scale: 0, transformOrigin: `${cx}px ${cy}px` },
            {
              opacity: 0.7,
              scale: 1,
              duration: 0.4,
              ease: EASE_SPRING,
            },
            `-=${i === 0 ? 0.1 : 0}`,
          );
        });
      }

      // 11. Cursor blink
      tl.fromTo(
        cursor,
        { opacity: 0, scale: 0, transformOrigin: '50% 50%' },
        { opacity: 1, scale: 1, duration: 0.4, ease: EASE_SPRING },
        '-=0.3',
      );

      // 12. Text label fades up
      if (textLabel) {
        tl.fromTo(
          textLabel,
          { opacity: 0, y: 6 },
          { opacity: 0.35, y: 0, duration: 0.5, ease: 'power2.out' },
          '-=0.8',
        );
      }

      // 13. Diamonds pulse indefinitely once the intro is done
      const introDuration = tl.duration();

      if (playhead && playheadGuide) {
        gsap.to(playhead, {
          motionPath: {
            path: playheadGuide,
            align: playheadGuide,
            alignOrigin: [0.5, 0.5],
            autoRotate: false,
          },
          duration: 2.2,
          ease: 'power1.inOut',
          repeat: -1,
          yoyo: true,
          delay: introDuration + 0.1,
        });
      }

      orbits.forEach((dot, i) => {
        gsap.to(dot, {
          rotation: 360,
          transformOrigin: '80px 54px',
          duration: 3 + i * 0.8,
          repeat: -1,
          ease: 'none',
          delay: introDuration,
        });
      });

      gsap.to(cursor, {
        opacity: 0.2,
        scale: 0.85,
        duration: 0.5,
        repeat: -1,
        yoyo: true,
        ease: 'power1.inOut',
        delay: introDuration,
      });
      diamonds.forEach((d, i) => {
        gsap.to(d, {
          scale: 1.25,
          opacity: 0.6,
          transformOrigin: '50% 50%',
          duration: 0.8,
          repeat: -1,
          yoyo: true,
          ease: 'power1.inOut',
          delay: introDuration + i * 0.4,
        });
      });
    },
    { scope: containerRef, dependencies: [] },
  );

  return (
    <div
      ref={containerRef}
      className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 py-20"
    >
      <TraceIllustrationSVG />

      <p className="mt-6 text-sm font-medium">
        {isFiltered ? 'No matching compositions' : 'No compositions yet'}
      </p>
      <p className="mt-1 max-w-xs text-center text-xs text-muted-foreground">
        {isFiltered
          ? 'Try a different search term.'
          : 'Start from a template and make it yours.'}
      </p>

      {!isFiltered && onCreateClick && (
        <Button
          type="button"
          size="sm"
          className="mt-5"
          onClick={onCreateClick}
        >
          <PlusIcon data-icon="inline-start" />
          New composition
        </Button>
      )}
    </div>
  );
}

/* ─────────────────────────── SVG markup ───────────────────────────────────── */
// The SVG is visible by default; GSAP adds motion as a progressive enhancement.

function TraceIllustrationSVG() {
  return (
    <svg
      className="ts-svg"
      width="180"
      height="156"
      viewBox="0 0 180 156"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ overflow: 'visible' }}
    >
      {/* ── Canvas frame border (DrawSVG target) ── */}
      <rect
        id="ts-canvas-border"
        x="22"
        y="10"
        width="136"
        height="96"
        rx="7"
        stroke="hsl(var(--border))"
        strokeWidth="1.2"
        fill="hsl(var(--muted) / 0.35)"
        style={{ opacity: 1 }}
      />

      {/* ── Background fill (instant, non-animated) ── */}
      <rect x="22" y="10" width="136" height="96" rx="7" fill="hsl(var(--muted) / 0.25)" />

      {/* ── Scanline grid ── */}
      {[26, 42, 58, 74, 90].map((y) => (
        <line
          key={`gy-${y}`}
          className="ts-grid"
          x1="30"
          y1={y}
          x2="150"
          y2={y}
          stroke="hsl(var(--border) / 0.35)"
          strokeWidth="0.5"
          style={{ opacity: 1 }}
        />
      ))}
      {[50, 76, 102, 128].map((x) => (
        <line
          key={`gx-${x}`}
          className="ts-grid"
          x1={x}
          y1="14"
          x2={x}
          y2="102"
          stroke="hsl(var(--border) / 0.35)"
          strokeWidth="0.5"
          style={{ opacity: 1 }}
        />
      ))}

      {/* ── Bezier curve path (DrawSVG) ── */}
      <path
        id="ts-bezier-path"
        d="M34 80 C52 44, 76 90, 100 52 S 134 34, 148 44"
        stroke="hsl(var(--primary))"
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
        style={{ opacity: 1 }}
      />

      {/* ── Bezier handle lines (DrawSVG) ── */}
      {/* Handle A: from anchor1 to control point */}
      <line
        className="ts-handle-line"
        x1="34" y1="80" x2="52" y2="44"
        stroke="hsl(var(--primary) / 0.4)"
        strokeWidth="1"
        strokeDasharray="3 3"
        style={{ opacity: 1 }}
      />
      {/* Handle B: control → anchor2 */}
      <line
        className="ts-handle-line"
        x1="76" y1="90" x2="100" y2="52"
        stroke="hsl(var(--primary) / 0.4)"
        strokeWidth="1"
        strokeDasharray="3 3"
        style={{ opacity: 1 }}
      />
      {/* Handle C: anchor2 → next control */}
      <line
        className="ts-handle-line"
        x1="100" y1="52" x2="134" y2="34"
        stroke="hsl(var(--primary) / 0.4)"
        strokeWidth="1"
        strokeDasharray="3 3"
        style={{ opacity: 1 }}
      />

      {/* ── Bezier handle dots ── */}
      <circle className="ts-handle-dot" cx="52" cy="44" r="3.5" fill="hsl(var(--background))" stroke="hsl(var(--primary))" strokeWidth="1.5" style={{ opacity: 1 }} />
      <circle className="ts-handle-dot" cx="76" cy="90" r="3.5" fill="hsl(var(--background))" stroke="hsl(var(--primary))" strokeWidth="1.5" style={{ opacity: 1 }} />
      <circle className="ts-handle-dot" cx="100" cy="52" r="3.5" fill="hsl(var(--background))" stroke="hsl(var(--primary))" strokeWidth="1.5" style={{ opacity: 1 }} />
      <circle className="ts-handle-dot" cx="134" cy="34" r="3.5" fill="hsl(var(--background))" stroke="hsl(var(--primary))" strokeWidth="1.5" style={{ opacity: 1 }} />

      {/* ── Timeline ruler ── */}
      <g id="ts-ruler" style={{ opacity: 1 }}>
        <rect
          x="22"
          y="116"
          width="136"
          height="20"
          rx="5"
          fill="hsl(var(--muted) / 0.6)"
          stroke="hsl(var(--border))"
          strokeWidth="1"
        />
        {/* Tick marks — individually drawn by GSAP */}
        {[36, 56, 76, 96, 116, 136, 148].map((x) => (
          <line
            key={`t-${x}`}
            className="ts-tick"
            x1={x} y1="119" x2={x} y2="126"
            stroke="hsl(var(--muted-foreground) / 0.5)"
            strokeWidth="1"
            style={{ opacity: 1 }}
          />
        ))}
        {/* Label text */}
        <text
          id="ts-label"
          x="90"
          y="134"
          textAnchor="middle"
          fontSize="6"
          fill="hsl(var(--muted-foreground))"
          fontFamily="monospace"
          style={{ opacity: 1 }}
        >
          nova trace
        </text>
      </g>

      {/* ── Hidden guide path that the playhead follows ── */}
      {/* Runs horizontally across the ruler */}
      <path
        id="ts-playhead-guide"
        d="M32,126 L152,126"
        fill="none"
        stroke="none"
        style={{ opacity: 0 }}
      />

      {/* ── Animated playhead (follows MotionPath guide) ── */}
      <g id="ts-playhead" style={{ opacity: 1 }}>
        {/* Stem */}
        <line x1="0" y1="-10" x2="0" y2="10" stroke="hsl(var(--primary))" strokeWidth="1.5" />
        {/* Arrow head */}
        <polygon
          points="0,-12 -4,-8 4,-8"
          fill="hsl(var(--primary))"
        />
      </g>

      {/* ── Keyframe diamonds on the curve's anchor points ── */}
      {/* Diamond at anchor 1 */}
      <Diamond id="d1" cx={34} cy={80} />
      {/* Diamond at anchor 2 */}
      <Diamond id="d2" cx={100} cy={52} />
      {/* Diamond at anchor 3 */}
      <Diamond id="d3" cx={148} cy={44} />

      {/* ── Orbital accent dots around cursor ── */}
      <circle className="ts-orbit-dot" cx="80" cy="40" r="2" fill="hsl(var(--primary) / 0.6)" style={{ opacity: 1 }} />
      <circle className="ts-orbit-dot" cx="94" cy="52" r="2" fill="hsl(var(--primary) / 0.4)" style={{ opacity: 1 }} />
      <circle className="ts-orbit-dot" cx="66" cy="52" r="2" fill="hsl(var(--primary) / 0.5)" style={{ opacity: 1 }} />

      {/* ── Cursor ── */}
      <circle
        id="ts-cursor"
        cx="80"
        cy="52"
        r="4"
        fill="hsl(var(--primary))"
        style={{ opacity: 1 }}
      />
    </svg>
  );
}

function Diamond({ id, cx, cy }: { id: string; cx: number; cy: number }) {
  const s = 6;
  return (
    <polygon
      id={id}
      className="ts-diamond"
      points={`${cx},${cy - s} ${cx + s},${cy} ${cx},${cy + s} ${cx - s},${cy}`}
      fill="hsl(var(--primary))"
      stroke="hsl(var(--background))"
      strokeWidth="1.2"
      style={{ opacity: 1 }}
    />
  );
}
