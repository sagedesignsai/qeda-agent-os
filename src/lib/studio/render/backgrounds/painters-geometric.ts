import { mulberry32 } from './codec';
import type { GenerativeBackgroundConfig } from './types';

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

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

export function drawBauhausBackground(
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
      const secondaryIdx =
        (colorIdx + 1 + Math.floor(rand() * (palette.length - 1))) %
        palette.length;
      const shapeRoll = rand();
      const baseCorner = Math.floor(rand() * 4);
      const animPhaseOffset = rand() * 4;
      const animDir = rand() > 0.5 ? 1 : -1;

      if (skipRoll < 0.14) continue;

      const cx = originX + col * (cellSize + gap) + cellSize / 2;
      const cy = originY + row * (cellSize + gap) + cellSize / 2;

      let rotAngle = 0;
      if (config.animated) {
        const cycle =
          (timeSec * 0.55 + (row * 0.35 + col * 0.25 + animPhaseOffset)) % 4;
        const step = Math.floor(cycle);
        const frac = cycle - step;
        const turn = frac > 0.65 ? easeInOutCubic((frac - 0.65) / 0.35) : 0;
        rotAngle = (step + turn) * (Math.PI / 2) * animDir;
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

export function drawWavesBackground(
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

export function drawAuroraBackground(
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
