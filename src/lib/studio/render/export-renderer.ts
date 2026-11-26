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
  CAMERA_SMOOTHING_60FPS,
  computeCameraTarget,
  IDLE_CAMERA,
  stepCameraWithDelta,
  type StudioCameraState,
} from './camera';
import type { StudioComposeInput } from './compose';
import { renderStudioFrame } from './frame-renderer';
import { studioOverlayMediaUrl, type StudioOverlayAsset } from './overlays';
import { drawStudioWindowChrome } from './frame';
import {
  drawDeviceFrameHeader,
  drawDeviceFrameFooter,
} from '@/components/studio/renderers/device-frames';
import { drawMotionCard } from '@/components/studio/renderers/motion-cards';
import type { StudioMediaAsset, StudioTake, TimelineTrack, StudioScene, StudioCut, StudioZoom } from '../types';
import {
  getStudioScenes,
  getActiveStudioScene,
  projectStudioScene,
  resolveStudioSequence,
  sampleStudioSequence,
  studioSceneContentDurationMs,
  type StudioResolvedSequence,
} from '../scenes';
import {
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
  /** Export the whole story (default) or only the active scene. */
  scope?: 'story' | 'scene';
  /** The active scene when `scope` is `scene`. */
  sceneId?: string;
}

interface ExportSceneContext {
  take: StudioTake;
  video: HTMLVideoElement | null;
  cuts: StudioCut[];
  tracks: TimelineTrack[];
  zooms: StudioZoom[];
  overlayAssets: Map<string, StudioOverlayAsset>;
  clipInstances: Map<string, StudioOverlayAsset>;
  camera: StudioCameraState;
}

async function loadExportVideoElement(
  src: string,
  crossOrigin = false,
): Promise<HTMLVideoElement | null> {
  const video = document.createElement('video');
  if (crossOrigin) video.crossOrigin = 'anonymous';
  video.preload = 'auto';
  video.muted = true;
  video.src = src;
  return new Promise((resolve) => {
    video.onloadedmetadata = () => resolve(video);
    video.onerror = () => resolve(null);
  });
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

  // 2. Resolve the render plan. Story export walks the master sequence; scene
  //    export renders exactly one scope. Idle scenes are still valid frames.
  const sceneScope = options?.scope === 'scene';
  const allScenes = getStudioScenes(take);
  const selectedScene = options?.sceneId
    ? allScenes.find((scene) => scene.id === options.sceneId) ?? getActiveStudioScene(take)
    : getActiveStudioScene(take);
  const selectedSceneDurationMs = Math.max(
    1000,
    studioSceneContentDurationMs(
      selectedScene.tracks,
      selectedScene.durationMs,
    ),
  );
  const sequence: StudioResolvedSequence = sceneScope
    ? {
        items: [
          {
            id: 'scene-export',
            sceneId: selectedScene.id,
            startMs: 0,
            durationMs: selectedSceneDurationMs,
            transitionIn: { type: 'cut', durationMs: 0 },
          },
        ],
        durationMs: selectedSceneDurationMs,
      }
    : resolveStudioSequence(take);
  const scenesById = new Map(allScenes.map((scene) => [scene.id, scene]));
  for (const item of sequence.items) {
    if (!scenesById.has(item.sceneId)) {
      throw new Error(`Showcase scene "${item.sceneId}" is missing from this project`);
    }
  }
  if (sequence.durationMs <= 0) {
    throw new Error('Showcase story has zero duration');
  }
  const compositionDuration = sequence.durationMs;

  // 3. Preload the shared project media pool once. Scenes reference these
  //    assets by id, so decoding/loading per scene would duplicate work.
  options?.onProgress?.(0.05, 'Preloading project media...');
  const clipAssets = new Map<string, StudioOverlayAsset>();
  const mediaAssetById = new Map<string, StudioMediaAsset>();
  for (const asset of take.mediaAssets ?? []) {
    mediaAssetById.set(asset.id, asset);
  }
  for (const asset of take.mediaAssets ?? []) {
    if (asset.kind === 'audio') continue;
    const url = studioMediaAssetUrl(asset.id);
    if (asset.kind === 'image') {
      await new Promise<void>((resolve) => {
        const image = new Image();
        image.onload = () => {
          if (image.naturalWidth) {
            clipAssets.set(asset.id, {
              element: image,
              width: image.naturalWidth,
              height: image.naturalHeight,
            });
          }
          resolve();
        };
        image.onerror = () => resolve();
        image.src = url;
      });
    } else {
      const clipVideo = await loadExportVideoElement(url, true);
      if (clipVideo && clipVideo.videoWidth > 0) {
        clipAssets.set(asset.id, {
          element: clipVideo,
          width: clipVideo.videoWidth,
          height: clipVideo.videoHeight,
        });
      }
    }
  }

  // 3.5. Build a frame context for every scene used by the plan. Each context
  //      owns its own timebase, cuts, tracks, zooms, camera history and clip
  //      decoders, so switching scenes never leaks one scene's time into another.
  options?.onProgress?.(0.07, 'Preparing scenes...');
  const sourceVideoCache = new Map<string, Promise<HTMLVideoElement | null>>();
  const loadSceneSourceVideo = (scene: StudioScene): Promise<HTMLVideoElement | null> => {
    if (!scene.videoPath) return Promise.resolve(null);
    const key = `${take.id}:${scene.videoPath}`;
    const cached = sourceVideoCache.get(key);
    if (cached) return cached;
    const variantParam =
      take.optimizedPath || take.mediaReadyAt ? '?variant=optimized' : '';
    const promise = loadExportVideoElement(
      `qeda-media://studio/${encodeURIComponent(take.id)}${variantParam}`,
    );
    sourceVideoCache.set(key, promise);
    return promise;
  };

  const contexts = new Map<string, ExportSceneContext>();
  for (const item of sequence.items) {
    if (contexts.has(item.sceneId)) continue;
    const scene = scenesById.get(item.sceneId)!;
    const projected = projectStudioScene(take, scene);
    const video = await loadSceneSourceVideo(scene);
    const rawDuration =
      video && Number.isFinite(video.duration) ? video.duration * 1000 : 0;
    const sourceDurationMs = safeDurationMs(
      rawDuration,
      scene.videoPath ? take.durationMs : scene.durationMs,
    );
    const cuts = normalizeCuts(projected.cuts ?? [], sourceDurationMs);
    const tracks = convertTakeToTimeline(projected);
    const zooms = extractZoomsFromTracks(
      tracks.filter((track) => track.visible),
      cuts,
    );

    const overlayAssets = new Map<string, StudioOverlayAsset>();
    for (const overlay of projected.overlays ?? []) {
      const url = studioOverlayMediaUrl(overlay.id);
      if (overlay.kind === 'image') {
        await new Promise<void>((resolve) => {
          const image = new Image();
          image.onload = () => {
            if (image.naturalWidth > 0) {
              overlayAssets.set(overlay.id, {
                element: image,
                width: image.naturalWidth,
                height: image.naturalHeight,
              });
            }
            resolve();
          };
          image.onerror = () => resolve();
          image.src = url;
        });
      } else {
        const overlayVideo = await loadExportVideoElement(url);
        if (overlayVideo && overlayVideo.videoWidth > 0) {
          overlayAssets.set(overlay.id, {
            element: overlayVideo,
            width: overlayVideo.videoWidth,
            height: overlayVideo.videoHeight,
          });
        }
      }
    }

    // A clip placement owns its decoder: the same source can appear twice in a
    // transition at different source times. A per-clip element keeps the seeks
    // independent, and the `track-video` fallback keeps legacy recordings exact.
    const clipInstances = new Map<string, StudioOverlayAsset>();
    for (const track of tracks) {
      if (track.type !== 'video') continue;
      for (const clip of track.clips) {
        if (clip.itemType === 'image' || clip.payload?.kind === 'image') continue;
        const assetId = clip.payload?.mediaAssetId;
        const asset = assetId ? mediaAssetById.get(assetId) : undefined;
        const sourceUrl = asset?.kind === 'video'
          ? studioMediaAssetUrl(asset.id)
          : !assetId && track.id === 'track-video' && video
            ? video.src
            : null;
        if (!sourceUrl) continue;
        const clipVideo = await loadExportVideoElement(sourceUrl, true);
        if (clipVideo && clipVideo.videoWidth > 0) {
          clipInstances.set(clip.id, {
            element: clipVideo,
            width: clipVideo.videoWidth,
            height: clipVideo.videoHeight,
          });
        }
      }
    }

    contexts.set(scene.id, {
      take: projected,
      video,
      cuts,
      tracks,
      zooms,
      overlayAssets,
      clipInstances,
      camera: { ...IDLE_CAMERA },
    });
  }

  // 3.6. Decode audio once per asset and share the buffer across scene clips.
  const audioSampleRate = 48000;
  const audioChannels = 2;
  const audioBuffers = new Map<string, AudioBuffer | null>();
  const audioDecodePromises: Promise<void>[] = [];
  const legacyAudioTargets: Array<{
    clip: TimelineTrack['clips'][number];
    video: HTMLVideoElement;
  }> = [];
  for (const context of contexts.values()) {
    for (const track of context.tracks) {
      if (track.type !== 'audio' || track.muted) continue;
      for (const clip of track.clips) {
        if (clip.payload?.audioBuffer) continue;
        const assetId = clip.payload?.mediaAssetId;
        if (!assetId) {
          if (context.video) {
            legacyAudioTargets.push({ clip, video: context.video });
          }
          continue;
        }
        const asset = mediaAssetById.get(assetId);
        if (!asset) continue;
        if (!audioBuffers.has(assetId)) {
          audioBuffers.set(assetId, null);
          const url = studioMediaAssetUrl(asset.id);
          audioDecodePromises.push(
            decodeAudioSource(url, audioSampleRate)
              .then((buffer) => {
                audioBuffers.set(assetId, buffer);
              })
              .catch(() => {
                // A broken audio asset must not fail the whole export.
              }),
          );
        }
      }
    }
  }
  if (legacyAudioTargets.length > 0) {
    const legacyBuffers = new Map<string, Promise<AudioBuffer | null>>();
    for (const target of legacyAudioTargets) {
      const key = target.video.src;
      if (!key) continue;
      if (!legacyBuffers.has(key)) {
        legacyBuffers.set(key, decodeAudioSource(key, audioSampleRate));
      }
      audioDecodePromises.push(
        legacyBuffers.get(key)!.then((buffer) => {
          if (!buffer) return;
          target.clip.payload = target.clip.payload || {};
          target.clip.payload.audioBuffer = buffer;
        }).catch(() => {
          // Fall back to the source audio merge in the main process.
        }),
      );
    }
  }
  if (audioDecodePromises.length > 0) {
    options?.onProgress?.(0.08, 'Decoding audio tracks...');
    await Promise.all(audioDecodePromises);
  }
  let hasAudioClips = false;
  for (const context of contexts.values()) {
    for (const track of context.tracks) {
      if (track.type !== 'audio' || track.muted) continue;
      for (const clip of track.clips) {
        const buffer = clip.payload?.audioBuffer ?? null;
        if (buffer && clip.payload) {
          clip.payload.waveformPeaks =
            clip.payload.waveformPeaks ?? computeWaveformPeaks(buffer);
          hasAudioClips = true;
        }
      }
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

  // 7. Camera history, easing and canvas setup.
  //    Each scene owns its camera state; easing is a low-pass filter, so a
  //    scene's motion warms up naturally while it is on screen.
  const easingKey = take.styling.cameraEasing ?? 'smooth';
  const frameDeltaMs = 1000 / fps;

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

  // 8. Frame-by-frame rendering loop.
  //    Composition time drives frame count, encoded timestamps and the active
  //    scene. Only media seeks are translated back to each scene's source time.
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

  const drawWindowChrome = (
    chromeCtx: CanvasRenderingContext2D,
    frame: import('./geometry').StudioWindowFrame,
  ) => {
    const deviceFrame = take.styling.deviceFrame;
    if (deviceFrame && deviceFrame.type !== 'none') {
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
  };

  for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
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
    const resolvedFrame = sceneScope
      ? {
          layers: [
            {
              item: sequence.items[0],
              scene: selectedScene,
              sceneTimeMs: Math.min(sequence.durationMs, currentTimeMs),
            },
          ],
        }
      : sampleStudioSequence(take, currentTimeMs);
    // v1 story editing authors cuts. If an explicit crossfade is present in a
    // project, render the incoming scene on top rather than failing the export.
    const layer = resolvedFrame.layers[resolvedFrame.layers.length - 1] ?? null;
    const context = layer ? contexts.get(layer.scene.id) : undefined;

    const tSeek0 = profileTimings ? performance.now() : 0;
    let evaluatedTimeline: ReturnType<typeof evaluateEditorTimeline> | null = null;

    if (context) {
      const sceneTimeMs = layer?.sceneTimeMs ?? 0;
      const sourceMs = sourceFromComp(sceneTimeMs, context.cuts);

      // Seek the scene's source recording, when it has one.
      if (context.video) {
        const seekSec = Math.min(sourceMs / 1000, context.video.duration);
        await seekTo(context.video, seekSec, options?.signal);
      }

      // Overlay media clocks start at their own `startMs`, on scene time.
      for (const overlay of context.take.overlays ?? []) {
        const asset = context.overlayAssets.get(overlay.id);
        if (!asset || !(asset.element instanceof HTMLVideoElement)) continue;
        const ovVid = asset.element;
        if (!(ovVid.duration > 0)) continue;
        const offsetSec = (sceneTimeMs - overlay.startMs) / 1000;
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

      evaluatedTimeline = evaluateEditorTimeline(context.tracks, sceneTimeMs);
      for (const item of evaluatedTimeline.video) {
        if (item.itemType !== 'video') continue;
        const media =
          context.clipInstances.get(item.clip.id)?.element ??
          (item.clip.payload?.mediaAssetId
            ? clipAssets.get(item.clip.payload.mediaAssetId)?.element
            : item.track.id === 'track-video'
              ? context.video
              : undefined);
        if (!(media instanceof HTMLVideoElement) || !(media.duration > 0)) continue;
        const seekSeconds = item.sourceTimeMs / 1000;
        await seekTo(
          media,
          Math.max(0, Math.min(seekSeconds, Math.max(0, media.duration - 0.05))),
          options?.signal,
        );
      }

      // Update this scene's canvas camera for the frame.
      const target = context.take.videoCrop
        ? { ...IDLE_CAMERA }
        : computeCameraTarget({
            zooms: context.zooms,
            timeMs: sourceMs,
            zoomIntensity: take.styling.zoomIntensity,
          });
      context.camera = stepCameraWithDelta(
        context.camera,
        target,
        easingKey,
        frameDeltaMs,
      );

      const input: StudioComposeInput = {
        width: dims.width,
        height: dims.height,
        styling: take.styling,
        timeMs: sourceMs,
        video: context.video,
        videoReady: Boolean(context.video && context.video.readyState >= 2),
        // Zoom clips are global to the scene: they scale the whole composed
        // canvas, not the source video crop.
        camera: IDLE_CAMERA,
        canvasCamera: context.camera,
        effects: context.take.effects ?? [],
        captions: context.take.captions ?? [],
        overlays: context.take.overlays ?? [],
        overlayAssets: context.overlayAssets,
        videoCrop: context.take.videoCrop,
        glowGradient: radialGlow,
        tracks: context.tracks,
        clipAssets,
        clipInstances: context.clipInstances,
        compTimeMs: sceneTimeMs,
        drawWindowChrome,
      };

      const tDraw0 = profileTimings ? performance.now() : 0;
      renderStudioFrame(ctx, input);

      // Legacy Motion Cards survive only for single-scene projects. New scenes
      // are the replacement and must not be covered by a global overlay.
      if (!take.scenes?.length) {
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
      }
      if (profileTimings) {
        profileTimings.drawMs.push(performance.now() - tDraw0);
      }
    } else {
      // A gap in an explicit sequence renders as a clean background frame.
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, dims.width, dims.height);
    }

    if (profileTimings) {
      profileTimings.seekMs.push(performance.now() - tSeek0);
    }

    // Capture the drawn canvas as a VideoFrame and encode it
    const tEnc0 = profileTimings ? performance.now() : 0;
    const videoFrame = new VideoFrame(canvas, {
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
      const framesPerSample = Math.round(audioSampleRate / fps);
      let mixedSamples: Float32Array | null = null;

      if (context && evaluatedTimeline && evaluatedTimeline.audio.length > 0) {
        mixedSamples = mixAudioSamples(
          evaluatedTimeline.audio,
          context.tracks,
          audioSampleRate,
          framesPerSample,
        );
      }

      if (!mixedSamples) {
        // Emit silence for frames with no active audio clips to keep the
        // Opus stream timestamp continuous — gaps cause playback artifacts.
        mixedSamples = new Float32Array(framesPerSample * audioChannels);
      }

      // Convert interleaved Float32Array to s16-planar ArrayBuffer for AudioData.
      const numSamples = framesPerSample;
      const totalBytes = numSamples * audioChannels * 2;
      const planeBuffer = new ArrayBuffer(totalBytes);
      const int16View = new Int16Array(planeBuffer);
      for (let ch = 0; ch < audioChannels; ch++) {
        const planeOffset = ch * numSamples;
        for (let i = 0; i < numSamples; i++) {
          const sample = Math.max(
            -1,
            Math.min(1, mixedSamples[(i * audioChannels) + ch] || 0),
          );
          int16View[planeOffset + i] =
            sample < 0 ? Math.floor(sample * 0x8000) : Math.floor(sample * 0x7fff);
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
    // Drain encoder and flush muxer every ENCODE_BATCH frames to stream data
    if (frameIndex % ENCODE_BATCH === 0 || frameIndex === totalFrames - 1) {
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
