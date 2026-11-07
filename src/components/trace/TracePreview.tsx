/**
 * components/trace/TracePreview.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Renders an SVG thumbnail for a Trace project or template.
 *
 * Accepts a raw SVG string and renders it inside a fixed-size container with
 * proper scaling. Falls back to a subtle artboard placeholder when no SVG is
 * provided — a faint grid that hints at the vector canvas without looking like
 * a generic icon.
 */

import { memo } from 'react';

interface TracePreviewProps {
  /** Raw SVG markup string. */
  svg?: string | null;
  /** Container width in CSS pixels or CSS string (e.g., "100%"). */
  width?: number | string;
  /** Container height in CSS pixels or CSS string. */
  height?: number | string;
  /** Optional accent color for the fallback placeholder. */
  accentColor?: string;
}

function TracePreviewImpl({
  svg,
  width = 300,
  height = 169,
  accentColor,
}: TracePreviewProps) {
  if (svg) {
    return (
      <div
        style={{ width, height }}
        className="overflow-hidden"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    );
  }

  // Fallback: subtle artboard grid that hints at the vector canvas
  const accent = accentColor ?? '#22d3ee';
  return (
    <div
      style={{ width, height }}
      className="overflow-hidden"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid slice"
        className="h-full w-full"
      >
        <defs>
          <pattern
            id={`grid-${accent.replace('#', '')}`}
            width="24"
            height="24"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 24 0 L 0 0 0 24"
              fill="none"
              stroke="rgba(255,255,255,0.03)"
              strokeWidth="0.5"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="#0b1220" />
        <rect width="100%" height="100%" fill={`url(#grid-${accent.replace('#', '')})`} />
        {/* Center crosshair — subtle, like a canvas origin marker */}
        <line
          x1="50%"
          y1="45%"
          x2="50%"
          y2="55%"
          stroke={accent}
          strokeWidth="0.5"
          opacity="0.3"
        />
        <line
          x1="45%"
          y1="50%"
          x2="55%"
          y2="50%"
          stroke={accent}
          strokeWidth="0.5"
          opacity="0.3"
        />
        <circle
          cx="50%"
          cy="50%"
          r="2"
          fill={accent}
          opacity="0.25"
        />
      </svg>
    </div>
  );
}

export const TracePreview = memo(TracePreviewImpl);
