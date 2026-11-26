/**
 * components/studio/inspector/ClipEffectsPreviewCanvas.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Live preview canvas for the Clip Effects & Keyframe Studio dialog.
 *
 * Drives the same `renderStudioFrame` pipeline used by the main Studio canvas
 * and export, so WebGL 2 effect passes (`color-grade`, `motion-blur`,
 * `chroma-key`) and Canvas 2D effects render with 1:1 parity.
 *
 * Supports two modes:
 *   - `composite`: renders the full timeline stack at `clip.startMs + localTimeMs`
 *   - `isolated`:  renders only the clip over a checkerboard for keying/alpha
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  GridIcon,
  LayersIcon,
  Maximize2Icon,
  PipetteIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTimelineState } from '@/hooks/use-timeline-store';
import { studioMediaAssetUrl } from '@/lib/studio/media';
import {
  computeCameraTarget,
  IDLE_CAMERA,
} from '@/lib/studio/render/camera';
import { isStudioZoomClip } from '@/lib/studio/effects/zoom-presets';
import { renderStudioFrame } from '@/lib/studio/render/frame-renderer';
import type { StudioComposeInput } from '@/lib/studio/render/compose';
import type { StudioOverlayAsset } from '@/lib/studio/render/overlays';
import { DEFAULT_STUDIO_STYLING } from '@/lib/studio/styling';
import type {
  StudioMediaAsset,
  TimelineClip,
  TimelineTrack,
} from '@/lib/studio/types';
import { cn } from '@/lib/utils';

export type EffectsPreviewMode = 'composite' | 'isolated';

interface ClipEffectsPreviewCanvasProps {
  draftClip: TimelineClip;
  localTimeMs: number;
  previewMode: EffectsPreviewMode;
  onPreviewModeChange: (mode: EffectsPreviewMode) => void;
  mediaAssets?: StudioMediaAsset[];
  eyedropperAvailable?: boolean;
  eyedropperActive?: boolean;
  onToggleEyedropper?: () => void;
  onPickColor?: (hex: string) => void;
  onFrameSample?: (rgba: Uint8ClampedArray) => void;
}

const PREVIEW_WIDTH = 1280;
const PREVIEW_HEIGHT = 720;
const SAMPLE_WIDTH = 160;
const SAMPLE_HEIGHT = 90;
const SAMPLE_INTERVAL_MS = 150;

function toHex(r: number, g: number, b: number): string {
  const hex = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

export function ClipEffectsPreviewCanvas({
  draftClip,
  localTimeMs,
  previewMode,
  onPreviewModeChange,
  mediaAssets = [],
  eyedropperAvailable = false,
  eyedropperActive = false,
  onToggleEyedropper,
  onPickColor,
  onFrameSample,
}: ClipEffectsPreviewCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sampleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const sampleContextRef = useRef<CanvasRenderingContext2D | null>(null);
  const lastSampledAtRef = useRef(Number.NEGATIVE_INFINITY);
  const clipAssetsRef = useRef<Map<string, StudioOverlayAsset>>(new Map());
  const clipVideosRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const [assetRevision, setAssetRevision] = useState(0);
  const { tracks } = useTimelineState();
  const [zoomPercent, setZoomPercent] = useState<number | 'fit'>('fit');

  const isZoomClip = isStudioZoomClip(draftClip);
  // A zoom clip has no pixels of its own — isolating it would render an empty
  // track, so the camera workspace always previews the full composite.
  const effectivePreviewMode: EffectsPreviewMode = isZoomClip
    ? 'composite'
    : previewMode;

  const compTimeMs = draftClip.startMs + Math.max(0, localTimeMs);

  useEffect(() => {
    const activeIds = new Set(mediaAssets.map((a) => a.id));
    for (const asset of mediaAssets) {
      if (clipAssetsRef.current.has(asset.id)) continue;
      const url = studioMediaAssetUrl(asset.id);
      if (asset.kind === 'image') {
        const image = new Image();
        image.onload = () => {
          if (image.naturalWidth) {
            clipAssetsRef.current.set(asset.id, {
              element: image,
              width: image.naturalWidth,
              height: image.naturalHeight,
            });
            setAssetRevision((r) => r + 1);
          }
        };
        image.src = url;
      } else if (asset.kind === 'video') {
        const video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.preload = 'auto';
        video.onloadeddata = () => {
          if (video.videoWidth) {
            clipAssetsRef.current.set(asset.id, {
              element: video,
              width: video.videoWidth,
              height: video.videoHeight,
            });
            setAssetRevision((r) => r + 1);
          }
        };
        video.onseeked = () => setAssetRevision((r) => r + 1);
        video.src = url;
        clipVideosRef.current.set(asset.id, video);
      }
    }
    for (const id of [...clipAssetsRef.current.keys()]) {
      if (!activeIds.has(id)) clipAssetsRef.current.delete(id);
    }
    for (const [id, video] of clipVideosRef.current) {
      if (!activeIds.has(id)) {
        video.pause();
        video.src = '';
        clipVideosRef.current.delete(id);
      }
    }
  }, [mediaAssets]);

  useEffect(() => {
    const videos = clipVideosRef.current;
    return () => {
      for (const video of videos.values()) {
        video.pause();
        video.src = '';
      }
      videos.clear();
    };
  }, []);

  const patchedTracks = useMemo<TimelineTrack[]>(() => {
    if (effectivePreviewMode === 'isolated' || tracks.length === 0) {
      return [
        {
          id: draftClip.trackId || 'preview-track',
          name: 'Preview',
          type: 'video',
          clips: [draftClip],
          muted: false,
          locked: false,
          visible: true,
        },
      ];
    }
    let replaced = false;
    const next = tracks.map((track) => {
      if (!track.clips.some((c) => c.id === draftClip.id)) return track;
      replaced = true;
      return {
        ...track,
        clips: track.clips.map((c) => (c.id === draftClip.id ? draftClip : c)),
      };
    });
    if (!replaced) {
      return [
        ...next,
        {
          id: draftClip.trackId || 'preview-track',
          name: 'Preview',
          type: 'video',
          clips: [draftClip],
          muted: false,
          locked: false,
          visible: true,
        },
      ];
    }
    return next;
  }, [tracks, draftClip, effectivePreviewMode]);

  // Seek the clip's video decoder when localTimeMs changes.
  useEffect(() => {
    const assetId = draftClip.payload?.mediaAssetId as string | undefined;
    if (!assetId) return;
    const video = clipVideosRef.current.get(assetId);
    if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return;
    const sourceSec = Math.max(
      0,
      Math.min(
        video.duration,
        ((draftClip.sourceStartMs ?? 0) + Math.max(0, localTimeMs)) / 1000,
      ),
    );
    if (Math.abs(video.currentTime - sourceSec) > 0.02) {
      try {
        video.currentTime = sourceSec;
      } catch {
        // Ignore seek errors before metadata is ready.
      }
    }
  }, [draftClip.payload?.mediaAssetId, draftClip.sourceStartMs, localTimeMs]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas.getContext('2d');
    } catch {
      ctx = null;
    }
    if (!ctx) return;

    const raf = requestAnimationFrame((now) => {
      if (!ctx) return;
      ctx.clearRect(0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);

      const styling =
        effectivePreviewMode === 'isolated'
          ? {
              ...DEFAULT_STUDIO_STYLING,
              background: 'transparent',
              padding: 0,
            }
          : DEFAULT_STUDIO_STYLING;

      const camera = isZoomClip
        ? computeCameraTarget({
            zooms: [
              {
                id: draftClip.id,
                startMs: draftClip.startMs,
                endMs: draftClip.startMs + Math.max(1, draftClip.durationMs),
                scale: draftClip.payload?.scale ?? 1.5,
                targetX: draftClip.payload?.targetX ?? 0.5,
                targetY: draftClip.payload?.targetY ?? 0.5,
                keyframes: draftClip.payload?.keyframes,
              },
            ],
            timeMs: compTimeMs,
            zoomIntensity: styling.zoomIntensity,
          })
        : IDLE_CAMERA;

      const input: StudioComposeInput = {
        width: PREVIEW_WIDTH,
        height: PREVIEW_HEIGHT,
        styling,
        timeMs: compTimeMs,
        compTimeMs,
        video: null,
        videoReady: false,
        camera: IDLE_CAMERA,
        canvasCamera: isZoomClip ? camera : undefined,
        effects: [],
        captions: [],
        overlays: [],
        overlayAssets: new Map(),
        clipAssets: clipAssetsRef.current,
        tracks: patchedTracks,
      };

      try {
        renderStudioFrame(ctx, input);
        if (
          onFrameSample &&
          now - lastSampledAtRef.current >= SAMPLE_INTERVAL_MS
        ) {
          let sampleCanvas = sampleCanvasRef.current;
          if (!sampleCanvas) {
            sampleCanvas = document.createElement('canvas');
            sampleCanvas.width = SAMPLE_WIDTH;
            sampleCanvas.height = SAMPLE_HEIGHT;
            sampleCanvasRef.current = sampleCanvas;
            sampleContextRef.current = sampleCanvas.getContext('2d', {
              willReadFrequently: true,
            });
          }
          const sampleContext = sampleContextRef.current;
          if (sampleContext) {
            sampleContext.drawImage(
              canvas,
              0,
              0,
              SAMPLE_WIDTH,
              SAMPLE_HEIGHT,
            );
            onFrameSample(
              sampleContext.getImageData(
                0,
                0,
                SAMPLE_WIDTH,
                SAMPLE_HEIGHT,
              ).data,
            );
            lastSampledAtRef.current = now;
          }
        }
      } catch {
        // Ignore transient render errors during headless/test runs.
      }
    });

    return () => cancelAnimationFrame(raf);
  }, [patchedTracks, compTimeMs, effectivePreviewMode, assetRevision, onFrameSample, isZoomClip, draftClip.id, draftClip.startMs, draftClip.durationMs, draftClip.payload?.scale, draftClip.payload?.targetX, draftClip.payload?.targetY, draftClip.payload?.keyframes]);

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!eyedropperActive || !onPickColor) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const px = Math.floor(((event.clientX - rect.left) / rect.width) * canvas.width);
    const py = Math.floor(((event.clientY - rect.top) / rect.height) * canvas.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    try {
      const pixel = ctx.getImageData(
        Math.max(0, Math.min(canvas.width - 1, px)),
        Math.max(0, Math.min(canvas.height - 1, py)),
        1,
        1,
      ).data;
      onPickColor(toHex(pixel[0], pixel[1], pixel[2]));
    } catch {
      // Canvas tainted or unavailable.
    }
  };

  const stepZoom = (delta: number) => {
    setZoomPercent((prev) => {
      const current = prev === 'fit' ? 100 : prev;
      return Math.max(25, Math.min(200, current + delta));
    });
  };

  return (
    <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden bg-zinc-950/90 p-4 select-none">
      {/* Canvas viewport */}
      <div className="flex flex-1 w-full items-center justify-center overflow-auto">
        <div
          className={cn(
            'relative overflow-hidden rounded-md border border-border/50 shadow-2xl',
            previewMode === 'isolated' &&
              !isZoomClip &&
              'bg-[linear-gradient(45deg,#1f2937_25%,transparent_25%),linear-gradient(-45deg,#1f2937_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#1f2937_75%),linear-gradient(-45deg,transparent_75%,#1f2937_75%)] bg-[length:16px_16px] bg-[position:0_0,0_8px,8px_-8px,-8px_0] bg-zinc-900',
          )}
          style={
            zoomPercent === 'fit'
              ? { maxWidth: '100%', maxHeight: '100%', aspectRatio: '16 / 9' }
              : {
                  width: `${(PREVIEW_WIDTH * zoomPercent) / 100}px`,
                  height: `${(PREVIEW_HEIGHT * zoomPercent) / 100}px`,
                }
          }
        >
          <canvas
            ref={canvasRef}
            width={PREVIEW_WIDTH}
            height={PREVIEW_HEIGHT}
            onClick={handleCanvasClick}
            className={cn(
              'block h-full w-full',
              eyedropperActive ? 'cursor-crosshair' : 'cursor-default',
            )}
          />
        </div>
      </div>

      {/* Floating bottom control pill (Qeda-style) */}
      <div className="mt-3 flex items-center gap-1 rounded-full border border-border/60 bg-background/85 px-2.5 py-1 text-xs shadow-lg backdrop-blur-md">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-6 rounded-full"
          aria-label="Zoom out preview"
          onClick={() => stepZoom(-25)}
        >
          <ZoomOutIcon className="size-3.5" />
        </Button>
        <span className="min-w-[3.2rem] text-center font-mono text-[11px] text-muted-foreground">
          {zoomPercent === 'fit' ? 'Fit' : `${zoomPercent}%`}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-6 rounded-full"
          aria-label="Zoom in preview"
          onClick={() => stepZoom(25)}
        >
          <ZoomInIcon className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-6 rounded-full"
          aria-label="Fit preview"
          title="Fit to viewport"
          onClick={() => setZoomPercent('fit')}
        >
          <Maximize2Icon className="size-3" />
        </Button>

        <div className="mx-1 h-3.5 w-px bg-border/60" />

        <Button
          type="button"
          variant={effectivePreviewMode === 'composite' ? 'secondary' : 'ghost'}
          size="sm"
          className="h-6 gap-1 rounded-full px-2 text-[11px]"
          onClick={() => onPreviewModeChange('composite')}
        >
          <LayersIcon className="size-3" />
          Composite
        </Button>
        {!isZoomClip && (
          <Button
            type="button"
            variant={effectivePreviewMode === 'isolated' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-6 gap-1 rounded-full px-2 text-[11px]"
            onClick={() => onPreviewModeChange('isolated')}
          >
            <GridIcon className="size-3" />
            Isolated
          </Button>
        )}

        {eyedropperAvailable && onToggleEyedropper && (
          <>
            <div className="mx-1 h-3.5 w-px bg-border/60" />
            <Button
              type="button"
              variant={eyedropperActive ? 'default' : 'ghost'}
              size="sm"
              className="h-6 gap-1 rounded-full px-2 text-[11px]"
              aria-label="Sample key colour"
              onClick={onToggleEyedropper}
            >
              <PipetteIcon className="size-3" />
              Pick Key
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
