/**
 * components/studio/timeline/StudioCanvasTimeline.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Master Hybrid Canvas Multi-Track Timeline for Studio.
 *
 * Integrates:
 *   - TimelineToolbar (Select/Blade tools, Split, Snapping, Zoom Slider, Timecode)
 *   - TimelineTrackHeaders (DOM Track titles, badges, Lock, Eye, and Mute controls)
 *   - TimelineCanvasViewport (60fps Canvas ruler, clips, waveforms, and playhead)
 *   - Continuous synchronization with StudioTake data model
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef, useCallback } from 'react';
import { timelineStore } from '@/hooks/use-timeline-store';
import { TimelineToolbar } from './TimelineToolbar';
import { TimelineTrackHeaders } from './TimelineTrackHeaders';
import { TimelineCanvasViewport } from './TimelineCanvasViewport';
import {
  compositionDurationMs,
  convertTakeToTracks,
  normalizeCuts,
  type StudioTake,
  type TimelineTrack,
} from '@/lib/studio-types';
import { toast } from 'sonner';

interface StudioCanvasTimelineProps {
  activeTake: StudioTake | null;
  videoUrl: string | null;
  durationMs: number;
  isPlaying: boolean;
  onSeek: (ms: number) => void;
  onTogglePlay: () => void;
  onRestartPlayback: () => void;
  onTracksChange?: (tracks: TimelineTrack[]) => void;
  onOpenVideoCrop?: () => void;
}

const TRACK_HEIGHT = 48;
const RULER_HEIGHT = 28;

export function StudioCanvasTimeline({
  activeTake,
  videoUrl,
  durationMs,
  isPlaying,
  onSeek,
  onTogglePlay,
  onRestartPlayback,
  onTracksChange,
  onOpenVideoCrop,
}: StudioCanvasTimelineProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewportContainerRef = useRef<HTMLDivElement | null>(null);
  // Vertical scrolling writes the header offset straight to the DOM. Driving it
  // through React state re-rendered the toolbar, headers, and canvas subtree
  // once per scroll event, which is what made vertical scrolling stutter.
  const headersContentRef = useRef<HTMLDivElement | null>(null);
  const handleHeadersScrollY = useCallback((scrollY: number) => {
    const content = headersContentRef.current;
    if (content) content.style.transform = `translateY(-${scrollY}px)`;
  }, []);

  // Take sync tracking to prevent feedback loops between timeline edits and parent state
  const currentTakeIdRef = useRef<string | null>(null);
  const lastSyncTimestampRef = useRef<number>(0);

  const handleTrackHeadersWheel = (e: React.WheelEvent) => {
    if (viewportContainerRef.current) {
      viewportContainerRef.current.scrollTop += e.deltaY;
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/x-qeda-studio-clip')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    const rawData = e.dataTransfer.getData('application/x-qeda-studio-clip');
    if (!rawData) return;
    try {
      e.preventDefault();
      const clipData = JSON.parse(rawData);
      const rect = e.currentTarget.getBoundingClientRect();
      const relativeX = Math.max(0, e.clientX - rect.left - 192); // 192 is track header width
      const zoomPxPerMs = timelineStore.getState().zoomPxPerMs;
      const dropTimeMs = Math.round(relativeX / zoomPxPerMs);

      timelineStore.addClip(clipData.trackType, {
        ...clipData,
        startMs: dropTimeMs,
      });
      toast.success(`Added ${clipData.name} to ${clipData.trackType} track`);
    } catch {
      // Ignore parse errors
    }
  };

  // Sync external playing state to store
  useEffect(() => {
    timelineStore.setPlaying(isPlaying);
  }, [isPlaying]);

  // Sync active take tracks to timeline store when activeTake changes externally or takeId changes
  useEffect(() => {
    if (!activeTake) return;
    const isNewTake = activeTake.id !== currentTakeIdRef.current;
    const isExternalUpdate =
      activeTake.updatedAt &&
      activeTake.updatedAt > lastSyncTimestampRef.current + 800;

    if (isNewTake || isExternalUpdate) {
      currentTakeIdRef.current = activeTake.id;
      lastSyncTimestampRef.current = activeTake.updatedAt || Date.now();
      const tracks = convertTakeToTracks(activeTake);
      const cuts = normalizeCuts(activeTake.cuts ?? [], activeTake.durationMs);
      timelineStore.setTracksAndDuration(
        tracks,
        compositionDurationMs(activeTake.durationMs, cuts),
        isNewTake,
      );
    }
  }, [activeTake]);

  // Subscribe to track changes from timelineStore and notify parent for domain persistence
  useEffect(() => {
    return timelineStore.subscribeTracks((tracks) => {
      lastSyncTimestampRef.current = Date.now();
      onTracksChange?.(tracks);
    });
  }, [onTracksChange]);

  // Zoom to Fit calculation
  const handleZoomToFit = useCallback(() => {
    const container = containerRef.current;
    if (!container || durationMs <= 0) return;

    const availableWidth = container.clientWidth - 192 - 40; // minus track headers and padding
    if (availableWidth > 100) {
      const targetPxPerMs = availableWidth / durationMs;
      timelineStore.setZoomPxPerMs(targetPxPerMs);
    }
  }, [durationMs]);

  return (
    <div
      ref={containerRef}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className="w-full h-full flex flex-col bg-background/95 border-t border-border/40 overflow-hidden select-none"
    >
      {/* ── Top Toolbar ────────────────────────────────────────────────────── */}
      <TimelineToolbar
        durationMs={durationMs}
        isPlaying={isPlaying}
        onTogglePlay={onTogglePlay}
        onRestartPlayback={onRestartPlayback}
        onZoomToFit={handleZoomToFit}
      />

      {/* ── Main Multi-Track Body: Left Headers + Right 60fps Canvas ───────── */}
      <div className="flex flex-1 w-full overflow-hidden bg-background/50 min-h-0">
        {/* Fixed Width DOM Track Headers (Lock, Eye, Mute) */}
        <TimelineTrackHeaders
          trackHeight={TRACK_HEIGHT}
          rulerHeight={RULER_HEIGHT}
          contentRef={headersContentRef}
          onWheel={handleTrackHeadersWheel}
        />

        {/* 60fps Hardware-Accelerated Canvas Viewport */}
        <TimelineCanvasViewport
          videoUrl={videoUrl}
          trackHeight={TRACK_HEIGHT}
          rulerHeight={RULER_HEIGHT}
          onSeek={onSeek}
          onTogglePlay={onTogglePlay}
          onScrollYChange={handleHeadersScrollY}
          containerRef={viewportContainerRef}
          onOpenVideoCrop={onOpenVideoCrop}
        />
      </div>
    </div>
  );
}
