import { DEFAULT_GENERATIVE_BACKGROUND } from './presets';
import type {
  BauhausShapeMode,
  GenerativeBackgroundConfig,
  GenerativeBackgroundStyle,
} from './types';

const GEN_PREFIX = 'gen-bg:v1?';

const VALID_STYLES = new Set<GenerativeBackgroundStyle>([
  'bauhaus',
  'waves',
  'plasma',
  'aurora',
  'terrain',
  'orbits',
  'trails',
]);

const VALID_SHAPES = new Set<BauhausShapeMode>([
  'mixed',
  'quarters',
  'petals',
  'circles',
]);

function normalizeHex(input: string | null | undefined, fallback: string): string {
  if (!input) return fallback;
  const trimmed = input.trim().replace(/^#/, '');
  if (/^[\da-f]{6}$/i.test(trimmed) || /^[\da-f]{3}$/i.test(trimmed)) {
    return `#${trimmed.toLowerCase()}`;
  }
  return fallback;
}

function clampNumber(
  value: number,
  min: number,
  max: number,
  fallback: number,
): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

export function isGenerativeBackground(
  background: string | null | undefined,
): boolean {
  return typeof background === 'string' && background.startsWith(GEN_PREFIX);
}

export function serializeGenerativeBackground(
  config: GenerativeBackgroundConfig,
): string {
  const params = new URLSearchParams({
    s: config.style,
    p: config.paletteId,
    b: config.baseColor.replace(/^#/, ''),
    c: config.colors.map((c) => c.replace(/^#/, '')).join(','),
    a: config.animated ? '1' : '0',
    sp: String(Number(clampNumber(config.speed, 0.25, 3, 1).toFixed(2))),
    sd: String(Math.round(clampNumber(config.seed, 1, 9999, 42))),
    d: String(Math.round(clampNumber(config.density, 2, 24, 4))),
    i: String(Math.round(clampNumber(config.intensity, 0, 100, 10))),
    ang: String(Math.round(clampNumber(config.angle, -90, 90, 0))),
    sh: config.shapeMode,
  });
  return `${GEN_PREFIX}${params.toString()}`;
}

export function parseGenerativeBackground(
  background: string | null | undefined,
): GenerativeBackgroundConfig | null {
  if (!isGenerativeBackground(background) || !background) return null;
  const query = background.slice(GEN_PREFIX.length);
  const params = new URLSearchParams(query);
  const styleRaw = params.get('s') as GenerativeBackgroundStyle | null;
  const style: GenerativeBackgroundStyle =
    styleRaw && VALID_STYLES.has(styleRaw) ? styleRaw : 'bauhaus';
  const shapeRaw = params.get('sh') as BauhausShapeMode | null;
  const shapeMode: BauhausShapeMode =
    shapeRaw && VALID_SHAPES.has(shapeRaw) ? shapeRaw : 'mixed';
  const paletteId = params.get('p') || 'popsicle';
  const baseColor = normalizeHex(
    params.get('b'),
    DEFAULT_GENERATIVE_BACKGROUND.baseColor,
  );
  const colorsRaw = (params.get('c') || '')
    .split(',')
    .map((entry) => normalizeHex(entry, ''))
    .filter(Boolean);
  const colors =
    colorsRaw.length >= 2
      ? colorsRaw.slice(0, 6)
      : [...DEFAULT_GENERATIVE_BACKGROUND.colors];

  return {
    style,
    paletteId,
    baseColor,
    colors,
    animated: params.get('a') !== '0',
    speed: clampNumber(Number(params.get('sp') ?? 1), 0.25, 3, 1),
    seed: Math.round(clampNumber(Number(params.get('sd') ?? 42), 1, 9999, 42)),
    density: Math.round(clampNumber(Number(params.get('d') ?? 4), 2, 24, 4)),
    intensity: Math.round(clampNumber(Number(params.get('i') ?? 8), 0, 100, 8)),
    angle: Math.round(clampNumber(Number(params.get('ang') ?? 0), -90, 90, 0)),
    shapeMode,
  };
}

/** CSS gradient/color representation for UI swatches and non-canvas fallbacks. */
export function getBackgroundPreviewCss(background: string): string {
  const parsed = parseGenerativeBackground(background);
  if (!parsed) return background || '#090a0f';
  const [c1, c2, c3] = parsed.colors;
  return `linear-gradient(135deg, ${parsed.baseColor} 0%, ${c1 ?? parsed.baseColor} 40%, ${c2 ?? c1 ?? parsed.baseColor} 72%, ${c3 ?? c2 ?? parsed.baseColor} 100%)`;
}

export function randomizeGenerativeConfig(
  current: GenerativeBackgroundConfig,
): GenerativeBackgroundConfig {
  const nextSeed = Math.floor(Math.random() * 900) + 10;
  return {
    ...current,
    seed: nextSeed,
  };
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
