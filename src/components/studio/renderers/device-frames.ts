/**
 * components/studio/renderers/device-frames.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Canvas 2D renderers for device frame mockups in Showcase Studio:
 *   - Browser (address bar, back/forward/refresh, traffic lights, title)
 *   - MacBook (aluminum/dark bezel, camera notch, base/hinge line)
 *   - iPhone (mobile frame, dynamic island notch, rounded edges, home indicator)
 *   - Minimal SVG (sleek line framing with metallic corner accents)
 *   - Glass (frosted translucent border with subtle specular highlights)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { StudioDeviceFrame } from '@/lib/studio-types';

export interface DeviceFrameRenderOptions {
  frame: StudioDeviceFrame;
  winX: number;
  winY: number;
  winW: number;
  winH: number;
  headerH: number;
  radius: number;
}

export function drawDeviceFrameHeader(
  ctx: CanvasRenderingContext2D,
  options: DeviceFrameRenderOptions,
): void {
  const { frame, winX, winY, winW, winH, headerH, radius } = options;
  if (!frame || frame.type === 'none') {
    // Default window header bar
    ctx.fillStyle = 'rgba(15, 17, 23, 0.75)';
    ctx.fillRect(winX, winY, winW, headerH);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.beginPath();
    ctx.moveTo(winX, winY + headerH);
    ctx.lineTo(winX + winW, winY + headerH);
    ctx.stroke();

    const dotY = winY + headerH / 2;
    const dotR = 4.5;
    const dots = ['#ef4444', '#f59e0b', '#10b981'];
    dots.forEach((color, i) => {
      ctx.beginPath();
      ctx.arc(winX + 16 + i * 14, dotY, dotR, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    });
    return;
  }

  const isLight = frame.theme === 'light';

  if (frame.type === 'browser') {
    // Browser top bar
    ctx.fillStyle = isLight ? 'rgba(241, 245, 249, 0.95)' : 'rgba(15, 23, 42, 0.95)';
    ctx.fillRect(winX, winY, winW, headerH);

    // Traffic light dots
    if (frame.showControls !== false) {
      const dotY = winY + headerH / 2;
      const dotR = 4.5;
      ['#ef4444', '#f59e0b', '#10b981'].forEach((color, i) => {
        ctx.beginPath();
        ctx.arc(winX + 16 + i * 14, dotY, dotR, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      });
    }

    // Address Bar / Pill
    const urlText = frame.url || 'https://qeda.app';
    const addrW = Math.min(420, winW * 0.55);
    const addrH = Math.max(18, headerH - 10);
    const addrX = winX + (winW - addrW) / 2;
    const addrY = winY + (headerH - addrH) / 2;

    ctx.fillStyle = isLight ? 'rgba(226, 232, 240, 0.8)' : 'rgba(30, 41, 59, 0.8)';
    ctx.beginPath();
    ctx.roundRect(addrX, addrY, addrW, addrH, addrH / 2);
    ctx.fill();

    ctx.strokeStyle = isLight ? 'rgba(203, 213, 225, 0.5)' : 'rgba(51, 65, 85, 0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Lock icon & URL text
    ctx.font = `500 ${Math.round(addrH * 0.55)}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = isLight ? '#334155' : '#94a3b8';
    ctx.fillText(`🔒 ${urlText}`, addrX + addrW / 2, addrY + addrH / 2);

    // Header bottom border
    ctx.strokeStyle = isLight ? 'rgba(203, 213, 225, 0.8)' : 'rgba(51, 65, 85, 0.5)';
    ctx.beginPath();
    ctx.moveTo(winX, winY + headerH);
    ctx.lineTo(winX + winW, winY + headerH);
    ctx.stroke();
  } else if (frame.type === 'macbook') {
    // Dark aluminum notch bezel header
    ctx.fillStyle = '#0b0f19';
    ctx.fillRect(winX, winY, winW, headerH);

    // Camera Notch
    const notchW = 120;
    const notchH = 18;
    const notchX = winX + (winW - notchW) / 2;
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.roundRect(notchX, winY, notchW, notchH, [0, 0, 8, 8]);
    ctx.fill();

    // Lens dot
    ctx.beginPath();
    ctx.arc(notchX + notchW / 2, winY + notchH / 2, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#1e293b';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(notchX + notchW / 2, winY + notchH / 2, 1.2, 0, Math.PI * 2);
    ctx.fillStyle = '#38bdf8';
    ctx.fill();
  } else if (frame.type === 'iphone') {
    // Phone notch / Dynamic Island bar
    ctx.fillStyle = '#000000';
    ctx.fillRect(winX, winY, winW, headerH);

    const islandW = 110;
    const islandH = 20;
    const islandX = winX + (winW - islandW) / 2;
    const islandY = winY + (headerH - islandH) / 2;

    ctx.fillStyle = '#111827';
    ctx.beginPath();
    ctx.roundRect(islandX, islandY, islandW, islandH, islandH / 2);
    ctx.fill();
  } else if (frame.type === 'glass') {
    // Frosted glass header bar
    const glassGrad = ctx.createLinearGradient(winX, winY, winX + winW, winY + headerH);
    glassGrad.addColorStop(0, 'rgba(255, 255, 255, 0.15)');
    glassGrad.addColorStop(1, 'rgba(255, 255, 255, 0.05)');

    ctx.fillStyle = glassGrad;
    ctx.fillRect(winX, winY, winW, headerH);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(winX, winY + headerH);
    ctx.lineTo(winX + winW, winY + headerH);
    ctx.stroke();

    if (frame.title) {
      ctx.font = '600 12px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.fillText(frame.title, winX + winW / 2, winY + headerH / 2);
    }
  } else if (frame.type === 'minimal-svg') {
    // Minimal border header line
    ctx.fillStyle = 'rgba(15, 23, 42, 0.4)';
    ctx.fillRect(winX, winY, winW, headerH);

    if (frame.title) {
      ctx.font = '500 11px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(226, 232, 240, 0.7)';
      ctx.fillText(frame.title.toUpperCase(), winX + winW / 2, winY + headerH / 2);
    }
  }
}

export function drawDeviceFrameFooter(
  ctx: CanvasRenderingContext2D,
  options: DeviceFrameRenderOptions,
): void {
  const { frame, winX, winY, winW, winH } = options;
  if (!frame || frame.type === 'none') return;

  if (frame.type === 'iphone') {
    // iPhone home bar indicator at bottom
    const barW = Math.min(140, winW * 0.35);
    const barH = 4;
    const barX = winX + (winW - barW) / 2;
    const barY = winY + winH - 12;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW, barH, 2);
    ctx.fill();
  } else if (frame.type === 'macbook') {
    // MacBook hinge lip accent at bottom
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(winX + 20, winY + winH);
    ctx.lineTo(winX + winW - 20, winY + winH);
    ctx.stroke();
  }
}
