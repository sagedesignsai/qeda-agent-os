/**
 * lib/motion/chart-layout.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure layout math for the data-viz and graphics nodes. Shared by the React
 * renderer (initial paint) and the animated-prop applier (per-frame) so the
 * two cannot drift apart.
 */

export type BarLayout = { x: number; y: number; width: number; height: number };

export function layoutBars(
  values: number[],
  width: number,
  height: number,
  gap: number,
  progress: number,
): BarLayout[] {
  const n = Math.max(1, values.length);
  const barWidth = (width - gap * (n - 1)) / n;
  const max = Math.max(1, ...values.map((v) => (Number.isFinite(v) ? Math.abs(v) : 0)));
  return values.map((value, index) => {
    const v = Number.isFinite(value) ? value : 0;
    const h = (Math.abs(v) / max) * height * Math.max(0, Math.min(1, progress));
    const x = -width / 2 + barWidth / 2 + index * (barWidth + gap);
    const y = -height / 2 + h / 2;
    return { x, y, width: barWidth, height: h };
  });
}

export function layoutLinePoints(
  values: number[],
  width: number,
  height: number,
): Array<{ x: number; y: number }> {
  const n = Math.max(1, values.length);
  const step = width / Math.max(1, n - 1);
  const max = Math.max(1, ...values.map((v) => (Number.isFinite(v) ? Math.abs(v) : 0)));
  const min = Math.min(0, ...values.map((v) => (Number.isFinite(v) ? v : 0)));
  const range = Math.max(1, max - min);
  return values.map((value, index) => {
    const v = Number.isFinite(value) ? value : 0;
    const x = -width / 2 + index * step;
    const y = -height / 2 + ((v - min) / range) * height;
    return { x, y };
  });
}

export function ringTheta(progress: number, startAngle: number = -Math.PI / 2): number {
  return (Math.max(0, Math.min(1, progress)) * Math.PI * 2) + startAngle;
}

export function waveformHeights(
  values: number[],
  bars: number,
  height: number,
): number[] {
  const n = Math.max(1, bars);
  const out: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const source = values[i % Math.max(1, values.length)] ?? 0;
    const v = Number.isFinite(source) ? Math.abs(source) : 0;
    out.push(Math.min(height, v * height));
  }
  return out;
}