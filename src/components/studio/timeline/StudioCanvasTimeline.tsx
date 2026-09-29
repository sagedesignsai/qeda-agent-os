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
import { convertTakeToTracks, type StudioTake } from '@/lib/studio-types';
import { toast } from 'sonner';

interface StudioCanvasTimelineProps {
  activeTake: StudioTake | null;
  videoUrl: string | null;
  currentTimeMs: number;
  durationMs: number;
  isPlaying: boolean;
  onSeek: (ms: number) => void;
  onTogglePlay: () => void;
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
}: StudioCanvasTimelineProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

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

  // Sync active take tracks to timeline store when take changes
  useEffect(() => {
    if (activeTake) {
      const tracks = convertTakeToTracks(activeTake);
      timelineStore.setTracksAndDuration(tracks, activeTake.durationMs);
    }
  }, [activeTake]);

  // Listen to store time changes and notify parent player (onSeek) when user scrubs
  useEffect(() => {
    return timelineStore.subscribeTime((timeMs) => {
      // If currentTimeMs has drifted by more than 80ms from store, notify parent player
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
      className="w-full h-full flex flex-col rounded-xl bg-card/75 backdrop-blur-md border border-border/50 shadow-2xl overflow-hidden select-none"
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
        />

        {/* 60fps Hardware-Accelerated Canvas Viewport */}
        <TimelineCanvasViewport
          videoUrl={videoUrl}
          trackHeight={TRACK_HEIGHT}
          rulerHeight={RULER_HEIGHT}
          onTogglePlay={onTogglePlay}
        />
      </div>
    </div>
  );
}
