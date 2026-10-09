/**
 * lib/studio/render/background.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Paints the take wallpaper — a CSS `linear-gradient(...)` or a solid colour —
 * onto the canvas, plus the signature ambient glow.
 *
 * Canvas 2D has no CSS gradient parser, so the string is parsed here. The
 * result is cacheable by (string, width, height); callers that render at 60fps
 * should keep the returned value rather than reparsing per frame.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type StudioBackgroundPaint = string | CanvasGradient;

/** Parse `linear-gradient(<angle|to-dir>, stops…)` into a CanvasGradient. */
export function parseLinearGradient(
  ctx: CanvasRenderingContext2D,
  background: string,
  width: number,
  height: number,
): CanvasGradient {
  const match = background.match(/linear-gradient\s*\((.+)\)/i);
  if (!match) {
    const fallback = ctx.createLinearGradient(0, 0, width, height);
    fallback.addColorStop(0, '#111827');
    fallback.addColorStop(1, '#030712');
    return fallback;
  }

  const parts = splitTopLevel(match[1]);

  let angleDeg = 135;
  let stopParts = parts;
  if (parts.length > 0 && /deg$/i.test(parts[0])) {
    angleDeg = parseFloat(parts[0]) || 135;
    stopParts = parts.slice(1);
  } else if (parts.length > 0 && /^to\s+/i.test(parts[0])) {
    angleDeg = angleFromDirection(parts[0]);
    stopParts = parts.slice(1);
  }

  const rad = ((angleDeg - 90) * Math.PI) / 180;
  const cx = width / 2;
  const cy = height / 2;
  const length =
    Math.abs(width * Math.cos(rad)) + Math.abs(height * Math.sin(rad));
  const half = length / 2;
  const grad = ctx.createLinearGradient(
    cx - Math.cos(rad) * half,
    cy - Math.sin(rad) * half,
    cx + Math.cos(rad) * half,
    cy + Math.sin(rad) * half,
  );

  const stops = stopParts.map((part) => {
    const pctMatch = part.match(/(.*?)\s+(\d+(?:\.\d+)?)%/);
    if (pctMatch) {
      return {
        color: pctMatch[1].trim(),
        offset: Math.min(1, Math.max(0, parseFloat(pctMatch[2]) / 100)),
      };
    }
    return { color: part.trim(), offset: null as number | null };
  });

  if (stops.length === 0) {
    grad.addColorStop(0, '#111827');
    grad.addColorStop(1, '#030712');
    return grad;
  }

  stops.forEach((stop, index) => {
    const offset =
      stop.offset !== null
        ? stop.offset
        : stops.length === 1
          ? 0
          : index / (stops.length - 1);
    try {
      grad.addColorStop(offset, stop.color);
    } catch {
      // An invalid colour stop must not abort the whole frame.
    }
  });

  return grad;
}

/** Split a comma list without breaking nested `rgb(...)`/`color-mix(...)`. */
function splitTopLevel(input: string): string[] {
  const parts: string[] = [];
  let current = '';
  let depth = 0;
  for (const char of input) {
    if (char === '(') depth += 1;
    else if (char === ')') depth -= 1;
    if (char === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function angleFromDirection(direction: string): number {
  const dir = direction.toLowerCase();
  if (dir.includes('bottom') && dir.includes('right')) return 135;
  if (dir.includes('bottom') && dir.includes('left')) return 225;
  if (dir.includes('top') && dir.includes('right')) return 45;
  if (dir.includes('top') && dir.includes('left')) return 315;
  if (dir.includes('bottom')) return 180;
  if (dir.includes('right')) return 90;
  if (dir.includes('top')) return 0;
  if (dir.includes('left')) return 270;
  return 135;
}

export function resolveBackgroundPaint(
  ctx: CanvasRenderingContext2D,
  background: string,
  width: number,
  height: number,
): StudioBackgroundPaint {
  if (background && background.includes('gradient')) {
    return parseLinearGradient(ctx, background, width, height);
  }
  return background || '#090a0f';
}

/** Fill the full canvas with the wallpaper, then dust the ambient glow. */
export function drawStudioBackground(
  ctx: CanvasRenderingContext2D,
  {
    width,
    height,
    background,
    glowGradient,
  }: {
    width: number;
    height: number;
    background: string;
    /** Pre-built radial glow gradient; callers cache it per (width, height). */
    glowGradient?: CanvasGradient | null;
  },
): void {
  ctx.fillStyle = resolveBackgroundPaint(ctx, background, width, height);
  ctx.fillRect(0, 0, width, height);

  const glow =
    glowGradient ?? buildAmbientGlow(ctx, width, height);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);
}

export function buildAmbientGlow(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): CanvasGradient {
  const glow = ctx.createRadialGradient(
    width * 0.5,
    height * 0.5,
    100,
    width * 0.5,
    height * 0.5,
    width * 0.65,
  );
  glow.addColorStop(0, 'rgba(99, 102, 241, 0.18)');
  glow.addColorStop(1, 'rgba(99, 102, 241, 0)');
  return glow;
}
