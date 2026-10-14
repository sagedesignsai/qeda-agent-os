/**
 * components/studio/renderers/motion-cards.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Canvas 2D renderers for Intro and Outro Motion Cards in Showcase Studio:
 *   - Minimal preset: Sleek dark backdrop, clean typography, thin accent progress
 *   - Kinetic preset: Radial spotlight glow, bold headline, floating badge
 *   - Gradient preset: Mesh gradient background, headline, subtitle, primary pill
 *   - Cyber preset: High-tech glass, cyan/purple glow border, mono subtitle
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { StudioMotionCard } from '@/lib/studio-types';

export interface MotionCardRenderOptions {
  card: StudioMotionCard;
  cardType: 'intro' | 'outro';
  currentTimeMs: number;
  totalDurationMs: number;
  cw: number;
  ch: number;
}

export function drawMotionCard(
  ctx: CanvasRenderingContext2D,
  options: MotionCardRenderOptions,
): void {
  const { card, cardType, currentTimeMs, totalDurationMs, cw, ch } = options;

  if (!card || !card.enabled) return;

  const cardDuration = card.durationMs || 3000;
  let isVisible = false;
  let progress = 0; // 0..1 lifecycle progress within the card display duration

  if (cardType === 'intro') {
    if (currentTimeMs <= cardDuration) {
      isVisible = true;
      progress = currentTimeMs / cardDuration;
    }
  } else if (cardType === 'outro') {
    const outroStart = Math.max(0, totalDurationMs - cardDuration);
    if (currentTimeMs >= outroStart) {
      isVisible = true;
      progress = (currentTimeMs - outroStart) / cardDuration;
    }
  }

  if (!isVisible) return;

  ctx.save();

  // Alpha fade in/out curve
  let alpha = 1.0;
  if (progress < 0.15) {
    alpha = progress / 0.15;
  } else if (progress > 0.85) {
    alpha = (1.0 - progress) / 0.15;
  }
  ctx.globalAlpha = Math.min(1.0, Math.max(0, alpha));

  const preset = card.preset || 'minimal';

  // 1. Render Background Backdrop
  if (preset === 'kinetic') {
    const grad = ctx.createRadialGradient(cw / 2, ch / 2, 50, cw / 2, ch / 2, cw * 0.7);
    grad.addColorStop(0, '#1e1b4b');
    grad.addColorStop(0.6, '#0f172a');
    grad.addColorStop(1, '#020617');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, cw, ch);
  } else if (preset === 'gradient') {
    const grad = ctx.createLinearGradient(0, 0, cw, ch);
    grad.addColorStop(0, '#312e81');
    grad.addColorStop(0.5, '#4c1d95');
    grad.addColorStop(1, '#0f172a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, cw, ch);
  } else if (preset === 'cyber') {
    ctx.fillStyle = '#030712';
    ctx.fillRect(0, 0, cw, ch);

    // Glowing border frame
    ctx.strokeStyle = 'rgba(6, 182, 212, 0.6)';
    ctx.lineWidth = 3;
    ctx.strokeRect(40, 40, cw - 80, ch - 80);
  } else {
    // Minimal default
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, cw, ch);
  }

  // 2. Render Card Contents
  const centerX = cw / 2;
  const centerY = ch / 2;

  // Title
  const titleSize = Math.max(32, Math.round(ch * 0.065));
  ctx.font = `800 ${titleSize}px Inter, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (preset === 'kinetic' || preset === 'gradient') {
    const textGrad = ctx.createLinearGradient(centerX - 200, 0, centerX + 200, 0);
    textGrad.addColorStop(0, '#ffffff');
    textGrad.addColorStop(1, '#a5b4fc');
    ctx.fillStyle = textGrad;
  } else if (preset === 'cyber') {
    ctx.fillStyle = '#22d3ee';
  } else {
    ctx.fillStyle = '#ffffff';
  }

  ctx.fillText(card.title, centerX, centerY - titleSize * 0.4);

  // Subtitle
  if (card.subtitle) {
    const subSize = Math.max(16, Math.round(ch * 0.028));
    ctx.font = `400 ${subSize}px Inter, system-ui, sans-serif`;
    ctx.fillStyle = preset === 'cyber' ? '#94a3b8' : 'rgba(226, 232, 240, 0.85)';
    ctx.fillText(card.subtitle, centerX, centerY + titleSize * 0.6);
  }

  // Badge / Pill Button
  if (card.badge) {
    const badgeText = card.badge.toUpperCase();
    const badgeSize = Math.max(12, Math.round(ch * 0.022));
    ctx.font = `700 ${badgeSize}px Inter, system-ui, sans-serif`;

    const metrics = ctx.measureText(badgeText);
    const badgeW = metrics.width + 32;
    const badgeH = badgeSize + 16;
    const badgeX = centerX - badgeW / 2;
    const badgeY = centerY - titleSize * 1.5;

    ctx.save();
    if (preset === 'cyber') {
      ctx.fillStyle = 'rgba(6, 182, 212, 0.15)';
      ctx.strokeStyle = '#06b6d4';
    } else {
      ctx.fillStyle = 'rgba(99, 102, 241, 0.2)';
      ctx.strokeStyle = 'rgba(129, 140, 248, 0.6)';
    }

    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, badgeW, badgeH, badgeH / 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = preset === 'cyber' ? '#38bdf8' : '#818cf8';
    ctx.fillText(badgeText, centerX, badgeY + badgeH / 2);
    ctx.restore();
  }

  // Progress Bar Line at bottom of Card
  const lineW = (cw - 120) * Math.min(1, progress);
  const lineY = ch - 24;
  ctx.fillStyle = preset === 'cyber' ? '#06b6d4' : '#6366f1';
  ctx.fillRect((cw - (cw - 120)) / 2, lineY, lineW, 3);

  ctx.restore();
}
