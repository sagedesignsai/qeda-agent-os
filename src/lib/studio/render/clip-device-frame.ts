import type { ClipDeviceFrame } from '../types';

/**
 * Draws a realistic device or window mockup bezel around one transformed
 * video or image layer (centered at origin `(-width/2, -height/2)`).
 */
export function drawClipDeviceFrame(
  ctx: CanvasRenderingContext2D,
  frame: ClipDeviceFrame | undefined,
  width: number,
  height: number,
  cornerRadius: number,
): void {
  if (!frame || frame.type === 'none') return;

  const isLight = frame.theme === 'light';
  const isSilver = frame.theme === 'silver';
  const pad = Math.max(
    2,
    frame.padding ??
      (frame.type === 'iphone' ? 12 : frame.type === 'macbook' ? 10 : 6),
  );
  const frameRadius =
    frame.type === 'iphone'
      ? Math.min(width, height) * 0.11
      : Math.min(cornerRadius + pad, 18);

  const headerH =
    frame.type === 'browser'
      ? Math.max(22, pad * 2.6)
      : frame.type === 'macbook'
        ? Math.max(14, pad * 1.4)
        : 0;

  const outerX = -width / 2 - pad;
  const outerY = -height / 2 - pad - (frame.type === 'browser' ? headerH - pad : 0);
  const outerW = width + pad * 2;
  const outerH =
    height + pad * 2 + (frame.type === 'browser' ? headerH - pad : 0);

  ctx.save();

  // Optional realistic drop shadow behind the hardware/window
  if (frame.shadow !== false) {
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 12;
    ctx.beginPath();
    ctx.roundRect(outerX, outerY, outerW, outerH, frameRadius);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.01)';
    ctx.lineWidth = Math.max(2, pad);
    ctx.stroke();
    ctx.restore();
  }

  // Outer bezel stroke
  const defaultBezelColor =
    frame.type === 'glass'
      ? 'rgba(220, 240, 255, 0.55)'
      : isLight
        ? '#e2e8f0'
        : isSilver
          ? '#94a3b8'
          : '#1e2430';
  const bezelColor = frame.color ?? defaultBezelColor;

  ctx.beginPath();
  ctx.roundRect(outerX, outerY, outerW, outerH, frameRadius);
  ctx.strokeStyle = bezelColor;
  ctx.lineWidth = pad;
  ctx.stroke();

  // Subtle metallic/specular outer rim
  ctx.beginPath();
  ctx.roundRect(
    outerX - pad * 0.5,
    outerY - pad * 0.5,
    outerW + pad,
    outerH + pad,
    frameRadius + pad * 0.35,
  );
  ctx.strokeStyle =
    frame.type === 'glass'
      ? 'rgba(255, 255, 255, 0.45)'
      : isLight
        ? 'rgba(15, 23, 42, 0.14)'
        : 'rgba(255, 255, 255, 0.16)';
  ctx.lineWidth = 1;
  ctx.stroke();

  if (frame.type === 'browser') {
    const barY = outerY + pad * 0.5;
    const barH = headerH;
    const isWindowOnly = frame.presetId === 'macos-window';

    // Title / toolbar background
    ctx.fillStyle = isLight ? '#f1f5f9' : '#161b26';
    ctx.beginPath();
    ctx.roundRect(
      outerX + pad * 0.5,
      barY,
      outerW - pad,
      barH,
      [Math.max(4, frameRadius - 2), Math.max(4, frameRadius - 2), 0, 0],
    );
    ctx.fill();

    // Bottom divider
    ctx.strokeStyle = isLight
      ? 'rgba(15, 23, 42, 0.08)'
      : 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(outerX + pad * 0.5, barY + barH);
    ctx.lineTo(outerX + outerW - pad * 0.5, barY + barH);
    ctx.stroke();

    // Traffic light dots
    const dotY = barY + barH / 2;
    const dotR = Math.max(2.5, Math.min(4.2, barH * 0.16));
    const dotStartX = outerX + pad * 0.5 + 12;
    ['#ff5f57', '#febc2e', '#28c840'].forEach((color, idx) => {
      ctx.beginPath();
      ctx.arc(dotStartX + idx * (dotR * 3.1), dotY, dotR, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    });

    if (isWindowOnly) {
      if (frame.title) {
        ctx.font = `500 ${Math.max(9, Math.round(barH * 0.44))}px Inter, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = isLight ? '#334155' : '#cbd5e1';
        ctx.fillText(frame.title, 0, dotY);
      }
    } else {
      const pillW = Math.min(width * 0.52, 260);
      const pillH = Math.max(12, barH * 0.62);
      ctx.fillStyle = isLight
        ? 'rgba(203, 213, 225, 0.65)'
        : 'rgba(15, 23, 42, 0.85)';
      ctx.beginPath();
      ctx.roundRect(-pillW / 2, dotY - pillH / 2, pillW, pillH, pillH / 2);
      ctx.fill();

      const label = frame.url || frame.title || 'qeda.app';
      ctx.font = `500 ${Math.max(8, Math.round(pillH * 0.54))}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = isLight ? '#475569' : '#94a3b8';
      ctx.fillText(label, 0, dotY);
    }
  } else if (frame.type === 'macbook') {
    // Top camera notch
    const notchW = Math.min(width * 0.18, 92);
    const notchH = Math.max(8, pad * 1.15);
    ctx.fillStyle = '#090b10';
    ctx.beginPath();
    ctx.roundRect(-notchW / 2, -height / 2, notchW, notchH, [0, 0, 6, 6]);
    ctx.fill();

    // Webcam lens
    ctx.beginPath();
    ctx.arc(0, -height / 2 + notchH * 0.5, 2.2, 0, Math.PI * 2);
    ctx.fillStyle = '#1e293b';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, -height / 2 + notchH * 0.5, 1, 0, Math.PI * 2);
    ctx.fillStyle = '#38bdf8';
    ctx.fill();

    // Aluminum base deck / hinge lip below screen
    const baseW = outerW * 1.12;
    const baseH = Math.max(7, pad * 0.9);
    const baseY = outerY + outerH + pad * 0.35;
    const baseGrad = ctx.createLinearGradient(-baseW / 2, baseY, baseW / 2, baseY);
    if (isSilver) {
      baseGrad.addColorStop(0, '#94a3b8');
      baseGrad.addColorStop(0.5, '#e2e8f0');
      baseGrad.addColorStop(1, '#94a3b8');
    } else {
      baseGrad.addColorStop(0, '#1e2430');
      baseGrad.addColorStop(0.5, '#475569');
      baseGrad.addColorStop(1, '#1e2430');
    }
    ctx.fillStyle = baseGrad;
    ctx.beginPath();
    ctx.roundRect(-baseW / 2, baseY, baseW, baseH, [2, 2, 6, 6]);
    ctx.fill();

    // Thumb notch in center of base
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.roundRect(-baseW * 0.08, baseY, baseW * 0.16, baseH * 0.42, [0, 0, 3, 3]);
    ctx.fill();
  } else if (frame.type === 'iphone') {
    // Dynamic Island pill
    const islandW = Math.min(width * 0.28, 96);
    const islandH = Math.max(9, pad * 0.85);
    ctx.fillStyle = '#090b10';
    ctx.beginPath();
    ctx.roundRect(
      -islandW / 2,
      -height / 2 + pad * 0.35,
      islandW,
      islandH,
      islandH / 2,
    );
    ctx.fill();

    // Front lens dot
    ctx.beginPath();
    ctx.arc(
      islandW * 0.25,
      -height / 2 + pad * 0.35 + islandH / 2,
      2,
      0,
      Math.PI * 2,
    );
    ctx.fillStyle = '#1e3a5f';
    ctx.fill();

    // Home indicator bar
    const barW = Math.min(width * 0.34, 110);
    ctx.fillStyle = isLight
      ? 'rgba(15, 23, 42, 0.45)'
      : 'rgba(255, 255, 255, 0.72)';
    ctx.beginPath();
    ctx.roundRect(-barW / 2, height / 2 - pad * 0.6, barW, 3, 1.5);
    ctx.fill();
  } else if (frame.type === 'minimal-svg') {
    // Crisp corner bracket accents
    const tick = Math.min(18, Math.min(width, height) * 0.08);
    ctx.strokeStyle = isLight
      ? 'rgba(15, 23, 42, 0.6)'
      : 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 1.5;
    const x1 = outerX - pad * 0.5;
    const y1 = outerY - pad * 0.5;
    const x2 = outerX + outerW + pad * 0.5;
    const y2 = outerY + outerH + pad * 0.5;
    const corners: Array<[number, number, number, number]> = [
      [x1, y1, 1, 1],
      [x2, y1, -1, 1],
      [x1, y2, 1, -1],
      [x2, y2, -1, -1],
    ];
    for (const [cx, cy, dx, dy] of corners) {
      ctx.beginPath();
      ctx.moveTo(cx, cy + dy * tick);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx + dx * tick, cy);
      ctx.stroke();
    }
  }

  // Optional subtle diagonal glass glare
  if (frame.glare) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(-width / 2, -height / 2, width, height, cornerRadius);
    ctx.clip();
    const glareGrad = ctx.createLinearGradient(
      -width / 2,
      -height / 2,
      width * 0.15,
      height * 0.15,
    );
    glareGrad.addColorStop(0, 'rgba(255, 255, 255, 0.14)');
    glareGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.03)');
    glareGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = glareGrad;
    ctx.fillRect(-width / 2, -height / 2, width, height);
    ctx.restore();
  }

  ctx.restore();
}
