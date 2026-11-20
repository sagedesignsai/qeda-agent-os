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

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { FilmIcon } from 'lucide-react';
import type {
  ClipTransform,
  StudioCaption,
  StudioCut,
  StudioEffect,
  StudioMediaAsset,
  StudioOverlay,
  StudioStyling,
  StudioVideoCrop,
  StudioZoom,
  TimelineTrack,
} from '@/main/ipc/channels';
import { extractZoomsFromTracks, safeDurationMs } from '@/lib/studio-types';
import {
  artboardToLocal,
  type GizmoBBox,
  type GizmoPoint,
  type GizmoTransform,
} from '@/lib/trace/gizmo/geometry';
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
  computeStudioCanvasFrame,
  drawStudioFrame,
  type StudioComposeInput,
} from '@/lib/studio/render/compose';
import { evaluateEditorTimeline } from '@/lib/studio/timeline/evaluate';
import { StudioAudioMixer } from '@/lib/studio/audio/mixer';
import {
  studioOverlayMediaUrl,
  type StudioOverlayAsset,
} from '@/lib/studio/render/overlays';
import { studioMediaAssetUrl } from '@/lib/studio/media';
import {
  timelineStore,
  useSelectedClip,
  useTimelineState,
} from '@/hooks/use-timeline-store';
import { StudioCanvasTransformGizmo } from './StudioCanvasTransformGizmo';
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
  /** Timeline tracks for per-clip animation evaluation (multi-track model). */
  tracks?: TimelineTrack[];
  mediaAssets?: StudioMediaAsset[];
}

interface StudioClipCanvasGeometry {
  frame: ReturnType<typeof computeStudioCanvasFrame>;
  bbox: GizmoBBox;
  transform: GizmoTransform;
  origin: GizmoPoint;
  baseCenter: GizmoPoint;
}

function studioClipCanvasGeometry(
  clip: TimelineTrack['clips'][number],
  track: TimelineTrack,
  sourceWidth: number,
  sourceHeight: number,
  dims: { width: number; height: number },
  styling: StudioStyling,
  videoCrop?: StudioVideoCrop,
  frameContentAspect?: number,
): StudioClipCanvasGeometry {
  const cropAspect =
    track.id === 'track-video' &&
    !clip.payload?.mediaAssetId &&
    videoCrop &&
    videoCrop.width > 0 &&
    videoCrop.height > 0
      ? videoCrop.width / videoCrop.height
      : undefined;
  const contentAspect = frameContentAspect ?? cropAspect ?? (sourceWidth > 0 && sourceHeight > 0
    ? sourceWidth / sourceHeight
    : 16 / 9);
  const frame = computeStudioCanvasFrame(dims.width, dims.height, styling, contentAspect);
  const width = clip.payload?.widthPct
    ? clip.payload.widthPct * frame.contentWidth
    : frame.contentWidth;
  const height = clip.payload?.widthPct
    ? width / (sourceWidth / sourceHeight)
    : frame.contentHeight;
  const bbox: GizmoBBox = {
    x: -width / 2,
    y: -height / 2,
    width,
    height,
  };
  const anchor = clip.payload?.transform?.anchorPoint ?? { x: 0.5, y: 0.5 };
  const origin = {
    x: (anchor.x - 0.5) * width,
    y: (anchor.y - 0.5) * height,
  };
  const baseCenter = {
    x: frame.contentX + (clip.payload?.x ?? 0.5) * frame.contentWidth,
    y: frame.contentY + (clip.payload?.y ?? 0.5) * frame.contentHeight,
  };
  const transform: GizmoTransform = {
    x: baseCenter.x + (clip.payload?.transform?.position?.x ?? 0),
    y: baseCenter.y + (clip.payload?.transform?.position?.y ?? 0),
    rotation: clip.payload?.transform?.rotation ?? 0,
    scaleX: clip.payload?.transform?.scale?.x ?? 1,
    scaleY: clip.payload?.transform?.scale?.y ?? 1,
  };
  return { frame, bbox, transform, origin, baseCenter };
}

function activeVideoAspectAtTime(
  tracks: readonly TimelineTrack[],
  timeMs: number,
  assets: ReadonlyMap<string, StudioOverlayAsset>,
  mediaAssets: readonly StudioMediaAsset[],
  recordedVideo: HTMLVideoElement | null,
  videoCrop?: StudioVideoCrop,
): number {
  const activeItems = evaluateEditorTimeline(tracks, timeMs).video;
  const active = activeItems[activeItems.length - 1];
  if (!active) {
    return recordedVideo?.videoWidth && recordedVideo.videoHeight
      ? recordedVideo.videoWidth / recordedVideo.videoHeight
      : 16 / 9;
  }
  if (active.clip.payload?.mediaAssetId) {
    const asset = assets.get(active.clip.payload.mediaAssetId) ??
      mediaAssets.find((candidate) => candidate.id === active.clip.payload?.mediaAssetId);
    const width = asset?.width ?? 0;
    const height = asset?.height ?? 0;
    if (width > 0 && height > 0) return width / height;
    return 16 / 9;
  }
  if (
    active.track.id === 'track-video' &&
    videoCrop &&
    videoCrop.width > 0 &&
    videoCrop.height > 0
  ) return videoCrop.width / videoCrop.height;
  return active.track.id === 'track-video' && recordedVideo?.videoWidth && recordedVideo.videoHeight
    ? recordedVideo.videoWidth / recordedVideo.videoHeight
    : 16 / 9;
}

function clipTransformFromGizmo(
  transform: GizmoTransform,
  origin: GizmoPoint,
  geometry: StudioClipCanvasGeometry,
): ClipTransform {
  return {
    position: {
      x: transform.x - geometry.baseCenter.x,
      y: transform.y - geometry.baseCenter.y,
    },
    scale: { x: transform.scaleX, y: transform.scaleY },
    rotation: transform.rotation,
    anchorPoint: {
      x: 0.5 + origin.x / geometry.bbox.width,
      y: 0.5 + origin.y / geometry.bbox.height,
    },
  };
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
  tracks,
  mediaAssets = [],
}: StudioCanvasProps) {
  const {
    durationMs: editorDurationMs,
    isMultiTrack,
    playbackRate,
  } = useTimelineState();
  const playbackDurationMs = isMultiTrack ? editorDurationMs : durationMs;
  const isMultiTrackRef = useRef(isMultiTrack);
  const playbackRateRef = useRef(playbackRate);
  isMultiTrackRef.current = isMultiTrack;
  playbackRateRef.current = playbackRate;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const cameraRef = useRef<StudioCameraState>({ ...IDLE_CAMERA });
  const overlayAssetsRef = useRef<Map<string, StudioOverlayAsset>>(new Map());
  const clipAssetsRef = useRef<Map<string, StudioOverlayAsset>>(new Map());
  const clipVideosRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const clipInstanceAssetsRef = useRef<Map<string, StudioOverlayAsset>>(new Map());
  const clipInstanceVideosRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const clipInstanceSourcesRef = useRef<Map<string, string>>(new Map());
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
  const selectedTimelineClip = useSelectedClip();
  const timelineZooms = useMemo(
    () => tracks
      ? extractZoomsFromTracks(tracks.filter((track) => track.visible), cuts ?? [])
      : zooms,
    [tracks, cuts, zooms],
  );

  const [videoLoaded, setVideoLoaded] = useState(false);
  const [, setClipAssetRevision] = useState(0);
  const [selectedClipActive, setSelectedClipActive] = useState(() => {
    const selected = selectedTimelineClip;
    const time = timelineStore.getState().currentTimeMs;
    return Boolean(
      selected?.track.type === 'video' &&
      selected.track.visible &&
      time >= selected.clip.startMs &&
      time < selected.clip.startMs + selected.clip.durationMs,
    );
  });
  const lastEmittedTimeRef = useRef(0);
  const currentTimeRef = useRef(timelineStore.getState().currentTimeMs);
  const frameClockRef = useRef<number | null>(null);
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
  const tracksRef = useRef<TimelineTrack[]>(tracks ?? []);
  tracksRef.current = tracks ?? [];
  const endedRef = useRef(false);
  const audioMixerRef = useRef<StudioAudioMixer | null>(null);

  // Clean up audio mixer on unmount
  useEffect(() => {
    return () => {
      audioMixerRef.current?.dispose();
      audioMixerRef.current = null;
    };
  }, []);

  const clipTransformPreviewRef = useRef<StudioComposeInput['clipTransformPreview']>(null);
  const selectedGizmoRef = useRef<{
    clip: TimelineTrack['clips'][number];
    track: TimelineTrack;
    geometry: StudioClipCanvasGeometry;
  } | null>(null);

  useEffect(() => {
    const selected = selectedTimelineClip;
    const evaluateActive = (timeMs: number) => {
      const next = Boolean(
        selected?.track.type === 'video' &&
        selected.track.visible &&
        timeMs >= selected.clip.startMs &&
        timeMs < selected.clip.startMs + selected.clip.durationMs,
      );
      setSelectedClipActive((current) => current === next ? current : next);
    };
    evaluateActive(timelineStore.getState().currentTimeMs);
    return timelineStore.subscribeTime(evaluateActive);
  }, [
    selectedTimelineClip?.clip.id,
    selectedTimelineClip?.clip.startMs,
    selectedTimelineClip?.clip.durationMs,
    selectedTimelineClip?.track.visible,
    selectedTimelineClip?.track.type,
  ]);

  useEffect(() => {
    clipTransformPreviewRef.current = null;
  }, [selectedTimelineClip?.clip.id]);

  // The numbers/texture inputs the render loop reads. Stored in refs so prop
  // changes never tear down and re-create the animation loop.
  const renderInputsRef = useRef({
    styling,
    zooms: timelineZooms,
    captions,
    effects: effects ?? [],
    overlays: overlays ?? [],
    videoCrop,
  });
  renderInputsRef.current = {
    styling,
    zooms: timelineZooms,
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

  // Load the media-pool sources referenced by multi-track clips.
  useEffect(() => {
    const activeIds = new Set(mediaAssets.map((asset) => asset.id));
    for (const asset of mediaAssets) {
      if (clipAssetsRef.current.has(asset.id)) continue;
      const url = studioMediaAssetUrl(asset.id);
      if (asset.kind === 'image') {
        const image = new Image();
        image.onload = () => {
          if (image.naturalWidth) {
            clipAssetsRef.current.set(asset.id, { element: image, width: image.naturalWidth, height: image.naturalHeight });
            setClipAssetRevision((revision) => revision + 1);
          }
        };
        image.src = url;
      } else if (asset.kind === 'video') {
        const video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.preload = 'auto';
        video.onloadedmetadata = () => {
          if (video.videoWidth) {
            clipAssetsRef.current.set(asset.id, { element: video, width: video.videoWidth, height: video.videoHeight });
            setClipAssetRevision((revision) => revision + 1);
          }
        };
        video.src = url;
        clipVideosRef.current.set(asset.id, video);
      }
    }
    for (const id of [...clipAssetsRef.current.keys()]) {
      if (!activeIds.has(id)) clipAssetsRef.current.delete(id);
    }
    for (const [id, video] of clipVideosRef.current) {
      if (!activeIds.has(id)) { video.pause(); video.src = ''; clipVideosRef.current.delete(id); }
    }
  }, [mediaAssets]);

  // Give each video placement its own decoder. A transition can need two
  // frames from the same source at once, and sharing one HTMLVideoElement
  // would make those clips seek over each other.
  useEffect(() => {
    const activeClipIds = new Set<string>();
    const assetById = new Map<string, StudioMediaAsset>();
    for (const asset of mediaAssets) assetById.set(asset.id, asset);
    const transitionParticipantIds = new Set(
      (tracks ?? [])
        .filter((track) => track.type === 'transitions')
        .flatMap((track) => track.clips.flatMap((clip) => [
          clip.payload?.fromClipId,
          clip.payload?.toClipId,
        ]))
        .filter((clipId): clipId is string => Boolean(clipId)),
    );

    if (isMultiTrack) {
      for (const track of tracks ?? []) {
        if (track.type !== 'video') continue;
        for (const clip of track.clips) {
          if (!transitionParticipantIds.has(clip.id)) continue;
          const assetId = clip.payload?.mediaAssetId;
          const asset = assetId ? assetById.get(assetId) : undefined;
          const sourceUrl = asset?.kind === 'video'
            ? studioMediaAssetUrl(asset.id)
            : !assetId && track.id === 'track-video'
              ? videoUrl
              : null;
          if (!sourceUrl) continue;

          activeClipIds.add(clip.id);
          const existing = clipInstanceVideosRef.current.get(clip.id);
          if (existing && clipInstanceSourcesRef.current.get(clip.id) === sourceUrl) continue;
          if (existing) {
            existing.pause();
            existing.src = '';
            clipInstanceVideosRef.current.delete(clip.id);
            clipInstanceAssetsRef.current.delete(clip.id);
          }

          const video = document.createElement('video');
          video.muted = true;
          video.playsInline = true;
          video.preload = 'auto';
          video.onloadedmetadata = () => {
            if (clipInstanceVideosRef.current.get(clip.id) !== video || video.videoWidth <= 0) return;
            clipInstanceAssetsRef.current.set(clip.id, {
              element: video,
              width: video.videoWidth,
              height: video.videoHeight,
            });
            setClipAssetRevision((revision) => revision + 1);
          };
          clipInstanceVideosRef.current.set(clip.id, video);
          clipInstanceSourcesRef.current.set(clip.id, sourceUrl);
          video.src = sourceUrl;
        }
      }
    }

    for (const [clipId, video] of clipInstanceVideosRef.current) {
      if (activeClipIds.has(clipId)) continue;
      video.pause();
      video.src = '';
      clipInstanceVideosRef.current.delete(clipId);
      clipInstanceSourcesRef.current.delete(clipId);
      clipInstanceAssetsRef.current.delete(clipId);
    }
  }, [tracks, mediaAssets, videoUrl, isMultiTrack]);

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
    if (!isPlaying || videoUrl || isMultiTrack) return;

    let animId: number;
    let lastTick = performance.now();

    const tick = (now: number) => {
      const delta = now - lastTick;
      lastTick = now;
      const targetDuration = playbackDurationMs || 30000;
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
  }, [isPlaying, videoUrl, isMultiTrack, playbackDurationMs, onTimeUpdate, onEnded]);

  // ── Sync the hidden video (and overlay videos) to the playhead ────────────
  // In multi-track mode the render loop owns all video seeking, so this effect
  // only handles the legacy (single-track) path.  Skipping multi-track here
  // prevents two concurrent seek paths from fighting over the same media
  // elements, which causes visible flicker.
  useEffect(() => {
    const syncVideoTime = (compMs: number) => {
      currentTimeRef.current = compMs;
      // In multi-track mode the render loop manages all media elements.
      if (isMultiTrackRef.current) return;

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

    const render = (now: number) => {
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

      // Legacy takes use the recording element as their clock. Real Editor
      // projects use composition time as the clock, then seek each active
      // source clip independently. This keeps gaps, overlaps and clips longer
      // than the original recording on the same playhead.
      let sourceMs: number;
      let compMs: number;

      if (isMultiTrackRef.current) {
        if (isPlayingRef.current) {
          const previousFrame = frameClockRef.current ?? now;
          const elapsed = Math.max(0, Math.min(100, now - previousFrame));
          const rate = Number.isFinite(playbackRateRef.current)
            ? Math.max(0.1, playbackRateRef.current)
            : 1;
          currentTimeRef.current = Math.min(
            playbackDurationMs ?? Infinity,
            currentTimeRef.current + elapsed * rate,
          );
          frameClockRef.current = now;
        } else {
          frameClockRef.current = null;
        }
        compMs = currentTimeRef.current;
        sourceMs = sourceFromComp(compMs, activeCuts);
      } else if (ready && video) {
        frameClockRef.current = null;
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
      const compositionEnd = playbackDurationMs ?? 0;
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

      const evaluatedTimeline = evaluateEditorTimeline(tracksRef.current, compMs);

      // ── Audio playback ──────────────────────────────────────────────
      if (isMultiTrackRef.current && evaluatedTimeline.audio.length > 0) {
        if (!audioMixerRef.current) {
          audioMixerRef.current = new StudioAudioMixer();
        }
        const rate = Number.isFinite(playbackRateRef.current)
          ? Math.max(0.1, playbackRateRef.current)
          : 1;
        audioMixerRef.current.sync({
          clips: evaluatedTimeline.audio,
          tracks: tracksRef.current,
          compMs,
          playing: isPlayingRef.current,
          rate,
        });
      } else if (audioMixerRef.current) {
        audioMixerRef.current.pause();
      }

      const activeVideoAssetIds = new Set<string>();
      const activeVideoClipIds = new Set<string>();
      for (const item of evaluatedTimeline.video) {
        if (item.itemType !== 'video') continue;
        const assetId = item.clip.payload?.mediaAssetId;
        activeVideoClipIds.add(item.clip.id);
        if (assetId) activeVideoAssetIds.add(assetId);
        const isRecordedSource = !assetId && item.track.id === 'track-video';
        const media = assetId
          ? clipInstanceAssetsRef.current.get(item.clip.id)?.element ?? clipAssetsRef.current.get(assetId)?.element
          : isRecordedSource
            ? clipInstanceAssetsRef.current.get(item.clip.id)?.element ?? video
            : undefined;
        if (!(media instanceof HTMLVideoElement) || !(media.duration > 0)) continue;
        const sourceRate = item.clip.durationMs > 0 && item.clip.sourceDurationMs > 0
          ? item.clip.sourceDurationMs / item.clip.durationMs
          : item.clip.payload?.speed ?? 1;
        const effectiveRate = sourceRate * playbackRateRef.current * (item.transition ? 0.5 : 1);
        const clampedRate = Number.isFinite(effectiveRate) && effectiveRate > 0
          ? Math.max(0.0625, Math.min(16, effectiveRate))
          : 1;
        // Only update playbackRate when it actually changes. Setting it every
        // frame forces the decoder to reconfigure, causing visible flicker.
        if (Math.abs(media.playbackRate - clampedRate) > 0.01) {
          media.playbackRate = clampedRate;
        }
        const seekTo = Math.max(
          0,
          Math.min(item.sourceTimeMs / 1000, Math.max(0, media.duration - 0.05)),
        );
        // During playback, let the video element advance on its own instead of
        // seeking every frame. Seeking a playing video forces the decoder to
        // discard frames, causing visible flicker.  Only seek when paused or
        // when the drift exceeds a frame budget.
        const shouldPlay = isPlayingRef.current;
        const seekDiff = Math.abs(media.currentTime - seekTo);
        if (!shouldPlay && seekDiff > 0.08) media.currentTime = seekTo;
        if (shouldPlay && media.paused) {
          // On initial play or after a pause, seek to the correct position
          media.currentTime = seekTo;
          void media.play().catch(() => {});
        }
        if (!shouldPlay && !media.paused) media.pause();
      }
      for (const [assetId, media] of clipVideosRef.current) {
        if ((isMultiTrackRef.current || !activeVideoAssetIds.has(assetId)) && !media.paused) media.pause();
      }
      for (const [clipId, media] of clipInstanceVideosRef.current) {
        if (!activeVideoClipIds.has(clipId) && !media.paused) media.pause();
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
        tracks: tracksRef.current,
        clipAssets: clipAssetsRef.current,
        clipInstances: clipInstanceAssetsRef.current,
        compTimeMs: compMs,
        clipTransformPreview: clipTransformPreviewRef.current,
        drawWindowChrome: (chromeCtx, frame) => {
          const deviceFrame = style.deviceFrame;
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
        },
      };
      drawStudioFrame(ctx, input);

      // ── 7. Intro & Outro Motion Cards Rendering ──────────────────────────────
      const totalDur =
        playbackDurationMs ||
        (video && video.duration ? video.duration * 1000 : 30000);

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
  }, [onTimeUpdate, playbackDurationMs, onEnded]);

  const handleCanvasPointerDown = useCallback((event: PointerEvent<HTMLCanvasElement>) => {
    if (isPlayingRef.current || event.button !== 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const point = {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
    const compTime = timelineStore.getState().currentTimeMs;
    const frameAspect = activeVideoAspectAtTime(
      tracksRef.current,
      compTime,
      clipAssetsRef.current,
      mediaAssets,
      videoRef.current,
      videoCrop,
    );
    let hit: { track: TimelineTrack; clip: TimelineTrack['clips'][number] } | null = null;

    // The highest painted active clip is the first hit candidate. Once
    // selected, the Trace gizmo owns transform drags and commits them as one
    // undo step.
    const activeVideoItems = evaluateEditorTimeline(
      tracksRef.current,
      compTime,
    ).video;
    for (const item of [...activeVideoItems].reverse()) {
      const { track, clip } = item;
      const asset = clip.payload?.mediaAssetId
        ? clipAssetsRef.current.get(clip.payload.mediaAssetId)
        : undefined;
      const sourceWidth = asset?.width ?? (track.id === 'track-video' ? videoRef.current?.videoWidth : 0) ?? 0;
      const sourceHeight = asset?.height ?? (track.id === 'track-video' ? videoRef.current?.videoHeight : 0) ?? 0;
      if (sourceWidth <= 0 || sourceHeight <= 0) continue;
      const geometry = studioClipCanvasGeometry(
        clip,
        track,
        sourceWidth,
        sourceHeight,
        canvasDims,
        styling,
        videoCrop,
        frameAspect,
      );
      const localPoint = artboardToLocal(point, geometry.transform, geometry.origin);
      if (
        localPoint.x >= geometry.bbox.x &&
        localPoint.x <= geometry.bbox.x + geometry.bbox.width &&
        localPoint.y >= geometry.bbox.y &&
        localPoint.y <= geometry.bbox.y + geometry.bbox.height
      ) {
        hit = { track, clip };
        break;
      }
      if (hit) break;
    }

    if (!hit) {
      timelineStore.setSelectedClipId(null);
      return;
    }
    timelineStore.setSelectedClipId(hit.clip.id);
    event.preventDefault();
  }, [canvasDims, styling, videoCrop]);

  const selectedGizmo = (() => {
    const selected = selectedTimelineClip;
    if (
      !selectedClipActive ||
      !selected ||
      selected.track.type !== 'video' ||
      !selected.track.visible
    ) return null;
    const asset = selected.clip.payload?.mediaAssetId
      ? clipAssetsRef.current.get(selected.clip.payload.mediaAssetId) ??
        mediaAssets.find((candidate) => candidate.id === selected.clip.payload?.mediaAssetId)
      : undefined;
    const sourceWidth = asset?.width ?? (selected.track.id === 'track-video' ? videoRef.current?.videoWidth : 0) ?? 0;
    const sourceHeight = asset?.height ?? (selected.track.id === 'track-video' ? videoRef.current?.videoHeight : 0) ?? 0;
    if (sourceWidth <= 0 || sourceHeight <= 0) return null;
    const frameAspect = activeVideoAspectAtTime(
      tracksRef.current,
      timelineStore.getState().currentTimeMs,
      clipAssetsRef.current,
      mediaAssets,
      videoRef.current,
      videoCrop,
    );
    const geometry = studioClipCanvasGeometry(
      selected.clip,
      selected.track,
      sourceWidth,
      sourceHeight,
      canvasDims,
      styling,
      videoCrop,
      frameAspect,
    );
    const rect = canvasRef.current?.getBoundingClientRect();
    return {
      ...selected,
      geometry,
      zoom: rect && rect.width > 0 ? rect.width / canvasDims.width : 1,
    };
  })();
  selectedGizmoRef.current = selectedGizmo
    ? {
        clip: selectedGizmo.clip,
        track: selectedGizmo.track,
        geometry: selectedGizmo.geometry,
      }
    : null;

  const getCanvasPoint = useCallback((clientX: number, clientY: number): GizmoPoint => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 };
    return {
      x: ((clientX - rect.left) / rect.width) * canvas.width,
      y: ((clientY - rect.top) / rect.height) * canvas.height,
    };
  }, []);

  const handleGizmoPreview = useCallback((preview: { transform: GizmoTransform; origin: GizmoPoint } | null) => {
    const selected = selectedGizmoRef.current;
    clipTransformPreviewRef.current = preview && selected
      ? {
          clipId: selected.clip.id,
          transform: clipTransformFromGizmo(preview.transform, preview.origin, selected.geometry),
        }
      : null;
  }, []);

  const handleGizmoCommit = useCallback((transform: GizmoTransform, origin: GizmoPoint) => {
    const selected = selectedGizmoRef.current;
    if (!selected) return;
    timelineStore.updateClip(
      selected.clip.id,
      {
        payload: {
          transform: clipTransformFromGizmo(transform, origin, selected.geometry),
        },
      },
      selected.track.id,
    );
  }, []);

  const aspectClass =
    styling.aspectRatio === '9:16'
      ? 'aspect-[9/16] max-h-[640px]'
      : styling.aspectRatio === '1:1'
        ? 'aspect-square max-h-[580px]'
        : styling.aspectRatio === '4:3'
          ? 'aspect-[4/3] max-h-[580px]'
          : 'aspect-video max-h-[580px]';

  const hasVideoTrackClips = tracks?.some(
    (track) => track.type === 'video' && track.clips.length > 0,
  ) ?? false;
  const showBlankPlaceholder =
    !videoUrl && !hasVideoTrackClips && (overlays?.length ?? 0) === 0;

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

      {/* Render Canvas + Gizmo overlay */}
      <div className="relative w-full h-full flex items-center justify-center">
        <canvas
          ref={canvasRef}
          width={canvasDims.width}
          height={canvasDims.height}
          className="w-full h-full object-contain touch-none select-none cursor-crosshair"
          onPointerDown={handleCanvasPointerDown}
        />

        {selectedGizmo && (
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            style={{
              // Match the canvas's object-contain scaling so the gizmo overlay
              // aligns with the visual canvas content, not the full wrapper.
              width: '100%',
              height: '100%',
            }}
          >
            <div
              className="relative w-full h-full"
              style={{
                // Force the same aspect ratio so the inner div matches the
                // canvas's visual bounds after object-contain letterboxing.
                aspectRatio: `${canvasDims.width} / ${canvasDims.height}`,
              }}
            >
              <StudioCanvasTransformGizmo
                key={selectedGizmo.clip.id}
                bbox={selectedGizmo.geometry.bbox}
                transform={selectedGizmo.geometry.transform}
                origin={selectedGizmo.geometry.origin}
                zoom={selectedGizmo.zoom}
                disabled={isPlaying || selectedGizmo.track.locked}
                viewBox={{ width: canvasDims.width, height: canvasDims.height }}
                getCanvasPoint={getCanvasPoint}
                onPreview={handleGizmoPreview}
                onCommit={handleGizmoCommit}
              />
            </div>
          </div>
        )}
      </div>

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
                Empty Canvas
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
