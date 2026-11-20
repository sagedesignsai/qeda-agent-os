/**
 * lib/studio/render/export-profile.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Performance profiling helpers for Studio Showcase video export.
 *
 * ENABLING PROFILING
 * ──────────────────
 * Set one of:
 *   - Environment variable: STUDIO_EXPORT_PROFILE=1
 *   - Global flag: window.__STUDIO_EXPORT_PROFILE__ = true (browser console)
 *
 * When enabled, export-renderer.ts logs detailed timing stats to the browser
 * console after rendering completes. The profile captures:
 *   - Seek time per frame (video decoder latency)
 *   - Draw time per frame (canvas composition)
 *   - Encode time per frame (WebCodecs VP9 encoder)
 *   - Drain time per frame (WebM mux)
 *
 * INTERPRETING RESULTS
 * ────────────────────
 * The profile logs seek, draw, encode, and drain stats with:
 *   - total: Sum of all frame operations in milliseconds
 *   - p50: Median frame latency (50th percentile)
 *   - p95: Worst-case frame latency (95th percentile)
 *   - pct: Percentage of total export time
 *
 * TYPICAL RESULTS (1080p, 30 fps, 30-second export)
 * ─────────────────────────────────────────────────
 * Bottleneck ranking (by % of total time):
 *   1. Seek (35–50%): Video decoder seeking to frame timestamp
 *   2. Draw (15–30%): Canvas composition (effects, captions, overlays)
 *   3. Encode (10–20%): VP9 encoder (hardware-accelerated when available)
 *   4. Drain (5–10%): WebM muxer flush
 *
 * VIDEO DECODER BOTTLENECK
 * ────────────────────────
 * Seeking is typically the dominant cost. Strategies to reduce:
 *   - Reduce seek distance: Dead-air cuts are rendered at a single frame
 *   - Key frame alignment: Some codecs have large GOP structures
 *   - Hardware acceleration: Use platform video decoder (usually automatic)
 *
 * CANVAS DRAWING OPTIMIZATION
 * ────────────────────────────
 * If draw % is high, check:
 *   - Number of effects applied (spotlight, vignette, grain are GPU-friendly)
 *   - Caption count (many captions = more text measurement/draw calls)
 *   - Overlay complexity (PiP overlays each require a draw pass)
 *   - WebGL rasterizer (future optimization for GPU acceleration)
 *
 * ENCODER OPTIMIZATION
 * ────────────────────
 * If encode % is high:
 *   - Hardware VP9 encoding is usually 2–3x faster than software
 *   - Reduce resolution for faster encoding (e.g., 720p instead of 1080p)
 *   - Use a simpler codec (H.264 via ffmpeg transcode)
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Enable export profiling programmatically.
 * This sets the global flag so the next export will collect timing stats.
 *
 * Usage (in browser console):
 *   enableExportProfile();
 *   // Run an export
 */
export function enableExportProfile(): void {
  if (typeof window !== 'undefined') {
    (window as any).__STUDIO_EXPORT_PROFILE__ = true;
    console.log('[studio-export-profile] Enabled. Next export will log timing stats.');
  }
  if (typeof process !== 'undefined' && process.env) {
    process.env.STUDIO_EXPORT_PROFILE = '1';
  }
}

/**
 * Disable export profiling.
 */
export function disableExportProfile(): void {
  if (typeof window !== 'undefined') {
    (window as any).__STUDIO_EXPORT_PROFILE__ = false;
  }
  if (typeof process !== 'undefined' && process.env) {
    delete process.env.STUDIO_EXPORT_PROFILE;
  }
}

/**
 * Check if export profiling is enabled.
 */
export function isExportProfileEnabled(): boolean {
  if (typeof window !== 'undefined' && (window as any).__STUDIO_EXPORT_PROFILE__) {
    return true;
  }
  if (typeof process !== 'undefined' && process.env?.STUDIO_EXPORT_PROFILE) {
    return true;
  }
  return false;
}
