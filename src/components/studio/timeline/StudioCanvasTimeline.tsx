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

import { useEffect, useRef, useCallback, useState } from 'react';
import { timelineStore } from '@/hooks/use-timeline-store';
import { TimelineToolbar } from './TimelineToolbar';
import { TimelineTrackHeaders } from './TimelineTrackHeaders';
import { TimelineCanvasViewport } from './TimelineCanvasViewport';
import {
  convertTakeToTracks,
  type StudioTake,
  type TimelineTrack,
} from '@/lib/studio-types';
import { toast } from 'sonner';

interface StudioCanvasTimelineProps {
  activeTake: StudioTake | null;
  videoUrl: string | null;
  currentTimeMs: number;
  durationMs: number;
  isPlaying: boolean;
  onSeek: (ms: number) => void;
  onTogglePlay: () => void;
  onTracksChange?: (tracks: TimelineTrack[]) => void;
}

const TRACK_HEIGHT = 48;
const RULER_HEIGHT = 28;

export function StudioCanvasTimeline({
  activeTake,
  videoUrl,
  currentTimeMs,
  durationMs,
  isPlaying,
  onSeek,
  onTogglePlay,
  onTracksChange,
}: StudioCanvasTimelineProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewportContainerRef = useRef<HTMLDivElement | null>(null);
  const [scrollY, setScrollY] = useState(0);

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
      timelineStore.setTracksAndDuration(
        tracks,
        activeTake.durationMs,
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

  // Listen to store time changes and notify parent player (onSeek) only when paused (user scrub/seek)
  useEffect(() => {
    return timelineStore.subscribeTime((timeMs) => {
      // Never forward playhead updates back to parent player during active playback
      // (prevents continuous decoder buffer flushing and audio/video stutter)
      if (timelineStore.getState().isPlaying) return;

      if (Math.abs(timeMs - currentTimeMs) > 80) {
        onSeek(timeMs);
      }
    });
  }, [currentTimeMs, onSeek]);

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
        onZoomToFit={handleZoomToFit}
      />

      {/* ── Main Multi-Track Body: Left Headers + Right 60fps Canvas ───────── */}
      <div className="flex flex-1 w-full overflow-hidden bg-background/50 min-h-0">
        {/* Fixed Width DOM Track Headers (Lock, Eye, Mute) */}
        <TimelineTrackHeaders
          trackHeight={TRACK_HEIGHT}
          rulerHeight={RULER_HEIGHT}
          scrollY={scrollY}
          onWheel={handleTrackHeadersWheel}
        />

        {/* 60fps Hardware-Accelerated Canvas Viewport */}
        <TimelineCanvasViewport
          videoUrl={videoUrl}
          trackHeight={TRACK_HEIGHT}
          rulerHeight={RULER_HEIGHT}
          onSeek={onSeek}
          onTogglePlay={onTogglePlay}
          onScrollYChange={setScrollY}
          containerRef={viewportContainerRef}
        />
      </div>
    </div>
  );
}
