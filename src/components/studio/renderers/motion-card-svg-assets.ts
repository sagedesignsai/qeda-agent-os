/**
 * components/studio/renderers/motion-card-svg-assets.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * SVG asset generators for motion card branding elements.
 *
 * Creates reusable SVG shapes (logos, decorative frames, accent shapes) that can
 * be embedded in motion cards or used as rasterized background elements.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * SVG decorative frame with rounded corners and subtle glow.
 * @param x Left position
 * @param y Top position
 * @param width Frame width
 * @param height Frame height
 * @param cornerRadius Corner radius
 * @param strokeColor Stroke color
 * @param glowColor Optional glow color
 * @returns SVG element as string
 */
export function generateFrameSVG(
  x: number = 40,
  y: 40,
  width: number = 400,
  height: number = 300,
  cornerRadius: number = 12,
  strokeColor: string = '#06b6d4',
  glowColor?: string,
): string {
  const glowId = `glow-${Math.random().toString(36).substr(2, 9)}`;
  return `
    <svg width="${width + 100}" height="${height + 100}" viewBox="0 0 ${width + 100} ${height + 100}">
      ${glowColor ? `<defs><filter id="${glowId}"><feGaussianBlur stdDeviation="4" /></filter></defs>` : ''}
      ${glowColor ? `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${cornerRadius}" fill="none" stroke="${glowColor}" stroke-width="2" filter="url(#${glowId})" opacity="0.4" />` : ''}
      <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${cornerRadius}" fill="none" stroke="${strokeColor}" stroke-width="2" />
    </svg>
  `;
}

/**
 * SVG accent bar (horizontal progress indicator).
 * @param width Bar width
 * @param height Bar height
 * @param color Bar color
 * @param animated Whether to include animation
 * @returns SVG element as string
 */
export function generateProgressBarSVG(
  width: number = 300,
  height: number = 3,
  color: string = '#06b6d4',
  animated: boolean = false,
): string {
  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      ${animated ? `<defs><style>@keyframes slideIn { from { width: 0; } to { width: ${width}px; } }</style></defs>` : ''}
      <rect width="${width}" height="${height}" fill="${color}" ${animated ? 'style="animation: slideIn 0.8s ease-out;"' : ''} />
    </svg>
  `;
}

/**
 * SVG radial spotlight effect (for kinetic preset).
 * @param centerX Center X position
 * @param centerY Center Y position
 * @param radius Spotlight radius
 * @param color Glow color
 * @returns SVG element as string
 */
export function generateSpotlightSVG(
  centerX: number = 512,
  centerY: number = 384,
  radius: number = 400,
  color: string = '#a78bfa',
): string {
  const glowId = `spotlight-${Math.random().toString(36).substr(2, 9)}`;
  return `
    <svg width="1024" height="768" viewBox="0 0 1024 768">
      <defs>
        <radialGradient id="${glowId}">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.4" />
          <stop offset="100%" stop-color="${color}" stop-opacity="0" />
        </radialGradient>
      </defs>
      <circle cx="${centerX}" cy="${centerY}" r="${radius}" fill="url(#${glowId})" />
    </svg>
  `;
}

/**
 * SVG mesh gradient background (for gradient preset).
 * @param width Canvas width
 * @param height Canvas height
 * @param colors Array of 4 corner colors [topLeft, topRight, bottomLeft, bottomRight]
 * @returns SVG element as string
 */
export function generateMeshGradientSVG(
  width: number = 1024,
  height: number = 768,
  colors: [string, string, string, string] = ['#312e81', '#6d28d9', '#4c1d95', '#0f172a'],
): string {
  const gradId = `mesh-${Math.random().toString(36).substr(2, 9)}`;
  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <linearGradient id="${gradId}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${colors[0]}" />
          <stop offset="33%" stop-color="${colors[1]}" />
          <stop offset="66%" stop-color="${colors[2]}" />
          <stop offset="100%" stop-color="${colors[3]}" />
        </linearGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#${gradId})" />
    </svg>
  `;
}

/**
 * SVG cyber grid background (for cyber preset).
 * @param width Canvas width
 * @param height Canvas height
 * @param gridSize Grid cell size
 * @param color Grid color
 * @param opacity Grid opacity (0-1)
 * @returns SVG element as string
 */
export function generateCyberGridSVG(
  width: number = 1024,
  height: number = 768,
  gridSize: number = 32,
  color: string = '#06b6d4',
  opacity: number = 0.1,
): string {
  const colsCount = Math.ceil(width / gridSize);
  const rowsCount = Math.ceil(height / gridSize);

  let lines = '';

  // Vertical lines
  for (let i = 0; i <= colsCount; i++) {
    lines += `<line x1="${i * gridSize}" y1="0" x2="${i * gridSize}" y2="${height}" stroke="${color}" stroke-width="1" opacity="${opacity}" />`;
  }

  // Horizontal lines
  for (let i = 0; i <= rowsCount; i++) {
    lines += `<line x1="0" y1="${i * gridSize}" x2="${width}" y2="${i * gridSize}" stroke="${color}" stroke-width="1" opacity="${opacity}" />`;
  }

  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      ${lines}
    </svg>
  `;
}

/**
 * SVG badge/pill shape.
 * @param text Badge text
 * @param x Badge X position
 * @param y Badge Y position
 * @param bgColor Background color
 * @param strokeColor Border color
 * @param textColor Text color
 * @returns SVG element as string
 */
export function generateBadgeSVG(
  text: string,
  x: number = 100,
  y: number = 100,
  bgColor: string = 'rgba(99, 102, 241, 0.2)',
  strokeColor: string = 'rgba(129, 140, 248, 0.6)',
  textColor: string = '#818cf8',
): string {
  const padding = 16;
  const fontSize = 14;
  // Rough estimate: 8px per character
  const textWidth = text.length * 8;
  const width = textWidth + padding * 2;
  const height = fontSize + 12;
  const radius = height / 2;

  return `
    <svg width="${width + 20}" height="${height + 20}" viewBox="0 0 ${width + 20} ${height + 20}">
      <rect x="10" y="10" width="${width}" height="${height}" rx="${radius}" fill="${bgColor}" stroke="${strokeColor}" stroke-width="1.5" />
      <text x="${width / 2 + 10}" y="${height / 2 + 15}" font-size="${fontSize}" font-weight="700" text-anchor="middle" fill="${textColor}" font-family="Inter, sans-serif">
        ${text.toUpperCase()}
      </text>
    </svg>
  `;
}

/**
 * SVG accent corner bracket.
 * @param x Top-left X
 * @param y Top-left Y
 * @param size Bracket size
 * @param color Bracket color
 * @param position Corner position: 'tl', 'tr', 'bl', 'br'
 * @returns SVG element as string
 */
export function generateCornerBracketSVG(
  x: number = 20,
  y: number = 20,
  size: number = 30,
  color: string = '#06b6d4',
  position: 'tl' | 'tr' | 'bl' | 'br' = 'tl',
): string {
  let pathData = '';
  const thickness = 2;

  switch (position) {
    case 'tl': // Top-left
      pathData = `M ${x} ${y + size} L ${x} ${y} L ${x + size} ${y}`;
      break;
    case 'tr': // Top-right
      pathData = `M ${x - size} ${y} L ${x} ${y} L ${x} ${y + size}`;
      break;
    case 'bl': // Bottom-left
      pathData = `M ${x} ${y - size} L ${x} ${y} L ${x + size} ${y}`;
      break;
    case 'br': // Bottom-right
      pathData = `M ${x - size} ${y} L ${x} ${y} L ${x} ${y - size}`;
      break;
  }

  return `
    <svg width="100" height="100" viewBox="0 0 100 100">
      <path d="${pathData}" stroke="${color}" stroke-width="${thickness}" fill="none" stroke-linecap="round" />
    </svg>
  `;
}
