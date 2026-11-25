import { mulberry32 } from './codec';
import type { GenerativeBackgroundConfig } from './types';

export function drawTerrainBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  config: GenerativeBackgroundConfig,
  timeMs: number,
): void {
  const palette =
    config.colors.length > 0 ? config.colors : ['#22c55e', '#4ade80'];
  const t = config.animated
    ? (timeMs / 1000) * config.speed
    : config.seed * 0.35;
  const cols = Math.max(24, Math.min(72, Math.round(config.density * 3.5)));
  const rows = Math.max(16, Math.min(48, Math.round(config.density * 2.4)));
  const amp = (0.14 + (config.intensity / 100) * 0.42) * height * 0.28;

  ctx.save();
  ctx.fillStyle = config.baseColor || '#020604';
  ctx.fillRect(0, 0, width, height);

  const horizonY = height * 0.48;
  const glow = ctx.createRadialGradient(
    width * 0.5,
    height * 0.72,
    height * 0.05,
    width * 0.5,
    height * 0.72,
    width * 0.65,
  );
  glow.addColorStop(0, `${palette[0]}26`);
  glow.addColorStop(1, 'transparent');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  const primary = palette[0] ?? '#22c55e';
  const secondary = palette[1] ?? primary;
  const highlight = palette[3] ?? secondary;

  for (let r = 0; r < rows; r++) {
    const depth = (r + 1) / rows;
    const persp = Math.pow(depth, 1.55);
    const yBase = horizonY + persp * (height * 0.58);
    const spreadX = width * (0.65 + persp * 0.95);
    const dotRadius = Math.max(0.8, 0.7 + persp * 2.1);
    const alpha = Math.min(0.95, 0.12 + persp * 0.85);

    for (let c = 0; c < cols; c++) {
      const u = c / (cols - 1) - 0.5;
      const wx = u * 7.5;
      const wz = depth * 6.0;
      const wave =
        Math.sin(wx * 1.15 + t * 1.1 + config.seed * 0.2) *
          Math.cos(wz * 1.3 - t * 0.85) +
        0.5 * Math.sin((wx + wz) * 1.7 - t * 1.45);
      const y = yBase - wave * amp * persp;
      if (y < horizonY * 0.7 || y > height + 8) continue;

      const x = width * 0.5 + u * spreadX;
      if (x < -8 || x > width + 8) continue;

      const crest = Math.max(0, (wave + 1.2) / 2.4);
      ctx.globalAlpha = alpha * (0.45 + crest * 0.55);
      ctx.fillStyle =
        crest > 0.72 ? highlight : crest > 0.42 ? secondary : primary;
      ctx.beginPath();
      ctx.arc(x, y, dotRadius * (0.8 + crest * 0.45), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

export function drawOrbitsBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  config: GenerativeBackgroundConfig,
  timeMs: number,
): void {
  const palette =
    config.colors.length > 0 ? config.colors : ['#e2e8f0', '#94a3b8'];
  const rng = mulberry32(config.seed * 131 + 17);
  const t = config.animated
    ? (timeMs / 1000) * config.speed
    : config.seed * 0.4;
  const ringCount = Math.max(3, Math.min(14, Math.round(config.density)));
  const cx = width * 0.5;
  const cy = height * 0.5;
  const maxR = Math.min(width, height) * 0.46;
  const minR = maxR * 0.18;
  const arcSpanBase = 0.45 + (config.intensity / 100) * 1.35;

  ctx.save();
  ctx.fillStyle = config.baseColor || '#060709';
  ctx.fillRect(0, 0, width, height);

  for (let i = 0; i < ringCount; i++) {
    const frac = ringCount === 1 ? 0.5 : i / (ringCount - 1);
    const radius = minR + frac * (maxR - minR);
    const startAngle = rng() * Math.PI * 2;
    const dir = i % 2 === 0 ? 1 : -1;
    const omega = dir * (0.28 + rng() * 0.55) * (1.25 - frac * 0.45);
    const arcLen = arcSpanBase * (0.55 + rng() * 0.75);
    const color = palette[i % palette.length];

    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.12;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

    const headAngle = startAngle + t * omega;
    const segments = 16;
    for (let s = 0; s < segments; s++) {
      const f0 = s / segments;
      const f1 = (s + 1) / segments;
      const a0 = headAngle - dir * arcLen * (1 - f0);
      const a1 = headAngle - dir * arcLen * (1 - f1);
      ctx.globalAlpha = Math.pow(f1, 1.8) * 0.85;
      ctx.lineWidth = 1.2 + f1 * 1.6;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, Math.min(a0, a1), Math.max(a0, a1));
      ctx.stroke();
    }

    const hx = cx + Math.cos(headAngle) * radius;
    const hy = cy + Math.sin(headAngle) * radius;
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(hx, hy, 5.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.98;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(hx, hy, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

export function drawTrailsBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  config: GenerativeBackgroundConfig,
  timeMs: number,
): void {
  const palette =
    config.colors.length > 0 ? config.colors : ['#22d3ee', '#6366f1'];
  const rng = mulberry32(config.seed * 257 + 11);
  const t = config.animated
    ? (timeMs / 1000) * config.speed
    : config.seed * 0.5;
  const streamCount = Math.max(4, Math.min(24, Math.round(config.density)));
  const curveAmp = (0.15 + (config.intensity / 100) * 0.85) * height * 0.24;
  const angleRad = (config.angle * Math.PI) / 180;

  ctx.save();
  ctx.fillStyle = config.baseColor || '#05070e';
  ctx.fillRect(0, 0, width, height);

  ctx.translate(width / 2, height / 2);
  ctx.rotate(angleRad * 0.6);
  const spanW = width * 1.5;
  const spanH = height * 1.4;

  for (let i = 0; i < streamCount; i++) {
    const laneFrac = streamCount === 1 ? 0.5 : i / (streamCount - 1);
    const yBase = (laneFrac - 0.5) * spanH * 0.85 + (rng() - 0.5) * 32;
    const phase = rng() * Math.PI * 2;
    const freq = 0.8 + rng() * 0.9;
    const travelSpeed = 0.22 + rng() * 0.28;
    const color = palette[i % palette.length];

    const pointAt = (u: number): [number, number] => {
      const x = (u - 0.5) * spanW;
      const y =
        yBase +
        Math.sin(u * Math.PI * 2 * freq + phase + t * 0.45) * curveAmp +
        Math.cos(u * Math.PI * 1.3 - phase) * curveAmp * 0.35;
      return [x, y];
    };

    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.14;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const guideSteps = 32;
    for (let s = 0; s <= guideSteps; s++) {
      const [x, y] = pointAt(s / guideSteps);
      if (s === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    const headU = ((t * travelSpeed + rng()) % 1.25) - 0.1;
    const tailLen = 0.22 + (config.intensity / 100) * 0.16;
    const streakSteps = 14;
    for (let s = 0; s < streakSteps; s++) {
      const f0 = s / streakSteps;
      const f1 = (s + 1) / streakSteps;
      const u0 = headU - tailLen * (1 - f0);
      const u1 = headU - tailLen * (1 - f1);
      if (u1 < 0 || u0 > 1) continue;
      const [x0, y0] = pointAt(u0);
      const [x1, y1] = pointAt(u1);
      ctx.globalAlpha = Math.pow(f1, 1.7) * 0.9;
      ctx.lineWidth = 1.1 + f1 * 2.0;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }

    if (headU >= 0 && headU <= 1) {
      const [hx, hy] = pointAt(headU);
      ctx.globalAlpha = 0.38;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(hx, hy, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 0.98;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(hx, hy, 2.1, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}
