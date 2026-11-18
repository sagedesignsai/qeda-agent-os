/**
 * __tests__/capture-targets.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The pure geometry behind window-scoped recording: DIP → physical pixels,
 * clamping a window to the display it lives on, and expressing that window as
 * a normalized crop for the platforms whose grabbers cannot crop themselves.
 *
 * These are the parts that fail silently on someone else's monitor — a 2x
 * display recording a quarter of the window, or a crop that points at the
 * wallpaper — so they are tested without Electron.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  clampRectToBounds,
  displayContaining,
  normalizeVideoCrop,
  toCaptureGeometry,
  type CaptureDisplay,
} from '../main/capture-targets';

const display = (overrides: Partial<CaptureDisplay> = {}): CaptureDisplay => ({
  id: '1',
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  scaleFactor: 1,
  primary: true,
  ...overrides,
});

describe('toCaptureGeometry', () => {
  it('converts DIP to physical pixels on a HiDPI display', () => {
    expect(
      toCaptureGeometry({ x: 100, y: 50, width: 800, height: 600 }, 2, 30),
    ).toEqual({ x: 200, y: 100, width: 1600, height: 1200, fps: 30 });
  });

  it('rounds odd window sizes down to an even pixel count for yuv420p', () => {
    const geometry = toCaptureGeometry(
      { x: 401, y: 201, width: 801, height: 601 },
      1,
      30,
    );
    expect(geometry.width % 2).toBe(0);
    expect(geometry.height % 2).toBe(0);
    expect(geometry).toMatchObject({ x: 401, y: 201, width: 800, height: 600 });
  });

  it('never lets rounding collapse a region to zero', () => {
    const geometry = toCaptureGeometry(
      { x: 0.2, y: 0.2, width: 0.4, height: 0.4 },
      1,
      30,
    );
    expect(geometry.width).toBeGreaterThanOrEqual(2);
    expect(geometry.height).toBeGreaterThanOrEqual(2);
  });
});

describe('clampRectToBounds', () => {
  it('intersects a window that hangs off the screen edge', () => {
    expect(
      clampRectToBounds(
        { x: 1800, y: -40, width: 400, height: 300 },
        { x: 0, y: 0, width: 1920, height: 1080 },
      ),
    ).toEqual({ x: 1800, y: 0, width: 120, height: 260 });
  });

  it('reports an off-screen window instead of inventing a region', () => {
    expect(
      clampRectToBounds(
        { x: 5000, y: 5000, width: 400, height: 300 },
        { x: 0, y: 0, width: 1920, height: 1080 },
      ),
    ).toBeNull();
  });
});

describe('displayContaining', () => {
  const left = display({
    id: '1',
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    primary: true,
  });
  const right = display({
    id: '2',
    bounds: { x: 1920, y: 0, width: 1920, height: 1080 },
    primary: false,
  });

  it('picks the display under the window center, not the primary one', () => {
    expect(
      displayContaining({ x: 2500, y: 200, width: 800, height: 600 }, [
        left,
        right,
      ])?.id,
    ).toBe('2');
  });

  it('falls back to null when the window is on no display', () => {
    expect(
      displayContaining({ x: 9000, y: 9000, width: 400, height: 300 }, [
        left,
        right,
      ]),
    ).toBeNull();
  });
});

describe('normalizeVideoCrop', () => {
  it('expresses a window as a crop of its display', () => {
    expect(
      normalizeVideoCrop(
        { x: 480, y: 270, width: 960, height: 540 },
        { x: 0, y: 0, width: 1920, height: 1080 },
      ),
    ).toEqual({ x: 0.25, y: 0.25, width: 0.5, height: 0.5 });
  });

  it('returns undefined when the region already is the whole display', () => {
    expect(
      normalizeVideoCrop(
        { x: 0, y: 0, width: 1920, height: 1080 },
        { x: 0, y: 0, width: 1920, height: 1080 },
      ),
    ).toBeUndefined();
  });
});
