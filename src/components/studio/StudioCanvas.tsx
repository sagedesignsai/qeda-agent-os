/**
 * components/studio/StudioCanvas.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Real-time 60fps HTML5 Canvas preview for Studio.
 *
 * This component owns *time and media*, not pixels:
 *   - it keeps the hidden `<video>` element that drives the frame,
 *   - loads overlay image/video elements and keeps them in a ref map,
 *   - steps the kinetic camera once per frame,
 *   - and delegates the actual drawing to `@/lib/studio/render/compose`.
 *
 * Keeping the draw order in a pure module means the preview and any future
 * export renderer can paint identical frames.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FilmIcon } from 'lucide-react';
import type {
  StudioCaption,
  StudioCut,
  StudioEffect,
  StudioOverlay,
  StudioStyling,
  StudioVideoCrop,
  StudioZoom,
} from '@/main/ipc/channels';
import { safeDurationMs } from '@/lib/studio-types';
import {
  compFromSource,
  cutAt,
  sourceFromComp,
} from '@/lib/studio/timeline/ripple';
import { studioCanvasDims } from '@/lib/studio/render/geometry';
import {
  computeCameraTarget,
  IDLE_CAMERA,
  stepCamera,
  type StudioCameraState,
} from '@/lib/studio/render/camera';
import {
  drawStudioFrame,
  type StudioComposeInput,
} from '@/lib/studio/render/compose';
import {
  studioOverlayMediaUrl,
  type StudioOverlayAsset,
} from '@/lib/studio/render/overlays';
import { timelineStore } from '@/hooks/use-timeline-store';
import {
  drawDeviceFrameHeader,
  drawDeviceFrameFooter,
} from './renderers/device-frames';
import { drawMotionCard } from './renderers/motion-cards';
import { drawStudioWindowChrome } from '@/lib/studio/render/frame';

interface StudioCanvasProps {
  videoUrl: string | null;
  styling: StudioStyling;
  zooms: StudioZoom[];
  captions: StudioCaption[];
  effects?: StudioEffect[];
  overlays?: StudioOverlay[];
  videoCrop?: StudioVideoCrop;
  /** Excision list, already normalized against the source duration. */
  cuts?: StudioCut[];
  durationMs?: number;
  isPlaying: boolean;
  onTimeUpdate?: (ms: number) => void;
  onDurationChange?: (ms: number) => void;
  onEnded?: () => void;
  onVideoElement?: (video: HTMLVideoElement | null) => void;
}

// Max drift tolerated between the parent's clock and the video element while
// playing before it counts as a real seek request rather than a one-frame echo.
const PLAYBACK_SEEK_TOLERANCE_MS = 400;

export function StudioCanvas({
  videoUrl,
  styling,
  zooms,
  captions,
  effects,
  overlays,
  videoCrop,
  cuts,
  durationMs,
  isPlaying,
  onTimeUpdate,
  onDurationChange,
  onEnded,
  onVideoElement,
}: StudioCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const cameraRef = useRef<StudioCameraState>({ ...IDLE_CAMERA });
  const overlayAssetsRef = useRef<Map<string, StudioOverlayAsset>>(new Map());
  const overlayVideoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const glowRef = useRef<{
    width: number;
    height: number;
    value: CanvasGradient;
  } | null>(null);

  const attachVideoRef = useCallback(
    (video: HTMLVideoElement | null) => {
      videoRef.current = video;
      onVideoElement?.(video);
    },
    [onVideoElement],
  );

  const canvasDims = useMemo(
    () => studioCanvasDims(styling.aspectRatio),
    [styling.aspectRatio],
  );

  const [videoLoaded, setVideoLoaded] = useState(false);
  const lastEmittedTimeRef = useRef(0);
  const currentTimeRef = useRef(timelineStore.getState().currentTimeMs);
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  // The playhead and the element live on different axes: the store is
  // composition time, `<video>.currentTime` is source time. These refs exist so
  // the 60fps loop and the muxer-facing code can read the current cut list
  // without re-subscribing.
  const cutsRef = useRef<StudioCut[]>(cuts ?? []);
  cutsRef.current = cuts ?? [];
  const overlaysRef = useRef<StudioOverlay[]>(overlays ?? []);
  overlaysRef.current = overlays ?? [];
  const endedRef = useRef(false);

  // The numbers/texture inputs the render loop reads. Stored in refs so prop
  // changes never tear down and re-create the animation loop.
  const renderInputsRef = useRef({
    styling,
    zooms,
    captions,
    effects: effects ?? [],
    overlays: overlays ?? [],
    videoCrop,
  });
  renderInputsRef.current = {
    styling,
    zooms,
    captions,
    effects: effects ?? [],
    overlays: overlays ?? [],
    videoCrop,
  };

  // ── Overlay asset loading ──────────────────────────────────────────────────
  useEffect(() => {
    const list = overlays ?? [];
    const assets = overlayAssetsRef.current;
    const videos = overlayVideoRefs.current;
    const activeIds = new Set<string>();

    for (const overlay of list) {
      activeIds.add(overlay.id);
      if (assets.has(overlay.id)) continue;

      const url = studioOverlayMediaUrl(overlay.id);
      if (overlay.kind === 'image') {
        const image = new Image();
        image.onload = () => {
          if (image.naturalWidth > 0) {
            assets.set(overlay.id, {
              element: image,
              width: image.naturalWidth,
              height: image.naturalHeight,
            });
          }
        };
        image.src = url;
      } else {
        const video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.loop = true;
        video.preload = 'auto';
        video.onloadedmetadata = () => {
          if (video.videoWidth > 0) {
            assets.set(overlay.id, {
              element: video,
              width: video.videoWidth,
              height: video.videoHeight,
            });
          }
        };
        video.src = url;
        videos.set(overlay.id, video);
      }
    }

    // Drop assets for overlays that no longer exist.
    for (const id of [...assets.keys()]) {
      if (!activeIds.has(id)) assets.delete(id);
    }
    for (const [id, video] of videos) {
      if (!activeIds.has(id)) {
        video.pause();
        video.src = '';
        videos.delete(id);
      }
    }
  }, [overlays]);

  // ── Play / pause sync for overlay videos ──────────────────────────────────
  useEffect(() => {
    for (const video of overlayVideoRefs.current.values()) {
      if (isPlaying) void video.play().catch(() => {});
      else video.pause();
    }
  }, [isPlaying]);

  // ── Reset the local clock when the source changes ─────────────────────────
  // Loading a different take swaps the `<video>` element; without this the next
  // frame would read a stale composition time and immediately seek away.
  useEffect(() => {
    currentTimeRef.current = timelineStore.getState().currentTimeMs;
    lastEmittedTimeRef.current = 0;
    endedRef.current = false;
  }, [videoUrl]);

  // ── Delta-clock playback loop for blank canvases (no video source) ─────────
  useEffect(() => {
    if (!isPlaying || videoUrl) return;

    let animId: number;
    let lastTick = performance.now();

    const tick = (now: number) => {
      const delta = now - lastTick;
      lastTick = now;
      const targetDuration = durationMs || 30000;
      const nextTime = currentTimeRef.current + delta;

      if (nextTime >= targetDuration) {
        currentTimeRef.current = targetDuration;
        onTimeUpdate?.(targetDuration);
        onEnded?.();
      } else {
        currentTimeRef.current = nextTime;
        onTimeUpdate?.(nextTime);
        animId = requestAnimationFrame(tick);
      }
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, videoUrl, durationMs, onTimeUpdate, onEnded]);

  // ── Sync the hidden video (and overlay videos) to the playhead ────────────
  useEffect(() => {
    const syncVideoTime = (compMs: number) => {
      currentTimeRef.current = compMs;
      // The store seeks in composition time; the media elements need source
      // time. `sourceFromComp` also guarantees we never land inside a cut.
      const sourceMs = sourceFromComp(compMs, cutsRef.current);
      const targetSec = sourceMs / 1000;
      if (!Number.isFinite(targetSec) || targetSec < 0) return;

      // An overlay's media clock starts at its own `startMs`, not at zero.
      for (const overlay of overlaysRef.current) {
        const video = overlayVideoRefs.current.get(overlay.id);
        if (!video) continue;
        const offsetSec = (sourceMs - overlay.startMs) / 1000;
        if (offsetSec < 0) {
          video.pause();
          continue;
        }
        const duration = Number.isFinite(video.duration) ? video.duration : 0;
        const desiredSec =
          duration > 0 ? Math.min(offsetSec, Math.max(0, duration - 0.05)) : offsetSec;
        if (
          Math.abs(video.currentTime - desiredSec) >
          PLAYBACK_SEEK_TOLERANCE_MS / 1000
        ) {
          try {
            video.currentTime = desiredSec;
          } catch {
            // Overlay may not be seekable yet; the next tick retries.
          }
        }
      }

      const video = videoRef.current;
      if (!video || !videoLoaded) return;
      const diff = Math.abs(video.currentTime * 1000 - sourceMs);
      if (!isPlayingRef.current) {
        if (diff > 50) video.currentTime = targetSec;
        return;
      }
      if (diff > PLAYBACK_SEEK_TOLERANCE_MS) video.currentTime = targetSec;
    };

    syncVideoTime(timelineStore.getState().currentTimeMs);
    return timelineStore.subscribeTime(syncVideoTime);
  }, [videoLoaded]);

  // ── Main 60fps render loop (delegates to the compose module) ──────────────
  useEffect(() => {
    let animId: number;

    const render = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) {
        animId = requestAnimationFrame(render);
        return;
      }

      const { styling: style, zooms: z, captions: c, effects: fx, overlays: ov, videoCrop: vc } =
        renderInputsRef.current;
      const activeCuts = cutsRef.current;
      const video = videoRef.current;
      const ready = Boolean(video && video.readyState >= 2);

      // Two clocks. `video.currentTime` is the source; the playhead and every
      // consumer of `onTimeUpdate` is composition time.
      let sourceMs: number;
      let compMs: number;

      if (ready && video) {
        sourceMs = video.currentTime * 1000;

        // The element is the playback clock, so skipping a cut means jumping it
        // past the excised range. Without this the export shortens but the
        // preview holds a frozen frame.
        if (isPlayingRef.current) {
          const cut = cutAt(sourceMs, activeCuts);
          if (cut) {
            video.currentTime = cut.endMs / 1000;
            sourceMs = cut.endMs;
          }
        }

        compMs = compFromSource(sourceMs, activeCuts);
        currentTimeRef.current = compMs;
      } else {
        compMs = currentTimeRef.current;
        sourceMs = sourceFromComp(compMs, activeCuts);
      }

      if (
        isPlayingRef.current &&
        Math.abs(compMs - lastEmittedTimeRef.current) >= 16
      ) {
        lastEmittedTimeRef.current = compMs;
        onTimeUpdate?.(compMs);
      }

      // A trailing cut ends the composition before the file does, so the
      // element's own `ended` event is not enough.
      const compositionEnd = durationMs ?? 0;
      if (
        isPlayingRef.current &&
        compositionEnd > 0 &&
        compMs >= compositionEnd - 1
      ) {
        if (!endedRef.current) {
          endedRef.current = true;
          video?.pause();
          onEnded?.();
        }
      } else if (compositionEnd > 0 && compMs < compositionEnd - 1) {
        endedRef.current = false;
      }

      const target = vc
        ? { ...IDLE_CAMERA }
        : computeCameraTarget({
            zooms: z,
            timeMs: sourceMs,
            zoomIntensity: style.zoomIntensity,
          });
      cameraRef.current = stepCamera(
        cameraRef.current,
        target,
        style.cameraEasing,
      );

      let glow = glowRef.current;
      if (!glow || glow.width !== canvas.width || glow.height !== canvas.height) {
        const gradient = ctx.createRadialGradient(
          canvas.width * 0.5,
          canvas.height * 0.5,
          100,
          canvas.width * 0.5,
          canvas.height * 0.5,
          canvas.width * 0.65,
        );
        gradient.addColorStop(0, 'rgba(99, 102, 241, 0.18)');
        gradient.addColorStop(1, 'rgba(99, 102, 241, 0)');
        glow = { width: canvas.width, height: canvas.height, value: gradient };
        glowRef.current = glow;
      }

      const input: StudioComposeInput = {
        width: canvas.width,
        height: canvas.height,
        styling: style,
        // Composition children (captions, effects, overlays, zooms) are authored
        // in source time, so that is the axis the compose pass receives.
        timeMs: sourceMs,
        video: video,
        videoReady: ready,
        camera: cameraRef.current,
        effects: fx,
        captions: c,
        overlays: ov,
        overlayAssets: overlayAssetsRef.current,
        videoCrop: vc,
        glowGradient: glow.value,
        drawWindowChrome: (chromeCtx, frame) => {
          if (style.deviceFrame && style.deviceFrame.type !== 'none') {
            drawDeviceFrameHeader(chromeCtx, {
              frame: style.deviceFrame,
              winX: frame.x,
              winY: frame.y,
              winW: frame.width,
              winH: frame.height,
              headerH: frame.headerHeight,
              radius: frame.radius,
            });
            drawDeviceFrameFooter(chromeCtx, {
              frame: style.deviceFrame,
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

      // ── 7. Intro & Outro Motion Cards Rendering ──────────────────────────────
      const totalDur =
        durationMs || (video && video.duration ? video.duration * 1000 : 30000);

      if (style.introCard?.enabled) {
        drawMotionCard(ctx, {
          card: style.introCard,
          cardType: 'intro',
          currentTimeMs: compMs,
          totalDurationMs: totalDur,
          cw: canvas.width,
          ch: canvas.height,
        });
      }

      if (style.outroCard?.enabled) {
        drawMotionCard(ctx, {
          card: style.outroCard,
          cardType: 'outro',
          currentTimeMs: compMs,
          totalDurationMs: totalDur,
          cw: canvas.width,
          ch: canvas.height,
        });
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [onTimeUpdate, durationMs, onEnded]);

  const aspectClass =
    styling.aspectRatio === '9:16'
      ? 'aspect-[9/16] max-h-[640px]'
      : styling.aspectRatio === '1:1'
        ? 'aspect-square max-h-[580px]'
        : styling.aspectRatio === '4:3'
          ? 'aspect-[4/3] max-h-[580px]'
          : 'aspect-video max-h-[580px]';

  const showBlankPlaceholder = !videoUrl && (overlays?.length ?? 0) === 0;

  return (
    <div
      ref={containerRef}
      className={`relative w-full mx-auto flex items-center justify-center overflow-hidden rounded-xl bg-black/40 border border-border/40 shadow-2xl ${aspectClass}`}
    >
      {/* Native video source driving the canvas.
          Visually hidden rather than `display:none`: a display:none element is
          not guaranteed to produce paintable frames, which leaves the canvas
          black. `absolute` keeps it out of the layout flow. */}
      {videoUrl && (
        <video
          ref={attachVideoRef}
          src={videoUrl}
          muted
          playsInline
          className="absolute h-px w-px opacity-0 pointer-events-none"
          onLoadedMetadata={() => {
            const v = videoRef.current;
            if (v) {
              setVideoLoaded(true);
              onDurationChange?.(
                safeDurationMs(v.duration * 1000, durationMs ?? 0),
              );
            }
          }}
          onError={() => {
            console.warn(
              '[StudioCanvas] Preview video failed to load.',
              videoUrl,
            );
          }}
          onEnded={onEnded}
        >
          <track kind="captions" />
        </video>
      )}

      {/* Render Canvas */}
      <canvas
        ref={canvasRef}
        width={canvasDims.width}
        height={canvasDims.height}
        className="w-full h-full object-contain pointer-events-none select-none"
      />

      {/* Placeholder when there is nothing to preview yet. */}
      {showBlankPlaceholder && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center"
          style={{
            background: styling.background.includes('gradient')
              ? styling.background
              : styling.background || '#090a0f',
          }}
        >
          <div className="w-full max-w-md p-8 rounded-2xl border-2 border-dashed border-border/40 bg-black/40 backdrop-blur-md flex flex-col items-center gap-3 shadow-2xl">
            <div className="p-3 rounded-full bg-primary/10 border border-primary/20 text-primary">
              <FilmIcon className="w-6 h-6" />
            </div>
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-semibold text-foreground">
                Blank Showcase Canvas
              </h3>
              <p className="text-xs text-muted-foreground/80 max-w-xs">
                Drag media or click{' '}
                <span className="text-primary font-bold">+</span> in the Content
                Panel on the left to add video, text, effects, or audio.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
