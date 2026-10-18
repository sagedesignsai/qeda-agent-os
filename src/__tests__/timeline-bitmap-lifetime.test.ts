/**
 * __tests__/timeline-bitmap-lifetime.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The filmstrip hands `ImageBitmap`s from `useTimelineMedia` to the timeline
 * canvas, across a React state boundary, while a separate effect pass releases
 * them with `close()`. A closed bitmap is still a valid JavaScript object, so
 * nothing about the reference looks wrong — but `drawImage` throws
 * `InvalidStateError: … image source is detached`, from inside the paint
 * routine, which aborts the remainder of that frame.
 *
 * These tests pin the two halves of the fix:
 *   1. Closing is recorded, so a painter can recognise a dead bitmap instead of
 *      discovering it by throwing.
 *   2. Drawing a dead bitmap is a no-op rather than a thrown error, and only an
 *      `InvalidStateError` is swallowed — an unrelated fault still propagates
 *      rather than being silently misread as "no thumbnail".
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  closeBitmap,
  drawBitmapIfLive,
  isBitmapClosed,
  markBitmapClosed,
} from '../lib/image-bitmap-lifetime';

/** Minimal stand-in: only the fields the painter and registry actually touch. */
function fakeBitmap(width = 32, height = 18): ImageBitmap {
  return { width, height } as ImageBitmap;
}

const detachedError = () => {
  const error = new Error(
    'Failed to execute drawImage: image source is detached',
  );
  error.name = 'InvalidStateError';
  return error;
};

describe('ImageBitmap liveness registry', () => {
  it('reports a bitmap as live until it is closed', () => {
    const bitmap = fakeBitmap();

    expect(isBitmapClosed(bitmap)).toBe(false);

    closeBitmap(bitmap);

    expect(isBitmapClosed(bitmap)).toBe(true);
  });

  it('treats marking as idempotent', () => {
    const bitmap = fakeBitmap();

    markBitmapClosed(bitmap);
    markBitmapClosed(bitmap);

    expect(isBitmapClosed(bitmap)).toBe(true);
  });

  it('does not conflate distinct bitmaps', () => {
    const kept = fakeBitmap();
    const released = fakeBitmap();

    closeBitmap(released);

    expect(isBitmapClosed(kept)).toBe(false);
    expect(isBitmapClosed(released)).toBe(true);
  });
});

describe('drawBitmapIfLive', () => {
  it('draws a live bitmap and forwards the source rectangle', () => {
    const bitmap = fakeBitmap(64, 36);
    const drawImage = jest.fn();
    const ctx = { drawImage } as unknown as CanvasRenderingContext2D;

    const drawn = drawBitmapIfLive(ctx, bitmap, 0, 0, 64, 36, 10, 20, 64, 40);

    expect(drawn).toBe(true);
    expect(drawImage).toHaveBeenCalledWith(
      bitmap,
      0,
      0,
      64,
      36,
      10,
      20,
      64,
      40,
    );
  });

  it('never calls drawImage for a bitmap that was already closed', () => {
    const bitmap = fakeBitmap();
    const drawImage = jest.fn();
    const ctx = { drawImage } as unknown as CanvasRenderingContext2D;

    closeBitmap(bitmap);

    expect(drawBitmapIfLive(ctx, bitmap, 0, 0, 32, 18, 0, 0, 32, 18)).toBe(
      false,
    );
    expect(drawImage).not.toHaveBeenCalled();
  });

  it('survives a bitmap released behind the registry’s back', () => {
    // The registry is a safety net, not the only thing that can release a
    // bitmap: a revoked blob URL or browser reclamation closes it silently. That
    // still must not take down the paint routine.
    const bitmap = fakeBitmap();
    const ctx = {
      drawImage: jest.fn(() => {
        throw detachedError();
      }),
    } as unknown as CanvasRenderingContext2D;

    expect(drawBitmapIfLive(ctx, bitmap, 0, 0, 32, 18, 0, 0, 32, 18)).toBe(
      false,
    );
    // Recorded on first failure, so the next tile skips it without throwing.
    expect(isBitmapClosed(bitmap)).toBe(true);
    expect(drawBitmapIfLive(ctx, bitmap, 0, 0, 32, 18, 0, 0, 32, 18)).toBe(
      false,
    );
  });

  it('propagates errors that are not detachment', () => {
    const bitmap = fakeBitmap();
    const ctx = {
      drawImage: jest.fn(() => {
        throw new TypeError('drawImage received a bad argument');
      }),
    } as unknown as CanvasRenderingContext2D;

    expect(() =>
      drawBitmapIfLive(ctx, bitmap, 0, 0, 32, 18, 0, 0, 32, 18),
    ).toThrow(TypeError);
    expect(isBitmapClosed(bitmap)).toBe(false);
  });
});
