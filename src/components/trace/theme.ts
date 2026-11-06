/**
 * components/trace/theme.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared visual tokens for Nova Trace. The workspace is intentionally dark-only,
 * like the stage: SVG motion work needs a neutral, non-competitive surround.
 */

import type { CSSProperties } from 'react';

export const TRACE_ACCENT = '#38bdf8';
export const TRACE_ACCENT_SOFT = 'rgba(56, 189, 248, 0.14)';

export const traceStageTheme: CSSProperties = {
  background:
    'radial-gradient(circle at 50% 35%, rgba(56,189,248,0.10), transparent 62%), radial-gradient(circle at 80% 90%, rgba(129,140,248,0.08), transparent 55%), #070b14',
};

export const tracePanelClass =
  'border-white/8 bg-[#0a1120]/85 backdrop-blur-sm';

export const traceGridStyle: CSSProperties = {
  backgroundImage:
    'linear-gradient(rgba(148,163,184,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.08) 1px, transparent 1px)',
  backgroundSize: '24px 24px',
};
