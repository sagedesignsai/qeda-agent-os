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

import { useEffect, useRef, useCallback } from 'react';
import { timelineStore, useTimelineState } from '@/hooks/use-timeline-store';
import { useTimelineMedia } from '@/hooks/use-timeline-media';

interface TimelineCanvasViewportProps {
  videoUrl: string | null;
  trackHeight?: number;
  rulerHeight?: number;
  onSeek?: (ms: number) => void;
  onTogglePlay?: () => void;
  onScrollYChange?: (scrollY: number) => void;
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
    }
  | {
      type: 'move_clip';
      trackId: string;
      clipId: string;
      grabOffsetMs: number;
      clipDurationMs: number;
    };

export function TimelineCanvasViewport({
  videoUrl,
  trackHeight = 48,
  rulerHeight = 28,
  onSeek,
  onTogglePlay,
  onScrollYChange,
  containerRef: externalContainerRef,
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
    isPlaying,
  } = useTimelineState();

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

  // Drag interaction state
  const dragModeRef = useRef<DragMode>({ type: 'none' });

  // Calculate virtual canvas width based on duration and zoom
  const totalTimelineWidth = Math.max(
    800,
    Math.ceil(durationMs * zoomPxPerMs) + 400,
  );
  const totalHeight = rulerHeight + tracks.length * trackHeight;

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

    tracks.forEach((track, index) => {
      const trackY = rulerHeight + index * trackHeight - scrollY;
      if (trackY + trackHeight < rulerHeight || trackY > height) return;

      // Alternating lane backgrounds
      ctx.fillStyle = index % 2 === 0 ? '#0a0e17' : '#0d121e';
      ctx.fillRect(0, trackY, width, trackHeight);

      // Track bottom border
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(0, trackY + trackHeight - 0.5);
      ctx.lineTo(width, trackY + trackHeight - 0.5);
      ctx.stroke();

      // If track is locked or hidden, draw subtle overlay
      if (track.locked) {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
        ctx.fillRect(0, trackY, width, trackHeight);
      }
    });

    // 4. Clips Rendering
    tracks.forEach((track, trackIndex) => {
      if (!track.visible) return;

      const trackY = rulerHeight + trackIndex * trackHeight - scrollY;
      if (trackY + trackHeight < rulerHeight || trackY > height) return;
      const clipY = trackY + 4;
      const clipH = trackHeight - 8;

      track.clips.forEach((clip) => {
        const clipX = clip.startMs * zoomPxPerMs - scrollX;
        const clipW = clip.durationMs * zoomPxPerMs;

        // Viewport frustum culling
        if (clipX + clipW < -10 || clipX > width + 10) return;

        const isSelected = clip.id === selectedClipId;
        const radius = 5;

        // Clip container path (rounded rect)
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(clipX, clipY, clipW, clipH, radius);
        ctx.clip();

        // ── Render Specific Track Types ─────────────────────────────────────
        if (track.type === 'effects') {
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
          const scale = clip.payload?.scale ?? 1.6;
          ctx.fillText(`⚡ Zoom ${scale}x`, clipX + 8, clipY + clipH / 2);
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

          // Filmstrip frame tiles with viewport frustum culling
          const tileWidth = 64; // ~64px wide thumbnail cells
          const totalTiles = Math.ceil(clipW / tileWidth);

          // Only render tiles visible within [0, width]
          const minTileIndex = Math.max(0, Math.floor((-clipX) / tileWidth));
          const maxTileIndex = Math.min(totalTiles, Math.ceil((width - clipX) / tileWidth));

          for (let i = minTileIndex; i < maxTileIndex; i++) {
            const tileX = clipX + i * tileWidth;
            const tileTimeMs =
              clip.sourceStartMs + (i * tileWidth) / zoomPxPerMs;
            const slot = Math.floor(tileTimeMs / 1500);

            // Direct O(1) thumbnail lookup
            const bmp = thumbnails.get(slot) || thumbnails.get(Math.floor(tileTimeMs / 1500) * 1500);

            if (bmp) {
              const drawW = Math.min(tileWidth, clipX + clipW - tileX);
              ctx.drawImage(
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
              // Subtle tile divider
              ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(tileX + tileWidth - 0.5, clipY);
              ctx.lineTo(tileX + tileWidth - 0.5, clipY + clipH);
              ctx.stroke();
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
        } else if (track.type === 'audio') {
          // Track 4: Audio Waveforms (Sky blue mirrored peaks)
          ctx.fillStyle = '#0c4a6e'; // Deep ocean blue
          ctx.fillRect(clipX, clipY, clipW, clipH);

          if (audioPeaks && audioPeaks.length > 0 && durationMs > 0) {
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
                const mediaTimeMs =
                  clip.sourceStartMs + progressAlongClip * clip.durationMs;
                const peakIdx = Math.floor(
                  (mediaTimeMs / durationMs) * audioPeaks.length,
                );
                const amp = audioPeaks[peakIdx] ?? 0.1;

                const barH = Math.max(2, amp * maxAmp);
                ctx.rect(bx, centerY - barH, barWidth, barH * 2);
              }

              // Single batched draw call for all visible bars
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
          ctx.fillText('Voice / Mic', clipX + 10, clipY + 12);
        }

        ctx.restore();

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
        ctx.restore();
      });
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

    ctx.restore(); // Restore tracks area clip

    // 7. Playhead Needle & Scrubber Head (Red / Blue modern needle)
    const playheadX = currentTimeMs * zoomPxPerMs - scrollX;
    if (playheadX >= -10 && playheadX <= width + 10) {
      ctx.save();

      // Playhead vertical line
      ctx.strokeStyle = '#ef4444'; // Vibrant red
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(playheadX, rulerHeight);
      ctx.lineTo(playheadX, height);
      ctx.stroke();

      // Playhead triangular pointer head in ruler
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.moveTo(playheadX - 6, 0);
      ctx.lineTo(playheadX + 6, 0);
      ctx.lineTo(playheadX + 6, rulerHeight - 7);
      ctx.lineTo(playheadX, rulerHeight);
      ctx.lineTo(playheadX - 6, rulerHeight - 7);
      ctx.closePath();
      ctx.fill();

      // Center white dot on playhead
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(playheadX, (rulerHeight - 7) / 2, 2, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }, [
    rulerHeight,
    trackHeight,
    tracks,
    zoomPxPerMs,
    selectedClipId,
    activeTool,
    audioPeaks,
    thumbnails,
    durationMs,
  ]);

  // ── High-Frequency Playhead Synchronization & RAF Loop ────────────────────
  useEffect(() => {
    // Subscribe to playhead changes without triggering React re-renders
    const unsubscribeTime = timelineStore.subscribeTime((ms) => {
      currentTimeMsRef.current = ms;
      // If not currently playing in RAF loop, request single frame redraw
      if (!timelineStore.getState().isPlaying) {
        renderCanvas();
      }
    });

    return () => {
      unsubscribeTime();
    };
  }, [renderCanvas]);

  // 60fps RAF Loop when playing
  useEffect(() => {
    let animId: number;

    const tick = () => {
      renderCanvas();
      if (timelineStore.getState().isPlaying) {
        animId = requestAnimationFrame(tick);
      }
    };

    if (isPlaying) {
      animId = requestAnimationFrame(tick);
    } else {
      renderCanvas();
    }

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [isPlaying, renderCanvas]);

  // Redraw when thumbnails or audio peaks become available
  useEffect(() => {
    renderCanvas();
  }, [thumbnails, audioPeaks, renderCanvas]);

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

      renderCanvas();
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
  }, [totalHeight, renderCanvas, containerRef]);

  // ── Native Horizontal & Vertical Scroll Synchronization ───────────────────
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    scrollLeftRef.current = e.currentTarget.scrollLeft;
    const currentScrollY = e.currentTarget.scrollTop;
    scrollYRef.current = currentScrollY;
    timelineStore.setScrollTimeMs(scrollLeftRef.current / zoomPxPerMs);
    onScrollYChange?.(currentScrollY);
    renderCanvas();
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

      // 2. Which track is it in? (Account for vertical track scroll)
      const trackIndex = Math.floor(
        (pointerY - rulerHeight + scrollYRef.current) / trackHeight,
      );
      if (trackIndex < 0 || trackIndex >= tracks.length) {
        return { type: 'empty' as const, pointerX, pointerY };
      }

      const track = tracks[trackIndex];
      const scrollX = scrollLeftRef.current;

      // 3. Check clips inside this track
      for (const clip of track.clips) {
        const clipX = clip.startMs * zoomPxPerMs - scrollX;
        const clipW = clip.durationMs * zoomPxPerMs;

        if (pointerX >= clipX && pointerX <= clipX + clipW) {
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
    [rulerHeight, trackHeight, tracks, zoomPxPerMs],
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

    if (hit.type === 'clip_body') {
      if (activeTool === 'blade') {
        // Razor blade split
        const splitTimeMs = (hit.pointerX + scrollX) / zoomPxPerMs;
        timelineStore.splitClipAt(hit.track.id, hit.clip.id, splitTimeMs);
        return;
      }

      // Select clip & record snapshot for undo
      timelineStore.setSelectedClipId(hit.clip.id);
      timelineStore.recordSnapshot();

      // Start clip move drag
      const pointerTimeMs = (hit.pointerX + scrollX) / zoomPxPerMs;
      dragModeRef.current = {
        type: 'move_clip',
        trackId: hit.track.id,
        clipId: hit.clip.id,
        grabOffsetMs: pointerTimeMs - hit.clip.startMs,
        clipDurationMs: hit.clip.durationMs,
      };
      return;
    }

    if (hit.type === 'clip_edge') {
      if (activeTool === 'blade') return;

      timelineStore.setSelectedClipId(hit.clip.id);
      timelineStore.recordSnapshot();
      dragModeRef.current = {
        type: 'trim_edge',
        trackId: hit.track.id,
        clipId: hit.clip.id,
        edge: hit.edge,
        initialClipStartMs: hit.clip.startMs,
        initialClipDurationMs: hit.clip.durationMs,
        initialPointerX: hit.pointerX,
      };
      return;
    }

    // Clicked empty background
    timelineStore.setSelectedClipId(null);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const pointerX = e.clientX - rect.left;
    const scrollX = scrollLeftRef.current;
    const currentDrag = dragModeRef.current;

    // Update Blade guide cursor if Blade tool active
    if (activeTool === 'blade') {
      hoverBladeXRef.current = pointerX;
      canvas.style.cursor = 'crosshair';
      renderCanvas();
    } else {
      hoverBladeXRef.current = null;
    }

    // ── Active Drag State Machine ───────────────────────────────────────────
    if (currentDrag.type === 'scrub_ruler') {
      const rawTimeMs = (pointerX + scrollX) / zoomPxPerMs;
      const { snappedMs, didSnap } = findSnapTarget(rawTimeMs);
      snapLineMsRef.current = didSnap ? snappedMs : null;
      timelineStore.seek(snappedMs, false);
      onSeek?.(snappedMs);
      renderCanvas();
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

      timelineStore.moveClip(
        currentDrag.trackId,
        currentDrag.clipId,
        finalStartMs,
      );
      renderCanvas();
      return;
    }

    if (currentDrag.type === 'trim_edge') {
      const rawEdgeMs = (pointerX + scrollX) / zoomPxPerMs;
      const { snappedMs, didSnap } = findSnapTarget(rawEdgeMs);
      snapLineMsRef.current = didSnap ? snappedMs : null;

      timelineStore.trimClip(
        currentDrag.trackId,
        currentDrag.clipId,
        currentDrag.edge,
        snappedMs,
      );
      renderCanvas();
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
      } else {
        canvas.style.cursor = 'default';
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    const wasDragging =
      dragModeRef.current.type === 'move_clip' ||
      dragModeRef.current.type === 'trim_edge';
    dragModeRef.current = { type: 'none' };
    snapLineMsRef.current = null;
    timelineStore.setSnapLine(null);
    if (wasDragging) {
      timelineStore.commitTrackChange();
    }
    renderCanvas();
  };

  const handlePointerLeave = () => {
    if (dragModeRef.current.type === 'none') {
      hoverBladeXRef.current = null;
      renderCanvas();
    }
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
        timelineStore.deleteSelectedClip();
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
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        className="sticky left-0 top-0 block touch-none z-10 pointer-events-auto"
        style={{
          marginBottom: `-${viewportHeightRef.current || 300}px`,
        }}
      />

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
