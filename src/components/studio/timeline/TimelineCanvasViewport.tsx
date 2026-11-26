/**
 * components/studio/timeline/TimelineCanvasViewport.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * 60fps Hardware-Accelerated Multi-Track Canvas Viewport.
 *
 * Implements:
 *   - Zero React re-render playhead animation loop
 *   - HiDPI Retina canvas scaling
 *   - High-density rendering for 4 track types:
 *       1. Effects / Kinetic Zooms (Purple gradient with zoom badge)
 *       2. Captions / Subtitles (Teal pill with text snippet)
 *       3. Video Filmstrip (Dark slate with cached frame thumbnails)
 *       4. Audio Waveforms (Vibrant sky-blue mirrored Float32Array peaks)
 *   - Magnetic Smart Snapping (cyan guide line)
 *   - Spatial Hit-Testing state machine (edge trimming, clip moving, blade slicing, ruler scrubbing)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import { timelineStore, useTimelineState } from '@/hooks/use-timeline-store';
import { useTimelineMedia } from '@/hooks/use-timeline-media';
import { drawBitmapIfLive } from '@/lib/image-bitmap-lifetime';
import { evaluateClipKeyframeValues } from '@/lib/studio/keyframes';
import {
  drawClipKeyframeDiamonds,
  drawEffectKeyframeCircle,
  drawKeyframeDiamond,
  findClipKeyframeDiamond,
  defaultAddKeyframePropertyForTrack,
  keyframeUiInfoFor,
  staticValueForProperty,
} from '@/lib/studio/timeline/keyframes-ui';
import {
  buildTimelineRows,
  collectRowBands,
  collectRowMarkers,
  timelineRowsHeight,
  type TimelineRowMarker,
} from '@/lib/studio/timeline/rows';
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
} from '@/components/ui/context-menu';
import type { TimelineClip, TimelineTrack } from '@/lib/studio-types';
import type {
  StudioAddonDefinition,
  StudioAddonId,
} from '@/components/studio/addons/StudioAddonRegistry';

interface TimelineCanvasViewportProps {
  videoUrl: string | null;
  trackHeight?: number;
  rulerHeight?: number;
  onSeek?: (ms: number) => void;
  onTogglePlay?: () => void;
  onScrollYChange?: (scrollY: number) => void;
  onOpenVideoCrop?: () => void;
  addons?: readonly StudioAddonDefinition[];
  onRunAddon?: (addonId: StudioAddonId, clipId: string) => void;
  containerRef?: React.RefObject<HTMLDivElement | null>;
}

type DragMode =
  | { type: 'none' }
  | { type: 'scrub_ruler' }
  | {
      type: 'trim_edge';
      trackId: string;
      clipId: string;
      edge: 'start' | 'end';
      initialClipStartMs: number;
      initialClipDurationMs: number;
      initialPointerX: number;
      ripple: boolean;
    }
  | {
      type: 'move_clip';
      trackId: string;
      clipId: string;
      grabOffsetMs: number;
      clipDurationMs: number;
      originalTrackId: string;
    };

export function TimelineCanvasViewport({
  videoUrl,
  trackHeight = 48,
  rulerHeight = 28,
  onSeek,
  onTogglePlay,
  onScrollYChange,
  containerRef: externalContainerRef,
  onOpenVideoCrop,
  addons = [],
  onRunAddon,
}: TimelineCanvasViewportProps) {
  const internalContainerRef = useRef<HTMLDivElement | null>(null);
  const containerRef = externalContainerRef || internalContainerRef;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // General timeline state subscription (only re-renders on structural mutations: zoom, tool, clips)
  const {
    durationMs,
    zoomPxPerMs,
    tracks,
    activeTool,
    snappingEnabled,
    selectedClipId,
    selectedClipIds,
    isPlaying,
    expandedTrackIds,
  } = useTimelineState();

  // Collapsible rows: track rows carry clips; group/lane rows carry animation
  // and effect markers. Headers build the same rows, so geometry stays in sync.
  const rows = useMemo(
    () => buildTimelineRows(tracks, expandedTrackIds),
    [tracks, expandedTrackIds],
  );

  const rowMarkers = useMemo(() => {
    const map = new Map<string, TimelineRowMarker[]>();
    for (const row of rows) {
      if (row.kind === 'track') continue;
      map.set(row.id, collectRowMarkers(row));
    }
    return map;
  }, [rows]);

  const rowBands = useMemo(() => {
    const map = new Map<string, ReturnType<typeof collectRowBands>>();
    for (const row of rows) {
      if (row.kind === 'track') continue;
      map.set(row.id, collectRowBands(row));
    }
    return map;
  }, [rows]);

  // Waveform & keyframe thumbnail extraction engines
  const { audioPeaks, thumbnails } = useTimelineMedia(videoUrl, durationMs);

  // Mutable refs for high-frequency 60fps tracking without React renders
  const scrollLeftRef = useRef(0);
  const scrollYRef = useRef(0);
  const viewportWidthRef = useRef(800);
  const viewportHeightRef = useRef(300);
  const currentTimeMsRef = useRef(timelineStore.getState().currentTimeMs);
  const snapLineMsRef = useRef<number | null>(null);
  const hoverBladeXRef = useRef<number | null>(null);
  const hoverCutTransitionRef = useRef<{
    cutMs: number;
    trackId: string;
    fromClipId: string;
    toClipId: string;
  } | null>(null);

  // Universal keyframe canvas UI state
  const selectedKeyframeRef = useRef<{ clipId: string; keyframeId: string } | null>(null);
  const hoveredKeyframeRef = useRef<{ clipId: string; keyframeId: string } | null>(null);
  const hoveredSubMarkerRef = useRef<{ clipId: string; keyframeId: string } | null>(null);
  const hoveredRowIdRef = useRef<string | null>(null);
  const keyframeDragRef = useRef<{
    clipId: string;
    keyframeId: string;
    property: string;
    startPointerY: number;
    initialValue: number;
  } | null>(null);

  // Drag interaction state
  const dragModeRef = useRef<DragMode>({ type: 'none' });
  const [contextTarget, setContextTarget] = useState<{
    track?: TimelineTrack;
    clip?: TimelineClip;
  } | null>(null);

  // Scroll and pointer input are coalesced into one animation frame: wheel,
  // momentum, and pointermove all fire faster than the display refreshes, and
  // each event used to force a React re-render plus a HiDPI canvas repaint.
  const scrollRafRef = useRef<number | null>(null);
  const pendingScrollRef = useRef<{
    scrollLeft: number;
    scrollY: number;
  } | null>(null);
  const lastNotifiedScrollYRef = useRef(0);

  // The concrete painter is assigned once `renderCanvas` exists; the no-op
  // default keeps early events (and tests) from throwing.
  const renderCanvasRef = useRef<() => void>(() => {});

  /** Paint at most once per frame, no matter how many events arrive. */
  const scheduleRender = useCallback(() => {
    if (scrollRafRef.current !== null) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      renderCanvasRef.current();
    });
  }, []);

  // Calculate virtual canvas width based on duration and zoom
  const totalTimelineWidth = Math.max(
    800,
    Math.ceil(durationMs * zoomPxPerMs) + 400,
  );
  const totalHeight = rulerHeight + timelineRowsHeight(rows);

  // ── Helper: Find Magnetic Snap Target ─────────────────────────────────────
  const findSnapTarget = useCallback(
    (
      targetMs: number,
      thresholdPx = 10,
    ): { snappedMs: number; didSnap: boolean } => {
      if (!snappingEnabled) return { snappedMs: targetMs, didSnap: false };

      const thresholdMs = thresholdPx / zoomPxPerMs;
      const targets: number[] = [0, currentTimeMsRef.current];

      // Collect all clip start and end points across tracks
      for (const track of tracks) {
        if (!track.visible) continue;
        for (const clip of track.clips) {
          targets.push(clip.startMs);
          targets.push(clip.startMs + clip.durationMs);
        }
      }

      let closestDiff = Infinity;
      let bestTarget = targetMs;

      for (const t of targets) {
        const diff = Math.abs(t - targetMs);
        if (diff <= thresholdMs && diff < closestDiff) {
          closestDiff = diff;
          bestTarget = t;
        }
      }

      if (closestDiff !== Infinity) {
        return { snappedMs: bestTarget, didSnap: true };
      }
      return { snappedMs: targetMs, didSnap: false };
    },
    [snappingEnabled, zoomPxPerMs, tracks],
  );

  // ── High-Performance Canvas Rendering Routine ─────────────────────────────
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;
    const scrollX = scrollLeftRef.current;
    const scrollY = scrollYRef.current;
    const currentTimeMs = currentTimeMsRef.current;
    const snapLineMs = snapLineMsRef.current;

    // Reset transform & scale for HiDPI
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 1. Background
    ctx.fillStyle = '#080c14'; // Ultra-deep slate
    ctx.fillRect(0, 0, width, height);

    // 2. Ruler Lane
    ctx.fillStyle = '#0d131f';
    ctx.fillRect(0, 0, width, rulerHeight);

    const formatRulerTime = (ms: number): string => {
      const totalSec = Math.floor(ms / 1000);
      const m = Math.floor(totalSec / 60);
      const s = totalSec % 60;
      const msPart = Math.floor((ms % 1000) / 100);
      if (zoomPxPerMs > 0.15) {
        return `${m}:${s.toString().padStart(2, '0')}.${msPart}`;
      }
      return `${m}:${s.toString().padStart(2, '0')}`;
    };

    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, rulerHeight - 0.5);
    ctx.lineTo(width, rulerHeight - 0.5);
    ctx.stroke();

    // Ruler Ticks & Time Labels
    // Adapt tick spacing based on zoom level
    let majorIntervalSec = 5;
    if (zoomPxPerMs > 0.25) majorIntervalSec = 1;
    else if (zoomPxPerMs > 0.08) majorIntervalSec = 2;
    else if (zoomPxPerMs < 0.03) majorIntervalSec = 10;

    const majorIntervalMs = majorIntervalSec * 1000;
    const minorIntervalMs = majorIntervalMs / 5;

    const visibleStartMs = Math.max(0, scrollX / zoomPxPerMs - majorIntervalMs);
    const visibleEndMs = (scrollX + width) / zoomPxPerMs + majorIntervalMs;

    const firstMajor =
      Math.floor(visibleStartMs / majorIntervalMs) * majorIntervalMs;

    ctx.font =
      '10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#64748b'; // Muted slate text
    ctx.textBaseline = 'top';

    for (let t = firstMajor; t <= visibleEndMs; t += minorIntervalMs) {
      const isMajor = Math.round(t % majorIntervalMs) === 0;
      const x = Math.round(t * zoomPxPerMs - scrollX);

      if (x < -20 || x > width + 20) continue;

      ctx.beginPath();
      ctx.strokeStyle = isMajor ? '#334155' : '#1e293b';
      ctx.lineWidth = 1;
      const tickH = isMajor ? 12 : 6;
      ctx.moveTo(x + 0.5, rulerHeight - tickH);
      ctx.lineTo(x + 0.5, rulerHeight);
      ctx.stroke();

      if (isMajor) {
        ctx.fillText(formatRulerTime(t), x + 4, 6);
      }
    }

    // 3. Track Lanes Background & Boundaries (Clipped to track area below ruler)
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, rulerHeight, width, Math.max(0, height - rulerHeight));
    ctx.clip();

    let laneIndex = 0;
    rows.forEach((row) => {
      const rowTop = rulerHeight + row.y - scrollY;
      if (rowTop + row.height < rulerHeight || rowTop > height) return;

      if (row.kind === 'track') {
        // Alternating lane backgrounds
        ctx.fillStyle = laneIndex % 2 === 0 ? '#0a0e17' : '#0d121e';
        ctx.fillRect(0, rowTop, width, row.height);
        laneIndex += 1;

        // If track is locked, draw subtle overlay
        if (row.track.locked) {
          ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
          ctx.fillRect(0, rowTop, width, row.height);
        }
      } else if (row.kind === 'group') {
        // Tinted section band with a colored gutter.
        const hovered = hoveredRowIdRef.current === row.id;
        ctx.fillStyle =
          row.group === 'animations'
            ? hovered
              ? 'rgba(168, 85, 247, 0.13)'
              : 'rgba(168, 85, 247, 0.055)'
            : hovered
              ? 'rgba(99, 102, 241, 0.13)'
              : 'rgba(99, 102, 241, 0.055)';
        ctx.fillRect(0, rowTop, width, row.height);

        ctx.fillStyle = row.group === 'animations' ? '#a855f7' : '#6366f1';
        ctx.globalAlpha = 0.55;
        ctx.fillRect(0, rowTop, 2, row.height);
        ctx.globalAlpha = 1;
      } else {
        // Detail lane: recessed strip with a dashed center guide.
        ctx.fillStyle =
          hoveredRowIdRef.current === row.id ? '#0b1019' : '#070a11';
        ctx.fillRect(0, rowTop, width, row.height);

        ctx.strokeStyle = 'rgba(148, 163, 184, 0.07)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(0, rowTop + row.height / 2 + 0.5);
        ctx.lineTo(width, rowTop + row.height / 2 + 0.5);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = row.color;
        ctx.globalAlpha = 0.55;
        ctx.fillRect(0, rowTop, 2, row.height);
        ctx.globalAlpha = 1;
      }

      // Row bottom border
      ctx.strokeStyle = row.kind === 'track' ? '#1e293b' : '#141b28';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(0, rowTop + row.height - 0.5);
      ctx.lineTo(width, rowTop + row.height - 0.5);
      ctx.stroke();
    });

    // 4. Clips Rendering
    rows.forEach((row) => {
      if (row.kind !== 'track') return;
      const track = row.track;
      if (!track.visible) return;

      const trackY = rulerHeight + row.y - scrollY;
      if (trackY + row.height < rulerHeight || trackY > height) return;
      const clipY = trackY + 4;
      const clipH = row.height - 8;

      track.clips.forEach((clip) => {
        const clipX = clip.startMs * zoomPxPerMs - scrollX;
        const clipW = clip.durationMs * zoomPxPerMs;

        // Viewport frustum culling
        if (clipX + clipW < -10 || clipX > width + 10) return;

        const isSelected = clip.id === selectedClipId || selectedClipIds.has(clip.id);
        const radius = 5;

        // Clip container path (rounded rect)
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(clipX, clipY, clipW, clipH, radius);
        ctx.clip();

        // ── Render Specific Track Types ─────────────────────────────────────
        if (track.type === 'overlays') {
          // Media overlays (Amber gradient)
          const grad = ctx.createLinearGradient(
            clipX,
            clipY,
            clipX,
            clipY + clipH,
          );
          grad.addColorStop(0, '#d97706');
          grad.addColorStop(1, '#b45309');
          ctx.fillStyle = grad;
          ctx.fillRect(clipX, clipY, clipW, clipH);

          // Apply transform visual feedback (position offset + rotation)
          const oTransform = clip.payload?.transform;
          if (oTransform) {
            const oRot = oTransform.rotation ?? 0;
            const oPos = oTransform.position;
            if (oRot !== 0 || oPos) {
              const badgeX = clipX + clipW - 28;
              const badgeY = clipY + 4;
              ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
              ctx.beginPath();
              ctx.roundRect(badgeX, badgeY, 22, 16, 4);
              ctx.fill();
              ctx.fillStyle = '#fffbeb';
              ctx.font = 'bold 10px sans-serif';
              ctx.textBaseline = 'middle';
              if (oRot !== 0) {
                ctx.fillText('↻', badgeX + 11, badgeY + 8);
              } else if (oPos) {
                ctx.fillText('✢', badgeX + 11, badgeY + 8);
              }
            }
          }

          // Effects indicator badge (if overlay has attached effects)
          const oEffects = clip.payload?.effects as any[];
          if (oEffects && oEffects.length > 0) {
            const oeEffectBadgeX = clipX + clipW - 50;
            const oeEffectBadgeY = clipY + 4;
            ctx.fillStyle = 'rgba(99, 102, 241, 0.85)'; // Indigo with opacity
            ctx.beginPath();
            ctx.roundRect(oeEffectBadgeX, oeEffectBadgeY, 36, 16, 4);
            ctx.fill();
            ctx.fillStyle = '#e0e7ff';
            ctx.font = 'bold 10px sans-serif';
            ctx.textBaseline = 'middle';
            ctx.fillText(`✦ ${oEffects.length}`, oeEffectBadgeX + 8, oeEffectBadgeY + 8, 20);
          }

          ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
          ctx.fillRect(clipX, clipY, clipW, 2);

          ctx.fillStyle = '#fffbeb';
          ctx.font = 'bold 11px sans-serif';
          ctx.textBaseline = 'middle';
          const src = clip.payload?.srcPath || clip.payload?.filePath || '';
          const base = src.split('/').pop() || 'overlay';
          const kindIcon = clip.payload?.kind === 'image' ? '🖼' : '🎬';
          ctx.fillText(
            `${kindIcon} ${base}`,
            clipX + 8,
            clipY + clipH / 2,
            Math.max(10, clipW - 16),
          );
        } else if (track.type === 'effects') {
          // Track 1: Effects / Kinetic Camera Zooms (Purple gradient)
          const grad = ctx.createLinearGradient(
            clipX,
            clipY,
            clipX,
            clipY + clipH,
          );
          grad.addColorStop(0, '#7c3aed');
          grad.addColorStop(1, '#6d28d9');
          ctx.fillStyle = grad;
          ctx.fillRect(clipX, clipY, clipW, clipH);

          // Subtle inner glow
          ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
          ctx.fillRect(clipX, clipY, clipW, 2);

          // Label
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 11px sans-serif';
          ctx.textBaseline = 'middle';
          const effectType = clip.payload?.effectType;
          const effectLabel =
            !effectType || effectType === 'zoom'
              ? `⚡ Zoom ${(clip.payload?.scale ?? 1.6).toFixed(1)}x`
              : `✦ ${effectType}`;
          ctx.fillText(
            effectLabel,
            clipX + 8,
            clipY + clipH / 2,
            Math.max(10, clipW - 16),
          );
        } else if (track.type === 'captions') {
          // Track 2: Captions / AI Subtitles (Teal gradient)
          const grad = ctx.createLinearGradient(
            clipX,
            clipY,
            clipX,
            clipY + clipH,
          );
          grad.addColorStop(0, '#0d9488');
          grad.addColorStop(1, '#0f766e');
          ctx.fillStyle = grad;
          ctx.fillRect(clipX, clipY, clipW, clipH);

          ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
          ctx.fillRect(clipX, clipY, clipW, 2);

          ctx.fillStyle = '#f0fdfa';
          ctx.font = '500 11px sans-serif';
          ctx.textBaseline = 'middle';
          const textSnippet = clip.payload?.text
            ? `"${clip.payload.text}"`
            : clip.name;
          ctx.fillText(
            textSnippet,
            clipX + 8,
            clipY + clipH / 2,
            Math.max(10, clipW - 16),
          );
        } else if (track.type === 'video') {
          // Track 3: Video Recording Filmstrip
          ctx.fillStyle = '#1e293b'; // Slate 800
          ctx.fillRect(clipX, clipY, clipW, clipH);

          // Apply transform visual feedback (position offset + rotation)
          const vTransform = clip.payload?.transform;
          if (vTransform) {
            const vRot = vTransform.rotation ?? 0;
            const vPos = vTransform.position;
            if (vRot !== 0 || vPos) {
              // Draw a subtle rotation/position indicator badge
              const badgeX = clipX + clipW - 28;
              const badgeY = clipY + 4;
              ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
              ctx.beginPath();
              ctx.roundRect(badgeX, badgeY, 22, 16, 4);
              ctx.fill();
              ctx.fillStyle = '#fbbf24'; // Amber indicator
              ctx.font = 'bold 10px sans-serif';
              ctx.textBaseline = 'middle';
              if (vRot !== 0) {
                ctx.fillText('↻', badgeX + 11, badgeY + 8);
              } else if (vPos) {
                ctx.fillText('✢', badgeX + 11, badgeY + 8);
              }
            }
          }

          // Effects indicator badge (if clip has attached effects)
          const effects = clip.payload?.effects as any[];
          if (effects && effects.length > 0) {
            const effectBadgeX = clipX + clipW - 50;
            const effectBadgeY = clipY + 4;
            ctx.fillStyle = 'rgba(79, 70, 229, 0.8)'; // Indigo with opacity
            ctx.beginPath();
            ctx.roundRect(effectBadgeX, effectBadgeY, 36, 16, 4);
            ctx.fill();
            ctx.fillStyle = '#e0e7ff';
            ctx.font = 'bold 10px sans-serif';
            ctx.textBaseline = 'middle';
            ctx.fillText(`✦ ${effects.length}`, effectBadgeX + 8, effectBadgeY + 8, 20);
          }

          // Filmstrip frame tiles with viewport frustum culling
          const tileWidth = 64; // ~64px wide thumbnail cells
          const totalTiles = Math.ceil(clipW / tileWidth);

          // Only render tiles visible within [0, width]
          const minTileIndex = Math.max(0, Math.floor(-clipX / tileWidth));
          const maxTileIndex = Math.min(
            totalTiles,
            Math.ceil((width - clipX) / tileWidth),
          );

          for (let i = minTileIndex; i < maxTileIndex; i++) {
            const tileX = clipX + i * tileWidth;
            const tileTimeMs =
              clip.sourceStartMs + (i * tileWidth) / zoomPxPerMs;
            const slot = Math.floor(tileTimeMs / 1500);

            // Direct O(1) thumbnail lookup
            const bmp =
              thumbnails.get(slot) ||
              thumbnails.get(Math.floor(tileTimeMs / 1500) * 1500);

            if (bmp) {
              const drawW = Math.min(tileWidth, clipX + clipW - tileX);

              // A closed ImageBitmap is still a valid object, so it reaches this
              // loop looking healthy — but `drawImage` throws on it, and that
              // throw happens mid-paint and takes the rest of the frame with it.
              // Skip a dead one and keep the divider, so a stale frame reads as an
              // empty tile rather than tearing the whole timeline down.
              const drawn = drawBitmapIfLive(
                ctx,
                bmp,
                0,
                0,
                bmp.width,
                bmp.height,
                tileX,
                clipY,
                drawW,
                clipH,
              );

              if (drawn) {
                // Subtle tile divider
                ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(tileX + tileWidth - 0.5, clipY);
                ctx.lineTo(tileX + tileWidth - 0.5, clipY + clipH);
                ctx.stroke();
              }
            }
          }

          // Video name pill top-left
          ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
          ctx.beginPath();
          ctx.roundRect(clipX + 6, clipY + 4, Math.min(clipW - 12, 110), 16, 4);
          ctx.fill();

          ctx.fillStyle = '#f8fafc';
          ctx.font = 'bold 10px sans-serif';
          ctx.textBaseline = 'middle';
          ctx.fillText(clip.name, clipX + 10, clipY + 12, 90);
        } else if (track.type === 'transitions') {
          const grad = ctx.createLinearGradient(clipX, clipY, clipX, clipY + clipH);
          grad.addColorStop(0, '#db2777');
          grad.addColorStop(1, '#9d174d');
          ctx.fillStyle = grad;
          ctx.fillRect(clipX, clipY, clipW, clipH);
          ctx.fillStyle = '#fff1f2';
          ctx.font = 'bold 10px sans-serif';
          ctx.textBaseline = 'middle';
          ctx.fillText(`↔ ${clip.payload?.transitionType ?? 'Fade'}`, clipX + 8, clipY + clipH / 2, Math.max(10, clipW - 16));
        } else if (track.type === 'audio') {
          // Track 4: Audio Waveforms (Sky blue mirrored peaks)
          ctx.fillStyle = '#0c4a6e'; // Deep ocean blue
          ctx.fillRect(clipX, clipY, clipW, clipH);

          const clipPeaks = clip.payload?.waveformPeaks;
          if (clipPeaks && clipPeaks.length > 0) {
            // Per-clip waveform from decoded audio buffer
            const centerY = clipY + clipH / 2;
            const maxAmp = clipH / 2 - 3;

            // Viewport frustum culling for waveform bars
            const barWidth = 2;
            const barGap = 1;
            const stepPx = barWidth + barGap;

            const startX = Math.max(clipX, 0);
            const endX = Math.min(clipX + clipW, width);

            if (startX < endX) {
              ctx.fillStyle = '#38bdf8'; // Sky-400
              ctx.beginPath();

              const firstOffset = (startX - clipX) % stepPx;
              const firstBx =
                startX + (firstOffset === 0 ? 0 : stepPx - firstOffset);

              for (let bx = firstBx; bx < endX; bx += stepPx) {
                const progressAlongClip = (bx - clipX) / clipW;
                const peakIdx = Math.floor(
                  progressAlongClip * clipPeaks.length,
                );
                const amp = clipPeaks[Math.min(peakIdx, clipPeaks.length - 1)] ?? 0.1;

                const barH = Math.max(2, amp * maxAmp);
                ctx.rect(bx, centerY - barH, barWidth, barH * 2);
              }

              // Single batched draw call for all visible bars
              ctx.fill();
            }
          } else if (audioPeaks && audioPeaks.length > 0 && durationMs > 0) {
            // Fallback: use global audio peaks from the recording
            const centerY = clipY + clipH / 2;
            const maxAmp = clipH / 2 - 3;

            const barWidth = 2;
            const barGap = 1;
            const stepPx = barWidth + barGap;

            const startX = Math.max(clipX, 0);
            const endX = Math.min(clipX + clipW, width);

            if (startX < endX) {
              ctx.fillStyle = '#38bdf8'; // Sky-400
              ctx.beginPath();

              const firstOffset = (startX - clipX) % stepPx;
              const firstBx =
                startX + (firstOffset === 0 ? 0 : stepPx - firstOffset);

              for (let bx = firstBx; bx < endX; bx += stepPx) {
                const progressAlongClip = (bx - clipX) / clipW;
                const mediaTimeMs =
                  clip.sourceStartMs + progressAlongClip * clip.durationMs;
                const peakIdx = Math.floor(
                  (mediaTimeMs / durationMs) * audioPeaks.length,
                );
                const amp = audioPeaks[peakIdx] ?? 0.1;

                const barH = Math.max(2, amp * maxAmp);
                ctx.rect(bx, centerY - barH, barWidth, barH * 2);
              }

              ctx.fill();
            }
          } else {
            // Placeholder line if audio is still decoding
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(clipX, clipY + clipH / 2);
            ctx.lineTo(clipX + clipW, clipY + clipH / 2);
            ctx.stroke();
          }

          // Audio name label
          ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
          ctx.beginPath();
          ctx.roundRect(clipX + 6, clipY + 4, Math.min(clipW - 12, 80), 16, 4);
          ctx.fill();

          ctx.fillStyle = '#7dd3fc';
          ctx.font = '500 10px sans-serif';
          ctx.textBaseline = 'middle';
          ctx.fillText(clip.name || 'Voice / Mic', clipX + 10, clipY + 12);
        }

        ctx.restore();

        // ── Animation Keyframe Diamonds ─────────────────────────────────────
        // Small diamond markers on clip edges for clips with enter/exit animations
        const hasEnter = clip.payload?.enterAnimation && clip.payload.enterAnimation.type !== 'none';
        const hasExit = clip.payload?.exitAnimation && clip.payload.exitAnimation.type !== 'none';
        if (hasEnter || hasExit) {
          const diamondSize = 4;
          const diamondY = clipY + clipH / 2;

          if (hasEnter) {
            // Purple diamond at clip start edge
            ctx.fillStyle = '#a855f7'; // Purple-500
            ctx.beginPath();
            ctx.moveTo(clipX, diamondY - diamondSize);
            ctx.lineTo(clipX + diamondSize, diamondY);
            ctx.lineTo(clipX, diamondY + diamondSize);
            ctx.lineTo(clipX - diamondSize, diamondY);
            ctx.closePath();
            ctx.fill();
          }

          if (hasExit) {
            // Orange diamond at clip end edge
            ctx.fillStyle = '#f97316'; // Orange-500
            ctx.beginPath();
            ctx.moveTo(clipX + clipW, diamondY - diamondSize);
            ctx.lineTo(clipX + clipW + diamondSize, diamondY);
            ctx.lineTo(clipX + clipW, diamondY + diamondSize);
            ctx.lineTo(clipX + clipW - diamondSize, diamondY);
            ctx.closePath();
            ctx.fill();
          }
        }

        // ── Universal keyframe diamonds ─────────────────────────────────────
        // Property-addressed keyframes, drawn as colored diamonds on the clip
        // row (drag handles; hover shows the value, selected shows a ring).
        drawClipKeyframeDiamonds(ctx, {
          track,
          clip,
          clipX,
          clipY,
          clipH,
          zoomPxPerMs,
          selectedKeyframeId:
            selectedKeyframeRef.current?.clipId === clip.id
              ? selectedKeyframeRef.current?.keyframeId
              : null,
          hoveredKeyframeId:
            hoveredKeyframeRef.current?.clipId === clip.id
              ? hoveredKeyframeRef.current?.keyframeId
              : null,
          maxRight: clipX + clipW,
          onTooltip: (text, x, y, maxWidth) => {
            const tw = Math.min(
              ctx.measureText(text).width + 10,
              Math.max(0, maxWidth),
            );
            if (tw < 20) return;
            const tx = Math.min(x, clipX + clipW - 6 - tw);
            ctx.save();
            ctx.fillStyle = 'rgba(8, 12, 20, 0.93)';
            ctx.beginPath();
            ctx.roundRect(tx - 3, y - 5, tw, 13, 4);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = '10px sans-serif';
            ctx.textBaseline = 'middle';
            ctx.fillText(text, tx + 4, y + 4);
            ctx.restore();
          },
        });

        // ── Clip Outer Border & Trim Handles ────────────────────────────────
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(clipX, clipY, clipW, clipH, radius);

        if (isSelected) {
          ctx.strokeStyle = '#60a5fa'; // Bright blue selection border
          ctx.lineWidth = 2;
          ctx.stroke();

          // Left & Right In/Out Trim Handles
          const handleW = 5;
          ctx.fillStyle = '#93c5fd';
          // Left handle
          ctx.beginPath();
          ctx.roundRect(clipX, clipY, handleW, clipH, [radius, 0, 0, radius]);
          ctx.fill();
          // Right handle
          ctx.beginPath();
          ctx.roundRect(clipX + clipW - handleW, clipY, handleW, clipH, [
            0,
            radius,
            radius,
            0,
          ]);
          ctx.fill();
        } else {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        // ── Clip Border Outline ──────────────────────────────────────────────
        ctx.restore(); // Exit clip path
        
        // Draw clip boundary stroke
        const borderColor = isSelected
          ? 'rgba(255, 255, 255, 0.8)'
          : 'rgba(255, 255, 255, 0.3)';
        const borderWidth = isSelected ? 2 : 1;
        
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = borderWidth;
        ctx.beginPath();
        ctx.roundRect(clipX, clipY, clipW, clipH, radius);
        ctx.stroke();
        
        // Resize handle indicators (top-left & top-right edges)
        if (isSelected && clipW > 20) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
          ctx.fillRect(clipX, clipY, 2, 8); // Left edge indicator
          ctx.fillRect(clipX + clipW - 2, clipY, 2, 8); // Right edge indicator
        }
      });
    });

    // 4b. Animation & Effect Lanes
    rows.forEach((row) => {
      if (row.kind === 'track') return;

      const rowTop = rulerHeight + row.y - scrollY;
      if (rowTop + row.height < rulerHeight || rowTop > height) return;

      const centerY = rowTop + row.height / 2;

      // Soft tinted bands over the clip extents where the lane applies.
      for (const band of rowBands.get(row.id) ?? []) {
        const bandStartX = band.startMs * zoomPxPerMs - scrollX;
        const bandEndX = band.endMs * zoomPxPerMs - scrollX;
        if (bandEndX < 0 || bandStartX > width) continue;
        const x = Math.max(0, bandStartX);
        const w = Math.min(width, bandEndX) - x;
        if (w <= 0) continue;
        ctx.fillStyle = band.color;
        ctx.globalAlpha = row.kind === 'group' ? 0.055 : 0.085;
        ctx.fillRect(x, rowTop + 2, w, row.height - 4);
        ctx.globalAlpha = 1;
      }

      // Keyframe markers: diamonds for animated properties, circles for
      // effect intensity. Group rows aggregate every lane in the section.
      for (const marker of rowMarkers.get(row.id) ?? []) {
        const cx = marker.timeMs * zoomPxPerMs - scrollX;
        if (cx < -8 || cx > width + 8) continue;

        const isSelected =
          Boolean(marker.keyframeId) &&
          selectedKeyframeRef.current?.clipId === marker.clipId &&
          selectedKeyframeRef.current?.keyframeId === marker.keyframeId;
        const isHovered =
          Boolean(marker.keyframeId) &&
          hoveredSubMarkerRef.current?.clipId === marker.clipId &&
          hoveredSubMarkerRef.current?.keyframeId === marker.keyframeId;

        if (marker.shape === 'circle') {
          drawEffectKeyframeCircle(ctx, cx, centerY, marker.color, {
            isSelected,
            isHovered,
          });
        } else {
          drawKeyframeDiamond(
            ctx,
            cx,
            centerY,
            {
              property: marker.property ?? '',
              label: marker.label,
              color: marker.color,
              min: 0,
              max: 1,
              step: 1,
              unitsPerPixelDown: 1,
              rowOffset: 0,
            },
            { isSelected, isHovered },
          );
        }
      }
    });

    // 5. Blade Cut Cursor Line (If Blade tool is active)
    if (activeTool === 'blade' && hoverBladeXRef.current !== null) {
      const bladeX = hoverBladeXRef.current;
      ctx.save();
      ctx.strokeStyle = '#f43f5e'; // Rose-500
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(bladeX, rulerHeight);
      ctx.lineTo(bladeX, height);
      ctx.stroke();
      ctx.restore();
    }

    // 6. Magnetic Snap Guide Line (Glowing cyan)
    if (snapLineMs !== null) {
      const snapX = snapLineMs * zoomPxPerMs - scrollX;
      if (snapX >= 0 && snapX <= width) {
        ctx.save();
        ctx.strokeStyle = '#06b6d4'; // Cyan-500
        ctx.lineWidth = 1.5;
        ctx.shadowColor = '#06b6d4';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(snapX, rulerHeight);
        ctx.lineTo(snapX, height);
        ctx.stroke();
        ctx.restore();
      }
    }

    // 6.5. Transition Hover Indicator (pink dashed line with icon)
    const hoverCut = hoverCutTransitionRef.current;
    if (hoverCut) {
      const cutX = hoverCut.cutMs * zoomPxPerMs - scrollX;
      if (cutX >= 0 && cutX <= width) {
        // Find the track's Y position
        const trackRow = rows.find(
          (row) => row.kind === 'track' && row.track.id === hoverCut.trackId,
        );
        if (trackRow) {
          const trackY = rulerHeight + trackRow.y - scrollYRef.current;
          ctx.save();
          // Dashed vertical line
          ctx.strokeStyle = 'rgba(219, 39, 119, 0.8)'; // Pink-600
          ctx.lineWidth = 2;
          ctx.setLineDash([6, 4]);
          ctx.shadowColor = 'rgba(219, 39, 119, 0.5)';
          ctx.shadowBlur = 6;
          ctx.beginPath();
          ctx.moveTo(cutX, trackY);
          ctx.lineTo(cutX, trackY + trackRow.height);
          ctx.stroke();
          // Transition icon (double arrow) at center of track
          const iconY = trackY + trackRow.height / 2;
          ctx.fillStyle = '#db2777'; // Pink-600
          ctx.beginPath();
          ctx.roundRect(cutX - 14, iconY - 10, 28, 20, 4);
          ctx.fill();
          ctx.fillStyle = '#fff1f2';
          ctx.font = 'bold 11px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('↔', cutX, iconY);
          ctx.restore();
        }
      }
    }

    ctx.restore(); // Restore tracks area clip

    // 7. Playhead Needle & Scrubber Head (Enhanced Visibility with Glow)
    const playheadX = currentTimeMs * zoomPxPerMs - scrollX;
    if (playheadX >= -10 && playheadX <= width + 10) {
      ctx.save();

      // Playhead glow effect (shadow underneath)
      ctx.shadowColor = 'rgba(239, 68, 68, 0.4)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;

      // Playhead vertical line - bold and vibrant
      ctx.strokeStyle = '#ff3333'; // Brighter red
      ctx.lineWidth = 2.5;
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.moveTo(playheadX, rulerHeight);
      ctx.lineTo(playheadX, height);
      ctx.stroke();

      ctx.shadowColor = 'rgba(0, 0, 0, 0)'; // Clear shadow

      // Playhead triangular pointer head in ruler - more prominent
      ctx.fillStyle = '#ff3333';
      ctx.beginPath();
      ctx.moveTo(playheadX - 7, 0);
      ctx.lineTo(playheadX + 7, 0);
      ctx.lineTo(playheadX + 7, rulerHeight - 6);
      ctx.lineTo(playheadX, rulerHeight + 2);
      ctx.lineTo(playheadX - 7, rulerHeight - 6);
      ctx.closePath();
      ctx.fill();

      // Center bright dot on playhead
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(playheadX, rulerHeight - 3, 2.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }, [
    rulerHeight,
    trackHeight,
    tracks,
    rows,
    rowMarkers,
    rowBands,
    zoomPxPerMs,
    selectedClipId,
    selectedClipIds,
    activeTool,
    audioPeaks,
    thumbnails,
    durationMs,
  ]);
  renderCanvasRef.current = renderCanvas;

  // ── High-Frequency Playhead Synchronization & RAF Loop ────────────────────
  useEffect(() => {
    // Subscribe to playhead changes without triggering React re-renders
    const unsubscribeTime = timelineStore.subscribeTime((ms) => {
      currentTimeMsRef.current = ms;
      // If not currently playing in RAF loop, request single frame redraw
      if (!timelineStore.getState().isPlaying) {
        renderCanvasRef.current();
      }
    });

    return () => {
      unsubscribeTime();
    };
  }, []);

  // 60fps RAF Loop when playing
  useEffect(() => {
    let animId: number;

    const tick = () => {
      renderCanvasRef.current();
      if (timelineStore.getState().isPlaying) {
        animId = requestAnimationFrame(tick);
      }
    };

    if (isPlaying) {
      animId = requestAnimationFrame(tick);
    } else {
      renderCanvasRef.current();
    }

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [isPlaying]);

  // Cancel a pending coalesced frame when the viewport unmounts.
  useEffect(() => {
    return () => {
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
      timelineStore.endUndoTransaction();
    };
  }, []);

  // Repaint when the drawing inputs change (clip drag, trim, selection, zoom).
  // `renderCanvas` identity changes exactly when one of those inputs does, and
  // this keeps the canvas in step without re-running the playhead subscription
  // or the 60fps loop.
  useEffect(() => {
    renderCanvasRef.current();
  }, [renderCanvas]);

  // Redraw when thumbnails or audio peaks become available
  useEffect(() => {
    renderCanvasRef.current();
  }, [thumbnails, audioPeaks]);

  // ── Canvas Resize Observer & HiDPI Setup ──────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = rect.width;
      const h = Math.max(100, Math.floor(rect.height));

      viewportWidthRef.current = w;
      viewportHeightRef.current = h;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      canvas.style.marginBottom = `-${h}px`;

      renderCanvasRef.current();
    };

    updateSize();

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => {
        updateSize();
      });
      ro.observe(container);
    }

    return () => ro?.disconnect();
  }, [totalHeight, containerRef]);

  // ── Native Horizontal & Vertical Scroll Synchronization ───────────────────
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    // Refs stay current for hit-testing; only the expensive work is deferred.
    scrollLeftRef.current = e.currentTarget.scrollLeft;
    scrollYRef.current = e.currentTarget.scrollTop;
    pendingScrollRef.current = {
      scrollLeft: e.currentTarget.scrollLeft,
      scrollY: e.currentTarget.scrollTop,
    };

    if (scrollRafRef.current === null) {
      scrollRafRef.current = requestAnimationFrame(() => {
        scrollRafRef.current = null;
        const pending = pendingScrollRef.current;
        if (!pending) return;
        pendingScrollRef.current = null;

        timelineStore.setScrollTimeMs(pending.scrollLeft / zoomPxPerMs);
        // Purely vertical scrolling moves only the header strip; skipping the
        // store notification avoids re-rendering the canvas and toolbar.
        if (pending.scrollY !== lastNotifiedScrollYRef.current) {
          lastNotifiedScrollYRef.current = pending.scrollY;
          onScrollYChange?.(pending.scrollY);
        }
        renderCanvasRef.current();
      });
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    // Zoom in/out with Ctrl / Cmd + Wheel
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const zoomDelta = e.deltaY < 0 ? 1.15 : 0.87;
      const currentZoom = timelineStore.getState().zoomPxPerMs;
      const newZoom = Math.max(0.01, Math.min(0.5, currentZoom * zoomDelta));
      timelineStore.setZoomPxPerMs(newZoom);
    }
  };

  // ── Hit-Testing Engine ────────────────────────────────────────────────────
  const hitTest = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return null;

      const rect = canvas.getBoundingClientRect();
      const pointerX = clientX - rect.left;
      const pointerY = clientY - rect.top;

      // 1. Is pointer in ruler?
      if (pointerY <= rulerHeight) {
        return { type: 'ruler' as const, pointerX, pointerY };
      }

      // 2. Which row is it in? (Account for vertical track scroll)
      // Rows are shared with the header panel, so group / lane rows occupy
      // real vertical space and can be hit-tested like any other band.
      const contentY = pointerY - rulerHeight + scrollYRef.current;
      const row = rows.find(
        (candidate) => contentY >= candidate.y && contentY < candidate.y + candidate.height,
      );
      if (!row) {
        return { type: 'empty' as const, pointerX, pointerY };
      }

      const scrollX = scrollLeftRef.current;
      const rowTop = rulerHeight + row.y - scrollYRef.current;

      // 2a. Animation / effect rows: markers first, then the lane itself.
      if (row.kind !== 'track') {
        const centerY = rowTop + row.height / 2;

        for (const marker of rowMarkers.get(row.id) ?? []) {
          if (!marker.keyframeId) continue;
          const markerX = marker.timeMs * zoomPxPerMs - scrollX;
          if (
            Math.abs(pointerX - markerX) <= 6 &&
            Math.abs(pointerY - centerY) <= Math.max(6, row.height / 2 - 2)
          ) {
            const clip = row.track.clips.find((c) => c.id === marker.clipId);
            return {
              type: 'row_marker' as const,
              row,
              track: row.track,
              clip,
              marker,
              pointerX,
              pointerY,
            };
          }
        }

        return {
          type: row.kind === 'group' ? ('row_group' as const) : ('row_lane' as const),
          row,
          track: row.track,
          pointerX,
          pointerY,
        };
      }

      // 2b. Clip rows.
      const track = row.track;
      const trackY = rowTop;
      const clipY = trackY + 4;
      const clipH = row.height - 8;

      // 3. Check clips inside this track
      for (const clip of track.clips) {
        const clipX = clip.startMs * zoomPxPerMs - scrollX;
        const clipW = clip.durationMs * zoomPxPerMs;

        if (pointerX >= clipX && pointerX <= clipX + clipW) {
          // Universal keyframe diamonds: drag handles; checked before the
          // clip body/edges since they're the interactive handles.
          const keyframeHit = findClipKeyframeDiamond(
            track,
            clip,
            clipX,
            clipY,
            clipH,
            pointerX,
            pointerY,
            zoomPxPerMs,
          );
          if (keyframeHit) {
            return {
              type: 'clip_keyframe' as const,
              track,
              clip,
              keyframeId: keyframeHit.keyframe.id,
              property: keyframeHit.property,
              pointerX,
              pointerY,
            };
          }

          // Check left/right edge within 6px
          const distToLeft = Math.abs(pointerX - clipX);
          const distToRight = Math.abs(pointerX - (clipX + clipW));

          if (distToLeft <= 6) {
            return {
              type: 'clip_edge' as const,
              edge: 'start' as const,
              track,
              clip,
              pointerX,
              pointerY,
            };
          }
          if (distToRight <= 6) {
            return {
              type: 'clip_edge' as const,
              edge: 'end' as const,
              track,
              clip,
              pointerX,
              pointerY,
            };
          }

          return {
            type: 'clip_body' as const,
            track,
            clip,
            pointerX,
            pointerY,
          };
        }
      }

      return { type: 'track_lane' as const, track, pointerX, pointerY };
    },
    [rulerHeight, rows, rowMarkers, zoomPxPerMs],
  );

  // ── Pointer Event Handlers ────────────────────────────────────────────────

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const hit = hitTest(e.clientX, e.clientY);
    if (!hit) return;

    // Capture pointer events for smooth dragging outside canvas bounds
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    const scrollX = scrollLeftRef.current;

    if (hit.type === 'ruler') {
      // Seek playhead to clicked time
      const clickTimeMs = (hit.pointerX + scrollX) / zoomPxPerMs;
      const { snappedMs, didSnap } = findSnapTarget(clickTimeMs);
      snapLineMsRef.current = didSnap ? snappedMs : null;
      timelineStore.seek(snappedMs, true);
      onSeek?.(snappedMs);
      dragModeRef.current = { type: 'scrub_ruler' };
      renderCanvas();
      return;
    }

    if (hit.type === 'row_group') {
      timelineStore.toggleTrackExpanded(hit.track.id);
      renderCanvas();
      return;
    }

    if (hit.type === 'row_marker' && hit.clip) {
      timelineStore.setSelectedClipId(hit.clip.id);
      selectedKeyframeRef.current = {
        clipId: hit.clip.id,
        keyframeId: hit.marker.keyframeId!,
      };
      dragModeRef.current = { type: 'none' };
      renderCanvas();
      return;
    }

    if (hit.type === 'row_lane') {
      const clickTimeMs = (hit.pointerX + scrollX) / zoomPxPerMs;
      const clip = hit.track.clips.find(
        (candidate) =>
          clickTimeMs >= candidate.startMs &&
          clickTimeMs <= candidate.startMs + candidate.durationMs,
      );
      timelineStore.setSelectedClipId(clip?.id ?? null);
      if (!clip) timelineStore.setSelectedTrackId(hit.track.id);
      selectedKeyframeRef.current = null;
      dragModeRef.current = { type: 'none' };
      renderCanvas();
      return;
    }

    if (hit.type === 'clip_keyframe') {
      timelineStore.setSelectedClipId(hit.clip.id);
      selectedKeyframeRef.current = {
        clipId: hit.clip.id,
        keyframeId: hit.keyframeId,
      };
      const kf = hit.clip.payload?.keyframes?.find((k) => k.id === hit.keyframeId);
      keyframeDragRef.current = kf
        ? {
            clipId: hit.clip.id,
            keyframeId: hit.keyframeId,
            property: hit.property,
            startPointerY: hit.pointerY,
            initialValue: kf.value,
          }
        : null;
      if (keyframeDragRef.current) timelineStore.beginUndoTransaction();
      dragModeRef.current = { type: 'none' };
      return;
    }

    if (hit.type === 'clip_body') {
      if (activeTool === 'blade') {
        // Razor blade split
        const splitTimeMs = (hit.pointerX + scrollX) / zoomPxPerMs;
        timelineStore.splitClipAt(hit.track.id, hit.clip.id, splitTimeMs);
        return;
      }

      // Clicking clip body clears keyframe-diamond selection.
      selectedKeyframeRef.current = null;

      // Shift+Click toggles multi-select without starting a drag
      if (e.shiftKey) {
        timelineStore.toggleSelectedClipId(hit.clip.id);
        renderCanvas();
        return;
      }

      // Select clip & record snapshot for undo
      timelineStore.setSelectedClipId(hit.clip.id);
      timelineStore.beginUndoTransaction();

      // Start clip move drag
      const pointerTimeMs = (hit.pointerX + scrollX) / zoomPxPerMs;
      dragModeRef.current = {
        type: 'move_clip',
        trackId: hit.track.id,
        clipId: hit.clip.id,
        grabOffsetMs: pointerTimeMs - hit.clip.startMs,
        clipDurationMs: hit.clip.durationMs,
        originalTrackId: hit.track.id,
      };
      return;
    }

    if (hit.type === 'clip_edge') {
      if (activeTool === 'blade') return;

      timelineStore.setSelectedClipId(hit.clip.id);
      timelineStore.beginUndoTransaction();
      dragModeRef.current = {
        type: 'trim_edge',
        trackId: hit.track.id,
        clipId: hit.clip.id,
        edge: hit.edge,
        initialClipStartMs: hit.clip.startMs,
        initialClipDurationMs: hit.clip.durationMs,
        initialPointerX: hit.pointerX,
        ripple: e.shiftKey,
      };
      return;
    }

    // Clicked empty background — check if hovering over a cut for transition insertion
    if (hoverCutTransitionRef.current) {
      const cut = hoverCutTransitionRef.current;
      timelineStore.seek(cut.cutMs, true);
      onSeek?.(cut.cutMs);
      timelineStore.addTransitionClip({
        transitionType: 'fade',
        durationMs: 500,
      });
      hoverCutTransitionRef.current = null;
      renderCanvas();
      return;
    }
    if (hit.type === 'track_lane') {
      timelineStore.setSelectedTrackId(hit.track.id);
    }
    timelineStore.setSelectedClipId(null);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const pointerX = e.clientX - rect.left;
    const pointerY = e.clientY - rect.top;
    const scrollX = scrollLeftRef.current;
    const currentDrag = dragModeRef.current;

    // Update Blade guide cursor if Blade tool active
    if (activeTool === 'blade') {
      hoverBladeXRef.current = pointerX;
      canvas.style.cursor = 'crosshair';
      scheduleRender();
    } else {
      hoverBladeXRef.current = null;
    }

    // ── Universal keyframe drag: horizontal = time, vertical = value ──────
    if (keyframeDragRef.current) {
      const drag = keyframeDragRef.current;
      const clip = timelineStore
        .getState()
        .tracks.flatMap((t) => t.clips)
        .find((c) => c.id === drag.clipId);
      const kf = clip?.payload?.keyframes?.find((k) => k.id === drag.keyframeId);
      if (clip && kf) {
        const newTimeMs = Math.max(
          0,
          Math.min(clip.durationMs, (pointerX + scrollX) / zoomPxPerMs),
        );
        let newValue = kf.value;
        const info = keyframeUiInfoFor(drag.property);
        if (info) {
          const deltaY = pointerY - drag.startPointerY;
          newValue = Math.max(
            info.min,
            Math.min(
              info.max,
              drag.initialValue - deltaY * info.unitsPerPixelDown,
            ),
          );
        }
        if (Math.abs(newTimeMs - kf.timeMs) > 0.1) {
          timelineStore.updateClipKeyframeTime(clip.id, drag.keyframeId, newTimeMs);
        }
        if (Math.abs(newValue - kf.value) > 0.005) {
          timelineStore.updateClipKeyframeValue(clip.id, drag.keyframeId, newValue);
        }
      }
      scheduleRender();
      return;
    }

    // ── Hover keyframe diamonds: highlight + tooltip ─────────────────────
    const hoverHit = hitTest(e.clientX, e.clientY);
    const hoveredId =
      hoverHit?.type === 'clip_keyframe'
        ? { clipId: hoverHit.clip.id, keyframeId: hoverHit.keyframeId }
        : null;
    const wasHovered = hoveredKeyframeRef.current;
    const sameHover =
      hoveredId?.clipId === wasHovered?.clipId &&
      hoveredId?.keyframeId === wasHovered?.keyframeId;
    if (!sameHover) {
      hoveredKeyframeRef.current = hoveredId;
      canvas.style.cursor = hoveredId ? 'move' : '';
      scheduleRender();
    }

    // Sub-row markers (animation / effect lanes) get their own hover state so
    // the canvas can highlight them without touching clip-row keyframes.
    const hoveredSubId =
      hoverHit?.type === 'row_marker' && hoverHit.marker.keyframeId
        ? {
            clipId: hoverHit.marker.clipId,
            keyframeId: hoverHit.marker.keyframeId,
          }
        : null;
    const wasSubHovered = hoveredSubMarkerRef.current;
    const sameSubHover =
      hoveredSubId?.clipId === wasSubHovered?.clipId &&
      hoveredSubId?.keyframeId === wasSubHovered?.keyframeId;
    if (!sameSubHover) {
      hoveredSubMarkerRef.current = hoveredSubId;
      if (hoveredSubId) canvas.style.cursor = 'move';
      scheduleRender();
    }

    // Row hover: group rows brighten under the pointer so the expand target
    // reads as clickable without moving the mouse to the header panel.
    const hoveredRowId =
      hoverHit &&
      (hoverHit.type === 'row_group' ||
        hoverHit.type === 'row_lane' ||
        hoverHit.type === 'row_marker')
        ? hoverHit.row.id
        : null;
    if (hoveredRowId !== hoveredRowIdRef.current) {
      hoveredRowIdRef.current = hoveredRowId;
      scheduleRender();
    }

    // ── Active Drag State Machine ───────────────────────────────────────────
    if (currentDrag.type === 'scrub_ruler') {
      const rawTimeMs = (pointerX + scrollX) / zoomPxPerMs;
      const { snappedMs, didSnap } = findSnapTarget(rawTimeMs);
      snapLineMsRef.current = didSnap ? snappedMs : null;
      timelineStore.seek(snappedMs, false);
      onSeek?.(snappedMs);
      scheduleRender();
      return;
    }

    if (currentDrag.type === 'move_clip') {
      const rawTargetStartMs =
        (pointerX + scrollX) / zoomPxPerMs - currentDrag.grabOffsetMs;
      const { snappedMs: snappedStartMs, didSnap: snappedStart } =
        findSnapTarget(rawTargetStartMs);
      const { snappedMs: snappedEndMs, didSnap: snappedEnd } = findSnapTarget(
        rawTargetStartMs + currentDrag.clipDurationMs,
      );

      let finalStartMs = rawTargetStartMs;
      if (snappedStart) {
        finalStartMs = snappedStartMs;
        snapLineMsRef.current = snappedStartMs;
      } else if (snappedEnd) {
        finalStartMs = snappedEndMs - currentDrag.clipDurationMs;
        snapLineMsRef.current = snappedEndMs;
      } else {
        snapLineMsRef.current = null;
      }

      // Detect if dragged over a different track (cross-track move). Group and
      // lane rows resolve to their parent track, so dragging onto an expanded
      // animation lane still moves the clip to the owning track.
      const hit = hitTest(e.clientX, e.clientY);
      if (hit && 'track' in hit && hit.track) {
        const targetTrackId = hit.track.id;
        if (targetTrackId !== currentDrag.originalTrackId) {
          // Cross-track move
          const success = timelineStore.moveClipToTrack(
            currentDrag.clipId,
            currentDrag.originalTrackId,
            targetTrackId,
            finalStartMs,
          );
          if (success) {
            currentDrag.trackId = targetTrackId;
          }
        } else {
          timelineStore.moveClip(
            currentDrag.trackId,
            currentDrag.clipId,
            finalStartMs,
          );
        }
      } else {
        timelineStore.moveClip(
          currentDrag.trackId,
          currentDrag.clipId,
          finalStartMs,
        );
      }
      scheduleRender();
      return;
    }

    if (currentDrag.type === 'trim_edge') {
      const rawEdgeMs = (pointerX + scrollX) / zoomPxPerMs;
      const { snappedMs, didSnap } = findSnapTarget(rawEdgeMs);
      snapLineMsRef.current = didSnap ? snappedMs : null;

      if (currentDrag.ripple) {
        timelineStore.rippleTrimClip(
          currentDrag.trackId,
          currentDrag.clipId,
          currentDrag.edge,
          snappedMs,
        );
      } else {
        timelineStore.trimClip(
          currentDrag.trackId,
          currentDrag.clipId,
          currentDrag.edge,
          snappedMs,
        );
      }
      scheduleRender();
      return;
    }

    // ── Idle Cursor Update Based on Hover Hit-Test ──────────────────────────
    if (activeTool !== 'blade') {
      const hit = hitTest(e.clientX, e.clientY);
      if (hit?.type === 'clip_edge') {
        canvas.style.cursor = 'col-resize';
      } else if (hit?.type === 'clip_body') {
        canvas.style.cursor = 'grab';
      } else if (hit?.type === 'ruler') {
        canvas.style.cursor = 'pointer';
      } else if (hit?.type === 'row_marker') {
        canvas.style.cursor = 'move';
      } else if (hit?.type === 'row_group') {
        canvas.style.cursor = 'pointer';
      } else {
        canvas.style.cursor = 'default';
      }

      // ── Transition Hover Detection ────────────────────────────────────────
      // Detect when hovering near a cut between two adjacent video clips
      if (hit && hit.type === 'track_lane' && hit.track.type === 'video') {
        const hoverTimeMs = (pointerX + scrollX) / zoomPxPerMs;
        const CUT_HOVER_THRESHOLD_MS = 50; // How close to the cut to trigger
        const clips = hit.track.clips.sort((a, b) => a.startMs - b.startMs);
        for (let i = 0; i < clips.length - 1; i++) {
          const fromClip = clips[i];
          const toClip = clips[i + 1];
          const cutMs = fromClip.startMs + fromClip.durationMs;
          // Check if clips are adjacent (within small gap)
          if (Math.abs(toClip.startMs - cutMs) < 100) {
            const dist = Math.abs(hoverTimeMs - cutMs);
            if (dist < CUT_HOVER_THRESHOLD_MS) {
              hoverCutTransitionRef.current = {
                cutMs,
                trackId: hit.track.id,
                fromClipId: fromClip.id,
                toClipId: toClip.id,
              };
              canvas.style.cursor = 'pointer';
              scheduleRender();
              return;
            }
          }
        }
      }

      // Clear hover cut if not near a cut
      if (hoverCutTransitionRef.current) {
        hoverCutTransitionRef.current = null;
        scheduleRender();
      }
    } else {
      hoverCutTransitionRef.current = null;
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const target = e.target as HTMLElement;
    if (target.hasPointerCapture(e.pointerId)) {
      target.releasePointerCapture(e.pointerId);
    }
    if (keyframeDragRef.current) {
      keyframeDragRef.current = null;
      timelineStore.endUndoTransaction();
      renderCanvas();
      return;
    }
    const wasDragging =
      dragModeRef.current.type === 'move_clip' ||
      dragModeRef.current.type === 'trim_edge';
    dragModeRef.current = { type: 'none' };
    snapLineMsRef.current = null;
    timelineStore.setSnapLine(null);
    if (wasDragging) {
      timelineStore.endUndoTransaction();
    }
    renderCanvas();
  };

  const handlePointerLeave = () => {
    hoveredKeyframeRef.current = null;
    hoveredSubMarkerRef.current = null;
    hoveredRowIdRef.current = null;
    renderCanvas();
    if (dragModeRef.current.type === 'none') {
      hoverBladeXRef.current = null;
      renderCanvas();
    }
  };

  // ── Double-click on a clip row: add a universal keyframe ──────────────────
  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const hit = hitTest(e.clientX, e.clientY);
    if (hit?.type !== 'clip_body' || activeTool === 'blade') return;
    const scrollX = scrollLeftRef.current;
    const clipTimeMs = (hit.pointerX + scrollX) / zoomPxPerMs;
    const localTimeMs = Math.max(
      0,
      Math.min(hit.clip.durationMs, clipTimeMs - hit.clip.startMs),
    );
    const property = defaultAddKeyframePropertyForTrack(hit.track.type);
    if (!property) return;
    const values = evaluateClipKeyframeValues(hit.clip, localTimeMs);
    const value =
      (values as Record<string, number | undefined>)[property] ??
      staticValueForProperty(hit.clip, property);
    timelineStore.addClipKeyframe(hit.clip.id, property, localTimeMs, value);
    scheduleRender();
  };

  // ── Keyboard Shortcuts (V, C, Space, Del, Cmd+B, Undo/Redo, Arrows, Home/End, JKL) ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in an input
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      const isZ = e.code === 'KeyZ' || e.key?.toLowerCase() === 'z';
      const isY = e.code === 'KeyY' || e.key?.toLowerCase() === 'y';

      if ((e.metaKey || e.ctrlKey) && isZ) {
        e.preventDefault();
        if (e.shiftKey) {
          timelineStore.redo();
        } else {
          timelineStore.undo();
        }
      } else if ((e.metaKey || e.ctrlKey) && isY) {
        e.preventDefault();
        timelineStore.redo();
      } else if ((e.metaKey || e.ctrlKey) && e.code === 'KeyD') {
        e.preventDefault();
        timelineStore.duplicateSelectedClip();
      } else if (e.code === 'KeyV') {
        timelineStore.setActiveTool('select');
      } else if (e.code === 'KeyC') {
        timelineStore.setActiveTool(
          timelineStore.getState().activeTool === 'blade' ? 'select' : 'blade',
        );
      } else if (e.code === 'Space') {
        e.preventDefault();
        onTogglePlay?.();
      } else if (e.code === 'Delete' || e.code === 'Backspace') {
        e.preventDefault();
        timelineStore.deleteSelectedClip(e.shiftKey);
      } else if ((e.metaKey || e.ctrlKey) && e.code === 'KeyB') {
        e.preventDefault();
        timelineStore.splitAtPlayhead();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        const step = e.shiftKey ? 1000 : 50;
        const current = timelineStore.getState().currentTimeMs;
        const target = Math.max(0, current - step);
        timelineStore.seek(target, true);
        onSeek?.(target);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        const step = e.shiftKey ? 1000 : 50;
        const state = timelineStore.getState();
        const target = Math.min(state.durationMs, state.currentTimeMs + step);
        timelineStore.seek(target, true);
        onSeek?.(target);
      } else if (e.code === 'Home') {
        e.preventDefault();
        timelineStore.seek(0, true);
        onSeek?.(0);
      } else if (e.code === 'End') {
        e.preventDefault();
        const dur = timelineStore.getState().durationMs;
        timelineStore.seek(dur, true);
        onSeek?.(dur);
      } else if (e.code === 'KeyJ') {
        e.preventDefault();
        const current = timelineStore.getState().currentTimeMs;
        const target = Math.max(0, current - 1000);
        timelineStore.seek(target, true);
        onSeek?.(target);
      } else if (e.code === 'KeyK') {
        e.preventDefault();
        if (timelineStore.getState().isPlaying) {
          onTogglePlay?.();
        }
      } else if (e.code === 'KeyL') {
        e.preventDefault();
        if (!timelineStore.getState().isPlaying) {
          onTogglePlay?.();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onTogglePlay]);

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      onWheel={handleWheel}
      className="relative flex-1 h-full overflow-x-auto overflow-y-auto bg-[#080c14] select-none scrollbar-thin scrollbar-thumb-border/40 scrollbar-track-transparent"
    >
      {/* Hardware Accelerated Viewport Canvas */}
      <ContextMenu>
        <ContextMenuTrigger
          asChild
          onContextMenu={(e: React.MouseEvent<HTMLCanvasElement>) => {
            const hit = hitTest(e.clientX, e.clientY);
            setContextTarget(
              hit && 'track' in hit
                ? {
                    track: hit.track,
                    ...('clip' in hit && hit.clip ? { clip: hit.clip } : {}),
                  }
                : null,
            );
          }}
        >
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onPointerLeave={handlePointerLeave}
            onDoubleClick={handleDoubleClick}
            className="sticky left-0 top-0 block touch-none z-10 pointer-events-auto"
            style={{
              marginBottom: `-${viewportHeightRef.current || 300}px`,
            }}
          />
        </ContextMenuTrigger>
        <ContextMenuContent>
          {contextTarget?.track?.type === 'video' && (
            <ContextMenuItem onSelect={() => onOpenVideoCrop?.()}>
              Crop video region…
            </ContextMenuItem>
          )}
          {contextTarget?.track &&
            contextTarget.clip &&
            addons
              .filter((addon) =>
                addon.scope === 'clip' &&
                addon.canRun(contextTarget.track!, contextTarget.clip!),
              )
              .map((addon) => (
                <ContextMenuItem
                  key={addon.id}
                  onSelect={() =>
                    onRunAddon?.(addon.id, contextTarget.clip!.id)
                  }
                >
                  {addon.name}…
                </ContextMenuItem>
              ))}
        </ContextMenuContent>
      </ContextMenu>

      {/* Virtual Content Scroll Spacer */}
      <div
        style={{
          width: `${totalTimelineWidth}px`,
          height: `${totalHeight}px`,
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}
