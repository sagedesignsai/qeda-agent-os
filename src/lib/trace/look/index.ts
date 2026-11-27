/**
 * lib/trace/look/index.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The Trace look system: named palettes, type pairings and motion tokens.
 *
 * A look is authoring intent, not a stylesheet. New blocks take palette and
 * font defaults from it, the copilot reads it before choosing colours, and lint
 * checks motion taste against it. Existing layers are restyled only when the
 * caller explicitly asks (`applyLookToElements`), which keeps applying a look
 * reversible and predictable.
 *
 * Pure and DOM-free.
 */

import type {
  EasingType,
  TraceProject,
  TraceStyle,
} from '../types';
import type { TraceAssetFragment } from '../assets/types';
import type { TraceOp } from '../ops/types';

export interface TraceLookPalette {
  background: string;
  surface: string;
  text: string;
  muted: string;
  accent: string;
  accentAlt: string;
}

export interface TraceLookFonts {
  heading: string;
  body: string;
}

export interface TraceLookMotion {
  easing: EasingType;
  durationMs: number;
  staggerMs: number;
}

export interface TraceLook {
  id: string;
  label: string;
  description: string;
  palette: TraceLookPalette;
  fonts: TraceLookFonts;
  motion: TraceLookMotion;
}

const INTER = 'Inter, system-ui, sans-serif';
const SERIF = 'Georgia, "Times New Roman", serif';

export const DEFAULT_STYLE_PALETTE: TraceLookPalette = {
  background: '#0b1120',
  surface: '#111c33',
  text: '#f8fafc',
  muted: '#94a3b8',
  accent: '#38bdf8',
  accentAlt: '#818cf8',
};

export const DEFAULT_STYLE_FONTS: TraceLookFonts = {
  heading: INTER,
  body: INTER,
};

export const DEFAULT_STYLE_MOTION: TraceLookMotion = {
  easing: 'power3.out',
  durationMs: 600,
  staggerMs: 90,
};

export const TRACE_LOOKS: readonly TraceLook[] = [
  {
    id: 'nova-dark',
    label: 'Nova dark',
    description:
      'The house look: deep slate, cool edge light, sky accent. Safe for explainers and product films.',
    palette: DEFAULT_STYLE_PALETTE,
    fonts: DEFAULT_STYLE_FONTS,
    motion: DEFAULT_STYLE_MOTION,
  },
  {
    id: 'clean-tech',
    label: 'Clean tech',
    description:
      'Light, bright and product-led: white surfaces, ink text, confident blue accent.',
    palette: {
      background: '#f6f8fb',
      surface: '#ffffff',
      text: '#0f172a',
      muted: '#64748b',
      accent: '#2563eb',
      accentAlt: '#0ea5e9',
    },
    fonts: DEFAULT_STYLE_FONTS,
    motion: { easing: 'power2.out', durationMs: 500, staggerMs: 80 },
  },
  {
    id: 'editorial',
    label: 'Editorial',
    description:
      'Paper, serif headlines and a warm ink accent — quotes, essays and brand stories.',
    palette: {
      background: '#f7f4ee',
      surface: '#ffffff',
      text: '#1f2937',
      muted: '#6b7280',
      accent: '#b45309',
      accentAlt: '#0f766e',
    },
    fonts: { heading: SERIF, body: INTER },
    motion: { easing: 'power2.out', durationMs: 600, staggerMs: 90 },
  },
  {
    id: 'warm-film',
    label: 'Warm film',
    description:
      'Low-key amber, cream type and serif headings for cinematic, human stories.',
    palette: {
      background: '#14100c',
      surface: '#221a12',
      text: '#fdf6ec',
      muted: '#c7a98a',
      accent: '#f59e0b',
      accentAlt: '#fb7185',
    },
    fonts: { heading: SERIF, body: INTER },
    motion: { easing: 'power3.out', durationMs: 650, staggerMs: 100 },
  },
  {
    id: 'noir',
    label: 'Noir',
    description:
      'Near-black, high contrast and monochrome type. Best with restrained motion and one white accent.',
    palette: {
      background: '#0a0a0b',
      surface: '#141416',
      text: '#f5f5f5',
      muted: '#9ca3af',
      accent: '#ffffff',
      accentAlt: '#d4d4d8',
    },
    fonts: { heading: SERIF, body: INTER },
    motion: { easing: 'power2.inOut', durationMs: 700, staggerMs: 110 },
  },
  {
    id: 'neon',
    label: 'Neon',
    description:
      'Midnight blue with cyan and magenta; energetic, social-first motion.',
    palette: {
      background: '#070a18',
      surface: '#101533',
      text: '#f0f4ff',
      muted: '#8b93b8',
      accent: '#22d3ee',
      accentAlt: '#e879f9',
    },
    fonts: DEFAULT_STYLE_FONTS,
    motion: { easing: 'expo.out', durationMs: 550, staggerMs: 70 },
  },
];

const LOOK_BY_ID = new Map(TRACE_LOOKS.map((look) => [look.id, look]));

export function getLook(id: string | null | undefined): TraceLook | undefined {
  return id ? LOOK_BY_ID.get(id) : undefined;
}

export function listLooks(): readonly TraceLook[] {
  return TRACE_LOOKS;
}

/** Complete style for a preset id (or a look object). */
export function styleFromLook(look: TraceLook | string): TraceStyle {
  const resolved = typeof look === 'string' ? getLook(look) : look;
  if (!resolved) {
    return {
      palette: { ...DEFAULT_STYLE_PALETTE },
      fonts: { ...DEFAULT_STYLE_FONTS },
      motion: { ...DEFAULT_STYLE_MOTION },
    };
  }
  return {
    lookId: resolved.id,
    palette: { ...resolved.palette },
    fonts: { ...resolved.fonts },
    motion: { ...resolved.motion },
  };
}

export function stylePalette(style?: TraceStyle): TraceLookPalette {
  return { ...DEFAULT_STYLE_PALETTE, ...(style?.palette ?? {}) };
}

export function styleFonts(style?: TraceStyle): TraceLookFonts {
  return { ...DEFAULT_STYLE_FONTS, ...(style?.fonts ?? {}) };
}

export function styleMotion(style?: TraceStyle): TraceLookMotion {
  return { ...DEFAULT_STYLE_MOTION, ...(style?.motion ?? {}) };
}

/** Apply the look's type pairing to freshly built block text. */
export function applyStyleToFragment(
  fragment: TraceAssetFragment,
  style?: TraceStyle,
): TraceAssetFragment {
  if (!style) return fragment;
  const fonts = styleFonts(style);
  for (const element of Object.values(fragment.elements)) {
    if (element.type !== 'text') continue;
    const size = Number(element.attributes?.fontSize ?? 24);
    element.attributes.fontFamily = size >= 32 ? fonts.heading : fonts.body;
  }
  return fragment;
}

const PALETTE_ROLES: Array<keyof TraceLookPalette> = [
  'background',
  'surface',
  'text',
  'muted',
  'accent',
  'accentAlt',
];

/**
 * Common colours that should follow a role even when the project never carried
 * a style. Kept small and specific so a deliberate one-off colour survives.
 */
const ROLE_COLOR_CANDIDATES: Record<keyof TraceLookPalette, string[]> = {
  background: ['#0b1120', '#0f172a', '#070b14', '#020617', '#0a0a0b'],
  surface: ['#111c33', '#1e293b', '#141416', '#221a12'],
  text: ['#f8fafc', '#f5f5f5', '#fdf6ec', '#1f2937', '#0f172a', '#e2e8f0', '#ffffff'],
  muted: ['#94a3b8', '#64748b', '#475569', '#9ca3af', '#8b93b8', '#c7a98a', '#6b7280'],
  accent: [
    '#38bdf8',
    '#22d3ee',
    '#3b82f6',
    '#0ea5e9',
    '#2563eb',
    '#f59e0b',
    '#b45309',
    '#e879f9',
    '#f472b6',
  ],
  accentAlt: ['#818cf8', '#8b5cf6', '#fb7185', '#e879f9', '#0f766e', '#d4d4d8'],
};

function normalizeColor(value: string | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  if (/^#[0-9a-f]{3}$/.test(trimmed)) {
    return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`;
  }
  return trimmed;
}

function colorRoleMap(style?: TraceStyle): Map<string, keyof TraceLookPalette> {
  const map = new Map<string, keyof TraceLookPalette>();
  const palette = stylePalette(style);
  // The current style's own colours win, so a re-apply is idempotent.
  for (const role of PALETTE_ROLES) {
    const color = normalizeColor(palette[role]);
    if (color) map.set(color, role);
  }
  for (const role of PALETTE_ROLES) {
    for (const color of ROLE_COLOR_CANDIDATES[role]) {
      const normalized = normalizeColor(color);
      if (normalized && !map.has(normalized)) map.set(normalized, role);
    }
  }
  return map;
}

/**
 * Ops that restyle existing layers into the look. Only role-matched colours are
 * touched, gradients and explicit one-off colours are left alone, and a caller
 * opts in to resetting scene backgrounds.
 */
export function applyLookToElements(
  project: TraceProject,
  style: TraceStyle,
  options: { background?: boolean } = {},
): TraceOp[] {
  const palette = stylePalette(style);
  const fonts = styleFonts(style);
  const roleMap = colorRoleMap(project.style);
  const ops: TraceOp[] = [];

  for (const element of Object.values(project.elements)) {
    const patch: Record<string, unknown> = {};

    for (const key of ['fill', 'stroke'] as const) {
      const current = element.attributes?.[key];
      if (typeof current !== 'string' || current.startsWith('url(')) continue;
      const role = roleMap.get(normalizeColor(current) ?? '');
      if (!role) continue;
      const next = palette[role];
      if (normalizeColor(next) !== normalizeColor(current)) patch[key] = next;
    }

    if (element.type === 'text') {
      const size = Number(element.attributes?.fontSize ?? 24);
      const family = size >= 32 ? fonts.heading : fonts.body;
      if (family && element.attributes?.fontFamily !== family) {
        patch.fontFamily = family;
      }
    }

    if (Object.keys(patch).length > 0) {
      ops.push({ type: 'updateElement', id: element.id, attributes: patch });
    }
  }

  if (options.background) {
    for (const scene of project.storyboard?.scenes ?? []) {
      if (normalizeColor(scene.background) === normalizeColor(palette.background)) {
        continue;
      }
      ops.push({
        type: 'updateScene',
        id: scene.id,
        background: palette.background,
      });
    }
  }

  return ops;
}