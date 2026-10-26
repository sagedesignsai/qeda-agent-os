/**
 * lib/studio/render/export-renderer.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Frame-by-frame offline composition renderer for Studio Showcase video export.
 *
 * APPROACH — WHY NOT captureStream + MediaRecorder
 * ─────────────────────────────────────────────────
 * The old implementation used `canvas.captureStream(30)` with `MediaRecorder`.
 * That approach is fundamentally real-time: the browser captures frames on its
 * own wall-clock schedule. Under heavy CPU load the composition loop falls
 * behind real time, the video source buffers, `readyState` drops, and the
 * recorder timestamps frames based on wall time — producing a stuttery,
 * variable-frame-rate output that looks janky on playback.
 *
 * This renderer is fully *offline* and *deterministic*:
 *   1. For each frame at `t = n / fps` we seek `video.currentTime` to that
 *      exact timestamp and wait for the `seeked` event.
 *   2. We draw the full composition (background, window, camera, effects,
 *      captions, motion cards) at that precise time coordinate.
 *   3. The drawn canvas pixels are captured via `VideoFrame` (WebCodecs API)
 *      and encoded with `VideoEncoder` (VP9, hardware-accelerated when
 *      available).
 *   4. Encoded chunks are collected in a `WebMMuxer` which streams them IPC
 *      as base64 chunks to `studio:save-rendered-chunk` — the same endpoint
 *      the old renderer used, so no backend changes are needed.
 *   5. The main process hands the resulting `rendered.webm` to ffmpeg for the
 *      final MP4 / GIF transcode, where audio is merged from the original
 *      source recording.
 *
 * CAMERA EASING — FRAME-RATE INDEPENDENCE
 * ─────────────────────────────────────────
 * `stepCamera` uses an exponential-decay smoothing factor that is calibrated
 * for 60 fps preview. At export (30 fps) the same raw factor would produce
 * different-looking motion. We convert it to a frame-rate-independent lerp:
 *   alpha_at_fps = 1 − (1 − alpha_60fps) ^ (60 / fps)
 * so the exported video matches exactly what the user previewed.
 *
 * Streams rendered WebM chunks directly via IPC (`studio:save-rendered-chunk`)
 * so the main process can hand the file to ffmpeg for the final transcode.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { safeDurationMs } from '../styling';
import { studioCanvasDims } from './geometry';
import {
  computeCameraTarget,
  IDLE_CAMERA,
  stepCamera,
  type StudioCameraState,
} from './camera';
import { drawStudioFrame, type StudioComposeInput } from './compose';
import { studioOverlayMediaUrl, type StudioOverlayAsset } from './overlays';
import { drawStudioWindowChrome } from './frame';
import {
  drawDeviceFrameHeader,
  drawDeviceFrameFooter,
} from '@/components/studio/renderers/device-frames';
import { drawMotionCard } from '@/components/studio/renderers/motion-cards';
import type { StudioTake } from '../types';
import { WebMMuxer } from './webm-muxer';

export interface RenderComposedVideoOptions {
  onProgress?: (progressRatio: number, statusText: string) => void;
  signal?: AbortSignal;
  /** Export frame rate. Defaults to 30. */
  fps?: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 32768;
  for (let i = 0; i < bytes.byteLength; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/** Wait for the video element to finish seeking to a specific time. */
function seekTo(
  video: HTMLVideoElement,
  timeSeconds: number,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Export cancelled'));
      return;
    }
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
      resolve();
    };
    const onError = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
      reject(new Error(`Video seek failed at ${timeSeconds.toFixed(3)}s`));
    };
    video.addEventListener('seeked', onSeeked, { once: true });
    video.addEventListener('error', onError, { once: true });
    video.currentTime = timeSeconds;
  });
}

/**
 * Convert a preview-calibrated 60fps smoothing factor to the equivalent factor
 * for a different frame rate, preserving the apparent motion curve.
 */
function adaptSmoothing(alpha60fps: number, targetFps: number): number {
  return 1 - Math.pow(1 - alpha60fps, 60 / targetFps);
}

/** Easing multipliers per camera mode — mirrored from camera.ts. */
const CAMERA_SMOOTHING_60FPS: Record<string, number> = {
  snappy: 0.22,
  balanced: 0.12,
  cinematic: 0.07,
};

/**
 * Detect the best available VP9/VP8 VideoEncoder codec string.
 * WebCodecs uses codec strings, not mime types.
 */
async function detectVideoEncoderCodec(
  width: number,
  height: number,
): Promise<{ codec: string; muxerCodec: 'vp8' | 'vp9' }> {
  const candidates: Array<{ codec: string; muxerCodec: 'vp8' | 'vp9' }> = [
    { codec: 'vp09.00.10.08', muxerCodec: 'vp9' }, // VP9 Profile 0
    { codec: 'vp8', muxerCodec: 'vp8' },
  ];
  for (const candidate of candidates) {
    try {
      const support = await VideoEncoder.isConfigSupported({
        codec: candidate.codec,
        width,
        height,
        bitrate: 16_000_000,
        framerate: 30,
      });
      if (support.supported) return candidate;
    } catch {
      // Try next
    }
  }
  // Fallback
  return { codec: 'vp8', muxerCodec: 'vp8' };
}

// ── Main export function ──────────────────────────────────────────────────────

/**
 * Renders a complete Studio showcase take with all effects, zooms, captions,
 * styling, device frames, and motion cards, streaming chunks to the main process.
 *
 * Uses WebCodecs `VideoEncoder` for frame-by-frame deterministic encoding —
 * no real-time playback, no dropped frames, no jank.
 */
export async function renderComposedStudioVideo(
  take: StudioTake,
  options?: RenderComposedVideoOptions,
): Promise<{ ok: boolean; durationMs: number }> {
  if (options?.signal?.aborted) {
    throw new Error('Export cancelled');
  }

  const fps = Math.max(1, Math.round(options?.fps ?? 30));

  options?.onProgress?.(0.02, 'Initializing showcase render canvas...');

  // 1. Canvas setup
  const dims = studioCanvasDims(take.styling.aspectRatio);
  const canvas = document.createElement('canvas');
  canvas.width = dims.width;
  canvas.height = dims.height;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) {
    throw new Error('Could not create 2D canvas context for showcase export');
  }

  // 2. Load source video
  let video: HTMLVideoElement | null = null;
  let totalDurationMs = 0;

  if (take.videoPath) {
    options?.onProgress?.(0.05, 'Loading source video media...');
    video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.preload = 'auto';
    video.muted = true; // Muted for frame-seek; audio comes from source file via ffmpeg
    video.src = `qeda-media://studio/${encodeURIComponent(take.id)}`;

    await new Promise<void>((resolve, reject) => {
      const onLoaded = () => {
        video!.removeEventListener('loadedmetadata', onLoaded);
        video!.removeEventListener('error', onError);
        resolve();
      };
      const onError = () => {
        video!.removeEventListener('loadedmetadata', onLoaded);
        video!.removeEventListener('error', onError);
        reject(new Error('Failed to load showcase video source for export'));
      };
      video!.addEventListener('loadedmetadata', onLoaded);
      video!.addEventListener('error', onError);
    });

    const rawDuration =
      video && Number.isFinite(video.duration) ? video.duration * 1000 : 0;
    totalDurationMs = safeDurationMs(rawDuration, take.durationMs);
  } else {
    totalDurationMs = safeDurationMs(0, take.durationMs);
  }

  if (totalDurationMs <= 0) {
    throw new Error('Showcase take has zero duration');
  }

  // 3. Preload overlay assets
  options?.onProgress?.(0.08, 'Preloading overlays and motion assets...');
  const overlayAssets = new Map<string, StudioOverlayAsset>();

  for (const overlay of take.overlays ?? []) {
    const url = studioOverlayMediaUrl(overlay.id);
    if (overlay.kind === 'image') {
      await new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = () => {
          if (img.naturalWidth > 0) {
            overlayAssets.set(overlay.id, {
              element: img,
              width: img.naturalWidth,
              height: img.naturalHeight,
            });
          }
          resolve();
        };
        img.onerror = () => resolve();
        img.src = url;
      });
    } else {
      // Video overlays: load metadata so dimensions are known; we'll seek them
      // in sync with the main video during the frame loop.
      await new Promise<void>((resolve) => {
        const ovVid = document.createElement('video');
        ovVid.muted = true;
        ovVid.preload = 'auto';
        ovVid.src = url;
        ovVid.onloadedmetadata = () => {
          if (ovVid.videoWidth > 0) {
            overlayAssets.set(overlay.id, {
              element: ovVid,
              width: ovVid.videoWidth,
              height: ovVid.videoHeight,
            });
          }
          resolve();
        };
        ovVid.onerror = () => resolve();
      });
    }
  }

  // 4. Detect VideoEncoder codec
  options?.onProgress?.(0.1, 'Initializing video encoder...');
  const { codec: encoderCodec, muxerCodec } = await detectVideoEncoderCodec(
    dims.width,
    dims.height,
  );

  // 5. Setup WebM muxer + IPC streaming
  const ipcPromises: Promise<unknown>[] = [];
  let isFirstChunk = true;

  const muxer = new WebMMuxer({
    width: dims.width,
    height: dims.height,
    codec: muxerCodec,
    fps,
    onChunk: (chunk) => {
      const currentIsFirst = isFirstChunk;
      isFirstChunk = false;
      const p = (async () => {
        const chunkBase64 = arrayBufferToBase64(
          chunk.data.buffer.slice(
            chunk.data.byteOffset,
            chunk.data.byteOffset + chunk.data.byteLength,
          ) as ArrayBuffer,
        );
        await window.electron.ipc.invoke('studio:save-rendered-chunk', {
          takeId: take.id,
          chunkBase64,
          isFirst: currentIsFirst,
          isLast: false,
        });
      })();
      ipcPromises.push(p);
    },
  });

  // 6. Setup VideoEncoder
  const encodedFrames: Array<{
    data: Uint8Array;
    timestampMs: number;
    isKeyframe: boolean;
  }> = [];
  let encoderError: Error | null = null;
  let encoderFlushResolve: (() => void) | null = null;
  let pendingEncodes = 0;

  const encoder = new VideoEncoder({
    output: (chunk) => {
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      const timestampMs = chunk.timestamp / 1000; // μs → ms
      encodedFrames.push({
        data,
        timestampMs,
        isKeyframe: chunk.type === 'key',
      });
      pendingEncodes--;
      if (pendingEncodes === 0 && encoderFlushResolve) {
        encoderFlushResolve();
        encoderFlushResolve = null;
      }
    },
    error: (err) => {
      encoderError = err;
    },
  });

  encoder.configure({
    codec: encoderCodec,
    width: dims.width,
    height: dims.height,
    bitrate: 16_000_000,
    framerate: fps,
    latencyMode: 'quality',
  });

  // 7. Build pre-computed cut list for dead-air skipping
  const cuts = [...(take.cuts ?? [])].sort((a, b) => a.startMs - b.startMs);

  /**
   * Advance timeMs past any pruned cut segment it falls inside.
   * Returns the adjusted time.
   */
  function skipCuts(timeMs: number): number {
    for (const cut of cuts) {
      if (timeMs >= cut.startMs && timeMs < cut.endMs) {
        return cut.endMs;
      }
    }
    return timeMs;
  }

  // 8. Pre-simulate camera state from t=0 to handle history-dependent easing.
  //    We run the camera forward at the export fps without rendering anything,
  //    so that by the time we start drawing we have a warmed-up camera state.
  //    (The camera is a low-pass filter — it needs history to be correct.)
  const easingKey = take.styling.cameraEasing ?? 'balanced';
  const alpha60 = CAMERA_SMOOTHING_60FPS[easingKey] ?? 0.12;
  const alphaAtFps = adaptSmoothing(alpha60, fps);

  // We use a patched stepCamera that accepts a custom alpha instead of easing name.
  function stepCameraWithAlpha(
    current: StudioCameraState,
    target: StudioCameraState,
    alpha: number,
  ): StudioCameraState {
    return {
      scale: current.scale + (target.scale - current.scale) * alpha,
      panX: current.panX + (target.panX - current.panX) * alpha,
      panY: current.panY + (target.panY - current.panY) * alpha,
    };
  }

  let camera: StudioCameraState = { ...IDLE_CAMERA };

  // Radial glow gradient (created once, used each frame)
  const radialGlow = ctx.createRadialGradient(
    dims.width * 0.5,
    dims.height * 0.5,
    100,
    dims.width * 0.5,
    dims.height * 0.5,
    dims.width * 0.65,
  );
  radialGlow.addColorStop(0, 'rgba(99, 102, 241, 0.18)');
  radialGlow.addColorStop(1, 'rgba(99, 102, 241, 0)');

  // 9. Frame-by-frame rendering loop
  const totalFrames = Math.ceil((totalDurationMs / 1000) * fps);
  const frameIntervalMs = 1000 / fps;
  const keyframeInterval = fps * 2; // Keyframe every 2 seconds

  // Batch size: flush encoder every N frames to avoid runaway memory usage
  const ENCODE_BATCH = 10;

  options?.onProgress?.(0.12, 'Starting frame-by-frame export...');

  for (let frameIndex = 0; frameIndex <= totalFrames; frameIndex++) {
    if (options?.signal?.aborted) {
      encoder.close();
      throw new Error('Export cancelled by user');
    }
    if (encoderError) {
      encoder.close();
      throw encoderError;
    }

    let currentTimeMs = frameIndex * frameIntervalMs;
    currentTimeMs = skipCuts(currentTimeMs);

    // Seek video and overlay videos to this exact frame
    if (video) {
      const seekSec = Math.min(currentTimeMs / 1000, video.duration);
      await seekTo(video, seekSec, options?.signal);
    }

    // Seek overlay videos (they loop, so use modulo of their duration)
    for (const asset of overlayAssets.values()) {
      if (asset.element instanceof HTMLVideoElement) {
        const ovVid = asset.element;
        if (ovVid.duration > 0) {
          const seekSec = (currentTimeMs / 1000) % ovVid.duration;
          // Best-effort: we don't await overlay seeks to keep the loop fast
          ovVid.currentTime = seekSec;
        }
      }
    }

    // Update camera state for this frame
    const target = take.videoCrop
      ? { ...IDLE_CAMERA }
      : computeCameraTarget({
          zooms: take.zooms ?? [],
          timeMs: currentTimeMs,
          zoomIntensity: take.styling.zoomIntensity,
        });
    camera = stepCameraWithAlpha(camera, target, alphaAtFps);

    // Draw the full composition
    const input: StudioComposeInput = {
      width: dims.width,
      height: dims.height,
      styling: take.styling,
      timeMs: currentTimeMs,
      video: video || null,
      videoReady: Boolean(video && video.readyState >= 2),
      camera,
      effects: take.effects ?? [],
      captions: take.captions ?? [],
      overlays: take.overlays ?? [],
      overlayAssets,
      videoCrop: take.videoCrop,
      glowGradient: radialGlow,
      drawWindowChrome: (chromeCtx, frame) => {
        if (
          take.styling.deviceFrame &&
          take.styling.deviceFrame.type !== 'none'
        ) {
          drawDeviceFrameHeader(chromeCtx, {
            frame: take.styling.deviceFrame,
            winX: frame.x,
            winY: frame.y,
            winW: frame.width,
            winH: frame.height,
            headerH: frame.headerHeight,
            radius: frame.radius,
          });
          drawDeviceFrameFooter(chromeCtx, {
            frame: take.styling.deviceFrame,
            winX: frame.x,
            winY: frame.y,
            winW: frame.width,
            winH: frame.height,
            headerH: frame.headerHeight,
            radius: frame.radius,
          });
        } else {
          drawStudioWindowChrome(chromeCtx, frame);
        }
      },
    };

    drawStudioFrame(ctx, input);

    // Intro & Outro Motion Cards
    if (take.styling.introCard?.enabled) {
      drawMotionCard(ctx, {
        card: take.styling.introCard,
        cardType: 'intro',
        currentTimeMs,
        totalDurationMs,
        cw: dims.width,
        ch: dims.height,
      });
    }

    if (take.styling.outroCard?.enabled) {
      drawMotionCard(ctx, {
        card: take.styling.outroCard,
        cardType: 'outro',
        currentTimeMs,
        totalDurationMs,
        cw: dims.width,
        ch: dims.height,
      });
    }

    // Capture the drawn canvas as a VideoFrame and encode it
    const videoFrame = new VideoFrame(canvas, {
      timestamp: Math.round(currentTimeMs * 1000), // μs
    });
    const isKeyframe = frameIndex % keyframeInterval === 0;
    pendingEncodes++;
    encoder.encode(videoFrame, { keyFrame: isKeyframe });
    videoFrame.close();

    // Drain encoder and flush muxer every ENCODE_BATCH frames to stream data
    if (frameIndex % ENCODE_BATCH === 0 || frameIndex === totalFrames) {
      // Wait for all outstanding encodes to complete
      await new Promise<void>((resolve) => {
        if (pendingEncodes === 0) {
          resolve();
        } else {
          encoderFlushResolve = resolve;
        }
      });

      // Flush the encoder's internal buffers
      await encoder.flush();

      // Pass all freshly encoded frames to the muxer
      while (encodedFrames.length > 0) {
        const frame = encodedFrames.shift()!;
        muxer.addFrame(frame.data, frame.timestampMs, frame.isKeyframe);
      }

      // Wait for any in-flight IPC calls before continuing to avoid
      // overwhelming the main process with concurrent writes.
      if (ipcPromises.length >= ENCODE_BATCH * 2) {
        await Promise.all(ipcPromises.splice(0, ipcPromises.length));
      }
    }

    // Progress reporting
    const progressBase = 0.12;
    const progressRange = 0.85;
    const frameProgress = frameIndex / Math.max(1, totalFrames);
    const secFormatted = (currentTimeMs / 1000).toFixed(1);
    const totalSecFormatted = (totalDurationMs / 1000).toFixed(1);
    options?.onProgress?.(
      progressBase + frameProgress * progressRange,
      `Rendering frame ${frameIndex + 1}/${totalFrames} (${secFormatted}s / ${totalSecFormatted}s)...`,
    );
  }

  // 10. Finalize
  encoder.close();
  muxer.finalize();

  // Wait for all IPC writes to land
  options?.onProgress?.(0.98, 'Finalizing video file...');
  await Promise.all(ipcPromises);

  // Signal the main process that all chunks have been written
  await window.electron.ipc.invoke('studio:save-rendered-chunk', {
    takeId: take.id,
    chunkBase64: '',
    isLast: true,
  });

  return { ok: true, durationMs: totalDurationMs };
}
