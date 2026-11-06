/**
 * lib/trace/animation/color-math.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Linear interpolation for numbers and colors.
 *
 * Adapted from sagedesigns-os lib/motion/animation/color-math.ts for Nova Trace.
 */

export function lerpNumber(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function lerpColor(a: string, b: string, t: number): string {
  const parse = (c: string): [number, number, number] | null => {
    const m = c.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
    if (m) return [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])];
    const m2 = c.match(/^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/);
    if (m2)
      return [parseInt(m2[1], 16), parseInt(m2[2], 16), parseInt(m2[3], 16)];
    const named: Record<string, [number, number, number]> = {
      black: [0, 0, 0],
      white: [255, 255, 255],
      red: [255, 0, 0],
      green: [0, 128, 0],
      blue: [0, 0, 255],
      yellow: [255, 255, 0],
      cyan: [0, 255, 255],
      magenta: [255, 0, 255],
      transparent: [0, 0, 0],
    };
    return named[c.toLowerCase()] ?? null;
  };

  const ca = parse(a);
  const cb = parse(b);
  if (!ca || !cb) return t >= 0.5 ? b : a;

  const r = Math.round(ca[0] + (cb[0] - ca[0]) * t);
  const g = Math.round(ca[1] + (cb[1] - ca[1]) * t);
  const blue = Math.round(ca[2] + (cb[2] - ca[2]) * t);
  return `rgb(${r}, ${g}, ${blue})`;
}
