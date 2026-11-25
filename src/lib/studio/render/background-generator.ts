/**
 * lib/studio/render/background-generator.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Generative & animated background system for Showcase Studio.
 *
 * Supports four procedural styles:
 *   - `bauhaus`: Geometric quarter-circles, petals, semicircles & tiles with
 *     staggered kinetic 90° rotations.
 *   - `waves`: Layered organic diagonal color ribbons with multi-harmonic drift.
 *   - `plasma`: Animated WebGL plasma waves & glowing nodes shader.
 *   - `aurora`: Soft orbital multi-color mesh orbs.
 *
 * Configurations serialize compactly into `styling.background` (`gen-bg:v1?...`)
 * so they persist in SQLite, preview at 60fps, and export frame-accurately.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { drawPlasmaShaderBackground } from './shader-background';

export type GenerativeBackgroundStyle =
  | 'bauhaus'
  | 'waves'
  | 'plasma'
  | 'aurora';

export type BauhausShapeMode =
  | 'mixed'
  | 'quarters'
  | 'petals'
  | 'circles';

export interface GenerativeBackgroundConfig {
  style: GenerativeBackgroundStyle;
  paletteId: string;
  baseColor: string;
  colors: string[];
  animated: boolean;
  speed: number;
  seed: number;
  density: number;
  intensity: number;
  angle: number;
  shapeMode: BauhausShapeMode;
}

export interface BackgroundPalette {
  id: string;
  name: string;
  baseColor: string;
  colors: readonly [string, string, string, string, string];
}

export interface GenerativeBackgroundPreset {
  id: string;
  name: string;
  description: string;
  config: GenerativeBackgroundConfig;
}

export interface ClassicBackgroundPreset {
  name: string;
  value: string;
}

export const BACKGROUND_PALETTES: readonly BackgroundPalette[] = [
  {
    id: 'popsicle',
    name: 'Popsicle',
    baseColor: '#16192b',
    colors: ['#0fb59d', '#11798d', '#fdf6e9', '#ffc266', '#ff6b6b'],
  },
  {
    id: 'neon-plasma',
    name: 'Neon Plasma',
    baseColor: '#19194d',
    colors: ['#4d1a80', '#6633cc', '#a855f7', '#38bdf8', '#c084fc'],
  },
  {
    id: 'emerald-aurora',
    name: 'Emerald Aurora',
    baseColor: '#021814',
    colors: ['#10b981', '#06b6d4', '#34d399', '#0f766e', '#a7f3d0'],
  },
  {
    id: 'sunset-ember',
    name: 'Sunset Ember',
    baseColor: '#1c0f0a',
    colors: ['#f97316', '#ef4444', '#fbbf24', '#ec4899', '#fef3c7'],
  },
  {
    id: 'cyber-pink',
    name: 'Cyber Pink',
    baseColor: '#1a0b2e',
    colors: ['#ec4899', '#8b5cf6', '#6366f1', '#f472b6', '#38bdf8'],
  },
  {
    id: 'bauhaus-primary',
    name: 'Bauhaus Primary',
    baseColor: '#111318',
    colors: ['#ef4444', '#eab308', '#3b82f6', '#f8fafc', '#334155'],
  },
  {
    id: 'nordic-frost',
    name: 'Nordic Frost',
    baseColor: '#1e2430',
    colors: ['#88c0d0', '#81a1c1', '#ebcb8b', '#bf616a', '#eceff4'],
  },
];

export const DEFAULT_GENERATIVE_BACKGROUND: GenerativeBackgroundConfig = {
  style: 'bauhaus',
  paletteId: 'popsicle',
  baseColor: '#16192b',
  colors: ['#0fb59d', '#11798d', '#fdf6e9', '#ffc266', '#ff6b6b'],
  animated: true,
  speed: 1,
  seed: 42,
  density: 4,
  intensity: 8,
  angle: -20,
  shapeMode: 'mixed',
};

export const GENERATIVE_BACKGROUND_PRESETS: readonly GenerativeBackgroundPreset[] = [
  {
    id: 'popsicle-bauhaus',
    name: 'Popsicle Bauhaus',
    description: 'Kinetic geometric quarter-circles & petals',
    config: { ...DEFAULT_GENERATIVE_BACKGROUND },
  },
  {
    id: 'popsicle-waves',
    name: 'Popsicle Waves',
    description: 'Flowing diagonal multi-band color ribbons',
    config: {
      style: 'waves',
      paletteId: 'popsicle',
      baseColor: '#16192b',
      colors: ['#0fb59d', '#11798d', '#fdf6e9', '#ffc266', '#ff6b6b'],
      animated: true,
      speed: 1,
      seed: 17,
      density: 6,
      intensity: 45,
      angle: -20,
      shapeMode: 'mixed',
    },
  },
  {
    id: 'neon-plasma',
    name: 'Neon Plasma',
    description: 'Animated WebGL plasma waves & glowing nodes',
    config: {
      style: 'plasma',
      paletteId: 'neon-plasma',
      baseColor: '#19194d',
      colors: ['#4d1a80', '#6633cc', '#a855f7', '#38bdf8', '#c084fc'],
      animated: true,
      speed: 1,
      seed: 7,
      density: 16,
      intensity: 50,
      angle: 0,
      shapeMode: 'mixed',
    },
  },
  {
    id: 'cyber-plasma',
    name: 'Cyber Plasma',
    description: 'Vibrant magenta & cyan shader energy lines',
    config: {
      style: 'plasma',
      paletteId: 'cyber-pink',
      baseColor: '#1a0b2e',
      colors: ['#4c1d95', '#ec4899', '#38bdf8', '#f472b6', '#8b5cf6'],
      animated: true,
      speed: 1.25,
      seed: 23,
      density: 14,
      intensity: 55,
      angle: 0,
      shapeMode: 'mixed',
    },
  },
  {
    id: 'aurora-borealis',
    name: 'Aurora Borealis',
    description: 'Drifting luminous emerald & cyan mesh orbs',
    config: {
      style: 'aurora',
      paletteId: 'emerald-aurora',
      baseColor: '#021814',
      colors: ['#10b981', '#06b6d4', '#34d399', '#0f766e', '#a7f3d0'],
      animated: true,
      speed: 1,
      seed: 11,
      density: 5,
      intensity: 60,
      angle: 25,
      shapeMode: 'mixed',
    },
  },
  {
    id: 'sunset-waves',
    name: 'Sunset Waves',
    description: 'Warm layered amber & coral ribbon waves',
    config: {
      style: 'waves',
      paletteId: 'sunset-ember',
      baseColor: '#1c0f0a',
      colors: ['#f97316', '#ef4444', '#fbbf24', '#ec4899', '#fef3c7'],
      animated: true,
      speed: 0.9,
      seed: 31,
      density: 6,
      intensity: 50,
      angle: -16,
      shapeMode: 'mixed',
    },
  },
  {
    id: 'bauhaus-primary',
    name: 'Bauhaus Primary',
    description: 'Classic primary geometric block tiles',
    config: {
      style: 'bauhaus',
      paletteId: 'bauhaus-primary',
      baseColor: '#111318',
      colors: ['#ef4444', '#eab308', '#3b82f6', '#f8fafc', '#334155'],
      animated: true,
      speed: 0.85,
      seed: 88,
      density: 4,
      intensity: 10,
      angle: 0,
      shapeMode: 'quarters',
    },
  },
  {
    id: 'nordic-bauhaus',
    name: 'Nordic Petals',
    description: 'Soft Nordic palette with kinetic leaf geometry',
    config: {
      style: 'bauhaus',
      paletteId: 'nordic-frost',
      baseColor: '#1e2430',
      colors: ['#88c0d0', '#81a1c1', '#ebcb8b', '#bf616a', '#eceff4'],
      animated: true,
      speed: 0.8,
      seed: 64,
      density: 5,
      intensity: 6,
      angle: 0,
      shapeMode: 'petals',
    },
  },
];

export const CLASSIC_BACKGROUND_PRESETS: readonly ClassicBackgroundPreset[] = [
  {
    name: 'Midnight Indigo',
    value: 'linear-gradient(135deg, #1e1b4b 0%, #0f172a 50%, #020617 100%)',
  },
  {
    name: 'Cyber Violet',
    value: 'linear-gradient(135deg, #2e1065 0%, #1e1b4b 50%, #09090b 100%)',
  },
  {
    name: 'Emerald Aurora',
    value: 'linear-gradient(135deg, #064e3b 0%, #022c22 50%, #020617 100%)',
  },
  {
    name: 'Sunset Ember',
    value: 'linear-gradient(135deg, #451a03 0%, #1c1917 50%, #0c0a09 100%)',
  },
  { name: 'Studio Slate', value: '#0f172a' },
  { name: 'Deep Onyx', value: '#09090b' },
  { name: 'Carbon Gray', value: '#27272a' },
  { name: 'Navy Dusk', value: '#020617' },
];

const GEN_PREFIX = 'gen-bg:v1?';
const VALID_STYLES = new Set<GenerativeBackgroundStyle>([
  'bauhaus',
  'waves',
  'plasma',
  'aurora',
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

function clampNumber(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

export function isGenerativeBackground(background: string | null | undefined): boolean {
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
  const baseColor = normalizeHex(params.get('b'), DEFAULT_GENERATIVE_BACKGROUND.baseColor);
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

/**
 * CSS gradient/color representation for UI swatches and non-canvas fallbacks.
 */
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

// ── Deterministic PRNG & Math Helpers ────────────────────────────────────────

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// ── Style 1: Bauhaus Geometric Tiles (Images 1 & 2) ──────────────────────────

function drawQuarterCircle(
  ctx: CanvasRenderingContext2D,
  size: number,
  corner: number,
): void {
  const half = size / 2;
  ctx.beginPath();
  if (corner === 0) {
    ctx.moveTo(-half, -half);
    ctx.arc(-half, -half, size, 0, Math.PI / 2);
  } else if (corner === 1) {
    ctx.moveTo(half, -half);
    ctx.arc(half, -half, size, Math.PI / 2, Math.PI);
  } else if (corner === 2) {
    ctx.moveTo(half, half);
    ctx.arc(half, half, size, Math.PI, Math.PI * 1.5);
  } else {
    ctx.moveTo(-half, half);
    ctx.arc(-half, half, size, Math.PI * 1.5, Math.PI * 2);
  }
  ctx.closePath();
  ctx.fill();
}

function drawBauhausBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  config: GenerativeBackgroundConfig,
  timeMs: number,
): void {
  ctx.fillStyle = config.baseColor;
  ctx.fillRect(0, 0, width, height);

  const rows = Math.max(2, Math.min(10, config.density));
  const gap = (config.intensity / 100) * Math.min(width, height) * 0.03;
  const padding = Math.min(width, height) * 0.05;
  const availH = Math.max(10, height - padding * 2);
  const cellSize = (availH - gap * (rows - 1)) / rows;
  const availW = Math.max(cellSize, width - padding * 2);
  const cols = Math.max(2, Math.floor((availW + gap) / (cellSize + gap)));
  const gridW = cols * cellSize + (cols - 1) * gap;
  const gridH = rows * cellSize + (rows - 1) * gap;
  const originX = (width - gridW) / 2;
  const originY = (height - gridH) / 2;

  const rand = mulberry32(config.seed);
  const timeSec = config.animated ? (timeMs / 1000) * config.speed : 0;
  const palette = config.colors;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const skipRoll = rand();
      const colorIdx = Math.floor(rand() * palette.length);
      const secondaryIdx = (colorIdx + 1 + Math.floor(rand() * (palette.length - 1))) % palette.length;
      const shapeRoll = rand();
      const baseCorner = Math.floor(rand() * 4);
      const animPhaseOffset = rand() * 4;
      const animDir = rand() > 0.5 ? 1 : -1;

      if (skipRoll < 0.14) continue;

      const cx = originX + col * (cellSize + gap) + cellSize / 2;
      const cy = originY + row * (cellSize + gap) + cellSize / 2;

      // Smooth periodic 90° turns with staggered rest intervals
      let rotAngle = 0;
      if (config.animated) {
        const cycle = (timeSec * 0.55 + (row * 0.35 + col * 0.25 + animPhaseOffset)) % 4;
        const step = Math.floor(cycle);
        const frac = cycle - step;
        const turn = frac > 0.65 ? easeInOutCubic((frac - 0.65) / 0.35) : 0;
        rotAngle = ((step + turn) * (Math.PI / 2)) * animDir;
      }

      ctx.save();
      ctx.beginPath();
      ctx.rect(cx - cellSize / 2, cy - cellSize / 2, cellSize, cellSize);
      ctx.clip();

      ctx.translate(cx, cy);
      if (rotAngle !== 0) ctx.rotate(rotAngle);

      const mode = config.shapeMode;
      const shapeKind =
        mode === 'quarters'
          ? 'quarter'
          : mode === 'petals'
            ? 'petal'
            : mode === 'circles'
              ? shapeRoll < 0.55
                ? 'circle'
                : 'semi'
              : shapeRoll < 0.45
                ? 'quarter'
                : shapeRoll < 0.72
                  ? 'petal'
                  : shapeRoll < 0.88
                    ? 'semi'
                    : 'circle';

      ctx.fillStyle = palette[colorIdx];
      if (shapeKind === 'quarter') {
        drawQuarterCircle(ctx, cellSize, baseCorner);
      } else if (shapeKind === 'petal') {
        drawQuarterCircle(ctx, cellSize, baseCorner);
        ctx.fillStyle = palette[secondaryIdx];
        drawQuarterCircle(ctx, cellSize, (baseCorner + 2) % 4);
      } else if (shapeKind === 'semi') {
        ctx.beginPath();
        ctx.arc(0, cellSize / 2, cellSize / 2, Math.PI, Math.PI * 2);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, cellSize * 0.42, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
  }
}

// ── Style 2: Organic Flowing Color Waves (Image 3) ───────────────────────────

function drawWavesBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  config: GenerativeBackgroundConfig,
  timeMs: number,
): void {
  ctx.fillStyle = config.baseColor;
  ctx.fillRect(0, 0, width, height);

  const rand = mulberry32(config.seed);
  const bands = Math.max(3, Math.min(10, config.density));
  const ampRatio = 0.03 + (config.intensity / 100) * 0.12;
  const angleRad = (config.angle * Math.PI) / 180;
  const timeSec = config.animated ? (timeMs / 1000) * config.speed : 0;

  const diag = Math.hypot(width, height);
  const spanW = diag * 1.2;
  const spanH = diag * 1.2;
  const steps = 40;

  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.rotate(angleRad);

  const palette = config.colors;
  for (let b = 0; b < bands; b++) {
    const color = palette[b % palette.length];
    const bandY = -spanH * 0.52 + (b / bands) * spanH * 1.04;
    const freq1 = 2.2 + rand() * 1.8;
    const freq2 = 4.1 + rand() * 2.5;
    const phase1 = rand() * Math.PI * 2 + timeSec * (0.7 + b * 0.09);
    const phase2 = rand() * Math.PI * 2 - timeSec * (0.45 + b * 0.06);
    const amp = spanH * ampRatio * (0.75 + rand() * 0.5);

    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const x = -spanW / 2 + u * spanW;
      const y =
        bandY +
        Math.sin(u * freq1 * Math.PI + phase1) * amp +
        Math.cos(u * freq2 * Math.PI + phase2) * (amp * 0.42);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.lineTo(spanW / 2, spanH / 2 + 40);
    ctx.lineTo(-spanW / 2, spanH / 2 + 40);
    ctx.closePath();

    ctx.fillStyle = color;
    ctx.fill();
  }

  ctx.restore();
}

// ── Style 3: Aurora Mesh Orbs ────────────────────────────────────────────────

function drawAuroraBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  config: GenerativeBackgroundConfig,
  timeMs: number,
): void {
  ctx.fillStyle = config.baseColor;
  ctx.fillRect(0, 0, width, height);

  const rand = mulberry32(config.seed);
  const orbCount = Math.max(3, Math.min(8, config.density));
  const timeSec = config.animated ? (timeMs / 1000) * config.speed : 0;
  const orbitScale = 0.14 + (config.intensity / 100) * 0.18;

  ctx.save();
  ctx.globalCompositeOperation = 'screen';

  for (let i = 0; i < orbCount; i++) {
    const color = config.colors[i % config.colors.length];
    const baseX = 0.15 + rand() * 0.7;
    const baseY = 0.15 + rand() * 0.7;
    const speedX = 0.35 + rand() * 0.45;
    const speedY = 0.3 + rand() * 0.45;
    const phase = rand() * Math.PI * 2;
    const radius = Math.max(width, height) * (0.35 + rand() * 0.28);

    const cx =
      width * (baseX + Math.sin(timeSec * speedX + phase) * orbitScale);
    const cy =
      height * (baseY + Math.cos(timeSec * speedY + phase * 1.3) * orbitScale);

    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    grad.addColorStop(0, `${color}cc`);
    grad.addColorStop(0.5, `${color}55`);
    grad.addColorStop(1, `${color}00`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  }

  ctx.restore();
}

// ── Public Unified Dispatcher ────────────────────────────────────────────────

export function drawGenerativeBackground(
  ctx: CanvasRenderingContext2D,
  {
    width,
    height,
    config,
    timeMs = 0,
  }: {
    width: number;
    height: number;
    config: GenerativeBackgroundConfig;
    timeMs?: number;
  },
): void {
  if (config.style === 'waves') {
    drawWavesBackground(ctx, width, height, config, timeMs);
    return;
  }
  if (config.style === 'aurora') {
    drawAuroraBackground(ctx, width, height, config, timeMs);
    return;
  }
  if (config.style === 'plasma') {
    const timeSec = config.animated
      ? (timeMs / 1000) * config.speed
      : config.seed * 0.37;
    drawPlasmaShaderBackground(ctx, {
      width,
      height,
      timeSec,
      bgColor1: config.baseColor,
      bgColor2: config.colors[0] ?? '#4d1a80',
      lineColor: config.colors[1] ?? config.colors[0] ?? '#6633cc',
      accentColor: config.colors[2] ?? config.colors[1] ?? '#a855f7',
      lineCount: config.density,
      warp: 0.35 + (config.intensity / 100) * 1.3,
      seed: config.seed,
    });
    return;
  }

  drawBauhausBackground(ctx, width, height, config, timeMs);
}
