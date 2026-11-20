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
import type { StudioMediaAsset, StudioTake, TimelineTrack } from '../types';
import {
  compositionDurationMs,
  normalizeCuts,
  sourceFromComp,
} from '../timeline/ripple';
import { WebMMuxer } from './webm-muxer';
import { convertTakeToTimeline, extractZoomsFromTracks } from '../timeline/convert';
import { evaluateEditorTimeline } from '../timeline/evaluate';
import { studioMediaAssetUrl } from '../media';
import { computeWaveformPeaks, decodeAudioSource, mixAudioSamples } from '../audio/mixer';

export interface RenderComposedVideoOptions {
  onProgress?: (progressRatio: number, statusText: string) => void;
  signal?: AbortSignal;
  /** Export frame rate. Defaults to 30. */
  fps?: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

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
  let totalDurationMs: number;

  if (take.videoPath) {
    options?.onProgress?.(0.05, 'Loading source video media...');
    video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.preload = 'auto';
    video.muted = true; // Muted for frame-seek; audio comes from source file via ffmpeg
    const variantParam =
      take.optimizedPath || take.mediaReadyAt ? '?variant=optimized' : '';
    video.src = `qeda-media://studio/${encodeURIComponent(take.id)}${variantParam}`;

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

  // Dead-air cuts excise source ranges. The output length, the frame count and
  // every encoded timestamp are composition time; only the video seeks use the
  // source. An all-cut take has nothing to render.
  const cuts = normalizeCuts(take.cuts ?? [], totalDurationMs);
  const timelineTracks = convertTakeToTimeline(take);
  const timelineZooms = extractZoomsFromTracks(
    timelineTracks.filter((track) => track.visible),
    cuts,
  );
  const sequenceDurationMs = take.tracks === undefined
    ? compositionDurationMs(totalDurationMs, cuts)
    : Math.max(
        1000,
        ...timelineTracks.flatMap((track) =>
          track.clips.map((clip) => clip.startMs + clip.durationMs),
        ),
      );
  const compositionDuration = sequenceDurationMs;
  if (compositionDuration <= 0) {
    throw new Error('Showcase take has no content left after cuts');
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

  const clipAssets = new Map<string, StudioOverlayAsset>();
  for (const asset of take.mediaAssets ?? []) {
    if (asset.kind === 'audio') continue;
    const url = studioMediaAssetUrl(asset.id);
    if (asset.kind === 'image') {
      await new Promise<void>((resolve) => {
        const image = new Image();
        image.onload = () => {
          if (image.naturalWidth) clipAssets.set(asset.id, { element: image, width: image.naturalWidth, height: image.naturalHeight });
          resolve();
        };
        image.onerror = () => resolve();
        image.src = url;
      });
    } else {
      await new Promise<void>((resolve) => {
        const clipVideo = document.createElement('video');
        clipVideo.muted = true;
        clipVideo.preload = 'auto';
        clipVideo.onloadedmetadata = () => {
          if (clipVideo.videoWidth) clipAssets.set(asset.id, { element: clipVideo, width: clipVideo.videoWidth, height: clipVideo.videoHeight });
          resolve();
        };
        clipVideo.onerror = () => resolve();
        clipVideo.src = url;
      });
    }
  }

  // A clip placement owns its decoder during export. The same source can be
  // used on both sides of a transition at different source times, so sharing
  // one video element by asset ID would make the clips seek over one another.
  const clipInstances = new Map<string, StudioOverlayAsset>();
  const mediaAssetById = new Map<string, StudioMediaAsset>();
  for (const asset of take.mediaAssets ?? []) mediaAssetById.set(asset.id, asset);
  const transitionParticipantIds = new Set(
    timelineTracks
      .filter((track) => track.type === 'transitions')
      .flatMap((track) => track.clips.flatMap((clip) => [
        clip.payload?.fromClipId,
        clip.payload?.toClipId,
      ]))
      .filter((clipId): clipId is string => Boolean(clipId)),
  );
  const videoClips = timelineTracks
    .filter((track) => track.type === 'video')
    .flatMap((track) => track.clips.map((clip) => ({ track, clip })))
    .filter(({ clip }) => clip.itemType !== 'image' && transitionParticipantIds.has(clip.id));
  await Promise.all(videoClips.map(async ({ track, clip }) => {
    const assetId = clip.payload?.mediaAssetId;
    const asset = assetId ? mediaAssetById.get(assetId) : undefined;
    const sourceUrl = asset?.kind === 'video'
      ? studioMediaAssetUrl(asset.id)
      : !assetId && track.id === 'track-video' && video
        ? video.src
        : null;
    if (!sourceUrl) return;

    await new Promise<void>((resolve) => {
      const clipVideo = document.createElement('video');
      clipVideo.crossOrigin = 'anonymous';
      clipVideo.muted = true;
      clipVideo.preload = 'auto';
      clipVideo.onloadedmetadata = () => {
        if (clipVideo.videoWidth > 0) {
          clipInstances.set(clip.id, {
            element: clipVideo,
            width: clipVideo.videoWidth,
            height: clipVideo.videoHeight,
          });
        }
        resolve();
      };
      clipVideo.onerror = () => resolve();
      clipVideo.src = sourceUrl;
    });
  }));

  // 3.5. Decode audio for all audio clips on the timeline
  const audioSampleRate = 48000;
  const audioChannels = 2;
  let hasAudioClips = timelineTracks.some(
    (track) => track.type === 'audio' && track.clips.length > 0 && !track.muted,
  );

  if (hasAudioClips) {
    options?.onProgress?.(0.08, 'Decoding audio tracks...');
    const audioDecodePromises: Promise<void>[] = [];
    for (const track of timelineTracks) {
      if (track.type !== 'audio' || track.muted) continue;
      for (const clip of track.clips) {
        const assetId = clip.payload?.mediaAssetId;
        if (!assetId || clip.payload?.audioBuffer) continue;
        const asset = mediaAssetById.get(assetId);
        if (!asset) continue;
        const url = studioMediaAssetUrl(asset.id);
        audioDecodePromises.push(
          decodeAudioSource(url, audioSampleRate)
            .then((buffer) => {
              if (buffer) {
                clip.payload = clip.payload || {};
                clip.payload.audioBuffer = buffer;
                // Pre-compute waveform peaks for timeline visualization
                clip.payload.waveformPeaks = computeWaveformPeaks(buffer);
              }
            })
            .catch(() => {
              // Skip clips that fail to decode
            }),
        );
      }
    }
    await Promise.all(audioDecodePromises);
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
    audioSampleRate: hasAudioClips ? audioSampleRate : 0,
    audioChannels: hasAudioClips ? audioChannels : 0,
    onChunk: (chunk) => {
      const currentIsFirst = isFirstChunk;
      isFirstChunk = false;
      const p = (async () => {
        const slice = chunk.data.buffer.slice(
          chunk.data.byteOffset,
          chunk.data.byteOffset + chunk.data.byteLength,
        ) as ArrayBuffer;
        await window.electron.ipc.invoke('studio:save-rendered-chunk', {
          takeId: take.id,
          chunk: slice,
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

  // 6.5. Setup AudioEncoder for multitrack audio mixing
  let audioEncoder: AudioEncoder | null = null;
  const encodedAudioChunks: Array<{
    data: Uint8Array;
    timestampMs: number;
  }> = [];
  let audioEncoderError: Error | null = null;

  if (hasAudioClips && typeof AudioEncoder !== 'undefined') {
    try {
      audioEncoder = new AudioEncoder({
        output: (chunk) => {
          const data = new Uint8Array(chunk.byteLength);
          chunk.copyTo(data);
          const timestampMs = chunk.timestamp / 1000; // μs → ms
          encodedAudioChunks.push({ data, timestampMs });
        },
        error: (err) => {
          audioEncoderError = err;
        },
      });
      audioEncoder.configure({
        codec: 'opus',
        sampleRate: audioSampleRate,
        numberOfChannels: audioChannels,
        bitrate: 128_000,
      });
    } catch {
      // AudioEncoder not supported; fall back to video-only export
      hasAudioClips = false;
    }
  }

  // 7. Dead-air cuts, pre-mapped from composition time back to source time.
  //    Sorting is done by `normalizeCuts`, which also merges overlaps so a
  //    seek can never land between two adjacent cut entries.

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

  // 9. Frame-by-frame rendering loop.
  //    Composition time drives everything the viewer sees — frame count, encoded
  //    timestamps, motion cards — while only the media seeks are translated back
  //    to source time. This is what makes a cut actually shorten the file.
  const totalFrames = Math.ceil((compositionDuration / 1000) * fps);
  const frameIntervalMs = 1000 / fps;
  const keyframeInterval = fps * 2; // Keyframe every 2 seconds

  // Batch size: flush encoder every N frames to avoid runaway memory usage
  const ENCODE_BATCH = 10;

  options?.onProgress?.(0.12, 'Starting frame-by-frame export...');

  const isProfiling =
    (typeof process !== 'undefined' &&
      Boolean(process.env?.STUDIO_EXPORT_PROFILE)) ||
    (typeof window !== 'undefined' &&
      Boolean((window as any).__STUDIO_EXPORT_PROFILE));

  const profileTimings = isProfiling
    ? {
        seekMs: [] as number[],
        drawMs: [] as number[],
        encodeMs: [] as number[],
        drainMs: [] as number[],
      }
    : null;

  for (let frameIndex = 0; frameIndex <= totalFrames; frameIndex++) {
    if (options?.signal?.aborted) {
      encoder.close();
      throw new Error('Export cancelled by user');
    }
    if (encoderError) {
      encoder.close();
      throw encoderError;
    }

    const currentTimeMs = Math.min(
      frameIndex * frameIntervalMs,
      compositionDuration,
    );
    const sourceMs = sourceFromComp(currentTimeMs, cuts);

    const tSeek0 = profileTimings ? performance.now() : 0;
    // Seek video and overlay videos to this exact frame
    if (video) {
      const seekSec = Math.min(sourceMs / 1000, video.duration);
      await seekTo(video, seekSec, options?.signal);
    }

    // Overlay media clocks start at their own `startMs`, so an overlay that
    // appears at 10s shows its first frame there instead of its tenth second.
    for (const overlay of take.overlays ?? []) {
      const asset = overlayAssets.get(overlay.id);
      if (!asset || !(asset.element instanceof HTMLVideoElement)) continue;
      const ovVid = asset.element;
      if (!(ovVid.duration > 0)) continue;
      const offsetSec = (sourceMs - overlay.startMs) / 1000;
      const seekSec = Math.max(0, Math.min(offsetSec, ovVid.duration - 0.05));
      if (Math.abs(ovVid.currentTime - seekSec) > 0.01) {
        try {
          await seekTo(ovVid, seekSec, options?.signal);
        } catch (error) {
          if (options?.signal?.aborted) throw error;
          // A broken overlay should not fail the whole export.
        }
      }
    }
    const evaluatedTimeline = evaluateEditorTimeline(
      timelineTracks ?? [],
      currentTimeMs,
    );
    for (const item of evaluatedTimeline.video) {
      if (item.itemType !== 'video') continue;
      const media = item.clip.payload?.mediaAssetId
        ? clipInstances.get(item.clip.id)?.element ?? clipAssets.get(item.clip.payload.mediaAssetId)?.element
        : item.track.id === 'track-video'
          ? clipInstances.get(item.clip.id)?.element ?? undefined
          : undefined;
      if (!(media instanceof HTMLVideoElement) || !(media.duration > 0))
        continue;
      const seekSeconds = item.sourceTimeMs / 1000;
      await seekTo(
        media,
        Math.max(0, Math.min(seekSeconds, Math.max(0, media.duration - 0.05))),
        options?.signal,
      );
    }
    if (profileTimings) {
      profileTimings.seekMs.push(performance.now() - tSeek0);
    }

    // Update camera state for this frame
    const target = take.videoCrop
      ? { ...IDLE_CAMERA }
      : computeCameraTarget({
          zooms: timelineZooms,
          timeMs: sourceMs,
          zoomIntensity: take.styling.zoomIntensity,
        });
    camera = stepCameraWithAlpha(camera, target, alphaAtFps);

    // Draw the full composition
    const input: StudioComposeInput = {
      width: dims.width,
      height: dims.height,
      styling: take.styling,
      timeMs: sourceMs,
      video: video || null,
      videoReady: Boolean(video && video.readyState >= 2),
      camera,
      effects: take.effects ?? [],
      captions: take.captions ?? [],
      overlays: take.overlays ?? [],
      overlayAssets,
      videoCrop: take.videoCrop,
      glowGradient: radialGlow,
      tracks: timelineTracks,
      clipAssets,
      clipInstances,
      compTimeMs: currentTimeMs,
      drawWindowChrome: (chromeCtx, frame) => {
        const deviceFrame = take.styling.deviceFrame;
        if (
          deviceFrame &&
          deviceFrame.type !== 'none'
        ) {
          drawDeviceFrameHeader(chromeCtx, {
            frame: deviceFrame,
            winX: frame.x,
            winY: frame.y,
            winW: frame.width,
            winH: frame.height,
            headerH: frame.headerHeight,
            radius: frame.radius,
          });
          drawDeviceFrameFooter(chromeCtx, {
            frame: deviceFrame,
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

    const tDraw0 = profileTimings ? performance.now() : 0;
    drawStudioFrame(ctx, input);

    // Intro & Outro Motion Cards
    if (take.styling.introCard?.enabled) {
      drawMotionCard(ctx, {
        card: take.styling.introCard,
        cardType: 'intro',
        currentTimeMs,
        totalDurationMs: compositionDuration,
        cw: dims.width,
        ch: dims.height,
      });
    }

    if (take.styling.outroCard?.enabled) {
      drawMotionCard(ctx, {
        card: take.styling.outroCard,
        cardType: 'outro',
        currentTimeMs,
        totalDurationMs: compositionDuration,
        cw: dims.width,
        ch: dims.height,
      });
    }
    if (profileTimings) {
      profileTimings.drawMs.push(performance.now() - tDraw0);
    }

    // Capture the drawn canvas as a VideoFrame and encode it
    const tEnc0 = profileTimings ? performance.now() : 0;
    const videoFrame = new VideoFrame(canvas, {
      // Composition time: the muxer's timeline must match the shorter output.
      timestamp: Math.round(currentTimeMs * 1000), // μs
    });
    const isKeyframe = frameIndex % keyframeInterval === 0;
    pendingEncodes++;
    encoder.encode(videoFrame, { keyFrame: isKeyframe });
    videoFrame.close();
    if (profileTimings) {
      profileTimings.encodeMs.push(performance.now() - tEnc0);
    }

    // Mix and encode audio for this frame
    if (hasAudioClips && audioEncoder && !audioEncoderError) {
      const audioClips = evaluatedTimeline.audio;
      if (audioClips.length > 0) {
        const framesPerSample = Math.round(audioSampleRate / fps);
        const mixedSamples = mixAudioSamples(
          audioClips,
          timelineTracks,
          audioSampleRate,
          framesPerSample,
        );
        if (mixedSamples) {
          // Convert interleaved Float32Array to s16-planar ArrayBuffer for AudioData.
          // s16-planar stores each channel in a contiguous plane:
          //   [ch0_sample0, ch0_sample1, ..., ch1_sample0, ch1_sample1, ...]
          const numSamples = framesPerSample;
          const totalBytes = numSamples * audioChannels * 2; // 2 bytes per sample per channel
          const planeBuffer = new ArrayBuffer(totalBytes);
          const int16View = new Int16Array(planeBuffer);
          for (let ch = 0; ch < audioChannels; ch++) {
            const planeOffset = ch * numSamples;
            for (let i = 0; i < numSamples; i++) {
              const sample = Math.max(-1, Math.min(1, mixedSamples[(i * audioChannels) + ch] || 0));
              int16View[planeOffset + i] = sample < 0 ? Math.floor(sample * 0x8000) : Math.floor(sample * 0x7FFF);
            }
          }
          const audioFrame = new AudioData({
            format: 's16-planar' as const,
            sampleRate: audioSampleRate,
            numberOfChannels: audioChannels,
            numberOfFrames: numSamples,
            timestamp: Math.round(currentTimeMs * 1000), // μs
            data: planeBuffer,
          });
          audioEncoder.encode(audioFrame);
          audioFrame.close();
        }
      }
    }

    // Drain encoder and flush muxer every ENCODE_BATCH frames to stream data
    if (frameIndex % ENCODE_BATCH === 0 || frameIndex === totalFrames) {
      const tDrain0 = profileTimings ? performance.now() : 0;
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

      // Pass all freshly encoded audio chunks to the muxer
      while (encodedAudioChunks.length > 0) {
        const audioChunk = encodedAudioChunks.shift()!;
        muxer.addAudioBlock(audioChunk.data, audioChunk.timestampMs);
      }

      // Wait for any in-flight IPC calls before continuing to avoid
      // overwhelming the main process with concurrent writes.
      if (ipcPromises.length >= ENCODE_BATCH * 2) {
        await Promise.all(ipcPromises.splice(0, ipcPromises.length));
      }
      if (profileTimings) {
        profileTimings.drainMs.push(performance.now() - tDrain0);
      }
    }

    // Progress reporting
    const progressBase = 0.12;
    const progressRange = 0.85;
    const frameProgress = frameIndex / Math.max(1, totalFrames);
    const secFormatted = (currentTimeMs / 1000).toFixed(1);
    const totalSecFormatted = (compositionDuration / 1000).toFixed(1);
    options?.onProgress?.(
      progressBase + frameProgress * progressRange,
      `Rendering frame ${frameIndex + 1}/${totalFrames} (${secFormatted}s / ${totalSecFormatted}s)...`,
    );
  }

  // 10. Finalize
  encoder.close();
  if (audioEncoder) {
    try {
      await audioEncoder.flush();
    } catch { /* ignore */ }
    audioEncoder.close();
  }
  muxer.finalize();

  // Wait for all IPC writes to land
  options?.onProgress?.(0.98, 'Finalizing video file...');
  await Promise.all(ipcPromises);

  if (profileTimings) {
    const calcStats = (arr: number[]) => {
      if (arr.length === 0) return { total: 0, p50: 0, p95: 0 };
      const sorted = [...arr].sort((a, b) => a - b);
      const total = sorted.reduce((sum, v) => sum + v, 0);
      const p50 = sorted[Math.floor(sorted.length * 0.5)];
      const p95 = sorted[Math.floor(sorted.length * 0.95)];
      return { total, p50, p95 };
    };
    const seekStats = calcStats(profileTimings.seekMs);
    const drawStats = calcStats(profileTimings.drawMs);
    const encStats = calcStats(profileTimings.encodeMs);
    const drainStats = calcStats(profileTimings.drainMs);
    const grandTotal =
      seekStats.total + drawStats.total + encStats.total + drainStats.total;
    console.info('[studio-export-profile] Export Profile Summary:', {
      frames: totalFrames,
      totalWallTimeMs: grandTotal,
      seek: {
        ...seekStats,
        pct:
          grandTotal > 0
            ? ((seekStats.total / grandTotal) * 100).toFixed(1) + '%'
            : '0%',
      },
      draw: {
        ...drawStats,
        pct:
          grandTotal > 0
            ? ((drawStats.total / grandTotal) * 100).toFixed(1) + '%'
            : '0%',
      },
      encode: {
        ...encStats,
        pct:
          grandTotal > 0
            ? ((encStats.total / grandTotal) * 100).toFixed(1) + '%'
            : '0%',
      },
      drain: {
        ...drainStats,
        pct:
          grandTotal > 0
            ? ((drainStats.total / grandTotal) * 100).toFixed(1) + '%'
            : '0%',
      },
    });
  }

  // Signal the main process that all chunks have been written
  await window.electron.ipc.invoke('studio:save-rendered-chunk', {
    takeId: take.id,
    chunkBase64: '',
    isLast: true,
  });

  return { ok: true, durationMs: compositionDuration };
}
