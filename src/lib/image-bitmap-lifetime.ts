/**
 * lib/image-bitmap-lifetime.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Liveness registry for `ImageBitmap` objects shared between a producer and a
 * canvas painter.
 *
 * WHY THIS EXISTS
 * ───────────────
 * The timeline filmstrip extracts keyframes as `ImageBitmap`s and hands them to
 * the viewport, which draws them with `drawImage`. Those bitmaps are manually
 * managed: someone calls `bitmap.close()`, and after that the object is still
 * perfectly valid JavaScript — it just has no image data behind it any more.
 *
 * `drawImage` on a closed bitmap throws `InvalidStateError: … image source is
 * detached`, and it throws *while painting*, which aborts the rest of that
 * frame. Worse, the bitmap map reaches the painter through React state while
 * the cleanup that closes the bitmaps is a separate effect pass, so "is this
 * bitmap still open?" cannot be answered from either side alone.
 *
 * So ownership is recorded at the moment of `close()` — the only place the app
 * knows for certain a bitmap is dead — and the painter consults it before
 * trusting an object handed to it. A `WeakSet` is used deliberately: it lets
 * GC reclaim the bitmap once neither the map nor a pending frame references it,
 * which is the whole point of releasing them.
 *
 * This registry is a safety net, not permission to leak. The producer still
 * closes what it no longer needs; this makes a stale reference harmless instead
 * of fatal.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Bitmaps that have been closed by the app. Never strongly held. */
const closed = new WeakSet<ImageBitmap>();

/**
 * Record that `bitmap` has been closed and must no longer be drawn.
 *
 * Safe to call more than once, and safe to call on a bitmap the caller never
 * owned — the registry only records, it does not dispose.
 */
export function markBitmapClosed(bitmap: ImageBitmap): void {
  closed.add(bitmap);
}

/** True when `bitmap` was closed and `drawImage` would throw on it. */
export function isBitmapClosed(bitmap: ImageBitmap): boolean {
  return closed.has(bitmap);
}

/**
 * Close `bitmap` and record it as dead.
 *
 * Use this instead of `bitmap.close()` anywhere in the app so the registry
 * cannot drift from what was actually released.
 */
export function closeBitmap(bitmap: ImageBitmap): void {
  markBitmapClosed(bitmap);
  bitmap.close();
}

/**
 * Draw `bitmap`, tolerating a bitmap that was closed after the caller obtained
 * it. Returns whether anything was painted.
 *
 * The throw is caught rather than merely pre-checked because a bitmap can also be
 * released behind the app's back — a revoked blob URL, or the browser reclaiming
 * an image the document no longer needs. A canvas painter must not be taken down
 * by a single stale frame, so an unexpected failure degrades to "draw nothing"
 * and is recorded so the next call skips it without throwing again.
 */
export function drawBitmapIfLive(
  ctx: CanvasRenderingContext2D,
  bitmap: ImageBitmap,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
): boolean {
  if (isBitmapClosed(bitmap)) return false;
  try {
    ctx.drawImage(bitmap, sx, sy, sw, sh, dx, dy, dw, dh);
    return true;
  } catch (error) {
    if (error instanceof Error && error.name === 'InvalidStateError') {
      markBitmapClosed(bitmap);
      return false;
    }
    throw error;
  }
}
